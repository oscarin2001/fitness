"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FcGoogle } from 'react-icons/fc';
import { signIn } from 'next-auth/react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; server?: string }>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  function validate() {
    const e: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) e.email = "Email inválido";
    if (!password || password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (!validate()) {
      const msg = errors.email || errors.password || "Revisa los campos del formulario";
      toast.error(msg);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, remember }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error || "Credenciales inválidas";
        setErrors((prev) => ({ ...prev, server: message }));
        toast.error(message);
        return;
      }

      // Login OK: toast y redirigir
      toast.success("Inicio de sesión exitoso", {
        description: "Bienvenido de vuelta",
      });
      try {
        // Verificar estado de onboarding para redirigir a pasos si corresponde
        const st = await fetch("/api/auth/onboarding/status", { cache: "no-store", credentials: "include" });
        if (st.ok) {
          const { step, completed } = await st.json().catch(() => ({ step: null, completed: true }));
          if (!completed && step) {
            router.replace(step === "sex" ? "/onboarding/sex" : `/onboarding/${step}`);
            return;
          }
        }
      } catch {}
      router.replace("/dashboard");
    } catch (err) {
      const message = "Error del servidor, intenta de nuevo";
      setErrors((prev) => ({ ...prev, server: message }));
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
  <div className="p-6 max-w-sm mx-auto space-y-6 bg-white rounded-lg border border-gray-300 shadow">
      <div>
        <h1 className="text-2xl font-semibold">FitBalance</h1>
        <p className="text-sm text-muted-foreground">Inicia sesión con tu cuenta</p>
      </div>
  <form action="/auth/login" method="POST" onSubmit={onSubmit} className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center">
            <Label htmlFor="password">Contraseña</Label>
            <a
              href="#"
              className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
        </div>

        <label htmlFor="remember" className="flex items-center gap-2 text-sm select-none cursor-pointer">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(Boolean(v))}
            className="data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          Recordarme
        </label>

        {errors.server && (
          <div className="text-sm text-red-600">{errors.server}</div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-muted-foreground">o continúa con</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center gap-2"
          onClick={() => signIn('google', { callbackUrl: '/onboarding' })}
        >
          <FcGoogle className="h-5 w-5" /> Google
        </Button>

        <div className="mt-2 text-center text-sm">
          ¿No tienes cuenta?{" "}
          <a href="/auth/register" className="underline underline-offset-4">
            Regístrate
          </a>
        </div>
      </form>
    </div>
  );
}