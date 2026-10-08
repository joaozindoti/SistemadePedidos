"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { Icon } from "@/lib/ui";
import { playNewOrderBeep, unlockAudioOnFirstTouch } from "@/lib/sound";
import {
  ComandaPrint,
  clockTime,
  elapsedMinutes,
  flavorLines,
  isDrink,
  orderNumberLabel,
  printAfterRender,
  splitItemName,
  urgencyOf,
  type ComandaOrder,
  type Urgency,
} from "./comanda";

// "*" em vez de listar colunas: a tela continua abrindo mesmo que alguma
// migration (accepted_at, order_number) ainda não tenha sido aplicada.
const ORDER_SELECT = `
  *,
  customer:customers ( name ),
  items:order_items (
    id, quantity, item_notes,
    menu_item:menu_items ( name, category ),
    crust:crusts ( name ),
    order_item_flavors ( flavor:flavors ( name ) )
  )
`;

// A RLS da cozinha só entrega eventos de linhas em 'preparo', então quando
// outro aparelho tira um pedido de preparo o evento não chega aqui. Esse
// refetch periódico cobre esse caso.
const REFRESH_INTERVAL_MS = 20000;

function startedAt(order: ComandaOrder): string {
  return order.accepted_at ?? order.created_at;
}

function sortOldestFirst(orders: ComandaOrder[]): ComandaOrder[] {
  return [...orders].sort(
    (a, b) => new Date(startedAt(a)).getTime() - new Date(startedAt(b)).getTime(),
  );
}

const STRIP_STYLES: Record<Urgency, string> = {
  ok: "bg-surface-container-high text-on-surface",
  atencao: "bg-warn text-on-warn",
  atrasado: "bg-alert text-on-alert",
};

const URGENCY_LABEL: Record<Urgency, string> = {
  ok: "No prazo",
  atencao: "Atenção",
  atrasado: "Atrasado",
};

export default function KitchenDisplay() {
  const supabase = createClient();

  const [orders, setOrders] = useState<ComandaOrder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [deliveryPromptId, setDeliveryPromptId] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [printOrder, setPrintOrder] = useState<ComandaOrder | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // null até o primeiro carregamento: os pedidos que já estavam na tela ao
  // abrir não tocam o aviso, só os que chegarem depois.
  const knownIdsRef = useRef<Set<string> | null>(null);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("status", "preparo");

    if (error) {
      setLoadState((current) => (current === "ready" ? current : "error"));
      return;
    }

    const next = sortOldestFirst((data ?? []) as unknown as ComandaOrder[]);
    const known = knownIdsRef.current;
    if (known) {
      const arrived = next.filter((o) => !known.has(o.id)).map((o) => o.id);
      if (arrived.length > 0) {
        playNewOrderBeep(2);
        setFreshIds((current) => new Set([...current, ...arrived]));
        setTimeout(() => {
          setFreshIds((current) => {
            const rest = new Set(current);
            arrived.forEach((id) => rest.delete(id));
            return rest;
          });
        }, 8000);
      }
    }
    knownIdsRef.current = new Set(next.map((o) => o.id));

    setOrders(next);
    setLoadState("ready");
  }, [supabase]);

  useEffect(() => unlockAudioOnFirstTouch(), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrders();
    const refresh = setInterval(fetchOrders, REFRESH_INTERVAL_MS);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [fetchOrders]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Mesmo cuidado da fila: sem aguardar setAuth() o primeiro subscribe
      // pode sair como anon e a RLS filtra os eventos em silêncio.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel("orders-kitchen")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => {
            fetchOrders();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tela da cozinha fica aberta o expediente todo: pede pro aparelho não
  // apagar a tela (quando o navegador suporta) e renova ao voltar pra aba.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    async function requestLock() {
      try {
        const wakeLock = (navigator as unknown as {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        if (wakeLock && document.visibilityState === "visible") {
          lock = await wakeLock.request("screen");
        }
      } catch {
        // sem permissão/sem suporte: a tela só vai apagar no tempo do aparelho
      }
    }
    requestLock();
    document.addEventListener("visibilitychange", requestLock);
    return () => {
      document.removeEventListener("visibilitychange", requestLock);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!printOrder) return;
    function clear() {
      setPrintOrder(null);
    }
    window.addEventListener("afterprint", clear);
    printAfterRender();
    return () => window.removeEventListener("afterprint", clear);
  }, [printOrder]);

  async function markReady(orderId: string, deliveryMinutes?: number) {
    const patch =
      deliveryMinutes === undefined
        ? { status: "pronto" }
        : { status: "pronto", delivery_estimated_minutes: deliveryMinutes };

    setSavingId(orderId);
    setActionError(null);
    const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
    setSavingId(null);

    if (error) {
      console.log("Falha ao marcar como pronto:", error);
      setActionError("Não deu pra marcar como pronto. Confira a internet e tente de novo.");
      return;
    }

    setOrders((current) => current.filter((o) => o.id !== orderId));
    setDeliveryPromptId(null);
    setEstimateInput("");
  }

  function confirmDeliveryTime(orderId: string) {
    const minutes = Number(estimateInput);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    markReady(orderId, Math.round(minutes));
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  if (loadState === "loading") {
    return (
      <p className="py-space-xl text-center font-headline-md text-headline-md uppercase tracking-wider text-on-surface-variant">
        Carregando comandas…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl text-center">
        <p className="text-2xl text-on-surface-variant">Não conseguimos carregar os pedidos.</p>
        <button
          type="button"
          onClick={() => fetchOrders()}
          className="min-h-16 rounded-full bg-primary px-space-lg font-headline-md text-headline-md font-bold uppercase text-on-primary"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const lateCount = orders.filter(
    (o) => urgencyOf(elapsedMinutes(startedAt(o), now), o.estimated_minutes) === "atrasado",
  ).length;

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="flex items-center gap-space-xs rounded-full bg-primary px-space-md py-space-xs font-display text-2xl font-bold uppercase text-on-primary">
            <Icon name="local_fire_department" className="text-[24px]" />
            {orders.length} no forno
          </span>
          {lateCount > 0 && (
            <span className="flex items-center gap-space-xs rounded-full bg-alert px-space-md py-space-xs font-display text-2xl font-bold uppercase text-on-alert">
              <Icon name="alarm" className="text-[24px]" />
              {lateCount} atrasado{lateCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-space-sm">
          <span className="font-display text-3xl font-bold tabular-nums text-on-surface">
            {new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Tela cheia"
            title="Tela cheia"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Icon name="fullscreen" className="text-[22px]" />
          </button>
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-alert-container px-space-md py-space-sm text-xl font-semibold text-on-alert-container"
        >
          {actionError}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-space-sm py-24 text-center">
          <Icon name="soup_kitchen" className="text-[72px] text-outline" />
          <p className="font-display text-4xl font-bold uppercase text-on-surface">
            Nenhuma pizza na fila
          </p>
          <p className="text-xl text-on-surface-variant">
            Quando o balcão aceitar um pedido, a comanda aparece aqui com aviso sonoro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-space-lg md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order, index) => {
            const elapsed = elapsedMinutes(startedAt(order), now);
            const urgency = urgencyOf(elapsed, order.estimated_minutes);
            const target = order.estimated_minutes ?? null;
            const progress = target ? Math.min(1, elapsed / target) : null;
            const kitchenItems = order.items.filter((i) => !isDrink(i));
            const drinks = order.items.filter(isDrink);
            const saving = savingId === order.id;

            return (
              <article
                key={order.id}
                aria-label={`Comanda do pedido ${orderNumberLabel(order)}`}
                className={`comanda-edge flex flex-col bg-comanda py-[10px] text-on-surface shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${
                  freshIds.has(order.id) ? "animate-comanda-in" : ""
                } ${urgency === "atrasado" ? "animate-comanda-late" : ""}`}
              >
                {/* Faixa do topo: número grande + cronômetro, cor pelo prazo */}
                <header
                  className={`flex items-stretch justify-between gap-space-sm px-space-md py-space-sm ${STRIP_STYLES[urgency]}`}
                >
                  <div className="flex flex-col leading-none">
                    <span className="text-sm font-bold uppercase tracking-[0.2em] opacity-80">
                      {index === 0 ? "Próximo · Pedido" : "Pedido"}
                    </span>
                    <span className="font-display text-7xl font-extrabold tabular-nums">
                      {orderNumberLabel(order)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end justify-center text-right leading-none">
                    <span className="flex items-center gap-1 text-sm font-bold uppercase tracking-[0.15em] opacity-80">
                      <Icon name={urgency === "atrasado" ? "alarm" : "timer"} className="text-[18px]" />
                      {URGENCY_LABEL[urgency]}
                    </span>
                    <span className="font-display text-5xl font-extrabold tabular-nums">
                      {elapsed}
                      <span className="text-2xl font-bold"> min</span>
                    </span>
                    {target && (
                      <span className="text-base font-semibold opacity-85">prazo {target} min</span>
                    )}
                  </div>
                </header>
                {progress !== null && (
                  <div className="h-1.5 w-full bg-surface-container-highest">
                    <div
                      className={`h-full transition-[width] duration-700 ${
                        urgency === "atrasado" ? "bg-alert" : urgency === "atencao" ? "bg-warn" : "bg-primary"
                      }`}
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                )}

                {/* Cliente e tipo */}
                <div className="flex flex-col gap-space-xs px-space-md pt-space-md">
                  <p className="text-[28px] font-bold leading-tight text-on-surface">
                    {order.customer?.name || "Cliente sem nome"}
                  </p>
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span
                      className={`flex items-center gap-space-xs rounded-md px-space-sm py-1 text-lg font-extrabold uppercase tracking-wide ${
                        order.order_type === "entrega"
                          ? "bg-primary text-on-primary"
                          : "border-2 border-on-surface text-on-surface"
                      }`}
                    >
                      <Icon
                        name={order.order_type === "entrega" ? "two_wheeler" : "storefront"}
                        className="text-[22px]"
                      />
                      {order.order_type === "entrega" ? "Entrega" : "Retirada"}
                    </span>
                    <span className="text-lg text-on-surface-variant">
                      Aceito às <strong className="text-on-surface">{clockTime(startedAt(order))}</strong>
                    </span>
                  </div>
                </div>

                <div className="mx-space-md my-space-md border-t-2 border-dashed border-outline-variant" />

                {/* Itens de produção */}
                <ul className="flex flex-col gap-space-md px-space-md">
                  {kitchenItems.map((item) => {
                    const { title, detail } = splitItemName(item.menu_item?.name ?? "Item");
                    const flavors = flavorLines(item);
                    return (
                      <li key={item.id} className="flex gap-space-sm">
                        <span className="flex h-14 min-w-14 shrink-0 items-center justify-center rounded-lg bg-inverse-surface px-1 font-display text-4xl font-extrabold tabular-nums text-inverse-on-surface">
                          {item.quantity}×
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="leading-none">
                            <span className="font-display text-[32px] font-extrabold uppercase text-on-surface">
                              {title}
                            </span>
                            {detail && (
                              <span className="ml-space-xs text-lg font-semibold text-on-surface-variant">
                                {detail}
                              </span>
                            )}
                          </p>
                          {flavors.length > 0 && (
                            <ul className="flex flex-col gap-0.5">
                              {flavors.map((f, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-baseline gap-space-sm text-2xl font-bold text-on-surface"
                                >
                                  <span className="w-7 shrink-0 text-center font-display text-3xl font-extrabold text-primary">
                                    {f.fraction ?? "•"}
                                  </span>
                                  <span>{f.name}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {item.crust?.name && (
                            <p className="text-xl font-semibold text-on-surface">
                              <span className="text-on-surface-variant">Borda:</span> {item.crust.name}
                            </p>
                          )}
                          {item.item_notes && (
                            <p className="mt-1 flex items-start gap-space-xs rounded-md bg-alert-container px-space-sm py-space-xs text-xl font-bold text-on-alert-container">
                              <Icon name="priority_high" className="mt-0.5 text-[22px]" />
                              {item.item_notes}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {drinks.length > 0 && (
                  <div className="mx-space-md mt-space-md flex flex-col gap-1 rounded-lg border border-outline-variant px-space-sm py-space-xs">
                    <span className="flex items-center gap-space-xs text-sm font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                      <Icon name="local_drink" className="text-[18px]" />
                      Separar bebidas
                    </span>
                    {drinks.map((d) => (
                      <span key={d.id} className="text-xl font-semibold text-on-surface">
                        {d.quantity}× {d.menu_item?.name}
                      </span>
                    ))}
                  </div>
                )}

                {order.notes && (
                  <div className="mx-space-md mt-space-md rounded-lg bg-alert-container px-space-sm py-space-sm text-on-alert-container">
                    <span className="text-sm font-bold uppercase tracking-[0.15em] opacity-85">
                      Observação do pedido
                    </span>
                    <p className="text-xl font-bold">{order.notes}</p>
                  </div>
                )}

                {/* Ações */}
                <div className="mt-space-lg px-space-md pb-space-sm">
                  {deliveryPromptId === order.id ? (
                    <div className="flex flex-col gap-space-xs">
                      <span className="text-lg font-bold uppercase tracking-wide text-on-surface-variant">
                        Tempo até a entrega (min)
                      </span>
                      <div className="flex items-center gap-space-xs">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          autoFocus
                          value={estimateInput}
                          onChange={(e) => setEstimateInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && confirmDeliveryTime(order.id)}
                          placeholder="Min"
                          className="h-16 w-24 rounded-lg border-2 border-outline-variant bg-surface-container-low text-center font-display text-4xl font-bold text-on-surface outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => confirmDeliveryTime(order.id)}
                          className="min-h-16 flex-1 rounded-xl bg-primary font-display text-3xl font-extrabold uppercase text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
                        >
                          {saving ? "Salvando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          aria-label="Cancelar"
                          onClick={() => {
                            setDeliveryPromptId(null);
                            setEstimateInput("");
                          }}
                          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface"
                        >
                          <Icon name="close" className="text-[30px]" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-stretch gap-space-sm">
                      <button
                        type="button"
                        onClick={() => setPrintOrder(order)}
                        aria-label={`Imprimir comanda ${orderNumberLabel(order)}`}
                        title="Imprimir comanda"
                        className="flex w-16 shrink-0 items-center justify-center rounded-xl border-2 border-outline-variant text-on-surface transition-colors hover:border-on-surface"
                      >
                        <Icon name="print" className="text-[30px]" />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (order.order_type === "entrega") {
                            setDeliveryPromptId(order.id);
                            setEstimateInput("");
                          } else {
                            markReady(order.id);
                          }
                        }}
                        className="flex min-h-20 flex-1 items-center justify-center gap-space-sm rounded-xl bg-primary font-display text-4xl font-extrabold uppercase tracking-wide text-on-primary transition-colors hover:bg-primary-container active:scale-[0.99] disabled:opacity-50"
                      >
                        <Icon name="check_circle" className="text-[36px]" />
                        {saving ? "Salvando…" : "Pronto"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ComandaPrint order={printOrder} />
    </div>
  );
}
