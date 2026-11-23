import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BrandSchema, DEFAULT_SETTINGS, migrateSettings, type Settings } from "./settings";
import type { DocRecord } from "./store";
import { EMPTY_TENANT, StyleProfileSchema, displayName, TenantProfileSchema, type Source, type TenantProfile } from "./tenant";

// 앱의 TenantProfile·Settings·DocRecord 와 DB 행 사이의 변환. 모든 쿼리는 사용자 권한(RLS) 클라이언트로 실행한다.

const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const ms = (s: string | null | undefined) => (s ? new Date(s).getTime() : null);

// ---------- 설정 검증(서버로 들어오는 값) ----------

const HEX = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
export const SettingsInputSchema = z.object({
  brand: BrandSchema,
  format: z.object({
    align: z.enum(["justify", "left", "center"]),
    bodySize: z.number().int().min(8).max(60),
    headingSize: z.number().int().min(8).max(60),
    headingColor: HEX,
    headingBold: z.boolean(),
    headingPrefix: z.enum(["number", "dash", "none"]),
    listMarker: z.string().max(4),
    blankLineBetween: z.boolean(),
    imageMarkers: z.boolean(),
  }),
  image: z.object({
    layout: z.enum(["note", "card", "poster", "bold", "headline", "notice", "checklist", "summary", "scene"]),
    label: z.string().max(60),
    // 로고는 축소된 dataURL 만 허용(약 300KB 이하)
    logo: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/).nullable(),
    bg: HEX,
    primary: HEX,
    accent: HEX,
    point: HEX,
    footer: z.boolean(),
    illustrationStyle: z.enum(["photo", "render3d", "flat", "cute", "webtoon", "watercolor", "clay"]).default("photo"),
    illustrationNote: z.string().max(200).default(""),
    contact: z.string().max(60).default(""),
    rev: z.number().int().min(0).max(100).optional(),
  }),
});

// ---------- 학원 정보 ----------

export async function loadTenant(db: SupabaseClient, tenantId: string): Promise<{ tenant: TenantProfile; settings: Settings }> {
  const [t, b, c, s] = await Promise.all([
    db.from("tenants").select("*").eq("id", tenantId).single(),
    db.from("tenant_brands").select("*").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenant_content_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenant_sources").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (t.error) throw t.error;
  const tr = t.data;
  const br = b.data ?? {};
  const cr = c.data ?? {};
  const style = StyleProfileSchema.safeParse(cr.style_profile);
  const tenant: TenantProfile = TenantProfileSchema.parse({
    ...EMPTY_TENANT,
    academyType: tr.academy_type,
    academyTypeCustom: tr.academy_type_custom ?? "",
    name: tr.name,
    branch: tr.branch_name ?? "",
    homepage: br.official_website ?? "",
    description: br.academy_description ?? "",
    location: br.location ?? "",
    sns: br.sns_urls ?? [],
    features: br.features ?? [],
    instructors: Array.isArray(br.instructors) ? br.instructors.map(String) : [],
    tone: cr.writing_tone ?? "",
    targetAudience: cr.target_audience ?? "",
    courses: cr.courses ?? [],
    topics: cr.subjects ?? [],
    seoKeywords: cr.seo_keywords ?? [],
    prohibited: cr.prohibited_expressions ?? [],
    styleProfile: style.success ? style.data : null,
    styleExcerpts: cr.style_excerpts ?? [],
    sources: (s.data ?? []).map(
      (r): Source => ({
        url: r.source_url ?? "",
        type: r.source_type === "homepage" ? "homepage" : r.source_type === "blog_sample" ? "blog_sample" : "upload",
        checkedAt: ms(r.checked_at) ?? ms(r.created_at) ?? 0,
        robots: ["allowed", "disallowed", "missing", "error", "n/a"].includes(r.robots) ? r.robots : "n/a",
        consent: !!r.consent,
        fields: r.fields ?? [],
      }),
    ),
    onboardedAt: ms(tr.onboarded_at),
  });
  const brand = { ...DEFAULT_SETTINGS.brand, ...(br.brand_guidelines ?? {}) };
  // 이름이 비어 있으면 등록된 학원명을 쓴다(인사말·마무리 소제목의 {학원명} 자리)
  if (!String(brand.name ?? "").trim()) brand.name = displayName(tenant);
  const settings: Settings = migrateSettings(
    {
      brand,
      format: { ...DEFAULT_SETTINGS.format, ...(br.format_template ?? {}) },
      image: { ...DEFAULT_SETTINGS.image, ...(br.image_design ?? {}) },
    },
    (br.image_design as { rev?: number } | null)?.rev,
  );
  return { tenant, settings };
}

const check = (r: { error: unknown }) => {
  if (r.error) throw r.error;
};

export async function saveTenantProfile(db: SupabaseClient, tenantId: string, t: TenantProfile) {
  check(
    await db
      .from("tenants")
      .update({
        name: t.name,
        academy_type: t.academyType,
        academy_type_custom: t.academyTypeCustom || null,
        branch_name: t.branch || null,
        onboarded_at: iso(t.onboardedAt),
        onboarding_step: t.onboardedAt ? 4 : 1,
      })
      .eq("id", tenantId),
  );
  check(
    await db
      .from("tenant_brands")
      .update({
        academy_description: t.description || null,
        official_website: t.homepage || null,
        location: t.location || null,
        sns_urls: t.sns,
        features: t.features,
        instructors: t.instructors,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId),
  );
  check(
    await db
      .from("tenant_content_settings")
      .update({
        writing_tone: t.tone || null,
        target_audience: t.targetAudience || null,
        courses: t.courses,
        subjects: t.topics,
        seo_keywords: t.seoKeywords,
        prohibited_expressions: t.prohibited,
        style_profile: t.styleProfile ?? {},
        style_excerpts: t.styleExcerpts,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId),
  );
  // 출처는 화면의 목록과 같게 맞춘다
  check(await db.from("tenant_sources").delete().eq("tenant_id", tenantId).in("source_type", ["homepage", "blog_sample", "upload"]));
  if (t.sources.length)
    check(
      await db.from("tenant_sources").insert(
        t.sources.map((s) => ({
          tenant_id: tenantId,
          source_url: s.url,
          source_type: s.type,
          permission_status: s.type === "homepage" ? (s.consent ? "user_consented" : "unknown") : "user_consented",
          verification_status: "unverified",
          checked_at: iso(s.checkedAt),
          robots: s.robots,
          consent: s.consent,
          fields: s.fields,
        })),
      ),
    );
}

export async function saveSettings(db: SupabaseClient, tenantId: string, s: Settings) {
  check(
    await db
      .from("tenant_brands")
      .update({ brand_guidelines: s.brand, format_template: s.format, image_design: s.image, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId),
  );
}

// ---------- 콘텐츠 ----------

export const DocInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(300),
  topic: z.string().max(200),
  contentType: z.string().max(40),
  mock: z.boolean(),
  plan: z.unknown(),
  regionIndex: z.number().int().min(0).max(100).nullable().optional(),
  draft: z.unknown(),
  images: z.array(z.unknown()).max(12).optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToDoc(r: any): DocRecord {
  return {
    id: r.id,
    title: r.title ?? "",
    topic: r.topic,
    contentType: r.content_type,
    mock: !!r.is_mock,
    plan: r.plan,
    regionIndex: r.region_index ?? 0,
    draft: r.draft,
    images: r.image_items ?? [],
    status: r.status === "published_confirmed" ? "published_confirmed" : "draft",
    publishedAt: ms(r.published_confirmed_at),
    createdAt: ms(r.created_at) ?? Date.now(),
    updatedAt: ms(r.updated_at) ?? Date.now(),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function docToRow(d: z.infer<typeof DocInputSchema>, tenantId: string, userId: string) {
  return {
    ...(d.id ? { id: d.id } : {}),
    tenant_id: tenantId,
    created_by: userId,
    title: d.title,
    topic: d.topic,
    content_type: d.contentType,
    is_mock: d.mock,
    plan: d.plan ?? null,
    region_index: d.regionIndex ?? null,
    draft: d.draft ?? null,
    image_items: d.images ?? [],
    created_at: iso(d.createdAt) ?? undefined,
    updated_at: iso(d.updatedAt) ?? new Date().toISOString(),
  };
}
