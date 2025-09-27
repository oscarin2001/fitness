// src/app/(auth)/auth/layout.tsx
"use client";
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      const s: any = session;
      if (s?.onboardingPending && !s?.onboarding_completed) {
        router.replace('/onboarding');
      } else if (s?.onboarding_completed) {
        router.replace('/dashboard');
      }
    }
  }, [status, session, router]);

  return (
    <div className="min-h-svh flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}