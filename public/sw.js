// Service worker mínimo do cardápio — existe só pra habilitar a instalação
// como app (PWA). Não faz cache de nada de propósito: cardápio e preços
// precisam vir sempre atualizados. O painel tem o seu em /admin/sw.js.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
