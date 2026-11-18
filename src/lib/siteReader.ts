import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

// 학원 공식 홈페이지의 공개 페이지만 읽는다.
// - robots.txt 를 먼저 확인하고, 막힌 경로는 읽지 않는다.
// - 로그인·접근 제한을 우회하지 않는다(쿠키·인증 헤더 없음, 401/403 이면 중단).
// - 내부망 주소로의 요청(SSRF)을 막는다: 매 요청·리다이렉트마다 호스트 IP 를 확인한다.

export const USER_AGENT = "bbolog-site-reader/0.1 (academy onboarding; respects robots.txt)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("주소 형식이 올바르지 않습니다.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("http(s) 주소만 분석할 수 있습니다.");
  if (u.username || u.password) throw new Error("계정 정보가 포함된 주소는 분석하지 않습니다.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("표준 포트가 아닌 주소는 분석하지 않습니다.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    throw new Error("공개 인터넷 주소만 분석할 수 있습니다.");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("주소를 찾을 수 없습니다.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("공개 인터넷 주소만 분석할 수 있습니다.");
  return u;
}

/** 리다이렉트를 직접 따라가며 매번 주소를 검사한다. */
async function safeFetch(url: URL, accept: string): Promise<{ status: number; url: URL; text: string; type: string }> {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(cur.href);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(cur, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": USER_AGENT, Accept: accept } });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        const next = new URL(r.headers.get("location")!, cur);
        if (next.origin !== url.origin && next.hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, ""))
          throw new Error("다른 사이트로 이동하는 페이지는 읽지 않습니다.");
        cur = next;
        continue;
      }
      const type = r.headers.get("content-type") ?? "";
      const reader = r.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          ctrl.abort();
          break;
        }
        chunks.push(value);
      }
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase();
      let text: string;
      try {
        text = new TextDecoder(charset === "euc-kr" || charset === "ks_c_5601-1987" ? "euc-kr" : "utf-8").decode(buf);
      } catch {
        text = buf.toString("utf8");
      }
      return { status: r.status, url: cur, text, type };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("리다이렉트가 너무 많습니다.");
}

// ---------- robots.txt ----------

export interface Robots {
  status: "allowed" | "disallowed" | "missing" | "error";
  rules: { allow: boolean; path: string }[];
}

export async function readRobots(origin: URL): Promise<Robots> {
  try {
    const r = await safeFetch(new URL("/robots.txt", origin), "text/plain");
    if (r.status === 404 || r.status === 410) return { status: "missing", rules: [] };
    if (r.status >= 400) return { status: "error", rules: [] }; // 확인할 수 없으면 읽지 않는다
    // User-agent: * 그룹(또는 bbolog 전용 그룹)의 규칙만 사용
    const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
    let cur: (typeof groups)[number] | null = null;
    let lastWasAgent = false;
    for (const rawLine of r.text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*/, "").trim();
      const m = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "user-agent") {
        if (!cur || !lastWasAgent) {
          cur = { agents: [], rules: [] };
          groups.push(cur);
        }
        cur.agents.push(val.toLowerCase());
        lastWasAgent = true;
      } else {
        lastWasAgent = false;
        if (cur && (key === "allow" || key === "disallow") && (val || key === "allow"))
          cur.rules.push({ allow: key === "allow", path: val });
      }
    }
    const mine = groups.find((g) => g.agents.some((a) => a.includes("bbolog"))) ?? groups.find((g) => g.agents.includes("*"));
    return { status: "allowed", rules: mine?.rules ?? [] };
  } catch {
    return { status: "error", rules: [] };
  }
}

export function robotsAllows(rb: Robots, path: string) {
  if (rb.status === "error") return false;
  let best: { allow: boolean; len: number } = { allow: true, len: -1 };
  for (const r of rb.rules) {
    if (!r.path) continue;
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && r.path.length > best.len) best = { allow: r.allow, len: r.path.length };
  }
  return best.allow;
}

// ---------- HTML → 텍스트 ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", apos: "'" };

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article|\/footer|\/header)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1)) || 32) : m))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const INFO_LINK = /(about|intro|company|teacher|instructor|faculty|location|map|contact|오시는|찾아오|소개|강사|선생님|교수진|위치|연혁|특징)/i;

export interface PageText {
  url: string;
  ok: boolean;
  reason?: string;
  text: string;
}

/** 홈페이지 + 같은 사이트의 소개·강사·위치 페이지 최대 3개를 읽는다. */
export async function readSite(start: URL, robots: Robots): Promise<PageText[]> {
  const pages: PageText[] = [];
  const queue: URL[] = [start];
  const seen = new Set<string>();
  while (queue.length && pages.length < 4) {
    const u = queue.shift()!;
    const key = u.origin + u.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!robotsAllows(robots, u.pathname + u.search)) {
      pages.push({ url: u.href, ok: false, reason: "robots.txt 에서 수집이 허용되지 않음", text: "" });
      continue;
    }
    try {
      const r = await safeFetch(u, "text/html");
      if (r.status === 401 || r.status === 403) {
        pages.push({ url: u.href, ok: false, reason: "접근 제한 페이지(읽지 않음)", text: "" });
        continue;
      }
      if (r.status >= 400 || !/html/i.test(r.type)) {
        pages.push({ url: u.href, ok: false, reason: `읽을 수 없는 페이지(${r.status})`, text: "" });
        continue;
      }
      if (/<input[^>]+type=["']?password/i.test(r.text) && pages.length > 0) {
        pages.push({ url: u.href, ok: false, reason: "로그인 페이지(읽지 않음)", text: "" });
        continue;
      }
      pages.push({ url: r.url.href, ok: true, text: htmlToText(r.text).slice(0, 9000) });
      if (pages.length === 1) {
        for (const m of r.text.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
          try {
            const link = new URL(m[1], r.url);
            if (link.origin !== r.url.origin) continue;
            if (INFO_LINK.test(link.pathname) || INFO_LINK.test(htmlToText(m[2]))) queue.push(link);
          } catch {
            /* 잘못된 링크 무시 */
          }
          if (queue.length >= 6) break;
        }
      }
    } catch (e) {
      pages.push({ url: u.href, ok: false, reason: e instanceof Error ? e.message : "읽기 실패", text: "" });
    }
  }
  return pages;
}

/** 공백·줄바꿈 차이를 무시하고 근거 문장이 원문에 있는지 확인 */
export function evidenceIn(evidence: string, text: string) {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const e = norm(evidence);
  return e.length >= 2 && norm(text).includes(e);
}
