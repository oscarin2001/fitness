-- CreateTable
CREATE TABLE "IntegrationToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "scope" TEXT,
    "token_type" TEXT,
    "expiry_date" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    CONSTRAINT "IntegrationToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationToken_provider_usuarioId_key" ON "IntegrationToken"("provider", "usuarioId");
