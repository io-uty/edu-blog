// 학원(테넌트) 정보 — 온보딩에서 입력하고, 모든 AI 생성 요청에 함께 쓰인다. 클라이언트·서버 공용.
// 지금은 브라우저에 저장하고(LocalTenantRepository), Supabase 연결 후 서버가 DB에서 직접 읽는다.
import { z } from "zod";

export const ACADEMY_TYPES = [
  "영어학원",
  "수학학원",
  "입시학원",
  "국어학원",
  "과학학원",
  "어학원",
  "편입학원",
  "기타 교육기관",
] as const;

/** 가르치는 학년(복수 선택) */
export const GRADE_LEVELS = ["유아", "초등", "중등", "고등", "성인·대학"] as const;
export type AcademyType = (typeof ACADEMY_TYPES)[number];

const str = (n: number) => z.string().trim().max(n);
const list = (n: number, each = 80) => z.array(z.string().trim().min(1).max(each)).max(n);

/** 업로드한 기존 블로그 글에서 분석한 문체·구성 */
export const StyleProfileSchema = z.object({
  tone: str(200), // 전체 말투
  sentenceEndings: list(6, 40), // 자주 쓰는 종결 표현
  introPattern: str(200),
  headingStyle: str(200),
  structure: str(300), // 소주제 수·표·목록 등 구성 습관
  closingPattern: str(200),
  formatting: str(200), // 강조·이모지·줄바꿈 습관
  avoid: list(6, 80), // 샘플에서 보이지 않거나 피하는 것
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

/** 홈페이지 등에서 가져온 정보의 출처 기록 */
export const SourceSchema = z.object({
  url: str(500),
  type: z.enum(["homepage", "blog_sample", "upload"]),
  checkedAt: z.number(),
  robots: z.enum(["allowed", "disallowed", "missing", "error", "n/a"]),
  consent: z.boolean(),
  fields: list(20, 40), // 이 출처에서 반영한 항목 이름
});
export type Source = z.infer<typeof SourceSchema>;

export const TenantProfileSchema = z.object({
  academyType: z.enum(ACADEMY_TYPES),
  academyTypeCustom: str(40),
  grades: z.array(z.enum(GRADE_LEVELS)).max(GRADE_LEVELS.length).default([]),
  name: str(60).min(1),
  branch: str(40),
  homepage: str(300),
  description: str(600),
  location: str(200),
  sns: list(6, 300), // 블로그·SNS 주소
  features: list(10, 120),
  instructors: list(10, 120),
  tone: str(200),
  targetAudience: str(200),
  courses: list(15, 60),
  topics: list(15, 60),
  seoKeywords: list(20, 40),
  prohibited: list(30, 60),
  styleProfile: StyleProfileSchema.nullable(),
  styleExcerpts: z.array(z.string().max(2500)).max(2),
  sources: z.array(SourceSchema).max(20),
  onboardedAt: z.number().nullable(),
});
export type TenantProfile = z.infer<typeof TenantProfileSchema>;

export const EMPTY_TENANT: TenantProfile = {
  academyType: "기타 교육기관",
  academyTypeCustom: "",
  grades: [],
  name: "",
  branch: "",
  homepage: "",
  description: "",
  location: "",
  sns: [],
  features: [],
  instructors: [],
  tone: "",
  targetAudience: "",
  courses: [],
  topics: [],
  seoKeywords: [],
  prohibited: [],
  styleProfile: null,
  styleExcerpts: [],
  sources: [],
  onboardedAt: null,
};

export const displayName = (t: Pick<TenantProfile, "name" | "branch">) => [t.name, t.branch].filter(Boolean).join(" ");

/** 서버 요청 본문의 학원 정보를 검증한다. 없거나 잘못되면 null(→ 400). */
export function parseTenant(v: unknown): TenantProfile | null {
  const r = TenantProfileSchema.safeParse(v);
  return r.success ? r.data : null;
}

// ---------- 저장소 (Supabase 연결 전까지 브라우저 저장) ----------

export interface TenantRepository {
  load(): TenantProfile | null;
  save(t: TenantProfile): boolean;
}

const KEY = "ebs:tenant:v1";

export const localTenantRepository: TenantRepository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const r = TenantProfileSchema.safeParse({ ...EMPTY_TENANT, ...JSON.parse(raw) });
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  },
  save(t) {
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
      return true;
    } catch {
      return false;
    }
  },
};
