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
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-on-surface font-body-md text-body-md">
        {children}
      </body>
    </html>
  );
}
