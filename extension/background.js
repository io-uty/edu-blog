// 크롬은 설치 전에 열려 있던 탭에는 content script 를 넣지 않는다.
// 설치·업데이트 직후 열린 뚝딱 탭에 브리지를 넣어, 새로고침 없이 "네이버로 한 번에 보내기" 버튼이 켜지게 한다.
chrome.runtime.onInstalled.addListener(async () => {
  const [{ matches, js }] = chrome.runtime.getManifest().content_scripts;
  for (const tab of await chrome.tabs.query({ url: matches })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: js }).catch(() => {});
  }
});

const NAVER_WRITE_URL = "https://blog.naver.com/GoBlogWrite.naver";

// 뚝딱 창은 화면 왼쪽 절반, 네이버 글쓰기 창은 오른쪽 절반. 주소는 여기 고정(페이지가 정하지 않는다).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "openSplit" || !sender.tab) return;
  (async () => {
    const s = msg.screen;
    if (!s) {
      await chrome.tabs.create({ url: NAVER_WRITE_URL, openerTabId: sender.tab.id });
      return;
    }
    const half = Math.floor(s.width / 2);
    const left = { left: s.left, top: s.top, width: half, height: s.height };
    const right = { left: s.left + half, top: s.top, width: s.width - half, height: s.height };
    // 최대화·전체화면 상태에서는 크기를 바꿀 수 없어 먼저 일반 창으로 돌린다.
    // 뚝딱 창을 줄이지 못해도(전체 화면 등) 네이버는 같은 창의 탭이 아니라 오른쪽 새 창으로 연다.
    try {
      const w = await chrome.windows.get(sender.tab.windowId);
      if (w.state !== "normal") {
        await chrome.windows.update(sender.tab.windowId, { state: "normal" });
        await new Promise((r) => setTimeout(r, w.state === "fullscreen" ? 800 : 200)); // 전체 화면 해제 애니메이션
      }
      await chrome.windows.update(sender.tab.windowId, left);
    } catch {
      /* 창 크기 조정 실패는 무시 */
    }
    await chrome.windows.create({ url: NAVER_WRITE_URL, type: "normal", focused: true, ...right });
  })()
    .catch(() => chrome.tabs.create({ url: NAVER_WRITE_URL }))
    .finally(() => sendResponse(true));
  return true; // 비동기 응답
});

// 네이버 에디터는 스크립트가 만든 클릭·붙여넣기를 무시하므로, 크롬 디버거로 실제 클릭·입력·⌘V 를 보낸다.
// 네이버 글쓰기 탭에서 온 요청만 받고, 끝나면 바로 떼어 낸다(그동안 크롬 위쪽에 '디버깅 중' 막대가 잠깐 보임).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "realInput" || !sender.tab?.id || !/^https:\/\/blog\.naver\.com\//.test(sender.url || sender.tab.url || "")) return;
  const target = { tabId: sender.tab.id };
  const cmd = (method, params) => chrome.debugger.sendCommand(target, method, params);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await chrome.debugger.attach(target, "1.3");
    try {
      for (const s of msg.steps || []) {
        if (s.click) {
          const [x, y] = s.click;
          await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
          // count: 3 이면 세 번 눌러 문단 전체 선택
          for (let n = 1; n <= (s.count || 1); n++)
            for (const type of ["mousePressed", "mouseReleased"]) await cmd("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: n });
        }
        if (s.text) await cmd("Input.insertText", { text: s.text });
        if (s.key === "Backspace") {
          const k = { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
          await cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
          await cmd("Input.dispatchKeyEvent", { type: "keyUp", ...k });
        }
        if (s.key === "Enter") {
          const k = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
          await cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
          await cmd("Input.dispatchKeyEvent", { type: "char", ...k, text: "\r" });
          await cmd("Input.dispatchKeyEvent", { type: "keyUp", ...k });
        }
        if (s.paste) {
          const modifiers = msg.mac ? 4 : 2; // ⌘ 또는 Ctrl
          const k = { key: "v", code: "KeyV", windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers };
          await cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k, commands: ["paste"] });
          await cmd("Input.dispatchKeyEvent", { type: "keyUp", ...k });
        }
        if (s.wait) await wait(s.wait);
      }
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
  })()
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // 비동기 응답
});
