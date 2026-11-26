// 블로그 설정 — 브랜드 정보, 붙여넣기 서식 템플릿, 이미지 디자인.
// 클라이언트(localStorage)에 저장하고, AI 요청 시 brand 부분을 서버로 함께 보낸다.
// 기본값은 비어 있다(특정 학원 값 없음). 온보딩에서 학원 정보로 채운다.
import { z } from "zod";

export const BrandSchema = z.object({
  name: z.string().max(60),
  author: z.string().max(60),
  greeting: z.string().max(200),
  closingHeading: z.string().max(80),
  bookingUrl: z.string().max(300),
  placePhone: z.string().max(40),
  placeUrl: z.string().max(300).default(""), // 네이버 플레이스(지도) 링크
  titleSuffixes: z.array(z.string().max(40)).max(10),
  fixedHashtags: z.array(z.string().max(40)).max(10),
  regionHashtagGroups: z.array(z.array(z.string().max(40)).max(10)).max(10),
});
export type Brand = z.infer<typeof BrandSchema>;

/** 인사말·마무리 소제목에 넣으면 그때그때 학원 이름으로 바뀌는 자리 */
export const NAME_TOKEN = "{학원명}";
export const AUTO_GREETING = `안녕하세요! ${NAME_TOKEN}입니다 😊`;
export const AUTO_CLOSING = `${NAME_TOKEN} 상담 안내`;

/** {학원명} 자리를 현재 학원 이름으로 채운 브랜드 값(출력·미리보기용) */
export function resolveBrand(b: Brand, fallbackName = ""): Brand {
  const name = b.name.trim() || fallbackName.trim();
  const fill = (t: string) => (name ? t.split(NAME_TOKEN).join(name) : t.split(NAME_TOKEN).join("").replace(/^안녕하세요!\s*입니다\s*/, "안녕하세요! ").trim());
  return { ...b, greeting: fill(b.greeting), closingHeading: fill(b.closingHeading) };
}

/** 예전에 학원명을 박아 자동으로 만든 문구(또는 빈 값)를 {학원명} 템플릿으로 바꾼다 */
function migrateBrand(b: Brand): Brand {
  const name = b.name.trim();
  const isAutoGreeting = !b.greeting.trim() || (!!name && [`안녕하세요! ${name}입니다.`, `안녕하세요! ${name}입니다 😊`, `안녕하세요! ${name}입니다`].includes(b.greeting.trim()));
  const isAutoClosing = !b.closingHeading.trim() || (!!name && b.closingHeading.trim() === `${name} 상담 안내`);
  return { ...b, greeting: isAutoGreeting ? AUTO_GREETING : b.greeting, closingHeading: isAutoClosing ? AUTO_CLOSING : b.closingHeading };
}

/** 네이버 스마트에디터 글자 크기 목록 */
export const NAVER_FONT_SIZES = [11, 13, 15, 16, 19, 24, 28, 30, 34, 38] as const;

export interface FormatTemplate {
  align: "justify" | "left" | "center";
  bodySize: number;
  headingSize: number;
  headingColor: string;
  headingBold: boolean;
  headingPrefix: "number" | "dash" | "none";
  listMarker: string;
  blankLineBetween: boolean;
  imageMarkers: boolean;
}

/** 카드뉴스 템플릿 3종(clip·folder·bubble). 나머지는 예전에 저장된 값으로, 가장 가까운 템플릿으로 그린다. */
export type ImageLayout = "clip" | "folder" | "bubble" | "note" | "card" | "poster" | "bold" | "headline" | "notice" | "checklist" | "summary" | "scene";

/** 일러스트 그림체(이미지 생성 API 연결 시 사용) */
export const ILLUSTRATION_STYLES = {
  photo: {
    label: "실사",
    prompt:
      "candid documentary snapshot taken on a 35mm film camera, bright soft daylight from a window, well-exposed and airy with clean whites (never dim or gloomy), natural imperfect framing slightly off-center, realistic skin with visible pores and no retouching, everyday lived-in clutter (sticky notes, worn textbooks, a water bottle), muted natural colors, subtle film grain, moderate depth of field rather than heavy bokeh",
  },
  webtoon: {
    label: "웹툰풍",
    prompt: "Korean webtoon style illustration, clean confident line art, soft cel shading, expressive but natural characters, bright clean colors, a single panel without speech balloons",
  },
  flat: {
    label: "일러스트",
    prompt: "warm editorial illustration, simple flat shapes with soft paper grain texture, gentle limited palette, subtle shadows, friendly and modern, no outlines-heavy cartoon look",
  },
} as const;
export type IllustrationStyle = keyof typeof ILLUSTRATION_STYLES;

export interface ImageDesign {
  layout: ImageLayout;
  label: string; // 이미지 안에 들어가는 학원·블로그 표기
  logo: string | null; // 업로드한 로고(dataURL, 축소 저장)
  bg: string;
  primary: string; // 제목 글자·띠
  accent: string; // 강조 박스·하이라이트
  point: string; // 포인트 단어
  footer: boolean; // 하단 로고 띠
  contact: string; // 썸네일 상단 띠 문구(예: 무료상담 02-000-0000)
  rev?: number; // 기본값 개편 버전(이전 저장값 이관용)
  illustrationStyle: IllustrationStyle;
  illustrationNote: string; // 추가 요청(예: 학생은 교복 차림)
}

/** 이미지 기본값을 바꿀 때 올린다. 이전 버전으로 저장된 레이아웃·그림체는 새 기본값으로 옮긴다. */
const IMAGE_REV = 4;

export interface Settings {
  brand: Brand;
  format: FormatTemplate;
  image: ImageDesign;
}

export const DEFAULT_SETTINGS: Settings = {
  brand: {
    name: "",
    author: "",
    greeting: AUTO_GREETING,
    closingHeading: AUTO_CLOSING,
    bookingUrl: "",
    placePhone: "",
    placeUrl: "",
    titleSuffixes: [],
    fixedHashtags: [],
    regionHashtagGroups: [],
  },
  format: {
    align: "justify",
    bodySize: 19,
    headingSize: 24,
    headingColor: "#8c8c8c",
    headingBold: true,
    headingPrefix: "number",
    listMarker: "-",
    blankLineBetween: true,
    imageMarkers: true,
  },
  image: {
    layout: "folder",
    label: "",
    logo: null,
    bg: "#F4EFE6",
    primary: "#1F2937",
    accent: "#FFD84D",
    point: "#E04A2F",
    footer: true,
    contact: "",
    rev: IMAGE_REV,
    illustrationStyle: "photo",
    illustrationNote: "",
  },
};

const KEY = "ebs:settings:v1";

/** 저장된 설정을 기본값 위에 덮어써서 읽는다(필드가 추가돼도 깨지지 않게). */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw) as Partial<Settings>;
    const brand = BrandSchema.safeParse({ ...DEFAULT_SETTINGS.brand, ...s.brand });
    return migrateSettings(
      {
        brand: brand.success ? brand.data : DEFAULT_SETTINGS.brand,
        format: { ...DEFAULT_SETTINGS.format, ...s.format },
        image: { ...DEFAULT_SETTINGS.image, ...s.image },
      },
      s.image?.rev,
    );
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 저장된 설정을 현재 기본값 체계로 한 번 옮긴다(rev 는 image.rev 에 기록). */
export function migrateSettings(s: Settings, rev: number | undefined): Settings {
  const r = rev ?? 1;
  if (r >= IMAGE_REV) return s;
  let { brand, image } = s;
  // 2: 실사 사진 + 포스터형 썸네일이 기본, 상담 문구는 등록된 전화번호로 채움
  if (r < 2) {
    const phone = brand.placePhone.trim();
    image = { ...image, layout: "poster", illustrationStyle: "photo", contact: image.contact || (phone ? `무료상담 ${phone}` : "") };
  }
  // 3: 인사말·마무리 소제목을 {학원명} 템플릿으로(학원 이름이 바뀌어도 따라감)
  if (r < 3) brand = migrateBrand(brand);
  // 4: 카드뉴스 템플릿 3종(클립·폴더·말풍선), 그림체 3종(실사·웹툰풍·일러스트)으로 정리
  if (r < 4) {
    const old = image.layout as string;
    const layout: ImageLayout = old === "note" || old === "card" ? "clip" : old === "poster" || old === "scene" || old === "bold" ? "bubble" : old === "clip" || old === "bubble" ? old : "folder";
    const illustrationStyle: IllustrationStyle = image.illustrationStyle in ILLUSTRATION_STYLES ? image.illustrationStyle : "flat";
    image = { ...image, layout, illustrationStyle };
  }
  return { ...s, brand, image: { ...image, rev: IMAGE_REV } };
}

export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** 서버 요청 본문의 brand를 검증하고, 없거나 잘못되면 기본값을 쓴다. */
export function parseBrand(v: unknown): Brand {
  const r = BrandSchema.safeParse(v);
  return r.success ? r.data : DEFAULT_SETTINGS.brand;
}
