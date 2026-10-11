export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>
      {name}
    </span>
  );
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "1.000,50" / "50,50" / "50.50" / "50" → número; inválido → null. Com
// vírgula, ponto é milhar; sem vírgula, ponto é decimal (teclado de celular).
export function parseMoney(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
