"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browserClient";
import { Icon } from "@/lib/ui";
import OrderQueue from "./OrderQueue";
import WhatsAppPanel from "./WhatsAppPanel";
import StatsPanel from "./StatsPanel";
import CardapioPanel from "./CardapioPanel";

type Section = "fila" | "whatsapp" | "resumo" | "cardapio";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "fila", label: "Fila", icon: "receipt_long" },
  { key: "whatsapp", label: "WhatsApp", icon: "chat" },
  { key: "resumo", label: "Resumo", icon: "bar_chart" },
  { key: "cardapio", label: "Cardápio", icon: "restaurant_menu" },
];

export default function AdminQueuePage() {
  const router = useRouter();
  const supabase = createClient();
  const [section, setSection] = useState<Section>("fila");

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-surface pb-space-xl">
      <header className="sticky top-0 z-10 bg-surface-container-lowest px-margin py-space-sm shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md uppercase tracking-wider text-primary">
              Painel
            </span>
            <span className="-mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Sidney &amp; Shirley Pizzaria
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 items-center gap-space-xs rounded-full border border-flour/15 px-space-md font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <Icon name="logout" className="text-[16px]" />
            Sair
          </button>
        </div>
      </header>

      <div className="sticky top-[65px] z-10 mx-auto flex max-w-2xl gap-space-xs overflow-x-auto border-b border-surface-container-highest bg-surface px-margin py-space-sm">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`flex min-h-11 shrink-0 items-center gap-space-xs rounded-full px-space-md font-label-md text-label-md uppercase tracking-wide transition-colors ${
              section === s.key
                ? "bg-primary font-bold text-on-primary shadow-sm"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            <Icon name={s.icon} className="text-[16px]" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <main className="mx-auto flex max-w-2xl flex-col px-margin pt-space-md">
        {section === "fila" && <OrderQueue />}
        {section === "whatsapp" && <WhatsAppPanel />}
        {section === "resumo" && <StatsPanel />}
        {section === "cardapio" && <CardapioPanel />}
      </main>
    </div>
  );
}
