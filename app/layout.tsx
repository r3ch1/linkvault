import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LinkVault",
  description: "Personal AI-powered bookmark manager",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-neutral-950 text-neutral-100 flex flex-col">
        {children}
      </body>
    </html>
  );
}
