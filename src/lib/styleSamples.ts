import "server-only";
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_PREFIX_BY_TYPE, type ContentType } from "@/config/brand";

// style-samples/ 의 기존 블로그 원문(.txt/.md)을 문체 참고 자료로 읽는다.
// 파일명 접두사(english-, admission-, university-)로 콘텐츠 유형에 맞는 글을 우선 고른다.
const DIR = path.join(process.cwd(), "style-samples");
const MAX_SAMPLES = 2;
const MAX_CHARS = 3200;

export function loadStyleSamples(contentType: ContentType): string[] {
  let files: string[];
  try {
    files = fs.readdirSync(DIR).filter((f) => /\.(txt|md)$/.test(f) && !f.startsWith("README")).sort();
  } catch {
    return [];
  }
  const prefixes = SAMPLE_PREFIX_BY_TYPE[contentType] ?? [];
  const ranked = [
    ...prefixes.flatMap((p) => files.filter((f) => f.startsWith(`${p}-`))),
    ...files,
  ].filter((f, i, a) => a.indexOf(f) === i);
  return ranked
    .slice(0, MAX_SAMPLES)
    .map((f) => fs.readFileSync(path.join(DIR, f), "utf8").trim().slice(0, MAX_CHARS))
    .filter(Boolean);
}

export function styleSamplesBlock(contentType: ContentType): string {
  const samples = loadStyleSamples(contentType);
  if (!samples.length) return "";
  return `\n\n[기존 공식 블로그 글 — 문체·구성·호흡만 참고]
- 문장, 예문, 표를 그대로 복제하지 않는다. 같은 주제라도 새로운 예문과 설명을 만든다.
- 샘플 속 숫자·학년도·일정·대학 정보는 근거로 쓰지 않는다(작성 당시 공식 자료 기반이며 지금은 다를 수 있음).
- [이미지]는 이미지가 들어간 자리 표시다.
${samples.map((s, i) => `<sample_${i + 1}>\n${s}\n</sample_${i + 1}>`).join("\n")}`;
}
