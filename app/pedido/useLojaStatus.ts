"use client";

import { useCallback, useEffect, useState } from "react";
import { anonBrowserClient } from "./anonClient";
import { fetchLojaStatus, type LojaStatus } from "@/lib/loja";

// Reconsulta a cada minuto: quem deixou o cardápio aberto vê a loja fechar
// às 23h sem precisar recarregar. Com o status vindo do servidor, a primeira
// consulta no navegador espera o primeiro intervalo.
export function useLojaStatus(initial: LojaStatus | null) {
  const [status, setStatus] = useState<LojaStatus | null>(initial);
  const hasInitial = initial !== null;

  const refresh = useCallback(async () => {
    const next = await fetchLojaStatus(anonBrowserClient());
    // Erro de rede não fecha a loja: o create-order confere de novo.
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasInitial) refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh, hasInitial]);

  return { status, refresh };
}
