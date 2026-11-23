// 실행: node --experimental-strip-types scripts/test-humanize.mts
import assert from "node:assert/strict";
import { applyPolish, aiTells, similarity } from "../src/lib/humanize.ts";
const d = {
  title: "t", hashtags: ["a"],
  introduction: ["편입 영어는 어휘가 기초가 되며, 독해와 문법도 함께 오릅니다."],
  sections: [{ heading: "어휘부터 잡으세요", paragraphs: ["하루 50개씩 외우는 것이 아니라 복습 주기가 중요합니다.", "원문 그대로 둘 문단입니다."], bullets: null, table: null, example: null }],
  conclusion: ["상담에서 지금 위치를 확인해 보세요."],
};
const p = {
  introduction: ["편입 영어는 어휘가 기초가 되며 독해와 문법도 함께 오릅니다."],          // 쉼표만 제거 → 채택
  sections: [{ heading: "어휘부터 잡으세요", paragraphs: ["하루 30개씩 외우되 복습 주기를 먼저 정하세요.", "완전히 다른 새 내용으로 바꿔 버린 문단, 원래 뜻과 전혀 상관없음."], bullets: null }],
  conclusion: ["상담에서 지금 위치부터 확인해 보세요."],
};
const r = applyPolish(d as never, p);
assert.equal(r.introduction[0], p.introduction[0]);                 // 채택
assert.equal(r.sections[0].paragraphs[0], d.sections[0].paragraphs[0]); // 숫자 50→30 바뀜 → 원문 유지
assert.equal(r.sections[0].paragraphs[1], d.sections[0].paragraphs[1]); // 너무 많이 바뀜 → 원문 유지
assert.equal(r.conclusion[0], p.conclusion[0]);
assert.equal(applyPolish(d as never, { ...p, sections: [] }), d);       // 구조 다르면 통째로 원문
assert.equal(similarity("가나다라", "가나다라"), 1);
const tells = aiTells({ ...d, introduction: ["A가 아니라 B입니다. C가 아니라 D입니다. 하며, 되고, 따라서 결국 그러므로"] } as never);
assert.ok(tells.some((t) => t.includes("대구")) && tells.some((t) => t.includes("쉼표")) && tells.some((t) => t.includes("결산")), tells.join(" / "));
console.log("ok", tells);
