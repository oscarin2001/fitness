"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{
    nombre?: string;
    apellido?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    server?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: typeof errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!nombre || nombre.trim().length < 2) e.nombre = "Nombre mínimo 2 caracteres";
    if (!apellido || apellido.trim().length < 2) e.apellido = "Apellido mínimo 2 caracteres";
    if (!email || !emailRegex.test(email)) e.email = "Email inválido";
    if (!password || password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres";
    if (!confirmPassword || confirmPassword !== password) e.confirmPassword = "Las contraseñas no coinciden";

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (!validate()) {
      const msg =
        (errors.nombre || errors.apellido || errors.email || errors.password || errors.confirmPassword) ||
        "Revisa los campos del formulario";
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim(),
          password,
          remember, // UI only; backend puede ignorarlo
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error || "No se pudo registrar";
        setErrors((prev) => ({ ...prev, server: message }));
        toast.error(message);
        return;
      }

      // Registro OK: mostrar toast y redirigir al onboarding
      toast.success("¡Bienvenido a FitBalance!");
      router.replace("/account/onboarding");
    } catch {
      const message = "Error del servidor, intenta de nuevo";
      setErrors((prev) => ({ ...prev, server: message }));
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Crear cuenta - FitBalance</CardTitle>
          <CardDescription>Regístrate para comenzar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              {errors.nombre && <p className="text-sm text-red-600">{errors.nombre}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="apellido">Apellido</Label>
              <Input id="apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
              {errors.apellido && <p className="text-sm text-red-600">{errors.apellido}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="tucorreo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {errors.email && <p className="text-sm text-red-600">{errors.email}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
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

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="********"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-sm text-red-600">{errors.confirmPassword}</p>}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Recordarme
            </label>

            {errors.server && <div className="text-sm text-red-600">{errors.server}</div>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </Button>

            <div className="mt-2 text-center text-sm">
              ¿Ya tienes cuenta?{" "}
              <a href="/auth/login" className="underline underline-offset-4">
                Inicia sesión
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}