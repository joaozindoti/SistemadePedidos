// supabase/functions/whatsapp-connect/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL")!;
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY")!;
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME")!;

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

async function getStatus() {
  const res = await fetch(
    `${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
    { headers: { apikey: EVOLUTION_API_KEY } },
  );
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    return { state: "erro" as const, detail: body };
  }
  // A Evolution API responde com { instance: { instanceName, state } } (v2)
  // ou { state } dependendo da versão, então cobrimos os dois formatos.
  const nested = body as { instance?: { state?: string }; state?: string };
  const state = nested.instance?.state ?? nested.state ?? "desconhecido";
  return { state };
}

async function ensureInstanceExists() {
  const res = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      instanceName: EVOLUTION_INSTANCE_NAME,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  if (res.ok) return;

  const bodyText = await res.text();
  // A instância já existir não é erro pra nós: só significa que já dá pra conectar.
  if (/already in use|already exists|já existe/i.test(bodyText)) return;

  throw new Error(`Falha ao criar instância (${res.status}): ${bodyText}`);
}

async function connect() {
  await ensureInstanceExists();

  const res = await fetch(
    `${EVOLUTION_API_URL}/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
    { headers: { apikey: EVOLUTION_API_KEY } },
  );
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    throw new Error(`Falha ao conectar (${res.status}): ${JSON.stringify(body)}`);
  }

  const data = body as {
    base64?: string;
    qrcode?: { base64?: string };
    instance?: { state?: string };
  };
  const qrcode = data.base64 ?? data.qrcode?.base64 ?? null;
  const state = data.instance?.state ?? null;
  return { qrcode, state };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Só o painel logado pode chamar essa function: valida o token do
  // usuário (não basta ser um JWT válido, precisa ser de um usuário real).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  try {
    if (body.action === "status") {
      return jsonResponse(await getStatus(), 200);
    }

    if (body.action === "connect") {
      return jsonResponse(await connect(), 200);
    }

    return jsonResponse({ error: "Ação inválida" }, 400);
  } catch (err) {
    console.error("whatsapp-connect falhou:", err);
    return jsonResponse({ error: "Falha ao falar com a Evolution API" }, 500);
  }
});
