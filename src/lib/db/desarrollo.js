// import { PrismaClient } from "@prisma/client";

// let prisma;

// if (process.env.NODE_ENV === "production") {
//   // En producción, crea una nueva instancia de PrismaClient
//   prisma = new PrismaClient();
// } else {
//   // En desarrollo, verifica si ya hay una instancia de PrismaClient en el objeto global
//   if (!global.prisma) {
//     // Si no hay una instancia, crea una nueva y asígnala al objeto global
//     global.prisma = new PrismaClient();
//   }
//   // Usa la instancia existente del objeto global
//   prisma = global.prisma;
// }

// export default prisma;





// import { PrismaClient } from "../../../generated/prisma";
// import { PrismaClient } from "@prisma/client";
// import { PrismaLibSQL } from "@prisma/adapter-libsql";

// let prisma;
// const adapter = new PrismaLibSQL({
//   url: process.env.TURSO_DATABASE_URL,
//   authToken: process.env.TURSO_AUTH_TOKEN,
// });

// if (process.env.NODE_ENV === "production") {
//   // En producción, crea una nueva instancia de PrismaClient
//   prisma = new PrismaClient();
// } else {
//   // En desarrollo, verifica si ya hay una instancia de PrismaClient en el objeto global
//   if (!global.prisma) {
//     // Si no hay una instancia, crea una nueva y asígnala al objeto global
//     global.prisma = new PrismaClient();
//   }
//   // Usa la instancia existente del objeto global
//   prisma = global.prisma;
// }
// const prisma = new PrismaClient({ adapter });

// export default prisma;


