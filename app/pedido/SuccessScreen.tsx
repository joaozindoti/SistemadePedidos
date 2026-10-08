import Image from "next/image";
import { formatBRL, Icon } from "./icons";

export default function SuccessScreen({
  orderId,
  orderNumber,
  total,
  onNewOrder,
}: {
  orderId: string;
  orderNumber: number | null;
  total: number;
  onNewOrder: () => void;
}) {
  // Sem a migration de numeração aplicada, cai no começo do uuid.
  const label =
    orderNumber != null ? String(orderNumber).padStart(2, "0") : orderId.slice(0, 8).toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin py-space-xl text-center">
      <Image src="/brand/logo.png" alt="Sidney & Shirley Pizzaria" width={120} height={120} className="h-28 w-28" />
      <span className="mt-space-md flex items-center gap-space-xs rounded-full bg-primary/15 px-space-md py-1 text-sm font-bold uppercase tracking-[0.15em] text-primary">
        <Icon name="check_circle" className="text-[18px]" />
        Pedido confirmado
      </span>
      <span className="mt-space-md text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant">
        Número do pedido
      </span>
      <h1 className="font-display text-7xl font-extrabold tabular-nums tracking-wide text-on-surface">
        {label}
      </h1>
      <p className="mt-space-sm max-w-xs font-body-md text-body-md text-on-surface-variant">
        Já recebemos! Vamos te avisando por aqui e pelo WhatsApp conforme o pedido for andando.
      </p>
      <p className="mt-space-lg font-display text-3xl font-extrabold text-primary">{formatBRL(total)}</p>
      <button
        type="button"
        onClick={onNewOrder}
        className="mt-space-xl font-label-md text-label-md uppercase tracking-wider text-on-surface-variant underline underline-offset-4 transition-colors hover:text-on-surface"
      >
        Fazer novo pedido
      </button>
    </div>
  );
}
