/**
 * Proteccion de rutas en SaaS (`WEB_AUTH=on`): exige sesion para `/app/*`,
 * `/onboarding` y la aceptacion de invitaciones. La comprobacion por cookie es
 * optimista; la validacion real de sesion ocurre en el servidor.
 *
 * En self-host (`WEB_AUTH=off`, por defecto) el middleware es un no-op.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.WEB_AUTH !== "on") {
    return NextResponse.next();
  }
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/accept-invitation/:path*"],
};
