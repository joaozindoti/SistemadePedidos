import type { SupabaseClient } from "@supabase/supabase-js";

// Horário de funcionamento (tabela loja_config + função loja_aberta no
// banco). A regra de verdade roda no banco — aqui só se lê o resultado,
// pra não ter dois relógios discordando. Sem React aqui: o cardápio também
// lê isto no servidor (app/pedido/page.tsx).

export type ModoLoja = "auto" | "aberta" | "fechada";

export interface LojaConfig {
  abre_as: string; // "18:00:00"
  fecha_as: string; // "23:00:00"
  modo: ModoLoja;
}

export interface LojaStatus {
  aberta: boolean;
  config: LojaConfig | null;
}

// "18:00:00" → "18h", "18:30:00" → "18h30"
export function formatHora(time: string): string {
  const [h, m] = time.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

export async function fetchLojaStatus(supabase: SupabaseClient): Promise<LojaStatus | null> {
  const [abertaRes, configRes] = await Promise.all([
    supabase.rpc("loja_aberta"),
    supabase.from("loja_config").select("abre_as, fecha_as, modo").eq("id", 1).maybeSingle(),
  ]);
  if (abertaRes.error) return null;
  return {
    aberta: abertaRes.data !== false,
    config: (configRes.data as LojaConfig | null) ?? null,
  };
}
