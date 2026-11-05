import { connection } from "next/server";
import { fetchLojaStatus } from "@/lib/loja";
import { createAnonClient } from "./anonClient";
import { fetchMenu, type PedidoInitialData } from "./menuData";
import PedidoFlow from "./PedidoFlow";

// Cardápio e horário vêm prontos no HTML. Se algo falhar aqui, o PedidoFlow
// busca de novo no navegador, como antes.
async function loadInitialData(): Promise<PedidoInitialData> {
  // Cliente anônimo e sem sessão: só lê o que a RLS libera ao público.
  const supabase = createAnonClient();
  if (!supabase) return { menu: null, loja: null };

  try {
    const [menu, loja] = await Promise.all([fetchMenu(supabase), fetchLojaStatus(supabase)]);
    return { menu, loja };
  } catch (err) {
    console.error("Falha ao carregar o cardápio no servidor:", err);
    return { menu: null, loja: null };
  }
}

export default async function PedidoPage() {
  // Cardápio, esgotados e horário mudam a qualquer hora: nada de prerender.
  await connection();
  const initialData = await loadInitialData();
  return <PedidoFlow initialData={initialData} />;
}
