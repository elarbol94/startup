import { NextResponse, type NextRequest } from "next/server";
import { RETURN_PATH_HEADER } from "@/lib/return-path";

/**
 * Tells server components which page is being rendered, so requireUser can send a signed-out
 * visitor to /login?next=<that page> and a shared link still leads to its item after sign-in.
 * Authentication itself stays in requireUser and the route handlers.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: API routes, Next.js assets, Element Web, public shares and files are skipped.
  matcher: ["/((?!api/|_next/|element|share/|app-icon/|app\\.webmanifest|sw\\.js|vendor/|onlyoffice-plugins/|data/|.*\\.[a-zA-Z0-9]+$).*)"],
};
