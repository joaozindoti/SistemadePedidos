// Service worker mínimo do painel admin — existe só para habilitar o prompt
// de instalação (PWA) no Chrome/Android. Não faz cache de nada de propósito:
// dados de pedido não podem ficar presos num cache desatualizado.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
