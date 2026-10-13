// supabase/functions/whatsapp-webhook/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { phoneVariants } from "../_shared/phone.ts";
import { safeEqual } from "../_shared/secret.ts";
import { parseInbound } from "./inbound.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;
const WHATSAPP_WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET")!;
const CARDAPIO_LINK = "https://sistemade-pedidos.vercel.app/pedido";
const ACTIVE_ORDER_STATUSES = ["pendente", "preparo", "pronto", "saiu_entrega"];
const ACTIVE_ORDER_WINDOW_MS = 12 * 60 * 60 * 1000;
const EVOLUTION_TIMEOUT_MS = 8000;

// "18:00:00" → "18h", "18:30:00" → "18h30"
function formatHour(time: string): string {
  const [h, m] = time.split(":");
  return m && m !== "00" ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

// true se a Evolution aceitou a mensagem.
async function sendText(number: string, text: string): Promise<boolean> {
  const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number, text }),
    signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS),
  }).catch((err) => {
    console.error("Evolution API não respondeu:", err);
    return null;
  });
  if (res && !res.ok) {
    console.error("Evolution API recusou a mensagem:", res.status, (await res.text()).slice(0, 300));
  }
  return res?.ok === true;
}

// O segredo vai no header x-webhook-secret. O ?secret= na URL fica só
// enquanto o webhook da Evolution não for reconfigurado: URL com segredo
// acaba em log de proxy e de acesso.
function webhookSecret(req: Request): string | null {
  const header = req.headers.get("x-webhook-secret");
  if (header) return header;
  const query = new URL(req.url).searchParams.get("secret");
  if (query) {
    console.warn("whatsapp-webhook: segredo recebido na query (?secret=); configure o header x-webhook-secret na Evolution");
  }
  return query;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!safeEqual(webhookSecret(req), WHATSAPP_WEBHOOK_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  // Só mensagem recebida de conversa individual; o resto (status de
  // entrega, presença, grupo, mensagem que a própria loja mandou) é ignorado.
  const inbound = parseInbound(body);
  if (!inbound) {
    return new Response("ok", { status: 200 });
  }
  const { replyTo: phone, phone: normalizedPhone } = inbound;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Cadastro antigo pode estar sem o 9 do celular: procura as duas formas.
  const { data: customers, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .in("phone", phoneVariants(normalizedPhone));

  if (customerError) {
    console.error("Falha ao buscar cliente no webhook do WhatsApp:", customerError);
  }

  if (customers && customers.length > 0) {
    // Só conta como ativo o pedido em andamento das últimas 12h: um pendente
    // esquecido ou cancelado não pode bloquear o cliente para sempre.
    const desde = new Date(Date.now() - ACTIVE_ORDER_WINDOW_MS).toISOString();
    const { data: activeOrder, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .in("customer_id", customers.map((c) => c.id))
      .in("status", ACTIVE_ORDER_STATUSES)
      .gte("created_at", desde)
      .limit(1)
      .maybeSingle();

    if (orderError) {
      console.error("Falha ao buscar pedido ativo no webhook do WhatsApp:", orderError);
    }

    // Cliente já tem pedido em andamento: deixa a conversa pra pizzaria
    // responder manualmente, não manda o link do cardápio de novo.
    if (activeOrder) {
      return new Response("ok", { status: 200 });
    }
  }

  // Fora do horário: um aviso de "fechado" na primeira mensagem da noite e
  // depois silêncio — sem mandar link de cardápio que não vai aceitar pedido.
  const { data: aberta, error: horarioError } = await supabase.rpc("loja_aberta");
  if (horarioError) {
    console.error("Falha ao consultar horário no webhook do WhatsApp:", horarioError);
  }
  if (aberta === false) {
    const { data: deveAvisar, error: avisoError } = await supabase.rpc(
      "registrar_aviso_fechado",
      { p_phone: normalizedPhone },
    );
    if (avisoError) {
      console.error("Falha ao registrar aviso de fechado:", avisoError);
      return new Response("ok", { status: 200 });
    }
    if (deveAvisar) {
      const { data: config } = await supabase
        .from("loja_config")
        .select("abre_as, fecha_as")
        .eq("id", 1)
        .maybeSingle();
      const horario = config
        ? ` Nosso horário é das ${formatHour(config.abre_as)} às ${formatHour(config.fecha_as)}.`
        : "";
      await sendText(
        phone,
        `Oi! A Sidney & Shirley Pizzaria já está fechada no momento. 🌙${horario}

Amanhã tem pizza quentinha te esperando! 🍕`,
      );
    }
    return new Response("ok", { status: 200 });
  }

  // Link no máximo uma vez a cada 3h por telefone: conversa normal com a
  // loja não pode virar uma resposta automática por mensagem.
  const { data: deveMandarLink, error: linkError } = await supabase.rpc(
    "registrar_envio_link",
    { p_phone: normalizedPhone },
  );
  if (linkError) {
    console.error("Falha ao registrar envio do link:", linkError);
    return new Response("ok", { status: 200 });
  }
  if (deveMandarLink) {
    const enviado = await sendText(phone, `Oi! Monta seu pedido aqui: ${CARDAPIO_LINK}`);
    if (!enviado) {
      // O envio já ficou registrado pela RPC: sem apagar, o cliente passaria
      // 3h sem receber o link por uma falha da Evolution.
      const { error } = await supabase.from("whatsapp_envios_link").delete().eq("phone", normalizedPhone);
      if (error) {
        console.error("Link não enviado e registro não apagado (cliente fica 3h sem link):", error);
      }
    }
  }

  return new Response("ok", { status: 200 });
});
