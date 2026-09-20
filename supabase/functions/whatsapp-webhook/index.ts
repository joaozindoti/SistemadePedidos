// supabase/functions/whatsapp-webhook/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;
const WHATSAPP_WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET")!;
const CARDAPIO_LINK = "https://cardapio.suapizzaria.com/pedido";

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
