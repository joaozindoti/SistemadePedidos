"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL, Icon } from "@/lib/ui";

type OrderStatus =
  | "pendente"
  | "confirmado"
  | "preparo"
  | "pronto"
  | "saiu_entrega"
  | "finalizado";

interface QueueOrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  item_notes: string | null;
  menu_item: { name: string } | null;
  crust: { name: string } | null;
  order_item_flavors: { flavor: { name: string } | null }[];
}

interface QueueOrder {
  id: string;
  status: OrderStatus;
  order_type: "entrega" | "retirada";
  payment_method: "dinheiro" | "cartao" | "pix";
  total: number;
  notes: string | null;
  estimated_minutes: number | null;
  created_at: string;
  customer: { name: string | null; phone: string; address: string | null } | null;
  items: QueueOrderItem[];
}

const ORDER_SELECT = `
  id, status, order_type, payment_method, total, notes, estimated_minutes, created_at,
  customer:customers ( name, phone, address ),
  items:order_items (
    id, quantity, unit_price, item_notes,
    menu_item:menu_items ( name ),
    crust:crusts ( name ),
    order_item_flavors ( flavor:flavors ( name ) )
  )
`;

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão na entrega",
  pix: "Pix",
};

const TABS: { status: OrderStatus; label: string }[] = [
  { status: "pendente", label: "Pendente" },
  { status: "preparo", label: "Em Preparo" },
  { status: "pronto", label: "Pronto" },
];

function timeAgo(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `há ${hours}h ${rest}min` : `há ${hours}h`;
}

function playNewOrderBeep(ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes: [number, number][] = [
    [880, now],
    [1175, now + 0.15],
  ];
  for (const [freq, start] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.14);
  }
}

export default function OrderQueue() {
  const supabase = createClient();

  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
  const [activeTab, setActiveTab] = useState<OrderStatus>("pendente");
  const [, setTick] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioContext(): AudioContext {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }

  useEffect(() => {
    function unlockAudio() {
      try {
        getAudioContext().resume().catch(() => {});
      } catch (err) {
        console.log("Áudio ainda não pôde ser desbloqueado:", err);
      }
    }
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", ["pendente", "preparo", "pronto"])
      .order("created_at", { ascending: true });

    if (error) {
      setLoadState("error");
      return;
    }
    setOrders((data ?? []) as unknown as QueueOrder[]);
    setLoadState("ready");
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .in("status", ["pendente", "preparo", "pronto"])
        .order("created_at", { ascending: true });

      if (cancelled) return;
      if (error) {
        setLoadState("error");
        return;
      }
      setOrders((data ?? []) as unknown as QueueOrder[]);
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // O join do canal lê o token de auth do socket de forma síncrona. Sem
      // aguardar setAuth() aqui, o primeiro subscribe() do mount pode sair
      // autenticado como anon (token ainda não carregou), e a policy de
      // orders passa a filtrar os eventos de INSERT em silêncio.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel("orders-queue")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          async (payload) => {
            const newId = (payload.new as { id: string }).id;

            const { data, error } = await supabase
              .from("orders")
              .select(ORDER_SELECT)
              .eq("id", newId)
              .single();

            if (error || !data) return;

            const newOrder = data as unknown as QueueOrder;
            setOrders((current) => [...current, newOrder]);

            setHighlighted((current) => new Set(current).add(newId));
            setTimeout(() => {
              setHighlighted((current) => {
                const next = new Set(current);
                next.delete(newId);
                return next;
              });
            }, 4000);

            try {
              playNewOrderBeep(getAudioContext());
            } catch (err) {
              console.log("Não foi possível tocar o som de novo pedido:", err);
            }
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

  async function acceptOrder(orderId: string) {
    const minutes = Number(estimateInput);
    if (!Number.isFinite(minutes) || minutes <= 0) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: "preparo", estimated_minutes: Math.round(minutes) })
      .eq("id", orderId);

    if (error) {
      console.log("Falha ao aceitar pedido:", error);
      return;
    }

    setOrders((current) =>
      current.map((o) =>
        o.id === orderId
          ? { ...o, status: "preparo", estimated_minutes: Math.round(minutes) }
          : o,
      ),
    );
    setAcceptingId(null);
    setEstimateInput("");
  }

  async function markReady(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "pronto" })
      .eq("id", orderId);

    if (error) {
      console.log("Falha ao marcar como pronto:", error);
      return;
    }

    setOrders((current) =>
      current.map((o) => (o.id === orderId ? { ...o, status: "pronto" } : o)),
    );
  }

  async function finalizeOrder(orderId: string) {
    const { error } = await supabase
      .from("orders")
      .update({ status: "finalizado" })
      .eq("id", orderId);

    if (error) {
      console.log("Falha ao finalizar pedido:", error);
      return;
    }

    setOrders((current) => current.filter((o) => o.id !== orderId));
  }

  if (loadState === "loading") {
    return (
      <p className="py-space-xl text-center font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
        Carregando fila…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center gap-space-md py-space-xl text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Não conseguimos carregar os pedidos agora.
        </p>
        <button
          type="button"
          onClick={() => fetchOrders()}
          className="font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const visibleOrders = orders.filter((o) => o.status === activeTab);

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex gap-space-xs">
        {TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab.status).length;
          const active = activeTab === tab.status;
          return (
            <button
              key={tab.status}
              type="button"
              onClick={() => setActiveTab(tab.status)}
              className={`flex min-h-12 flex-1 items-center justify-center gap-space-xs rounded-full px-space-sm font-headline-md text-headline-md uppercase transition-colors ${
                active
                  ? "bg-primary font-bold text-on-primary shadow-sm"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-body-sm ${
                  active ? "bg-on-primary/20 text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-space-sm">
        {visibleOrders.length === 0 && (
          <p className="py-space-xl text-center font-body-sm text-body-sm text-on-surface-variant">
            Nenhum pedido aqui.
          </p>
        )}

        {visibleOrders.map((order) => (
          <article
            key={order.id}
            className={`flex flex-col gap-space-sm rounded-lg border bg-surface-container-lowest p-space-sm transition-shadow ${
              highlighted.has(order.id)
                ? "animate-order-pulse border-primary"
                : "border-surface-container-highest"
            }`}
          >
            <div className="flex items-start justify-between gap-space-sm">
              <div className="min-w-0">
                <p className="font-body-md font-semibold text-body-md text-on-surface">
                  {order.customer?.name || "Sem nome"}
                </p>
                <p className="font-mono text-body-sm text-on-surface-variant">
                  {order.customer?.phone}
                </p>
              </div>
              <span className="shrink-0 font-label-sm text-label-sm text-outline">
                {timeAgo(order.created_at)}
              </span>
            </div>

            <div className="flex flex-col divide-y divide-surface-container-high">
              {order.items.map((item) => {
                const flavorNames = item.order_item_flavors
                  .map((f) => f.flavor?.name)
                  .filter(Boolean)
                  .join(" + ");
                return (
                  <div key={item.id} className="py-space-xs">
                    <p className="font-body-sm text-body-sm text-on-surface">
                      {item.quantity}× {item.menu_item?.name}
                      {flavorNames ? ` · ${flavorNames}` : ""}
                      {item.crust?.name ? ` · Borda ${item.crust.name}` : ""}
                    </p>
                    {item.item_notes && (
                      <p className="font-body-sm text-body-sm text-primary">
                        {item.item_notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-space-xs border-t border-surface-container-highest pt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              <p>
                {order.order_type === "entrega" ? "Entrega" : "Retirada"}
                {order.customer?.address ? ` · ${order.customer.address}` : ""}
              </p>
              <p>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
              {order.notes && <p>Obs: {order.notes}</p>}
              {order.estimated_minutes !== null && (
                <p className="text-primary">
                  Estimativa: {order.estimated_minutes} min
                </p>
              )}
              <p className="font-label-lg text-label-lg text-primary">
                {formatBRL(order.total)}
              </p>
            </div>

            {order.status === "pendente" &&
              (acceptingId === order.id ? (
                <div className="flex items-center gap-space-xs">
                  <input
                    type="number"
                    min={1}
                    autoFocus
                    value={estimateInput}
                    onChange={(e) => setEstimateInput(e.target.value)}
                    placeholder="Min"
                    className="h-12 w-20 rounded border border-surface-container-highest bg-surface-container-low text-center font-mono text-body-lg text-on-surface outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => acceptOrder(order.id)}
                    className="min-h-12 flex-1 rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase text-on-primary transition-colors hover:bg-primary-container"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar"
                    onClick={() => {
                      setAcceptingId(null);
                      setEstimateInput("");
                    }}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
                  >
                    <Icon name="close" className="text-[20px]" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAcceptingId(order.id);
                    setEstimateInput("");
                  }}
                  className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
                >
                  Aceitar pedido
                </button>
              ))}

            {order.status === "preparo" && (
              <button
                type="button"
                onClick={() => markReady(order.id)}
                className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
              >
                Marcar como pronto
              </button>
            )}

            {order.status === "pronto" && (
              <button
                type="button"
                onClick={() => finalizeOrder(order.id)}
                className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
              >
                Finalizar
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
