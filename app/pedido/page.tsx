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

// QR Code da mesa abre /pedido?mesa=5: o pedido já vem como "comer aqui"
// nessa mesa. Só letras, números e espaço, até 20 caracteres.
function parseMesa(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clean = (value ?? "").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 20);
  return clean || null;
}

export default async function PedidoPage(props: PageProps<"/pedido">) {
  // Cardápio, esgotados e horário mudam a qualquer hora: nada de prerender.
  await connection();
  const [initialData, searchParams] = await Promise.all([loadInitialData(), props.searchParams]);
  return <PedidoFlow initialData={initialData} mesaInicial={parseMesa(searchParams.mesa)} />;
}
