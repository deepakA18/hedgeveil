export type ServiceState =
  "operational" | "degraded" | "unavailable" | "unknown";
export type ServiceCheck = {
  id: string;
  name: string;
  state: ServiceState;
  detail: string;
  observed_at: string | null;
};
export type StatusSnapshot = {
  checked_at: string;
  services: ServiceCheck[];
};
export type StatusReport = StatusSnapshot & { history: StatusSnapshot[] };
export const statusLabels: Record<ServiceState, string> = {
  operational: "Operational",
  degraded: "Needs attention",
  unavailable: "Unavailable",
  unknown: "Not verified",
};
export function overallStatus(rows: ServiceCheck[]): ServiceState {
  if (!rows.length) return "unknown";
  if (rows.some((r) => r.state === "unavailable")) return "unavailable";
  if (rows.some((r) => r.state === "degraded")) return "degraded";
  if (rows.some((r) => r.state === "unknown")) return "unknown";
  return "operational";
}
