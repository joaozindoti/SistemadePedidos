import type { NextConfig } from "next";

// Nenhuma página do app é feita para rodar dentro de iframe (a comanda imprime
// com window.print() na própria página), então bloquear o embed não quebra nada.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Fotos do cardápio enviadas pelo painel ficam no Storage do Supabase.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/cardapio/**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
