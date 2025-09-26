-- CreateTable UsuarioBebida
CREATE TABLE "UsuarioBebida" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "bebidaId" INTEGER NOT NULL,
    "ml" INTEGER NOT NULL,
    "momento" TEXT,
    CONSTRAINT "UsuarioBebida_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsuarioBebida_bebidaId_fkey" FOREIGN KEY ("bebidaId") REFERENCES "Alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UsuarioBebida_usuarioId_idx" ON "UsuarioBebida"("usuarioId");
