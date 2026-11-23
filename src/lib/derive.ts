import { checkQuality } from "./quality";
import { renderHtml, renderPlainText, type ImageSlots } from "./render";
import type { Settings } from "./settings";
import type { DocRecord } from "./store";

export function slotsOf(doc: DocRecord): ImageSlots {
  const imgs = doc.images ?? [];
  return {
    thumbnail: imgs.some((i) => i.kind === "thumbnail"),
    sections: imgs.filter((i) => i.kind === "section" && i.sectionIndex != null).map((i) => i.sectionIndex!),
  };
}

/** 문서의 검사 결과와 붙여넣기용 텍스트·HTML을 현재 설정으로 계산한다. 인사말의 {학원명}은 학원 이름으로 채운다. */
export function derive(doc: DocRecord, settings: Settings, prohibited: string[] = [], academyName = "") {
  const s = { ...settings, brand: { ...settings.brand, name: settings.brand.name.trim() || academyName } };
  const slots = slotsOf(doc);
  return {
    slots,
    quality: checkQuality(doc.draft, s.brand, prohibited),
    html: renderHtml(doc.draft, s, slots),
    plainText: renderPlainText(doc.draft, s, slots),
  };
}
