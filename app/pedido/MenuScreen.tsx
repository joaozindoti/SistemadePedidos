"use client";

import { useMemo, useState } from "react";
import type { Flavor, MenuItem } from "@/lib/types";
import { formatBRL, Icon } from "./icons";

const WHATSAPP_NUMBER = "5599984578154";

type PizzaSection = {
  key: "pizzas";
  label: string;
  icon: string;
  badge: string;
  kind: "pizza";
  flavors: Flavor[];
};

type SimpleSection = {
  key: string;
  label: string;
  icon: string;
  badge: string;
  kind: "simple";
  items: MenuItem[];
};

type Section = PizzaSection | SimpleSection;

export default function MenuScreen({
  pizzas,
  allFlavors,
  esfirraItems,
  bebidaItems,
  minPizzaPrice,
  cartCount,
  cartTotal,
  onSelectPizza,
  onSelectSimpleItem,
  onOpenCart,
}: {
  pizzas: MenuItem[];
  allFlavors: Flavor[];
  esfirraItems: MenuItem[];
  bebidaItems: MenuItem[];
  minPizzaPrice: number | null;
  cartCount: number;
  cartTotal: number;
  onSelectPizza: () => void;
  onSelectSimpleItem: (item: MenuItem) => void;
  onOpenCart: () => void;
}) {
  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [];
    if (allFlavors.length > 0) {
      list.push({
        key: "pizzas",
        label: "Pizzas",
        icon: "local_pizza",
        badge: `${allFlavors.length} SABORES`,
        kind: "pizza",
        flavors: allFlavors,
      });
    }
    if (esfirraItems.length > 0) {
      list.push({
        key: "esfirras",
        label: "Esfirras",
        icon: "bakery_dining",
        badge: "UNIDADE",
        kind: "simple",
        items: esfirraItems,
      });
    }
    if (bebidaItems.length > 0) {
      list.push({
        key: "bebidas",
        label: "Bebidas",
        icon: "local_cafe",
        badge: "GELADA",
        kind: "simple",
        items: bebidaItems,
      });
    }
    return list;
  }, [allFlavors, esfirraItems, bebidaItems]);

  const [search, setSearch] = useState("");
  const [activePill, setActivePill] = useState<string>("todas");

  const query = search.trim().toLowerCase();

  const visibleSections = sections
    .filter((s) => activePill === "todas" || activePill === s.key)
    .filter((s) => {
      if (!query) return true;
      if (s.kind === "pizza") {
        return (
          s.label.toLowerCase().includes(query) ||
          s.flavors.some((f) => f.name.toLowerCase().includes(query))
        );
      }
      return s.items.some((i) => i.name.toLowerCase().includes(query));
    })
    .map((s) => {
      if (!query || s.kind === "pizza") return s;
      return {
        ...s,
        items: s.items.filter((i) => i.name.toLowerCase().includes(query)),
      };
    });

  const maxFlavors = pizzas.length > 0 ? Math.max(...pizzas.map((p) => p.max_flavors ?? 1)) : 1;

  return (
    <div className="min-h-dvh bg-surface pb-32">
      <header className="fixed inset-x-0 top-0 z-40 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="mx-auto flex h-20 max-w-lg items-center justify-between gap-space-sm px-margin">
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md uppercase tracking-wider text-primary">
              Sidney &amp; Shirley
            </span>
            <span className="-mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Pizzaria • Pedreiras - MA
            </span>
          </div>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar no WhatsApp"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-container"
          >
            <Icon name="chat" className="text-[18px]" />
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-margin pt-20">
        <div className="relative mt-space-sm flex h-48 w-full flex-col items-center justify-end overflow-hidden rounded-xl bg-surface-container-lowest p-space-md text-center shadow-md">
          <Icon
            name="local_fire_department"
            className="absolute top-space-md text-primary/20 text-[96px]"
          />
          <span className="relative mb-space-xs rounded bg-surface-container-high/90 px-space-sm py-0.5 font-label-sm text-label-sm uppercase tracking-wider text-primary">
            Forno a lenha artesanal
          </span>
          <h1 className="relative font-headline-xl text-headline-xl uppercase tracking-wide text-primary">
            Sidney &amp; Shirley
          </h1>
          <p className="relative -mt-space-xs font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            Sabor que chega quente até você!
          </p>
        </div>

        <div className="mt-space-md flex flex-col gap-space-sm">
          <div className="relative flex items-center">
            <Icon
              name="search"
              className="absolute left-space-sm text-on-surface-variant text-[20px]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no cardápio..."
              className="w-full rounded border-0 bg-surface-container-low py-space-sm pl-10 pr-space-md font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:bg-surface-container-high"
              type="text"
            />
          </div>

          <div className="flex items-center gap-space-xs overflow-x-auto py-space-xs">
            <button
              type="button"
              onClick={() => setActivePill("todas")}
              className={`flex shrink-0 items-center gap-space-xs rounded-full px-space-md py-space-xs font-headline-md text-headline-md uppercase transition-colors ${
                activePill === "todas"
                  ? "bg-primary font-bold text-on-primary shadow-sm"
                  : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name="grid_view" className="text-[18px]" />
              <span>Todas</span>
            </button>
            {sections.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActivePill(s.key)}
                className={`flex shrink-0 items-center gap-space-xs rounded-full px-space-md py-space-xs font-headline-md text-headline-md uppercase transition-colors ${
                  activePill === s.key
                    ? "bg-primary font-bold text-on-primary shadow-sm"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <Icon name={s.icon} className="text-[18px]" />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {visibleSections.length === 0 && (
          <p className="mt-space-xl text-center font-body-md text-body-md text-on-surface-variant">
            Nada encontrado para &quot;{search}&quot;.
          </p>
        )}

        {visibleSections.map((section) => (
          <section key={section.key} className="mt-space-lg flex flex-col gap-space-md">
            <div className="flex items-center justify-between border-b border-surface-container-highest pb-space-xs">
              <span className="font-headline-lg text-headline-lg uppercase tracking-wide text-primary">
                {section.label}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {section.badge}
              </span>
            </div>

            <div className="flex flex-col divide-y divide-surface-container-high">
              {section.kind === "pizza" ? (
                <article
                  onClick={onSelectPizza}
                  className="flex cursor-pointer items-center justify-between gap-space-md rounded px-space-xs py-space-md transition-colors hover:bg-surface-container-low/40"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h2 className="font-headline-md text-headline-md uppercase tracking-wide text-on-surface">
                      Monte a sua
                    </h2>
                    <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
                      Escolha o tamanho e até {maxFlavors} sabores, salgados ou doces
                    </p>
                    {minPizzaPrice !== null && (
                      <span className="mt-space-sm font-headline-md text-headline-md text-primary">
                        A partir de {formatBRL(minPizzaPrice)}
                      </span>
                    )}
                  </div>
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest">
                    <Icon name={section.icon} className="text-outline text-[32px]" />
                  </div>
                </article>
              ) : (
                section.items.map((item) => (
                  <article
                    key={item.id}
                    onClick={() => onSelectSimpleItem(item)}
                    className="flex cursor-pointer items-center justify-between gap-space-md rounded px-space-xs py-space-md transition-colors hover:bg-surface-container-low/40"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h2 className="font-headline-md text-headline-md uppercase tracking-wide text-on-surface">
                        {item.name}
                      </h2>
                      {item.description && (
                        <p className="mt-space-xs line-clamp-2 font-body-sm text-body-sm text-on-surface-variant">
                          {item.description}
                        </p>
                      )}
                      <span className="mt-space-sm font-headline-md text-headline-md text-primary">
                        {formatBRL(Number(item.base_price))}
                      </span>
                    </div>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-surface-container-lowest">
                      <Icon name={section.icon} className="text-outline text-[32px]" />
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ))}
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg">
          <button
            type="button"
            onClick={onOpenCart}
            className="flex w-full cursor-pointer items-center justify-between rounded-full bg-primary p-space-md font-bold text-on-primary shadow-[0_4px_20px_rgba(0,0,0,0.7)] transition-colors hover:bg-primary-container"
          >
            <div className="flex items-center gap-space-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-on-primary text-primary">
                <Icon name="shopping_bag" className="text-[20px]" />
              </div>
              <div className="flex flex-col items-start text-left">
                <span className="font-headline-md text-headline-md uppercase leading-none tracking-wide text-on-primary">
                  Ver sacola
                </span>
                <span className="font-body-sm text-body-sm font-semibold opacity-90">
                  {cartCount} {cartCount === 1 ? "item" : "itens"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-space-xs font-headline-md text-headline-md text-on-primary">
              <span>{formatBRL(cartTotal)}</span>
              <Icon name="chevron_right" className="text-[20px]" />
            </div>
          </button>
        </div>
      )}

      <footer className="mt-space-xl w-full bg-surface-container-lowest py-space-lg shadow-[0_-1px_8px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-space-xs px-margin text-center">
          <span className="font-headline-md text-headline-md uppercase tracking-wide text-on-surface">
            Sidney &amp; Shirley Pizzaria
          </span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Av. Zeca Branco, Nº 249, Mutirão — Pedreiras, MA
          </p>
          <p className="font-label-sm text-label-sm text-primary">
            WhatsApp: (99) 98457-8154
          </p>
        </div>
      </footer>
    </div>
  );
}
