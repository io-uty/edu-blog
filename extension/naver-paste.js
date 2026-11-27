// 네이버 블로그 글쓰기(스마트에디터 ONE) 화면에서 실행:
// 보관된 글이 있으면 제목·본문 칸에 붙여넣기 이벤트로 넣고, 보관본을 지운다.
(() => {
  const MAX_AGE = 5 * 60 * 1000; // 5분 안에 연 글쓰기 화면에만 넣는다
  const TITLE_SEL = ".se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph";
  // 본문 문단. 제목 칸도 같은 클래스(.se-text-paragraph)를 써서 제목 영역은 뺀다
  const bodyParagraph = () =>
    [...document.querySelectorAll(".se-main-container .se-text-paragraph, .se-component.se-text .se-text-paragraph")].find(
      (el) => !el.closest(".se-documentTitle, .se-title-text"),
    );

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

  const log = (...a) => console.info("[뚝딱]", ...a);
  const describe = (el) => (el ? `${el.tagName}.${String(el.className || "").split(" ").slice(0, 2).join(".")}` : "없음");
  const textOf = (sel) => (document.querySelector(sel)?.innerText || "").trim();

  function focusOn(el) {
    el.scrollIntoView({ block: "center" });
    for (const type of ["mousedown", "mouseup"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    el.click();
    el.focus?.();
  }

  // 1) 붙여넣기 신호만 보내기(에디터가 받아 주면 클립보드를 건드리지 않음)
  function fakePaste(data) {
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    if (!target) return;
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(data)) if (value) dt.setData(type, value);
    target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  function copyToClipboard(data) {
    const onCopy = (e) => {
      for (const [type, value] of Object.entries(data)) if (value) e.clipboardData.setData(type, value);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("copy", onCopy, true);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", onCopy, true);
    return ok;
  }

  // 요소 가운데의 탭 화면 기준 좌표(글쓰기 에디터는 iframe 안에 있어 바깥 프레임 위치를 더한다)
  function pointOf(el) {
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    let x = r.left + Math.min(r.width / 2, 40);
    let y = r.top + r.height / 2;
    for (let w = window; w !== w.parent && w.frameElement; w = w.parent) {
      const f = w.frameElement.getBoundingClientRect();
      x += f.left + w.frameElement.clientLeft;
      y += f.top + w.frameElement.clientTop;
    }
    return [Math.round(x), Math.round(y)];
  }

  // 3) 크롬 디버거로 실제 클릭 + 입력/⌘V(background.js). 에디터가 진짜 입력만 받을 때 쓴다.
  const realInput = (steps) =>
    chrome.runtime.sendMessage({ type: "realInput", steps, mac: /Mac/i.test(navigator.platform) }).catch((e) => ({ ok: false, error: String(e) }));

  // 2) 브라우저의 진짜 복사→붙여넣기 명령(확장의 clipboardRead/clipboardWrite 권한). 에디터는 진짜 붙여넣기만 받기도 한다.
  function realPaste(data) {
    const onCopy = (e) => {
      for (const [type, value] of Object.entries(data)) if (value) e.clipboardData.setData(type, value);
      e.preventDefault();
      e.stopImmediatePropagation(); // 에디터 자체 복사 처리가 덮어쓰지 않게
    };
    document.addEventListener("copy", onCopy, true);
    const copied = document.execCommand("copy");
    document.removeEventListener("copy", onCopy, true);
    const pasted = document.execCommand("paste");
    return { copied, pasted };
  }

  const diag = []; // 실패하면 안내 문구에 함께 보여 줄 진단

  /** 칸에 내용을 넣고, done() 으로 실제로 들어갔는지 확인한다. 들어간 방법(또는 null)을 돌려준다. */
  async function fill(el, data, done, label) {
    // 1) 디버거로 실제 클릭 후 제목은 글자 입력, 본문은 클립보드에 넣고 ⌘V (네이버 에디터에서 동작 확인된 방법)
    const text = !data["text/html"];
    const copied = text || copyToClipboard(data);
    const res = await realInput([{ click: pointOf(el) }, { wait: 400 }, text ? { text: data["text/plain"] } : { paste: true }, { wait: text ? 400 : 2500 }]);
    log(label, "디버거", res, "복사", copied, "좌표", pointOf(el));
    if (done()) return "실제 입력";
    // 2) 디버거를 못 쓰면(권한 등) 스크립트 붙여넣기 신호, 3) 브라우저 붙여넣기 명령
    focusOn(el);
    fakePaste(data);
    await sleep(800);
    if (done()) return "붙여넣기 신호";
    focusOn(el);
    const r = realPaste(data);
    log(label, "진짜 붙여넣기", r, "포커스", describe(document.activeElement));
    await sleep(1500);
    if (done()) return "진짜 붙여넣기";
    diag.push(`${label}: ${res?.ok ? "입력은 보냈지만 안 들어감" : `디버거 실패(${res?.error || "응답 없음"})`}, 포커스 ${describe(document.activeElement)}`);
    return null;
  }

  function banner(text) {
    const d = document.createElement("div");
    d.textContent = text;
    Object.assign(d.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647, maxWidth: "360px",
      background: "#222", color: "#fff", padding: "10px 14px", font: "13px/1.5 sans-serif", borderRadius: "2px",
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 15000);
  }

  const squash = (s) => (s || "").replace(/[\s+]/g, "");
  const visible = (el) => el && el.offsetParent !== null;
  const outsideBody = (el) => !el.closest(".se-main-container, .se-documentTitle");
  const buttonWith = (text) => [...document.querySelectorAll("button")].find((b) => visible(b) && squash(b.textContent) === text);
  // 실제 클릭처럼 누름(일부 버튼은 mousedown 에 반응)
  const press = (el) => {
    for (const type of ["mousedown", "mouseup"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    el.click();
  };
  const key = (el, k, code) => {
    for (const type of ["keydown", "keypress", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, keyCode: code, which: code, bubbles: true }));
  };
  const setInput = (el, value) => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    key(el, "Process", 229); // 한글 입력 중 키 이벤트를 듣는 자동완성용
  };

  // 결과 목록의 '+ 추가'(이미 고른 항목은 체크 표시라 제외)
  const addButton = () =>
    [...document.querySelectorAll("button")].find((b) => visible(b) && outsideBody(b) && squash(b.textContent) === "추가" && !b.querySelector("[class*='check']"));
  // 자동완성 목록에서 이름이 같은 항목(가장 안쪽 요소)
  const suggestion = (name) =>
    [...document.querySelectorAll("li, a, button, span, div")]
      .filter((el) => visible(el) && outsideBody(el) && el.tagName !== "INPUT" && squash(el.textContent) === squash(name))
      .sort((x, y) => x.querySelectorAll("*").length - y.querySelectorAll("*").length)[0];

  // 실제 클릭(디버거). 안 되면 스크립트 클릭으로 대신한다.
  async function tap(el) {
    const r = await realInput([{ click: pointOf(el) }, { wait: 300 }]);
    if (!r?.ok) press(el);
  }

  /** 툴바 '장소' → 이름 검색 → 첫 결과 '추가' → '확인'. 실패하면 멈춘 단계를 돌려준다. */
  async function addPlace(name) {
    const open = document.querySelector("button.se-map-toolbar-button") || buttonWith("장소");
    if (!open) return "툴바의 장소 버튼을 찾지 못함";
    await tap(open);
    const input = await waitFor(() => [...document.querySelectorAll('input[placeholder*="장소"]')].find(visible), 6000);
    if (!input) return "장소 창이 열리지 않음";
    // 검색창 클릭 → 이름 입력 → Enter 를 실제 입력으로
    const r = await realInput([{ click: pointOf(input) }, { wait: 200 }, { text: name }, { wait: 300 }, { key: "Enter" }, { wait: 300 }]);
    if (!r?.ok) {
      setInput(input, name);
      key(input, "Enter", 13);
    }
    let add = await waitFor(addButton, 3000);
    if (!add) {
      // Enter 로 검색이 안 되면 자동완성 목록의 같은 이름을 누른다
      const s = await waitFor(() => suggestion(name), 4000);
      log("자동완성", s?.tagName, s?.className);
      if (s) await tap(s);
      add = await waitFor(addButton, 6000);
    }
    if (!add) return `"${name}" 검색 결과가 나오지 않음`;
    await tap(add);
    const ok = await waitFor(() => {
      const b = buttonWith("확인");
      return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
    }, 5000);
    if (!ok) return "확인 버튼이 켜지지 않음";
    await tap(ok);
    await sleep(800);
    return [...document.querySelectorAll('input[placeholder*="장소"]')].some(visible) ? "확인 후에도 창이 닫히지 않음" : "ok";
  }

  // '작성 중인 글이 있습니다' 같은 팝업이 떠 있으면 사용자가 고를 때까지 기다린다
  const popupOpen = () => !!document.querySelector(".se-popup-dim, .se-popup-container");

  async function run() {
    const titleEl = await waitFor(() => document.querySelector(TITLE_SEL), 30000);
    if (!titleEl) return; // 글쓰기 에디터가 없는 프레임
    // 앱이 탭을 먼저 열고 이미지를 준비한 뒤 보내므로, 보관본이 들어올 때까지 잠시 기다린다
    const fresh = async () => {
      const { bbologPending: v } = await chrome.storage.local.get("bbologPending");
      return v && Date.now() - v.at <= MAX_AGE ? v : null;
    };
    let p = await fresh();
    for (let i = 0; !p && i < 75; i++) {
      await sleep(400);
      p = await fresh();
    }
    if (!p) return;

    await waitFor(() => !popupOpen(), 120000);
    // 다른 프레임이 먼저 처리했는지 다시 확인하고 바로 지운다(중복 방지)
    const again = await chrome.storage.local.get("bbologPending");
    if (!again.bbologPending || again.bbologPending.at !== p.at) return;
    await chrome.storage.local.remove("bbologPending");

    try {
      const titleHow = await fill(document.querySelector(TITLE_SEL), { "text/plain": p.title }, () => textOf(TITLE_SEL).length > 0, "제목");
      log("제목", titleHow ?? "실패");
      const bodyEl = await waitFor(bodyParagraph, 10000);
      if (!bodyEl) throw new Error("본문 칸을 찾지 못함");
      // 빈 본문 칸의 안내 문구 길이만큼은 빼고 늘었는지 본다
      const before = textOf(".se-main-container").length;
      const bodyHow = await fill(bodyEl, { "text/html": p.html, "text/plain": p.plainText }, () => textOf(".se-main-container").length > before + 20, "본문");
      log("본문", bodyHow ?? "실패");
      const filled = !!bodyHow;
      // 본문을 넣은 뒤 커서가 글 끝에 있으므로 장소(지도)가 맨 아래에 들어간다
      const placed = !filled ? null : p.place ? await addPlace(p.place).catch((e) => `오류 ${e?.message || e}`) : "skip";
      log("장소", placed);
      const placeNote =
        placed === "ok" ? " 장소(지도)도 넣었습니다."
        : placed === "skip" ? " (지도는 블로그 설정의 '지도에 넣을 장소'가 비어 있어 건너뜀)"
        : placed ? ` 장소(지도) 자동 추가 실패: ${placed}. 툴바 '장소'에서 직접 넣어 주세요.` : "";
      banner(
        filled
          ? `뚝딱: 제목/본문/이미지를 넣었습니다.${placeNote} 확인 후 발행해 주세요.`
          : `뚝딱: 자동 입력이 되지 않았습니다. 본문 칸을 클릭하고 붙여넣기(⌘V / Ctrl+V) 하세요. 본문은 이미 복사되어 있습니다. [진단] ${diag.join(" / ") || "없음"}`,
      );
    } catch (e) {
      log("오류", e);
      diag.push(String(e?.message || e));
      banner(`뚝딱: 자동 입력이 되지 않았습니다. 본문 칸을 클릭하고 붙여넣기(⌘V / Ctrl+V) 하세요. 본문은 이미 복사되어 있습니다. [진단] ${diag.join(" / ")}`);
    }
  }

  run();
})();
