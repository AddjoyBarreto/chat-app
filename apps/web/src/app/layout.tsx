import type { Metadata } from "next";
import "./globals.css";
import { ThemeInit } from "@/components/settings/ThemeInit";

export const metadata: Metadata = {
  title: "VaultChat",
  description: "End-to-end encrypted messaging",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
