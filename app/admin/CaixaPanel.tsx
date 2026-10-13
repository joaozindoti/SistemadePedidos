"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browserClient";
import { formatBRL, Icon, parseMoney } from "@/lib/ui";

// Caixa: relatório do dia, da semana e do mês, gastos com material e o
// fechamento do dia. Soma no navegador a partir de orders e gastos (o volume
// de uma pizzaria cabe tranquilo). Dia de Fortaleza: UTC-3 fixo, sem horário
// de verão.

type Periodo = "dia" | "semana" | "mes";

// Só pedido aceito e não cancelado entra no faturamento.
const FATURAVEIS = new Set(["confirmado", "preparo", "pronto", "saiu_entrega", "finalizado"]);
const PAGAMENTOS: { key: string; label: string }[] = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "pix", label: "Pix" },
  { key: "cartao", label: "Cartão" },
];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

interface PedidoCaixa {
  total: number | string;
  delivery_fee: number | string | null;
  payment_method: string;
  status: string;
}

interface Gasto {
  id: string;
  dia: string;
  descricao: string;
  valor: number | string;
}

interface Resumo {
  pedidos: number;
  faturamento: number;
  porPagamento: Record<string, number>;
  fretes: number;
  cancelados: number;
  aguardando: number;
  gastos: number;
  lucro: number;
}

// "AAAA-MM-DD" de hoje no fuso da loja.
function hojeLoja(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

function addDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// [início, fim) do período que contém `ref`. Semana começa na segunda.
function intervalo(periodo: Periodo, ref: string): [string, string] {
  if (periodo === "dia") return [ref, addDias(ref, 1)];
  if (periodo === "semana") {
    const dow = new Date(`${ref}T12:00:00Z`).getUTCDay(); // 0 = domingo
    const inicio = addDias(ref, -((dow + 6) % 7));
    return [inicio, addDias(inicio, 7)];
  }
  const [y, m] = ref.split("-").map(Number);
  const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
  const fim = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return [inicio, fim];
}

function curto(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

function rotulo(periodo: Periodo, inicio: string, fim: string): string {
  if (periodo === "dia") return inicio === hojeLoja() ? `Hoje, ${curto(inicio)}` : curto(inicio);
  if (periodo === "semana") return `Semana ${curto(inicio)} a ${curto(addDias(fim, -1))}`;
  const [y, m] = inicio.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

function resumir(pedidos: PedidoCaixa[], gastos: Gasto[]): Resumo {
  const r: Resumo = { pedidos: 0, faturamento: 0, porPagamento: {}, fretes: 0, cancelados: 0, aguardando: 0, gastos: 0, lucro: 0 };
  // Em centavos, pra não acumular erro de ponto flutuante.
  let fat = 0;
  let fretes = 0;
  const pag: Record<string, number> = {};
  for (const p of pedidos) {
    if (p.status === "cancelado") r.cancelados++;
    else if (p.status === "pendente") r.aguardando++;
    if (!FATURAVEIS.has(p.status)) continue;
    const total = Math.round(Number(p.total) * 100);
    r.pedidos++;
    fat += total;
    fretes += Math.round(Number(p.delivery_fee ?? 0) * 100);
    pag[p.payment_method] = (pag[p.payment_method] ?? 0) + total;
  }
  const gas = gastos.reduce((s, g) => s + Math.round(Number(g.valor) * 100), 0);
  r.faturamento = fat / 100;
  r.fretes = fretes / 100;
  r.gastos = gas / 100;
  r.lucro = (fat - gas) / 100;
  for (const [k, v] of Object.entries(pag)) r.porPagamento[k] = v / 100;
  return r;
}

function Card({ label, value, tone = "primary" }: { label: string; value: string; tone?: "primary" | "ok" | "bad" }) {
  const color = tone === "bad" ? "text-error" : "text-primary";
  return (
    <div className="flex flex-col gap-space-xs rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-md">
      <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className={`font-headline-lg text-headline-lg ${color}`}>{value}</span>
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-space-xs">
      <span className="font-body-md text-body-md text-on-surface">{label}</span>
      <span className="font-mono text-body-md text-primary">{value}</span>
    </div>
  );
}

const BOX = "flex flex-col gap-space-xs rounded-lg border border-surface-container-highest bg-surface-container-lowest p-space-sm";
const TITULO = "border-b border-surface-container-highest pb-space-xs font-headline-md text-headline-md uppercase tracking-wide text-primary";
const INPUT = "min-h-11 rounded-lg border border-outline-variant bg-surface-container-low px-space-sm font-body-md text-body-md text-on-surface outline-none focus:border-primary";

export default function CaixaPanel() {
  const supabase = createClient();
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [ref, setRef] = useState(hojeLoja);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [fechadoEm, setFechadoEm] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [inicio, fim] = intervalo(periodo, ref);
  const hoje = hojeLoja();
  const noFuturo = intervalo(periodo, hoje)[0] <= inicio;

  const load = useCallback(async () => {
    setLoadState((s) => (s === "ready" ? s : "loading"));
    const [pedidosRes, gastosRes, fechRes] = await Promise.all([
      supabase
        .from("orders")
        .select("total, delivery_fee, payment_method, status")
        .gte("created_at", `${inicio}T00:00:00-03:00`)
        .lt("created_at", `${fim}T00:00:00-03:00`),
      supabase.from("gastos").select("id, dia, descricao, valor").gte("dia", inicio).lt("dia", fim).order("dia").order("created_at"),
      periodo === "dia"
        ? supabase.from("fechamentos_caixa").select("fechado_em").eq("dia", inicio).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (pedidosRes.error || gastosRes.error) {
      console.log("Falha ao carregar o caixa:", pedidosRes.error ?? gastosRes.error);
      setLoadState("error");
      return;
    }
    const lista = (gastosRes.data ?? []) as Gasto[];
    setGastos(lista);
    setResumo(resumir((pedidosRes.data ?? []) as PedidoCaixa[], lista));
    setFechadoEm((fechRes.data as { fechado_em: string } | null)?.fechado_em ?? null);
    setLoadState("ready");
  }, [supabase, inicio, fim, periodo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function mudarPeriodo(p: Periodo) {
    setPeriodo(p);
    setRef(hoje);
    setMsg(null);
  }

  function andar(direcao: -1 | 1) {
    setMsg(null);
    if (periodo === "dia") setRef(addDias(ref, direcao));
    else if (periodo === "semana") setRef(addDias(ref, 7 * direcao));
    else setRef(direcao === 1 ? fim : addDias(inicio, -1));
  }

  async function lancarGasto(e: React.FormEvent) {
    e.preventDefault();
    const v = parseMoney(valor);
    if (!descricao.trim() || v === null || v <= 0) {
      setMsg("Preencha o que foi comprado e o valor.");
      return;
    }
    setBusy(true);
    // No dia: lança naquele dia. Na semana/mês: lança hoje.
    const dia = periodo === "dia" ? inicio : hoje;
    const { error } = await supabase.from("gastos").insert({ dia, descricao: descricao.trim().slice(0, 80), valor: v });
    setBusy(false);
    if (error) {
      console.log("Falha ao lançar gasto:", error);
      setMsg("Não salvou o gasto. Confira a internet e tente de novo.");
      return;
    }
    setDescricao("");
    setValor("");
    setMsg(null);
    load();
  }

  async function apagarGasto(g: Gasto) {
    if (!window.confirm(`Apagar o gasto "${g.descricao}" de ${formatBRL(Number(g.valor))}?`)) return;
    setBusy(true);
    const { error } = await supabase.from("gastos").delete().eq("id", g.id);
    setBusy(false);
    if (error) {
      console.log("Falha ao apagar gasto:", error);
      setMsg("Não apagou. Tente de novo.");
      return;
    }
    load();
  }

  async function fecharCaixa() {
    if (!resumo) return;
    setBusy(true);
    const { error } = await supabase
      .from("fechamentos_caixa")
      .upsert({ dia: inicio, fechado_em: new Date().toISOString(), resumo }, { onConflict: "dia" });
    setBusy(false);
    if (error) {
      console.log("Falha ao fechar o caixa:", error);
      setMsg("Não conseguiu fechar o caixa. Tente de novo.");
      return;
    }
    setMsg("Caixa fechado!");
    load();
  }

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-3 gap-space-xs" role="group" aria-label="Período do relatório">
        {(["dia", "semana", "mes"] as Periodo[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={periodo === p}
            onClick={() => mudarPeriodo(p)}
            className={`min-h-11 rounded-full font-label-md text-label-md font-bold uppercase ${
              periodo === p ? "bg-primary text-on-primary" : "border border-outline-variant text-on-surface"
            }`}
          >
            {p === "dia" ? "Dia" : p === "semana" ? "Semana" : "Mês"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-space-sm">
        <button type="button" onClick={() => andar(-1)} aria-label="Período anterior" className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant">
          <Icon name="chevron_left" />
        </button>
        <span className="font-headline-md text-headline-md capitalize text-on-surface">{rotulo(periodo, inicio, fim)}</span>
        <button
          type="button"
          onClick={() => andar(1)}
          disabled={noFuturo}
          aria-label="Próximo período"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant disabled:opacity-30"
        >
          <Icon name="chevron_right" />
        </button>
      </div>

      {loadState === "loading" && (
        <p className="py-space-xl text-center font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Carregando o caixa…</p>
      )}

      {loadState === "error" && (
        <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">Não conseguimos carregar o caixa agora.</p>
          <button type="button" onClick={() => load()} className="min-h-11 font-label-md text-label-md uppercase tracking-wider text-primary underline underline-offset-4">
            Tentar novamente
          </button>
        </div>
      )}

      {loadState === "ready" && resumo && (
        <>
          <div className="grid grid-cols-2 gap-space-sm">
            <Card label="Faturamento" value={formatBRL(resumo.faturamento)} />
            <Card label="Gastos" value={formatBRL(resumo.gastos)} />
            <Card label="Lucro" value={formatBRL(resumo.lucro)} tone={resumo.lucro >= 0 ? "ok" : "bad"} />
            <Card label="Pedidos" value={String(resumo.pedidos)} />
          </div>

          <section className={BOX}>
            <h2 className={TITULO}>Recebido por</h2>
            <div className="flex flex-col divide-y divide-surface-container-high">
              {PAGAMENTOS.map((p) => (
                <Linha key={p.key} label={p.label} value={formatBRL(resumo.porPagamento[p.key] ?? 0)} />
              ))}
              <Linha label="Ticket médio" value={formatBRL(resumo.pedidos ? resumo.faturamento / resumo.pedidos : 0)} />
              <Linha label="Taxas de entrega (já no faturamento)" value={formatBRL(resumo.fretes)} />
              <Linha label="Cancelados" value={String(resumo.cancelados)} />
              {resumo.aguardando > 0 && <Linha label="Aguardando aceite (fora da conta)" value={String(resumo.aguardando)} />}
            </div>
          </section>

          <section className={BOX}>
            <h2 className={TITULO}>Gastos com material</h2>
            <form onSubmit={lancarGasto} className="flex flex-wrap items-end gap-space-xs">
              <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">O que comprou</span>
                <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={80} placeholder="Ex.: queijo, caixas, gás" className={INPUT} />
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Valor</span>
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={INPUT} />
              </label>
              <button type="submit" disabled={busy} className="flex min-h-11 items-center gap-space-xs rounded-full bg-primary px-space-md font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40">
                <Icon name="add" className="text-[18px]" />
                Lançar
              </button>
            </form>
            {periodo !== "dia" && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">Gasto lançado aqui entra no dia de hoje.</p>
            )}
            {gastos.length === 0 ? (
              <p className="py-space-xs font-body-sm text-body-sm text-on-surface-variant">Nenhum gasto neste período.</p>
            ) : (
              <div className="flex flex-col divide-y divide-surface-container-high">
                {gastos.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-space-sm py-space-xs">
                    <span className="min-w-0 flex-1 truncate font-body-md text-body-md text-on-surface">
                      {periodo !== "dia" && <span className="text-on-surface-variant">{curto(g.dia)} · </span>}
                      {g.descricao}
                    </span>
                    <span className="font-mono text-body-md text-primary">{formatBRL(Number(g.valor))}</span>
                    <button type="button" onClick={() => apagarGasto(g)} disabled={busy} aria-label={`Apagar ${g.descricao}`} className="flex h-11 w-11 items-center justify-center text-on-surface-variant">
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {periodo === "dia" && (
            <section className={BOX}>
              <h2 className={TITULO}>Fechar o caixa</h2>
              {fechadoEm && (
                <p className="font-body-md text-body-md text-on-surface">
                  <Icon name="lock" className="mr-1 align-middle text-[18px] text-primary" />
                  Fechado às{" "}
                  {new Date(fechadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" })}
                </p>
              )}
              {resumo.aguardando > 0 && (
                <p className="font-body-sm text-body-sm font-semibold text-error">
                  Ainda tem {resumo.aguardando} pedido(s) aguardando aceite. Aceite ou recuse antes de fechar.
                </p>
              )}
              <button
                type="button"
                onClick={fecharCaixa}
                disabled={busy}
                className="flex min-h-12 items-center justify-center gap-space-xs rounded-full bg-primary font-label-md text-label-md font-bold uppercase text-on-primary disabled:opacity-40"
              >
                <Icon name="point_of_sale" className="text-[20px]" />
                {fechadoEm ? "Fechar de novo (atualiza os números)" : "Fechar o caixa do dia"}
              </button>
            </section>
          )}

          {msg && (
            <p role="status" className="text-center font-body-md text-body-md font-semibold text-on-surface">
              {msg}
            </p>
          )}
        </>
      )}
    </div>
  );
}
