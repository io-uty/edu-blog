// 네이버 블로그 글쓰기(스마트에디터 ONE) 화면에서 실행:
// 보관된 글이 있으면 제목·본문 칸에 붙여넣기 이벤트로 넣고, 보관본을 지운다.
(() => {
  const MAX_AGE = 5 * 60 * 1000; // 5분 안에 연 글쓰기 화면에만 넣는다
  const TITLE_SEL = ".se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph";
  const BODY_SEL = ".se-main-container .se-component.se-text .se-text-paragraph, .se-component-content .se-text-paragraph";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 60000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(400);
    }
    return null;
  }

  function paste(el, data) {
    el.scrollIntoView({ block: "center" });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.click();
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : el;
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(data)) if (value) dt.setData(type, value);
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  function banner(text) {
    const d = document.createElement("div");
    d.textContent = text;
    Object.assign(d.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647, maxWidth: "360px",
      background: "#222", color: "#fff", padding: "10px 14px", font: "13px/1.5 sans-serif", borderRadius: "2px",
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 7000);
  }

  // '작성 중인 글이 있습니다' 같은 팝업이 떠 있으면 사용자가 고를 때까지 기다린다
  const popupOpen = () => !!document.querySelector(".se-popup-dim, .se-popup-container");

  async function run() {
    const titleEl = await waitFor(() => document.querySelector(TITLE_SEL), 30000);
    if (!titleEl) return; // 글쓰기 에디터가 없는 프레임
    const { bbologPending: p } = await chrome.storage.local.get("bbologPending");
    if (!p || Date.now() - p.at > MAX_AGE) return;

    await waitFor(() => !popupOpen(), 120000);
    // 다른 프레임이 먼저 처리했는지 다시 확인하고 바로 지운다(중복 방지)
    const again = await chrome.storage.local.get("bbologPending");
    if (!again.bbologPending || again.bbologPending.at !== p.at) return;
    await chrome.storage.local.remove("bbologPending");

    try {
      paste(document.querySelector(TITLE_SEL), { "text/plain": p.title });
      await sleep(500);
      const bodyEl = await waitFor(() => document.querySelector(BODY_SEL), 10000);
      if (!bodyEl) throw new Error("본문 칸을 찾지 못함");
      paste(bodyEl, { "text/html": p.html, "text/plain": p.plainText });
      await sleep(1200);
      const filled = (document.querySelector(".se-main-container")?.innerText || "").trim().length > 20;
      banner(filled ? "뚝딱: 제목과 본문을 넣었습니다. 이미지와 서식을 확인해 주세요." : "뚝딱: 자동 입력이 되지 않았습니다. 본문 칸을 클릭하고 붙여넣기(⌘V / Ctrl+V) 하세요. 본문은 이미 복사되어 있습니다.");
    } catch {
      banner("뚝딱: 자동 입력이 되지 않았습니다. 본문 칸을 클릭하고 붙여넣기(⌘V / Ctrl+V) 하세요. 본문은 이미 복사되어 있습니다.");
    }
  }

  run();
})();
