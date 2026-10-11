import Image from "next/image";
import { PIZZA_IMAGE } from "@/lib/productImages";
import { Icon } from "./icons";

// Arte de abertura do cardápio, na linha do banner da marca: fundo preto,
// pinceladas douradas nos cantos, logo no centro e pizza "saindo" da tela.
// Fica escura nos dois temas de propósito — é a vitrine da marca, como um
// banner impresso.

function GoldBrush({ className = "", id }: { className?: string; id: string }) {
  return (
    <svg viewBox="0 0 400 120" className={className} aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffdf97" />
          <stop offset="0.45" stopColor="#e5b842" />
          <stop offset="1" stopColor="#8a6500" />
        </linearGradient>
        <filter id={`${id}-f`} x="-10%" y="-30%" width="120%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.6" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="18" />
        </filter>
      </defs>
      <g filter={`url(#${id}-f)`} fill={`url(#${id}-g)`}>
        <path d="M10 70 C 90 30, 220 20, 390 18 L 392 46 C 250 52, 120 70, 14 98 Z" />
        <path d="M40 92 C 150 70, 260 62, 380 60 L 382 70 C 260 76, 150 88, 44 104 Z" opacity="0.7" />
      </g>
    </svg>
  );
}

const FEATURES = [
  { icon: "local_pizza", label: "Ingredientes selecionados" },
  { icon: "eco", label: "Massa artesanal" },
  { icon: "local_fire_department", label: "Forno a lenha" },
];

export default function BrandHero({
  onOrderNow,
  fechado = false,
}: {
  onOrderNow: () => void;
  fechado?: boolean;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl bg-[#0b0b0c] text-[#f3eee2] shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      {/* brilho do forno atrás do logo */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-24 -z-10 h-72 w-72 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(circle,rgba(255,140,40,0.32),rgba(229,184,66,0.08)_55%,transparent_70%)] blur-2xl"
      />
      <GoldBrush id="brush-top" className="absolute -left-10 -top-4 -z-10 h-24 w-72 -rotate-[8deg] opacity-90" />
      <GoldBrush id="brush-bottom" className="absolute -bottom-5 -right-12 -z-10 h-24 w-72 rotate-[172deg] opacity-90" />

      {/* faíscas */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {[
          "left-[18%] top-[38%] [animation-delay:0s]",
          "left-[78%] top-[30%] [animation-delay:1.2s]",
          "left-[64%] top-[52%] [animation-delay:2.1s]",
          "left-[30%] top-[58%] [animation-delay:3s]",
        ].map((pos) => (
          <span
            key={pos}
            className={`absolute h-1 w-1 animate-ember rounded-[50%] bg-[#ffb347] shadow-[0_0_8px_2px_rgba(255,150,40,0.7)] ${pos}`}
          />
        ))}
      </div>

      <div className="flex flex-col items-center px-space-md pb-space-lg pt-space-lg text-center">
        <Image
          src="/brand/logo.png"
          alt="Sidney & Shirley Pizzaria Delivery — sabor que chega quente até você"
          width={220}
          height={220}
          preload
          className="h-[200px] w-[200px] drop-shadow-[0_8px_30px_rgba(229,184,66,0.25)]"
        />

        <h1 className="mt-space-md font-display text-[44px] font-extrabold uppercase leading-[0.95] tracking-wide">
          Pizza de <span className="text-[#e5b842]">verdade!</span>
        </h1>
        <p className="mt-space-xs max-w-xs text-base text-[#d6ccb6]">
          Feita para quem não abre mão de <strong className="text-[#ffd56d]">pizza boa</strong>.
        </p>

        <ul className="mt-space-md grid w-full grid-cols-3 divide-x divide-[#e5b842]/30">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex flex-col items-center gap-1 px-1">
              <span className="flex h-11 w-11 items-center justify-center rounded-[50%] border border-[#e5b842]/70 text-[#e5b842]">
                <Icon name={f.icon} className="text-[22px]" />
              </span>
              <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-[#e5b842]">
                {f.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative flex items-end justify-between gap-space-sm overflow-visible px-space-md pb-space-md">
        <div className="relative z-10 flex flex-col items-start gap-space-xs text-left">
          <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] text-[#e5b842]">
            <Icon name="two_wheeler" className="text-[18px]" /> Delivery rápido e seguro
          </span>
          <button
            type="button"
            onClick={onOrderNow}
            className="mt-1 flex items-center gap-space-xs rounded-full bg-[#e5b842] px-space-lg py-space-sm font-display text-2xl font-extrabold uppercase tracking-wide text-[#1d1500] shadow-[0_6px_20px_rgba(229,184,66,0.35)] transition-transform hover:bg-[#ffd56d] active:scale-[0.98]"
          >
            {fechado ? "Fechado agora" : "Peça já a sua"}
            <Icon name={fechado ? "bedtime" : "arrow_forward"} className="text-[22px]" />
          </button>
        </div>
        <Image
          src={PIZZA_IMAGE}
          alt=""
          width={220}
          height={220}
          sizes="200px"
          className="pointer-events-none absolute -bottom-14 -right-12 h-[200px] w-[200px] rounded-[50%] object-cover [mask-image:radial-gradient(circle,#000_58%,transparent_71%)]"
        />
      </div>
    </section>
  );
}
