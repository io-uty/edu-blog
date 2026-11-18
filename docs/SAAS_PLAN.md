# bbolog 범용 학원 콘텐츠 SaaS 전환 계획

작성일 2026-11-19 · 상태: **Phase 1 완료** (Supabase 연결·검증 완료)

---

## 1. 현재 구조 분석

| 영역 | 현재 | SaaS 전환 시 문제 |
|---|---|---|
| 실행 | Next.js 15 App Router, API 라우트 5개(generate·refine·rerender·status·images) | 인증 없음 → 누구나 API 호출 가능, API 비용 무제한 |
| 데이터 | 브라우저 localStorage(문서·설정·이력), IndexedDB(일러스트) | 서버 DB 없음 → 테넌트·사용량·결제 불가, 기기 간 공유 불가 |
| 브랜드 | `src/config/brand.ts` 의 에듀윌 강남 값이 **기본값** | 새 학원도 에듀윌 값으로 시작 |
| 프롬프트 | `src/lib/prompts.ts` 문체 규칙·사실 규칙이 **편입 전용** | 영어·수학학원 글도 편입 말투·편입 규칙으로 생성 |
| 콘텐츠 유형 | `CONTENT_TYPES` 7종이 편입 전용 | 학원 유형별로 달라져야 함 |
| 문체 샘플 | `style-samples/` 에듀윌 글 4건을 **모든 요청**에 주입 | 다른 학원 글에 에듀윌 문체가 섞임 |
| 이미지 | Claude 문구 + Canvas 카드, 일러스트는 OpenAI 키 있을 때만(미검증) | 지시서는 “AI 일러스트 자동 생성 + Vision 검증”이 필수 |
| 네이버 | 발행 준비 화면 + Chrome 확장(에디터 DOM에 붙여넣기) | 지시서 7: DOM 조작 의존 금지 |

**에듀윌·편입 하드코딩 위치** (`grep` 기준 37건)
`src/config/brand.ts`(18), `src/lib/prompts.ts`(4), `src/lib/mock.ts`(3), `src/components/ComposeView.tsx`(2),
`src/config/imageStyle.ts`, `src/app/api/images/copy/route.ts`, `src/lib/imageCopy.ts`, `src/components/{Studio,SettingsView}.tsx`,
`public/brand/eduwill-logo.png`, `style-samples/*`(4), 그리고 사용하지 않는 `src/components/DraftEditor.tsx`.

→ 처리 원칙: 삭제하지 않고 **에듀윌 값은 “데모 테넌트 시드”로 옮긴다**(`supabase/seed/eduwill_demo.sql`). 코드 기본값은 빈 값.

---

## 2. 목표 아키텍처

```
브라우저 ──(Supabase Auth 세션)──▶ Next.js API 라우트 ──▶ Supabase Postgres (RLS)
                                      │  requireTenant(): 세션 → tenant_members 로 소속 확인
                                      │  consume_usage(): 한도·중복 키 검사 후 차감
                                      ├─▶ Claude (글·이미지 기획·Vision 검증)
                                      ├─▶ 이미지 생성 API (일러스트)
                                      ├─▶ Supabase Storage (tenant_id/ 폴더, RLS)
                                      └─▶ PG(결제) — 서버 검증 후에만 구독 활성화
```

- **테넌트 확인은 서버에서만**: 모든 API는 `requireTenant(req)` 로 로그인 사용자 → `tenant_members` → tenant_id 를 구한다. 요청 본문의 tenant_id 는 무시.
- **DB 이중 방어**: 서버 코드 실수가 있어도 RLS 가 다른 학원 행을 막는다(아래 3-3 테스트).
- **기존 화면은 유지**: 저장 위치만 localStorage → API/DB 로 바꾼다. 첫 로그인 시 기존 localStorage 문서를 “내 학원으로 가져오기” 제공(자동 삭제 안 함).

### 프롬프트 분리 (지시서 3)
```
src/lib/prompt/
  common.ts        공통 생성 규칙(사실 정확성 A/B/C, 금지 패턴, JSON 형식) — 업종 무관
  verticals/       업종별 팩: 편입·영어·수학·입시·국어·과학·어학원·기타
                   (콘텐츠 유형 목록, 대상 독자 기본값, 구성 패턴, 사실 민감 항목, SEO 키워드 패턴)
  tenant.ts        학원 브랜드·문체(style_profile)·금지 표현·공식 문구
  sources.ts       검증된 참고 자료(출처·확인일 포함)만 주입
```
조립 순서: 공통 → 학원 브랜드 → 업종 팩 → 학원 문체 → 사용자 주제 → 검증된 자료. 학원 유형을 바꾸면 업종 팩이 바뀌므로 유형·구성·SEO 키워드가 함께 바뀐다.

---

## 3. 데이터베이스 마이그레이션 계획

파일: `supabase/migrations/20261119000001_saas_core.sql` (초안, 미적용)

### 3-1. 테이블 (지시서 이름 ↔ 실제 테이블)

| 지시서 | 테이블 | 비고 |
|---|---|---|
| Tenant | `tenants` | `academy_type_custom`(기타 직접 입력), `onboarding_step` 추가 |
| TenantBrand | `tenant_brands` | 로고 사용 권한 플래그, 서식 템플릿·이미지 디자인(jsonb) 추가 |
| TenantMember | `tenant_members` | role: owner/admin/editor |
| TenantContentSettings | `tenant_content_settings` | 업로드 글 분석 결과 `style_profile` 추가 |
| TenantSources | `tenant_sources` | 출처·권한·검증 상태·라이선스·확인일 |
| UsageLedger | `usage_ledger` | `(tenant_id, usage_type, idempotency_key)` 유니크 → 재시도 중복 차감 방지 |
| Subscription / Plan | `subscriptions` / `plans` | 체험 한도는 `plans.trial` 행 → 관리자 화면에서 변경 |
| ProductEvent | `product_events` | `dedupe_key` 유니크로 중복 이벤트 방지 |
| (추가) | `projects`, `project_images` | 현재 localStorage 문서·이미지를 옮길 곳 |
| (추가) | `payments` | PG 주문·검증 기록(`verified_at` 은 서버 검증 후에만) |
| (추가) | `platform_admins`, `user_consents` | 운영자 권한, 분석 동의 |

인덱스: 대시보드용 `product_events(event_type, occurred_at)`, `(tenant_id, occurred_at)`, `usage_ledger(tenant_id, usage_type, created_at)`, `projects(tenant_id, updated_at)` 등.

기존 테이블: **없음**(현재 DB 미사용). 삭제·변경되는 기존 데이터 없음.

### 3-2. 권한 매트릭스 (RLS)

| 테이블 | 같은 학원 멤버 | 다른 학원 | 운영자 | 서버(service_role) |
|---|---|---|---|---|
| tenants | 조회 / 관리자만 수정 | ✗ | 조회 | 생성 |
| 브랜드·설정·출처·콘텐츠·이미지 | 조회·생성·수정, 삭제는 관리자 | ✗ | ✗ | 전체 |
| subscriptions·usage_ledger | 조회만 | ✗ | 조회 | 쓰기 |
| payments | 학원 관리자 조회 | ✗ | 조회 | 쓰기 |
| product_events | 본인 명의 기록만 | ✗ | 조회 | 쓰기 |
| consume_usage() | 실행 불가 | ✗ | ✗ | 실행 |

### 3-3. 검증 (실행 완료)

`supabase/tests/rls_isolation.sql` — 로컬 PostgreSQL 17 + Supabase Auth 최소 스텁(`_local_auth_stub.sql`)에서 실행.

- 다른 학원 tenants/projects/brands/subscriptions 조회 0건, tenant_id 지정 조회 0건
- 다른 학원 콘텐츠 수정·브랜드 삭제 0건, tenant_id 를 바꿔 넣은 생성은 거부
- 클라이언트의 사용량 기록·구독 활성화·`consume_usage` 직접 호출 거부
- 다른 학원/다른 사용자 명의 이벤트 기록 거부, 일반 사용자 이벤트 조회 0건
- `consume_usage`: 같은 키 재시도 시 중복 차감 없음, 무료 한도(3) 초과 거부, 학원 간 사용량 분리
- **음성 대조**: `projects` RLS 를 끈 마이그레이션으로 돌리면 “다른 학원 projects 가 보임”으로 실패 → 테스트가 유출을 실제로 잡아냄

실제 Supabase 프로젝트에서는 같은 테스트를 Supabase CLI(`supabase test db`)로 다시 돌린다.

---

## 4. 단계별 구현 계획과 완료 기준

| Phase | 구현 | “완료”라고 보고하는 기준 |
|---|---|---|
| 1. 범용 SaaS 전환 | Supabase Auth 가입·로그인, 온보딩 3단계, 학원 유형, 브랜드·콘텐츠 설정 화면, 프롬프트 분리(공통+업종 팩+학원), 에듀윌 값 → 데모 시드, localStorage 가져오기 | 학원 2곳을 가입시켜 서로 다른 유형·브랜드로 글 생성, 상대 데이터가 API·DB 양쪽에서 안 보임(자동 테스트) |
| 1b. 홈페이지 분석 | 동의 체크 → robots.txt 확인 → 허용된 공개 페이지 몇 개만 수집 → Claude 로 “발견한 값만” 추출(출처 URL·확인일 저장) → 사용자가 확인 후 반영 | robots 차단 사이트는 수집 안 함, 발견 못 한 항목은 빈칸으로 남음 |
| 1c. 기존 글 업로드 | txt/md/docx 업로드 → 문체·구성 분석 → `style_profile` | 업로드한 학원 글에만 반영(다른 학원 프롬프트에 섞이지 않음) |
| 2. 이미지 자동화 | 본문 생성 시 이미지 기획(image_id·target_section·purpose·key_message·visual_description·style·aspect_ratio·negative_prompt) → 2~3문장 프롬프트 → 이미지 API 자동 호출(기본 1장, 최대 2장, 1:1) → Claude Vision 검증(글자·로고·실존 인물·가짜 시설·기획 일치) → 실패 시 재시도(최대 2회) → 통과분만 본문 삽입, 개별 재생성 | 실제 API 키로 생성·검증·삽입까지 확인. 검증 실패 이미지는 본문에 없음 |
| 2b. 브랜드 반영 | 브랜드 컬러는 포인트 색으로만, 로고는 `logo_permission=true` 일 때 코드로 합성(AI가 그리지 않음), 실제 시설 사진 없으면 일반 학습 공간 일러스트 | 권한 미확인 로고는 이미지에 들어가지 않음 |
| 3. 대학 기반 이미지 | 대학명 인식 → 공식 사이트·입학처 우선 정보 확인 → **라이선스가 명시된 이미지만** 후보(예: CC BY 계열 + 출처 표기), 권리 미확인 시 일반 캠퍼스 일러스트 | 권리 미확인 사진은 사용·변형하지 않음, 일러스트에 “실제 건물 아님” 표기 |
| 4. 네이버 연동 | 확장 없이 쓰는 내보내기 완성: 글쓰기 열기, 제목·본문·태그 복사, 이미지 일괄 다운로드(파일명=삽입 순서), 삽입 순서 안내, 패키지 zip. `BlogPublisher`·`DraftExporter`·`NaverBlogIntegration` 인터페이스 분리 | 확장 미설치 상태로 전체 흐름 동작. “발행 완료”는 사용자 확인 이벤트로만 표시 |
| 5. 운영자 분석 | 이벤트 수집 API(허용 키만 저장, 본문 저장 금지), 동의 절차, 운영자 대시보드(가입·활성 학원, 생성·이미지 수, 네이버 이동 vs 발행 확인, 체험/유료, 전환율, 유형별 이용, 단계별 이탈) | 모든 숫자가 DB 쿼리 결과. 테스트 데이터로 퍼널 값 대조 |
| 6. 과금 | 체험 한도(관리자 변경), 서버 사용량 검증, 한도 초과 시 이용권 안내, PG 테스트 모드 결제 → 서버 승인 검증 → 구독 활성화 | 테스트 결제 승인 시에만 active, 실패·위변조 금액은 반영 안 됨, 기존 콘텐츠 유지 |

---

## 5. 지시서 중 범위를 조정해야 하는 항목 (사실대로)

1. **대학 사진 “일러스트화” (지시서 6-6)**: 권리 확인 안 된 사진을 그대로 일러스트로 바꾸는 것도 2차적 저작물이 될 수 있습니다. 또 웹사이트의 “사용 권리”를 프로그램이 자동으로 확정할 수는 없습니다. → 자동 후보는 **라이선스 메타데이터가 있는 출처**(예: Wikimedia Commons)와 **학원이 권리를 확인해 올린 사진**으로 한정하고, 나머지는 일반 캠퍼스 일러스트로 만듭니다.
2. **홈페이지 이용약관 확인 (지시서 2)**: robots.txt 는 자동 확인하지만, 이용약관 해석은 자동화하지 않고 사용자 동의 체크로 받습니다.
3. **Chrome 확장 (지시서 7)**: 현재 확장은 네이버 에디터 DOM에 붙여넣기 이벤트를 넣는 방식이라 지시서 원칙(DOM 조작 금지)에 걸립니다. → 제품 흐름에서 빼고 폴더는 “지원 중단”으로 표시만 합니다(삭제하지 않음).
4. **이미지 수**: 현재는 썸네일 + 소주제마다 1장이지만, 지시서 기준(기본 1장, 최대 2장)으로 바꿉니다. 기존 Canvas 글자 카드는 “썸네일 카드” 옵션으로 남깁니다.
5. **개인정보 처리방침**: 초안 문서와 동의 화면은 만들지만, 법률 검토는 별도로 필요합니다.
6. **결제**: PG 계약·실 키가 없으므로 테스트 모드까지만 구현·검증합니다. 실결제는 계약 후 키 교체로 전환합니다.

---

## 6. 시작 전에 정해야 할 것

| 항목 | 필요한 것 | 추천 |
|---|---|---|
| DB·인증 | Supabase 프로젝트(URL, anon key, service_role key) | 새 프로젝트 1개(개발용). 키는 `.env.local` 에만 |
| 이미지 생성 API | 일러스트 생성용 API 키 | OpenAI `gpt-image-1` 또는 Google Gemini 이미지 모델 중 택1. 검증은 기존 Claude 키로 Vision 처리 |
| 결제(PG) | 국내 PG 선택 | 토스페이먼츠 테스트 모드(계약 전에도 공개 테스트 키로 개발 가능) |
| 운영자 계정 | 전체 통계를 볼 이메일 | `platform_admins` 에 등록 |
| 확장 프로그램 | 제품에서 제외 여부 | 제외(5-3) |

---

## 7. 진행 기록

### 2026-11-19 · Phase 1 (DB 없이 가능한 부분)
완료·검증:
- 프롬프트 분리: `src/lib/prompt/common.ts`(공통) · `verticals.ts`(업종 팩 8종) · `tenant.ts`(학원 브랜드·문체) → `src/lib/prompts.ts` 에서 조립
- 에듀윌 하드코딩 제거: `src/` 에 에듀윌·강남 0건. 값은 `supabase/seed/demo-eduwill-gangnam/demo.json`(문체 샘플·로고 포함)으로 이동, 온보딩 “학원 설정 파일 가져오기”로 불러옴
- 온보딩 3단계(필수: 학원 유형·학원명), 학원 정보 수정·내보내기
- 홈페이지 분석 `/api/tenant/analyze-site`: 동의 필수, robots.txt 준수, 로그인·403 페이지 미수집, 내부망 주소 차단, 근거 문장이 원문에 없는 값은 폐기, 출처·확인일 저장
- 기존 글 문체 분석 `/api/tenant/analyze-style`
- 검증: 학원 정보 없는 생성 요청 400 / 내부망·동의 없는 분석 거부 / example.com 에서 지어낸 정보 0건 / 편입학원 데모와 영어학원으로 같은 주제 생성 시 업종·학원명·태그가 서로 섞이지 않음(영어학원 결과에 “편입” 0건) / 화면에서 온보딩 → 생성까지 확인

### 2026-11-20 · Phase 1 (Supabase 연결)
완료·검증:
- Supabase 이메일 로그인(가입 시 확인 메일), 세션 미들웨어, 로그아웃
- 서버가 로그인 사용자 → tenant_members → DB 에서 학원 정보를 읽음(요청 본문의 학원 정보 무시) — `src/lib/requestCtx.ts`
- 학원 생성은 서버 함수 `create_tenant_for_user`(소유자·브랜드·콘텐츠 설정·무료 체험 구독을 한 번에)
- 학원 정보·블로그 설정·콘텐츠를 DB 에 저장(자동 저장), 로그인 전 브라우저 글 가져오기
- 마이그레이션 4개 적용(`supabase/migrations`), 새 프로젝트용 `supabase/setup_all.sql`, 적용 스크립트 `scripts/db-migrate.sh`
- 실제 Supabase 격리 테스트 `scripts/test-supabase-isolation.mjs` 14개 항목 통과(다른 학원 조회·수정·생성 차단, 사용량·구독 조작 차단, 비로그인 거부)
- 화면: 로그인 → 학원 등록 → 글 생성 → 편집 자동 저장이 DB 에 반영됨을 확인
- 발견·수정: 최근 Supabase 는 SQL 로 만든 테이블에 권한을 자동 부여하지 않음 → 테이블별 최소 권한 마이그레이션 추가

참고: 공유용 Vercel 배포(https://edu-blog-studio.vercel.app)는 Supabase 없이 로컬 모드 + 접속 비밀번호로 운영 중

### 2026-11-20 · 과금(Phase 6 일부)·이미지 다양화·디자인
- 무료 체험 2회(plans.trial, 관리자가 DB에서 변경), 서버에서만 차감·실패 시 환불, 같은 요청 재전송은 한 번만 차감
- 한도 초과 시 작성 화면 대신 이용권 안내(기존 글은 계속 이용), 베이직·프로 예시 요금제
- 결제: 테스트 모드만(실제 돈 없음). 주문 금액은 서버 요금제 기준, 승인 시 서버 검증 후 activate_subscription 으로 결제·구독·학원 상태를 한 번에 반영(중복 승인 1회만)
- 이벤트: pricing_viewed / purchase_clicked / checkout_started / payment_completed / content_generation_started·completed
- 검증: 로컬 billing.sql 테스트, 실제 Supabase 에서 2회 소진 → 서버 402 → 결제 안내 → 테스트 결제 → 베이직 활성(30편) 확인
- 이미지: 소주제마다 레이아웃·배경 톤·무늬 자동 변화, 일러스트 그림체 설정(API 연결 시 적용), 장면 다양화 지시
- 남은 일: 실제 PG(토스페이먼츠 등) 연동, 운영자 대시보드, 이미지 API 연결 후 Vision 검증
