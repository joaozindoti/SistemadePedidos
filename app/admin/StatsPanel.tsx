"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL } from "@/lib/ui";

// Formato devolvido pela RPC resumo_do_dia(): o banco corta o dia no fuso
// America/Fortaleza e soma o faturamento só dos status faturáveis (preparo,
// pronto, saiu_entrega, finalizado). por_status sempre traz os 7 status.
interface ResumoDoDia {
  dia: string;
  pedidos: number;
  faturamento: number | string;
  por_status: Record<string, number>;
}

const STATUS_ROWS: { status: string; label: string }[] = [
  { status: "pendente", label: "Pendente" },
  { status: "confirmado", label: "Confirmado" },
  { status: "preparo", label: "Em preparo" },
  { status: "pronto", label: "Pronto" },
  { status: "saiu_entrega", label: "Saiu para entrega" },
  { status: "finalizado", label: "Finalizado" },
  { status: "cancelado", label: "Cancelado" },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-space-xs rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-md">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <span className="font-headline-lg text-headline-lg text-primary">{value}</span>
    </div>
  );
}

export default function StatsPanel() {
  const supabase = createClient();
  const [resumo, setResumo] = useState<ResumoDoDia | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const load = useCallback(async () => {
    setLoadState("loading");
    const { data, error } = await supabase.rpc("resumo_do_dia");

    if (error || !data) {
      console.log("Falha ao carregar o resumo do dia:", error);
      setLoadState("error");
      return;
    }

    setResumo(data as ResumoDoDia);
    setLoadState("ready");
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loadState === "loading") {
    return (
      <p className="py-space-xl text-center font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
        Carregando estatísticas…
      </p>
    );
  }

  if (loadState === "error" || !resumo) {
    return (
      <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Não conseguimos carregar as estatísticas agora.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="min-h-11 font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-2 gap-space-sm">
        <StatCard label="Pedidos hoje" value={String(resumo.pedidos)} />
        <StatCard label="Faturamento hoje" value={formatBRL(Number(resumo.faturamento))} />
      </div>

      <section className="flex flex-col gap-space-xs rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-sm">
        <h2 className="border-b border-surface-container-highest pb-space-xs font-headline-md text-headline-md uppercase tracking-wide text-primary">
          Pedidos por status
        </h2>
        <div className="flex flex-col divide-y divide-surface-container-high">
          {STATUS_ROWS.map(({ status, label }) => (
            <div key={status} className="flex items-center justify-between py-space-xs">
              <span className="font-body-md text-body-md text-on-surface">{label}</span>
              <span className="font-mono text-body-md text-primary">
                {resumo.por_status[status] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => load()}
        className="min-h-11 rounded-full border border-outline-variant font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
      >
        Atualizar
      </button>
    </div>
  );
}
