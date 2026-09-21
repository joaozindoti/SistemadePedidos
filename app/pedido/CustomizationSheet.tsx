"use client";

import { useMemo, useState } from "react";
import type { Flavor, MenuItem } from "@/lib/types";
import { formatBRL, Icon } from "./icons";

const FILLING_CHIPS = ["Catupiry", "Cheddar"] as const;

function hasOptionalFilling(flavorName: string) {
  return flavorName === "Frango" || flavorName === "Carne de Sol";
}

export type SheetTarget = { kind: "pizza" } | { kind: "simple"; item: MenuItem };

export type PizzaUnit = { flavors: Flavor[]; notes: string };

export default function CustomizationSheet({
  target,
  pizzaSizes,
  flavors,
  cartCount,
  cartTotal,
  onClose,
  onAddPizza,
  onAddSimpleItem,
  onGoToCheckout,
}: {
  target: SheetTarget;
  pizzaSizes: MenuItem[];
  flavors: Flavor[];
  cartCount: number;
  cartTotal: number;
  onClose: () => void;
  onAddPizza: (params: { size: MenuItem; units: PizzaUnit[] }) => void;
  onAddSimpleItem: (params: {
    item: MenuItem;
    quantity: number;
    notes: string;
  }) => void;
  onGoToCheckout: () => void;
}) {
  const isPizza = target.kind === "pizza";

  // Pra pizza: "form" escolhe tamanho+quantidade, "flavors" pede o sabor de
  // cada unidade (uma de cada vez, "Pizza 1 de N"), "added" é o resumo.
  // Pra item simples (esfirra/bebida) só existe "form" e "added".
  const [phase, setPhase] = useState<"form" | "flavors" | "added">("form");
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitIndex, setUnitIndex] = useState(0);
  const [units, setUnits] = useState<PizzaUnit[]>([]);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<string[]>([]);
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [addedSummary, setAddedSummary] = useState<{
    title: string;
    detail: string;
    price: number;
  } | null>(null);

  const selectedSize = useMemo(
    () => pizzaSizes.find((p) => p.id === sizeId) ?? null,
    [pizzaSizes, sizeId],
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

  const maxFlavors = selectedSize?.max_flavors ?? null;
  const limitReached = maxFlavors !== null && selectedFlavorIds.length >= maxFlavors;

  function toggleFlavor(flavor: Flavor) {
    setSelectedFlavorIds((current) => {
      if (current.includes(flavor.id)) {
        return current.filter((id) => id !== flavor.id);
      }
      if (maxFlavors !== null && current.length >= maxFlavors) {
        return current;
      }
      setJustSelectedId(flavor.id);
      setTimeout(() => setJustSelectedId((id) => (id === flavor.id ? null : id)), 200);
      return [...current, flavor.id];
    });
  }

  const showFillingChips = selectedFlavors.some((f) => hasOptionalFilling(f.name));

  const unitPrice = isPizza
    ? (selectedSize ? Number(selectedSize.base_price) : 0) +
      (selectedFlavors.length > 0
        ? Math.max(...selectedFlavors.map((f) => Number(f.extra_price)))
        : 0)
    : target.kind === "simple"
      ? Number(target.item.base_price)
      : 0;

  const total = unitPrice * quantity;

  function resetForm() {
    setSizeId(null);
    setSelectedFlavorIds([]);
    setQuantity(1);
    setNotes("");
    setUnitIndex(0);
    setUnits([]);
  }

  function handleContinueToFlavors() {
    if (!selectedSize) return;
    setUnits([]);
    setUnitIndex(0);
    setSelectedFlavorIds([]);
    setNotes("");
    setPhase("flavors");
  }

  function repeatPreviousUnit() {
    if (unitIndex === 0) return;
    const prev = units[unitIndex - 1];
    setSelectedFlavorIds(prev.flavors.map((f) => f.id));
    setNotes(prev.notes);
  }

  function handleUnitNext() {
    if (!selectedSize || selectedFlavors.length === 0) return;
    const unit: PizzaUnit = { flavors: selectedFlavors, notes };
    const completedUnits = [...units, unit];

    if (unitIndex < quantity - 1) {
      setUnits(completedUnits);
      setUnitIndex((i) => i + 1);
      setSelectedFlavorIds([]);
      setNotes("");
      return;
    }

    onAddPizza({ size: selectedSize, units: completedUnits });

    const detail =
      completedUnits.length > 1
        ? `${completedUnits.length} pizzas configuradas`
        : completedUnits[0].flavors.map((f) => f.name).join(" + ");
    const price = completedUnits.reduce((sum, u) => {
      const extra =
        u.flavors.length > 0 ? Math.max(...u.flavors.map((f) => Number(f.extra_price))) : 0;
      return sum + Number(selectedSize.base_price) + extra;
    }, 0);

    setAddedSummary({ title: selectedSize.name, detail, price });
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

  function toggleFilling(chip: (typeof FILLING_CHIPS)[number]) {
    const text = `Com ${chip.toLowerCase()}`;
    setNotes((current) => (current === text ? "" : text));
  }

  const title = isPizza
    ? phase === "flavors" && quantity > 1
      ? `Pizza ${unitIndex + 1} de ${quantity}`
      : "Monte sua pizza"
    : target.kind === "simple"
      ? target.item.name
      : "";
  const description = target.kind === "simple" ? target.item.description : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
      <div className="mx-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.7)]">
        <div className="flex items-start justify-between gap-space-sm border-b border-surface-container-highest bg-surface-container-low/60 p-space-md">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-headline-lg text-headline-lg uppercase tracking-wide text-primary">
              {phase === "added" ? "Adicionado à sacola" : title}
            </h2>
            {description && phase === "form" && (
              <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high"
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
                {cartCount} {cartCount === 1 ? "item" : "itens"} na sacola
              </span>
              <span className="font-label-lg text-label-lg text-primary">
                {formatBRL(cartTotal)}
              </span>
            </div>

            <div className="flex flex-col gap-space-sm">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border border-flour/15 bg-surface-container py-space-sm text-center font-headline-md text-headline-md uppercase tracking-wider text-on-surface transition-colors hover:bg-surface-container-high"
              >
                Adicionar outro item
              </button>
              <button
                type="button"
                onClick={onGoToCheckout}
                className="w-full rounded-full bg-primary py-space-sm text-center font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container"
              >
                Ir para o checkout
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-space-lg overflow-y-auto p-space-md">
              {isPizza && phase === "form" && (
                <section className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                      Escolha o tamanho
                    </span>
                    <span className="font-label-sm text-label-sm text-primary">
                      OBRIGATÓRIO
                    </span>
                  </div>
                  <div className="mt-space-xs flex flex-col gap-space-xs">
                    {pizzaSizes.map((size) => {
                      const selected = size.id === sizeId;
                      return (
                        <label
                          key={size.id}
                          className={`flex cursor-pointer items-center justify-between rounded p-space-sm transition-colors ${
                            selected
                              ? "border border-primary bg-surface-container-high"
                              : "border border-transparent bg-surface-container hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="flex items-center gap-space-sm">
                            <input
                              type="radio"
                              name="tamanho"
                              className="h-4 w-4 cursor-pointer accent-primary"
                              checked={selected}
                              onChange={() => setSizeId(size.id)}
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
                </section>
              )}

              {isPizza && phase === "flavors" && (
                <section className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                      Escolha o(s) sabor(es)
                    </span>
                    <span className="font-label-sm text-label-sm text-primary">
                      {selectedFlavorIds.length} de {maxFlavors} selecionado
                      {selectedFlavorIds.length === 1 ? "" : "s"}
                    </span>
                  </div>

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
                          const selected = selectedFlavorIds.includes(flavor.id);
                          const disabled = !selected && limitReached;
                          return (
                            <label
                              key={flavor.id}
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
                                  className="h-4 w-4 cursor-pointer accent-primary"
                                  checked={selected}
                                  disabled={disabled}
                                  onChange={() => toggleFlavor(flavor)}
                                />
                                <span className="flex items-center gap-space-xs">
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
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ),
                  )}
                </section>
              )}

              {isPizza && phase === "flavors" && showFillingChips && (
                <section className="flex flex-col gap-space-xs">
                  <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                    Troca de recheio (opcional)
                  </span>
                  <div className="mt-space-xs flex gap-space-sm">
                    {FILLING_CHIPS.map((chip) => {
                      const active = notes === `Com ${chip.toLowerCase()}`;
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => toggleFilling(chip)}
                          className={`rounded-full px-space-md py-space-xs font-headline-md text-headline-md uppercase transition-colors ${
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

              {(!isPizza || phase === "flavors") && (
                <section className="flex flex-col gap-space-xs">
                  <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                    Observações do preparo
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: sem cebola, massa bem assada..."
                    rows={2}
                    className="w-full resize-none rounded border border-surface-container-highest bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
                  />
                </section>
              )}
            </div>

            {isPizza && phase === "flavors" ? (
              <div className="flex items-center justify-between gap-space-md border-t border-surface-container-highest bg-surface-container p-space-md">
                {unitIndex > 0 ? (
                  <button
                    type="button"
                    onClick={repeatPreviousUnit}
                    className="flex shrink-0 items-center gap-space-xs rounded-full border border-flour/15 px-space-sm py-space-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
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
                  disabled={selectedFlavors.length === 0}
                  className="flex flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{unitIndex < quantity - 1 ? "Próxima pizza" : "Adicionar à sacola"}</span>
                  <span>•</span>
                  <span>{formatBRL(unitPrice)}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-space-md border-t border-surface-container-highest bg-surface-container p-space-md">
                <div className="flex items-center rounded-full border border-surface-container-highest bg-surface-container-low p-1">
                  <button
                    type="button"
                    aria-label="Diminuir quantidade"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-on-surface transition-colors hover:bg-surface-container-high"
                  >
                    <Icon name="remove" className="text-[18px]" />
                  </button>
                  <span className="px-space-md font-headline-md text-headline-md font-bold text-on-surface">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Aumentar quantidade"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-container"
                  >
                    <Icon name="add" className="text-[18px]" />
                  </button>
                </div>
                {isPizza ? (
                  <button
                    type="button"
                    onClick={handleContinueToFlavors}
                    disabled={!selectedSize}
                    className="flex flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddSimple}
                    className="flex flex-1 items-center justify-center gap-space-xs rounded-full bg-primary px-space-md py-space-sm font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary shadow-md transition-colors hover:bg-primary-container"
                  >
                    <span>Adicionar à sacola</span>
                    <span>•</span>
                    <span>{formatBRL(total)}</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
