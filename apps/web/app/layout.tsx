import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { DataProvider } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ressourcen-Tracker",
  description: "Wer hat was auf unserer Minecraft-Welt?",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@700&family=Rubik:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <DataProvider>
          <Shell>{children}</Shell>
        </DataProvider>
      </body>
    </html>
  );
}
