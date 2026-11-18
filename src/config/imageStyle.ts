// 이미지 브랜드 스타일 가이드 (Phase 3 이미지 파이프라인에서 사용)
// 기준: style-samples/images/ 의 기존 블로그 썸네일 4장
//
// 핵심 원칙 — "AI는 그림만, 글자·로고·숫자는 코드로"
//  · AI 이미지 생성은 인물/배경 일러스트에만 사용하고, 이미지 안에 글자를 만들지 않게 한다.
//  · 헤드라인, 서브 문구, 하단 로고 띠, 날짜·장소 등은 SVG로 합성한다(검증된 텍스트만).
//  · 로고는 공식 파일(public/brand/eduwill-logo.*)만 사용, AI가 그리지 않는다.
//  · 설명회 날짜·장소 같은 정보는 브랜드 설정/사용자 입력에서만 가져온다.

export const IMAGE_STYLE = {
  aspectRatio: "1:1",
  size: 966, // 기존 썸네일 크기(px)
  // 에듀윌 VI 가이드(BS 07) 공식 색상
  palette: {
    yellow: "#FFBF00", // Eduwill Yellow (PANTONE 7549 C) — 메인 배경·하이라이트
    navy: "#132053", // Eduwill Navy Blue (PANTONE 534 C) — 헤드라인·외곽선
    skyBlue: "#4F97C5", // Eduwill Sky Blue — 보조
    red: "#FB342E", // Eduwill Red — 경고·강조 최소 사용
    black: "#000000",
    white: "#FFFFFF", // 서브 문구 알약, 하단 로고 띠
  },
  // 로고: public/brand/eduwill-logo.png (VI 가이드 BS 02에서 추출)
  // 금지(BS 05): 비율 변형·기울이기·외곽선/그림자 효과·색 변경·유사색 배경·복잡한 배경 위 사용
  // 허용 배경(BS 08): 흰색, 에듀윌 옐로, 검정, 단순한 사진 위 흰색 로고. 주변 여백(Clear Space) 확보
  logo: { file: "/brand/eduwill-logo.png", minWidthPx: 120 },
  layout: {
    headline: "상단 1~2줄, 매우 굵은 고딕, 네이비 글자 또는 흰 글자+네이비 외곽선, 핵심 단어는 노란 박스 강조",
    subPill: "헤드라인 아래 흰색(또는 네이비) 둥근 알약 박스에 한 줄 요약",
    footer: "하단 약 14% 흰 띠: eduwill 로고 | 에듀윌 편입 강남학원",
    accent: "인물 주변 짧은 강조선(삐침 효과)",
  },
  // AI 일러스트 생성 프롬프트 기본값 (글자 생성 금지)
  illustrationPrompt: [
    "Korean webtoon / anime-style clean illustration, soft cel shading",
    "a Korean university transfer-exam student (early 20s) wearing a navy hoodie over a white t-shirt",
    "studying at a desk: laptop, open books, notebook, highlighter, pen holder",
    "bright yellow and navy color scheme, warm daylight, uncluttered background",
    "leave the top 35% of the canvas as simple flat yellow background for headline overlay",
    "leave the bottom 14% empty for a footer band",
    "square 1:1",
  ].join(", "),
  negativePrompt: [
    "no text, no letters, no numbers, no logos, no watermarks",
    "no real university buildings or emblems",
    "no real person likeness",
    "no exam paper with readable sentences or formulas",
  ].join(", "),
  // 영어 문장·수식처럼 내용이 중요한 요소는 AI가 아니라 코드로 렌더링
  renderAsCode: ["영어 예문", "수식", "체크리스트 항목", "표", "날짜·장소", "로고"],
} as const;
