import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/middlewareClient";

export async function proxy(request: NextRequest) {
  const { supabase, response } = createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";
  // O navegador busca esses arquivos sem sessão (prompt de instalação do PWA,
  // registro do service worker), então não podem exigir autenticação.
  const isPwaAsset =
    pathname === "/admin/manifest.webmanifest" ||
    pathname === "/admin/sw.js" ||
    pathname === "/admin/icon-192" ||
    pathname === "/admin/icon-512";

  if (!user && pathname.startsWith("/admin") && !isLoginPage && !isPwaAsset) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
