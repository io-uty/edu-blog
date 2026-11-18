// 브랜드 설정 — 공식 문구/정보의 단일 출처(Single Source of Truth).
// AI는 이 값을 생성·변경하지 않고, 렌더링 단계에서 그대로 삽입만 한다.
// 출처: 학원 제공 블로그 원문 4건(2026.11), 네이버 예약 링크, 에듀윌 VI 가이드
// Phase 5에서 DB 기반 "브랜드 설정" 화면으로 이전 예정.

export const BRAND = {
  name: "에듀윌 편입 강남학원",
  author: "독한관리 에듀윌 강남",
  greeting: "안녕하세요! 에듀윌 편입 강남학원입니다 😊",

  // 마무리 소제목(기존 글 공통)
  closingHeading: "에듀윌 편입 강남학원 상담 안내",

  // 네이버 예약 링크 — 에디터에 URL을 붙여넣으면 아래 공식 문구가 담긴 링크 카드가 자동 생성됨
  bookingUrl: "https://booking.naver.com/booking/6/bizes/826805",
  // 링크 카드에 표시되는 공식 문구(원문 그대로). 본문에서 이와 다른 혜택·할인을 쓰면 안 된다.
  officialBookingNotice:
    "에듀윌편입강남학원 학원운영등록번호:제14180호 ※ 상담 후 당일 등록 시 특별 추가 할인 ※ * 예약 상담시 [합격 굿즈 세트] 증정 노베이스부터 상위권편입에 최적화된 강의와 교수진, 학습방법 및 최적의 학습시설로 여러분을 편입 합격의 길로 안내 드립니다. 업계 최초 선택형 종합반과 강사관리 중심학원, 전 강좌 저자 직강 교재로 수업 진행! 나의 가치를 올리기 위한 필수 선택, 바로 에듀윌 편입! 에듀윌 편입 강남학원으로 오시면 미래를 바꿀 수 있습니다.",

  // 네이버 에디터 '장소' 위젯으로 넣는 정보
  place: {
    name: "에듀윌 편입 강남학원 직영",
    address: "서울특별시 강남구 테헤란로2길 27 패스트파이브빌딩 2~3층",
    phone: "02-6419-0600",
  },

  // 제목 끝 지역 표기 — 코드가 붙인다(기존 글에서 쓰인 표기만)
  titleSuffixes: ["(강남역 편입학원)", "(강남역편입학원)", "(강남편입학원)"],

  // 해시태그 = 주제 태그 3개(AI) + 고정 2개 + 지역 묶음 5개(코드가 순환 선택) = 10개
  fixedHashtags: ["강남역편입학원", "에듀윌편입강남학원"],
  regionHashtagGroups: [
    ["서초2동편입학원", "서초3동편입학원", "서초4동편입학원", "반포1동편입학원", "반포2동편입학원"],
    ["논현1동편입학원", "논현2동편입학원", "삼성1동편입학원", "삼성2동편입학원", "대치1동편입학원"],
    ["강동구편입학원", "강동편입학원", "강동역편입학원", "천호편입학원", "천호역편입학원"],
    ["가락동편입학원", "가락시장편입학원", "가락시장역편입학원", "문정편입학원", "문정동편입학원"],
  ],
} as const;

export const CONTENT_TYPES = [
  "편입영어",
  "편입수학",
  "편입 시험 및 입시 정보",
  "학습 전략",
  "대학별 전형 정보",
  "학원 소식 및 홍보",
  "자유 주제",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// 사실 근거 없이는 쓰면 안 되는 유형(입시·전형·홍보)
export const FACT_SENSITIVE_TYPES: ContentType[] = [
  "편입 시험 및 입시 정보",
  "대학별 전형 정보",
  "학원 소식 및 홍보",
];

// 유형별로 우선 참고할 문체 샘플(style-samples/ 파일명 접두사)
export const SAMPLE_PREFIX_BY_TYPE: Record<ContentType, string[]> = {
  편입영어: ["english"],
  편입수학: ["english", "university"],
  "편입 시험 및 입시 정보": ["admission", "university"],
  "학습 전략": ["english", "admission"],
  "대학별 전형 정보": ["university", "admission"],
  "학원 소식 및 홍보": ["admission"],
  "자유 주제": ["english", "admission"],
};

export const BANNED_PHRASES = [
  "알아보겠습니다",
  "알아볼게요",
  "도움이 되셨기를",
  "도움이 되셨으면",
  "지금부터 자세히",
  "살펴보겠습니다",
  "결론적으로 매우 중요",
  "합격률이 높아",
  "무조건 합격",
  "100% 합격",
  "반드시 합격",
  "합격 보장",
  "상위 노출",
];

// 기존 글 4건 실측: 1,425~2,152자(인사말·태그 제외)
export const LENGTH_TARGET = { min: 1400, max: 2300 };
export const HASHTAG_COUNT = 10;
export const TOPIC_HASHTAG_COUNT = HASHTAG_COUNT - BRAND.fixedHashtags.length - 5; // 3
export const SECTION_RANGE = { min: 3, max: 5 };
export const MAX_TABLES = 2;
