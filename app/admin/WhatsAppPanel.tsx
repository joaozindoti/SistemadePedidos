"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";

const CONNECTED_STATES = new Set(["open", "conectado", "connected"]);
const POLL_INTERVAL_MS = 4000;

interface StatusResult {
  state?: string;
}

interface ConnectResult {
  qrcode: string | null;
  state: string | null;
}

export default function WhatsAppPanel() {
  const supabase = createClient();
  const [status, setStatus] = useState<string>("verificando…");
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    const { data, error: invokeError } = await supabase.functions.invoke<StatusResult>(
      "whatsapp-connect",
      { body: { action: "status" } },
    );
    if (invokeError || !data) {
      setError("Não conseguimos consultar o status do WhatsApp.");
      return null;
    }
    setError(null);
    const state = data.state ?? "desconhecido";
    setStatus(state);
    return state;
  }, [supabase]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke<StatusResult>(
        "whatsapp-connect",
        { body: { action: "status" } },
      );
      if (cancelled) return;
      if (invokeError || !data) {
        setError("Não conseguimos consultar o status do WhatsApp.");
        return;
      }
      setError(null);
      setStatus(data.state ?? "desconhecido");
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setConnecting(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke<ConnectResult>(
      "whatsapp-connect",
      { body: { action: "connect" } },
    );
    setConnecting(false);

    if (invokeError || !data) {
      setError("Não conseguimos gerar o QR code agora. Tenta de novo.");
      return;
    }

    if (data.qrcode) setQrcode(data.qrcode);
    if (data.state) setStatus(data.state);

    stopPolling();
    pollRef.current = setInterval(async () => {
      const state = await checkStatus();
      if (state && CONNECTED_STATES.has(state)) {
        stopPolling();
        setQrcode(null);
      }
    }, POLL_INTERVAL_MS);
  }

  const connected = CONNECTED_STATES.has(status);

  return (
    <div className="flex flex-col gap-space-md">
      <section className="flex flex-col gap-space-sm rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-md">
        <div className="flex items-center justify-between">
          <span className="font-headline-md text-headline-md uppercase tracking-wide text-primary">
            Status
          </span>
          <span
            className={`rounded-full px-space-sm py-space-xs font-label-sm text-label-sm uppercase tracking-wider ${
              connected
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            {connected ? "Conectado" : status}
          </span>
        </div>

        {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}

        {!connected && (
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="min-h-12 rounded-full bg-primary font-headline-md text-headline-md font-bold uppercase tracking-wider text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {connecting ? "Gerando QR code…" : "Conectar WhatsApp"}
          </button>
        )}

        <button
          type="button"
          onClick={checkStatus}
          className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant underline underline-offset-4"
        >
          Verificar status
        </button>
      </section>

      {qrcode && !connected && (
        <section className="flex flex-col items-center gap-space-sm rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-md">
          <p className="text-center font-body-sm text-body-sm text-on-surface-variant">
            Escaneia esse QR code no WhatsApp do celular (Aparelhos conectados → Conectar aparelho).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`}
            alt="QR code de conexão do WhatsApp"
            className="h-64 w-64 rounded-lg bg-white p-space-sm"
          />
        </section>
      )}
    </div>
  );
}
