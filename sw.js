// 一日の流れ：通信がなくても開けるようにする。作り直すたびに名前（版）が変わり、古い控えは消える。
const CACHE = 'ichinichi-20261008173729';
const SHELL = ['./', 'index.html', 'logic.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ichinichi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !font) return;

  if (font) {
    // 文字の形（フォント）は変わらないので、控えがあればそれを使う
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  // 自分のファイル：通信できれば新しいものを使い、できない・遅いときは前回の控えを出す
  e.respondWith(
    Promise.race([fetch(req), timeout(4000)])
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./')))
  );
});

// プッシュ通知が届いたとき：必ずその場で通知を出す（出さないと、iPad が通知の許可を取り消すことがある）。
// 新しい iPadOS は、この処理を通さずに自分で通知を出す。ここは、それができない環境のための受け口。
self.addEventListener('push', (e) => {
  let n = {};
  try { n = (e.data ? e.data.json() : {}).notification || {}; } catch (err) { n = {}; }
  e.waitUntil(self.registration.showNotification(n.title || '一日の流れ', {
    body: n.body || '', tag: n.tag || undefined, lang: 'ja', data: { url: n.navigate || './' }
  }));
});

// 通知を押したとき：開いているアプリがあれば前に出し、なければ開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
