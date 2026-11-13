"use client";
import { useEffect, useState } from "react";
import type { StatusReport } from "../../lib/status";

let latest: StatusReport | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  if (request) return request;
  request = (async () => {
    try {
      const r = await fetch("/api/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error("STATUS_UNAVAILABLE");
      latest = await r.json();
    } catch {
      latest = null;
    } finally {
      for (const listener of listeners) listener();
    }
  })();
  try {
    await request;
  } finally {
    request = null;
  }
}
export function useStatus() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => {
      setReport(latest);
      setLoading(false);
      setNow(Date.now());
    };
    listeners.add(update);
    if (latest) update();
    if (!timer)
      timer = setInterval(() => {
        for (const listener of listeners) listener();
        if (document.visibilityState === "visible") void refresh();
      }, 15000);
    const visible = () => {
      update();
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    void refresh();
    return () => {
      listeners.delete(update);
      document.removeEventListener("visibilitychange", visible);
      if (!listeners.size) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, []);
  const stale =
    !report ||
    !Number.isFinite(Date.parse(report.checked_at)) ||
    now - Date.parse(report.checked_at) > 45000;
  return { report, loading, stale, refresh };
}
