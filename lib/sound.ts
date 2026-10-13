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

// Toca pelo canal de mídia (<audio>), que no iPhone/iPad continua tocando
// com a chave do silencioso ligada — o Web Audio não. Gerado uma vez como
// WAV em memória: dois bipes, sem arquivo.
let beepEl: HTMLAudioElement | null = null;
let mediaUnlocked = false;

function beepWavUrl(): string {
  const rate = 22050;
  const tones: [number, number, number][] = [
    [880, 0, 0.12],
    [1175, 0.15, 0.27],
  ];
  const length = Math.round(rate * 0.32);
  const data = new Int16Array(length);
  for (const [freq, start, end] of tones) {
    for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) {
      const t = i / rate - start;
      const env = Math.min(1, t * 200, (end - start - t) * 60);
      data[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * env * 0.6 * 32767);
    }
  }
  const buffer = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, text: string) => [...text].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data.length * 2, true);
  new Int16Array(buffer, 44).set(data);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function getBeepEl(): HTMLAudioElement {
  if (!beepEl) {
    beepEl = new Audio(beepWavUrl());
    beepEl.preload = "auto";
  }
  return beepEl;
}

// Precisa rodar dentro de um toque: toca mudo uma vez pra liberar o <audio>.
function unlockMedia() {
  if (mediaUnlocked) return;
  try {
    const el = getBeepEl();
    el.muted = true;
    el.play().then(
      () => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        mediaUnlocked = true;
        notify();
      },
      () => {
        el.muted = false;
      },
    );
  } catch {
    // sem <audio>: fica só o Web Audio
  }
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
    unlockMedia();
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
  if (mediaUnlocked) return false;
  return audioCtx !== null && audioCtx.state !== "running";
}

// true enquanto o navegador não deixa tocar o aviso sonoro.
export function useSoundBlocked(): boolean {
  return useSyncExternalStore(subscribe, isBlocked, () => false);
}

export function playNewOrderBeep(repeat = 1) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([300, 150, 300]);
    } catch {
      // sem vibração
    }
  }
  if (mediaUnlocked) {
    const el = getBeepEl();
    let played = 0;
    const playOnce = () => {
      el.currentTime = 0;
      el.play().catch(() => playWebAudio(repeat - played));
      played++;
      if (played < repeat) setTimeout(playOnce, 450);
    };
    playOnce();
    return;
  }
  playWebAudio(repeat);
}

function playWebAudio(repeat: number) {
  if (repeat <= 0) return;
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
