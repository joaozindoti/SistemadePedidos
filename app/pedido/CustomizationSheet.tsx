"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ORDER_LIMITS, type Crust, type Flavor, type MenuItem } from "@/lib/types";
import { flavorImage, isPackshot, simpleItemImage } from "@/lib/productImages";
import { formatBRL, Icon } from "./icons";

const FILLING_CHIPS = ["Catupiry", "Cheddar"] as const;

function hasOptionalFilling(flavorName: string) {
  return flavorName === "Frango" || flavorName === "Carne de Sol";
}

function fillingText(chip: (typeof FILLING_CHIPS)[number]) {
  return `Com ${chip.toLowerCase()}`;
}

// A observação é texto livre separado por vírgula; o atalho de recheio é só
// mais um trecho dela ("sem cebola, Com catupiry").
function noteParts(notes: string): string[] {
  return notes
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function hasNotePart(notes: string, text: string): boolean {
  return noteParts(notes).some((part) => part.toLowerCase() === text.toLowerCase());
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type SheetTarget = { kind: "pizza" } | { kind: "simple"; item: MenuItem };

export type PizzaUnit = { size: MenuItem; flavors: Flavor[]; crust: Crust | null; notes: string };

// Preço de uma pizza: tamanho + adicional do sabor (só com um sabor; meio a
// meio sai no preço normal) + borda. Mesma regra do create-order.
function pizzaUnitPrice(size: MenuItem | null, flavors: Flavor[], crust: Crust | null): number {
  return (
    (size ? Number(size.base_price) : 0) +
    (flavors.length === 1 ? Number(flavors[0].extra_price) : 0) +
    (crust ? Number(crust.extra_price) : 0)
  );
}

export default function CustomizationSheet({
  target,
  pizzaSizes,
  flavors,
  crusts,
  cartLines,
  cartUnits,
  cartTotal,
  onClose,
  onAddPizza,
  onAddSimpleItem,
  onGoToCheckout,
}: {
  target: SheetTarget;
  pizzaSizes: MenuItem[];
  flavors: Flavor[];
  crusts: Crust[];
  // Linhas da sacola (limite do pedido) e unidades (o que o cliente vê).
  cartLines: number;
  cartUnits: number;
  cartTotal: number;
  onClose: () => void;
  onAddPizza: (params: { units: PizzaUnit[] }) => void;
  onAddSimpleItem: (params: {
    item: MenuItem;
    quantity: number;
    notes: string;
  }) => void;
  onGoToCheckout: () => void;
}) {
  const isPizza = target.kind === "pizza";
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pra pizza: "form" só pergunta a quantidade de pizzas, "unit" pede
  // tamanho + sabores + borda + observação de cada unidade, uma de cada vez
  // ("Pizza 1 de N"), "added" é o resumo. Pra item simples (esfirra/
  // bebida) só existe "form" (quantidade + observação) e "added".
  const [phase, setPhase] = useState<"form" | "unit" | "added">("form");
  const [quantity, setQuantity] = useState(1);
  const [unitIndex, setUnitIndex] = useState(0);
  const [units, setUnits] = useState<PizzaUnit[]>([]);

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<string[]>([]);
  const [crustId, setCrustId] = useState<string | null>(null);
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);
  const [trimmedWarning, setTrimmedWarning] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [addedSummary, setAddedSummary] = useState<{
    title: string;
    detail: string;
    price: number;
  } | null>(null);

  // Diálogo modal: trava a rolagem do fundo e devolve o foco a quem abriu.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  // A cada etapa o conteúdo é trocado: o foco volta pro topo do diálogo
  // (senão cairia no body quando o botão clicado some) e a lista rola pro início.
  useEffect(() => {
    panelRef.current?.focus();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [phase, unitIndex]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const selectedSize = useMemo(
    () => pizzaSizes.find((p) => p.id === sizeId) ?? null,
    [pizzaSizes, sizeId],
  );
  const selectedCrust = useMemo(
    () => crusts.find((c) => c.id === crustId) ?? null,
    [crusts, crustId],
  );

  const salgadaFlavors = useMemo(
    () => flavors.filter((f) => f.flavor_type === "salgada"),
    [flavors],
  );
  const doceFlavors = useMemo(
    () => flavors.filter((f) => f.flavor_type === "doce"),
    [flavors],
  );

  const selectedFlavors = useMemo(
    () => flavors.filter((f) => selectedFlavorIds.includes(f.id)),
    [flavors, selectedFlavorIds],
  );

  // Tamanho criado sem max_flavors vale como 1 sabor (mesma regra do create-order).
  const maxFlavors = selectedSize ? (selectedSize.max_flavors ?? 1) : null;
  const limitReached = maxFlavors !== null && selectedFlavorIds.length >= maxFlavors;

  function toggleFlavor(flavor: Flavor) {
    if (selectedFlavorIds.includes(flavor.id)) {
      setSelectedFlavorIds(selectedFlavorIds.filter((id) => id !== flavor.id));
      return;
    }
    if (maxFlavors !== null && selectedFlavorIds.length >= maxFlavors) return;
    setSelectedFlavorIds([...selectedFlavorIds, flavor.id]);
    setJustSelectedId(flavor.id);
  }

  // Trocar de tamanho dentro da mesma unidade pode reduzir o limite de
  // sabores (max_flavors é do tamanho, não do fluxo inteiro) — se os
  // sabores já marcados passarem do novo limite, desmarca os excedentes
  // e avisa por quê.
  function selectUnitSize(newSizeId: string) {
    const newSize = pizzaSizes.find((p) => p.id === newSizeId) ?? null;
    setSizeId(newSizeId);

    const limit = newSize ? (newSize.max_flavors ?? 1) : null;
    if (newSize && limit !== null && selectedFlavorIds.length > limit) {
      const removedCount = selectedFlavorIds.length - limit;
      setSelectedFlavorIds(selectedFlavorIds.slice(0, limit));
      setTrimmedWarning(
        `Removemos ${removedCount} sabor${removedCount > 1 ? "es" : ""}: ${newSize.name} aceita no máximo ${limit} sabor${limit === 1 ? "" : "es"}.`,
      );
    } else {
      setTrimmedWarning(null);
    }
  }

  const showFillingChips = selectedFlavors.some((f) => hasOptionalFilling(f.name));

  const unitPrice = isPizza
    ? pizzaUnitPrice(selectedSize, selectedFlavors, selectedCrust)
    : target.kind === "simple"
      ? Number(target.item.base_price)
      : 0;

  const total = unitPrice * quantity;

  // Cada pizza pode virar uma linha nova na sacola, então a quantidade de
  // pizzas é limitada pelas vagas que ainda restam; item simples é uma linha só.
  const slotsLeft = ORDER_LIMITS.maxCartItems - cartLines;
  const cartFull = slotsLeft <= 0;
  const maxQuantity = isPizza
    ? Math.min(ORDER_LIMITS.maxQuantity, Math.max(slotsLeft, 1))
    : ORDER_LIMITS.maxQuantity;

  function clearUnit() {
    setSizeId(null);
    setSelectedFlavorIds([]);
    setCrustId(null);
    setNotes("");
    setTrimmedWarning(null);
  }

  function resetForm() {
    clearUnit();
    setQuantity(1);
    setUnitIndex(0);
    setUnits([]);
  }

  function handleContinueToUnits() {
    setUnits([]);
    setUnitIndex(0);
    clearUnit();
    setPhase("unit");
  }

  function repeatPreviousUnit() {
    if (unitIndex === 0) return;
    const prev = units[unitIndex - 1];
    setSizeId(prev.size.id);
    setSelectedFlavorIds(prev.flavors.map((f) => f.id));
    setCrustId(prev.crust?.id ?? null);
    setNotes(prev.notes);
    setTrimmedWarning(null);
  }

  function handleUnitNext() {
    if (!selectedSize || selectedFlavors.length === 0) return;
    const unit: PizzaUnit = {
      size: selectedSize,
      flavors: selectedFlavors,
      crust: selectedCrust,
      notes,
    };
    const completedUnits = [...units, unit];

    if (unitIndex < quantity - 1) {
      setUnits(completedUnits);
      setUnitIndex((i) => i + 1);
      clearUnit();
      return;
    }

    onAddPizza({ units: completedUnits });

    const describe = (u: PizzaUnit) =>
      u.flavors.map((f) => f.name).join(" + ") + (u.crust ? ` · borda ${u.crust.name}` : "");
    const title = completedUnits.length > 1 ? "Pizzas adicionadas" : completedUnits[0].size.name;
    const detail =
      completedUnits.length > 1
        ? completedUnits.map((u) => u.size.name).join(" + ")
        : describe(completedUnits[0]);
    const price = completedUnits.reduce(
      (sum, u) => sum + pizzaUnitPrice(u.size, u.flavors, u.crust),
      0,
    );

    setAddedSummary({ title, detail, price });
    resetForm();
    setPhase("added");
  }

  function handleAddSimple() {
    if (target.kind !== "simple") return;
    onAddSimpleItem({ item: target.item, quantity, notes });
    setAddedSummary({ title: target.item.name, detail: "", price: total });
    resetForm();
    setPhase("added");
  }

  // Liga/desliga só o trecho do recheio na observação, sem apagar o que o
  // cliente digitou. Os dois recheios são troca, então um tira o outro.
  function toggleFilling(chip: (typeof FILLING_CHIPS)[number]) {
    const text = fillingText(chip);
    const wasActive = hasNotePart(notes, text);
    const allFillings = FILLING_CHIPS.map((c) => fillingText(c).toLowerCase());
    const kept = noteParts(notes).filter((part) => !allFillings.includes(part.toLowerCase()));
    const next = wasActive ? kept : [...kept, text];
    const joined = next.join(", ");
    if (joined.length <= ORDER_LIMITS.itemNotesMax) setNotes(joined);
  }

  const title = isPizza
    ? phase === "unit" && quantity > 1
      ? `Pizza ${unitIndex + 1} de ${quantity}`
      : "Monte sua pizza"
    : target.kind === "simple"
      ? target.item.name
      : "";
  const description = target.kind === "simple" ? target.item.description : null;
  const headerImage =
    target.kind === "simple" ? simpleItemImage(target.item.name, target.item.category) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.7)] outline-none"
      >
        <div className="flex items-start justify-between gap-space-sm border-b border-surface-container-highest bg-surface-container-low/60 p-space-md">
          {headerImage && phase === "form" && (
            <div
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ${isPackshot(headerImage) ? "bg-white" : ""}`}
            >
              <Image
                src={headerImage}
                alt=""
                fill
                sizes="64px"
                className={isPackshot(headerImage) ? "object-contain p-1" : "object-cover"}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id={titleId}
              className="font-headline-lg text-headline-lg uppercase tracking-wide text-primary"
            >
              {phase === "added" ? "Adicionado à sacola" : title}
            </h2>
            {description && phase === "form" && (
              <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                {description}
              </p>
            )}
            {isPizza && phase === "form" && (
              <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                Quantas pizzas? Cada uma pode ter um tamanho e sabores diferentes.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {phase === "added" && addedSummary ? (
          <div className="flex flex-col gap-space-lg p-space-md">
            <div className="flex items-center gap-space-sm rounded bg-surface-container p-space-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
                <Icon name="check" className="text-primary text-[20px]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-body-md font-semibold text-body-md text-on-surface">
                  {addedSummary.title}
                  {addedSummary.detail ? ` · ${addedSummary.detail}` : ""}
                </p>
                <p className="font-label-sm text-label-sm text-primary">
                  {formatBRL(addedSummary.price)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between font-mono text-body-sm text-on-surface-variant">
              <span>
                {cartUnits} {cartUnits === 1 ? "item" : "itens"} na sacola
              </span>
              <span className="font-label-lg text-label-lg text-primary">
                {formatBRL(cartTotal)}
              </span>
            </div>

            <div className="flex flex-col gap-space-sm">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 w-full rounded-full border border-outline-variant bg-surface-container py-space-sm text-center font-headline-md text-headline-md uppercase tracking-wider text-on-surface transition-colors hover:bg-surface-container-high"
              >
                Adicionar outro item
              </button>
              <button
                type="button"
                onClick={onGoToCheckout}
                className="min-h-11 w-full rounded-full bg-primary py-space-sm text-center font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container"
              >
                Ir para o checkout
              </button>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex flex-col gap-space-lg overflow-y-auto overscroll-contain p-space-md">
              {isPizza && phase === "unit" && (
                <fieldset className="flex flex-col gap-space-xs">
                  <legend className="flex w-full items-center justify-between">
                    <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                      Escolha o tamanho
                    </span>
                    <span className="font-label-sm text-label-sm text-primary">
                      OBRIGATÓRIO
                    </span>
                  </legend>
                  <div className="mt-space-xs flex flex-col gap-space-xs">
                    {pizzaSizes.map((size) => {
                      const selected = size.id === sizeId;
                      return (
                        <label
                          key={size.id}
                          className={`flex min-h-11 cursor-pointer items-center justify-between rounded p-space-sm transition-colors ${
                            selected
                              ? "border border-primary bg-surface-container-high"
                              : "border border-transparent bg-surface-container hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="flex items-center gap-space-sm">
                            <input
                              type="radio"
                              name="tamanho"
                              className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                              checked={selected}
                              onChange={() => selectUnitSize(size.id)}
                            />
                            <span
                              className={`font-body-md text-body-md text-on-surface ${selected ? "font-semibold" : ""}`}
                            >
                              {size.name}
                            </span>
                          </div>
                          <span
                            className={`font-headline-md text-headline-md ${
                              selected ? "font-bold text-primary" : "text-on-surface-variant"
                            }`}
                          >
                            {formatBRL(Number(size.base_price))}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {isPizza && phase === "unit" && (
                <fieldset className="flex flex-col gap-space-xs">
                  <legend className="flex w-full items-center justify-between">
                    <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                      Escolha o(s) sabor(es)
                    </span>
                    <span className="font-label-sm text-label-sm text-primary" aria-live="polite">
                      {maxFlavors !== null
                        ? `${selectedFlavorIds.length} de ${maxFlavors} selecionado${selectedFlavorIds.length === 1 ? "" : "s"}`
                        : "ESCOLHA O TAMANHO PRIMEIRO"}
                    </span>
                  </legend>

                  {trimmedWarning && (
                    <p
                      role="status"
                      className="rounded bg-primary/10 px-space-sm py-space-xs font-body-sm text-body-sm text-primary"
                    >
                      {trimmedWarning}
                    </p>
                  )}

                  {([
                    ["Salgadas", salgadaFlavors],
                    ["Doces", doceFlavors],
                  ] as const).map(([groupLabel, groupFlavors]) =>
                    groupFlavors.length === 0 ? null : (
                      <div key={groupLabel} className="mt-space-sm flex flex-col gap-space-xs">
                        <span className="font-label-md text-label-md uppercase tracking-wider text-outline">
                          {groupLabel}
                        </span>
                        {groupFlavors.map((flavor) => {
                          const img = flavorImage(flavor.name);
                          const selected = selectedFlavorIds.includes(flavor.id);
                          const disabled = !selectedSize || (!selected && limitReached);
                          return (
                            <label
                              key={flavor.id}
                              onAnimationEnd={() => setJustSelectedId(null)}
                              className={`flex items-center justify-between rounded p-space-sm transition-colors ${
                                disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                              } ${
                                selected
                                  ? "border border-primary bg-surface-container-high"
                                  : "border border-transparent bg-surface-container hover:bg-surface-container-high"
                              } ${justSelectedId === flavor.id ? "animate-flavor-pulse" : ""}`}
                            >
                              <div className="flex items-center gap-space-sm">
                                <input
                                  type="checkbox"
                                  className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                                  checked={selected}
                                  disabled={disabled}
                                  onChange={() => toggleFlavor(flavor)}
                                />
                                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[50%] bg-[#0b0b0c]">
                                  {img ? (
                                    <Image src={img} alt="" fill sizes="44px" className="object-cover" />
                                  ) : (
                                    <Icon
                                      name={flavor.flavor_type === "doce" ? "cake" : "local_pizza"}
                                      className="text-[22px] text-[#e5b842]"
                                    />
                                  )}
                                </span>
                                <span className="flex flex-wrap items-center gap-space-xs">
                                  <span
                                    className={`font-body-md text-body-md text-on-surface ${selected ? "font-semibold" : ""}`}
                                  >
                                    {flavor.name}
                                  </span>
                                  {hasOptionalFilling(flavor.name) && (
                                    <span className="rounded bg-primary/20 px-1.5 py-0.5 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
                                      Opção de recheio
                                    </span>
                                  )}
                                </span>
                              </div>
                              {Number(flavor.extra_price) > 0 && (
                                <span
                                  className={`font-headline-md text-headline-md ${
                                    selected ? "font-bold text-primary" : "text-on-surface-variant"
                                  }`}
                                >
                                  + {formatBRL(Number(flavor.extra_price))}
                                  {(maxFlavors ?? 1) > 1 && (
                                    <span className="block font-label-sm text-label-sm font-normal">
                                      só se for inteira
                                    </span>
                                  )}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ),
                  )}
                </fieldset>
              )}

              {isPizza && phase === "unit" && crusts.length > 0 && (
                <fieldset className="flex flex-col gap-space-xs">
                  <legend className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                    Borda (opcional)
                  </legend>
                  <div className="mt-space-xs flex flex-col gap-space-xs">
                    {[null, ...crusts].map((crust) => {
                      const selected = (crust?.id ?? null) === crustId;
                      return (
                        <label
                          key={crust?.id ?? "sem-borda"}
                          className={`flex min-h-11 cursor-pointer items-center justify-between rounded p-space-sm transition-colors ${
                            selected
                              ? "border border-primary bg-surface-container-high"
                              : "border border-transparent bg-surface-container hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="flex items-center gap-space-sm">
                            <input
                              type="radio"
                              name="borda"
                              className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                              checked={selected}
                              onChange={() => setCrustId(crust?.id ?? null)}
                            />
                            <span
                              className={`font-body-md text-body-md text-on-surface ${selected ? "font-semibold" : ""}`}
                            >
                              {crust ? crust.name : "Sem borda"}
                            </span>
                          </div>
                          {crust && Number(crust.extra_price) > 0 && (
                            <span
                              className={`font-headline-md text-headline-md ${
                                selected ? "font-bold text-primary" : "text-on-surface-variant"
                              }`}
                            >
                              + {formatBRL(Number(crust.extra_price))}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {isPizza && phase === "unit" && showFillingChips && (
                <section className="flex flex-col gap-space-xs" aria-labelledby={`${titleId}-recheio`}>
                  <span
                    id={`${titleId}-recheio`}
                    className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface"
                  >
                    Troca de recheio (opcional)
                  </span>
                  <div className="mt-space-xs flex gap-space-sm">
                    {FILLING_CHIPS.map((chip) => {
                      const active = hasNotePart(notes, fillingText(chip));
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => toggleFilling(chip)}
                          aria-pressed={active}
                          className={`min-h-11 rounded-full px-space-md py-space-xs font-headline-md text-headline-md uppercase transition-colors ${
                            active
                              ? "bg-primary font-bold text-on-primary"
                              : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {chip}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {(!isPizza || phase === "unit") && (
                <section className="flex flex-col gap-space-xs">
                  <label
                    htmlFor={`${titleId}-obs`}
                    className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface"
                  >
                    Observações do preparo
                  </label>
                  <textarea
                    id={`${titleId}-obs`}
                    value={notes}
                    maxLength={ORDER_LIMITS.itemNotesMax}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: sem cebola, massa bem assada..."
                    rows={2}
                    className="w-full resize-none rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
                  />
                </section>
              )}
            </div>

            {isPizza && phase === "unit" ? (
              <div className="flex items-center justify-between gap-space-md border-t border-surface-container-highest bg-surface-container p-space-md">
                {unitIndex > 0 ? (
                  <button
                    type="button"
                    onClick={repeatPreviousUnit}
                    className="flex min-h-11 shrink-0 items-center gap-space-xs rounded-full border border-outline-variant px-space-sm py-space-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    <Icon name="content_copy" className="text-[16px]" />
                    Repetir anterior
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleUnitNext}
                  disabled={!selectedSize || selectedFlavors.length === 0}
                  className="flex min-h-11 flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{unitIndex < quantity - 1 ? "Próxima pizza" : "Adicionar à sacola"}</span>
                  <span aria-hidden="true">•</span>
                  <span>{formatBRL(unitPrice)}</span>
                </button>
              </div>
            ) : (
              <>
              {cartFull && (
                <p
                  role="alert"
                  className="border-t border-surface-container-highest bg-error-container px-space-md py-space-sm font-body-sm text-body-sm font-semibold text-on-error-container"
                >
                  Sua sacola chegou ao limite de {ORDER_LIMITS.maxCartItems} itens. Finalize este
                  pedido ou remova algum item para adicionar outro.
                </p>
              )}
              <div className="flex items-center justify-between gap-space-md border-t border-surface-container-highest bg-surface-container p-space-md">
                <div className="flex items-center rounded-full border border-surface-container-highest bg-surface-container-low p-1">
                  <button
                    type="button"
                    aria-label="Diminuir quantidade"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon name="remove" className="text-[18px]" />
                  </button>
                  <span
                    aria-live="polite"
                    className="px-space-md font-headline-md text-headline-md font-bold text-on-surface"
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar quantidade"
                    onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon name="add" className="text-[18px]" />
                  </button>
                </div>
                {isPizza ? (
                  <button
                    type="button"
                    onClick={handleContinueToUnits}
                    disabled={cartFull}
                    className="flex min-h-11 flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddSimple}
                    disabled={cartFull}
                    className="flex min-h-11 flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span>Adicionar à sacola</span>
                    <span aria-hidden="true">•</span>
                    <span>{formatBRL(total)}</span>
                  </button>
                )}
              </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
