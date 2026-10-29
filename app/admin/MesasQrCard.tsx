"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import QRCode from "qrcode";
import { Icon } from "@/lib/ui";

// QR Code de cada mesa: abre /pedido?mesa=N, e o pedido já vem como "comer
// aqui" naquela mesa. Imprime em A4, 6 por folha, pra recortar e colocar
// nas mesas (ver @page mesas em globals.css).

const STORAGE_KEY = "ss-qtd-mesas";
const MAX_MESAS = 60;

function mesaUrl(n: number): string {
  return `${window.location.origin}/pedido?mesa=${n}`;
}

// SVG gerado aqui mesmo, a partir da nossa URL — não vem de fora.
function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

function readSavedCount(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(n) && n >= 1 && n <= MAX_MESAS ? n : 10;
  } catch {
    return 10;
  }
}

export default function MesasQrCard() {
  const [qtd, setQtd] = useState("10");
  const [preview, setPreview] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ n: number; svg: string }[] | null>(null);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQtd(String(readSavedCount()));
    qrSvg(mesaUrl(1)).then(setPreview, () => setPreview(null));
  }, []);

  // Imprime depois que a folha de QR foi montada no <body>; limpa ao fechar.
  useEffect(() => {
    if (!sheet) return;
    function clear() {
      setSheet(null);
    }
    window.addEventListener("afterprint", clear);
    // Espera a logo carregar (até 3s) antes de abrir a impressão, senão a
    // folha sai sem ela.
    let cancelled = false;
    requestAnimationFrame(() => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".print-mesas img"));
      const loaded = Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
      Promise.race([loaded, timeout]).then(() => {
        if (!cancelled) window.print();
      });
    });
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", clear);
    };
  }, [sheet]);

  const total = Number(qtd);
  const valido = Number.isInteger(total) && total >= 1 && total <= MAX_MESAS;

  async function imprimir() {
    if (!valido || gerando) return;
    setGerando(true);
    try {
      localStorage.setItem(STORAGE_KEY, String(total));
    } catch {
      // storage bloqueado: só não lembra a quantidade
    }
    const mesas = Array.from({ length: total }, (_, i) => i + 1);
    const svgs = await Promise.all(mesas.map((n) => qrSvg(mesaUrl(n))));
    setGerando(false);
    setSheet(mesas.map((n, i) => ({ n, svg: svgs[i] })));
  }

  return (
    <section className="flex flex-col gap-space-md rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-space-md">
      <header className="flex items-center justify-between gap-space-sm">
        <h2 className="flex items-center gap-space-xs font-display text-2xl font-extrabold uppercase tracking-wide text-on-surface">
          <Icon name="restaurant" className="text-[22px] text-primary" />
          QR Code das mesas
        </h2>
      </header>

      <div className="flex items-start gap-space-md">
        {preview && (
          <div
            aria-hidden="true"
            className="h-24 w-24 shrink-0 rounded-lg bg-white p-1"
            // SVG do qrcode gerado localmente a partir da URL da mesa 1.
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
        <p className="font-body-md text-body-md text-on-surface-variant">
          Cada mesa ganha um QR. O cliente aponta a câmera, o cardápio abre já como{" "}
          <strong className="text-on-surface">Comer aqui</strong> na mesa certa, e o pedido chega no
          painel e na cozinha com o número da mesa.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-space-sm">
        <label className="flex flex-col gap-1">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
            Quantas mesas?
          </span>
          <input
            value={qtd}
            onChange={(e) => setQtd(e.target.value.replace(/\D/g, "").slice(0, 2))}
            inputMode="numeric"
            aria-label="Quantidade de mesas"
            className="min-h-11 w-24 rounded-lg border border-outline-variant bg-surface-container-low px-space-sm text-center font-body-md text-body-md text-on-surface outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={imprimir}
          disabled={!valido || gerando}
          className="flex min-h-11 items-center gap-space-xs rounded-full bg-primary px-space-md font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40"
        >
          <Icon name="print" className="text-[18px]" />
          {gerando ? "Gerando…" : "Imprimir QR das mesas"}
        </button>
      </div>
      {!valido && qtd !== "" && (
        <p className="font-body-sm text-body-sm font-semibold text-error">
          Escolha de 1 a {MAX_MESAS} mesas.
        </p>
      )}

      {sheet &&
        createPortal(
          <div className="print-root print-mesas">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8mm" }}>
              {sheet.map(({ n, svg }) => (
                <div
                  key={n}
                  className="mesa-card"
                  style={{
                    border: "1.5px dashed #000",
                    borderRadius: "4mm",
                    padding: "5mm",
                    textAlign: "center",
                    height: "84mm",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
                    <Image
                      src="/brand/logo-512.webp"
                      alt=""
                      width={56}
                      height={56}
                      loading="eager"
                      style={{ width: "14mm", height: "14mm" }}
                    />
                    <div style={{ textAlign: "left", lineHeight: 1.1 }}>
                      <div style={{ fontSize: "9pt", fontWeight: 700 }}>SIDNEY &amp; SHIRLEY PIZZARIA</div>
                      <div style={{ fontSize: "22pt", fontWeight: 800 }}>MESA {n}</div>
                    </div>
                  </div>
                  <div style={{ width: "46mm", height: "46mm" }} dangerouslySetInnerHTML={{ __html: svg }} />
                  <div style={{ fontSize: "10pt", fontWeight: 700 }}>
                    Aponte a câmera do celular e peça pelo cardápio digital
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
