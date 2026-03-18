import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vimens - Flashcards Inteligentes para Concurseiros",
  description: "A plataforma premium de flashcards com IA para quem leva aprovação a sério. OAB, ENEM, CAIXA e mais.",
  keywords: ["flashcards", "concursos", "OAB", "ENEM", "CAIXA", "estudos", "memorização", "IA", "Vimens"],
  authors: [{ name: "Vimens" }],
  openGraph: {
    title: "Vimens - Flashcards Inteligentes para Concurseiros",
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
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }} className="antialiased">
        <div className="noise-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
