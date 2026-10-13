import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente anônimo do cardápio público: nunca lê, guarda nem renova sessão.
// Não usar lib/supabase/browserClient aqui — no tablet da loja o admin está
// logado, e aí o cardápio rodaria (e mandaria o create-order) como admin.
export function createAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Chave própria: nunca encosta na sessão do painel, nem por engano.
      storageKey: "sb-cardapio-anon",
    },
  });
}

// No navegador, um só por página. No servidor, use createAnonClient() por
// requisição.
let browserAnon: SupabaseClient | null = null;
export function anonBrowserClient(): SupabaseClient {
  browserAnon ??= createAnonClient();
  if (!browserAnon) throw new Error("Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)");
  return browserAnon;
}
