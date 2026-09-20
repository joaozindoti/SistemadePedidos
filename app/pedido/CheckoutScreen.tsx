"use client";

import type { CartItem } from "@/lib/types";
import { formatBRL, Icon } from "./icons";

export type PaymentMethod = "dinheiro" | "cartao" | "pix";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão na entrega" },
  { value: "pix", label: "Pix" },
];

export default function CheckoutScreen({
  cart,
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
  total,
  submitting,
  onBack,
  onConfirm,
}: {
  cart: CartItem[];
  onRemoveItem: (key: string) => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  orderType: "entrega" | "retirada" | null;
  onOrderTypeChange: (type: "entrega" | "retirada") => void;
  address: string;
  onAddressChange: (value: string) => void;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  orderNotes: string;
  onOrderNotesChange: (value: string) => void;
  total: number;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const canConfirm =
    cart.length > 0 &&
    customerName.trim().length > 0 &&
    customerPhone.replace(/\D/g, "").length >= 10 &&
    orderType !== null &&
    (orderType !== "entrega" || address.trim().length > 0) &&
    paymentMethod !== null &&
    !submitting;

  return (
    <div className="min-h-dvh bg-surface pb-40">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-space-sm bg-surface-container-lowest px-margin shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar ao cardápio"
          className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
        >
          <Icon name="arrow_back" className="text-[20px]" />
        </button>
        <span className="font-headline-md text-headline-md uppercase tracking-wide text-primary">
          Sua sacola
        </span>
      </header>

      <main className="mx-auto w-full max-w-lg px-margin pt-24">
        <section className="flex flex-col divide-y divide-surface-container-high">
          {cart.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-space-sm py-space-sm">
              <div className="min-w-0 flex-1">
                <p className="font-body-md text-body-md text-on-surface">
                  {item.quantity}× {item.menu_item_name}
                  {item.flavor_names && item.flavor_names.length > 0
                    ? ` · ${item.flavor_names.join(" + ")}`
                    : ""}
                </p>
                {item.item_notes && (
                  <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                    {item.item_notes}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-space-sm">
                <span className="font-label-lg text-label-lg text-primary">
                  {formatBRL(item.unit_price * item.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.key)}
                  aria-label={`Remover ${item.menu_item_name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <Icon name="close" className="text-[16px]" />
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Seu nome
          </span>
          <input
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
            placeholder="Como podemos te chamar"
            className="w-full rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
          />
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Telefone
          </span>
          <input
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange(e.target.value)}
            placeholder="(99) 99999-9999"
            type="tel"
            inputMode="tel"
            className="w-full rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
          />
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Entrega ou retirada?
          </span>
          <div className="mt-space-xs flex gap-space-sm">
            {(["entrega", "retirada"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onOrderTypeChange(type)}
                className={`flex-1 rounded-full py-space-sm font-headline-md text-headline-md uppercase transition-colors ${
                  orderType === type
                    ? "bg-primary font-bold text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {type === "entrega" ? "Entrega" : "Retirada"}
              </button>
            ))}
          </div>
        </section>

        {orderType === "entrega" && (
          <section className="mt-space-lg flex flex-col gap-space-xs">
            <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
              Endereço completo
            </span>
            <textarea
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Rua, número, bairro, ponto de referência"
              rows={3}
              className="w-full resize-none rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
            />
          </section>
        )}

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Forma de pagamento
          </span>
          <div className="mt-space-xs flex flex-wrap gap-space-sm">
            {PAYMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onPaymentMethodChange(option.value)}
                className={`rounded-full px-space-md py-space-xs font-headline-md text-headline-md uppercase transition-colors ${
                  paymentMethod === option.value
                    ? "bg-primary font-bold text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-space-lg flex flex-col gap-space-xs">
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Observação do pedido (opcional)
          </span>
          <textarea
            value={orderNotes}
            onChange={(e) => onOrderNotesChange(e.target.value)}
            placeholder="Algo geral sobre o pedido"
            rows={2}
            className="w-full resize-none rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
          />
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface-container-lowest px-margin py-space-md shadow-[0_-1px_8px_rgba(0,0,0,0.4)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-space-md">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Total
            </span>
            <span className="font-label-lg text-label-lg text-primary">
              {formatBRL(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 rounded-full bg-primary py-space-md text-center font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Enviando…" : "Confirmar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
