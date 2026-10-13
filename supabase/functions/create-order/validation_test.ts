import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import { InputError, MAX_ITEMS, MAX_QUANTITY, parseBody } from "./validation.ts";

const PIZZA = "11111111-1111-4111-8111-111111111111";
const SABOR_A = "22222222-2222-4222-8222-222222222222";
const SABOR_B = "33333333-3333-4333-8333-333333333333";
const BORDA = "44444444-4444-4444-8444-444444444444";
const KEY = "55555555-5555-4555-8555-555555555555";

function pedido(extra: Record<string, unknown> = {}) {
  return {
    name: "  Ana Souza ",
    phone: "(11) 98765-4321",
    order_type: "retirada",
    payment_method: "pix",
    items: [{ menu_item_id: PIZZA, flavor_ids: [SABOR_A], crust_id: null, quantity: 1 }],
    ...extra,
  };
}

function erro(raw: unknown, msg: string) {
  assertThrows(() => parseBody(raw), InputError, msg);
}

Deno.test("pedido válido sai normalizado", () => {
  const body = parseBody(pedido({ notes: "  ", idempotency_key: KEY.toUpperCase() }));
  assertEquals(body.name, "Ana Souza");
  assertEquals(body.phone, "5511987654321");
  assertEquals(body.address, null);
  assertEquals(body.notes, null);
  assertEquals(body.change_for, null);
  assertEquals(body.idempotency_key, KEY);
  assertEquals(body.items[0].item_notes, null);
});

Deno.test("telefone sem o 9 é gravado na forma canônica", () => {
  assertEquals(parseBody(pedido({ phone: "11 8765-4321" })).phone, "5511987654321");
});

Deno.test("telefone inválido é recusado", () => {
  erro(pedido({ phone: "1234" }), "Telefone inválido");
  erro(pedido({ phone: "+44 20 1234 5678" }), "Telefone inválido");
  erro(pedido({ phone: 11987654321 }), "Nome e telefone são obrigatórios");
});

Deno.test("nome obrigatório e com limite", () => {
  erro(pedido({ name: "   " }), "Nome e telefone são obrigatórios");
  erro(pedido({ name: "a".repeat(81) }), "Nome muito longo");
});

Deno.test("tipo de pedido e pagamento só dos valores conhecidos", () => {
  erro(pedido({ order_type: "drone" }), "Tipo de pedido inválido");
  erro(pedido({ payment_method: "fiado" }), "Forma de pagamento inválida");
});

Deno.test("entrega exige endereço completo; retirada descarta", () => {
  erro(pedido({ order_type: "entrega" }), "Endereço incompleto");
  erro(
    pedido({ order_type: "entrega", address: { street: "Rua A", number: "1", city: "X" } }),
    "falta bairro",
  );
  const ok = parseBody(pedido({
    order_type: "entrega",
    address: { street: " Rua A ", number: "10", neighborhood: "Centro", city: "Brasília", complement: "" },
  }));
  assertEquals(ok.address, {
    street: "Rua A",
    number: "10",
    complement: null,
    neighborhood: "Centro",
    city: "Brasília",
  });
  assertEquals(parseBody(pedido({ address: { street: "Rua A" } })).address, null);
});

Deno.test("limites de itens e quantidade", () => {
  erro(pedido({ items: [] }), "Carrinho vazio");
  const item = { menu_item_id: PIZZA, flavor_ids: [SABOR_A], quantity: 1 };
  erro(pedido({ items: Array(MAX_ITEMS + 1).fill(item) }), `no máximo ${MAX_ITEMS} itens`);
  erro(pedido({ items: [{ ...item, quantity: MAX_QUANTITY + 1 }] }), "Quantidade inválida");
  erro(pedido({ items: [{ ...item, quantity: 0 }] }), "Quantidade inválida");
  erro(pedido({ items: [{ ...item, quantity: 1.5 }] }), "Quantidade inválida");
  erro(pedido({ items: [{ ...item, quantity: "2" }] }), "Quantidade inválida");
});

Deno.test("ids precisam ser UUID e sabor não repete", () => {
  erro(pedido({ items: [{ menu_item_id: "x", quantity: 1 }] }), "Item do pedido inválido");
  erro(pedido({ items: [{ menu_item_id: PIZZA, flavor_ids: ["x"], quantity: 1 }] }), "Sabores inválidos");
  erro(
    pedido({ items: [{ menu_item_id: PIZZA, flavor_ids: [SABOR_A, SABOR_A], quantity: 1 }] }),
    "mesmo sabor",
  );
  erro(
    pedido({ items: [{ menu_item_id: PIZZA, flavor_ids: [SABOR_B], crust_id: 7, quantity: 1 }] }),
    "Borda inválida",
  );
  const body = parseBody(pedido({
    items: [{ menu_item_id: PIZZA, flavor_ids: [SABOR_B], crust_id: BORDA, quantity: 2 }],
  }));
  assertEquals(body.items[0].crust_id, BORDA);
});

Deno.test("troco só em dinheiro, positivo e arredondado em centavos", () => {
  assertEquals(parseBody(pedido({ payment_method: "pix", change_for: 100 })).change_for, null);
  assertEquals(parseBody(pedido({ payment_method: "dinheiro", change_for: 50.256 })).change_for, 50.26);
  erro(pedido({ payment_method: "dinheiro", change_for: 0 }), "Valor do troco inválido");
  erro(pedido({ payment_method: "dinheiro", change_for: "50" }), "Valor do troco inválido");
  erro(pedido({ payment_method: "dinheiro", change_for: 100001 }), "Valor do troco inválido");
});

Deno.test("textos longos são recusados", () => {
  erro(pedido({ notes: "a".repeat(501) }), "Observação muito longo");
  erro(
    pedido({
      items: [{ menu_item_id: PIZZA, flavor_ids: [SABOR_A], quantity: 1, item_notes: "a".repeat(201) }],
    }),
    "Observação do item muito longo",
  );
});

Deno.test("chave de idempotência precisa ser UUID", () => {
  erro(pedido({ idempotency_key: "abc" }), "Chave de idempotência inválida");
});
