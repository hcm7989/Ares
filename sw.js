/* DIP ALERT 서비스워커 (v3)
   중요: 실시간 데이터(주가·VIX·국채·공포탐욕·구글시트·프록시)는 절대 캐시하지 않습니다.
        오직 앱 화면(HTML)과 정적 자원(차트 라이브러리·폰트·아이콘)만 캐시합니다.
   - HTML: 네트워크 우선(network-first) → 업로드하면 앱 재실행 시 최신 반영, 오프라인이면 마지막 버전.
   - 라이브러리/폰트/아이콘: 캐시 우선(빠르게).
   - 그 외 모든 요청(API·시트·프록시): 서비스워커가 개입하지 않음 → 항상 최신 네트워크. */
const CACHE = "dipalert-cache-v3";

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");
  const sameOrigin = url.origin === self.location.origin;

  // 1) 앱 화면(HTML): 네트워크 우선 → 실패 시 캐시
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((x) => x.put(req, c)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // 2) 정적 라이브러리·폰트(CDN) + 같은 출처 이미지/폰트(아이콘 등): 캐시 우선
  const isLib = url.hostname === "cdnjs.cloudflare.com" || url.hostname === "cdn.jsdelivr.net";
  const isStaticAsset = sameOrigin && /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname);
  if (isLib || isStaticAsset) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then((x) => x.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // 3) 그 외(모든 실시간 데이터·API·구글시트·프록시): 개입하지 않음 → 항상 네트워크에서 최신
  return;
});
