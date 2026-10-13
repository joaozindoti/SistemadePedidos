"use client";

import { useEffect } from "react";
import { Icon } from "@/lib/ui";
import { unlockAudioOnTouch, useSoundBlocked } from "@/lib/sound";

// Aparece enquanto o navegador não libera o aviso sonoro (recém-aberto sem
// toque, ou iOS que suspendeu o áudio). Qualquer toque na tela desbloqueia;
// o botão só deixa isso explícito.
export default function SoundBanner({ size = "md" }: { size?: "md" | "lg" }) {
  const blocked = useSoundBlocked();

  useEffect(() => unlockAudioOnTouch(), []);

  if (!blocked) return null;

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
