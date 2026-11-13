import { headers } from "next/headers";
import type { ReactNode } from "react";
import { DeskProvider } from "../../components/desk/DeskProvider";
import { DeskShell } from "../../components/desk/DeskShell";
import "./cult.css";
import "./desk.css";
import "./terminal.css";
export const dynamic = "force-dynamic";
export default async function DeskLayout({
  children,
}: {
  children: ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <DeskProvider nonce={nonce}>
      <DeskShell>{children}</DeskShell>
    </DeskProvider>
  );
}
