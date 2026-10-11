"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Icon } from "@/lib/ui";

// Instalação como app (PWA). Android/Chrome dispara `beforeinstallprompt`,
// que guardamos pra abrir o diálogo nativo no clique. iPhone não tem esse
// evento: lá a única forma é Compartilhar → Adicionar à Tela de Início, então
// mostramos o passo a passo.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// O evento pode chegar antes de qualquer componente montar: escuta desde o
// carregamento do módulo.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

type InstallMode = "nativo" | "ios" | null;

function readMode(): InstallMode {
  if (isStandalone()) return null;
  if (deferredPrompt) return "nativo";
  if (isIOS()) return "ios";
  return null;
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, readMode, () => null);
}

async function promptNativeInstall() {
  if (!deferredPrompt) return;
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event.prompt();
  await event.userChoice.catch(() => null);
}

function IosSteps() {
  return (
    <p className="flex flex-wrap items-center gap-1 font-body-sm text-body-sm text-on-surface">
      Toque em
      <span className="inline-flex items-center gap-0.5 rounded bg-surface-container-high px-1.5 py-0.5 font-semibold">
        <Icon name="ios_share" className="text-[16px]" /> Compartilhar
      </span>
      e depois em
      <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-semibold">
        Adicionar à Tela de Início
      </span>
    </p>
  );
}

const DISMISS_KEY = "ss-instalar-fechado";
const DISMISS_DAYS = 7;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

// Convite discreto no cardápio: um card baixo, no fluxo da página (não
// cobre nada), que some ao fechar e só volta depois de 7 dias.
export function InstallAppBanner() {
  const mode = useInstallMode();
  const [hidden, setHidden] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(dismissedRecently());
    // Service worker mínimo: é o que faz o Chrome oferecer a instalação.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  if (!mode || hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage bloqueado: some só nesta visita
    }
    setHidden(true);
  }

  return (
    <aside
      aria-label="Instalar o app"
      className="mt-space-md flex flex-col gap-space-sm rounded-2xl border border-outline-variant/70 bg-surface-container-low p-space-sm"
    >
      <div className="flex items-center gap-space-sm">
        <Image src="/brand/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold uppercase leading-tight text-on-surface">
            Baixe nosso app
          </p>
          <p className="truncate font-body-sm text-body-sm text-on-surface-variant">
            Peça mais rápido, direto da tela inicial.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (mode === "nativo" ? promptNativeInstall() : setShowSteps((v) => !v))}
          className="shrink-0 rounded-full bg-primary px-space-md py-space-xs font-display text-base font-extrabold uppercase text-on-primary transition-colors hover:bg-primary-container"
        >
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar convite para instalar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>
      {showSteps && mode === "ios" && <IosSteps />}
    </aside>
  );
}

// Botão compacto pro cabeçalho do painel/cozinha. Só aparece quando dá pra
// instalar (e não aparece no app já instalado).
export function InstallAppButton() {
  const mode = useInstallMode();
  const [showSteps, setShowSteps] = useState(false);

  if (!mode) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (mode === "nativo" ? promptNativeInstall() : setShowSteps((v) => !v))}
        title="Instalar como app"
        className="flex min-h-11 items-center gap-space-xs rounded-full border border-outline-variant px-space-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <Icon name="install_mobile" className="text-[18px]" />
        <span className="hidden sm:inline">Instalar</span>
      </button>
      {showSteps && mode === "ios" && (
        <div className="absolute right-0 top-full z-20 mt-space-xs w-64 rounded-lg border border-outline-variant bg-surface-container-lowest p-space-sm shadow-lg">
          <IosSteps />
        </div>
      )}
    </div>
  );
}
