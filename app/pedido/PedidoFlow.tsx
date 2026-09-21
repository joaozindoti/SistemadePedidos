"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Address, CartItem, Flavor, MenuItem } from "@/lib/types";
import MenuScreen from "./MenuScreen";
import CustomizationSheet, { type PizzaUnit, type SheetTarget } from "./CustomizationSheet";
import CheckoutScreen, { type PaymentMethod } from "./CheckoutScreen";
import SuccessScreen from "./SuccessScreen";
import ErrorScreen from "./ErrorScreen";

type View = "menu" | "checkout" | "success" | "error";

export default function PedidoFlow() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [pizzas, setPizzas] = useState<MenuItem[]>([]);
  const [simpleMenuItems, setSimpleMenuItems] = useState<MenuItem[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState("loading");
      const [menuRes, flavorsRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .eq("active", true)
          .order("base_price", { ascending: true }),
        supabase
          .from("flavors")
          .select("*")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (cancelled) return;

      if (menuRes.error || flavorsRes.error) {
        setLoadState("error");
        return;
      }

      const menuItems = (menuRes.data ?? []) as MenuItem[];
      setPizzas(menuItems.filter((m) => m.category === "pizza"));
      setSimpleMenuItems(
        menuItems.filter((m) => m.category === "esfirra" || m.category === "bebida"),
      );
      setFlavors((flavorsRes.data ?? []) as Flavor[]);
      setLoadState("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const [view, setView] = useState<View>("menu");
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<{
    order_id: string;
    total: number;
  } | null>(null);

  const esfirraItems = useMemo(
    () => simpleMenuItems.filter((i) => i.category === "esfirra"),
    [simpleMenuItems],
  );
  const bebidaItems = useMemo(
    () => simpleMenuItems.filter((i) => i.category === "bebida"),
    [simpleMenuItems],
  );

  const minPizzaPrice = useMemo(() => {
    if (pizzas.length === 0) return null;
    return Math.min(...pizzas.map((p) => Number(p.base_price)));
  }, [pizzas]);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart],
  );

  // Chave de "mesma configuração": mesmo tamanho, mesmo conjunto de sabores
  // (ordem não importa), mesma borda e mesma observação — usada pra juntar
  // unidades idênticas do loop de pizza numa única linha do carrinho.
  function pizzaUnitKey(menuItemId: string, flavorIds: string[], crustId: string | undefined, notes: string) {
    return `${menuItemId}|${[...flavorIds].sort().join(",")}|${crustId ?? ""}|${notes}`;
  }

  function addPizzaToCart(params: { size: MenuItem; units: PizzaUnit[] }) {
    const { size, units } = params;
    setCart((current) => {
      const next = [...current];

      for (const unit of units) {
        const flavorIds = unit.flavors.map((f) => f.id);
        const notes = unit.notes.trim();
        const maxExtra = Math.max(...unit.flavors.map((f) => Number(f.extra_price)));
        const key = pizzaUnitKey(size.id, flavorIds, undefined, notes);

        const existingIndex = next.findIndex(
          (item) =>
            item.kind === "pizza" &&
            pizzaUnitKey(item.menu_item_id, item.flavor_ids ?? [], item.crust_id, item.item_notes ?? "") ===
              key,
        );

        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + 1,
          };
        } else {
          next.push({
            key: crypto.randomUUID(),
            kind: "pizza",
            menu_item_id: size.id,
            menu_item_name: size.name,
            flavor_ids: flavorIds,
            flavor_names: unit.flavors.map((f) => f.name),
            quantity: 1,
            item_notes: notes || undefined,
            unit_price: Number(size.base_price) + maxExtra,
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
      quantity,
      item_notes: notes.trim() || undefined,
      unit_price: Number(menuItem.base_price),
    };
    setCart((c) => [...c, item]);
  }

  function removeFromCart(key: string) {
    setCart((c) => c.filter((item) => item.key !== key));
  }

  async function confirmOrder() {
    if (!orderType || !paymentMethod) return;
    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("create-order", {
      body: {
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
        notes: orderNotes.trim() || undefined,
        items: cart.map((item) => ({
          menu_item_id: item.menu_item_id,
          flavor_ids: item.flavor_ids,
          crust_id: item.crust_id,
          quantity: item.quantity,
          item_notes: item.item_notes,
        })),
      },
    });

    setSubmitting(false);

    if (error) {
      let message =
        "Não conseguimos confirmar seu pedido agora. Tenta de novo em instantes.";
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.json();
          if (body?.error) message = body.error;
        } catch {
          // resposta sem corpo JSON, mantém a mensagem padrão
        }
      }
      setSubmitError(message);
      setView("error");
      return;
    }

    if (data) {
      setOrderResult({ order_id: data.order_id, total: data.total });
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
    setOrderResult(null);
    setSubmitError(null);
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
          className="font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
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
          cartCount={cart.length}
          cartTotal={total}
          onSelectPizza={() => setSheetTarget({ kind: "pizza" })}
          onSelectSimpleItem={(item) => setSheetTarget({ kind: "simple", item })}
          onOpenCart={() => setView("checkout")}
        />
      )}

      {view === "checkout" && (
        <CheckoutScreen
          cart={cart}
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
          orderNotes={orderNotes}
          onOrderNotesChange={setOrderNotes}
          total={total}
          submitting={submitting}
          onBack={() => setView("menu")}
          onConfirm={confirmOrder}
        />
      )}

      {view === "success" && orderResult && (
        <SuccessScreen
          orderId={orderResult.order_id}
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
          cartCount={cart.length}
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
