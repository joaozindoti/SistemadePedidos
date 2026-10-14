import { assertEquals } from "jsr:@std/assert@1.0.13";
import { messageText, parseInbound, wantsMenu } from "./inbound.ts";

function msg(key: Record<string, unknown>, event = "messages.upsert") {
  return { event, instance: "loja", data: { key } };
}

Deno.test("mensagem recebida de conversa individual é respondida", () => {
  assertEquals(parseInbound(msg({ remoteJid: "551187654321@s.whatsapp.net", fromMe: false })), {
    replyTo: "551187654321",
    phone: "5511987654321",
  });
  assertEquals(
    parseInbound(msg({ remoteJid: "5511987654321@s.whatsapp.net" }, "MESSAGES_UPSERT"))?.phone,
    "5511987654321",
  );
});

Deno.test("outros eventos, fromMe, grupo e status são ignorados", () => {
  const jid = "5511987654321@s.whatsapp.net";
  assertEquals(parseInbound(msg({ remoteJid: jid }, "messages.update")), null);
  assertEquals(parseInbound(msg({ remoteJid: jid }, "")), null);
  assertEquals(parseInbound({ data: { key: { remoteJid: jid } } }), null);
  assertEquals(parseInbound(msg({ remoteJid: jid, fromMe: true })), null);
  assertEquals(parseInbound(msg({ remoteJid: "120363000000000000@g.us" })), null);
  assertEquals(parseInbound(msg({ remoteJid: "status@broadcast" })), null);
  assertEquals(parseInbound(null), null);
  assertEquals(parseInbound("x"), null);
});

Deno.test("conversa com LID usa o número de senderPn", () => {
  assertEquals(
    parseInbound(msg({ remoteJid: "123456789012345@lid", senderPn: "5511987654321@s.whatsapp.net" }))?.phone,
    "5511987654321",
  );
  assertEquals(parseInbound(msg({ remoteJid: "123456789012345@lid" })), null);
});

Deno.test("número fora do Brasil não recebe resposta automática", () => {
  assertEquals(parseInbound(msg({ remoteJid: "14155552671@s.whatsapp.net" })), null);
});

Deno.test("saudações e pedidos de cardápio recebem o link", () => {
  for (const txt of ["Boa noite", "boa tarde!", "BOM DIA", "oi", "Oiii", "Olá", "opa", "e aí", "quero pedir uma pizza",
    "Manda o cardápio", "qual o link?", "Vocês estão abertos?", "boa"]) {
    assertEquals(wantsMenu(txt), true, txt);
  }
  for (const txt of ["", "obrigado", "ok", "valeu", "já paguei", "chegou aqui"]) {
    assertEquals(wantsMenu(txt), false, txt);
  }
});

Deno.test("texto vem de conversa, texto estendido ou legenda", () => {
  assertEquals(messageText({ data: { message: { conversation: "boa noite" } } }), "boa noite");
  assertEquals(messageText({ data: { message: { extendedTextMessage: { text: "oi" } } } }), "oi");
  assertEquals(messageText({ data: { message: { imageMessage: { caption: "cardápio?" } } } }), "cardápio?");
  assertEquals(messageText({ data: { message: { audioMessage: {} } } }), "");
  assertEquals(messageText(null), "");
});
