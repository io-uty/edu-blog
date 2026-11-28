import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const SUPABASE_ENABLED = !!(URL && ANON && SERVICE);

/** 로그인 사용자 권한으로 동작하는 클라이언트(RLS 적용) */
export async function supabaseUser(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* 서버 컴포넌트에서 호출되면 쿠키를 쓸 수 없다(미들웨어가 갱신) */
        }
      },
    },
  });
}

/** 서버 전용 관리자 클라이언트(RLS 우회). 테넌트 생성·사용량·결제 등 서버가 책임지는 쓰기에만 쓴다. */
export function supabaseAdmin(): SupabaseClient {
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TenantSession {
  user: User;
  tenantId: string | null;
  role: "owner" | "admin" | "editor" | null;
  db: SupabaseClient; // 사용자 권한(RLS)
}

/** 지금 보고 있는 학원(한 계정이 여러 학원을 가질 때). 값은 선택일 뿐, 소속 여부는 getSession 이 확인한다. */
export const TENANT_COOKIE = "ebs_tenant";

export async function setCurrentTenant(tenantId: string) {
  (await cookies()).set(TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/** 로그인 사용자와 선택한 학원을 서버에서 확인한다. 선택한 학원에 소속이 아니면 첫 학원을 쓴다. */
export async function getSession(): Promise<TenantSession | null> {
  if (!SUPABASE_ENABLED) return null;
  const db = await supabaseUser();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  const want = (await cookies()).get(TENANT_COOKIE)?.value;
  const { data: ms } = await db.from("tenant_members").select("tenant_id, role").eq("user_id", data.user.id).order("created_at");
  const m = ms?.find((x) => x.tenant_id === want) ?? ms?.[0];
  return { user: data.user, tenantId: m?.tenant_id ?? null, role: (m?.role as TenantSession["role"]) ?? null, db };
}

export const UNAUTHORIZED = () => Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
export const NO_TENANT_YET = () => Response.json({ error: "학원 정보를 먼저 등록해 주세요." }, { status: 403 });
