"use client";

import { useEffect } from "react";
import { Icon } from "@/lib/ui";
import { unlockAudioOnTouch, useSoundBlocked } from "@/lib/sound";

// Aparece enquanto o navegador não libera o aviso sonoro (recém-aberto sem
// toque, ou iOS que suspendeu o áudio). Qualquer toque na tela desbloqueia;
// o botão só deixa isso explícito.
// overlay: tela inteira (cozinha), pra ninguém deixar o tablet sem som.
export default function SoundBanner({ size = "md", overlay = false }: { size?: "md" | "lg"; overlay?: boolean }) {
  const blocked = useSoundBlocked();

  useEffect(() => unlockAudioOnTouch(), []);

  if (!blocked) return null;

  if (overlay) {
    return (
      <button
        type="button"
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-space-md bg-black/85 px-margin text-center text-white"
      >
        <Icon name="volume_off" className="text-[72px]" />
        <span className="font-display text-4xl font-extrabold uppercase">Toque para ativar o som</span>
        <span className="text-xl">Sem isso a cozinha não ouve os pedidos novos.</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`flex w-full items-center justify-center gap-space-xs rounded-lg bg-alert-container px-space-md font-bold text-on-alert-container ${
        size === "lg" ? "min-h-16 text-2xl" : "min-h-12 font-body-md text-body-md"
      }`}
    >
      <Icon name="volume_off" className={size === "lg" ? "text-[28px]" : "text-[20px]"} />
      Toque para ativar o som dos pedidos novos
    </button>
  );
}
