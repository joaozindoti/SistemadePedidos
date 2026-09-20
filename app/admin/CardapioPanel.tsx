"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL } from "@/lib/ui";
import type { Crust, Flavor, MenuItem } from "@/lib/types";

function parsePrice(raw: string): number | null {
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function EditableRow({
  name,
  price,
  active,
  extraBadge,
  onSave,
  onToggleActive,
}: {
  name: string;
  price: number;
  active: boolean;
  extraBadge?: string;
  onSave: (name: string, price: number) => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(name);
  const [priceInput, setPriceInput] = useState(String(price));
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedPrice = parsePrice(priceInput);
    if (!nameInput.trim() || parsedPrice === null) return;
    setSaving(true);
    await onSave(nameInput.trim(), parsedPrice);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-space-xs py-space-xs">
        <input
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          className="min-h-10 flex-1 rounded border border-surface-container-highest bg-surface-container-low px-space-sm font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
        />
        <input
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          type="number"
          step="0.01"
          min={0}
          className="min-h-10 w-24 rounded border border-surface-container-highest bg-surface-container-low px-space-sm text-center font-mono text-body-sm text-on-surface outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="min-h-10 rounded-full bg-primary px-space-sm font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-50"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setNameInput(name);
            setPriceInput(String(price));
          }}
          className="min-h-10 rounded-full px-space-sm font-label-md text-label-md uppercase text-on-surface-variant"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-space-sm py-space-xs transition-opacity ${
        active ? "" : "opacity-40"
      }`}
    >
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-baseline gap-space-sm text-left"
      >
        <span className="truncate font-body-md text-body-md text-on-surface">
          {name}
          {extraBadge ? ` · ${extraBadge}` : ""}
        </span>
        <span className="shrink-0 font-mono text-body-sm text-primary">
          {formatBRL(price)}
        </span>
      </button>
      <label className="flex shrink-0 items-center gap-space-xs font-label-sm text-label-sm uppercase text-on-surface-variant">
        <input
          type="checkbox"
          checked={active}
          onChange={onToggleActive}
          className="h-5 w-5 accent-primary"
        />
        {active ? "Ativo" : "Inativo"}
      </label>
    </div>
  );
}

function AddItemForm({
  placeholder,
  pricePlaceholder = "Preço",
  onAdd,
}: {
  placeholder: string;
  pricePlaceholder?: string;
  onAdd: (name: string, price: number) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsedPrice = parsePrice(price);
    if (!name.trim() || parsedPrice === null) return;
    setSaving(true);
    await onAdd(name.trim(), parsedPrice);
    setSaving(false);
    setName("");
    setPrice("");
  }

  return (
    <div className="flex items-center gap-space-xs border-t border-surface-container-highest pt-space-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="min-h-10 flex-1 rounded border border-surface-container-highest bg-surface-container-low px-space-sm font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder={pricePlaceholder}
        type="number"
        step="0.01"
        min={0}
        className="min-h-10 w-24 rounded border border-surface-container-highest bg-surface-container-low px-space-sm text-center font-mono text-body-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
      />
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="min-h-10 shrink-0 rounded-full bg-primary px-space-sm font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
}

function AddFlavorForm({
  onAdd,
}: {
  onAdd: (name: string, price: number, type: "salgada" | "doce") => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<"salgada" | "doce">("salgada");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsedPrice = parsePrice(price || "0");
    if (!name.trim() || parsedPrice === null) return;
    setSaving(true);
    await onAdd(name.trim(), parsedPrice, type);
    setSaving(false);
    setName("");
    setPrice("");
  }

  return (
    <div className="flex items-center gap-space-xs border-t border-surface-container-highest pt-space-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do sabor"
        className="min-h-10 flex-1 rounded border border-surface-container-highest bg-surface-container-low px-space-sm font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Adicional"
        type="number"
        step="0.01"
        min={0}
        className="min-h-10 w-20 rounded border border-surface-container-highest bg-surface-container-low px-space-sm text-center font-mono text-body-sm text-on-surface outline-none placeholder:text-outline focus:border-primary"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as "salgada" | "doce")}
        className="min-h-10 rounded border border-surface-container-highest bg-surface-container-low px-space-xs font-body-sm text-body-sm text-on-surface outline-none focus:border-primary"
      >
        <option value="salgada">Salgada</option>
        <option value="doce">Doce</option>
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="min-h-10 shrink-0 rounded-full bg-primary px-space-sm font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-space-xs rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-sm">
      <h2 className="border-b border-surface-container-highest pb-space-xs font-headline-md text-headline-md uppercase tracking-wide text-primary">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-surface-container-high">
        {children}
      </div>
    </section>
  );
}

export default function CardapioPanel() {
  const supabase = createClient();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [crusts, setCrusts] = useState<Crust[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const load = useCallback(async () => {
    setLoadState("loading");
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
    let cancelled = false;
    (async () => {
      const [menuRes, flavorsRes, crustsRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .order("category", { ascending: true })
          .order("base_price", { ascending: true }),
        supabase.from("flavors").select("*").order("name", { ascending: true }),
        supabase.from("crusts").select("*").order("name", { ascending: true }),
      ]);

      if (cancelled) return;
      if (menuRes.error || flavorsRes.error || crustsRes.error) {
        setLoadState("error");
        return;
      }

      setMenuItems((menuRes.data ?? []) as MenuItem[]);
      setFlavors((flavorsRes.data ?? []) as Flavor[]);
      setCrusts((crustsRes.data ?? []) as Crust[]);
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateMenuItem(
    id: string,
    patch: Partial<Pick<MenuItem, "name" | "base_price" | "active">>,
  ) {
    const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
    if (error) {
      console.log("Falha ao atualizar item do cardápio:", error);
      return;
    }
    setMenuItems((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function addMenuItem(
    category: MenuItem["category"],
    name: string,
    price: number,
  ) {
    const { data, error } = await supabase
      .from("menu_items")
      .insert({ name, category, base_price: price, active: true })
      .select("*")
      .single();
    if (error || !data) {
      console.log("Falha ao criar item do cardápio:", error);
      return;
    }
    setMenuItems((cur) => [...cur, data as MenuItem]);
  }

  async function updateFlavor(
    id: string,
    patch: Partial<Pick<Flavor, "name" | "extra_price" | "active">>,
  ) {
    const { error } = await supabase.from("flavors").update(patch).eq("id", id);
    if (error) {
      console.log("Falha ao atualizar sabor:", error);
      return;
    }
    setFlavors((cur) => cur.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function addFlavor(name: string, price: number, flavor_type: "salgada" | "doce") {
    const { data, error } = await supabase
      .from("flavors")
      .insert({ name, extra_price: price, flavor_type, active: true })
      .select("*")
      .single();
    if (error || !data) {
      console.log("Falha ao criar sabor:", error);
      return;
    }
    setFlavors((cur) => [...cur, data as Flavor]);
  }

  async function updateCrust(
    id: string,
    patch: Partial<Pick<Crust, "name" | "extra_price" | "active">>,
  ) {
    const { error } = await supabase.from("crusts").update(patch).eq("id", id);
    if (error) {
      console.log("Falha ao atualizar borda:", error);
      return;
    }
    setCrusts((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function addCrust(name: string, price: number) {
    const { data, error } = await supabase
      .from("crusts")
      .insert({ name, extra_price: price, active: true })
      .select("*")
      .single();
    if (error || !data) {
      console.log("Falha ao criar borda:", error);
      return;
    }
    setCrusts((cur) => [...cur, data as Crust]);
  }

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
          onClick={() => load()}
          className="font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const pizzaSizes = menuItems.filter((m) => m.category === "pizza");
  const esfirras = menuItems.filter((m) => m.category === "esfirra");
  const bebidas = menuItems.filter((m) => m.category === "bebida");

  return (
    <div className="flex flex-col gap-space-md">
      <Section title="Tamanhos de Pizza">
        {pizzaSizes.map((m) => (
          <EditableRow
            key={m.id}
            name={m.name}
            price={Number(m.base_price)}
            active={m.active}
            onSave={(name, price) => updateMenuItem(m.id, { name, base_price: price })}
            onToggleActive={() => updateMenuItem(m.id, { active: !m.active })}
          />
        ))}
        <AddItemForm
          placeholder="Nome do tamanho"
          onAdd={(name, price) => addMenuItem("pizza", name, price)}
        />
      </Section>

      <Section title="Sabores">
        {flavors.map((f) => (
          <EditableRow
            key={f.id}
            name={f.name}
            price={Number(f.extra_price)}
            active={f.active}
            extraBadge={f.flavor_type}
            onSave={(name, price) => updateFlavor(f.id, { name, extra_price: price })}
            onToggleActive={() => updateFlavor(f.id, { active: !f.active })}
          />
        ))}
        <AddFlavorForm onAdd={addFlavor} />
      </Section>

      <Section title="Bordas">
        {crusts.map((c) => (
          <EditableRow
            key={c.id}
            name={c.name}
            price={Number(c.extra_price)}
            active={c.active}
            onSave={(name, price) => updateCrust(c.id, { name, extra_price: price })}
            onToggleActive={() => updateCrust(c.id, { active: !c.active })}
          />
        ))}
        <AddItemForm
          placeholder="Nome da borda"
          pricePlaceholder="Adicional"
          onAdd={addCrust}
        />
      </Section>

      <Section title="Esfirras">
        {esfirras.map((m) => (
          <EditableRow
            key={m.id}
            name={m.name}
            price={Number(m.base_price)}
            active={m.active}
            onSave={(name, price) => updateMenuItem(m.id, { name, base_price: price })}
            onToggleActive={() => updateMenuItem(m.id, { active: !m.active })}
          />
        ))}
        <AddItemForm
          placeholder="Nome da esfirra"
          onAdd={(name, price) => addMenuItem("esfirra", name, price)}
        />
      </Section>

      <Section title="Bebidas">
        {bebidas.map((m) => (
          <EditableRow
            key={m.id}
            name={m.name}
            price={Number(m.base_price)}
            active={m.active}
            onSave={(name, price) => updateMenuItem(m.id, { name, base_price: price })}
            onToggleActive={() => updateMenuItem(m.id, { active: !m.active })}
          />
        ))}
        <AddItemForm
          placeholder="Nome da bebida"
          onAdd={(name, price) => addMenuItem("bebida", name, price)}
        />
      </Section>
    </div>
  );
}
