"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { anonBrowserClient } from "./anonClient";
import { ORDER_LIMITS, type Address, type CartItem, type Crust, type Flavor, type MenuItem } from "@/lib/types";
import { formatHora } from "@/lib/loja";
import { fetchMenu, type MenuData, type PedidoInitialData } from "./menuData";
import { useLojaStatus } from "./useLojaStatus";
import MenuScreen from "./MenuScreen";
import CustomizationSheet, { type PizzaUnit, type SheetTarget } from "./CustomizationSheet";
import CheckoutScreen, { parseMoney, type PaymentMethod } from "./CheckoutScreen";
import SuccessScreen from "./SuccessScreen";
import ErrorScreen from "./ErrorScreen";

type View = "menu" | "checkout" | "success" | "error";

// Contrato do create-order para item que saiu do cardápio entre a montagem
// da sacola e o envio: 400 com { error, code, ids }.
type UnavailableCode = "item_indisponivel" | "sabor_indisponivel" | "borda_indisponivel";
const UNAVAILABLE_CODES: readonly string[] = [
  "item_indisponivel",
  "sabor_indisponivel",
  "borda_indisponivel",
] satisfies UnavailableCode[];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export default function PedidoFlow({ initialData }: { initialData: PedidoInitialData }) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    initialData.menu ? "ready" : "loading",
  );
  const [menu, setMenu] = useState<MenuData>(
    initialData.menu ?? { menuItems: [], flavors: [], crusts: [] },
  );

  const reloadMenu = useCallback(async () => {
    const next = await fetchMenu(anonBrowserClient());
    if (next) setMenu(next);
    return next;
  }, []);

  // Fallback: o servidor não conseguiu entregar o cardápio, busca aqui.
  const needsClientLoad = initialData.menu === null;
  useEffect(() => {
    if (!needsClientLoad) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadMenu().then((next) => {
      if (!cancelled) setLoadState(next ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [needsClientLoad, reloadMenu]);

  const pizzas = useMemo(() => menu.menuItems.filter((m) => m.category === "pizza"), [menu]);
  const esfirraItems = useMemo(
    () => menu.menuItems.filter((i) => i.category === "esfirra"),
    [menu],
  );
  const bebidaItems = useMemo(
    () => menu.menuItems.filter((i) => i.category === "bebida"),
    [menu],
  );
  const flavors: Flavor[] = menu.flavors;
  const crusts: Crust[] = menu.crusts;

  const [view, setView] = useState<View>("menu");
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Aviso na sacola (ex.: item esgotado removido depois do envio).
  const [cartNotice, setCartNotice] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<"entrega" | "retirada" | null>(
    null,
  );
  const [address, setAddress] = useState<Address>({
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [orderNotes, setOrderNotes] = useState("");
  // Troco (só dinheiro): "" = ainda não respondeu, "sem" = não precisa,
  // ou o valor digitado ("100", "50,00").
  const [changeFor, setChangeFor] = useState("");

  const { status: loja, refresh: refreshLoja } = useLojaStatus(initialData.loja);
  const lojaFechada = loja?.aberta === false;
  const horarioTexto = loja?.config
    ? `das ${formatHora(loja.config.abre_as)} às ${formatHora(loja.config.fecha_as)}`
    : null;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<{
    order_id: string;
    order_number: number | null;
    total: number;
  } | null>(null);

  // Chave de idempotência do checkout: o "tentar de novo" com o mesmo pedido
  // reenvia a mesma chave, pra que uma resposta perdida não grave o pedido
  // duas vezes. Muda quando o conteúdo do pedido muda ou depois do sucesso.
  const idempotencyRef = useRef<{ key: string; payload: string } | null>(null);

  const minPizzaPrice = useMemo(() => {
    if (pizzas.length === 0) return null;
    return Math.min(...pizzas.map((p) => Number(p.base_price)));
  }, [pizzas]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart],
  );
  // Linhas contam pro limite do pedido; unidades são o que o cliente vê.
  const cartUnits = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  // Chave de "mesma configuração": mesmo tamanho, mesmo conjunto de sabores
  // (ordem não importa), mesma borda e mesma observação — usada pra juntar
  // unidades idênticas do loop de pizza numa única linha do carrinho.
  function pizzaUnitKey(menuItemId: string, flavorIds: string[], crustId: string | undefined, notes: string) {
    return `${menuItemId}|${[...flavorIds].sort().join(",")}|${crustId ?? ""}|${notes}`;
  }

  function addPizzaToCart(params: { units: PizzaUnit[] }) {
    const { units } = params;
    setCart((current) => {
      const next = [...current];

      for (const unit of units) {
        const flavorIds = unit.flavors.map((f) => f.id);
        const notes = unit.notes.trim();
        const maxExtra = Math.max(...unit.flavors.map((f) => Number(f.extra_price)));
        const crustExtra = unit.crust ? Number(unit.crust.extra_price) : 0;
        const key = pizzaUnitKey(unit.size.id, flavorIds, unit.crust?.id, notes);

        const existingIndex = next.findIndex(
          (item) =>
            item.kind === "pizza" &&
            pizzaUnitKey(item.menu_item_id, item.flavor_ids ?? [], item.crust_id, item.item_notes ?? "") ===
              key,
        );

        // Linha já no teto de quantidade: a unidade vai para uma linha nova.
        if (existingIndex >= 0 && next[existingIndex].quantity < ORDER_LIMITS.maxQuantity) {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + 1,
          };
        } else {
          next.push({
            key: crypto.randomUUID(),
            kind: "pizza",
            menu_item_id: unit.size.id,
            menu_item_name: unit.size.name,
            flavor_ids: flavorIds,
            flavor_names: unit.flavors.map((f) => f.name),
            crust_id: unit.crust?.id,
            crust_name: unit.crust?.name,
            quantity: 1,
            item_notes: notes || undefined,
            unit_price: Number(unit.size.base_price) + maxExtra + crustExtra,
          });
        }
      }

      return next;
    });
  }

  function addSimpleItemToCart(params: {
    item: MenuItem;
    quantity: number;
    notes: string;
  }) {
    const { item: menuItem, quantity, notes } = params;
    const item: CartItem = {
      key: crypto.randomUUID(),
      kind: "simple",
      menu_item_id: menuItem.id,
      menu_item_name: menuItem.name,
      quantity: Math.min(quantity, ORDER_LIMITS.maxQuantity),
      item_notes: notes.trim() || undefined,
      unit_price: Number(menuItem.base_price),
    };
    setCart((c) => (c.length >= ORDER_LIMITS.maxCartItems ? c : [...c, item]));
  }

  function removeFromCart(key: string) {
    setCart((c) => c.filter((item) => item.key !== key));
  }

  // Item, sabor ou borda saiu do cardápio depois que entrou na sacola: tira
  // as linhas afetadas, atualiza o cardápio e explica com nomes, não UUIDs.
  function handleUnavailable(code: UnavailableCode, ids: string[]) {
    const idSet = new Set(ids);
    const affects = (item: CartItem) =>
      code === "item_indisponivel"
        ? idSet.has(item.menu_item_id)
        : code === "sabor_indisponivel"
          ? (item.flavor_ids ?? []).some((id) => idSet.has(id))
          : item.crust_id !== undefined && idSet.has(item.crust_id);

    const removed = cart.filter(affects);
    const nameSet = new Set<string>();
    for (const item of removed) {
      if (code === "item_indisponivel") nameSet.add(item.menu_item_name);
      else if (code === "borda_indisponivel" && item.crust_name) nameSet.add(item.crust_name);
      else if (code === "sabor_indisponivel") {
        (item.flavor_ids ?? []).forEach((id, i) => {
          if (idSet.has(id) && item.flavor_names?.[i]) nameSet.add(item.flavor_names[i]);
        });
      }
    }
    const names = [...nameSet];
    const many = names.length > 1;
    const lineWord = removed.length > 1 ? "as pizzas" : "a pizza";

    let message: string;
    if (removed.length === 0 || names.length === 0) {
      message = "Um item do cardápio acabou agora há pouco e atualizamos o cardápio.";
    } else if (code === "item_indisponivel") {
      message = `${joinNames(names)} ${many ? "acabaram e saíram" : "acabou e saiu"} da sua sacola.`;
    } else if (code === "sabor_indisponivel") {
      message = many
        ? `Os sabores ${joinNames(names)} acabaram. Tiramos da sacola ${lineWord} com eles.`
        : `O sabor ${names[0]} acabou. Tiramos da sacola ${lineWord} com ele.`;
    } else {
      message = many
        ? `As bordas ${joinNames(names)} acabaram. Tiramos da sacola ${lineWord} com elas.`
        : `A borda ${names[0]} acabou. Tiramos da sacola ${lineWord} com ela.`;
    }

    setCart((current) => current.filter((item) => !affects(item)));
    reloadMenu();
    setCartNotice(`${message} Confira e confirme de novo.`);
    setView("checkout");
  }

  async function confirmOrder() {
    if (!orderType || !paymentMethod || lojaFechada) return;
    setSubmitting(true);
    setSubmitError(null);
    setCartNotice(null);

    const orderPayload = {
      name: customerName.trim(),
      phone: customerPhone.trim(),
      order_type: orderType,
      address:
        orderType === "entrega"
          ? {
              street: address.street.trim(),
              number: address.number.trim(),
              complement: address.complement.trim() || undefined,
              neighborhood: address.neighborhood.trim(),
              city: address.city.trim(),
            }
          : undefined,
      payment_method: paymentMethod,
      change_for:
        paymentMethod === "dinheiro" && changeFor && changeFor !== "sem"
          ? (parseMoney(changeFor) ?? undefined)
          : undefined,
      notes: orderNotes.trim() || undefined,
      items: cart.map((item) => ({
        menu_item_id: item.menu_item_id,
        flavor_ids: item.flavor_ids,
        crust_id: item.crust_id,
        quantity: item.quantity,
        item_notes: item.item_notes,
      })),
    };

    const payloadSignature = JSON.stringify(orderPayload);
    if (idempotencyRef.current?.payload !== payloadSignature) {
      idempotencyRef.current = { key: crypto.randomUUID(), payload: payloadSignature };
    }

    const { data, error } = await anonBrowserClient().functions.invoke("create-order", {
      body: { ...orderPayload, idempotency_key: idempotencyRef.current.key },
    });

    setSubmitting(false);

    if (error) {
      let message =
        "Não conseguimos confirmar seu pedido agora. Tenta de novo em instantes.";
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.json();
          if (
            typeof body?.code === "string" &&
            UNAVAILABLE_CODES.includes(body.code) &&
            Array.isArray(body.ids)
          ) {
            handleUnavailable(
              body.code as UnavailableCode,
              body.ids.filter((id: unknown): id is string => typeof id === "string"),
            );
            return;
          }
          if (body?.error) message = body.error;
        } catch {
          // resposta sem corpo JSON, mantém a mensagem padrão
        }
      }
      setSubmitError(message);
      setView("error");
      // Se foi recusado por horário, o cardápio passa a mostrar "fechado".
      refreshLoja();
      return;
    }

    if (data) {
      idempotencyRef.current = null;
      setOrderResult({
        order_id: data.order_id,
        order_number: data.order_number ?? null,
        total: data.total,
      });
      setView("success");
    }
  }

  function startOver() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setOrderType(null);
    setAddress({ street: "", number: "", complement: "", neighborhood: "", city: "" });
    setPaymentMethod(null);
    setOrderNotes("");
    setChangeFor("");
    setOrderResult(null);
    setSubmitError(null);
    setCartNotice(null);
    setView("menu");
  }

  if (loadState === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin">
        <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
          Carregando cardápio…
        </p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-space-md bg-surface px-margin text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Não conseguimos carregar o cardápio agora.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <>
      {view === "menu" && (
        <MenuScreen
          pizzas={pizzas}
          allFlavors={flavors}
          esfirraItems={esfirraItems}
          bebidaItems={bebidaItems}
          minPizzaPrice={minPizzaPrice}
          cartCount={cartUnits}
          cartTotal={total}
          lojaFechada={lojaFechada}
          horarioTexto={horarioTexto}
          onSelectPizza={() => !lojaFechada && setSheetTarget({ kind: "pizza" })}
          onSelectSimpleItem={(item) => !lojaFechada && setSheetTarget({ kind: "simple", item })}
          onOpenCart={() => setView("checkout")}
        />
      )}

      {view === "checkout" && (
        <CheckoutScreen
          cart={cart}
          notice={cartNotice}
          onRemoveItem={removeFromCart}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          address={address}
          onAddressChange={(patch) => setAddress((current) => ({ ...current, ...patch }))}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          changeFor={changeFor}
          onChangeForChange={setChangeFor}
          lojaFechada={lojaFechada}
          horarioTexto={horarioTexto}
          orderNotes={orderNotes}
          onOrderNotesChange={setOrderNotes}
          total={total}
          submitting={submitting}
          onBack={() => {
            setCartNotice(null);
            setView("menu");
          }}
          onConfirm={confirmOrder}
        />
      )}

      {view === "success" && orderResult && (
        <SuccessScreen
          orderId={orderResult.order_id}
          orderNumber={orderResult.order_number}
          total={orderResult.total}
          onNewOrder={startOver}
        />
      )}

      {view === "error" && (
        <ErrorScreen
          message={submitError ?? ""}
          onRetry={() => setView("checkout")}
        />
      )}

      {sheetTarget && (
        <CustomizationSheet
          target={sheetTarget}
          pizzaSizes={pizzas}
          flavors={flavors}
          crusts={crusts}
          cartLines={cart.length}
          cartUnits={cartUnits}
          cartTotal={total}
          onClose={() => setSheetTarget(null)}
          onAddPizza={addPizzaToCart}
          onAddSimpleItem={addSimpleItemToCart}
          onGoToCheckout={() => {
            setSheetTarget(null);
            setView("checkout");
          }}
        />
      )}
    </>
  );
}
