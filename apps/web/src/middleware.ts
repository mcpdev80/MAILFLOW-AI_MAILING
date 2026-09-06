/**
 * Route protection in authenticated deployments. The cookie check is optimistic;
 * the server validates the real session and authorization on each request.
 */
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (process.env.WEB_AUTH !== "on") return NextResponse.next();
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
  matcher: [
    "/app/:path*",
    "/setup",
    "/onboarding",
    "/accept-invitation/:path*",
  ],
};
