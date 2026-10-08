import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pedidos",
  },
  icons: {
    apple: "/brand/icon-192.png",
  },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      {children}
      <Script id="admin-sw-register" strategy="afterInteractive">
        {`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' });
          }
        `}
      </Script>
    </>
  );
}
