import { assertEquals } from "jsr:@std/assert@1.0.13";
import { changeError, type ExtraRow, type MenuItemRow, priceOrder } from "./pricing.ts";
import type { OrderItemInput } from "./validation.ts";

const menu: MenuItemRow[] = [
  { id: "pizza-g", name: "Pizza Grande", category: "pizza", base_price: "50.00", active: true, max_flavors: 2 },
  { id: "pizza-p", name: "Pizza Pequena", category: "pizza", base_price: 30, active: true, max_flavors: null },
  { id: "coca", name: "Coca 2L", category: "bebida", base_price: "12.90", active: true, max_flavors: null },
  { id: "suco", name: "Suco", category: "bebida", base_price: 8, active: false, max_flavors: null },
];
const flavors: ExtraRow[] = [
  { id: "calabresa", name: "Calabresa", extra_price: 0, active: true },
  { id: "camarao", name: "Camarão", extra_price: "15.50", active: true },
  { id: "palmito", name: "Palmito", extra_price: "5.00", active: false },
];
const crusts: ExtraRow[] = [
  { id: "catupiry", name: "Catupiry", extra_price: "8.00", active: true },
  { id: "cheddar", name: "Cheddar", extra_price: 8, active: false },
];

function item(menu_item_id: string, extra: Partial<OrderItemInput> = {}): OrderItemInput {
  return { menu_item_id, flavor_ids: [], crust_id: null, quantity: 1, item_notes: null, ...extra };
}

Deno.test("pizza de um sabor só cobra o adicional do sabor especial", () => {
  const r = priceOrder([item("pizza-g", { flavor_ids: ["camarao"] })], menu, flavors, crusts);
  if (!r.ok) throw new Error(r.error);
  // 50 + 15,50
  assertEquals(r.items[0].unit_price, 65.5);
});

Deno.test("todos os sabores especiais: cobra o adicional", () => {
  const r = priceOrder([item("pizza-g", { flavor_ids: ["camarao", "camarao2"] })], menu, [
    ...flavors,
    { id: "camarao2", name: "Camarão 2", extra_price: "15.50", active: true },
  ], crusts);
  if (!r.ok) throw new Error(r.error);
  assertEquals(r.items[0].unit_price, 65.5);
});

Deno.test("especial misturado com sabor comum sai no preço normal; borda e quantidade valem", () => {
  const r = priceOrder(
    [
      item("pizza-g", { flavor_ids: ["calabresa", "camarao"], crust_id: "catupiry", quantity: 2 }),
      item("coca", { quantity: 3 }),
    ],
    menu,
    flavors,
    crusts,
  );
  if (!r.ok) throw new Error(r.error);
  // (50 + 8) × 2 + 12,90 × 3 = 116 + 38,70
  assertEquals(r.totalCents, 15470);
  assertEquals(r.items[0].unit_price, 58);
  assertEquals(r.items[1].unit_price, 12.9);
});

Deno.test("centavos não acumulam erro de ponto flutuante", () => {
  const r = priceOrder([item("coca", { quantity: 3 })], [{ ...menu[2], base_price: 0.1 }], [], []);
  if (!r.ok) throw new Error(r.error);
  assertEquals(r.totalCents, 30);
});

Deno.test("item inativo ou inexistente devolve code e ids de todos", () => {
  const r = priceOrder([item("suco"), item("sumiu"), item("suco"), item("coca")], menu, flavors, crusts);
  assertEquals(r, {
    ok: false,
    code: "item_indisponivel",
    ids: ["suco", "sumiu"],
    error: "Suco e mais 1 item acabaram de esgotar. Tire da sacola e tente de novo.",
  });
});

Deno.test("item que nem existe mais usa nome genérico", () => {
  const r = priceOrder([item("sumiu")], menu, flavors, crusts);
  assertEquals(r.ok ? null : r.error, "Um item do seu pedido acabou de esgotar. Tire da sacola e tente de novo.");
});

Deno.test("sabor e borda esgotados têm code próprio", () => {
  const sabor = priceOrder([item("pizza-g", { flavor_ids: ["calabresa", "palmito"] })], menu, flavors, crusts);
  assertEquals(sabor, {
    ok: false,
    code: "sabor_indisponivel",
    ids: ["palmito"],
    error: "O sabor Palmito acabou de esgotar. Escolha outro e tente de novo.",
  });
  const borda = priceOrder(
    [item("pizza-g", { flavor_ids: ["calabresa"], crust_id: "cheddar" })],
    menu,
    flavors,
    crusts,
  );
  assertEquals(borda.ok ? null : [borda.code, borda.ids], ["borda_indisponivel", ["cheddar"]]);
});

Deno.test("pizza precisa de 1 a max_flavors sabores; sem max_flavors vale 1", () => {
  const semSabor = priceOrder([item("pizza-g")], menu, flavors, crusts);
  assertEquals(semSabor.ok ? null : semSabor.error, "Escolha pelo menos um sabor para a pizza");
  const demais = priceOrder([item("pizza-p", { flavor_ids: ["calabresa", "camarao"] })], menu, flavors, crusts);
  assertEquals(demais.ok ? null : demais.error, "Esse tamanho aceita no máximo 1 sabor(es)");
  assertEquals("code" in demais, false);
});

Deno.test("bebida não aceita sabor nem borda", () => {
  const r1 = priceOrder([item("coca", { flavor_ids: ["calabresa"] })], menu, flavors, crusts);
  const r2 = priceOrder([item("coca", { crust_id: "catupiry" })], menu, flavors, crusts);
  assertEquals(r1.ok ? null : r1.error, "Sabor e borda só podem ser escolhidos em pizzas");
  assertEquals(r2.ok ? null : r2.error, "Sabor e borda só podem ser escolhidos em pizzas");
});

Deno.test("troco igual ao total passa; menor é recusado", () => {
  assertEquals(changeError(null, 5000), null);
  assertEquals(changeError(50, 5000), null);
  assertEquals(changeError(100, 5000), null);
  assertEquals(changeError(49.99, 5000), "O troco precisa ser para um valor igual ou maior que o total (50,00)");
});
