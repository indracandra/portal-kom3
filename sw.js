const CACHE_NAME = "kom3-pwa-v1.9";
const CORE = ["./", "./index.html", "./style.css?v=1.9", "./app.js?v=1.9", "./assets/logo.jpg", "./manifest.json?v=1.9"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("kom3-pwa-") && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(c=>c.put("./index.html",copy)); return response; }).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(fetch(request).then(response => { if(response && response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(request,copy));} return response; }).catch(()=>caches.match(request)));
});
