// AI 티 윤문 — humanize-korean(epoko77-ai/im-not-ai, MIT) 룰북 중 블로그 글에 맞는 패턴만 옮겼다.
// 1) HUMANIZE_RULES: 본문 생성·윤문 프롬프트 공용 규칙
// 2) applyPolish: 윤문 결과를 문단 단위로 받아들이되, 수치가 바뀌었거나 너무 많이 바뀐 문단은 원문으로 되돌린다
// 3) aiTells: 남은 AI 티를 세는 규칙 기반 검사(품질 패널 표시용)
import { z } from "zod";
import type { Draft } from "./schemas";

export const HUMANIZE_RULES = `
[AI 티 없애기 — 실측으로 사람 글과 갈리는 패턴]
- "A가 아니라 B", "~것이 아니라", "A인가, B인가" 대구는 글 전체에서 1번만. 나머지는 바로 단언한다.
- 연결어미(-고/-며/-지만/-면서/-아서/-어서) 바로 뒤에 쉼표를 찍지 않는다.
- 문장 길이를 섞는다. 짧은 문장 위주로 쓰되, 인접한 두 문장을 이어 쓴 긴 문장을 가끔 섞어 리듬이 고르지 않게 한다.
- 같은 종결이 4문장 넘게 이어지지 않게 한다. 합쇼체는 유지한 채 "~입니다/~합니다/~하세요/~수 있습니다"를 섞는다.
- 문단을 당위("~해야 한다/~해야 합니다")로 끝내는 것은 글 전체에서 2번까지. 당위 문장은 문단 앞이나 중간에 둔다.
- "결론적으로/따라서/그러므로/이를 통해/요약하면/결국"은 글 전체에서 2번까지. "~하는 이유다", "~할 때다", "~로 이어진다" 같은 결산 문장은 1번까지.
- 분열문("중요한 것은 ~이다", "핵심은 ~이다")은 주어-서술로 바로 쓴다(무엇을 해야 하는지 구체적으로).
- "~다는 것이다/~다는 뜻이다" 종결은 2번까지. "~에 대해/~에 있어/~을 가지고 있다/~되어진다/~에 의해" 번역투를 쓰지 않는다.
- "~적 N" 추상 체인("전략적 접근", "체계적 관리", "효율적 학습")은 3번 미만. 구체적인 행동으로 풀어 쓴다.
- "다음과 같다", "크게 세 가지로", "주목할 만하다", "매우 중요하다" 같은 도입·과장 관용구를 쓰지 않는다.
- "세 갈래·세 가지·세 축·N단계로 나누다" 같은 숫자 묶음 표현은 글 전체에서 1번까지. 소제목에는 쓰지 않는다. 항목 수는 말하지 않고 바로 항목을 쓴다.
- 단어를 나열할 때 가운뎃점(·)을 쓰지 않는다. "어휘·문법·독해"가 아니라 "어휘, 문법, 독해"처럼 쉼표나 "와/과"로 쓴다.
- 세 항목을 대칭으로 나열하는 문장("A, B, C" / "A는 ~, B는 ~, C는 ~")은 글 전체에서 2번까지. 나머지는 두 항목으로 줄이거나 하나만 골라 쓴다.
- "예를 들어"는 글 전체에서 2번까지. 모든 소주제를 예시로 끝내지 않고, 소주제마다 짜임을 다르게 한다(기준만 설명하고 끝, 실수 사례로 시작, 질문으로 시작 등).
- "~하는 편이 좋습니다/효율이 좋습니다/낫습니다", "~는 이유가 있습니다", "~부터 해야 합니다"처럼 돌려 권하는 말을 쓰지 않는다. "~하세요", "~합니다"로 바로 말한다.
- 같은 비유를 반복하지 않고, 원문에 없던 비유·과장("괄목할 만한", "청사진", "신호탄")을 새로 넣지 않는다.
`.trim();

/** 단어 사이 가운뎃점을 쉼표로 바꾼다("어휘·문법·독해" → "어휘, 문법, 독해"). 양쪽 두 글자 이상일 때만("초·중·고"는 그대로). */
export const noMidDot = (t: string) => t.replace(/(?<=[가-힣]{2})·(?=[가-힣]{2})/g, ", ");

/** 윤문 대상(글자만). 제목·태그·표·예문은 건드리지 않는다. */
export const PolishSchema = z.object({
  introduction: z.array(z.string()),
  sections: z.array(z.object({ heading: z.string(), paragraphs: z.array(z.string()), bullets: z.array(z.string()).nullable() })),
  conclusion: z.array(z.string()),
});
export type Polish = z.infer<typeof PolishSchema>;

export const polishInput = (d: Draft): Polish => ({
  introduction: d.introduction,
  sections: d.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs, bullets: s.bullets })),
  conclusion: d.conclusion,
});

const numbers = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).sort().join("|");
const bigrams = (s: string) => {
  const t = s.replace(/\s+/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
  return m;
};
/** 글자 2-gram 겹침(0~1). 1이면 그대로, 낮을수록 많이 바뀜 */
export function similarity(a: string, b: string) {
  const x = bigrams(a);
  const y = bigrams(b);
  let both = 0;
  let total = 0;
  for (const [k, n] of x) both += Math.min(n, y.get(k) ?? 0);
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  return total ? (2 * both) / total : 1;
}

// 이보다 덜 겹치면 내용까지 바뀐 것으로 보고 원문을 쓴다(본진 과윤문 가드 50% 기준)
const MIN_SIMILARITY = 0.5;
const keep = (orig: string, next: string | undefined) =>
  next && next.trim() && numbers(orig) === numbers(next) && similarity(orig, next) >= MIN_SIMILARITY ? next.trim() : orig;
const keepAll = (orig: string[], next: string[] | null | undefined) => (next?.length === orig.length ? orig.map((o, i) => keep(o, next[i])) : orig);

/** 윤문 결과를 문단 단위로 반영한다. 구조가 다르거나 수치가 바뀐 문단은 원문 유지. */
export function applyPolish(d: Draft, p: Polish): Draft {
  return tidyDraft(applyPolishRaw(d, p));
}

/** 본문 문단·목록의 가운뎃점 나열을 코드로 정리한다(제목·표·예시는 건드리지 않음). */
export function tidyDraft(d: Draft): Draft {
  return {
    ...d,
    introduction: d.introduction.map(noMidDot),
    conclusion: d.conclusion.map(noMidDot),
    sections: d.sections.map((s) => ({ ...s, paragraphs: s.paragraphs.map(noMidDot), bullets: s.bullets ? s.bullets.map(noMidDot) : s.bullets })),
  };
}

function applyPolishRaw(d: Draft, p: Polish): Draft {
  if (p.sections.length !== d.sections.length) return d;
  return {
    ...d,
    introduction: keepAll(d.introduction, p.introduction),
    conclusion: keepAll(d.conclusion, p.conclusion),
    sections: d.sections.map((s, i) => {
      const q = p.sections[i];
      return {
        ...s,
        heading: keep(s.heading, q.heading),
        paragraphs: keepAll(s.paragraphs, q.paragraphs),
        bullets: s.bullets ? keepAll(s.bullets, q.bullets) : s.bullets,
      };
    }),
  };
}

/** 남은 AI 티(규칙 기반). 품질 패널에 '자연스러움' 항목으로 보여준다. */
export function aiTells(d: Draft): string[] {
  const paras = [...d.introduction, ...d.sections.flatMap((s) => s.paragraphs), ...d.conclusion];
  const text = paras.join("\n");
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const out: string[] = [];
  const contrast = count(/(?:이|가) 아니라|것이 아니라|인가[,?]/g);
  if (contrast >= 2) out.push(`"A가 아니라 B" 대구 ${contrast}회 (1회 권장)`);
  const commas = count(/[가-힣](?:며|면서|지만|아서|어서),/g) + count(/(?:하|되|있|없|이|않)고,/g);
  if (commas >= 2) out.push(`연결어미 뒤 쉼표 ${commas}곳`);
  const wrap = count(/결론적으로|따라서|그러므로|이를 통해|요약하면|정리하자면|결국/g);
  if (wrap >= 3) out.push(`결산 접속어 ${wrap}회 (2회 이하 권장)`);
  const stock = count(/(?:중요|필요|효과적)(?:합니다|하다)|도움이 (?:됩니다|된다)/g);
  if (stock >= 4) out.push(`"중요하다·필요하다" 류 종결 ${stock}회`);
  const cleft = count(/(?:중요한|필요한) 것은|핵심은|관건은/g);
  if (cleft >= 2) out.push(`"핵심은 ~입니다" 분열문 ${cleft}회`);
  const notice = count(/확인하세요|확인해 보세요|확인해 주세요|확인해야 한다|확인하자/g);
  if (notice >= 3) out.push(`확인 안내 문장 ${notice}번 (1번 권장)`);
  const bundle = count(/[세네두] (?:갈래|가지|축|기둥)|[2-9]단계/g) + d.sections.filter((s) => /[세네두] (?:갈래|가지|축|기둥)|[2-9]단계/.test(s.heading)).length;
  if (bundle >= 2) out.push(`"세 갈래·세 가지·N단계" 숫자 묶음 ${bundle}회 (1회 권장, 소제목에는 쓰지 않기)`);
  const dot = count(/[가-힣]{2,}·[가-힣]{2,}/g);
  if (dot >= 1) out.push(`가운뎃점(·) 나열 ${dot}곳 (쉼표로)`);
  const eg = count(/예를 들어/g);
  if (eg >= 3) out.push(`"예를 들어" ${eg}회 (2회 이하 권장, 소주제마다 예시로 끝내지 않기)`);
  const hedge = count(/(?:는|한|은) 편이 (?:좋|낫|효율)|이유가 있습니다/g);
  if (hedge >= 2) out.push(`돌려 권하는 말("~하는 편이 좋습니다·이유가 있습니다") ${hedge}회`);
  // 본문은 합쇼체("~입니다·~하세요")로 통일한다. "~다"·"~해요"로 끝나는 문장이 섞이면 표시
  const plain = count(/[가-힣](?<!니)다[.!]/g) + count(/(?:어요|아요|해요|예요|이에요)[.?!]/g);
  if (plain >= 3) out.push(`합쇼체가 아닌 문장 ${plain}개 섞임("~입니다·~하세요"로 통일)`);
  return out;
}
