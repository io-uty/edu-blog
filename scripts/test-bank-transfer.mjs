// 계좌이체 결제 흐름을 실제 Supabase + 로컬 서버로 검증한다. 임시 사용자·학원을 만들고 끝나면 모두 지운다.
// 서버를 BANK_NAME/BANK_ACCOUNT/BANK_HOLDER/DEPOSIT_WEBHOOK_SECRET 을 준 채로 띄운 뒤:
//   DEPOSIT_WEBHOOK_SECRET=... node scripts/test-bank-transfer.mjs [http://localhost:3000]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const BASE = process.argv[2] ?? "http://localhost:3000";
const SECRET = process.env.DEPOSIT_WEBHOOK_SECRET ?? "";
if (SECRET.length < 24) throw new Error("DEPOSIT_WEBHOOK_SECRET 환경변수가 필요합니다.");
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(URL_).hostname.split(".")[0];
const db = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "통과" : "실패"}  ${msg}`);
  if (!cond) failed++;
};

const stamp = Date.now();
const users = [];
const tenants = [];
const txIds = [];
const tx = (s) => {
  const id = `T${stamp}-${s}`;
  txIds.push(id);
  return id;
};

/** 로그인 세션을 @supabase/ssr 쿠키 형식으로 만든다 */
async function cookieFor(email, password) {
  const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const parts = v.match(/.{1,3000}/g);
  return parts.length === 1 ? `${name}=${parts[0]}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
}
async function mkUser(tag, tenantName) {
  const email = `bbolog-bank-${tag}-${stamp}@example.com`;
  const password = `T-${stamp}-${tag}-pw!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const u = { id: data.user.id, email, password, tenant: null, cookie: "" };
  users.push(u);
  if (tenantName) {
    const { data: tid, error: e2 } = await db.rpc("create_tenant_for_user", { p_user: u.id, p_name: tenantName, p_type: "영어학원", p_branch: "" });
    if (e2) throw e2;
    u.tenant = tid;
    tenants.push(tid);
  }
  u.cookie = await cookieFor(email, password);
  return u;
}
const api = (path, { method = "GET", user, body, headers = {} } = {}) =>
  fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(user ? { Cookie: user.cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const hook = (b, secret = SECRET) => api("/api/deposits/webhook", { method: "POST", body: b, headers: secret === null ? {} : { Authorization: `Bearer ${secret}` } });
const orderRow = async (id) => (await db.from("payments").select("*").eq("order_id", id).single()).data;

let adminEmail = null;
try {
  const A = await mkUser("a", `입금테스트A${stamp}`);
  const B = await mkUser("b", `입금테스트B${stamp}`);
  const C = await mkUser("c", `입금테스트C${stamp}`);
  const D = await mkUser("d", `입금테스트D${stamp}`);
  const ADM = await mkUser("adm", null);
  adminEmail = ADM.email;

  const { data: plan } = await db.from("plans").select("id, price").eq("is_trial", false).eq("active", true).order("price").limit(1).single();
  const price = plan.price;

  // 1) 주문 생성 / 계좌 노출 범위
  const o1 = await api("/api/checkout", { method: "POST", user: A, body: { planId: plan.id } });
  check(o1.status === 200 && o1.json.orderId, "A 가 주문을 만든다");
  const oid = o1.json.orderId;
  const row = await orderRow(oid);
  check(row.provider === "bank_transfer" && row.amount === price && row.status === "pending" && row.expires_at, "주문은 계좌이체·서버 금액·만료시각이 저장된다");
  const o1b = await api("/api/checkout", { method: "POST", user: A, body: { planId: plan.id } });
  check(o1b.json.orderId === oid, "같은 요금제는 진행 중인 주문을 이어서 쓴다");
  const g1 = await api(`/api/checkout?orderId=${oid}`, { user: A });
  check(g1.status === 200 && g1.json.bank?.account === "000-000-000000" && g1.json.depositorName === null, "소유자는 입금 계좌를 본다");
  const g2 = await api(`/api/checkout?orderId=${oid}`, { user: B });
  check(g2.status === 404 && !JSON.stringify(g2.json).includes("000-000"), "다른 학원은 주문·계좌를 볼 수 없다");
  const g3 = await api(`/api/checkout?orderId=${oid}`);
  check(g3.status === 401, "로그인 없이는 주문을 볼 수 없다");

  // 2) 입금자명
  const bad = await api("/api/checkout/depositor", { method: "POST", user: A, body: { orderId: oid, depositorName: "<b>" } });
  check(bad.status === 400, "입금자명에 특수문자는 거부");
  const short = await api("/api/checkout/depositor", { method: "POST", user: A, body: { orderId: oid, depositorName: "김" } });
  check(short.status === 400, "입금자명이 너무 짧으면 거부");
  const other = await api("/api/checkout/depositor", { method: "POST", user: B, body: { orderId: oid, depositorName: "남의주문" } });
  check(other.status === 404, "다른 학원은 내 주문의 입금자명을 바꿀 수 없다");
  const nm = `김테스${String(stamp).slice(-5)}`;
  const ok = await api("/api/checkout/depositor", { method: "POST", user: A, body: { orderId: oid, depositorName: nm } });
  check(ok.status === 200 && (await orderRow(oid)).depositor_name === nm, "입금자명 저장");
  const oC = await api("/api/checkout", { method: "POST", user: C, body: { planId: plan.id } });
  const col = await api("/api/checkout/depositor", { method: "POST", user: C, body: { orderId: oC.json.orderId, depositorName: nm } });
  check(col.status === 409, "같은 금액·같은 이름의 대기 주문이 있으면 거부(자동 확인 혼동 방지)");
  const colSp = await api("/api/checkout/depositor", { method: "POST", user: C, body: { orderId: oC.json.orderId, depositorName: nm.toLowerCase() + " " } });
  check(colSp.status === 409, "공백·대소문자만 다른 이름도 거부");
  const cName = `2${nm}`;
  const okC = await api("/api/checkout/depositor", { method: "POST", user: C, body: { orderId: oC.json.orderId, depositorName: cName } });
  check(okC.status === 200, "이름 앞에 숫자를 붙이면 허용");

  // 3) 웹훅 인증
  const body = { txId: tx("1"), amount: price, depositorName: nm };
  check((await hook(body, null)).status === 401, "웹훅: 인증 없음 → 401");
  check((await hook(body, "x".repeat(SECRET.length))).status === 401, "웹훅: 틀린 비밀값 → 401");
  check((await hook({ txId: "1", amount: -5, depositorName: "" })).status === 400, "웹훅: 잘못된 본문 → 400");
  check((await orderRow(oid)).status === "pending", "인증 실패 후에도 주문은 대기 상태");

  // 4) 매칭 규칙
  const w1 = await hook({ txId: tx("wrongamt"), amount: price + 1000, depositorName: nm });
  check(w1.json.status === "unmatched" && (await orderRow(oid)).status === "pending", "금액이 다르면 자동 처리하지 않는다");
  const w2 = await hook({ txId: tx("wrongname"), amount: price, depositorName: "엉뚱한사람" });
  check(w2.json.status === "unmatched" && (await orderRow(oid)).status === "pending", "이름이 다르면 자동 처리하지 않는다");
  const w3 = await hook({ txId: tx("exact"), amount: price, depositorName: ` ${nm} ` });
  check(w3.json.status === "matched" && w3.json.orderId === oid, "금액·이름이 맞으면 자동 매칭");
  const paid = await orderRow(oid);
  check(paid.status === "paid" && paid.confirmed_by?.startsWith("auto:") && paid.deposit_tx_id, "주문 결제 완료·확인 주체 기록");
  const { data: sub } = await db.from("subscriptions").select("status, plan_id").eq("tenant_id", A.tenant).order("created_at", { ascending: false }).limit(1).single();
  check(sub.status === "active" && sub.plan_id === plan.id, "A 학원 이용권이 활성화된다");
  const us = await api("/api/usage", { user: A });
  check(us.status === 200 && us.json.payment?.method === "bank", "사용량 API 가 계좌이체 방식을 알려준다");
  const w4 = await hook({ txId: tx("exact"), amount: price, depositorName: nm });
  check(w4.json.status === "duplicate", "같은 거래번호를 다시 보내도 중복 처리되지 않는다");
  const { count: subCount } = await db.from("subscriptions").select("id", { count: "exact", head: true }).eq("tenant_id", A.tenant).eq("status", "active");
  check(subCount === 1, "이용권이 중복으로 켜지지 않는다");
  const w5 = await hook({ txId: tx("again"), amount: price, depositorName: nm });
  check(w5.json.status === "unmatched", "이미 처리된 주문에 또 입금되어도 다시 반영하지 않는다(운영자 확인 대상)");

  // 5) 이름 잘림(앞부분 4자 이상 일치)
  const oD = await api("/api/checkout", { method: "POST", user: D, body: { planId: plan.id } });
  const longName = `박길동테스트입금${String(stamp).slice(-4)}`;
  await api("/api/checkout/depositor", { method: "POST", user: D, body: { orderId: oD.json.orderId, depositorName: longName } });
  const w6 = await hook({ txId: tx("trunc"), amount: price, depositorName: longName.slice(0, 7) });
  check(w6.json.status === "matched", "은행이 잘라 보낸 이름(앞 4자 이상 일치)도 매칭");

  // 6) 모호함: 같은 금액·같은 이름의 대기 주문 2건(DB 에 직접 넣어 재현)
  const amb = `모호${String(stamp).slice(-6)}`;
  for (const t of [B, C]) {
    await db.from("payments").update({ status: "canceled" }).eq("tenant_id", t.tenant).eq("status", "pending");
  }
  const ids = [];
  for (const t of [B, C]) {
    const id = `bb_amb${stamp}${ids.length}`;
    ids.push(id);
    const { error } = await db.from("payments").insert({ tenant_id: t.tenant, plan_id: plan.id, provider: "bank_transfer", mode: "live", order_id: id, amount: price, status: "pending", depositor_name: amb, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    if (error) throw error;
  }
  const w7 = await hook({ txId: tx("amb"), amount: price, depositorName: amb });
  check(w7.json.status === "ambiguous" && (await Promise.all(ids.map(orderRow))).every((r) => r.status === "pending"), "후보가 2건이면 자동 처리하지 않고 모호함으로 남긴다");

  // 7) 만료된 주문
  await db.from("payments").update({ expires_at: new Date(Date.now() - 3600e3).toISOString() }).eq("order_id", ids[1]);
  const exp = await api("/api/checkout/depositor", { method: "POST", user: C, body: { orderId: ids[1], depositorName: "만료확인" } });
  check(exp.status === 410, "만료된 주문은 입금자명을 바꿀 수 없다");
  const w8 = await hook({ txId: tx("exp"), amount: price, depositorName: amb });
  check(w8.json.status === "matched" && w8.json.orderId === ids[0], "만료된 주문은 후보에서 빠져 남은 1건만 매칭");

  // 8) 카드 결제 승인 경로는 계좌이체 주문에 쓸 수 없다
  const cf = await api("/api/checkout/confirm", { method: "POST", user: C, body: { orderId: ids[1], paymentKey: "x", amount: price } });
  check(cf.status >= 400 && (await orderRow(ids[1])).status === "pending", "계좌이체 주문은 카드 승인 API 로 처리되지 않는다");

  // 9) 운영자 API
  const na = await api("/api/admin/payments", { user: B });
  check(na.status === 403, "운영자가 아니면 입금 대기 목록을 못 본다");
  const nb = await api(`/api/admin/payments/${ids[1]}`, { method: "POST", user: B, body: { action: "confirm" }, headers: { Origin: BASE } });
  check(nb.status === 403 && (await orderRow(ids[1])).status === "pending", "운영자가 아니면 입금 확인을 못 한다");

  const { error: ae } = await db.from("platform_admins").insert({ user_id: ADM.id });
  if (ae) {
    console.log("건너뜀  운영자 등록 실패로 운영자 API 테스트 생략: " + ae.message);
  } else {
    const l = await api("/api/admin/payments", { user: ADM });
    const mine = (l.json.orders ?? []).filter((o) => [ids[1], oC.json.orderId].includes(o.orderId));
    check(l.status === 200 && mine.length >= 1 && (l.json.deposits ?? []).some((d) => d.status === "ambiguous"), "운영자는 대기 주문과 미처리 입금 알림을 본다");
    const noOrigin = await api(`/api/admin/payments/${ids[1]}`, { method: "POST", user: ADM, body: { action: "confirm" } });
    check(noOrigin.status === 403, "출처 헤더가 없는 변경 요청은 거부(CSRF 방지)");
    const cf2 = await api(`/api/admin/payments/${ids[1]}`, { method: "POST", user: ADM, body: { action: "confirm", txId: tx("amb") }, headers: { Origin: BASE } });
    const r2 = await orderRow(ids[1]);
    check(cf2.status === 200 && r2.status === "paid" && r2.confirmed_by === `admin:${ADM.email}`, "운영자가 수동으로 입금 확인 → 이용권 활성화");
    const { data: ev } = await db.from("deposit_events").select("status").eq("tx_id", tx("amb")).single();
    check(ev.status === "resolved", "연결한 입금 알림은 해결됨으로 표시");
    const again = await api(`/api/admin/payments/${ids[1]}`, { method: "POST", user: ADM, body: { action: "confirm" }, headers: { Origin: BASE } });
    check(again.status === 409, "이미 처리된 주문은 다시 확인할 수 없다");
    const oB = await api("/api/checkout", { method: "POST", user: B, body: { planId: plan.id } });
    const cc = await api(`/api/admin/payments/${oB.json.orderId}`, { method: "POST", user: ADM, body: { action: "cancel" }, headers: { Origin: BASE } });
    check(cc.status === 200 && (await orderRow(oB.json.orderId)).status === "canceled", "운영자가 주문을 취소");
    const late = await hook({ txId: tx("late"), amount: price, depositorName: cName });
    check(late.json.status === "unmatched", "취소된 주문에는 입금이 와도 자동 반영하지 않는다");
    const { data: au } = await db.from("admin_audit").select("action").eq("admin_email", ADM.email);
    check((au ?? []).some((x) => x.action === "confirm_deposit") && (au ?? []).some((x) => x.action === "cancel_order"), "운영자 작업이 기록에 남는다");
  }
} catch (e) {
  console.error("테스트 중 오류:", e);
  failed++;
} finally {
  // 정리: 결제·입금 기록·학원·사용자
  if (tenants.length) {
    await db.from("deposit_events").delete().in("tx_id", txIds);
    await db.from("payments").delete().in("tenant_id", tenants);
    await db.from("product_events").delete().in("tenant_id", tenants);
    for (const t of tenants) {
      const { error } = await db.from("tenants").delete().eq("id", t);
      if (error) console.error("학원 삭제 실패:", error.message);
    }
  }
  if (adminEmail) await db.from("admin_audit").delete().eq("admin_email", adminEmail);
  for (const u of users) {
    await db.from("platform_admins").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
  console.log(`정리 완료(학원 ${tenants.length}곳, 사용자 ${users.length}명 삭제)`);
}
console.log(failed ? `\n실패 ${failed}건` : "\n모든 계좌이체 테스트 통과");
process.exit(failed ? 1 : 0);
