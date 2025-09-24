"use client";

import type { PropsWithChildren } from "react";

export default function ProfileLayout({ children }: PropsWithChildren) {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {children}
    </div>
  );
}
