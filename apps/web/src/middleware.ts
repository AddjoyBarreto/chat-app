import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Origins allowed to call the API (desktop Tauri + local dev). */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "https://asset.localhost",
  "http://ipc.localhost",
  "tauri://localhost",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-gateway-secret",
    "Access-Control-Max-Age": "86400",
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (!origin || !isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const response = NextResponse.next();
  if (origin && isAllowedOrigin(origin)) {
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
