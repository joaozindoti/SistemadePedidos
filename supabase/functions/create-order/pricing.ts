// supabase/functions/create-order/pricing.ts
// Regras do cardápio e cálculo do total a partir das linhas que o
// create-order buscou no banco. Puro, para dar pra testar com `deno test`.
import type { OrderItemInput } from "./validation.ts";

export interface MenuItemRow {
  id: string;
  name: string;
  category: string;
  base_price: number | string;
  active: boolean;
  max_flavors: number | null;
}

export interface ExtraRow {
  id: string;
  name: string;
  extra_price: number | string;
  active: boolean;
}

export type UnavailableCode = "item_indisponivel" | "sabor_indisponivel" | "borda_indisponivel";

export interface PricedItem {
  menu_item_id: string;
  crust_id: string | null;
  quantity: number;
  unit_price: number;
  item_notes: string | null;
  flavor_ids: string[];
}

// Erro de item esgotado leva code e ids (contrato com o front, que tira da
// sacola o que veio em ids); erro de regra leva só a mensagem.
export type PricingResult =
  | { ok: true; items: PricedItem[]; totalCents: number }
  | { ok: false; error: string; code?: UnavailableCode; ids?: string[] };

function toCents(value: number | string): number {
  return Math.round(Number(value) * 100);
}

// Junta todos os ids indisponíveis de uma vez, para o cliente não ter que
// descobrir um por tentativa. O nome da mensagem é o do primeiro.
function unavailable(
  ids: string[],
  rows: { id: string; name: string; active: boolean }[],
  code: UnavailableCode,
): PricingResult | null {
  const missing = [...new Set(ids)].filter((id) => !rows.find((r) => r.id === id && r.active));
  if (missing.length === 0) return null;

  const name = rows.find((r) => r.id === missing[0])?.name ?? null;
  const outros = missing.length - 1;
  let error: string;
  if (code === "item_indisponivel") {
    const quem = name ?? "Um item do seu pedido";
    error = outros > 0
      ? `${quem} e mais ${outros} ${outros === 1 ? "item" : "itens"} acabaram de esgotar. Tire da sacola e tente de novo.`
      : `${quem} acabou de esgotar. Tire da sacola e tente de novo.`;
  } else if (code === "sabor_indisponivel") {
    const quem = name ? `O sabor ${name}` : "Um sabor escolhido";
    error = outros > 0
      ? `${quem} e mais ${outros} ${outros === 1 ? "sabor" : "sabores"} acabaram de esgotar. Escolha outro e tente de novo.`
      : `${quem} acabou de esgotar. Escolha outro e tente de novo.`;
  } else {
    const quem = name ? `A borda ${name}` : "Uma borda escolhida";
    error = outros > 0
      ? `${quem} e mais ${outros} ${outros === 1 ? "borda" : "bordas"} acabaram de esgotar. Escolha outra e tente de novo.`
      : `${quem} acabou de esgotar. Escolha outra e tente de novo.`;
  }
  return { ok: false, error, code, ids: missing };
}

export function priceOrder(
  items: OrderItemInput[],
  menuItems: MenuItemRow[],
  flavors: ExtraRow[],
  crusts: ExtraRow[],
): PricingResult {
  const itemEsgotado = unavailable(items.map((i) => i.menu_item_id), menuItems, "item_indisponivel");
  if (itemEsgotado) return itemEsgotado;

  for (const item of items) {
    const menuItem = menuItems.find((m) => m.id === item.menu_item_id)!;
    const flavorIds = item.flavor_ids;
    if (menuItem.category === "pizza") {
      // Tamanho criado sem max_flavors vale como 1 sabor.
      const maxFlavors = menuItem.max_flavors ?? 1;
      if (flavorIds.length === 0) {
        return { ok: false, error: "Escolha pelo menos um sabor para a pizza" };
      }
      if (flavorIds.length > maxFlavors) {
        return { ok: false, error: `Esse tamanho aceita no máximo ${maxFlavors} sabor(es)` };
      }
    } else if (flavorIds.length > 0 || item.crust_id) {
      return { ok: false, error: "Sabor e borda só podem ser escolhidos em pizzas" };
    }
  }

  const saborEsgotado = unavailable(items.flatMap((i) => i.flavor_ids), flavors, "sabor_indisponivel");
  if (saborEsgotado) return saborEsgotado;

  const bordaEsgotada = unavailable(
    items.map((i) => i.crust_id).filter((id): id is string => id !== null),
    crusts,
    "borda_indisponivel",
  );
  if (bordaEsgotada) return bordaEsgotada;

  // Total em centavos pra não acumular erro de ponto flutuante.
  let totalCents = 0;
  const priced: PricedItem[] = [];

  for (const item of items) {
    const menuItem = menuItems.find((m) => m.id === item.menu_item_id)!;
    let unitCents = toCents(menuItem.base_price);

    // Preço especial só quando TODOS os sabores são especiais (com adicional);
    // misturou especial com sabor comum, sai no preço normal do tamanho.
    const extras = item.flavor_ids.map((id) => toCents(flavors.find((f) => f.id === id)!.extra_price));
    const maxFlavorExtraCents = extras.length > 0 && extras.every((c) => c > 0) ? Math.max(...extras) : 0;
    unitCents += maxFlavorExtraCents;

    if (item.crust_id) {
      const crust = crusts.find((c) => c.id === item.crust_id)!;
      unitCents += toCents(crust.extra_price);
    }

    totalCents += unitCents * item.quantity;
    priced.push({
      menu_item_id: item.menu_item_id,
      crust_id: item.crust_id,
      quantity: item.quantity,
      unit_price: unitCents / 100,
      item_notes: item.item_notes,
      flavor_ids: item.flavor_ids,
    });
  }

  return { ok: true, items: priced, totalCents };
}

// Troco tem que ser para um valor igual ou maior que o total.
export function changeError(changeFor: number | null, totalCents: number): string | null {
  if (changeFor === null || Math.round(changeFor * 100) >= totalCents) return null;
  const total = (totalCents / 100).toFixed(2).replace(".", ",");
  return `O troco precisa ser para um valor igual ou maior que o total (${total})`;
}
