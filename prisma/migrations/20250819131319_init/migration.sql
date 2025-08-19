-- CreateTable
CREATE TABLE "tbusers" (
    "PK_user" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "email" TEXT NOT NULL,
    "profileImage" TEXT,
    "password" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "actionHistory" JSONB
);

-- CreateTable
CREATE TABLE "tbdevices" (
    "PK_device" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "FK_user" INTEGER NOT NULL,
    "devices" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "tbdevices_FK_user_fkey" FOREIGN KEY ("FK_user") REFERENCES "tbusers" ("PK_user") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tbusers_email_key" ON "tbusers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tbdevices_FK_user_key" ON "tbdevices"("FK_user");
