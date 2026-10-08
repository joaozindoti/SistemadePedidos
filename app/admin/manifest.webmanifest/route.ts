import type { MetadataRoute } from "next";

// Next.js só trata `manifest.ts` como convenção especial quando ele fica na
// raiz do app router (app/manifest.ts) — nesse nível ele viraria /manifest.webmanifest
// para o site inteiro. Como o manifesto precisa ficar restrito a /admin, ele é
// servido aqui como uma Route Handler comum, e referenciado explicitamente pelo
// campo `metadata.manifest` em app/admin/layout.tsx.
function manifest(): MetadataRoute.Manifest {
  return {
    name: "Painel Sidney & Shirley",
    short_name: "Pedidos",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#0e0e10",
    theme_color: "#0e0e10",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

export async function GET() {
  return Response.json(manifest(), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
