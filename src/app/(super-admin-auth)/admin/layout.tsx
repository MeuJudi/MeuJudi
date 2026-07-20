import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Super Admin",
  icons: {
    icon: [{ url: "/admin-favicon.svg", type: "image/svg+xml" }],
  },
};

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
