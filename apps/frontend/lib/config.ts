// This public destination is the only backend setting used by the homepage.
// The wallet desk retains its own origin boundary, journal and signing flow.
export function getDeskUrl(): string {
  const url = new URL(
    process.env.HEDGEVEIL_DESK_URL ?? "http://127.0.0.1:8794/app#trade",
  );
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
