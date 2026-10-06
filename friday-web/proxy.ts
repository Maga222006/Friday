import { NextResponse, type NextRequest } from "next/server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Plain http from another device: send it to the HTTPS address (docker/Caddyfile),
 * since browsers only allow the microphone (voice mode) on https or localhost.
 * On in Docker (HTTPS_REDIRECT=1); off for `npm run dev`, which has no HTTPS.
 */
export function proxy(request: NextRequest) {
  if (process.env.HTTPS_REDIRECT !== "1") return;
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  if (proto === "https" || LOCAL_HOSTS.has(host)) return;
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(`https://${host}${pathname}${search}`);
}

// pages only: API calls (/aegra, /friday, /api) and assets keep working as they are
export const config = { matcher: ["/((?!aegra|friday|api|_next|favicon.ico).*)"] };
