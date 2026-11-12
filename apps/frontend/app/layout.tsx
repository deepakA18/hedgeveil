import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hedgeveil — Your next move, on your terms.",
  description:
    "A new way to trade on NEAR. Explore Hedgeveil, review each trade, and make your own next move.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f8f2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
