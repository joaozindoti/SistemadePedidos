// supabase/functions/send-status-notification/index.ts
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";
import { safeEqual } from "../_shared/secret.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;
const EVOLUTION_TIMEOUT_MS = 8000;

// Chave Pix vem dos secrets da função. PIX_KEY_LABEL é só como a chave aparece
// na mensagem (ex.: telefone formatado); sem ele, mostra a chave crua.
const PIX_KEY = (Deno.env.get("PIX_KEY") ?? "").trim();
const PIX_KEY_LABEL = (Deno.env.get("PIX_KEY_LABEL") ?? "").trim() || PIX_KEY;

interface StatusPayload {
  order_id: string;
  order_number?: number | null;
  customer_name?: string | null;
  status: string;
  order_type: "entrega" | "retirada";
  estimated_minutes: number | null;
  delivery_estimated_minutes: number | null;
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

function paymentLine(paymentMethod: string, total: number, changeFor: number | null): string {
  if (paymentMethod === "pix") {
    if (!PIX_KEY) {
      // Sem chave configurada não dá pra pedir comprovante de nada: a loja
      // combina o Pix pela conversa.
      console.error("PIX_KEY não configurada: mensagem de Pix enviada sem chave");
      return "Pagamento via Pix: a pizzaria vai te passar a chave por aqui.";
    }
    return `Pagamento via Pix: chave ${PIX_KEY_LABEL} (envie o comprovante aqui no WhatsApp)`;
  }
  if (paymentMethod === "cartao") {
    return "Pagamento no cartão, na entrega ou na retirada.";
  }
  if (paymentMethod === "dinheiro") {
    if (changeFor && changeFor > total) {
      return `Pagamento em dinheiro. Troco para ${formatBRL(changeFor)} (levamos ${formatBRL(changeFor - total)} de troco).`;
    }
    return "Pagamento em dinheiro, na entrega ou na retirada.";
  }
  return "";
}

// "Oi, Ana! " quando o trigger mandou o nome do pedido.
function saudacao(payload: StatusPayload): string {
  const nome = payload.customer_name?.trim().split(/\s+/)[0];
  return nome ? `Oi, ${nome}! ` : "";
}

function numeroDoPedido(orderNumber: number | null | undefined): string {
  return orderNumber != null ? ` #${orderNumber}` : "";
}

async function buildMessage(
  supabase: SupabaseClient,
  payload: StatusPayload,
): Promise<string | null> {
  const oi = saudacao(payload);
  const pedido = `Seu pedido${numeroDoPedido(payload.order_number)}`;

  if (payload.status === "preparo") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        total, payment_method, change_for,
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
      return `${oi}${pedido} foi confirmado e está sendo preparado!${tempo}`;
    }

    const itemsList = formatOrderItemsList(
      (order.order_items ?? []) as unknown as OrderItemRow[],
    );
    const pagamento = paymentLine(
      order.payment_method as string,
      Number(order.total),
      order.change_for == null ? null : Number(order.change_for),
    );

    const lines = [`${oi}${pedido} foi confirmado e está sendo preparado!`];
    if (payload.estimated_minutes) {
      lines.push(`Tempo estimado: ${payload.estimated_minutes} min`);
    }
    lines.push("", itemsList, "", `Total: ${formatBRL(Number(order.total))}`);
    if (pagamento) lines.push(pagamento);

    return lines.join("\n");
  }

  if (payload.status === "pronto") {
    if (payload.order_type === "entrega") {
      const tempo = payload.delivery_estimated_minutes
        ? ` Chega em aproximadamente ${payload.delivery_estimated_minutes} min.`
        : "";
      return `${oi}${pedido} está pronto e já vai sair para entrega!${tempo}`;
    }
    return `${oi}${pedido} está pronto! Já pode vir buscar.`;
  }

  if (payload.status === "cancelado") {
    // Só chega aqui pedido que já tinha sido aceito (ver o handler).
    return `${oi}${pedido} foi cancelado pela loja. Qualquer dúvida, responda esta mensagem.`;
  }

  return null;
}

type NotificacaoStatus = "enviada" | "falhou" | "ignorada";

// Grava no pedido o que aconteceu com o aviso, para o painel mostrar
// quando o cliente não recebeu. Falha aqui só vai pro log.
async function registrarNotificacao(
  supabase: SupabaseClient,
  payload: StatusPayload,
  status: NotificacaoStatus,
  erro: string | null,
) {
  const { error } = await supabase
    .from("orders")
    .update({
      notificacao_status: status,
      notificacao_erro: erro ? erro.slice(0, 500) : null,
      notificacao_em: new Date().toISOString(),
    })
    .eq("id", payload.order_id)
    // As chamadas do pg_net correm em paralelo: o resultado de um aviso
    // antigo (preparo lento) não pode sobrescrever o do status atual.
    .eq("status", payload.status);
  if (error) {
    console.error("Falha ao registrar resultado da notificação:", error);
  }
}

// Manda pela Evolution e devolve null se deu certo ou a descrição do erro.
async function enviar(phone: string, text: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: phone, text }),
        signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS),
      },
    );
    if (res.ok) return null;
    const errorBody = await res.text();
    console.error(`Evolution API retornou ${res.status}:`, errorBody);
    return `Evolution API retornou ${res.status}: ${errorBody.slice(0, 300)}`;
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "TimeoutError";
    console.error("Evolution API não respondeu:", err);
    return timeout
      ? `Evolution API não respondeu em ${EVOLUTION_TIMEOUT_MS / 1000}s`
      : `Falha de rede ao falar com a Evolution API: ${String(err)}`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: expectedSecret } = await supabase.rpc("get_status_webhook_secret");
  if (!safeEqual(req.headers.get("x-webhook-secret"), expectedSecret as string | null)) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: StatusPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }
  if (typeof payload?.order_id !== "string") {
    return new Response("ok", { status: 200 });
  }

  // Cancelamento só avisa pedido que a loja já tinha aceito (D5). Pedido
  // recusado ainda pendente não gerou mensagem nenhuma até aqui; avisar
  // faria um trote com o número de outra pessoa virar WhatsApp para ela.
  if (payload.status === "cancelado") {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("accepted_at, order_number")
      .eq("id", payload.order_id)
      .maybeSingle();
    if (orderError || !order) {
      console.error("Falha ao buscar o pedido cancelado:", orderError);
      await registrarNotificacao(
        supabase,
        payload,
        "falhou",
        "Não deu para confirmar se o pedido tinha sido aceito; cliente não avisado",
      );
      return new Response("ok", { status: 200 });
    }
    if (!order.accepted_at) {
      await registrarNotificacao(supabase, payload, "ignorada", "Recusado antes de ser aceito: cliente não é avisado");
      return new Response("ok", { status: 200 });
    }
    payload.order_number ??= order.order_number as number | null;
  }

  // Status sem mensagem (pendente, entregue...) não mexe no registro: não
  // pode apagar um "falhou" anterior que o painel ainda precisa mostrar.
  const message = await buildMessage(supabase, payload);
  if (!message) {
    return new Response("ok", { status: 200 });
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("phone")
    .eq("id", payload.customer_id)
    .maybeSingle();

  if (customerError) {
    console.error("Falha ao buscar telefone do cliente:", customerError);
    await registrarNotificacao(supabase, payload, "falhou", "Falha ao buscar telefone do cliente");
    return new Response("ok", { status: 200 });
  }

  if (!customer?.phone) {
    await registrarNotificacao(supabase, payload, "ignorada", "Pedido sem telefone de cliente");
    return new Response("ok", { status: 200 });
  }

  const erro = await enviar(customer.phone, message);
  await registrarNotificacao(supabase, payload, erro ? "falhou" : "enviada", erro);

  // Sempre 200: quem chama é o pg_net, que não tenta de novo; o resultado
  // fica gravado no pedido.
  return new Response("ok", { status: 200 });
});
