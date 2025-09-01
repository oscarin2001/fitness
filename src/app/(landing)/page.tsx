import { redirect } from "next/navigation";

export default function Home() {
  // Al iniciar la app, llevar al login
  redirect("/auth/login");
}
