// Aviso sonoro de pedido novo, gerado na hora (sem arquivo de áudio).
// Navegador só libera áudio depois de um toque na tela; quem usa chama
// getAudioContext().resume() no primeiro pointerdown.

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

export function unlockAudioOnFirstTouch(): () => void {
  function unlock() {
    try {
      getAudioContext().resume().catch(() => {});
    } catch (err) {
      console.log("Áudio ainda não pôde ser desbloqueado:", err);
    }
  }
  window.addEventListener("pointerdown", unlock, { once: true });
  return () => window.removeEventListener("pointerdown", unlock);
}

export function playNewOrderBeep(repeat = 1) {
  try {
    const ctx = getAudioContext();
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
