import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Learn Mode",
  description: "Chat that makes you predict before it answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
