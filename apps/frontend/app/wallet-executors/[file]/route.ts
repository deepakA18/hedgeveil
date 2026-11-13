import { createHash } from "node:crypto";
import lock from "../../../../web/wallets/lock.json";
import { bridgeSettings, validRequest } from "../../../lib/desk-bridge";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { frontend, backend } = bridgeSettings();
  if (!validRequest(req, frontend)) return new Response(null, { status: 403 });
  const path = "/wallet-executors/" + (await params).file;
  const entry = lock.wallets.find((w) => w.manifest.executor === path);
  if (!entry) return new Response(null, { status: 404 });
  try {
    const r = await fetch(backend + path, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw Error();
    const bytes = await r.arrayBuffer();
    if (
      createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !==
      entry.sha256
    )
      throw Error();
    return new Response(bytes, {
      headers: {
        "content-type": "text/javascript",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
