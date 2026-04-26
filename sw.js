// service worker — minimal: 提供 fetch handler 讓 Chrome 認定為 PWA，可離線快取核心資源
const CACHE='life-tracker-v25';
const ASSETS=['./','./index.html','./app.css','./app.js','./manifest.json','./icon-192.png','./icon-512.png','./icon-192.svg','./icon-512.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('message',e=>{
  if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // 只快取同源 GET
  if(e.request.method!=='GET' || url.origin!==location.origin){ return; }
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise=fetch(e.request).then(res=>{
        if(res && res.status===200){
          const clone=res.clone();
          caches.open(CACHE).then(c=>c.put(e.request, clone)).catch(()=>{});
        }
        return res;
      }).catch(()=>cached);
      return cached || fetchPromise;
    })
  );
});
