import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dollar Purchase Requests",
  description: "Generate and track USD purchase request letters",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
