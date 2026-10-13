"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import type { OrderStatus } from "@/lib/types";
import { formatBRL, Icon } from "@/lib/ui";
import { playNewOrderBeep } from "@/lib/sound";
import {
  ComandaPrint,
  PAYMENT_LABELS,
  changeLabel,
  customerName,
  formatAddress,
  orderNumberLabel,
  printAfterRender,
} from "./comanda";

interface QueueOrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  item_notes: string | null;
  menu_item: { name: string; category?: string } | null;
  crust: { name: string } | null;
  order_item_flavors: { flavor: { name: string } | null }[];
}

interface QueueOrder {
  id: string;
  order_number: number | null;
  status: OrderStatus;
  order_type: "entrega" | "retirada";
  payment_method: "dinheiro" | "cartao" | "pix";
  total: number;
  change_for: number | null;
  notes: string | null;
  estimated_minutes: number | null;
  delivery_estimated_minutes: number | null;
  created_at: string;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  customer_name: string | null;
  // Resultado do último aviso de status mandado ao cliente pelo WhatsApp.
  notificacao_status: "enviada" | "falhou" | "ignorada" | null;
  notificacao_erro: string | null;
  customer: { name: string | null; phone: string } | null;
  items: QueueOrderItem[];
}

const ORDER_SELECT = `
  id, order_number, status, order_type, payment_method, total, change_for,
  notes, estimated_minutes, delivery_estimated_minutes, created_at,
  address_street, address_number, address_complement, address_neighborhood, address_city,
  customer_name, notificacao_status, notificacao_erro,
  customer:customers ( name, phone ),
  items:order_items (
    id, quantity, unit_price, item_notes,
    menu_item:menu_items ( name, category ),
    crust:crusts ( name ),
    order_item_flavors ( flavor:flavors ( name ) )
  )
`;

const QUEUE_STATUSES: OrderStatus[] = ["pendente", "preparo", "pronto"];

// Rede de segurança caso algum evento do Realtime se perca (aba em segundo
// plano, rede caindo): a fila se recarrega inteira de tempos em tempos.
const REFRESH_INTERVAL_MS = 45000;
// O pedido pode chegar pelo Realtime antes de os itens estarem gravados;
// nesse caso busca de novo depois desse intervalo.
const EMPTY_ITEMS_RETRY_MS = 1500;
const CANCEL_REASON_MAX = 200;
// O aviso de cancelamento ao cliente é gravado alguns segundos depois da
// recusa (até 8 s de timeout no WhatsApp). Confere o resultado nesses tempos
// caso o evento do Realtime não chegue.
const CANCEL_NOTICE_CHECKS_MS = [10000, 20000];

type FailedCancelRow = Pick<
  QueueOrder,
  "id" | "status" | "order_number" | "customer_name" | "notificacao_status" | "notificacao_erro"
> & { notificacao_em: string | null; cancelled_at: string | null };

const TABS: { status: OrderStatus; label: string }[] = [
  { status: "pendente", label: "Pendente" },
  { status: "preparo", label: "Em Preparo" },
  { status: "pronto", label: "Pronto" },
];

function isInQueue(status: OrderStatus): boolean {
  return QUEUE_STATUSES.includes(status);
}

function sortOldestFirst(list: QueueOrder[]): QueueOrder[] {
  return [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function timeAgo(createdAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `há ${hours}h ${rest}min` : `há ${hours}h`;
}

export default function OrderQueue({
  onPendingCountChange,
}: {
  // Avisa o painel quantos pedidos esperam aceite (badge da aba Fila).
  onPendingCountChange?: (count: number) => void;
}) {
  const supabase = createClient();

  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [timePrompt, setTimePrompt] = useState<{
    orderId: string;
    kind: "preparo" | "entrega";
  } | null>(null);
  const [estimateInput, setEstimateInput] = useState("");
  const [rejectPrompt, setRejectPrompt] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<{ orderId: string; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<OrderStatus>("pendente");
  const [printOrder, setPrintOrder] = useState<QueueOrder | null>(null);
  // Pedido recusado sai da fila na hora, mas o aviso de cancelamento ao
  // cliente é gravado depois; se ele falhar, o alerta fica aqui no topo.
  const [failedCancels, setFailedCancels] = useState<{ id: string; label: string; erro: string | null }[]>([]);
  const [, setTick] = useState(0);

  // null até o primeiro carregamento: os pedidos que já estavam na fila ao
  // abrir não apitam, só os que chegarem depois. Guarda todo id já visto pra
  // um pedido não apitar de novo quando volta num refetch.
  const knownIdsRef = useRef<Set<string> | null>(null);
  const emptyRetryRef = useRef<Set<string>>(new Set());
  // Pedidos que já saíram da fila (finalizado/cancelado são definitivos): um
  // refetch que saiu antes da mudança e volta depois não pode ressuscitá-los.
  const closedIdsRef = useRef<Set<string>>(new Set());
  const cancelCheckTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Buscas (fila inteira ou um pedido) podem voltar fora de ordem. Cada uma
  // ganha um número na saída, e cada pedido guarda o número da versão que
  // está na tela: resposta mais velha que isso não sobrescreve o card.
  const requestSeqRef = useRef(0);
  const appliedSeqRef = useRef<Map<string, number>>(new Map());

  const markApplied = useCallback((orderId: string, seq = ++requestSeqRef.current) => {
    appliedSeqRef.current.set(orderId, seq);
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

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Apita e destaca só os ids que ainda não tinham aparecido nesta tela.
  const announceNew = useCallback((ids: string[]) => {
    const known = knownIdsRef.current;
    if (!known) return;
    const arrived = ids.filter((id) => !known.has(id));
    arrived.forEach((id) => known.add(id));
    if (arrived.length === 0) return;

    playNewOrderBeep();
    setHighlighted((current) => new Set([...current, ...arrived]));
    setTimeout(() => {
      setHighlighted((current) => {
        const next = new Set(current);
        arrived.forEach((id) => next.delete(id));
        return next;
      });
    }, 4000);
  }, []);

  // Mostra o alerta (uma vez por pedido) quando o aviso de cancelamento falhou.
  // notificacao_* só muda quando uma mensagem é mandada, então um "falhou" de
  // antes do cancelamento (aviso de preparo/pronto) não conta: só vale o
  // resultado gravado depois de cancelled_at. Um "enviada" posterior tira o
  // alerta.
  const reportFailedCancel = useCallback((row: FailedCancelRow) => {
    if (row.status !== "cancelado" || !row.cancelled_at || !row.notificacao_em) return;
    if (new Date(row.notificacao_em).getTime() < new Date(row.cancelled_at).getTime()) return;
    if (row.notificacao_status !== "falhou") {
      setFailedCancels((current) => current.filter((c) => c.id !== row.id));
      return;
    }
    const name = row.customer_name ? ` de ${row.customer_name}` : "";
    const label = `Nº ${orderNumberLabel(row)}${name}`;
    setFailedCancels((current) =>
      current.some((c) => c.id === row.id)
        ? current
        : [...current, { id: row.id, label, erro: row.notificacao_erro }],
    );
  }, []);

  useEffect(() => {
    const timers = cancelCheckTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const removeOrder = useCallback((orderId: string) => {
    closedIdsRef.current.add(orderId);
    setOrders((current) => current.filter((o) => o.id !== orderId));
  }, []);

  const fetchOrder = useCallback(
    async function load(orderId: string) {
      const seq = ++requestSeqRef.current;
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId)
        .maybeSingle();

      if (error || closedIdsRef.current.has(orderId)) return;
      if ((appliedSeqRef.current.get(orderId) ?? 0) > seq) return;
      markApplied(orderId, seq);
      const order = data as unknown as QueueOrder | null;
      if (!order || !isInQueue(order.status)) {
        removeOrder(orderId);
        return;
      }

      setOrders((current) =>
        sortOldestFirst([...current.filter((o) => o.id !== order.id), order]),
      );
      announceNew([order.id]);

      if (order.items.length === 0 && !emptyRetryRef.current.has(order.id)) {
        emptyRetryRef.current.add(order.id);
        setTimeout(() => load(order.id), EMPTY_ITEMS_RETRY_MS);
      }
    },
    [supabase, removeOrder, announceNew, markApplied],
  );

  const fetchOrders = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", QUEUE_STATUSES)
      .order("created_at", { ascending: true });

    if (error) {
      // Se nem a primeira carga deu certo, o que aparecer depois é novidade
      // pra quem está no balcão e tem que apitar.
      if (!knownIdsRef.current) knownIdsRef.current = new Set();
      // Com a fila já na tela, uma falha de refetch não apaga o que há.
      setLoadState((current) => (current === "ready" ? current : "error"));
      return;
    }

    const next = ((data ?? []) as unknown as QueueOrder[]).filter(
      (o) => !closedIdsRef.current.has(o.id),
    );
    if (knownIdsRef.current) {
      announceNew(next.map((o) => o.id));
    } else {
      knownIdsRef.current = new Set(next.map((o) => o.id));
    }
    const applied = appliedSeqRef.current;
    const isNewer = (id: string) => (applied.get(id) ?? 0) > seq;
    setOrders((current) => {
      // Pedido mexido depois que esta busca saiu: fica a versão da tela
      // (inclusive pedido novo que esta busca ainda não via).
      const kept = current.filter((o) => isNewer(o.id));
      const fresh = next.filter((o) => !isNewer(o.id));
      return sortOldestFirst([...fresh, ...kept]);
    });
    for (const o of next) if (!isNewer(o.id)) markApplied(o.id, seq);
    setLoadState("ready");

    for (const order of next) {
      if (order.items.length === 0 && !emptyRetryRef.current.has(order.id)) {
        emptyRetryRef.current.add(order.id);
        setTimeout(() => fetchOrder(order.id), EMPTY_ITEMS_RETRY_MS);
      }
    }
  }, [supabase, announceNew, fetchOrder, markApplied]);

  const pendingCount = orders.filter((o) => o.status === "pendente").length;
  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [pendingCount, onPendingCountChange]);

  // A carga inicial sai do subscribe abaixo (SUBSCRIBED ou falha do canal),
  // não daqui, pra não buscar a fila duas vezes ao abrir.
  useEffect(() => {
    const refresh = setInterval(fetchOrders, REFRESH_INTERVAL_MS);
    function refetchWhenVisible() {
      if (document.visibilityState === "visible") fetchOrders();
    }
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
    };
  }, [fetchOrders]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // O join do canal lê o token de auth do socket de forma síncrona. Sem
      // aguardar setAuth() aqui, o primeiro subscribe() do mount pode sair
      // autenticado como anon (token ainda não carregou), e a policy de
      // orders passa a filtrar os eventos de INSERT em silêncio.
      try {
        await supabase.realtime.setAuth();
      } catch (err) {
        console.log("Falha ao autenticar o Realtime da fila:", err);
      }
      if (cancelled) return;

      channel = supabase
        .channel("orders-queue")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              if (oldId) removeOrder(oldId);
              return;
            }
            const row = payload.new as FailedCancelRow;
            if (!isInQueue(row.status)) {
              removeOrder(row.id);
              reportFailedCancel(row);
              return;
            }
            fetchOrder(row.id);
          },
        )
        .subscribe((status) => {
          // SUBSCRIBED também chega depois de cada reconexão: recupera o que
          // entrou enquanto o canal estava fora. Com o canal com erro, carrega
          // mesmo assim e o polling segura até o Realtime voltar.
          if (status === "CLOSED") return;
          if (status !== "SUBSCRIBED") console.log("Realtime da fila:", status);
          fetchOrders();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openRejectPrompt(orderId: string) {
    setTimePrompt(null);
    setEstimateInput("");
    setRejectPrompt(orderId);
    setRejectReason("");
    setRejectError(null);
  }

  function closeRejectPrompt() {
    setRejectPrompt(null);
    setRejectReason("");
    setRejectError(null);
  }

  // Só pedido já aceito gera aviso de cancelamento ao cliente.
  function watchCancelNotice(orderId: string) {
    for (const delay of CANCEL_NOTICE_CHECKS_MS) {
      const timer = setTimeout(async () => {
        cancelCheckTimersRef.current.delete(timer);
        const { data } = await supabase
          .from("orders")
          .select(
            "id, status, order_number, customer_name, notificacao_status, notificacao_erro, notificacao_em, cancelled_at",
          )
          .eq("id", orderId)
          .maybeSingle();
        if (data) reportFailedCancel(data as FailedCancelRow);
      }, delay);
      cancelCheckTimersRef.current.add(timer);
    }
  }

  async function rejectOrder(orderId: string) {
    const wasAccepted = orders.find((o) => o.id === orderId)?.status !== "pendente";
    setRejecting(true);
    setRejectError(null);

    const reason = rejectReason.trim().slice(0, CANCEL_REASON_MAX);
    const { data, error } = await supabase
      .from("orders")
      .update({ status: "cancelado", cancel_reason: reason || null })
      .eq("id", orderId)
      .in("status", QUEUE_STATUSES)
      .select("id");

    setRejecting(false);

    if (error) {
      console.log("Falha ao recusar pedido:", error);
      setRejectError("Não conseguimos recusar o pedido agora. Confira a internet e tente de novo.");
      return;
    }
    if (!data || data.length === 0) {
      setRejectError("Esse pedido já tinha mudado de situação e não foi recusado. A fila foi atualizada.");
      fetchOrders();
      return;
    }

    removeOrder(orderId);
    closeRejectPrompt();
    if (wasAccepted) watchCancelNotice(orderId);
  }

  // Só muda se o pedido ainda estiver no status esperado; se outro aparelho
  // já mexeu nele (ou recusou), avisa no card e recarrega a fila.
  async function updateOrderStatus(
    orderId: string,
    from: OrderStatus,
    patch: Partial<Pick<QueueOrder, "status" | "estimated_minutes" | "delivery_estimated_minutes">>,
  ): Promise<boolean> {
    setCardError(null);
    const { data, error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .eq("status", from)
      .select("id");

    if (error) {
      console.log("Falha ao atualizar pedido:", error);
      setCardError({
        orderId,
        message: "Não conseguimos atualizar o pedido agora. Confira a internet e tente de novo.",
      });
      return false;
    }
    if (!data || data.length === 0) {
      setCardError({
        orderId,
        message: "Esse pedido já tinha mudado de situação em outro aparelho. A fila foi atualizada.",
      });
      fetchOrders();
      return false;
    }
    return true;
  }

  async function acceptOrder(orderId: string) {
    const minutes = Number(estimateInput);
    if (!Number.isFinite(minutes) || minutes <= 0) return;

    const ok = await updateOrderStatus(orderId, "pendente", {
      status: "preparo",
      estimated_minutes: Math.round(minutes),
    });
    if (!ok) return;
    markApplied(orderId);

    setOrders((current) =>
      current.map((o) =>
        o.id === orderId
          ? { ...o, status: "preparo", estimated_minutes: Math.round(minutes) }
          : o,
      ),
    );
    setTimePrompt(null);
    setEstimateInput("");
  }

  async function markReady(orderId: string) {
    const ok = await updateOrderStatus(orderId, "preparo", { status: "pronto" });
    if (!ok) return;
    markApplied(orderId);

    setOrders((current) =>
      current.map((o) => (o.id === orderId ? { ...o, status: "pronto" } : o)),
    );
  }

  async function markReadyWithDeliveryTime(orderId: string) {
    const minutes = Number(estimateInput);
    if (!Number.isFinite(minutes) || minutes <= 0) return;

    const ok = await updateOrderStatus(orderId, "preparo", {
      status: "pronto",
      delivery_estimated_minutes: Math.round(minutes),
    });
    if (!ok) return;
    markApplied(orderId);

    setOrders((current) =>
      current.map((o) =>
        o.id === orderId
          ? { ...o, status: "pronto", delivery_estimated_minutes: Math.round(minutes) }
          : o,
      ),
    );
    setTimePrompt(null);
    setEstimateInput("");
  }

  async function finalizeOrder(orderId: string) {
    const ok = await updateOrderStatus(orderId, "pronto", { status: "finalizado" });
    if (!ok) return;

    removeOrder(orderId);
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
      {failedCancels.map((c) => (
        <div
          key={c.id}
          role="alert"
          className="flex items-start gap-space-xs rounded-lg bg-error-container px-space-sm py-space-xs font-body-sm text-body-sm text-on-error-container"
        >
          <Icon name="sms_failed" className="mt-0.5 text-[18px]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-semibold">
              Pedido {c.label} foi cancelado, mas o WhatsApp não foi enviado. Avise o cliente por telefone.
            </p>
            {c.erro && <p className="line-clamp-2 break-words opacity-80">{c.erro}</p>}
          </div>
          <button
            type="button"
            aria-label={`Dispensar aviso do pedido ${c.label}`}
            onClick={() => setFailedCancels((current) => current.filter((x) => x.id !== c.id))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-on-error-container/10"
          >
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      ))}
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
              <div className="flex min-w-0 items-center gap-space-sm">
                <span className="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary px-1 leading-none text-on-primary">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Nº</span>
                  <span className="font-display text-2xl font-extrabold tabular-nums">
                    {orderNumberLabel(order)}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="truncate font-body-md font-semibold text-body-md text-on-surface">
                    {customerName(order) || "Sem nome"}
                  </p>
                  <p className="font-mono text-body-sm text-on-surface-variant">
                    {order.customer?.phone}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-outline">
                  {timeAgo(order.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => setPrintOrder(order)}
                  aria-label={`Imprimir comanda ${orderNumberLabel(order)}`}
                  title="Imprimir comanda"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  <Icon name="print" className="text-[20px]" />
                </button>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-surface-container-high">
              {order.items.length === 0 && (
                <p className="py-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  Carregando itens…
                </p>
              )}
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
                {formatAddress(order) ? ` · ${formatAddress(order)}` : ""}
              </p>
              <p>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
              {changeLabel(order) && (
                <p className="flex items-center gap-space-xs rounded bg-primary/10 px-space-xs py-0.5 font-semibold text-on-surface">
                  <Icon name="payments" className="text-[16px] text-primary" />
                  {changeLabel(order)}
                </p>
              )}
              {order.notes && <p>Obs: {order.notes}</p>}
              {order.estimated_minutes !== null && (
                <p className="text-primary">
                  Preparo: {order.estimated_minutes} min
                </p>
              )}
              {order.delivery_estimated_minutes !== null && (
                <p className="text-primary">
                  Entrega: {order.delivery_estimated_minutes} min
                </p>
              )}
              <p className="font-label-lg text-label-lg text-primary">
                {formatBRL(order.total)}
              </p>
            </div>

            {order.notificacao_status === "falhou" && (
              <div
                role="status"
                className="flex flex-col gap-0.5 rounded bg-error-container px-space-xs py-1 font-body-sm text-body-sm text-on-error-container"
              >
                <p className="flex items-center gap-space-xs font-semibold">
                  <Icon name="sms_failed" className="text-[18px]" />
                  WhatsApp não enviado: avise o cliente por telefone.
                </p>
                {order.notificacao_erro && <p className="line-clamp-2 break-words opacity-80">{order.notificacao_erro}</p>}
              </div>
            )}

            {order.status === "pendente" &&
              (timePrompt?.orderId === order.id && timePrompt.kind === "preparo" ? (
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Tempo de preparo (min)
                  </span>
                  <div className="flex items-center gap-space-xs">
                    <input
                      type="number"
                      min={1}
                      autoFocus
                      value={estimateInput}
                      onChange={(e) => setEstimateInput(e.target.value)}
                      placeholder="Min"
                      aria-label="Tempo de preparo em minutos"
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
                        setTimePrompt(null);
                        setEstimateInput("");
                      }}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
                    >
                      <Icon name="close" className="text-[20px]" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    closeRejectPrompt();
                    setTimePrompt({ orderId: order.id, kind: "preparo" });
                    setEstimateInput("");
                  }}
                  className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
                >
                  Aceitar pedido
                </button>
              ))}

            {order.status === "preparo" &&
              (order.order_type === "entrega" ? (
                timePrompt?.orderId === order.id && timePrompt.kind === "entrega" ? (
                  <div className="flex flex-col gap-space-xs">
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                      Tempo até a entrega (min)
                    </span>
                    <div className="flex items-center gap-space-xs">
                      <input
                        type="number"
                        min={1}
                        autoFocus
                        value={estimateInput}
                        onChange={(e) => setEstimateInput(e.target.value)}
                        placeholder="Min"
                        aria-label="Tempo até a entrega em minutos"
                        className="h-12 w-20 rounded border border-surface-container-highest bg-surface-container-low text-center font-mono text-body-lg text-on-surface outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => markReadyWithDeliveryTime(order.id)}
                        className="min-h-12 flex-1 rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase text-on-primary transition-colors hover:bg-primary-container"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar"
                        onClick={() => {
                          setTimePrompt(null);
                          setEstimateInput("");
                        }}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
                      >
                        <Icon name="close" className="text-[20px]" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeRejectPrompt();
                      setTimePrompt({ orderId: order.id, kind: "entrega" });
                      setEstimateInput("");
                    }}
                    className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
                  >
                    Marcar como pronto
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => markReady(order.id)}
                  className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
                >
                  Marcar como pronto
                </button>
              ))}

            {order.status === "pronto" && (
              <button
                type="button"
                onClick={() => finalizeOrder(order.id)}
                className="min-h-12 w-full rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container"
              >
                Finalizar
              </button>
            )}

            {cardError?.orderId === order.id && (
              <p role="alert" className="font-body-sm text-body-sm font-semibold text-error">
                {cardError.message}
              </p>
            )}

            {rejectPrompt === order.id ? (
              <div
                role="group"
                aria-labelledby={`recusar-${order.id}`}
                className="flex flex-col gap-space-xs rounded-lg border border-error bg-error-container/40 p-space-sm"
              >
                <p id={`recusar-${order.id}`} className="font-body-md font-semibold text-body-md text-on-surface">
                  Recusar o pedido Nº {orderNumberLabel(order)}
                  {customerName(order) ? ` de ${customerName(order)}` : ""}?
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Ele sai da fila e o cliente recebe automaticamente uma mensagem no
                  WhatsApp avisando que o pedido foi cancelado.
                </p>
                <label className="flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    Motivo (opcional)
                  </span>
                  <input
                    type="text"
                    autoFocus
                    maxLength={CANCEL_REASON_MAX}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ex.: acabou o ingrediente, fora da área de entrega"
                    className="h-12 rounded border border-surface-container-highest bg-surface-container-low px-space-sm font-body-md text-body-md text-on-surface outline-none focus:border-primary"
                  />
                </label>
                {rejectError && (
                  <p role="alert" className="font-body-sm text-body-sm font-semibold text-error">
                    {rejectError}
                  </p>
                )}
                <div className="flex gap-space-xs">
                  <button
                    type="button"
                    disabled={rejecting}
                    onClick={() => rejectOrder(order.id)}
                    className="min-h-12 flex-1 rounded-full bg-error font-headline-md text-headline-md font-bold uppercase text-on-error transition-opacity disabled:opacity-60"
                  >
                    {rejecting ? "Recusando…" : "Sim, recusar"}
                  </button>
                  <button
                    type="button"
                    disabled={rejecting}
                    onClick={closeRejectPrompt}
                    className="min-h-12 flex-1 rounded-full border border-outline-variant font-headline-md text-headline-md uppercase text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-60"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openRejectPrompt(order.id)}
                className="min-h-11 self-center px-space-sm font-label-md text-label-md uppercase tracking-wider text-error underline underline-offset-4"
              >
                Recusar pedido
              </button>
            )}
          </article>
        ))}
      </div>

      <ComandaPrint order={printOrder} />
    </div>
  );
}
