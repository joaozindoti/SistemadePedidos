import { formatBRL, Icon } from "./icons";

export default function SuccessScreen({
  orderId,
  total,
  onNewOrder,
}: {
  orderId: string;
  total: number;
  onNewOrder: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin py-space-xl text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
        <Icon name="check_circle" className="text-primary text-[32px]" />
      </div>
      <span className="mt-space-md font-label-sm text-label-sm uppercase tracking-wider text-primary">
        Pedido confirmado
      </span>
      <h1 className="mt-space-xs font-headline-xl text-headline-xl uppercase tracking-wide text-on-surface">
        Nº {orderId.slice(0, 8).toUpperCase()}
      </h1>
      <p className="mt-space-sm max-w-xs font-body-md text-body-md text-on-surface-variant">
        Vamos te avisando por aqui e também pelo WhatsApp, conforme o pedido
        for andando.
      </p>
      <p className="mt-space-lg font-label-lg text-label-lg text-primary">
        {formatBRL(total)}
      </p>
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
