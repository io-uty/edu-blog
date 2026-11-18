// bbolog 앱 페이지에서 실행: 앱이 보낸 글을 확장 저장소에 잠시 보관한다.
document.documentElement.dataset.bbologExtension = "1";
window.postMessage({ source: "bbolog-extension", type: "ready" }, window.location.origin);

window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const m = e.data;
  if (!m || m.source !== "bbolog-app" || m.type !== "handoff" || !m.payload) return;
  const { title, html, plainText } = m.payload;
  if (typeof title !== "string" || typeof html !== "string") return;
  chrome.storage.local.set({ bbologPending: { title, html, plainText: plainText || "", at: Date.now() } });
});
