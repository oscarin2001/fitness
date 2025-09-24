-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN "dias_dieta" JSONB;

-- CreateTable
CREATE TABLE "CumplimientoDieta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "cumplido" BOOLEAN NOT NULL,
    CONSTRAINT "CumplimientoDieta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
