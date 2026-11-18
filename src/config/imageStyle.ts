// 이미지 공통 스타일 가이드 — 특정 학원 값 없음(학원 색·로고는 블로그 설정에서 주입).
// 원칙: "AI는 그림만, 글자·로고·숫자는 코드로"
//  · AI 이미지 생성은 인물/배경 일러스트에만 쓰고, 이미지 안에 글자를 만들지 않게 한다.
//  · 제목·로고·날짜는 Canvas로 합성한다(검증된 텍스트만). 로고는 학원이 올린 파일만, AI가 그리지 않는다.
//  · 실제 학원 시설·실존 인물·대학 건물을 실제 사진처럼 만들지 않는다.

export const IMAGE_STYLE = {
  aspectRatio: "1:1",
  negativePrompt: [
    "no text, no letters, no numbers, no logos, no watermarks",
    "no real university buildings or emblems",
    "no real person likeness",
    "no photorealistic depiction of a specific real academy interior",
    "no exam paper with readable sentences or formulas",
  ].join(", "),
  renderAsCode: ["제목·문구", "수식", "체크리스트 항목", "표", "날짜·장소", "로고"],
} as const;
