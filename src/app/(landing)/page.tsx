import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get("authjs.session-token");

  if (authToken) {
    // Si el usuario está autenticado, redirigir al dashboard
    redirect("/account/dashboard");
  } else {
    // Si no está autenticado, redirigir al login
    redirect("/auth/login");
  }
}
