# bbolog — 블로그 콘텐츠 스튜디오 (MVP)

## 실행
```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력 (없으면 MOCK 모드)
npm run dev                  # http://localhost:3000
```

## 주요 기능
| 영역 | 내용 |
|---|---|
| 글 생성 | 주제 → 분석·기획·본문 3단계(Claude, 구조화 출력), 실패 단계부터 재개 |
| 편집 | 문서형 편집기, 선택 문장 다듬기(적용 전 미리보기), 표 편집, 자동 저장 |
| 이미지 | 썸네일 + 소주제별 1:1(1080px). 문구는 Claude가 본문에서만 뽑고, 글자·로고는 Canvas로 렌더링. 레이아웃 3종(헤드라인형·공지형·체크리스트형) |
| 일러스트(선택) | `OPENAI_API_KEY` 설정 시 글자 없는 일러스트를 생성해 이미지에 합성 (`IMAGE_MODEL`, 기본 gpt-image-2) |
| 블로그 설정 | 브랜드 정보, 붙여넣기 서식 템플릿(정렬·글자 크기·소제목 스타일·목록 기호), 이미지 디자인(로고·색상) |
| 발행 준비 | 서식 적용 미리보기, 복사, 이미지/전체 패키지 zip, 네이버 글쓰기 열기 |
| 자동 붙여넣기 | Chrome 확장(`extension/`) 설치 시 네이버 글쓰기 화면에 제목·본문 자동 입력. 미설치 시 본문 자동 복사 |

저장소: 문서·설정은 브라우저 localStorage, 일러스트는 IndexedDB (서버 DB 없음).
사람이 직접 검수하는 과정이 필요합니다.

## 구조
```
src/config/brand.ts        블로그 설정 기본값·금지표현
src/lib/settings.ts        블로그 설정(브랜드·서식 템플릿·이미지 디자인)
src/lib/imageRender.ts     1:1 이미지 Canvas 렌더러
src/app/api/images         이미지 문구 생성 / 일러스트 생성
extension/                 네이버 자동 붙여넣기 Chrome 확장
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
