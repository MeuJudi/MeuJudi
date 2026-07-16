import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeuJudi",
  description: "Gestao simples de processos para escritorios de advocacia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
