"use client";

import { useId } from "react";
import { ORDER_LIMITS, type Address, type CartItem, type TaxaEntrega } from "@/lib/types";
import { formatBRL, Icon } from "./icons";
import { parseMoney as parseMoneyAny } from "@/lib/ui";

// Troco precisa ser positivo; o parse compartilhado aceita zero (preço grátis).
export function parseMoney(raw: string): number | null {
  const n = parseMoneyAny(raw);
  return n !== null && n > 0 ? n : null;
}

// Mesma regra de canonicalPhone (supabase/functions/_shared/phone.ts); mudar
// lá exige mudar aqui. Aceita DDD + número (10/11 dígitos) ou 55 + DDD +
// número (12/13); DDD sem zero; com 9 dígitos no número, só celular (9…).
export function isValidPhone(raw: string): boolean {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!digits.startsWith("55") || (digits.length !== 12 && digits.length !== 13)) return false;
  if (!/^[1-9][1-9]$/.test(digits.slice(2, 4))) return false;
  const numero = digits.slice(4);
  return numero.length !== 9 || numero.startsWith("9");
}

export type PaymentMethod = "dinheiro" | "cartao" | "pix";

// Notas comuns acima do total, pros atalhos "R$ 50 / R$ 100".
function changeSuggestions(total: number): number[] {
  return [10, 20, 50, 100, 200].filter((v) => v > total).slice(0, 3);
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão na entrega" },
  { value: "pix", label: "Pix" },
];

const INPUT_CLASS =
  "w-full rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary";
const HEADING_CLASS = "font-headline-md text-headline-md uppercase tracking-wider text-on-surface";
const SMALL_LABEL_CLASS = "font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant";

// "seu nome, telefone com DDD e mais 3": cabe na barra de baixo sem virar
// um parágrafo; o toque em "Confirmar" leva ao primeiro da lista.
function joinPending(items: string[]): string {
  const MAX_SHOWN = 3;
  if (items.length > MAX_SHOWN) {
    return `${items.slice(0, MAX_SHOWN - 1).join(", ")} e mais ${items.length - (MAX_SHOWN - 1)}`;
  }
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

export default function CheckoutScreen({
  cart,
  notice,
  onRemoveItem,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  orderType,
  onOrderTypeChange,
  address,
  onAddressChange,
  paymentMethod,
  onPaymentMethodChange,
  orderNotes,
  onOrderNotesChange,
  changeFor,
  onChangeForChange,
  lojaFechada,
  horarioTexto,
  total,
  subtotal,
  deliveryFee,
  cidades,
  submitting,
  onBack,
  onConfirm,
}: {
  cart: CartItem[];
  notice: string | null;
  onRemoveItem: (key: string) => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  orderType: "entrega" | "retirada" | null;
  onOrderTypeChange: (type: "entrega" | "retirada") => void;
  address: Address;
  onAddressChange: (patch: Partial<Address>) => void;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  orderNotes: string;
  onOrderNotesChange: (value: string) => void;
  changeFor: string;
  onChangeForChange: (value: string) => void;
  lojaFechada: boolean;
  horarioTexto: string | null;
  total: number;
  subtotal: number;
  deliveryFee: number;
  cidades: TaxaEntrega[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const uid = useId();
  const ids = {
    name: `${uid}-nome`,
    phone: `${uid}-telefone`,
    orderType: `${uid}-tipo`,
    street: `${uid}-rua`,
    number: `${uid}-numero`,
    complement: `${uid}-complemento`,
    neighborhood: `${uid}-bairro`,
    city: `${uid}-cidade`,
    payment: `${uid}-pagamento`,
    change: `${uid}-troco`,
    changeHeading: `${uid}-troco-titulo`,
    notes: `${uid}-obs`,
    pending: `${uid}-pendente`,
  };

  const changeValue = changeFor === "sem" ? null : parseMoney(changeFor);
  const changeTooLow = changeValue !== null && Math.round(changeValue * 100) < Math.round(total * 100);
  const changeAnswered = changeFor === "sem" || (changeValue !== null && !changeTooLow);

  const phoneDigits = customerPhone.replace(/\D/g, "").length;
  // Curto demais é "ainda digitando"; a partir de 10 dígitos já dá pra julgar.
  const phoneInvalid = phoneDigits >= ORDER_LIMITS.phoneMinDigits && !isValidPhone(customerPhone);
  const cartTooBig = cart.length > ORDER_LIMITS.maxCartItems;

  // O que ainda impede o envio, na ordem da tela. `focus` é o campo que
  // recebe o foco quando o cliente toca em "Confirmar" sem ter terminado.
  const pending: { label: string; focus?: string }[] = [];
  if (cart.length === 0) pending.push({ label: "colocar algo na sacola" });
  if (cartTooBig) {
    pending.push({ label: `deixar a sacola com até ${ORDER_LIMITS.maxCartItems} itens` });
  }
  if (!customerName.trim()) pending.push({ label: "seu nome", focus: ids.name });
  if (phoneInvalid) pending.push({ label: "um telefone válido", focus: ids.phone });
  else if (phoneDigits < ORDER_LIMITS.phoneMinDigits) {
    pending.push({ label: "telefone com DDD", focus: ids.phone });
  }
  if (orderType === null) pending.push({ label: "entrega ou retirada", focus: ids.orderType });
  if (orderType === "entrega") {
    if (!address.street.trim()) pending.push({ label: "rua", focus: ids.street });
    if (!address.number.trim()) pending.push({ label: "número", focus: ids.number });
    if (!address.neighborhood.trim()) pending.push({ label: "bairro", focus: ids.neighborhood });
    if (!address.city.trim()) pending.push({ label: "cidade", focus: ids.city });
  }
  if (paymentMethod === null) pending.push({ label: "forma de pagamento", focus: ids.payment });
  if (paymentMethod === "dinheiro" && !changeAnswered) {
    pending.push({
      label: changeTooLow ? "troco igual ou maior que o total" : "se precisa de troco",
      focus: ids.change,
    });
  }

  const canConfirm = pending.length === 0 && !lojaFechada && !submitting;

  function handleConfirmClick() {
    if (submitting || lojaFechada) return;
    const first = pending.find((p) => p.focus);
    if (pending.length > 0) {
      if (first?.focus) {
        const el = document.getElementById(first.focus);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      }
      return;
    }
    onConfirm();
  }

  function choiceClass(selected: boolean, size: "lg" | "sm" = "lg") {
    const base =
      size === "lg"
        ? "min-h-11 rounded-full font-headline-md text-headline-md uppercase transition-colors"
        : "min-h-11 rounded-full px-space-md font-body-sm text-body-sm font-semibold transition-colors";
    return `${base} ${
      selected
        ? `bg-primary text-on-primary ${size === "lg" ? "font-bold" : ""}`
        : "bg-surface-container text-on-surface-variant hover:text-on-surface"
    }`;
  }

  return (
    <div className="min-h-dvh bg-surface pb-56">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-space-sm bg-surface-container-lowest px-margin shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar ao cardápio"
          className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
        >
          <Icon name="arrow_back" className="text-[20px]" />
        </button>
        <h1 className="font-headline-md text-headline-md uppercase tracking-wide text-primary">
          Sua sacola
        </h1>
      </header>

      <main className="mx-auto w-full max-w-lg px-margin pt-24">
        {lojaFechada && (
          <p
            role="alert"
            className="mb-space-md flex items-start gap-space-sm rounded-lg bg-error-container px-space-md py-space-sm font-body-md text-body-md font-semibold text-on-error-container"
          >
            <Icon name="schedule" className="mt-0.5 text-[20px]" />
            Estamos fechados agora{horarioTexto ? ` — funcionamos ${horarioTexto}` : ""}. Não dá pra
            confirmar pedidos neste momento.
          </p>
        )}
        {notice && (
          <p
            role="alert"
            className="mb-space-md flex items-start gap-space-sm rounded-lg bg-error-container px-space-md py-space-sm font-body-md text-body-md font-semibold text-on-error-container"
          >
            <Icon name="error" className="mt-0.5 text-[20px]" />
            {notice}
          </p>
        )}
        {cart.length === 0 && (
          <p className="py-space-md font-body-md text-body-md text-on-surface-variant">
            Sua sacola está vazia.{" "}
            <button
              type="button"
              onClick={onBack}
              className="min-h-11 font-semibold text-primary underline underline-offset-4"
            >
              Voltar ao cardápio
            </button>
          </p>
        )}
        <ul className="flex flex-col divide-y divide-surface-container-high">
          {cart.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-space-sm py-space-sm">
              <div className="min-w-0 flex-1">
                <p className="font-body-md text-body-md text-on-surface">
                  {item.quantity}× {item.menu_item_name}
                  {item.flavor_names && item.flavor_names.length > 0
                    ? ` · ${item.flavor_names.join(" + ")}`
                    : ""}
                </p>
                {item.crust_name && (
                  <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    Borda: {item.crust_name}
                  </p>
                )}
                {item.item_notes && (
                  <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    {item.item_notes}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-space-xs">
                <span className="font-label-lg text-label-lg text-primary">
                  {formatBRL(item.unit_price * item.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.key)}
                  aria-label={`Remover ${item.quantity}× ${item.menu_item_name}${
                    item.flavor_names?.length ? ` ${item.flavor_names.join(" + ")}` : ""
                  }`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {cartTooBig && (
          <p role="alert" className="mt-space-sm font-body-sm text-body-sm font-semibold text-error">
            A sacola aceita até {ORDER_LIMITS.maxCartItems} itens por pedido. Remova{" "}
            {cart.length - ORDER_LIMITS.maxCartItems} para continuar.
          </p>
        )}

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <label htmlFor={ids.name} className={HEADING_CLASS}>
            Seu nome
          </label>
          <input
            id={ids.name}
            value={customerName}
            maxLength={ORDER_LIMITS.nameMax}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Como podemos te chamar"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            className={INPUT_CLASS}
          />
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <label htmlFor={ids.phone} className={HEADING_CLASS}>
            Telefone (WhatsApp)
          </label>
          <input
            id={ids.phone}
            value={customerPhone}
            maxLength={20}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="(99) 99999-9999"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            aria-invalid={phoneInvalid || undefined}
            aria-describedby={phoneInvalid ? `${ids.phone}-erro` : undefined}
            className={INPUT_CLASS}
          />
          {phoneInvalid && (
            <p id={`${ids.phone}-erro`} className="font-body-sm text-body-sm font-semibold text-error">
              Confira o telefone: use DDD + número, como (85) 99999-9999. Celular tem 9 dígitos começando com 9.
            </p>
          )}
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <h2 id={`${ids.orderType}-titulo`} className={HEADING_CLASS}>
            Entrega ou retirada?
          </h2>
          <div
            role="group"
            aria-labelledby={`${ids.orderType}-titulo`}
            className="mt-space-xs flex gap-space-sm"
          >
            {(["entrega", "retirada"] as const).map((type, i) => (
              <button
                key={type}
                id={i === 0 ? ids.orderType : undefined}
                type="button"
                onClick={() => onOrderTypeChange(type)}
                aria-pressed={orderType === type}
                className={`flex-1 py-space-sm ${choiceClass(orderType === type)}`}
              >
                {type === "entrega" ? "Entrega" : "Retirada"}
              </button>
            ))}
          </div>
        </section>

        {orderType === "entrega" && (
          <fieldset className="mt-space-lg flex flex-col gap-space-sm">
            <legend className={`${HEADING_CLASS} mb-space-sm`}>Endereço de entrega</legend>

            <div className="flex gap-space-sm">
              <div className="flex flex-[3] flex-col gap-1">
                <label htmlFor={ids.street} className={SMALL_LABEL_CLASS}>
                  Rua
                </label>
                <input
                  id={ids.street}
                  value={address.street}
                  maxLength={ORDER_LIMITS.addressFieldMax}
                  onChange={(e) => onAddressChange({ street: e.target.value })}
                  placeholder="Rua, avenida…"
                  autoComplete="address-line1"
                  enterKeyHint="next"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor={ids.number} className={SMALL_LABEL_CLASS}>
                  Número
                </label>
                <input
                  id={ids.number}
                  value={address.number}
                  maxLength={ORDER_LIMITS.addressFieldMax}
                  onChange={(e) => onAddressChange({ number: e.target.value })}
                  placeholder="Nº"
                  inputMode="text"
                  enterKeyHint="next"
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={ids.complement} className={SMALL_LABEL_CLASS}>
                Complemento (opcional)
              </label>
              <input
                id={ids.complement}
                value={address.complement}
                maxLength={ORDER_LIMITS.addressFieldMax}
                onChange={(e) => onAddressChange({ complement: e.target.value })}
                placeholder="Casa, apto, ponto de referência"
                autoComplete="address-line2"
                enterKeyHint="next"
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={ids.neighborhood} className={SMALL_LABEL_CLASS}>
                Bairro
              </label>
              <input
                id={ids.neighborhood}
                value={address.neighborhood}
                maxLength={ORDER_LIMITS.addressFieldMax}
                onChange={(e) => onAddressChange({ neighborhood: e.target.value })}
                autoComplete="address-level3"
                enterKeyHint="next"
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={ids.city} className={SMALL_LABEL_CLASS}>
                Cidade
              </label>
              <select
                id={ids.city}
                value={address.city}
                onChange={(e) => onAddressChange({ city: e.target.value })}
                autoComplete="address-level2"
                className={INPUT_CLASS}
              >
                <option value="">Escolha a cidade</option>
                {cidades.map((c) => (
                  <option key={c.cidade} value={c.cidade}>
                    {c.cidade} (entrega {formatBRL(Number(c.valor))})
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        )}

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <h2 id={`${ids.payment}-titulo`} className={HEADING_CLASS}>
            Forma de pagamento
          </h2>
          <div
            role="group"
            aria-labelledby={`${ids.payment}-titulo`}
            className="mt-space-xs flex flex-wrap gap-space-sm"
          >
            {PAYMENT_OPTIONS.map((option, i) => (
              <button
                key={option.value}
                id={i === 0 ? ids.payment : undefined}
                type="button"
                onClick={() => onPaymentMethodChange(option.value)}
                aria-pressed={paymentMethod === option.value}
                className={`px-space-md py-space-xs ${choiceClass(paymentMethod === option.value)}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {paymentMethod === "dinheiro" && (
            <div className="mt-space-sm flex flex-col gap-space-sm rounded-lg border border-outline-variant bg-surface-container-low p-space-sm">
              <span
                id={ids.changeHeading}
                className="font-body-md text-body-md font-semibold text-on-surface"
              >
                Vai precisar de troco?
              </span>
              <div role="group" aria-labelledby={ids.changeHeading} className="flex flex-wrap gap-space-xs">
                <button
                  type="button"
                  onClick={() => onChangeForChange("sem")}
                  aria-pressed={changeFor === "sem"}
                  className={choiceClass(changeFor === "sem", "sm")}
                >
                  Não preciso
                </button>
                {changeSuggestions(total).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChangeForChange(String(v))}
                    aria-pressed={changeValue === v}
                    aria-label={`Troco para ${formatBRL(v)}`}
                    className={choiceClass(changeValue === v, "sm")}
                  >
                    {formatBRL(v)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-space-sm">
                <label
                  htmlFor={ids.change}
                  className="shrink-0 font-body-sm text-body-sm text-on-surface-variant"
                >
                  Troco para
                </label>
                <span className="relative flex flex-1 items-center">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-space-sm font-body-md text-body-md text-on-surface-variant"
                  >
                    R$
                  </span>
                  <input
                    id={ids.change}
                    value={changeFor === "sem" ? "" : changeFor}
                    onChange={(e) => onChangeForChange(e.target.value.replace(/[^0-9,.]/g, ""))}
                    placeholder="0,00"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={changeTooLow || undefined}
                    aria-describedby={changeValue !== null ? `${ids.change}-info` : undefined}
                    className="w-full rounded border border-surface-container-highest bg-surface-container-lowest py-space-sm pl-10 pr-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
                  />
                </span>
              </div>
              {changeValue !== null &&
                (changeTooLow ? (
                  <p id={`${ids.change}-info`} className="font-body-sm text-body-sm font-semibold text-error">
                    O valor precisa ser igual ou maior que o total ({formatBRL(total)}).
                  </p>
                ) : (
                  <p
                    id={`${ids.change}-info`}
                    className="flex items-center justify-between rounded bg-primary/10 px-space-sm py-space-xs font-body-md text-body-md text-on-surface"
                  >
                    <span>Seu troco</span>
                    <strong className="font-display text-2xl text-primary">
                      {formatBRL(changeValue - total)}
                    </strong>
                  </p>
                ))}
            </div>
          )}
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <label htmlFor={ids.notes} className={HEADING_CLASS}>
            Observação do pedido (opcional)
          </label>
          <textarea
            id={ids.notes}
            value={orderNotes}
            maxLength={ORDER_LIMITS.notesMax}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            placeholder="Algo geral sobre o pedido"
            rows={2}
            className={`resize-none ${INPUT_CLASS}`}
          />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface-container-lowest px-margin py-space-md shadow-[0_-1px_8px_rgba(0,0,0,0.4)]">
        <div className="mx-auto flex max-w-lg flex-col gap-space-sm">
          {!lojaFechada && pending.length > 0 && (
            <p
              id={ids.pending}
              aria-live="polite"
              className="flex items-start gap-space-xs font-body-sm text-body-sm text-on-surface-variant"
            >
              <Icon name="error" className="mt-0.5 text-[16px] text-primary" />
              <span>
                Falta: {joinPending(pending.map((p) => p.label))}.
              </span>
            </p>
          )}
          <div className="flex items-center justify-between gap-space-md">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {deliveryFee > 0
                  ? `Total (${formatBRL(subtotal)} + entrega ${formatBRL(deliveryFee)})`
                  : "Total"}
              </span>
              <span className="font-label-lg text-label-lg text-primary">
                {formatBRL(total)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleConfirmClick}
              disabled={lojaFechada || submitting}
              aria-disabled={!canConfirm || undefined}
              aria-describedby={!lojaFechada && pending.length > 0 ? ids.pending : undefined}
              className={`min-h-11 flex-1 rounded-full bg-primary py-space-md text-center font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed ${
                canConfirm ? "" : "opacity-40"
              }`}
            >
              {lojaFechada ? "Fechado agora" : submitting ? "Enviando…" : "Confirmar pedido"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
