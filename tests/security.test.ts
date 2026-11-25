import { describe, expect, it } from "vitest";
import { assertPublicUrl } from "@/lib/siteReader";
import { nameMatches } from "@/lib/bank";
import { allow } from "@/lib/rateLimit";
import { renderHtml } from "@/lib/render";
import { mockDraft } from "@/lib/mock";

describe("assertPublicUrl (SSRF 방어)", () => {
  // IP 직접 입력은 DNS 조회 없이 검사된다
  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://192.168.0.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::127.0.0.1]/",
    "http://[fd00::1]/",
    "http://localhost/",
    "http://foo.internal/",
    "http://example.com:8080/",
    "http://user:pw@example.com/",
    "ftp://example.com/",
    "not a url",
  ])("막는다: %s", async (u) => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });

  it("공개 IP 는 통과", async () => {
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://[::ffff:808:808]/")).resolves.toBeInstanceOf(URL); // 8.8.8.8 을 IPv6 로 쓴 형태
  });
});

describe("nameMatches (입금자명 매칭)", () => {
  it("공백·기호·대소문자 무시", () => expect(nameMatches("홍 길동", "홍길동")).toBe(true));
  it("은행이 자른 긴 이름은 4자 이상일 때만 앞부분 일치 허용", () => {
    expect(nameMatches("홍길동김철수", "홍길동김")).toBe(true);
    expect(nameMatches("홍길동", "홍길")).toBe(false);
  });
  it("빈 이름·다른 사람은 불일치", () => {
    expect(nameMatches("", "홍길동")).toBe(false);
    expect(nameMatches("홍길동", "김철수")).toBe(false);
  });
});

describe("allow (호출 횟수 제한, Supabase 없는 메모리 모드)", () => {
  it("max 를 넘으면 막고, 키가 다르면 따로 센다", async () => {
    const k = `t-${Math.random()}`;
    expect(await allow(k, 2, 60)).toBe(true);
    expect(await allow(k, 2, 60)).toBe(true);
    expect(await allow(k, 2, 60)).toBe(false);
    expect(await allow(`${k}-other`, 2, 60)).toBe(true);
  });
});

describe("renderHtml (XSS 이스케이프)", () => {
  it("본문·소제목·표의 < > \" 가 태그로 살아나지 않는다", () => {
    const d = mockDraft("테스트");
    const evil = `<script>alert(1)</script><img src=x onerror="x">`;
    d.introduction[0] = evil;
    d.sections[0].heading = evil;
    d.sections[0].paragraphs[0] = evil;
    const html = renderHtml(d);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
