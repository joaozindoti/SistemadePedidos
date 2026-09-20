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
    background_color: "#131315",
    theme_color: "#ffd56d",
    icons: [
      {
        src: "/admin/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/admin/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

export async function GET() {
  return Response.json(manifest(), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
