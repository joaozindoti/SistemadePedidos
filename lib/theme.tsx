"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/lib/ui";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/themeScript";

// Dois temas: "escuro" (preto e dourado, o padrão da marca) e "claro"
// (preto no branco, alto contraste — bom pra cozinha iluminada e pra quem
// lê melhor em fundo branco). A escolha fica no aparelho, em localStorage.
const CHANGE_EVENT = "ss-tema-change";

export type Theme = "escuro" | "claro";

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "claro" : "escuro";
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

export function setTheme(theme: Theme) {
  if (theme === "claro") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // modo anônimo / storage bloqueado: vale só pra esta aba
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "escuro");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === "escuro" ? "claro" : "escuro";
  const label = theme === "escuro" ? "Preto no branco" : "Fundo escuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Mudar para ${label.toLowerCase()}`}
      title={label}
      className={`flex min-h-11 shrink-0 items-center gap-space-xs rounded-full border border-outline-variant px-space-sm font-label-md text-label-md uppercase tracking-wider text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface ${className}`}
    >
      <Icon name={theme === "escuro" ? "light_mode" : "dark_mode"} className="text-[18px]" />
      <span className="hidden sm:inline">{theme === "escuro" ? "Claro" : "Escuro"}</span>
    </button>
  );
}
