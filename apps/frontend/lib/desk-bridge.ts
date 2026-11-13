const gets = new Set([
  "session",
  "state",
  "live",
  "operations",
  "evidence/events",
  "evidence/receipts",
  "evidence/alerts",
  "evidence/transactions",
]);
const posts = new Set([
  "prepare",
  "handoff",
  "cancel",
  "recover",
  "remember-hash",
  "quotes",
]);
export function localOrigin(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("LOCAL_ORIGIN_REQUIRED");
  return u.origin;
}
export function bridgeSettings() {
  return {
    frontend: localOrigin(
      process.env.HEDGEVEIL_FRONTEND_ORIGIN ?? "http://127.0.0.1:3000",
    ),
    backend: localOrigin(
      process.env.HEDGEVEIL_BACKEND_ORIGIN ?? "http://127.0.0.1:8794",
    ),
  };
}
const reply = (status: number, error: string) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
export function validRequest(req: Request, origin: string) {
  const site = req.headers.get("sec-fetch-site"),
    given = req.headers.get("origin");
  return (
    req.headers.get("host") === new URL(origin).host &&
    (!given || given === origin) &&
    (!site || site === "same-origin" || site === "none") &&
    req.headers.get("sec-fetch-mode") !== "navigate"
  );
}
export async function bridge(
  req: Request,
  path: string,
  transport: typeof fetch = fetch,
) {
  const { frontend, backend } = bridgeSettings();
  if (!validRequest(req, frontend)) return reply(403, "LOCAL_ORIGIN_ONLY");
  if (
    !(req.method === "GET"
      ? gets.has(path)
      : req.method === "POST" && posts.has(path))
  )
    return reply(404, "NOT_FOUND");
  let body: string | undefined;
  if (req.method === "POST") {
    if (
      req.headers.get("origin") !== frontend ||
      req.headers.get("content-type") !== "application/json"
    )
      return reply(403, "LOCAL_ORIGIN_ONLY");
    const reader = req.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) {
          await reader.cancel();
          return reply(413, "BODY_LIMIT");
        }
        chunks.push(value);
      }
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    body = new TextDecoder().decode(all);
    try {
      JSON.parse(body);
    } catch {
      return reply(400, "INVALID_JSON");
    }
  }
  const query = new URL(req.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const [key, value] of query) {
    if (!(
      (path === "live" && key === "account") ||
      (path.startsWith("evidence/") && key === "offset")
    ))
      return reply(400, "INVALID_QUERY");
    forwarded.append(key, value);
  }
  try {
    const response = await transport(
      backend + "/api/" + path + (forwarded.size ? "?" + forwarded : ""),
      {
        method: req.method,
        headers: {
          origin: backend,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      },
    );
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return reply(503, "SERVICE_UNAVAILABLE");
  }
}
