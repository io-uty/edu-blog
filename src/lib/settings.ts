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
  placeName: z.string().max(80),
  placeAddress: z.string().max(200),
  placePhone: z.string().max(40),
  titleSuffixes: z.array(z.string().max(40)).max(10),
  fixedHashtags: z.array(z.string().max(40)).max(10),
  regionHashtagGroups: z.array(z.array(z.string().max(40)).max(10)).max(10),
});
export type Brand = z.infer<typeof BrandSchema>;

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

export type ImageLayout = "poster" | "bold" | "headline" | "notice" | "checklist" | "summary" | "scene";

/** 일러스트 그림체(이미지 생성 API 연결 시 사용) */
export const ILLUSTRATION_STYLES = {
  photo: {
    label: "실사 사진",
    prompt:
      "high-end editorial photograph, shot on a full-frame camera with a 35mm lens, natural soft window light, shallow depth of field, realistic skin and fabric texture, clean modern Korean study space, warm neutral color grading, magazine-quality composition, sharp focus on the subject",
  },
  render3d: {
    label: "3D 캐릭터",
    prompt:
      "high-quality 3D animated film style render, soft global illumination, warm cozy lighting, detailed props and materials, appealing stylized Korean student character with natural proportions, cinematic depth of field, polished and premium look",
  },
  flat: { label: "깔끔한 플랫", prompt: "clean flat vector illustration, simple shapes, soft shadows, friendly and modern" },
  cute: { label: "동글동글 귀여운", prompt: "cute rounded kawaii-style illustration, chubby proportions, pastel tones, soft outlines" },
  webtoon: { label: "웹툰풍", prompt: "Korean webtoon style illustration, clean line art, soft cel shading, expressive characters" },
  watercolor: { label: "따뜻한 수채화", prompt: "warm watercolor illustration, gentle textures, soft edges, calm atmosphere" },
  clay: { label: "3D 클레이", prompt: "3D clay render style, rounded soft forms, playful, studio lighting" },
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
const IMAGE_REV = 2;

export interface Settings {
  brand: Brand;
  format: FormatTemplate;
  image: ImageDesign;
}

export const DEFAULT_SETTINGS: Settings = {
  brand: {
    name: "",
    author: "",
    greeting: "",
    closingHeading: "",
    bookingUrl: "",
    placeName: "",
    placeAddress: "",
    placePhone: "",
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
    layout: "poster",
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
    return {
      brand: brand.success ? brand.data : DEFAULT_SETTINGS.brand,
      format: { ...DEFAULT_SETTINGS.format, ...s.format },
      image: migrateImage({ ...DEFAULT_SETTINGS.image, ...s.image }, s.image?.rev, brand.success ? brand.data.placePhone : ""),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function migrateImage(im: ImageDesign, rev: number | undefined, phone: string): ImageDesign {
  if ((rev ?? 1) >= IMAGE_REV) return im;
  // 2: 실사 사진 + 포스터형 썸네일이 기본, 상담 문구는 등록된 전화번호로 채움
  const contact = im.contact || (phone.trim() ? `무료상담 ${phone.trim()}` : "");
  return { ...im, layout: "poster", illustrationStyle: "photo", contact, rev: IMAGE_REV };
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
