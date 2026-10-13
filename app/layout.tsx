import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Barlow_Condensed,
} from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  // Next não tem métricas dessa família pra gerar o fallback ajustado.
  adjustFontFallback: false,
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
  adjustFontFallback: false,
});

// Fonte de ícones só com os ícones usados no app (cliente e painel), em vez
// da fonte inteira (~3 MB). Ícone novo em <Icon name="..."> precisa entrar
// nesta lista, em ordem alfabética, senão aparece como texto.
const ICON_NAMES = [
  "add", "alarm", "arrow_back", "arrow_forward", "bakery_dining", "bar_chart", "bedtime",
  "cake", "chat", "check", "check_circle", "chevron_right", "close", "content_copy",
  "dark_mode", "donut_large", "eco", "edit", "error", "fullscreen", "grid_view",
  "hourglass_top", "install_mobile", "ios_share", "light_mode", "local_drink",
  "local_fire_department", "local_pizza", "location_on", "logout", "payments", "print",
  "priority_high", "receipt_long", "remove", "restaurant", "restaurant_menu", "schedule",
  "search", "shopping_bag", "sms_failed", "soup_kitchen", "storefront", "timer",
  "two_wheeler", "volume_off",
];
const ICON_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0" +
  `&icon_names=${[...ICON_NAMES].sort().join(",")}&display=swap`;

export const metadata: Metadata = {
  title: "Sidney & Shirley Pizzaria",
  description: "Sabor que chega quente até você!",
  openGraph: {
    title: "Sidney & Shirley Pizzaria",
    description: "Pizza de verdade, assada no forno a lenha. Peça já a sua!",
    images: ["/brand/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      // data-theme é ajustado pelo script abaixo antes da hidratação.
      suppressHydrationWarning
      className={`dark ${barlowCondensed.variable} ${atkinson.variable} ${atkinsonMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* next/font não tem Material Symbols; por isso o <link> no layout raiz. */}
        <link href={ICON_FONT_URL} rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-on-surface font-body-md text-body-md">
        {children}
      </body>
    </html>
  );
}
