// src/app/(account)/account/layout.tsx
import type { ReactNode } from "react";
import AppNavbar from "@/app/(account)/dashboard/_components/app-navbar";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col">
      <AppNavbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}