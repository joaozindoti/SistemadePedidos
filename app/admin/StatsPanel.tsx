"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL } from "@/lib/ui";

interface OrderSummary {
  status: string;
  total: number;
}

const STATUS_ROWS: { status: string; label: string }[] = [
  { status: "pendente", label: "Pendente" },
  { status: "preparo", label: "Em preparo" },
  { status: "pronto", label: "Pronto" },
  { status: "finalizado", label: "Finalizado" },
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
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const load = useCallback(async () => {
    setLoadState("loading");
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("orders")
      .select("status, total")
      .gte("created_at", startOfDay.toISOString());

    if (error) {
      setLoadState("error");
      return;
    }

    setOrders((data ?? []) as OrderSummary[]);
    setLoadState("ready");
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("orders")
        .select("status, total")
        .gte("created_at", startOfDay.toISOString());

      if (cancelled) return;
      if (error) {
        setLoadState("error");
        return;
      }

      setOrders((data ?? []) as OrderSummary[]);
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadState === "loading") {
    return (
      <p className="py-space-xl text-center font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
        Carregando estatísticas…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Não conseguimos carregar as estatísticas agora.
        </p>
        <button
          type="button"
          onClick={() => load()}
          className="font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const totalPedidos = orders.length;
  const faturamento = orders
    .filter((o) => o.status !== "pendente")
    .reduce((sum, o) => sum + Number(o.total), 0);

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-2 gap-space-sm">
        <StatCard label="Pedidos hoje" value={String(totalPedidos)} />
        <StatCard label="Faturamento hoje" value={formatBRL(faturamento)} />
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
                {orders.filter((o) => o.status === status).length}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => load()}
        className="min-h-11 rounded-full border border-flour/15 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
      >
        Atualizar
      </button>
    </div>
  );
}
