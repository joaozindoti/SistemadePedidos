// supabase/functions/_shared/secret.ts

// Compara dois segredos sem sair no primeiro byte diferente, para o tempo
// de resposta não revelar quantos caracteres do palpite estão certos.
// Tamanhos diferentes ainda percorrem o maior dos dois.
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}
