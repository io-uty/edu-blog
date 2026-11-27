// 네이버 블로그 글쓰기(스마트에디터 ONE) 화면에서 실행:
// 보관된 글이 있으면 제목·본문 칸에 붙여넣기 이벤트로 넣고, 보관본을 지운다.
(() => {
  const MAX_AGE = 5 * 60 * 1000; // 5분 안에 연 글쓰기 화면에만 넣는다
  const TITLE_SEL = ".se-documentTitle .se-text-paragraph, .se-title-text .se-text-paragraph";
  // 본문 문단. 제목 칸도 같은 클래스(.se-text-paragraph)를 써서 제목 영역은 뺀다
  const bodyParagraph = () =>
    bodyParagraphs()[0];

  const bodyParagraphs = () => [...document.querySelectorAll(".se-text-paragraph")].filter((el) => !el.closest(".se-documentTitle, .se-title-text"));

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
  function pointOf(el, where = "start") {
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    let x = where === "end" ? r.right - 2 : r.left + Math.min(r.width / 2, 40);
    let y = where === "end" ? r.bottom - 6 : r.top + Math.min(r.height / 2, 12); // 여러 줄 문단은 첫 줄(시작) / 마지막 줄(끝)
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
    // 네이버가 붙여넣은 내용을 반영하는 데 몇 초 걸릴 수 있어 더 기다린다(성급히 또 붙여 중복되는 것도 막음)
    if (done() || (await waitFor(done, 8000))) return "실제 입력";
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
  const outsideBody = (el) => !el.closest(".se-main-container, .se-component, .se-documentTitle");
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

  // ---------- 이미지: 본문의 [[뚝딱 이미지 n]] 자리마다 PNG 를 클립보드에 넣고 실제 ⌘V ----------
  const tokenParagraph = (token) => bodyParagraphs().find((p) => p.textContent.includes(token));
  const imageCount = () => document.querySelectorAll(".se-component.se-image, .se-image-resource").length;

  async function putImage({ token, dataUrl }) {
    const para = tokenParagraph(token);
    if (!para) return "자리 표시 없음";
    const blob = await (await fetch(dataUrl)).blob();
    // 자리 표시 문단을 선택한 뒤(세 번 클릭) 이미지를 붙여 넣는다
    const sel = await realInput([{ click: pointOf(para), count: 3 }, { wait: 300 }]);
    if (!sel?.ok) return `선택 실패(${sel?.error || "응답 없음"})`;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (e) {
      return `클립보드 실패(${e?.message || e})`;
    }
    const before = imageCount();
    await realInput([{ paste: true }, { wait: 500 }]);
    const ok = await waitFor(() => imageCount() > before, 15000); // 네이버가 사진을 올리는 동안 기다림
    // 남은 자리 표시 글자 지우기
    const left = tokenParagraph(token);
    if (left) await realInput([{ click: pointOf(left), count: 3 }, { wait: 200 }, { key: "Backspace" }, { wait: 300 }]);
    return ok ? "ok" : "붙여넣었지만 사진이 올라가지 않음";
  }

  async function putImages(list) {
    const fails = [];
    for (const it of list || []) {
      const r = await putImage(it).catch((e) => `오류 ${e?.message || e}`);
      log("이미지", it.token, r);
      if (r !== "ok") fails.push(`${it.token.replace(/\[|\]/g, "")}: ${r}`);
    }
    return fails;
  }

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

  // '작성 중인 글이 있습니다(이어서 작성할까요?)' 창이 떠 있으면 사용자가 고를 때까지 기다린다.
  // 고르는 결과(임시 저장 글 불러오기/버리기)가 사용자 글에 영향을 주므로 대신 누르지 않는다.
  // 창 모양(클래스)이 바뀔 수 있어 창에 쓰인 글자로 알아본다.
  const DRAFT_POPUP = /작성 중인 글|이어서 작성|임시 ?저장된 글/;
  const popupOpen = () => {
    const docs = [document];
    try {
      if (window.top && window.top.document !== document) docs.push(window.top.document);
    } catch {
      /* 다른 출처 프레임은 건너뜀 */
    }
    return docs.some(
      (d) => [...d.querySelectorAll(".se-popup-dim, .se-popup-container")].some(visible) || DRAFT_POPUP.test(d.body?.innerText || ""),
    );
  };

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

    // 창은 에디터가 뜬 뒤 조금 늦게 나타나므로 잠깐 기다렸다가 확인한다
    await sleep(1500);
    if (popupOpen()) {
      banner("뚝딱: '작성 중인 글' 창에서 이어 쓸지 새로 쓸지 골라 주세요. 고르면 바로 제목/본문/이미지를 넣습니다.");
      await waitFor(() => !popupOpen(), 300000);
      await sleep(1000);
    }
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
      // 본문 글자 수·문단 수 어느 쪽이든 늘면 들어간 것으로 본다(선택자가 하나라도 빗나가도 되도록 전체를 센다)
      const bodySize = () => bodyParagraphs().reduce((n, c) => n + (c.innerText || "").length, 0);
      const paraCount = () => bodyParagraphs().length;
      const before = bodySize(), beforeParas = paraCount();
      const bodyHow = await fill(bodyEl, { "text/html": p.html, "text/plain": p.plainText }, () => bodySize() > before + 20 || paraCount() > beforeParas + 2, "본문");
      diag.push(`글자 ${before}→${bodySize()}, 문단 ${beforeParas}→${paraCount()}, 이미지 ${p.images?.length ?? 0}장, 자리표시 ${(p.html.match(/\[\[뚝딱 이미지/g) || []).length}개`);
      log("본문", bodyHow ?? "실패");
      // 확인 방식이 틀려도 이미지 자리 표시가 본문에 보이면 들어간 것으로 본다
      const filled = !!bodyHow || !!(p.images?.length && tokenParagraph(p.images[0].token));
      const imageFails = filled && p.images?.length ? await putImages(p.images) : [];
      // 장소(지도)는 글 끝에: 마지막 문단 끝을 눌러 커서를 옮긴 뒤 넣는다
      const lastPara = bodyParagraphs().pop();
      if (filled && p.place && lastPara) await realInput([{ click: pointOf(lastPara, "end") }, { wait: 300 }]);
      const placed = !filled ? null : p.place ? await addPlace(p.place).catch((e) => `오류 ${e?.message || e}`) : "skip";
      log("장소", placed);
      const placeNote =
        placed === "ok" ? " 장소(지도)도 넣었습니다."
        : placed === "skip" ? " (지도는 블로그 설정의 '지도에 넣을 장소'가 비어 있어 건너뜀)"
        : placed ? ` 장소(지도) 자동 추가 실패: ${placed}. 툴바 '장소'에서 직접 넣어 주세요.` : "";
      banner(
        filled
          ? `뚝딱: 제목/본문${imageFails.length || !p.images?.length ? "" : "/이미지"}를 넣었습니다.${p.images?.length ? "" : " (보낸 이미지가 0장입니다)"}${imageFails.length ? ` 이미지 ${imageFails.length}장은 직접 넣어 주세요(본문의 [[뚝딱 이미지 n]] 자리, 이미지는 뚝딱에서 내려받기). [진단] ${imageFails.join(" / ")}.` : ""}${placeNote} 확인 후 발행해 주세요.`
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
