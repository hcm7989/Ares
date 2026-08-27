/* DIP ALERT 서비스워커 (v4)
   중요: 실시간 데이터(주가·VIX·국채·공포탐욕·구글시트·프록시)는 절대 캐시하지 않습니다.
        오직 앱 화면(HTML)과 정적 자원(차트 라이브러리·폰트·아이콘)만 캐시합니다.
   - HTML: 네트워크 우선(network-first, 타임아웃 있음) → 느린 네트워크에서도 오래 기다리지 않고,
     실패/타임아웃 시에만 캐시로 폴백. 성공하면 항상 캐시를 최신으로 갱신.
   - 라이브러리/폰트/아이콘: 캐시 우선(빠르게).
   - 그 외 모든 요청(API·시트·프록시): 서비스워커가 개입하지 않음 → 항상 최신 네트워크. */
const CACHE = "dipalert-cache-v4";
const HTML_TIMEOUT_MS = 4000; // 이 시간 안에 네트워크 응답이 없으면 캐시로 폴백 (무한 대기 방지)

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

  // 1) 앱 화면(HTML): 네트워크 우선 → 타임아웃 시/실패 시 캐시로 폴백
  if (isHTML) {
    e.respondWith(
      (async () => {
        try {
          // 네트워크 요청에 타임아웃을 걸어, 느린/불안정한 연결에서 무한 대기하지 않게 함
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS);
          const res = await fetch(req, { signal: controller.signal });
          clearTimeout(timer);
          const c = res.clone();
          caches.open(CACHE).then((x) => x.put(req, c));
          return res;
        } catch (err) {
          // 실패(오프라인) 또는 타임아웃: 캐시에서 이 요청과 정확히 일치하는 것을 먼저 찾고,
          // 없으면 scope 기준 절대경로로 index.html을 찾는다 (상대경로 오작동 방지).
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallbackUrl = new URL("index.html", self.registration.scope).toString();
          const fb = await caches.match(fallbackUrl);
          if (fb) return fb;
          // 캐시도 없으면 원래 에러를 그대로 던짐(브라우저 기본 오프라인 화면)
          throw err;
        }
      })()
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
