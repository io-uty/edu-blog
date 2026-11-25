# 뚝딱 DB 명세서

Supabase(PostgreSQL) `public` 스키마 기준이고, 운영 DB와 `supabase/migrations/` 내용이 같습니다.
DBeaver로 접속해 직접 값을 고칠 때 이 문서를 보면 됩니다.

> **직접 수정할 때 지킬 것**
> - `id`, `*_id`, `created_at`은 고치지 않습니다. 행을 새로 넣을 때는 비워 두면 기본값이 들어갑니다.
> - `usage_ledger`, `payments`, `admin_audit`는 기록용입니다. 지우거나 고치지 말고, 바로잡을 일이 있으면 행을 새로 넣습니다.
> - 학원(`tenants`) 행을 지우면 그 학원의 글·이미지·구독·결제·사용 기록이 모두 같이 지워집니다(cascade).
> - 회원 계정 자체(로그인 정보)는 `auth.users`에 있습니다. 지우거나 비밀번호를 바꿀 때는 DB가 아니라 Supabase 대시보드 → Authentication에서 합니다.

---

## 1. 전체 구조

```
auth.users (Supabase 로그인 계정)
 ├─ profiles            회원 정보(이름·전화·아이디)          1:1
 ├─ platform_admins     운영자(관리자 화면 접근)              1:1
 ├─ user_consents       분석 수집 동의                        1:1
 └─ tenant_members ──── tenants (학원)                        회원 1명당 학원 1개
                          ├─ tenant_brands            학원 소개·브랜드          1:1
                          ├─ tenant_content_settings  말투·키워드·문체          1:1
                          ├─ tenant_sources           홈페이지 등 출처 기록     1:N
                          ├─ projects                 작성한 글                 1:N
                          │    └─ project_images      글의 이미지               1:N
                          ├─ subscriptions            이용권(체험·생성권·무제한) 1:N
                          ├─ payments                 결제·입금 주문            1:N
                          ├─ usage_ledger             글·이미지 사용 기록       1:N
                          └─ product_events           사용 이벤트 로그          1:N
plans               요금제 목록
deposit_events      계좌 입금 알림
phone_verifications 휴대폰 인증번호
admin_audit         관리자 작업 기록
```

---

## 2. 자주 하는 작업 (복사해서 쓰는 SQL)

`'이메일'` 부분만 바꿔서 실행합니다.

### 관리자 권한 주기 / 빼기
```sql
insert into platform_admins (user_id)
select id from auth.users where email = '이메일'
on conflict do nothing;

delete from platform_admins
where user_id = (select id from auth.users where email = '이메일');
```

### 글 작성 무제한으로 바꾸기 / 되돌리기
```sql
insert into subscriptions (tenant_id, plan_id, status)
select m.tenant_id, 'unlimited', 'active'
from tenant_members m join auth.users u on u.id = m.user_id
where u.email = '이메일';

-- 되돌리기: 무제한 이용권만 취소(남은 체험·생성권은 그대로)
update subscriptions set status = 'canceled'
where plan_id = 'unlimited'
  and tenant_id = (select m.tenant_id from tenant_members m join auth.users u on u.id = m.user_id where u.email = '이메일');
```

### 생성권 직접 지급 (예: 10개 묶음, 1년)
```sql
insert into subscriptions (tenant_id, plan_id, status, expires_at)
select m.tenant_id, 'pack10', 'active', now() + interval '365 days'
from tenant_members m join auth.users u on u.id = m.user_id
where u.email = '이메일';
```

### 회원별 남은 상태 한눈에 보기
```sql
select u.email, p.name as 이름, p.phone, t.name as 학원, t.branch_name as 지점,
       string_agg(s.plan_id || ':' || s.status, ', ') as 이용권,
       (select coalesce(sum(quantity),0) from usage_ledger l where l.tenant_id = t.id and l.usage_type = 'content') as 쓴_글
from auth.users u
left join profiles p on p.user_id = u.id
left join tenant_members m on m.user_id = u.id
left join tenants t on t.id = m.tenant_id
left join subscriptions s on s.tenant_id = t.id and s.status in ('trial','active')
group by u.email, p.name, p.phone, t.id, t.name, t.branch_name
order by u.email;
```

### 요금제 가격·개수 바꾸기
```sql
update plans set price = 9900, content_limit = 10, image_limit = 30 where id = 'pack10';
```
이미 산 이용권도 바뀐 개수로 계산됩니다(이용권은 `plan_id`만 가리킴).

### 입금 확인이 안 된 주문을 손으로 승인
관리자 화면 → 결제에서 처리하는 것이 안전합니다. DB에서 해야 한다면 아래 함수를 씁니다(결제 상태와 이용권이 함께 처리됨).
```sql
select activate_subscription('주문번호(order_id)', null, '{}'::jsonb);
```

---

## 3. 테이블 상세

표기: **PK** 기본키, **FK** 다른 테이블 참조, **U** 중복 불가, 기본값은 `=` 뒤에 적습니다.

### 3-1. 회원·권한

#### `profiles` — 회원 정보
| 컬럼 | 타입 | 설명 |
|---|---|---|
| user_id | uuid PK, FK→auth.users | 로그인 계정 |
| name | text | 이름 |
| phone | text U | 숫자만 저장(`01012345678`). 하이픈 넣지 않음 |
| email | text | 이메일 |
| login_id | text U | 로그인 아이디, 소문자로 저장 |
| created_at | timestamptz | 가입 시각 |

#### `platform_admins` — 운영자
| 컬럼 | 타입 | 설명 |
|---|---|---|
| user_id | uuid PK, FK→auth.users | 여기 있으면 `/admin` 화면 접근 가능(이메일 인증 완료 계정만) |
| created_at | timestamptz | |

#### `user_consents` — 분석 수집 동의
| 컬럼 | 타입 | 설명 |
|---|---|---|
| user_id | uuid PK | |
| analytics | boolean =false | 분석 동의 여부 |
| policy_version | text | 동의한 약관 버전 |
| agreed_at | timestamptz | |

#### `phone_verifications` — 휴대폰 인증번호
| 컬럼 | 타입 | 설명 |
|---|---|---|
| phone | text PK | 숫자만 |
| code_hash | text | 인증번호 해시(원문 저장 안 함) |
| expires_at | timestamptz | 만료 시각 |
| sent_at | timestamptz | 발송 시각 |
| attempts | int =0 | 틀린 횟수. 5회면 막힘 → 행을 지우면 다시 받을 수 있음 |
| verified_at | timestamptz | 인증 완료 시각 |

### 3-2. 학원

#### `tenants` — 학원
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| name | text | 학원명(1~80자) |
| academy_type | text | 편입학원·영어학원·수학학원·입시학원·국어학원·과학학원·어학원·기타 교육기관 |
| academy_type_custom | text | 기타일 때 직접 입력한 종류 |
| branch_name | text | 지점명 |
| name_key | text U (자동) | 학원명+지점 중복 방지용. 직접 수정 불가 |
| onboarding_step | smallint =1 | 학원 정보 입력 단계 |
| onboarded_at | timestamptz | 학원 정보 입력 완료 시각. null이면 첫 로그인 때 입력 화면이 뜸 |
| subscription_status | text ='trial' | trial / active / past_due / canceled / expired (표시용) |
| created_at | timestamptz | |

#### `tenant_members` — 회원↔학원 연결
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK→tenants | |
| user_id | uuid FK→auth.users, U | 회원 1명은 학원 1곳에만 속함 |
| role | text ='editor' | owner / admin / editor |
| created_at | timestamptz | |

#### `tenant_brands` — 학원 소개·브랜드 (학원당 1행)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tenant_id | uuid FK, U | |
| academy_description | text | 학원 소개 |
| official_website | text | 홈페이지 |
| blog_url | text | 블로그 주소 |
| location | text | 위치 |
| sns_urls | text[] | SNS 주소 목록 |
| features | text[] | 학원 특징 |
| instructors | jsonb ='[]' | 강사 목록 |
| representative_instructor | text | 대표 강사 |
| main_subjects | text[] | 주요 과목 |
| logo_url, logo_permission, primary_color | | 로고 경로·사용 동의·대표색(`#rrggbb`) |
| brand_guidelines, format_template, image_design | jsonb | 인사말·서식·이미지 디자인 설정 |
| updated_at | timestamptz | |

#### `tenant_content_settings` — 글쓰기 설정 (학원당 1행)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tenant_id | uuid FK, U | |
| writing_tone | text | 말투 |
| target_audience | text | 주요 독자 |
| courses | text[] | 강좌 |
| subjects | text[] | 자주 쓰는 글 주제 |
| seo_keywords | text[] | 검색 키워드(지역 등) |
| official_promo_phrases | text[] | 공식 홍보 문구 |
| prohibited_expressions | text[] | 쓰면 안 되는 표현 |
| style_profile | jsonb | 기존 블로그 글에서 분석한 문체 |
| style_excerpts | text[] | 문체 참고용 원문 발췌(최대 2개) |
| updated_at | timestamptz | |

#### `tenant_sources` — 정보 출처 기록
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tenant_id | uuid FK | |
| source_url | text | 가져온 주소 |
| source_type | text | homepage / sns / blog_sample / upload / university_official / image_asset |
| permission_status | text ='unknown' | 수집 허락 상태 |
| verification_status | text ='unverified' | 검증 상태 |
| robots | text | robots.txt 확인 결과 |
| consent | boolean | 사용자 동의 여부 |
| fields | text[] | 이 출처에서 반영한 항목 |
| extracted | jsonb | 추출 결과 |
| checked_at, created_at | timestamptz | |

### 3-3. 글·이미지

#### `projects` — 작성한 글
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | |
| created_by | uuid FK→auth.users | 작성자 |
| topic | text | 입력한 주제 |
| content_type | text | 글 종류 |
| title | text | 제목 |
| draft | jsonb | 글 본문 전체(소제목·문단·이미지 위치) |
| plan | jsonb | 분석·구성 결과 |
| image_items | jsonb ='[]' | 이미지 목록 |
| region_index | smallint | 지역 키워드 순번 |
| status | text ='draft' | draft(작성 중) / ready(완성) / published_confirmed(발행 확인) |
| published_confirmed_at | timestamptz | 사용자가 발행 완료를 누른 시각 |
| is_mock | boolean =false | 테스트용 가짜 글 |
| created_at, updated_at | timestamptz | |

#### `project_images` — 글의 이미지
| 컬럼 | 타입 | 설명 |
|---|---|---|
| project_id | uuid FK→projects | |
| target_section | smallint | 들어갈 소제목 번호, null이면 썸네일 |
| prompt | text | 이미지 생성에 쓴 문장 |
| storage_path | text | 저장 위치 |
| status | text ='planned' | planned / generating / verifying / ready / rejected / failed |
| attempts | smallint | 생성 시도 횟수 |
| 그 외 | | image_purpose, key_message, visual_description, style, aspect_ratio, negative_prompt, verification, source_id, is_real_photo_based |

### 3-4. 요금·결제·사용량

#### `plans` — 요금제
| id | 이름 | 가격(원) | 글 | 이미지 | 기간(일) | 판매 중 |
|---|---|---|---|---|---|---|
| trial | 무료 체험 | 0 | 2 | 6 | 없음 | ○ (가입 시 자동) |
| pack5 | 생성권 5개 | 4,900 | 5 | 15 | 365 | ○ |
| pack10 | 생성권 10개 | 8,900 | 10 | 30 | 365 | ○ |
| pack30 | 생성권 30개 | 19,900 | 30 | 90 | 365 | ○ |
| unlimited | 무제한(운영) | 0 | 무제한 | 무제한 | 없음 | ✕ (운영자가 직접 지급) |
| basic / pro | 예전 월 요금제 | | | | | ✕ |

컬럼: `id`(text PK), `name`, `price`, `content_limit`·`image_limit`(**null = 무제한**), `period_days`, `features`(jsonb, `summary`가 결제 화면 설명), `is_trial`, `active`(false면 결제 화면에 안 보임).

#### `subscriptions` — 학원이 가진 이용권
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tenant_id | uuid FK | |
| plan_id | text FK→plans | |
| status | text | trial / active / past_due / canceled / expired |
| started_at | timestamptz | 시작 시각 |
| expires_at | timestamptz | 만료 시각, null이면 만료 없음 |

**남은 개수 계산법:** 상태가 trial·active이고 만료 전인 이용권의 한도를 모두 더하고(하나라도 null이면 무제한), 그중 가장 이른 `started_at` 이후의 `usage_ledger` 합계를 뺍니다.

#### `payments` — 결제·입금 주문
| 컬럼 | 타입 | 설명 |
|---|---|---|
| order_id | text U | 주문번호 |
| tenant_id, plan_id | FK | 누가 무엇을 샀는지 |
| provider | text | 결제 수단(toss, bank 등) |
| mode | text | test / live |
| amount | integer | 금액(원) |
| status | text | pending(입금 대기) / paid / failed / canceled |
| depositor_name | text | 입금자명 |
| expires_at | timestamptz | 입금 기한 |
| confirmed_by | text | `auto:거래번호` 또는 `admin:이메일` |
| deposit_tx_id | text U | 연결된 입금 거래번호 |
| payment_key, verified_at, raw | | 결제사 응답 기록 |

#### `deposit_events` — 계좌 입금 알림
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tx_id | text U | 입금 거래번호 |
| amount | integer | 금액 |
| depositor_name | text | 입금자명 |
| occurred_at | timestamptz | 입금 시각 |
| status | text | matched(자동 연결) / unmatched(맞는 주문 없음) / ambiguous(후보 여러 개) / resolved(수동 처리) |
| order_id | text | 연결된 주문 |
| source | text ='webhook' | |

#### `usage_ledger` — 사용 기록 (수정 금지)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| tenant_id | uuid FK | |
| user_id | uuid | 사용한 회원 |
| usage_type | text | content(글) / image(이미지) |
| quantity | integer | +1 사용, -1 환불(생성 실패 시 자동) |
| project_id | uuid | 해당 글 |
| idempotency_key | text | 같은 요청 중복 차감 방지 키 |

1개를 돌려주고 싶으면 `quantity = -1` 행을 새로 넣습니다.
```sql
insert into usage_ledger (tenant_id, usage_type, quantity, idempotency_key)
values ('학원 id', 'content', -1, 'manual:' || gen_random_uuid());
```

### 3-5. 로그

#### `product_events` — 사용 이벤트
가입·학원 정보 입력·글 생성·복사·다운로드·결제 등 이벤트를 남깁니다. 본문이나 개인정보는 저장하지 않습니다. 관리자 화면 통계가 이 테이블을 읽습니다.
컬럼: `tenant_id`, `user_id`, `event_type`, `session_id`, `project_id`, `metadata`(jsonb), `dedupe_key`, `occurred_at`.

#### `rate_limits` — 호출 횟수 제한
로그인·가입·인증번호·문장 다듬기 등의 호출 횟수를 셉니다. 컬럼: `key`(예: `login:id:아이디`, `refine:회원id`), `window_start`, `hits`.
누군가 제한에 걸려 바로 풀어 줘야 하면 해당 `key` 행을 지우면 됩니다.

#### `admin_audit` — 관리자 작업 기록
관리자 화면에서 결제 승인·학원 삭제·초기화를 하면 자동으로 남습니다.
컬럼: `admin_email`, `action`, `target`, `detail`(jsonb), `created_at`.

---

## 4. DB 함수

| 함수 | 하는 일 |
|---|---|
| `consume_usage(학원, 회원, 종류, 수량, 글, 키)` | 한도를 확인하고 사용량 1개를 차감합니다. 글·이미지를 만들 때 서버가 호출합니다 |
| `activate_subscription(주문번호, 결제키, 원본)` | 주문을 결제 완료로 바꾸고 이용권을 지급합니다. 같은 주문을 두 번 불러도 한 번만 반영됩니다 |
| `create_tenant_for_user(회원, 학원명, 종류, 지점)` | 가입할 때 학원·브랜드·설정·체험 이용권을 한 번에 만듭니다 |
| `verify_phone(전화, 해시)` | 인증번호를 확인합니다(5회 제한) |
| `is_member` / `is_tenant_admin` / `is_platform_admin` | 접근 권한 검사용 |

---

## 5. 접근 권한(RLS)

모든 테이블에 행 단위 보안이 켜져 있습니다. 회원은 자기 학원 데이터만 읽고 씁니다. `profiles`, `phone_verifications`, `deposit_events`, `admin_audit`는 서버(service_role)만 접근합니다.
DBeaver에서 **service_role 키나 postgres 계정으로 접속하면 이 제한 없이 전부 보이고 고칠 수 있으므로** 위 주의 사항을 지켜 주세요.

---

## 6. 스키마를 바꿀 때

컬럼이나 테이블을 추가할 때는 DBeaver에서 바로 바꾸지 말고 `supabase/migrations/`에 `날짜_이름.sql` 파일을 추가한 뒤 실행합니다. 그래야 코드와 DB 구조가 어긋나지 않습니다.
