// supabase/functions/send-status-notification/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;

interface StatusPayload {
  order_id: string;
  status: string;
  order_type: "entrega" | "retirada";
  estimated_minutes: number | null;
  customer_id: string;
}

function buildMessage(payload: StatusPayload): string | null {
  if (payload.status === "preparo") {
    const tempo = payload.estimated_minutes
      ? ` Tempo estimado: ${payload.estimated_minutes} min.`
      : "";
    return `Seu pedido foi confirmado e está sendo preparado!${tempo}`;
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

  const message = buildMessage(payload);
  if (!message) {
    return new Response("ok", { status: 200 });
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("phone")
    .eq("id", payload.customer_id)
    .single();

  if (!customer?.phone) {
    return new Response("ok", { status: 200 });
  }

  await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({ number: customer.phone, text: message }),
  });

  return new Response("ok", { status: 200 });
});
