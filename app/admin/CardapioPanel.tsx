"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL, Icon, parseMoney } from "@/lib/ui";
import { fetchLojaStatus, formatHora, type LojaStatus, type ModoLoja } from "@/lib/loja";
import type { Crust, Flavor, MenuItem } from "@/lib/types";

// ───────────── aviso de salvo / erro ─────────────
// Antes, falha ao salvar só ia pro console — parecia que tinha salvado.

type Toast = { kind: "ok" | "erro"; text: string } | null;

function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((kind: "ok" | "erro", text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ kind, text });
    timer.current = setTimeout(() => setToast(null), kind === "ok" ? 1800 : 4500);
  }, []);
  return { toast, show };
}

function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return (
    <div
      role={toast.kind === "erro" ? "alert" : "status"}
      className={`fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-space-sm rounded-xl px-space-md py-space-sm font-body-md text-body-md font-semibold shadow-[0_8px_28px_rgba(0,0,0,0.35)] ${
        toast.kind === "ok" ? "bg-primary text-on-primary" : "bg-alert text-on-alert"
      }`}
    >
      <Icon name={toast.kind === "ok" ? "check_circle" : "error"} className="text-[20px]" />
      {toast.text}
    </div>
  );
}

// ───────────── chave Disponível / Esgotado ─────────────

function AvailabilitySwitch({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${label}: ${active ? "disponível" : "esgotado"}`}
      onClick={onToggle}
      className="flex shrink-0 items-center gap-space-xs"
    >
      <span
        className={`relative h-7 w-12 rounded-full transition-colors ${
          active ? "bg-primary" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-[50%] bg-surface-container-lowest shadow transition-[left] ${
            active ? "left-6" : "left-1"
          }`}
        />
      </span>
      <span
        className={`w-20 text-left font-label-sm text-label-sm font-bold uppercase ${
          active ? "text-on-surface" : "text-error"
        }`}
      >
        {active ? "Disponível" : "Esgotado"}
      </span>
    </button>
  );
}

// ───────────── campo de preço ─────────────

function PriceInput({
  value,
  onChange,
  onEnter,
  placeholder = "0,00",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <span className="relative flex w-28 shrink-0 items-center">
      <span className="pointer-events-none absolute left-space-sm font-body-sm text-body-sm text-on-surface-variant">
        R$
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9,.]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        inputMode="decimal"
        aria-label={label}
        className="min-h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low pl-9 pr-space-sm font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary"
      />
    </span>
  );
}

function toInput(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

// ───────────── linha editável ─────────────

function EditableRow({
  name,
  price,
  priceLabel,
  active,
  badge,
  onSave,
  onToggleActive,
}: {
  name: string;
  price: number;
  priceLabel?: string;
  active: boolean;
  badge?: string;
  onSave: (name: string, price: number) => Promise<boolean>;
  onToggleActive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [priceInput, setPriceInput] = useState(toInput(price));
  const [saving, setSaving] = useState(false);

  const parsedPrice = parseMoney(priceInput);
  const valid = nameInput.trim().length > 0 && parsedPrice !== null;

  function startEditing() {
    setNameInput(name);
    setPriceInput(toInput(price));
    setEditing(true);
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onSave(nameInput.trim(), parsedPrice!);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div
        className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-sm"
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      >
        <div className="flex items-center gap-space-xs">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-label="Nome"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-space-sm font-body-md text-body-md text-on-surface outline-none focus:border-primary"
          />
          <PriceInput
            value={priceInput}
            onChange={setPriceInput}
            onEnter={save}
            label={priceLabel ?? "Preço"}
          />
        </div>
        <div className="flex items-center justify-end gap-space-xs">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-10 rounded-full px-space-md font-label-md text-label-md uppercase text-on-surface-variant hover:text-on-surface"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!valid || saving}
            className="flex min-h-10 items-center gap-space-xs rounded-full bg-primary px-space-md font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40"
          >
            <Icon name="check" className="text-[18px]" />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-space-sm py-space-sm">
      <div className={`flex min-w-0 flex-1 flex-col ${active ? "" : "opacity-50"}`}>
        <span className="flex items-center gap-space-xs">
          <span className="truncate font-body-md text-body-md font-semibold text-on-surface">{name}</span>
          {badge && (
            <span className="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 font-label-sm text-label-sm uppercase text-on-surface-variant">
              {badge}
            </span>
          )}
        </span>
        <span className="font-body-sm text-body-sm text-primary">
          {priceLabel ? `${priceLabel}: ` : ""}
          {formatBRL(price)}
        </span>
      </div>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Editar ${name}`}
        title="Editar nome e preço"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface"
      >
        <Icon name="edit" className="text-[18px]" />
      </button>
      <AvailabilitySwitch active={active} onToggle={onToggleActive} label={name} />
    </div>
  );
}

// ───────────── formulário de novo item ─────────────

function AddForm({
  noun,
  priceLabel = "Preço",
  withFlavorType = false,
  onAdd,
}: {
  noun: string;
  priceLabel?: string;
  withFlavorType?: boolean;
  onAdd: (name: string, price: number, type: "salgada" | "doce") => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<"salgada" | "doce">("salgada");
  const [saving, setSaving] = useState(false);

  // Adicional de sabor/borda pode ficar em branco (= R$ 0,00).
  const parsedPrice = parseMoney(price || (withFlavorType || priceLabel !== "Preço" ? "0" : ""));
  const valid = name.trim().length > 0 && parsedPrice !== null;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    const ok = await onAdd(name.trim(), parsedPrice!, type);
    setSaving(false);
    if (ok) {
      setName("");
      setPrice("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-space-xs flex min-h-11 items-center justify-center gap-space-xs rounded-lg border border-dashed border-outline-variant font-label-md text-label-md font-bold uppercase text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
      >
        <Icon name="add" className="text-[18px]" />
        Adicionar {noun}
      </button>
    );
  }

  return (
    <div className="mt-space-xs flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
      <div className="flex items-center gap-space-xs">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`Nome do ${noun}`}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest px-space-sm font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary"
        />
        <PriceInput value={price} onChange={setPrice} onEnter={submit} label={priceLabel} />
      </div>
      {withFlavorType && (
        <div className="flex gap-space-xs">
          {(["salgada", "doce"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`rounded-full px-space-md py-space-xs font-label-md text-label-md uppercase ${
                type === t ? "bg-primary font-bold text-on-primary" : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {t === "salgada" ? "Salgada" : "Doce"}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-space-xs">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-10 rounded-full px-space-md font-label-md text-label-md uppercase text-on-surface-variant hover:text-on-surface"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || saving}
          className="flex min-h-10 items-center gap-space-xs rounded-full bg-primary px-space-md font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40"
        >
          <Icon name="add" className="text-[18px]" />
          {saving ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  activeCount,
  total,
  children,
}: {
  title: string;
  icon: string;
  activeCount: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-space-md">
      <header className="flex items-center justify-between border-b border-outline-variant/60 pb-space-sm">
        <h2 className="flex items-center gap-space-xs font-display text-2xl font-extrabold uppercase tracking-wide text-on-surface">
          <Icon name={icon} className="text-[22px] text-primary" />
          {title}
        </h2>
        <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
          {activeCount} de {total} disponíveis
        </span>
      </header>
      <div className="flex flex-col divide-y divide-outline-variant/40">{children}</div>
    </section>
  );
}

// ───────────── funcionamento ─────────────

const MODOS: { modo: ModoLoja; label: string; icon: string }[] = [
  { modo: "auto", label: "Automático", icon: "schedule" },
  { modo: "aberta", label: "Abrir agora", icon: "storefront" },
  { modo: "fechada", label: "Fechar agora", icon: "bedtime" },
];

function HorarioCard({ onToast }: { onToast: (kind: "ok" | "erro", text: string) => void }) {
  const supabase = createClient();
  const [status, setStatus] = useState<LojaStatus | null>(null);
  const [abre, setAbre] = useState("");
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchLojaStatus(supabase);
    if (!next) return;
    setStatus(next);
    if (next.config) {
      setAbre(next.config.abre_as.slice(0, 5));
      setFecha(next.config.fecha_as.slice(0, 5));
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  async function save(patch: { abre_as?: string; fecha_as?: string; modo?: ModoLoja }, okText: string) {
    setSaving(true);
    const { error } = await supabase.from("loja_config").update(patch).eq("id", 1);
    setSaving(false);
    if (error) {
      console.log("Falha ao salvar funcionamento:", error);
      onToast("erro", "Não salvou. Confira a internet e tente de novo.");
      return;
    }
    onToast("ok", okText);
    load();
  }

  if (!status) {
    return (
      <section className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-space-md font-body-sm text-body-sm text-on-surface-variant">
        Carregando funcionamento…
      </section>
    );
  }

  const modo = status.config?.modo ?? "auto";
  const horaMudou =
    status.config && (abre !== status.config.abre_as.slice(0, 5) || fecha !== status.config.fecha_as.slice(0, 5));

  return (
    <section className="flex flex-col gap-space-md rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-space-md">
      <header className="flex items-center justify-between gap-space-sm">
        <h2 className="flex items-center gap-space-xs font-display text-2xl font-extrabold uppercase tracking-wide text-on-surface">
          <Icon name="storefront" className="text-[22px] text-primary" />
          Funcionamento
        </h2>
        <span
          className={`flex items-center gap-space-xs rounded-full px-space-sm py-1 font-label-md text-label-md font-bold uppercase ${
            status.aberta ? "bg-primary text-on-primary" : "bg-alert text-on-alert"
          }`}
        >
          <span className="h-2 w-2 rounded-[50%] bg-current" />
          {status.aberta ? "Aberta agora" : "Fechada agora"}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-space-xs">
        {MODOS.map((m) => (
          <button
            key={m.modo}
            type="button"
            disabled={saving}
            onClick={() =>
              save(
                { modo: m.modo },
                m.modo === "auto"
                  ? "Seguindo o horário automático"
                  : m.modo === "aberta"
                    ? "Loja aberta pra pedidos"
                    : "Loja fechada pra pedidos",
              )
            }
            aria-pressed={modo === m.modo}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 font-label-md text-label-md font-bold uppercase transition-colors ${
              modo === m.modo
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name={m.icon} className="text-[20px]" />
            {m.label}
          </button>
        ))}
      </div>
      {modo !== "auto" && (
        <p className="rounded-lg bg-surface-container-low px-space-sm py-space-xs font-body-sm text-body-sm text-on-surface-variant">
          {modo === "aberta" ? "Aberta" : "Fechada"} ignorando o horário. Lembre de voltar pro{" "}
          <strong className="text-on-surface">Automático</strong> depois.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-space-sm">
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Abre às</span>
          <input
            type="time"
            value={abre}
            onChange={(e) => setAbre(e.target.value)}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface-container-low px-space-sm font-body-md text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Fecha às</span>
          <input
            type="time"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="min-h-11 rounded-lg border border-outline-variant bg-surface-container-low px-space-sm font-body-md text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          disabled={!horaMudou || !abre || !fecha || saving}
          onClick={() =>
            save({ abre_as: abre, fecha_as: fecha }, `Horário salvo: ${formatHora(abre)} às ${formatHora(fecha)}`)
          }
          className="flex min-h-11 items-center gap-space-xs rounded-full bg-primary px-space-md font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40"
        >
          <Icon name="check" className="text-[18px]" />
          Salvar horário
        </button>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Fora do horário o cardápio não aceita pedidos e o WhatsApp responde uma vez avisando que
        estamos fechados.
      </p>
    </section>
  );
}

// ───────────── painel ─────────────

export default function CardapioPanel() {
  const supabase = createClient();
  const { toast, show } = useToast();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [crusts, setCrusts] = useState<Crust[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [menuRes, flavorsRes, crustsRes] = await Promise.all([
      supabase
        .from("menu_items")
        .select("*")
        .order("category", { ascending: true })
        .order("base_price", { ascending: true }),
      supabase.from("flavors").select("*").order("name", { ascending: true }),
      supabase.from("crusts").select("*").order("name", { ascending: true }),
    ]);

    if (menuRes.error || flavorsRes.error || crustsRes.error) {
      setLoadState("error");
      return;
    }

    setMenuItems((menuRes.data ?? []) as MenuItem[]);
    setFlavors((flavorsRes.data ?? []) as Flavor[]);
    setCrusts((crustsRes.data ?? []) as Crust[]);
    setLoadState("ready");
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Atualiza na tela na hora (otimista) e desfaz se o banco recusar.
  async function patchRow<T extends { id: string }>(
    table: "menu_items" | "flavors" | "crusts",
    rows: T[],
    setRows: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    patch: Partial<T>,
    okText: string,
  ): Promise<boolean> {
    const previous = rows.find((r) => r.id === id);
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from(table).update(patch as Record<string, unknown>).eq("id", id);
    if (error) {
      console.log(`Falha ao atualizar ${table}:`, error);
      if (previous) setRows((cur) => cur.map((r) => (r.id === id ? previous : r)));
      show("erro", "Não salvou. Confira a internet e tente de novo.");
      return false;
    }
    show("ok", okText);
    return true;
  }

  async function insertRow<T>(
    table: "menu_items" | "flavors" | "crusts",
    setRows: React.Dispatch<React.SetStateAction<T[]>>,
    values: Record<string, unknown>,
    okText: string,
  ): Promise<boolean> {
    const { data, error } = await supabase.from(table).insert(values).select("*").single();
    if (error || !data) {
      console.log(`Falha ao criar em ${table}:`, error);
      show("erro", "Não deu pra adicionar. Tente de novo.");
      return false;
    }
    setRows((cur) => [...cur, data as T]);
    show("ok", okText);
    return true;
  }

  const menuRow = (m: MenuItem) => (
    <EditableRow
      key={m.id}
      name={m.name}
      price={Number(m.base_price)}
      active={m.active}
      onSave={(name, price) => patchRow("menu_items", menuItems, setMenuItems, m.id, { name, base_price: price }, "Salvo ✓")}
      onToggleActive={() =>
        patchRow(
          "menu_items",
          menuItems,
          setMenuItems,
          m.id,
          { active: !m.active },
          m.active ? `${m.name} marcado como esgotado` : `${m.name} disponível de novo`,
        )
      }
    />
  );

  if (loadState === "loading") {
    return (
      <p className="py-space-xl text-center font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
        Carregando cardápio…
      </p>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
        <p className="font-body-md text-body-md text-on-surface-variant">
          Não conseguimos carregar o cardápio agora.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadState("loading");
            load();
          }}
          className="font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const match = (name: string) => !q || name.toLowerCase().includes(q);

  const pizzaSizes = menuItems.filter((m) => m.category === "pizza");
  const esfirras = menuItems.filter((m) => m.category === "esfirra");
  const bebidas = menuItems.filter((m) => m.category === "bebida");

  const count = <T extends { active: boolean }>(rows: T[]) => rows.filter((r) => r.active).length;

  return (
    <div className="flex flex-col gap-space-md pb-space-xl">
      <HorarioCard onToast={show} />

      <div className="relative flex items-center">
        <Icon name="search" className="absolute left-space-sm text-[20px] text-on-surface-variant" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar item, sabor, borda…"
          aria-label="Buscar no cardápio"
          className="min-h-11 w-full rounded-full border border-outline-variant bg-surface-container-low py-space-sm pl-10 pr-space-md font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary"
        />
      </div>

      <Section title="Tamanhos de pizza" icon="local_pizza" activeCount={count(pizzaSizes)} total={pizzaSizes.length}>
        {pizzaSizes.filter((m) => match(m.name)).map(menuRow)}
        <AddForm
          noun="tamanho"
          onAdd={(name, price) =>
            insertRow("menu_items", setMenuItems, { name, category: "pizza", base_price: price, active: true }, `${name} adicionado`)
          }
        />
      </Section>

      <Section title="Sabores" icon="restaurant" activeCount={count(flavors)} total={flavors.length}>
        {flavors
          .filter((f) => match(f.name))
          .map((f) => (
            <EditableRow
              key={f.id}
              name={f.name}
              price={Number(f.extra_price)}
              priceLabel="Adicional"
              active={f.active}
              badge={f.flavor_type === "doce" ? "Doce" : undefined}
              onSave={(name, price) => patchRow("flavors", flavors, setFlavors, f.id, { name, extra_price: price }, "Salvo ✓")}
              onToggleActive={() =>
                patchRow(
                  "flavors",
                  flavors,
                  setFlavors,
                  f.id,
                  { active: !f.active },
                  f.active ? `${f.name} marcado como esgotado` : `${f.name} disponível de novo`,
                )
              }
            />
          ))}
        <AddForm
          noun="sabor"
          priceLabel="Adicional"
          withFlavorType
          onAdd={(name, price, flavor_type) =>
            insertRow("flavors", setFlavors, { name, extra_price: price, flavor_type, active: true }, `${name} adicionado`)
          }
        />
      </Section>

      <Section title="Bordas" icon="donut_large" activeCount={count(crusts)} total={crusts.length}>
        {crusts
          .filter((c) => match(c.name))
          .map((c) => (
            <EditableRow
              key={c.id}
              name={c.name}
              price={Number(c.extra_price)}
              priceLabel="Adicional"
              active={c.active}
              onSave={(name, price) => patchRow("crusts", crusts, setCrusts, c.id, { name, extra_price: price }, "Salvo ✓")}
              onToggleActive={() =>
                patchRow(
                  "crusts",
                  crusts,
                  setCrusts,
                  c.id,
                  { active: !c.active },
                  c.active ? `${c.name} marcada como esgotada` : `${c.name} disponível de novo`,
                )
              }
            />
          ))}
        <AddForm
          noun="borda"
          priceLabel="Adicional"
          onAdd={(name, price) =>
            insertRow("crusts", setCrusts, { name, extra_price: price, active: true }, `${name} adicionada`)
          }
        />
      </Section>

      <Section title="Esfirras" icon="bakery_dining" activeCount={count(esfirras)} total={esfirras.length}>
        {esfirras.filter((m) => match(m.name)).map(menuRow)}
        <AddForm
          noun="item"
          onAdd={(name, price) =>
            insertRow("menu_items", setMenuItems, { name, category: "esfirra", base_price: price, active: true }, `${name} adicionado`)
          }
        />
      </Section>

      <Section title="Bebidas" icon="local_drink" activeCount={count(bebidas)} total={bebidas.length}>
        {bebidas.filter((m) => match(m.name)).map(menuRow)}
        <AddForm
          noun="item"
          onAdd={(name, price) =>
            insertRow("menu_items", setMenuItems, { name, category: "bebida", base_price: price, active: true }, `${name} adicionado`)
          }
        />
      </Section>

      <ToastView toast={toast} />
    </div>
  );
}
