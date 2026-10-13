import { assertEquals } from "jsr:@std/assert@1.0.13";
import { canonicalPhone, phoneVariants } from "./phone.ts";

Deno.test("celular digitado com DDD e máscara vira 55 + DDD + 9 dígitos", () => {
  assertEquals(canonicalPhone("(11) 98765-4321"), "5511987654321");
  assertEquals(canonicalPhone("11987654321"), "5511987654321");
  assertEquals(canonicalPhone("+55 11 98765-4321"), "5511987654321");
});

Deno.test("celular sem o 9 (JID antigo do WhatsApp) ganha o 9", () => {
  assertEquals(canonicalPhone("551187654321"), "5511987654321");
  assertEquals(canonicalPhone("1187654321"), "5511987654321");
  assertEquals(canonicalPhone("556196543210"), "5561996543210");
});

Deno.test("fixo continua com 12 dígitos", () => {
  assertEquals(canonicalPhone("(11) 3456-7890"), "551134567890");
  assertEquals(canonicalPhone("551134567890"), "551134567890");
});

Deno.test("DDD 55 (RS) sem DDI não é confundido com o DDI", () => {
  assertEquals(canonicalPhone("55991234567"), "5555991234567");
  assertEquals(canonicalPhone("5591234567"), "5555991234567");
  assertEquals(canonicalPhone("5555991234567"), "5555991234567");
});

Deno.test("número inválido vira null", () => {
  assertEquals(canonicalPhone(""), null);
  assertEquals(canonicalPhone("123456789"), null);
  assertEquals(canonicalPhone("12345678901234"), null);
  assertEquals(canonicalPhone("14155552671"), null); // EUA: vira DDD 14 + número que não é celular
  assertEquals(canonicalPhone("5511887654321"), null); // 9 dígitos sem começar com 9
  assertEquals(canonicalPhone("5501987654321"), null); // DDD com zero
  assertEquals(canonicalPhone("441234567890"), null); // DDI de fora
});

Deno.test("variantes: celular procura com e sem o 9; fixo só a própria", () => {
  assertEquals(phoneVariants("5511987654321"), ["5511987654321", "551187654321"]);
  assertEquals(phoneVariants("551134567890"), ["551134567890"]);
});

Deno.test("a variante sem o 9 volta para a canônica", () => {
  for (const canonical of ["5511987654321", "5555991234567"]) {
    for (const v of phoneVariants(canonical)) {
      assertEquals(canonicalPhone(v), canonical);
    }
  }
});
