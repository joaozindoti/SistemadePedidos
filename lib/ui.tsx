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

// "1.000,50" / "50,50" / "50.50" / "50" / "1.000" → número; inválido → null.
// Com vírgula, ponto é milhar. Sem vírgula, ponto seguido de grupos de 3
// dígitos é milhar ("1.000", "10.000"); senão é decimal ("10.5", "50.50"),
// do teclado de celular.
export function parseMoney(raw: string): number | null {
  const t = raw.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  let normalized: string;
  if (t.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d*),\d*$/.test(t)) return null;
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normalized = t.replace(/\./g, "");
  } else {
    if (!/^\d*\.?\d*$/.test(t)) return null;
    normalized = t;
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
