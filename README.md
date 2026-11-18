# 에듀윌 편입 강남 AI 블로그 스튜디오 (MVP)

## 실행
```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력 (없으면 MOCK 모드)
npm run dev                  # http://localhost:3000
```

## 진행 현황
| Phase | 내용 | 상태 |
|---|---|---|
| 1 | UI, 주제 입력, Claude 연결, 본문·제목·태그 생성, 규칙 기반 품질 검사, 복사/내보내기 | ✅ (실제 API 호출은 키 설정 후 확인 필요) |
| 2 | 사실 검증 AI, 참고자료 업로드, 출처 관리 | 미구현 |
| 3 | 이미지 기획·생성·Vision 검증 (`src/config/imageStyle.ts` 가이드 준비됨) | 미구현 |
| 4 | 최종 품질 게이트, 패키지 내보내기 고도화 | 일부 |
| 5 | 생성 이력, 브랜드 설정 UI, Supabase, 배포 | 미구현 |

## 구조
```
src/config/brand.ts        브랜드·금지표현·지역키워드·공식 예약문구(단일 출처)
src/config/imageStyle.ts   썸네일 스타일 가이드 (Phase 3)
src/lib/prompts.ts         단계별 프롬프트(분석→기획→본문), 할루시네이션 규칙
src/lib/pipeline.ts        단계 실행 / src/lib/llm.ts Claude 호출+zod 검증+MOCK
src/lib/quality.ts         규칙 기반 검사 → READY / NEEDS_REVIEW / FAILED
src/lib/render.ts          네이버 붙여넣기용 텍스트·HTML
src/app/api/generate       NDJSON 스트림으로 단계별 진행 전송, 실패 단계부터 재개
style-samples/             기존 블로그 원문(.txt) + 썸네일 참고 이미지
```

## 기존 블로그에서 반영한 규칙 (원문 4건, 2026.11)
- 제목 `핵심 키워드｜구체적 해결` + 지역 표기(코드가 붙임)
- 소주제 3~5개, 마무리 소제목 "에듀윌 편입 강남학원 상담 안내"
- 해시태그 10개 = 주제 3(AI) + 고정 2 + 지역 묶음 5(코드, 4개 묶음 순환)
- 본문 끝에 네이버 예약 URL → 에디터가 공식 예약 카드로 변환. 본문에 할인·굿즈 언급 금지
- 연습 예문 "※ 연습을 위해 만든 예문입니다", 가상 사례 "※ 가상의 예시입니다"
- 로고/색상: 에듀윌 VI 가이드 (`public/brand/eduwill-logo.png`, `src/config/imageStyle.ts`)

## 원칙
- Phase 1은 사실 검증 모듈이 없으므로 **어떤 글도 READY가 되지 않음**
- 근거 없는 합격·성과 주장, 실제 사례로 표시된 예시는 FAILED
- 네이버 자동 게시 없음: 복사 → 네이버 글쓰기에서 붙여넣기 후 임시저장
