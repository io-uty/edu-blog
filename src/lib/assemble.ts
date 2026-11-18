import { BRAND, TOPIC_HASHTAG_COUNT } from "@/config/brand";
import type { Draft } from "./schemas";

// AI가 쓰지 않는 고정 요소(제목 끝 지역 표기, 고정·지역 태그)를 코드로 붙인다.

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function pickRegionGroup(topic: string, index?: number | null) {
  const groups = BRAND.regionHashtagGroups;
  const i = index ?? hash(topic) % groups.length;
  return { index: i, tags: [...groups[i % groups.length]] };
}

const clean = (t: string) => t.replace(/^#/, "").replace(/\s+/g, "");

export function assemble(raw: Draft, topic: string, regionIndex?: number | null): { draft: Draft; regionIndex: number } {
  const suffix = BRAND.titleSuffixes[hash(topic) % BRAND.titleSuffixes.length];
  const hasSuffix = BRAND.titleSuffixes.some((s) => raw.title.includes(s.replace(/[()]/g, "")));
  const title = hasSuffix ? raw.title.trim() : `${raw.title.trim()} ${suffix}`;

  const region = pickRegionGroup(topic, regionIndex);
  const reserved = new Set<string>([...BRAND.fixedHashtags, ...BRAND.regionHashtagGroups.flat()]);
  const topicTags = [...new Set(raw.hashtags.map(clean))].filter((t) => t && !reserved.has(t)).slice(0, TOPIC_HASHTAG_COUNT);

  return {
    draft: { ...raw, title, hashtags: [...topicTags, ...BRAND.fixedHashtags, ...region.tags] },
    regionIndex: region.index,
  };
}
