import { Icon } from "./icons";

export default function ErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin py-space-xl text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-container/40">
        <Icon name="error" className="text-error text-[32px]" />
      </div>
      <h1 className="mt-space-md font-headline-lg text-headline-lg uppercase tracking-wide text-on-surface">
        Não deu pra confirmar
      </h1>
      <p className="mt-space-sm max-w-xs font-body-md text-body-md text-on-surface-variant">
        {message}
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="mt-space-xl w-full max-w-xs rounded-full bg-primary py-space-md font-headline-md text-headline-md uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container"
      >
        Tentar de novo
      </button>
    </div>
  );
}
