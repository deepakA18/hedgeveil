// Public homepage destination only. Server-side bridge settings are separate.
export function getDeskUrl(): string {
  if (
    !process.env.HEDGEVEIL_DESK_URL ||
    process.env.HEDGEVEIL_DESK_URL === "/markets"
  )
    return "/markets";
  const url = new URL(process.env.HEDGEVEIL_DESK_URL);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error(
      "HEDGEVEIL_DESK_URL must be an HTTPS or loopback HTTP URL without credentials or query parameters",
    );
  }
  return url.href;
}
