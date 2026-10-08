"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Flavor, MenuItem } from "@/lib/types";
import { flavorImage, PIZZA_IMAGE, simpleItemImage } from "@/lib/productImages";
import { ThemeToggle } from "@/lib/theme";
import BrandHero from "./BrandHero";
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

// "Pizza G (8 fatias)" → "G" pros chips de tamanho do card de pizza.
function shortSizeName(name: string): string {
  return name.replace(/^Pizza\s+/i, "").replace(/\s*\(.*\)\s*$/, "");
}

function ProductThumb({ src, icon, alt }: { src: string | null; icon: string; alt: string }) {
  return (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-container-high">
      {src ? (
        <Image src={src} alt={alt} fill sizes="96px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Icon name={icon} className="text-[36px] text-outline" />
        </div>
      )}
    </div>
  );
}

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
        badge: `${allFlavors.length} sabores`,
        kind: "pizza",
        flavors: allFlavors,
      });
    }
    if (esfirraItems.length > 0) {
      list.push({
        key: "esfirras",
        label: "Esfirras",
        icon: "bakery_dining",
        badge: "Unidade",
        kind: "simple",
        items: esfirraItems,
      });
    }
    if (bebidaItems.length > 0) {
      list.push({
        key: "bebidas",
        label: "Bebidas",
        icon: "local_drink",
        badge: "Geladas",
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
      if (!query) return s;
      if (s.kind === "pizza") {
        const matching = s.flavors.filter((f) => f.name.toLowerCase().includes(query));
        return { ...s, flavors: matching.length > 0 ? matching : s.flavors };
      }
      return {
        ...s,
        items: s.items.filter((i) => i.name.toLowerCase().includes(query)),
      };
    });

  const maxFlavors = pizzas.length > 0 ? Math.max(...pizzas.map((p) => p.max_flavors ?? 1)) : 1;

  // Sabores com foto primeiro na vitrine; os sem foto vêm depois com ícone.
  function orderedFlavors(flavors: Flavor[]): Flavor[] {
    return [...flavors].sort(
      (a, b) => Number(Boolean(flavorImage(b.name))) - Number(Boolean(flavorImage(a.name))),
    );
  }

  return (
    <div className="min-h-dvh bg-surface pb-32">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-outline-variant/50 bg-surface-container-lowest/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-lg items-center justify-between gap-space-sm px-margin">
          <div className="flex min-w-0 items-center gap-space-sm">
            <Image
              src="/brand/logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-display text-xl font-extrabold uppercase leading-none tracking-wide text-primary">
                Sidney &amp; Shirley
              </span>
              <span className="truncate text-xs text-on-surface-variant">
                Pizzaria • Pedreiras - MA
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-xs">
            <ThemeToggle />
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar no WhatsApp"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-container"
            >
              <Icon name="chat" className="text-[20px]" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-margin pt-20">
        <BrandHero onOrderNow={onSelectPizza} />

        <div className="sticky top-16 z-30 -mx-margin mt-space-md flex flex-col gap-space-sm bg-surface/95 px-margin pb-space-xs pt-space-sm backdrop-blur">
          <div className="relative flex items-center">
            <Icon
              name="search"
              className="absolute left-space-sm text-on-surface-variant text-[20px]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar sabor, esfirra, bebida..."
              aria-label="Buscar no cardápio"
              className="w-full rounded-full border border-outline-variant bg-surface-container-low py-space-sm pl-10 pr-space-md font-body-md text-body-md text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
              type="text"
            />
          </div>

          <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs">
            {[{ key: "todas", label: "Todas", icon: "grid_view" }, ...sections].map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActivePill(s.key)}
                aria-pressed={activePill === s.key}
                className={`flex min-h-10 shrink-0 items-center gap-space-xs rounded-full px-space-md font-display text-lg font-bold uppercase tracking-wide transition-colors ${
                  activePill === s.key
                    ? "bg-primary text-on-primary shadow-sm"
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
            <div className="flex items-end justify-between">
              <h2 className="flex items-center gap-space-sm font-display text-[34px] font-extrabold uppercase leading-none tracking-wide text-on-surface">
                <span className="h-7 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {section.label}
              </h2>
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                {section.badge}
              </span>
            </div>

            {section.kind === "pizza" ? (
              <>
                <article className="overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-low">
                  <button
                    type="button"
                    onClick={onSelectPizza}
                    className="block w-full text-left"
                  >
                    <div className="relative h-44 w-full overflow-hidden bg-[#0b0b0c]">
                      <Image
                        src={PIZZA_IMAGE}
                        alt="Pizza assada no forno a lenha"
                        fill
                        sizes="(max-width: 512px) 100vw, 512px"
                        className="object-cover object-[50%_60%]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                      <div className="absolute bottom-space-sm left-space-md right-space-md flex items-end justify-between gap-space-sm text-white">
                        <div>
                          <span className="font-display text-3xl font-extrabold uppercase leading-none">
                            Monte a sua
                          </span>
                          <p className="text-sm text-white/85">
                            Até {maxFlavors} sabores • salgadas ou doces
                          </p>
                        </div>
                        {minPizzaPrice !== null && (
                          <span className="shrink-0 rounded-lg bg-[#e5b842] px-space-sm py-1 text-right leading-tight text-[#1d1500]">
                            <span className="block text-[10px] font-bold uppercase tracking-wider">
                              a partir de
                            </span>
                            <span className="font-display text-2xl font-extrabold">
                              {formatBRL(minPizzaPrice)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {pizzas.length > 0 && (
                    <div className="flex flex-col gap-space-sm p-space-md">
                      <span className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                        Tamanhos
                      </span>
                      <div className="flex flex-wrap gap-space-xs">
                        {pizzas.map((p) => (
                          <span
                            key={p.id}
                            className="flex items-baseline gap-1 rounded-full border border-outline-variant px-space-sm py-1 text-sm text-on-surface"
                          >
                            <strong className="font-display text-base uppercase">
                              {shortSizeName(p.name)}
                            </strong>
                            <span className="text-on-surface-variant">
                              {formatBRL(Number(p.base_price))}
                            </span>
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={onSelectPizza}
                        className="mt-space-xs flex min-h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary font-display text-xl font-extrabold uppercase tracking-wide text-on-primary transition-colors hover:bg-primary-container"
                      >
                        <Icon name="add" className="text-[22px]" />
                        Montar minha pizza
                      </button>
                    </div>
                  )}
                </article>

                <div className="flex flex-col gap-space-sm">
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant">
                    Nossos sabores
                  </span>
                  <div className="-mx-margin flex snap-x gap-space-sm overflow-x-auto px-margin pb-space-xs">
                    {orderedFlavors(section.flavors).map((flavor) => {
                      const img = flavorImage(flavor.name);
                      return (
                        <button
                          key={flavor.id}
                          type="button"
                          onClick={onSelectPizza}
                          className="flex w-28 shrink-0 snap-start flex-col items-center gap-space-xs text-center"
                        >
                          <span className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[50%] bg-[#0b0b0c] ring-2 ring-outline-variant/70">
                            {img ? (
                              <Image src={img} alt="" fill sizes="112px" className="object-cover" />
                            ) : (
                              <Icon
                                name={flavor.flavor_type === "doce" ? "cake" : "local_pizza"}
                                className="text-[40px] text-[#e5b842]"
                              />
                            )}
                          </span>
                          <span className="text-sm font-semibold leading-tight text-on-surface">
                            {flavor.name}
                          </span>
                          {flavor.flavor_type === "doce" && (
                            <span className="-mt-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                              Doce
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectSimpleItem(item)}
                    className="flex w-full items-center gap-space-md rounded-2xl border border-outline-variant/60 bg-surface-container-low p-space-sm text-left transition-colors hover:border-outline"
                  >
                    <ProductThumb
                      src={simpleItemImage(item.name, item.category)}
                      icon={section.icon}
                      alt={item.name}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h3 className="font-display text-2xl font-bold uppercase leading-tight tracking-wide text-on-surface">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">
                          {item.description}
                        </p>
                      )}
                      <span className="mt-space-xs font-display text-2xl font-extrabold text-primary">
                        {formatBRL(Number(item.base_price))}
                      </span>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                      <Icon name="add" className="text-[22px]" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg">
          <button
            type="button"
            onClick={onOpenCart}
            className="flex w-full cursor-pointer items-center justify-between rounded-full bg-primary p-space-sm pl-space-sm pr-space-md font-bold text-on-primary shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-colors hover:bg-primary-container"
          >
            <div className="flex items-center gap-space-sm">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-primary text-primary">
                <Icon name="shopping_bag" className="text-[22px]" />
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1 text-[11px] font-bold text-on-alert">
                  {cartCount}
                </span>
              </div>
              <span className="font-display text-xl font-extrabold uppercase tracking-wide">
                Ver sacola
              </span>
            </div>
            <div className="flex items-center gap-space-xs font-display text-xl font-extrabold">
              <span>{formatBRL(cartTotal)}</span>
              <Icon name="chevron_right" className="text-[22px]" />
            </div>
          </button>
        </div>
      )}

      <footer className="mt-space-xl w-full border-t border-outline-variant/60 bg-surface-container-lowest py-space-lg">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-space-sm px-margin text-center">
          <Image src="/brand/logo.png" alt="" width={96} height={96} className="h-24 w-24" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-wide text-on-surface">
            Sidney &amp; Shirley Pizzaria
          </span>
          <p className="flex items-center gap-1 text-sm text-on-surface-variant">
            <Icon name="location_on" className="text-[18px]" />
            Av. Zeca Branco, Nº 249, Mutirão — Pedreiras, MA
          </p>
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-bold text-primary underline-offset-4 hover:underline"
          >
            <Icon name="chat" className="text-[18px]" />
            WhatsApp: (99) 98457-8154
          </a>
        </div>
      </footer>
    </div>
  );
}
