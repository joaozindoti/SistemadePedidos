// supabase/functions/_shared/phone.ts
// Forma canônica do telefone, igual nas duas pontas (create-order grava,
// whatsapp-webhook procura): só dígitos, "55" + DDD + número, e celular
// sempre com o 9 na frente (13 dígitos). Fixo fica com 12.
//
// O WhatsApp entrega o remoteJid de muitas contas antigas sem o 9
// (5511 8765-4321), enquanto o cliente digita com o 9 no checkout. Sem
// canonizar, o mesmo cliente vira dois cadastros e o webhook não acha o
// pedido em andamento.

// Número de 8 dígitos começando em 6–9 é celular sem o 9 da frente;
// 2–5 é fixo.
const CELULAR_SEM_NOVE_RE = /^[6-9]\d{7}$/;
const DDD_RE = /^[1-9][1-9]$/;

// Devolve o telefone canônico ou null se não for um número brasileiro válido.
export function canonicalPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");

  // Até 11 dígitos é DDD + número, sem DDI (inclusive DDD 55, do RS).
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) {
    return null;
  }

  const ddd = digits.slice(2, 4);
  const numero = digits.slice(4);
  if (!DDD_RE.test(ddd)) return null;

  if (numero.length === 9) {
    // Com 9 dígitos, só celular (começa com 9).
    return numero.startsWith("9") ? digits : null;
  }
  if (CELULAR_SEM_NOVE_RE.test(numero)) {
    return `55${ddd}9${numero}`;
  }
  return digits;
}

// Formas em que o mesmo telefone pode estar gravado em customers: a
// canônica e, para celular, a antiga sem o 9 (cadastros feitos antes da
// canonização). A canônica vem primeiro.
export function phoneVariants(canonical: string): string[] {
  if (canonical.length === 13) {
    return [canonical, `${canonical.slice(0, 4)}${canonical.slice(5)}`];
  }
  return [canonical];
}
