"use client";

import { createPortal } from "react-dom";
import { formatBRL } from "@/lib/ui";

// Tudo que a comanda (tela da cozinha e impressão) precisa saber de um
// pedido. Os campos de endereço/pagamento/total só existem pro admin — a
// cozinha não precisa deles e a impressão só mostra se vierem preenchidos.

export interface ComandaItem {
  id: string;
  quantity: number;
  item_notes: string | null;
  menu_item: { name: string; category?: string } | null;
  crust: { name: string } | null;
  order_item_flavors: { flavor: { name: string } | null }[];
}

export interface ComandaOrder {
  id: string;
  order_number?: number | null;
  order_type: "entrega" | "retirada";
  notes: string | null;
  created_at: string;
  accepted_at?: string | null;
  estimated_minutes?: number | null;
  customer: { name: string | null; phone?: string } | null;
  items: ComandaItem[];
  payment_method?: string;
  total?: number;
  change_for?: number | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
}

export const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão na entrega",
  pix: "Pix",
};

// "07" pra pedidos com número do dia; sem a migration de numeração aplicada
// cai no começo do uuid, que era o que a tela mostrava antes.
export function orderNumberLabel(order: Pick<ComandaOrder, "id" | "order_number">): string {
  if (order.order_number != null) return String(order.order_number).padStart(2, "0");
  return order.id.slice(0, 4).toUpperCase();
}

const FRACTIONS: Record<number, string> = { 2: "½", 3: "⅓", 4: "¼" };

// Pizza meio a meio aparece como "½ Calabresa / ½ Mussarela": é assim que o
// pizzaiolo lê, e já diz em quantas partes dividir a pizza.
export function flavorLines(item: ComandaItem): { fraction: string | null; name: string }[] {
  const names = item.order_item_flavors
    .map((f) => f.flavor?.name)
    .filter((n): n is string => Boolean(n));
  const fraction = FRACTIONS[names.length] ?? null;
  return names.map((name) => ({ fraction, name }));
}

// "Pizza G (8 fatias)" → { title: "Pizza G", detail: "8 fatias" }
export function splitItemName(name: string): { title: string; detail: string | null } {
  const match = name.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (!match) return { title: name, detail: null };
  return { title: match[1], detail: match[2] };
}

export function isDrink(item: ComandaItem): boolean {
  return item.menu_item?.category === "bebida";
}

// "Troco para R$ 100,00 (levar R$ 37,50)" — só pra dinheiro com troco.
export function changeLabel(order: Pick<ComandaOrder, "payment_method" | "total" | "change_for">): string | null {
  if (order.payment_method !== "dinheiro" || order.change_for == null || order.total == null) return null;
  const changeFor = Number(order.change_for);
  const total = Number(order.total);
  if (changeFor <= total) return null;
  return `Troco para ${formatBRL(changeFor)} (levar ${formatBRL(changeFor - total)})`;
}

export function formatAddress(order: ComandaOrder): string | null {
  if (!order.address_street) return null;
  const line1 = `${order.address_street}, ${order.address_number ?? "s/n"}`;
  const complement = order.address_complement ? ` - ${order.address_complement}` : "";
  return `${line1}${complement}, ${order.address_neighborhood}, ${order.address_city}`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function elapsedMinutes(since: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
}

export type Urgency = "ok" | "atencao" | "atrasado";

// Com tempo de preparo informado ao aceitar: atenção a partir de 75% do
// prazo, atrasado depois dele. Sem prazo, usa 20/30 min como referência.
export function urgencyOf(elapsed: number, target: number | null | undefined): Urgency {
  const limit = target && target > 0 ? target : 30;
  const warnAt = target && target > 0 ? Math.floor(target * 0.75) : 20;
  if (elapsed > limit) return "atrasado";
  if (elapsed >= warnAt) return "atencao";
  return "ok";
}

// Versão de papel da comanda, renderizada direto no <body> e só visível na
// impressão (ver .print-root em globals.css). Preto puro, fonte grande,
// cabe em bobina térmica de 80mm.
export function ComandaPrint({ order }: { order: ComandaOrder | null }) {
  if (!order || typeof document === "undefined") return null;

  const kitchenItems = order.items.filter((i) => !isDrink(i));
  const drinks = order.items.filter(isDrink);
  const address = formatAddress(order);
  const rule = { borderTop: "1.5px dashed #000", margin: "8px 0" } as const;

  return createPortal(
    <div className="print-root">
      <div style={{ fontSize: "11pt", lineHeight: 1.3 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: "12pt", letterSpacing: "0.04em" }}>
            SIDNEY &amp; SHIRLEY PIZZARIA
          </div>
          <div style={{ fontSize: "9pt" }}>Comanda de produção</div>
        </div>
        <div style={rule} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontWeight: 800, fontSize: "22pt" }}>Nº {orderNumberLabel(order)}</span>
          <span style={{ fontSize: "10pt" }}>
            {new Date(order.created_at).toLocaleDateString("pt-BR")} {clockTime(order.created_at)}
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "14pt" }}>
          {order.customer?.name || "Cliente sem nome"}
        </div>
        <div style={{ fontWeight: 800, fontSize: "12pt" }}>
          {order.order_type === "entrega" ? "» ENTREGA" : "» RETIRADA NO BALCÃO"}
        </div>
        {order.estimated_minutes != null && (
          <div style={{ fontSize: "10pt" }}>Preparo: {order.estimated_minutes} min</div>
        )}
        <div style={rule} />

        {kitchenItems.map((item) => {
          const { title, detail } = splitItemName(item.menu_item?.name ?? "Item");
          return (
            <div key={item.id} style={{ marginBottom: "8px" }}>
              <div style={{ fontWeight: 800, fontSize: "14pt" }}>
                {item.quantity}x {title.toUpperCase()}
                {detail ? <span style={{ fontWeight: 400, fontSize: "10pt" }}> ({detail})</span> : null}
              </div>
              {flavorLines(item).map((f, idx) => (
                <div key={idx} style={{ fontSize: "13pt", paddingLeft: "10px", fontWeight: 700 }}>
                  {f.fraction ? `${f.fraction} ` : "- "}
                  {f.name}
                </div>
              ))}
              {item.crust?.name && (
                <div style={{ fontSize: "11pt", paddingLeft: "10px" }}>Borda: {item.crust.name}</div>
              )}
              {item.item_notes && (
                <div
                  style={{
                    fontSize: "11pt",
                    fontWeight: 700,
                    border: "1.5px solid #000",
                    padding: "2px 6px",
                    marginTop: "3px",
                  }}
                >
                  OBS: {item.item_notes}
                </div>
              )}
            </div>
          );
        })}

        {drinks.length > 0 && (
          <>
            <div style={rule} />
            <div style={{ fontWeight: 800, fontSize: "10pt" }}>BEBIDAS</div>
            {drinks.map((d) => (
              <div key={d.id} style={{ fontSize: "11pt" }}>
                {d.quantity}x {d.menu_item?.name}
              </div>
            ))}
          </>
        )}

        {order.notes && (
          <>
            <div style={rule} />
            <div style={{ fontSize: "11pt", fontWeight: 700 }}>OBS DO PEDIDO: {order.notes}</div>
          </>
        )}

        {(address || order.payment_method || order.total != null) && (
          <>
            <div style={rule} />
            {address && <div style={{ fontSize: "10pt" }}>{address}</div>}
            {order.customer?.phone && <div style={{ fontSize: "10pt" }}>Tel: {order.customer.phone}</div>}
            {order.payment_method && (
              <div style={{ fontSize: "10pt" }}>
                Pagamento: {PAYMENT_LABELS[order.payment_method] ?? order.payment_method}
              </div>
            )}
            {order.total != null && (
              <div style={{ fontWeight: 800, fontSize: "13pt" }}>Total: {formatBRL(Number(order.total))}</div>
            )}
            {changeLabel(order) && (
              <div style={{ fontWeight: 800, fontSize: "11pt", border: "1.5px solid #000", padding: "2px 6px", marginTop: "3px" }}>
                {changeLabel(order)}
              </div>
            )}
          </>
        )}
        <div style={rule} />
        <div style={{ textAlign: "center", fontSize: "9pt" }}>Sabor que chega quente até você</div>
      </div>
    </div>,
    document.body,
  );
}

// Monta a comanda no body e chama a impressão do navegador. O
// requestAnimationFrame espera o React pintar o portal antes do print().
export function printAfterRender(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
