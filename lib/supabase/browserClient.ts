import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Mantém a sessão entre fechamentos do navegador (cookie de ~400 dias,
        // padrão do @supabase/ssr) e renova o token de acesso automaticamente
        // em segundo plano, sem pedir login de novo no dia a dia da pizzaria.
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}
