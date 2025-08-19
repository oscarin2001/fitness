import { getToken } from "next-auth/jwt";

export async function tokenVerification(
  request,
  allowedRoles = ["Superadministrador"]
) {
  try {
    // Determinar el nombre de la cookie según el entorno
    const cookieName =
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token";
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName, // ← pásalo aquí
    });

    if (!token) {
      return { error: "Token inválido. Acceso no autorizado.", status: 401 };
    }
    // console.log(token);

    // simulacion de  exp
    // const exp = Math.floor(Date.now() / 1000) - 1000; // Simulando un token expirado

    // Verificamos si ya expiró el token
    const currentTime = Math.floor(Date.now() / 1000);
    if (token.exp && token.exp < currentTime) {
      return {
        error: "Sesión expirada. Por favor, vuelve a iniciar sesión.",
        status: 401,
      };
    }

    // Verifica si el privilegio del token está en los roles permitidos
    if (!allowedRoles.includes(token.privilege)) {
      return {
        error: "Privilegios insuficientes. Acceso prohibido.",
        status: 403,
      };
    }

    return { token, status: 200 };
  } catch (error) {
    return { error: error.message, status: 500 };
  }
}
