// supabase/functions/whatsapp-webhook/inbound.ts
// Decide se o corpo que a Evolution mandou é uma mensagem de cliente que
// merece resposta. Puro, para dar pra testar com `deno test`.
import { canonicalPhone } from "../_shared/phone.ts";

export interface EvolutionWebhookBody {
  event?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      // Em conversa com LID, o número de verdade vem num destes.
      senderPn?: string;
      remoteJidAlt?: string;
    };
  };
}

export interface InboundMessage {
  // Número como o WhatsApp mandou: é pra ele que a resposta vai.
  replyTo: string;
  // Forma canônica, para achar o cliente e contar os envios.
  phone: string;
}

// "messages.upsert" (v2) ou "MESSAGES_UPSERT" (webhook por evento).
function isMessageUpsert(event: unknown): boolean {
  return typeof event === "string" && event.toLowerCase().replace(/_/g, ".") === "messages.upsert";
}

export function parseInbound(body: unknown): InboundMessage | null {
  if (typeof body !== "object" || body === null) return null;
  const { event, data } = body as EvolutionWebhookBody;
  if (!isMessageUpsert(event)) return null;

  const key = data?.key;
  if (!key || key.fromMe || typeof key.remoteJid !== "string") return null;

  let jid = key.remoteJid;
  if (jid.endsWith("@lid")) {
    jid = key.senderPn ?? key.remoteJidAlt ?? "";
  }
  // Só conversa individual: grupo, status e canal ficam sem resposta.
  if (!jid.endsWith("@s.whatsapp.net")) return null;

  const replyTo = jid.split("@")[0];
  if (!/^\d{8,15}$/.test(replyTo)) return null;
  const phone = canonicalPhone(replyTo);
  if (!phone) return null;
  return { replyTo, phone };
}
