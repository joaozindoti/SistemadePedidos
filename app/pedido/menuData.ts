import type { SupabaseClient } from "@supabase/supabase-js";
import type { Crust, Flavor, MenuItem } from "@/lib/types";
import type { LojaStatus } from "@/lib/loja";

export interface MenuData {
  menuItems: MenuItem[];
  flavors: Flavor[];
  crusts: Crust[];
}

// O que a página do servidor entrega pronto pro PedidoFlow. Qualquer parte
// pode vir null (falha de rede, env faltando): o cliente busca de novo.
export interface PedidoInitialData {
  menu: MenuData | null;
  loja: LojaStatus | null;
}

// Mesma consulta no servidor (carga inicial) e no navegador (fallback e
// recarga depois de item esgotado). O filtro active=true é obrigatório:
// com sessão de admin no mesmo navegador, a RLS libera também os inativos.
export async function fetchMenu(supabase: SupabaseClient): Promise<MenuData | null> {
  const [menuRes, flavorsRes, crustsRes] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, description, category, base_price, active, max_flavors")
      .eq("active", true)
      .order("base_price", { ascending: true }),
    supabase
      .from("flavors")
      .select("id, name, flavor_type, extra_price, active")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("crusts")
      .select("id, name, extra_price, active")
      .eq("active", true)
      .order("extra_price", { ascending: true }),
  ]);

  if (menuRes.error || flavorsRes.error) return null;

  return {
    menuItems: (menuRes.data ?? []) as MenuItem[],
    flavors: (flavorsRes.data ?? []) as Flavor[],
    // Borda é opcional: se a consulta falhar, o cardápio abre sem ela.
    crusts: crustsRes.error ? [] : ((crustsRes.data ?? []) as Crust[]),
  };
}
