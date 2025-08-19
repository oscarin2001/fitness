import { cookies } from "next/headers";

export function getAuthToken() {
  const cookieStore = cookies();
  // Determinar el nombre de la cookie según el entorno
  const cookieName = process.env.NODE_ENV === 'production' 
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'

  const tokenCookie = cookieStore.get(cookieName); 
  return tokenCookie ? tokenCookie.value : null;
}
