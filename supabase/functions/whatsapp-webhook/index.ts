// supabase/functions/whatsapp-webhook/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;
const WHATSAPP_WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET")!;
const CARDAPIO_LINK = "https://sistemade-pedidos.vercel.app/pedido";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== WHATSAPP_WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const data = body?.data;
  const remoteJid: string | undefined = data?.key?.remoteJid;
  const fromMe: boolean | undefined = data?.key?.fromMe;

  if (!remoteJid || fromMe || remoteJid.endsWith("@g.us")) {
    return new Response("ok", { status: 200 });
  }

  const phone = remoteJid.split("@")[0];
  if (!/^\d{8,15}$/.test(phone)) {
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const normalizedPhone = normalizePhone(phone);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (customerError) {
    console.error("Falha ao buscar cliente no webhook do WhatsApp:", customerError);
  }

  if (customer) {
    const { data: activeOrder, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("customer_id", customer.id)
      .neq("status", "finalizado")
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

  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: phone,
      text: `Oi! Monta seu pedido aqui: ${CARDAPIO_LINK}`,
    }),
  });

  return new Response("ok", { status: 200 });
});
