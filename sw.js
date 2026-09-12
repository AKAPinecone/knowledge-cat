/* =========================================================
 * 知识喂了猫 · Service Worker（离线可玩 + 秒开）
 *
 * 策略：
 * - 静态资源（页面/样式/脚本/图标）cache-first，装过一次断网也能玩
 * - 版本号 CACHE 升一位即全量换新缓存（发新版记得 bump）
 * - 只拦本站 GET；云端 API 是跨域请求，天然不受影响，联网失败自动降级本地模式
 * ========================================================= */
var CACHE = 'knowledge-cat-v11';
var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/sync.js',
  './js/qbank.js',
  './js/game.js',
  './js/study.js',
  './js/app.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './assets/audio/morning-dew.mp3',
  './assets/audio/summer-night.mp3',
  './assets/audio/cheer.mp3',
  './assets/creatures/baifujinji.webp',
  './assets/creatures/baochunhua.webp',
  './assets/creatures/daxiongmao.webp',
  './assets/creatures/diyongjinlian.webp',
  './assets/creatures/dianjinsihou.webp',
  './assets/creatures/ganbajun.webp',
  './assets/creatures/gaoshandujuan.webp',
  './assets/creatures/haicaihua.webp',
  './assets/creatures/heimeijinshe.webp',
  './assets/creatures/honggu.webp',
  './assets/creatures/hongluoyouyuan.webp',
  './assets/creatures/hudielan.webp',
  './assets/creatures/huercao.webp',
  './assets/creatures/huoyanhua.webp',
  './assets/creatures/jizongjun.webp',
  './assets/creatures/jianshouqing.webp',
  './assets/creatures/lvkongque.webp',
  './assets/creatures/meiveiniuganjun.webp',
  './assets/creatures/naijiangjun.webp',
  './assets/creatures/qingtoujun.webp',
  './assets/creatures/qiuhuashihu.webp',
  './assets/creatures/shanhujun.webp',
  './assets/creatures/shuangjiaoxiniao.webp',
  './assets/creatures/songrong.webp',
  './assets/creatures/xiaoxiongmao.webp',
  './assets/creatures/yazhouxiang.webp',
  './assets/creatures/yunnanbikegui.webp',
  './assets/creatures/yunnanchahua.webp',
  './assets/creatures/yunnanhanxiao.webp',
  './assets/creatures/zhusun.webp',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 逐个装、单个失败不拖垮整个安装 */
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function (err) {
          console.warn('[sw] 预缓存失败（跳过）:', u, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k !== CACHE ? caches.delete(k) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* 云端 API / CDN 不拦 */

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        /* 断网且没缓存：导航请求回退到缓存的首页 */
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function (idx) {
            return idx || new Response('离线且尚未缓存', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
          });
        }
        return new Response('', { status: 508 });
      });
    })
  );
});
