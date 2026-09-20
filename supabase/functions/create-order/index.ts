// supabase/functions/create-order/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface OrderItemInput {
  menu_item_id: string;
  flavor_ids?: string[];
  crust_id?: string;
  quantity: number;
  item_notes?: string;
}

interface CreateOrderBody {
  name: string;
  phone: string;
  order_type: "entrega" | "retirada";
  address?: string;
  payment_method: "dinheiro" | "cartao" | "pix";
  notes?: string;
  items: OrderItemInput[];
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: CreateOrderBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  if (!body.name || !body.phone) {
    return jsonResponse({ error: "Nome e telefone são obrigatórios" }, 400);
  }

  const phone = normalizePhone(body.phone);
  if (phone.length < 10) {
    return jsonResponse({ error: "Telefone inválido" }, 400);
  }

  if (!body.items || body.items.length === 0) {
    return jsonResponse({ error: "Carrinho vazio" }, 400);
  }

  if (body.order_type === "entrega" && !body.address) {
    return jsonResponse({ error: "Endereço obrigatório para entrega" }, 400);
  }

  if (!["dinheiro", "cartao", "pix"].includes(body.payment_method)) {
    return jsonResponse({ error: "Forma de pagamento inválida" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .upsert(
      { phone, name: body.name, address: body.address ?? undefined },
      { onConflict: "phone" },
    )
    .select("id")
    .single();

  if (customerError || !customer) {
    return jsonResponse({ error: "Falha ao registrar cliente" }, 500);
  }

  const menuItemIds = body.items.map((i) => i.menu_item_id);
  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select("id, base_price, active, max_flavors")
    .in("id", menuItemIds);

  if (menuError || !menuItems) {
    return jsonResponse({ error: "Falha ao validar cardápio" }, 500);
  }

  const allFlavorIds = [
    ...new Set(body.items.flatMap((i) => i.flavor_ids ?? [])),
  ];
  const crustIds = [...new Set(body.items.map((i) => i.crust_id).filter(Boolean))] as string[];

  const { data: flavors } = allFlavorIds.length
    ? await supabase.from("flavors").select("id, extra_price, active").in("id", allFlavorIds)
    : { data: [] as { id: string; extra_price: number; active: boolean }[] };

  const { data: crusts } = crustIds.length
    ? await supabase.from("crusts").select("id, extra_price, active").in("id", crustIds)
    : { data: [] as { id: string; extra_price: number; active: boolean }[] };

  let total = 0;
  const orderItemsToInsert: Array<{
    menu_item_id: string;
    crust_id?: string;
    quantity: number;
    unit_price: number;
    item_notes?: string;
    flavor_ids: string[];
  }> = [];

  for (const item of body.items) {
    const menuItem = menuItems.find((m) => m.id === item.menu_item_id);
    if (!menuItem || !menuItem.active) {
      return jsonResponse({ error: `Item indisponível: ${item.menu_item_id}` }, 400);
    }

    const flavorIds = item.flavor_ids ?? [];

    if (menuItem.max_flavors !== null && flavorIds.length > 0) {
      if (flavorIds.length > menuItem.max_flavors) {
        return jsonResponse(
          { error: `Esse tamanho aceita no máximo ${menuItem.max_flavors} sabor(es)` },
          400,
        );
      }
    }

    let unitPrice = Number(menuItem.base_price);
    let maxFlavorExtra = 0;

    for (const flavorId of flavorIds) {
      const flavor = flavors?.find((f) => f.id === flavorId);
      if (!flavor || !flavor.active) {
        return jsonResponse({ error: "Sabor indisponível" }, 400);
      }
      maxFlavorExtra = Math.max(maxFlavorExtra, Number(flavor.extra_price));
    }
    unitPrice += maxFlavorExtra;

    if (item.crust_id) {
      const crust = crusts?.find((c) => c.id === item.crust_id);
      if (!crust || !crust.active) {
        return jsonResponse({ error: "Borda indisponível" }, 400);
      }
      unitPrice += Number(crust.extra_price);
    }

    const quantity = Math.max(1, Math.floor(item.quantity || 1));
    total += unitPrice * quantity;

    orderItemsToInsert.push({
      menu_item_id: item.menu_item_id,
      crust_id: item.crust_id,
      quantity,
      unit_price: unitPrice,
      item_notes: item.item_notes,
      flavor_ids: flavorIds,
    });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      order_type: body.order_type,
      payment_method: body.payment_method,
      notes: body.notes ?? null,
      total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return jsonResponse({ error: "Falha ao criar pedido" }, 500);
  }

  for (const item of orderItemsToInsert) {
    const { data: insertedItem, error: itemError } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        menu_item_id: item.menu_item_id,
        crust_id: item.crust_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        item_notes: item.item_notes,
      })
      .select("id")
      .single();

    if (itemError || !insertedItem) {
      await supabase.from("orders").delete().eq("id", order.id);
      return jsonResponse({ error: "Falha ao gravar itens do pedido" }, 500);
    }

    if (item.flavor_ids.length > 0) {
      const flavorRows = item.flavor_ids.map((flavor_id) => ({
        order_item_id: insertedItem.id,
        flavor_id,
      }));
      const { error: flavorError } = await supabase
        .from("order_item_flavors")
        .insert(flavorRows);

      if (flavorError) {
        await supabase.from("orders").delete().eq("id", order.id);
        return jsonResponse({ error: "Falha ao gravar sabores do pedido" }, 500);
      }
    }
  }

  return jsonResponse({ order_id: order.id, total }, 200);
});
