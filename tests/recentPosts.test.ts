import { describe, expect, it } from "vitest";
import { postExcerpt, recentPostsBlock } from "@/lib/prompt/tenant";

describe("최근 발행 글 참고", () => {
  it("도입과 첫 소주제만 800자 안으로 자른다", () => {
    const p = postExcerpt({
      title: "근의 공식 실수",
      introduction: ["기말 준비 바쁘시죠?"],
      sections: [
        { heading: "부호부터", paragraphs: ["가".repeat(900)] },
        { heading: "두 번째", paragraphs: ["안 들어감"] },
      ],
    })!;
    expect(p.title).toBe("근의 공식 실수");
    expect(p.excerpt.startsWith("기말 준비 바쁘시죠?\n부호부터")).toBe(true);
    expect(p.excerpt.length).toBe(800);
    expect(p.excerpt).not.toContain("두 번째");
  });

  it("제목 없는 초안은 건너뛴다", () => {
    expect(postExcerpt(null)).toBeNull();
    expect(postExcerpt({ introduction: ["x"] })).toBeNull();
  });

  it("글이 없으면 프롬프트 블록을 만들지 않는다", () => {
    expect(recentPostsBlock([])).toBe("");
    expect(recentPostsBlock([{ title: 'a"b', excerpt: "본문" }])).toContain(`title="a'b"`);
  });
});
