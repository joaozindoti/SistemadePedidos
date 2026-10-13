// supabase/functions/create-order/validation.ts
// Validação da entrada do create-order, sem banco nem rede, para dar pra
// testar com `deno test`.
import { canonicalPhone } from "../_shared/phone.ts";

export const ORDER_TYPES = ["entrega", "retirada"] as const;
export const PAYMENT_METHODS = ["dinheiro", "cartao", "pix"] as const;
export const MAX_ITEMS = 30;
export const MAX_QUANTITY = 50;
export const MAX_NAME = 80;
export const MAX_NOTES = 500;
export const MAX_ITEM_NOTES = 200;
export const MAX_ADDRESS_FIELD = 120;
export const MAX_CHANGE_FOR = 100000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrderItemInput {
  menu_item_id: string;
  flavor_ids: string[];
  crust_id: string | null;
  quantity: number;
  item_notes: string | null;
}

export interface AddressInput {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
}

export interface CreateOrderInput {
  name: string;
  phone: string;
  order_type: (typeof ORDER_TYPES)[number];
  address: AddressInput | null;
  payment_method: (typeof PAYMENT_METHODS)[number];
  // Só pra dinheiro: quanto o cliente vai entregar ("troco para R$ 100").
  change_for: number | null;
  notes: string | null;
  items: OrderItemInput[];
  idempotency_key: string | null;
}

export class InputError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Texto opcional: ausente ou só espaços vira null; acima do limite é erro.
function optionalText(value: unknown, max: number, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new InputError(`${label} inválido`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new InputError(`${label} muito longo (máximo ${max} caracteres)`);
  }
  return trimmed || null;
}

function parseAddress(value: unknown): AddressInput {
  if (!isObject(value)) throw new InputError("Endereço incompleto: falta rua, número, bairro, cidade");
  const street = optionalText(value.street, MAX_ADDRESS_FIELD, "Rua");
  const number = optionalText(value.number, MAX_ADDRESS_FIELD, "Número");
  const complement = optionalText(value.complement, MAX_ADDRESS_FIELD, "Complemento");
  const neighborhood = optionalText(value.neighborhood, MAX_ADDRESS_FIELD, "Bairro");
  const city = optionalText(value.city, MAX_ADDRESS_FIELD, "Cidade");

  const missing: string[] = [];
  if (!street) missing.push("rua");
  if (!number) missing.push("número");
  if (!neighborhood) missing.push("bairro");
  if (!city) missing.push("cidade");
  if (missing.length > 0) {
    throw new InputError(`Endereço incompleto: falta ${missing.join(", ")}`);
  }
  return { street: street!, number: number!, complement, neighborhood: neighborhood!, city: city! };
}

function parseItem(value: unknown): OrderItemInput {
  if (!isObject(value)) throw new InputError("Item do pedido inválido");

  if (typeof value.menu_item_id !== "string" || !UUID_RE.test(value.menu_item_id)) {
    throw new InputError("Item do pedido inválido");
  }

  const quantity = value.quantity;
  if (
    typeof quantity !== "number" || !Number.isInteger(quantity) ||
    quantity < 1 || quantity > MAX_QUANTITY
  ) {
    throw new InputError(`Quantidade inválida (de 1 a ${MAX_QUANTITY} por item)`);
  }

  let flavorIds: string[] = [];
  if (value.flavor_ids != null) {
    if (!Array.isArray(value.flavor_ids)) throw new InputError("Sabores inválidos");
    for (const id of value.flavor_ids) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        throw new InputError("Sabores inválidos");
      }
    }
    flavorIds = value.flavor_ids as string[];
    if (new Set(flavorIds).size !== flavorIds.length) {
      throw new InputError("O mesmo sabor foi escolhido mais de uma vez");
    }
  }

  let crustId: string | null = null;
  if (value.crust_id != null) {
    if (typeof value.crust_id !== "string" || !UUID_RE.test(value.crust_id)) {
      throw new InputError("Borda inválida");
    }
    crustId = value.crust_id;
  }

  return {
    menu_item_id: value.menu_item_id,
    flavor_ids: flavorIds,
    crust_id: crustId,
    quantity,
    item_notes: optionalText(value.item_notes, MAX_ITEM_NOTES, "Observação do item"),
  };
}

// Valida tipo e limite de tudo antes de tocar no banco. Erro aqui vira 400
// com uma mensagem que o cliente consegue entender.
export function parseBody(raw: unknown): CreateOrderInput {
  if (!isObject(raw)) throw new InputError("Pedido inválido");

  const name = optionalText(raw.name, MAX_NAME, "Nome");
  if (!name || typeof raw.phone !== "string") {
    throw new InputError("Nome e telefone são obrigatórios");
  }

  const phone = canonicalPhone(raw.phone);
  if (!phone) {
    throw new InputError("Telefone inválido");
  }

  if (!ORDER_TYPES.includes(raw.order_type as CreateOrderInput["order_type"])) {
    throw new InputError("Tipo de pedido inválido");
  }
  const orderType = raw.order_type as CreateOrderInput["order_type"];

  if (!PAYMENT_METHODS.includes(raw.payment_method as CreateOrderInput["payment_method"])) {
    throw new InputError("Forma de pagamento inválida");
  }
  const paymentMethod = raw.payment_method as CreateOrderInput["payment_method"];

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new InputError("Carrinho vazio");
  }
  if (raw.items.length > MAX_ITEMS) {
    throw new InputError(`O pedido pode ter no máximo ${MAX_ITEMS} itens`);
  }
  const items = raw.items.map(parseItem);

  // Endereço só conta em entrega; em retirada o que vier é descartado.
  const address = orderType === "entrega" ? parseAddress(raw.address) : null;

  let changeFor: number | null = null;
  if (paymentMethod === "dinheiro" && raw.change_for != null) {
    const value = raw.change_for;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_CHANGE_FOR) {
      throw new InputError("Valor do troco inválido");
    }
    changeFor = Math.round(value * 100) / 100;
  }

  let idempotencyKey: string | null = null;
  if (raw.idempotency_key != null) {
    if (typeof raw.idempotency_key !== "string" || !UUID_RE.test(raw.idempotency_key)) {
      throw new InputError("Chave de idempotência inválida");
    }
    idempotencyKey = raw.idempotency_key.toLowerCase();
  }

  return {
    name,
    phone,
    order_type: orderType,
    address,
    payment_method: paymentMethod,
    change_for: changeFor,
    notes: optionalText(raw.notes, MAX_NOTES, "Observação"),
    items,
    idempotency_key: idempotencyKey,
  };
}
