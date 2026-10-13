"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browserClient";
import { Icon } from "@/lib/ui";
import { ThemeToggle } from "@/lib/theme";
import { InstallAppButton } from "@/lib/install";
import OrderQueue from "./OrderQueue";
import WhatsAppPanel from "./WhatsAppPanel";
import CaixaPanel from "./CaixaPanel";
import CardapioPanel from "./CardapioPanel";
import KitchenDisplay from "./KitchenDisplay";
import SoundBanner from "./SoundBanner";

type Section = "fila" | "whatsapp" | "resumo" | "cardapio";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "fila", label: "Fila", icon: "receipt_long" },
  { key: "whatsapp", label: "WhatsApp", icon: "chat" },
  { key: "resumo", label: "Caixa", icon: "point_of_sale" },
  { key: "cardapio", label: "Cardápio", icon: "restaurant_menu" },
];

export default function AdminQueuePage() {
  const router = useRouter();
  const supabase = createClient();
  const [section, setSection] = useState<Section>("fila");
  const [pendingCount, setPendingCount] = useState(0);
  // null enquanto o cargo não foi lido, pra não piscar as abas do admin
  // na tela da cozinha. Conta sem cargo não tem acesso nenhum (a RLS
  // também bloqueia; aqui é só pra mostrar o motivo em vez de tela vazia).
  const [role, setRole] = useState<"admin" | "cozinha" | "nenhum" | null>(null);
  const isCozinha = role === "cozinha";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      const appRole = user?.app_metadata?.role;
      setRole(appRole === "admin" || appRole === "cozinha" ? appRole : "nenhum");
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

  if (role === null) {
    return <div className="min-h-dvh bg-surface" />;
  }

  if (role === "nenhum") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-space-md bg-surface px-margin text-center">
        <Image src="/brand/logo.png" alt="" width={112} height={112} className="h-28 w-28" />
        <h1 className="font-display text-3xl font-extrabold uppercase text-on-surface">
          Conta sem acesso
        </h1>
        <p className="max-w-sm text-on-surface-variant">
          Essa conta ainda não tem cargo de admin ou de cozinha. Peça pro responsável liberar o
          acesso e entre de novo.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-11 rounded-full bg-primary px-space-lg font-label-md text-label-md font-bold uppercase tracking-wider text-on-primary"
        >
          Sair
        </button>
      </div>
    );
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
            <InstallAppButton />
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
                {s.key === "fila" && pendingCount > 0 && (
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-body-sm font-bold ${
                      section === s.key ? "bg-on-primary text-primary" : "bg-alert text-on-alert"
                    }`}
                  >
                    {pendingCount}
                    <span className="sr-only"> esperando aceite</span>
                  </span>
                )}
              </button>
            ))}
          </div>

          <main className="mx-auto flex max-w-2xl flex-col gap-space-sm px-margin pt-space-md">
            <SoundBanner />
            {/* A fila fica sempre montada (só escondida) pra o aviso sonoro de
                pedido novo tocar em qualquer aba. */}
            <div hidden={section !== "fila"}>
              <OrderQueue onPendingCountChange={setPendingCount} />
            </div>
            {section === "whatsapp" && <WhatsAppPanel />}
            {section === "resumo" && <CaixaPanel />}
            {section === "cardapio" && <CardapioPanel />}
          </main>
        </>
      )}
    </div>
  );
}
