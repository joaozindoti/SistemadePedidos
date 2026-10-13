// supabase/functions/create-order/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { type CreateOrderInput, InputError, parseBody } from "./validation.ts";
import { changeError, type ExtraRow, type MenuItemRow, priceOrder } from "./pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:.]{2,45}$/i;

// Primeiro valor do x-forwarded-for: é o padrão documentado do Supabase Edge
// para o IP do cliente. Só aceita algo com cara de IP; valor arbitrário no
// cabeçalho não pode estourar o índice da tabela de tentativas nem virar
// chave de limite. Fora disso vira null e só o limite por telefone vale.
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (!first || first.length > 45) return null;
  if (IPV4_RE.test(first) || (first.includes(":") && IPV6_RE.test(first))) return first;
  return null;
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

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  let body: CreateOrderInput;
  try {
    body = parseBody(raw);
  } catch (err) {
    if (err instanceof InputError) return jsonResponse({ error: err.message }, 400);
    throw err;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Reenvio do mesmo checkout (resposta anterior se perdeu): devolve o pedido
  // já gravado antes de checar limite e horário, senão o cliente que já pediu
  // levaria um "loja fechada" ou "muitas tentativas" na cara. A RPC também
  // trata a chave, então isto é só um atalho; se falhar, segue o fluxo.
  if (body.idempotency_key) {
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id, order_number, total, customer:customers ( phone )")
      .eq("idempotency_key", body.idempotency_key)
      .maybeSingle();
    if (existingError) {
      console.error("Falha ao procurar pedido pela chave de idempotência:", existingError);
    } else if (existing) {
      const customer = Array.isArray(existing.customer) ? existing.customer[0] : existing.customer;
      if (customer?.phone !== body.phone) {
        return jsonResponse({ error: "Esse pedido já foi enviado por outro telefone" }, 409);
      }
      return jsonResponse(
        {
          order_id: existing.id,
          order_number: existing.order_number ?? null,
          total: Number(existing.total),
          reused: true,
        },
        200,
      );
    }
  }

  // O cardápio já bloqueia fora do horário, mas a página pode ter ficado
  // aberta desde antes das 23h — a palavra final é daqui.
  const { data: aberta, error: horarioError } = await supabase.rpc("loja_aberta");
  if (horarioError) {
    // Fail open (decisão D2): se a consulta falhar, o pedido entra mesmo
    // fora do horário. Fica no log pra alguém perceber.
    console.error("HORÁRIO INDISPONÍVEL (pedido aceito sem checar se a loja está aberta):", horarioError);
  } else if (aberta === false) {
    return jsonResponse(
      { error: "A pizzaria está fechada agora. Volte no nosso horário de funcionamento!" },
      409,
    );
  }

  const menuItemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
  const { data: menuItems, error: menuError } = await supabase
    .from("menu_items")
    .select("id, name, category, base_price, active, max_flavors")
    .in("id", menuItemIds);

  if (menuError || !menuItems) {
    console.error("Falha ao buscar itens do cardápio:", menuError);
    return jsonResponse({ error: "Falha ao validar cardápio" }, 500);
  }

  const allFlavorIds = [...new Set(body.items.flatMap((i) => i.flavor_ids))];
  const crustIds = [
    ...new Set(body.items.map((i) => i.crust_id).filter((id): id is string => id !== null)),
  ];

  let flavors: ExtraRow[] = [];
  if (allFlavorIds.length) {
    const { data, error } = await supabase
      .from("flavors")
      .select("id, name, extra_price, active")
      .in("id", allFlavorIds);
    if (error || !data) {
      console.error("Falha ao buscar sabores:", error);
      return jsonResponse({ error: "Falha ao validar cardápio" }, 500);
    }
    flavors = data;
  }

  let crusts: ExtraRow[] = [];
  if (crustIds.length) {
    const { data, error } = await supabase
      .from("crusts")
      .select("id, name, extra_price, active")
      .in("id", crustIds);
    if (error || !data) {
      console.error("Falha ao buscar bordas:", error);
      return jsonResponse({ error: "Falha ao validar cardápio" }, 500);
    }
    crusts = data;
  }

  // Item esgotado volta com { error, code, ids } para o front tirar da sacola.
  const priced = priceOrder(body.items, menuItems as MenuItemRow[], flavors, crusts);
  if (!priced.ok) {
    return jsonResponse({ error: priced.error, code: priced.code, ids: priced.ids }, 400);
  }
  const orderItems = priced.items;

  // Frete: a tabela taxas_entrega é a fonte da verdade (o criar_pedido soma
  // de novo); aqui só para recusar cidade sem entrega e conferir o troco.
  let deliveryFeeCents = 0;
  if (body.order_type === "entrega") {
    const city = (body.address?.city ?? "").trim();
    const { data: taxas, error: freteError } = await supabase
      .from("taxas_entrega")
      .select("cidade, valor")
      .eq("ativo", true);
    if (freteError || !taxas) {
      console.error("Falha ao buscar frete:", freteError);
      return jsonResponse({ error: "Falha ao calcular a entrega" }, 500);
    }
    const taxa = taxas.find((t) => t.cidade.toLowerCase() === city.toLowerCase());
    if (!taxa) {
      const cidades = taxas.map((t) => t.cidade).join(" e ");
      return jsonResponse({ error: `Entregamos só em ${cidades}.`, code: "cidade_sem_entrega" }, 400);
    }
    deliveryFeeCents = Math.round(Number(taxa.valor) * 100);
  }

  const trocoInvalido = changeError(body.change_for, priced.totalCents + deliveryFeeCents);
  if (trocoInvalido) {
    return jsonResponse({ error: trocoInvalido }, 400);
  }

  // Conta a tentativa só depois que o pedido passou em toda a validação:
  // payload inválido com o telefone de outra pessoa não pode deixar esse
  // cliente bloqueado no limite.
  const { data: permitido, error: limiteError } = await supabase.rpc(
    "registrar_tentativa_pedido",
    { p_ip: clientIp(req), p_phone: body.phone },
  );
  if (limiteError) {
    // Fail closed: se o banco caiu, o criar_pedido falharia logo depois do
    // mesmo jeito; aceitar aqui só abriria brecha para furar o limite.
    console.error("RATE LIMIT INDISPONÍVEL (pedido recusado):", limiteError);
    return jsonResponse({ error: "Não conseguimos registrar seu pedido agora. Tente de novo em instantes." }, 503);
  }
  if (permitido === false) {
    return jsonResponse(
      { error: "Muitas tentativas de pedido em pouco tempo. Aguarde alguns minutos e tente de novo." },
      429,
    );
  }

  // Cliente, pedido, itens e sabores gravados num único commit pela RPC.
  // Ela calcula e grava o total a partir de unit_price × quantity, não
  // sobrescreve o nome de cliente já cadastrado e, se a chave de
  // idempotência já existir, devolve o pedido anterior com reused = true.
  const address = body.address;
  const { data: created, error: createError } = await supabase.rpc("criar_pedido", {
    p: {
      idempotency_key: body.idempotency_key,
      phone: body.phone,
      name: body.name,
      order_type: body.order_type,
      payment_method: body.payment_method,
      change_for: body.change_for,
      notes: body.notes,
      address_street: address?.street ?? null,
      address_number: address?.number ?? null,
      address_complement: address?.complement ?? null,
      address_neighborhood: address?.neighborhood ?? null,
      address_city: address?.city ?? null,
      items: orderItems,
    },
  });

  if (createError || !created) {
    console.error("Falha ao gravar pedido (criar_pedido):", createError);
    // 23505: a chave de idempotência já pertence a pedido de outro telefone.
    if (createError?.code === "23505") {
      return jsonResponse({ error: "Esse pedido já foi enviado por outro telefone" }, 409);
    }
    // Payload malformado, cast, FK ou CHECK: a validação acima deveria ter
    // barrado, mas um item pode ter sido apagado do cardápio no meio do caminho.
    if (["22023", "22P02", "22003", "23502", "23503", "23514"].includes(createError?.code ?? "")) {
      return jsonResponse({ error: "Pedido inválido ou item indisponível. Atualize o cardápio e tente de novo." }, 400);
    }
    return jsonResponse({ error: "Falha ao criar pedido" }, 500);
  }

  const result = created as {
    order_id: string;
    order_number: number | null;
    total: number;
    reused: boolean;
  };

  return jsonResponse(
    {
      order_id: result.order_id,
      order_number: result.order_number ?? null,
      total: Number(result.total),
      reused: result.reused === true,
    },
    200,
  );
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Qualquer exceção não prevista ainda responde com CORS, senão o
    // navegador mostra erro de rede em vez da mensagem.
    console.error("Erro inesperado no create-order:", err);
    return jsonResponse({ error: "Falha ao criar pedido" }, 500);
  }
});
