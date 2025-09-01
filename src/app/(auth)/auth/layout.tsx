// src/app/(auth)/auth/layout.tsx
export default function AuthLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return (
      <div className="min-h-svh flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    );
  }