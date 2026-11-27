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
    // 최대화·전체화면 상태에서는 크기를 바꿀 수 없어 먼저 일반 창으로 돌린다
    await chrome.windows.update(sender.tab.windowId, { state: "normal" });
    await chrome.windows.update(sender.tab.windowId, left);
    await chrome.windows.create({ url: NAVER_WRITE_URL, type: "normal", focused: true, ...right });
  })()
    .catch(() => chrome.tabs.create({ url: NAVER_WRITE_URL }))
    .finally(() => sendResponse(true));
  return true; // 비동기 응답
});
