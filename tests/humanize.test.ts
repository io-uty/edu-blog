import { describe, expect, it } from "vitest";
import { aiTells, noMidDot } from "../src/lib/humanize";
import { mockDraft } from "../src/lib/mock";

describe("noMidDot", () => {
  it("단어 사이 가운뎃점은 쉼표로, 한 글자 약어·이미지 표시는 그대로", () => {
    expect(noMidDot("어휘·문법·독해 중 하나")).toBe("어휘, 문법, 독해 중 하나");
    expect(noMidDot("초·중·고")).toBe("초·중·고");
    expect(noMidDot("[이미지 1 · 썸네일]")).toBe("[이미지 1 · 썸네일]");
  });
});

describe("aiTells 새 패턴", () => {
  it("숫자 묶음·가운뎃점·예를 들어 반복·돌려 권하는 말을 잡는다", () => {
    const d = mockDraft("영어 오답");
    d.introduction = ["어휘·문법·독해로 나눕니다. 세 갈래로 나눕니다. 3단계로 봅니다."];
    d.sections[0].paragraphs = ["예를 들어 A입니다. 예를 들어 B입니다. 예를 들어 C입니다.", "먼저 하는 편이 좋습니다. 이유가 있습니다."];
    const t = aiTells(d).join("\n");
    expect(t).toContain("숫자 묶음");
    expect(t).toContain("가운뎃점");
    expect(t).toContain("예를 들어");
    expect(t).toContain("돌려 권하는");
  });
});
