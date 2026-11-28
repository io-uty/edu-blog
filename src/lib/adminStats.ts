import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase/server";

// 운영자 대시보드 통계. 모든 값은 DB 실데이터로 계산한다(추정·샘플 없음).

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10); // 한국 시간 기준 날짜

/* eslint-disable @typescript-eslint/no-explicit-any */
async function all(db: SupabaseClient, table: string, cols: string, limit = 50_000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function allUsers(db: SupabaseClient) {
  const users: { id: string; email: string | null; created_at: string; email_confirmed_at: string | null; last_sign_in_at: string | null }[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at, email_confirmed_at: u.email_confirmed_at ?? null, last_sign_in_at: u.last_sign_in_at ?? null })));
    if (data.users.length < 1000) break;
  }
  return users;
}

export async function buildStats(days: number | null) {
  const db = supabaseAdmin();
  const now = Date.now();
  const since = days ? now - days * DAY : 0;
  const inRange = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= since;

  const [allAccounts, admins, tenants, members, projects, usage, subs, payments, events, plans, auditRows] = await Promise.all([
    allUsers(db),
    all(db, "platform_admins", "user_id"),
    all(db, "tenants", "id, name, branch_name, academy_type, academy_type_custom, created_at, onboarded_at, subscription_status"),
    all(db, "tenant_members", "tenant_id, user_id, role"),
    all(db, "projects", "id, tenant_id, title, content_type, status, created_at, updated_at, published_confirmed_at"),
    all(db, "usage_ledger", "tenant_id, usage_type, quantity, created_at"),
    all(db, "subscriptions", "tenant_id, plan_id, status, started_at, expires_at"),
    all(db, "payments", "tenant_id, plan_id, amount, status, mode, created_at, verified_at"),
    all(db, "product_events", "tenant_id, user_id, event_type, occurred_at, metadata"),
    all(db, "plans", "id, name, is_trial, content_limit, image_limit, price"),
    db.from("admin_audit").select("created_at, admin_email, action, target, detail").order("created_at", { ascending: false }).limit(30).then((r) => r.data ?? []),
  ]);
  // 운영자 본인 계정은 고객 통계에서 뺀다
  const adminIds = new Set(admins.map((a) => a.user_id));
  const users = allAccounts.filter((u) => !adminIds.has(u.id));

  const planById = new Map(plans.map((p) => [p.id, p]));
  const typeOf = (t: any) => (t.academy_type === "기타 교육기관" && t.academy_type_custom ? t.academy_type_custom : t.academy_type);

  // 이용권·사용량은 계정(학원 owner) 단위: 한 계정의 학원들이 같은 체험·생성권을 나눠 쓴다
  const ownerOf = new Map<string, string>();
  for (const m of members) if (m.role === "owner") ownerOf.set(m.tenant_id, m.user_id);
  const acct = (tid: string) => ownerOf.get(tid) ?? tid;

  // 계정별 현재 이용권(가장 최근 trial/active)
  const currentSub = new Map<string, any>();
  for (const s of [...subs].sort((a, b) => a.started_at.localeCompare(b.started_at)))
    if (s.status === "trial" || s.status === "active") currentSub.set(acct(s.tenant_id), s);

  const usedSince = (tid: string, type: string, start: string) =>
    usage.filter((u) => acct(u.tenant_id) === acct(tid) && u.usage_type === type && u.created_at >= start).reduce((a, u) => a + u.quantity, 0);

  const evBy = (type: string) => events.filter((e) => e.event_type === type);
  const tenantsWith = (type: string) => new Set(evBy(type).map((e) => e.tenant_id).filter(Boolean));

  // ---------- 학원별 표 ----------
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const paidTenants = new Set(payments.filter((p) => p.status === "paid").map((p) => p.tenant_id));

  const rows = tenants.map((t) => {
    const sub = currentSub.get(acct(t.id));
    const plan = sub ? planById.get(sub.plan_id) : null;
    const expired = sub?.expires_at && new Date(sub.expires_at).getTime() < now;
    const used = sub ? usedSince(t.id, "content", sub.started_at) : 0;
    const limit = plan?.content_limit ?? null;
    const tp = projects.filter((p) => p.tenant_id === t.id);
    const te = events.filter((e) => e.tenant_id === t.id);
    const lastTimes = [t.created_at, ...tp.map((p) => p.updated_at), ...te.map((e) => e.occurred_at)].map((x) => new Date(x).getTime());
    const paid = payments.filter((p) => p.tenant_id === t.id && p.status === "paid");
    let state: "trial" | "trial_used_up" | "paid" | "expired" | "none" = "none";
    if (plan && !expired) state = plan.is_trial ? (limit !== null && used >= limit ? "trial_used_up" : "trial") : "paid";
    else if (expired) state = "expired";
    return {
      id: t.id,
      name: [t.name, t.branch_name].filter(Boolean).join(" "),
      type: typeOf(t),
      createdAt: t.created_at,
      ownerEmail: emailOf.get(ownerOf.get(t.id) ?? "") ?? null,
      plan: plan?.name ?? "-",
      state,
      used,
      limit,
      projects: tp.length,
      projectsInRange: tp.filter((p) => inRange(p.created_at)).length,
      published: tp.filter((p) => p.status === "published_confirmed").length,
      naverOpened: te.filter((e) => e.event_type === "naver_write_opened").length,
      copied: te.filter((e) => e.event_type === "content_copied").length,
      lastActivity: new Date(Math.max(...lastTimes)).toISOString(),
      paidAmount: paid.reduce((a, p) => a + p.amount, 0),
      paidMode: paid.some((p) => p.mode === "live") ? "live" : paid.length ? "test" : null,
    };
  });

  // ---------- 핵심 지표 ----------
  const genInRange = usage.filter((u) => u.usage_type === "content" && inRange(u.created_at)).reduce((a, u) => a + u.quantity, 0);
  const imageCards = evBy("image_generation_completed").filter((e) => inRange(e.occurred_at)).reduce((a, e) => a + (Number(e.metadata?.count) || 1), 0);
  const aiImages = usage.filter((u) => u.usage_type === "image" && inRange(u.created_at)).reduce((a, u) => a + u.quantity, 0);
  const activeTenants = new Set([
    ...projects.filter((p) => inRange(p.updated_at)).map((p) => p.tenant_id),
    ...usage.filter((u) => inRange(u.created_at)).map((u) => u.tenant_id),
  ]);
  const trialing = rows.filter((r) => r.state === "trial").length;
  const trialUsedUp = rows.filter((r) => r.state === "trial_used_up").length;
  const paying = rows.filter((r) => r.state === "paid").length;
  const paidRange = payments.filter((p) => p.status === "paid" && inRange(p.verified_at ?? p.created_at));
  const checkoutStarted = evBy("checkout_started").filter((e) => inRange(e.occurred_at)).length;

  const kpis = {
    users: users.length,
    usersNew: users.filter((u) => inRange(u.created_at)).length,
    usersConfirmed: users.filter((u) => u.email_confirmed_at).length,
    tenants: tenants.length,
    tenantsNew: tenants.filter((t) => inRange(t.created_at)).length,
    activeTenants: activeTenants.size,
    generations: genInRange,
    projectsCreated: projects.filter((p) => inRange(p.created_at)).length,
    imageCards,
    aiImages,
    naverOpened: evBy("naver_write_opened").filter((e) => inRange(e.occurred_at)).length,
    publishConfirmed: evBy("publish_confirmed").filter((e) => inRange(e.occurred_at)).length,
    copied: evBy("content_copied").filter((e) => inRange(e.occurred_at)).length,
    trialing,
    trialUsedUp,
    paying,
    paidConversion: tenants.length ? paying / tenants.length : 0,
    checkoutStarted,
    paymentsCompleted: paidRange.length,
    checkoutConversion: checkoutStarted ? paidRange.length / checkoutStarted : 0,
    revenueTest: paidRange.filter((p) => p.mode === "test").reduce((a, p) => a + p.amount, 0),
    revenueLive: paidRange.filter((p) => p.mode === "live").reduce((a, p) => a + p.amount, 0),
  };

  // ---------- 일별 추이 ----------
  const spanDays = days ?? Math.max(7, Math.min(90, Math.ceil((now - Math.min(...users.map((u) => new Date(u.created_at).getTime()), now)) / DAY) + 1));
  const trend: { date: string; signups: number; generations: number; tenants: number }[] = [];
  for (let i = spanDays - 1; i >= 0; i--) trend.push({ date: dayKey(now - i * DAY), signups: 0, generations: 0, tenants: 0 });
  const idx = new Map(trend.map((t, i) => [t.date, i]));
  for (const u of users) { const i = idx.get(dayKey(new Date(u.created_at).getTime())); if (i !== undefined) trend[i].signups++; }
  for (const t of tenants) { const i = idx.get(dayKey(new Date(t.created_at).getTime())); if (i !== undefined) trend[i].tenants++; }
  for (const u of usage) if (u.usage_type === "content") { const i = idx.get(dayKey(new Date(u.created_at).getTime())); if (i !== undefined) trend[i].generations += u.quantity; }

  // ---------- 퍼널(기간 내 가입자 기준) ----------
  const cohortUsers = users.filter((u) => inRange(u.created_at));
  const cohortIds = new Set(cohortUsers.map((u) => u.id));
  // 사람 기준: 가입자 한 명이 조건을 만족하는 학원을 하나라도 가지면 그 단계를 통과한 것으로 센다
  const tenantsOfUser = new Map<string, string[]>();
  for (const m of members) if (cohortIds.has(m.user_id)) tenantsOfUser.set(m.user_id, [...(tenantsOfUser.get(m.user_id) ?? []), m.tenant_id]);
  const onboardedSet = new Set(tenants.filter((t) => t.onboarded_at).map((t) => t.id));
  const withProject = new Set(projects.map((p) => p.tenant_id));
  const usedUp = new Set(rows.filter((r) => r.state === "trial_used_up" || r.state === "paid" || paidTenants.has(r.id)).map((r) => r.id));
  const pricing = tenantsWith("pricing_viewed");
  const clicked = tenantsWith("purchase_clicked");
  const started = tenantsWith("checkout_started");
  const usersWhere = (ok: (tid: string) => boolean) =>
    cohortUsers.filter((u) => (tenantsOfUser.get(u.id) ?? []).some((tid) => onboardedSet.has(tid) && ok(tid))).length;
  const steps: [string, number][] = [
    ["가입", cohortUsers.length],
    ["이메일 확인", cohortUsers.filter((u) => u.email_confirmed_at).length],
    ["학원 등록", usersWhere(() => true)],
    ["첫 글 생성", usersWhere((id) => withProject.has(id))],
    ["무료 체험 소진", usersWhere((id) => usedUp.has(id))],
    ["요금 안내 확인", usersWhere((id) => pricing.has(id))],
    ["구매 클릭", usersWhere((id) => clicked.has(id))],
    ["결제 시작", usersWhere((id) => started.has(id))],
    ["결제 완료", usersWhere((id) => paidTenants.has(id))],
  ];
  const funnel = steps.map(([label, count], i) => ({
    label,
    count,
    ofTop: steps[0][1] ? count / steps[0][1] : 0,
    fromPrev: i === 0 ? 1 : steps[i - 1][1] ? count / steps[i - 1][1] : 0,
  }));

  // ---------- 학원 유형별 ----------
  const byTypeMap = new Map<string, { type: string; tenants: number; generations: number; projects: number; paying: number }>();
  for (const r of rows) {
    const x = byTypeMap.get(r.type) ?? { type: r.type, tenants: 0, generations: 0, projects: 0, paying: 0 };
    x.tenants++;
    x.projects += r.projectsInRange;
    x.paying += r.state === "paid" ? 1 : 0;
    x.generations += usage.filter((u) => u.tenant_id === r.id && u.usage_type === "content" && inRange(u.created_at)).reduce((a, u) => a + u.quantity, 0);
    byTypeMap.set(r.type, x);
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.generations - a.generations || b.tenants - a.tenants);

  // ---------- 최근 활동 ----------
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  const recent = [...events]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 40)
    .map((e) => ({ at: e.occurred_at, type: e.event_type, tenant: e.tenant_id ? nameOf.get(e.tenant_id) ?? "(삭제된 학원)" : "-", meta: e.metadata ?? {} }));

  return {
    generatedAt: new Date(now).toISOString(),
    days,
    kpis,
    trend,
    funnel,
    byType,
    tenants: rows.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity)),
    recent,
    totals: { accounts: allAccounts.length, customers: users.length, admins: adminIds.size, tenants: tenants.length, projects: projects.length, events: events.length, payments: payments.length, usage: usage.length },
    audit: auditRows,
  };
}

export async function tenantDetail(tenantId: string) {
  const db = supabaseAdmin();
  const [t, brand, content, projects, usage, subs, payments, events, members] = await Promise.all([
    db.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    db.from("tenant_brands").select("primary_color, location, official_website, blog_url, main_subjects, brand_guidelines").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenant_content_settings").select("writing_tone, target_audience, subjects, seo_keywords, style_profile").eq("tenant_id", tenantId).maybeSingle(),
    db.from("projects").select("id, title, content_type, status, created_at, updated_at, published_confirmed_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50),
    db.from("usage_ledger").select("usage_type, quantity, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    db.from("subscriptions").select("plan_id, status, started_at, expires_at").eq("tenant_id", tenantId).order("started_at", { ascending: false }),
    db.from("payments").select("plan_id, amount, status, mode, order_id, created_at, verified_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    db.from("product_events").select("event_type, occurred_at, metadata").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(100),
    db.from("tenant_members").select("user_id, role, created_at").eq("tenant_id", tenantId),
  ]);
  if (!t.data) return null;
  const users = await allUsers(db);
  const emailOf = new Map(users.map((u) => [u.id, u]));
  return {
    tenant: t.data,
    brand: brand.data,
    content: content.data ? { ...content.data, hasStyleProfile: !!content.data.style_profile && Object.keys(content.data.style_profile).length > 0, style_profile: undefined } : null,
    members: (members.data ?? []).map((m) => ({ role: m.role, email: emailOf.get(m.user_id)?.email ?? null, lastSignIn: emailOf.get(m.user_id)?.last_sign_in_at ?? null })),
    projects: projects.data ?? [],
    usage: usage.data ?? [],
    subscriptions: subs.data ?? [],
    payments: payments.data ?? [],
    events: events.data ?? [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
