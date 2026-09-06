import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Learn Mode",
  description: "Chat that makes you predict before it answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
