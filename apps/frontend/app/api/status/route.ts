import { readStatus } from "../../../lib/status-server";
import { bridgeSettings, validRequest } from "../../../lib/desk-bridge";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (!validRequest(req, bridgeSettings().frontend))
    return Response.json(
      { error: "LOCAL_ORIGIN_ONLY" },
      { status: 403, headers },
    );
  return Response.json(await readStatus(), { headers });
}
