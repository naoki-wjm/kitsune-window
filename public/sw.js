/**
 * Service Worker — 狐の窓
 *
 * キャッシュ戦略:
 *   - エンジン（JS/CSS）: install 時にプリキャッシュ
 *   - キャラ素材・シナリオ: ネットワーク優先、フォールバックでキャッシュ
 *   - 外部CDN（Cubism Core等）: キャッシュ優先
 */

const CACHE_NAME = 'kitsune-v2';

// install: 最低限のシェルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/manifest.webmanifest',
      ])
    )
  );
  self.skipWaiting();
});

// activate: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// fetch: ネットワーク優先、失敗時キャッシュ
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST 等はスルー
  if (request.method !== 'GET') return;

  // manifest リクエストをワールド別にリダイレクト
  const url = new URL(request.url);
  if (url.pathname === '/manifest.webmanifest' && request.referrer) {
    try {
      const referrer = new URL(request.referrer);
      const world = referrer.searchParams.get('world');
      if (world) {
        event.respondWith(fetch(`/manifest-${world}.json`));
        return;
      }
    } catch (e) { /* referrer パース失敗時はフォールスルー */ }
  }

  // ナビゲーション（HTML）はネットワーク優先
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 静的アセット（JS/CSS/画像）: ネットワーク優先 + キャッシュ保存
  event.respondWith(
    fetch(request)
      .then((res) => {
        // 成功したらキャッシュに保存
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
