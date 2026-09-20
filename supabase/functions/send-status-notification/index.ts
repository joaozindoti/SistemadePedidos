// supabase/functions/send-status-notification/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;

// TODO: trocar pela chave Pix real do cliente assim que ele passar.
const PIX_KEY = "SUA_CHAVE_PIX_AQUI";

interface StatusPayload {
  order_id: string;
  status: string;
  order_type: "entrega" | "retirada";
  estimated_minutes: number | null;
  customer_id: string;
}

interface OrderItemRow {
  quantity: number;
  menu_item: { name: string } | { name: string }[] | null;
  crust: { name: string } | { name: string }[] | null;
  order_item_flavors: { flavor: { name: string } | { name: string }[] | null }[];
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatOrderItemsList(items: OrderItemRow[]): string {
  return items
    .map((item) => {
      const menuItemName = one(item.menu_item)?.name ?? "Item";
      const flavorNames = item.order_item_flavors
        .map((f) => one(f.flavor)?.name)
        .filter(Boolean)
        .join(" + ");
      const crustName = one(item.crust)?.name;

      let line = `${item.quantity}x ${menuItemName}`;
      if (flavorNames) line += ` (${flavorNames})`;
      if (crustName) line += ` - Com ${crustName}`;
      return line;
    })
    .join("\n");
}

function paymentLine(paymentMethod: string): string {
  if (paymentMethod === "pix") {
    return `Pagamento via Pix: chave ${PIX_KEY} (envie o comprovante aqui no WhatsApp)`;
  }
  if (paymentMethod === "cartao") {
    return "Pagamento no cartão, na entrega ou na retirada.";
  }
  if (paymentMethod === "dinheiro") {
    return "Pagamento em dinheiro, na entrega ou na retirada.";
  }
  return "";
}

async function buildMessage(
  supabase: ReturnType<typeof createClient>,
  payload: StatusPayload,
): Promise<string | null> {
  if (payload.status === "preparo") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        total, payment_method,
        order_items (
          quantity,
          menu_item:menu_items ( name ),
          crust:crusts ( name ),
          order_item_flavors ( flavor:flavors ( name ) )
        )
      `,
      )
      .eq("id", payload.order_id)
      .single();

    if (orderError || !order) {
      console.error("Falha ao buscar itens do pedido:", orderError);
      const tempo = payload.estimated_minutes
        ? ` Tempo estimado: ${payload.estimated_minutes} min.`
        : "";
      return `Seu pedido foi confirmado e está sendo preparado!${tempo}`;
    }

    const itemsList = formatOrderItemsList(
      (order.order_items ?? []) as unknown as OrderItemRow[],
    );
    const pagamento = paymentLine(order.payment_method as string);

    const lines = ["Seu pedido foi confirmado e está sendo preparado!"];
    if (payload.estimated_minutes) {
      lines.push(`Tempo estimado: ${payload.estimated_minutes} min`);
    }
    lines.push("", itemsList, "", `Total: ${formatBRL(Number(order.total))}`);
    if (pagamento) lines.push(pagamento);

    return lines.join("\n");
  }

  if (payload.status === "pronto") {
    if (payload.order_type === "entrega") {
      const tempo = payload.estimated_minutes
        ? ` Chega em aproximadamente ${payload.estimated_minutes} min.`
        : "";
      return `Seu pedido já saiu para entrega!${tempo}`;
    }
    return "Seu pedido está pronto! Já pode vir buscar.";
  }

  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: expectedSecret } = await supabase.rpc("get_status_webhook_secret");
  if (!expectedSecret || req.headers.get("x-webhook-secret") !== expectedSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: StatusPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const message = await buildMessage(supabase, payload);
  if (!message) {
    return new Response("ok", { status: 200 });
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("phone")
    .eq("id", payload.customer_id)
    .single();

  if (customerError) {
    console.error("Falha ao buscar telefone do cliente:", customerError);
    return new Response("ok", { status: 200 });
  }

  if (!customer?.phone) {
    return new Response("ok", { status: 200 });
  }

  const evolutionResponse = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ number: customer.phone, text: message }),
    },
  );

  if (!evolutionResponse.ok) {
    const errorBody = await evolutionResponse.text();
    console.error(
      `Evolution API retornou ${evolutionResponse.status}:`,
      errorBody,
    );
  }

  return new Response("ok", { status: 200 });
});
