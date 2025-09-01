import type { ReactNode } from "react";
import AppNavbar from "@/app/(account)/dashboard/_components/app-navbar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh">
      <AppNavbar />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
