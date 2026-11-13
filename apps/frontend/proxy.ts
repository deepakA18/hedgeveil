import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline' https://rsms.me/inter/inter.css https://fonts.cdnfonts.com/css/cabinet-grotesk; font-src 'self' data: https://rsms.me https://fonts.cdnfonts.com; img-src 'self' data: blob: https://meteorwallet.app/loader.gif https://pbs.twimg.com; connect-src 'self' https://wallet.intear.tech https://mc.meteorwallet.app wss://mc.meteorwallet.app https://wallet.meteorwallet.app https://test.rpc.fastnear.com https://rpc.testnet.near.org https://archival-rpc.testnet.near.org${dev ? " ws://127.0.0.1:3000" : ""}; frame-src 'self' https://wallet.intear.tech; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
export const config = {
  matcher: [
    "/markets",
    "/trade",
    "/portfolio",
    "/funds",
    "/activity",
    "/liquidity",
    "/vault",
    "/status",
  ],
};
