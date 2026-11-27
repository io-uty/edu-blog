// bbolog 앱 페이지에서 실행: 앱이 보낸 글을 확장 저장소에 잠시 보관하고, 네이버 글쓰기를 화면 오른쪽 절반에 연다.
// 설치·업데이트 때 background.js 가 다시 넣을 수 있으므로 한 페이지에 한 번만 붙는다.
if (!window.__bbologBridge) {
  window.__bbologBridge = true;
  document.documentElement.dataset.bbologExtension = "1";
  window.postMessage({ source: "bbolog-extension", type: "ready" }, window.location.origin);

  const reply = (type) => window.postMessage({ source: "bbolog-extension", type }, window.location.origin);

  window.addEventListener("message", async (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || m.source !== "bbolog-app" || m.type !== "handoff" || !m.payload) return;
    const { title, html, plainText, place } = m.payload;
    if (typeof title !== "string" || typeof html !== "string") return;
    try {
      await chrome.storage.local.set({
        bbologPending: { title, html, plainText: plainText || "", place: typeof place === "string" ? place.slice(0, 100) : "", at: Date.now() },
      });
      const s = m.screen;
      const ok = s && [s.left, s.top, s.width, s.height].every(Number.isFinite);
      await chrome.runtime.sendMessage({ type: "openSplit", screen: ok ? s : null });
      reply("stored");
    } catch {
      reply("failed"); // 확장이 업데이트돼 이 스크립트가 끊긴 경우 등: 앱이 새 탭으로 대신 연다
    }
  });
}
