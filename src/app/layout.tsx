import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeuJudi",
  description: "Gestao simples de processos para escritorios de advocacia.",
  icons: {
    icon: [
      { url: "/meujudi-icon.png", sizes: "32x32", type: "image/png" },
      { url: "/meujudi-icon.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/meujudi-icon.png", sizes: "180x180", type: "image/png" },
  },
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
