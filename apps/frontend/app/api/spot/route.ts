import { readSpot } from "../../../lib/spot-server";
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
  try {
    return Response.json(await readSpot(), { headers });
  } catch {
    return Response.json(
      { error: "SPOT_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
