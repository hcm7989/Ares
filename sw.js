/* DIP ALERT 서비스워커
   - HTML(앱 화면)은 항상 네트워크에서 최신을 먼저 가져옵니다(network-first).
     → GitHub에 새로 올리면 앱을 다시 열 때 자동으로 최신 버전이 뜹니다. 재설치 불필요.
   - 오프라인이면 마지막으로 받아둔 버전을 보여줍니다.
   - API 키/링크는 localStorage에 저장되므로 캐시와 무관하게 유지됩니다. */
const CACHE = "dipalert-cache-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  if (isHTML) {
    // 최신 우선: 네트워크 → 실패 시 캐시
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // 그 외 정적 자원(폰트/차트 라이브러리 등): 캐시 우선 → 없으면 네트워크 후 캐시
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
