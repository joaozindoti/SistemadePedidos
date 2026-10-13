// Aviso sonoro de pedido novo, gerado na hora (sem arquivo de áudio).
// Navegador só libera áudio depois de um toque na tela, e o iOS pode
// suspender o AudioContext a qualquer momento (tela bloqueada, outra aba).
// Por isso: cada toque tenta desbloquear enquanto o contexto não estiver
// "running", o beep também tenta, e as telas mostram "Toque para ativar o
// som" via useSoundBlocked().

import { useSyncExternalStore } from "react";

let audioCtx: AudioContext | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
    audioCtx.addEventListener("statechange", notify);
  }
  return audioCtx;
}

function resumeAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx.state !== "running") ctx.resume().then(notify, notify);
  } catch (err) {
    console.log("Áudio ainda não pôde ser desbloqueado:", err);
  }
}

// Fica escutando todo toque/tecla e só age enquanto o áudio estiver travado.
export function unlockAudioOnTouch(): () => void {
  function unlock() {
    if (audioCtx?.state !== "running") resumeAudio();
  }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  try {
    // Cria o contexto já na montagem pra saber o estado real (nasce
    // "suspended" até o primeiro toque).
    getAudioContext();
  } catch {
    // navegador sem Web Audio: não há o que desbloquear
  }
  return () => listeners.delete(listener);
}

function isBlocked(): boolean {
  return audioCtx !== null && audioCtx.state !== "running";
}

// true enquanto o navegador não deixa tocar o aviso sonoro.
export function useSoundBlocked(): boolean {
  return useSyncExternalStore(subscribe, isBlocked, () => false);
}

export function playNewOrderBeep(repeat = 1) {
  try {
    const ctx = getAudioContext();
    if (ctx.state !== "running") resumeAudio();
    const base = ctx.currentTime;
    for (let r = 0; r < repeat; r++) {
      const now = base + r * 0.45;
      const notes: [number, number][] = [
        [880, now],
        [1175, now + 0.15],
      ];
      for (const [freq, start] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.14);
      }
    }
  } catch (err) {
    console.log("Não foi possível tocar o som de novo pedido:", err);
  }
}
