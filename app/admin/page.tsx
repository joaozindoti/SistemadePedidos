"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browserClient";
import { Icon } from "@/lib/ui";
import { ThemeToggle } from "@/lib/theme";
import OrderQueue from "./OrderQueue";
import WhatsAppPanel from "./WhatsAppPanel";
import StatsPanel from "./StatsPanel";
import CardapioPanel from "./CardapioPanel";
import KitchenDisplay from "./KitchenDisplay";

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
  // null enquanto o cargo não foi lido, pra não piscar as abas do admin
  // na tela da cozinha.
  const [isCozinha, setIsCozinha] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setIsCozinha(user?.app_metadata?.role === "cozinha");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  if (isCozinha === null) {
    return <div className="min-h-dvh bg-surface" />;
  }

  return (
    <div className={`min-h-dvh pb-space-xl ${isCozinha ? "bg-comanda-page" : "bg-surface"}`}>
      <header className="sticky top-0 z-10 border-b border-outline-variant/60 bg-surface-container-lowest/95 px-margin py-space-sm backdrop-blur print:hidden">
        <div
          className={`mx-auto flex items-center justify-between gap-space-sm ${isCozinha ? "max-w-screen-2xl" : "max-w-2xl"}`}
        >
          <div className="flex min-w-0 items-center gap-space-sm">
            <Image
              src="/brand/logo.png"
              alt="Sidney & Shirley Pizzaria"
              width={44}
              height={44}
              className="h-11 w-11 shrink-0"
            />
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-2xl font-extrabold uppercase leading-none tracking-wide text-primary">
                {isCozinha ? "Cozinha" : "Painel"}
              </span>
              <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                Sidney &amp; Shirley Pizzaria
              </span>
            </div>
          </div>
          <div className="flex items-center gap-space-xs">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-11 items-center gap-space-xs rounded-full border border-outline-variant px-space-md font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
            >
              <Icon name="logout" className="text-[16px]" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {isCozinha ? (
        <main className="mx-auto flex max-w-screen-2xl flex-col px-margin pt-space-md">
          <KitchenDisplay />
        </main>
      ) : (
        <>
          <div className="sticky top-[69px] z-10 mx-auto flex max-w-2xl gap-space-xs overflow-x-auto border-b border-surface-container-highest bg-surface px-margin py-space-sm">
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
        </>
      )}
    </div>
  );
}
