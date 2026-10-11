import type { MetadataRoute } from "next";

// App do cardápio (cliente). O painel/cozinha tem o próprio manifesto em
// /admin/manifest.webmanifest, com escopo /admin — são dois apps separados.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sidney & Shirley Pizzaria",
    short_name: "Sidney & Shirley",
    description: "Peça sua pizza de verdade, assada no forno a lenha.",
    id: "/pedido",
    start_url: "/pedido",
    scope: "/",
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
