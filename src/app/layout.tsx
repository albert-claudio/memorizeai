import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MemorizeAI - Flashcards Inteligentes para Concurseiros",
  description: "A plataforma premium de flashcards com IA para quem leva aprovação a sério. OAB, ENEM, CAIXA e mais.",
  keywords: ["flashcards", "concursos", "OAB", "ENEM", "CAIXA", "estudos", "memorização", "IA"],
  authors: [{ name: "MemorizeAI" }],
  openGraph: {
    title: "MemorizeAI - Flashcards Inteligentes para Concurseiros",
    description: "A plataforma premium de flashcards com IA para quem leva aprovação a sério.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased`}>
        <div className="noise-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
