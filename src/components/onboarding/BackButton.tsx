"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface BackButtonProps extends React.ComponentProps<typeof Button> {
  href?: string;
  label?: string;
}

export function BackButton({ href, label = "Atrás", ...props }: BackButtonProps) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => (href ? router.push(href) : router.back())}
      {...props}
    >
      {label}
    </Button>
  );
}

export default BackButton;
