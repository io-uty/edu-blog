// 실제 Supabase 에서 학원 간 데이터 격리를 확인한다.
// 테스트 사용자 2명·학원 2곳을 만들고, 끝나면 모두 지운다. 실행: node scripts/test-supabase-isolation.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "통과" : "실패"}  ${msg}`);
  if (!cond) failed++;
};

const stamp = Date.now();
const users = [];
const tenants = [];
try {
  // 준비: 사용자·학원 2곳
  for (const tag of ["a", "b"]) {
    const email = `bbolog-isolation-${tag}-${stamp}@example.com`;
    const password = `T-${stamp}-${tag}-pw!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push({ id: data.user.id, email, password });
    const { data: tid, error: e2 } = await admin.rpc("create_tenant_for_user", { p_user: data.user.id, p_name: `격리테스트${tag}`, p_type: "영어학원" });
    if (e2) throw e2;
    tenants.push(tid);
  }
  const [A, B] = await Promise.all(
    users.map(async (u) => {
      const c = anonClient();
      const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw error;
      return c;
    }),
  );
  const [ta, tb] = tenants;

  // A 가 콘텐츠 생성
  const { data: pa, error: ea } = await A.from("projects").insert({ tenant_id: ta, topic: "A 주제", content_type: "영어 독해" }).select("id").single();
  check(!ea && pa?.id, "A 가 자기 학원 콘텐츠를 만든다" + (ea ? ` (${ea.code} ${ea.message})` : ""));
  if (!pa?.id) throw new Error("A 콘텐츠 생성 실패로 나머지 테스트를 진행할 수 없습니다.");

  // B 의 시도
  const r1 = await B.from("projects").select("id");
  check(!r1.error && r1.data.every((x) => x.id !== pa.id), "B 는 A 의 콘텐츠를 볼 수 없다");
  const r2 = await B.from("projects").select("id").eq("tenant_id", ta);
  check(!r2.error && r2.data.length === 0, "B 가 tenant_id 를 지정해도 A 콘텐츠가 0건");
  const r3 = await B.from("projects").update({ title: "변조" }).eq("id", pa.id).select("id");
  check(!r3.error && r3.data.length === 0, "B 는 A 의 콘텐츠를 수정할 수 없다");
  const r4 = await B.from("projects").insert({ tenant_id: ta, topic: "끼워넣기", content_type: "x" });
  check(!!r4.error, "B 는 A 학원으로 콘텐츠를 만들 수 없다");
  const r5 = await B.from("tenant_brands").select("tenant_id");
  check(!r5.error && r5.data.every((x) => x.tenant_id === tb), "B 는 자기 학원 브랜드만 본다");
  const r6 = await B.from("tenants").select("id");
  check(!r6.error && r6.data.length === 1 && r6.data[0].id === tb, "B 는 자기 학원만 본다");
  const r7 = await B.from("usage_ledger").insert({ tenant_id: tb, usage_type: "content", quantity: -100, idempotency_key: "x" });
  check(!!r7.error, "B 는 사용량을 직접 기록할 수 없다");
  const r8 = await B.from("subscriptions").update({ status: "active" }).eq("tenant_id", tb).select("id");
  check(!!r8.error || r8.data.length === 0, "B 는 구독을 직접 활성화할 수 없다");
  const r9 = await B.rpc("consume_usage", { p_tenant: tb, p_user: null, p_type: "content", p_qty: -5, p_project: null, p_key: "k" });
  check(!!r9.error, "B 는 사용량 차감 함수를 직접 호출할 수 없다");
  const r10 = await B.rpc("create_tenant_for_user", { p_user: users[1].id, p_name: "x", p_type: "x" });
  check(!!r10.error, "B 는 학원 생성 함수를 직접 호출할 수 없다");
  const r11 = await B.from("product_events").select("id");
  check(!r11.error && r11.data.length === 0, "일반 사용자는 이벤트를 조회할 수 없다");
  const r12 = await anonClient().from("tenants").select("id");
  // 로그인하지 않은 요청은 테이블 권한 자체가 없어 거부(42501)되거나 0건이어야 한다
  const denied = (r) => (r.error ? r.error.code === "42501" : r.data.length === 0);
  check(denied(r12), `로그인하지 않으면 학원을 볼 수 없다${r12.error ? ` (${r12.error.code})` : ""}`);
  // ── 학원 중복 등록 방지 ──
  // 같은 계정이 학원을 또 만들려 해도 기존 학원을 돌려준다(두 번째 학원이 생기지 않는다)
  const again = await admin.rpc("create_tenant_for_user", { p_user: users[0].id, p_name: "또다른학원", p_type: "영어학원", p_branch: "" });
  check(!again.error && again.data === ta, "같은 계정이 학원을 다시 만들면 기존 학원이 그대로 쓰인다");
  const { count: ownedCount } = await admin.from("tenant_members").select("id", { count: "exact", head: true }).eq("user_id", users[0].id);
  check(ownedCount === 1, "한 계정에는 학원이 하나만 있다");
  // 동시에 여러 번 보내도 하나만 생긴다
  const email3 = `bbolog-isolation-c-${stamp}@example.com`;
  const { data: u3 } = await admin.auth.admin.createUser({ email: email3, password: `T-${stamp}-c-pw!`, email_confirm: true });
  users.push({ id: u3.user.id, email: email3, password: "" });
  const burst = await Promise.all(Array.from({ length: 6 }, () => admin.rpc("create_tenant_for_user", { p_user: u3.user.id, p_name: `동시등록${stamp}`, p_type: "수학학원", p_branch: "" })));
  const ids = new Set(burst.map((b) => b.data).filter(Boolean));
  tenants.push(...ids);
  check(ids.size === 1 && burst.every((b) => !b.error), "같은 계정이 동시에 6번 등록 요청해도 학원은 1곳만 생긴다");
  // 같은 이름(공백·대소문자만 다름)을 다른 계정이 등록하면 거부
  const email4 = `bbolog-isolation-d-${stamp}@example.com`;
  const { data: u4 } = await admin.auth.admin.createUser({ email: email4, password: `T-${stamp}-d-pw!`, email_confirm: true });
  users.push({ id: u4.user.id, email: email4, password: "" });
  const dup = await admin.rpc("create_tenant_for_user", { p_user: u4.user.id, p_name: ` 동시 등록${stamp} `.toUpperCase(), p_type: "수학학원", p_branch: "" });
  check(dup.error?.code === "23505", `같은 학원명을 다른 계정이 등록하면 거부된다${dup.error ? ` (${dup.error.code})` : ""}`);
  // 같은 이름이라도 지점명이 다르면 허용
  const branch = await admin.rpc("create_tenant_for_user", { p_user: u4.user.id, p_name: `동시등록${stamp}`, p_type: "수학학원", p_branch: "강남점" });
  if (branch.data) tenants.push(branch.data);
  check(!branch.error && !!branch.data, "같은 이름이라도 지점명이 다르면 등록된다");
  // 일반 사용자가 member 행을 직접 추가해 두 번째 학원에 들어가려는 시도는 거부(권한 + 유일 제약)
  const joinTry = await A.from("tenant_members").insert({ tenant_id: tb, user_id: users[0].id, role: "owner" });
  check(!!joinTry.error, "일반 사용자는 다른 학원의 멤버가 될 수 없다");

  const r13 = await anonClient().from("projects").select("id");
  check(denied(r13), `로그인하지 않으면 콘텐츠를 볼 수 없다${r13.error ? ` (${r13.error.code})` : ""}`);
} catch (e) {
  console.error("테스트 준비 중 오류:", e.message ?? e);
  failed++;
} finally {
  // 정리: 테스트 학원·사용자 삭제
  for (const t of tenants) {
    const { error } = await admin.from("tenants").delete().eq("id", t);
    if (error) console.error("학원 삭제 실패:", error.message);
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  console.log(`정리 완료(학원 ${tenants.length}곳, 사용자 ${users.length}명 삭제)`);
}
console.log(failed ? `\n실패 ${failed}건` : "\n모든 격리 테스트 통과");
process.exit(failed ? 1 : 0);
