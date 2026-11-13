import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { headers } from "next/headers";
import { ThemeProvider } from "../components/ThemeProvider";
import { themeInit } from "../lib/theme";

export const metadata: Metadata = {
  title: "Hedgeveil — Your next move, on your terms.",
  description:
    "A new way to trade on NEAR. Explore Hedgeveil, review each trade, and make your own next move.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#f7f8f2",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
