import { assertEquals } from "jsr:@std/assert@1.0.13";
import { safeEqual } from "./secret.ts";

Deno.test("safeEqual compara o conteúdo", () => {
  assertEquals(safeEqual("abc123", "abc123"), true);
  assertEquals(safeEqual("abc123", "abc124"), false);
  assertEquals(safeEqual("abc", "abc123"), false);
  assertEquals(safeEqual("ção", "ção"), true);
});

Deno.test("safeEqual nunca aceita segredo vazio ou ausente", () => {
  assertEquals(safeEqual("", ""), false);
  assertEquals(safeEqual(null, null), false);
  assertEquals(safeEqual(undefined, "x"), false);
  assertEquals(safeEqual("x", null), false);
});
