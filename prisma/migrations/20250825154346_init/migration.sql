-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "fecha_nacimiento" DATETIME NOT NULL,
    "sexo" TEXT NOT NULL,
    "altura_cm" REAL,
    "peso_kg" REAL,
    "objetivo" TEXT,
    "nivel_actividad" TEXT,
    "pais" TEXT,
    "peso_objetivo_kg" REAL,
    "velocidad_cambio" TEXT,
    "terminos_aceptados" BOOLEAN NOT NULL DEFAULT false,
    "fecha_creacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" TEXT,
    "preferencias_alimentos" JSONB,
    "kcal_objetivo" REAL,
    "proteinas_g_obj" REAL,
    "grasas_g_obj" REAL,
    "carbohidratos_g_obj" REAL,
    "agua_litros_obj" REAL,
    "plan_ai" JSONB
);

-- CreateTable
CREATE TABLE "Auth" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "verificado" BOOLEAN NOT NULL DEFAULT false,
    "token_verificacion" TEXT,
    "reset_token" TEXT,
    "last_login" DATETIME,
    CONSTRAINT "Auth_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alimento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "calorias" REAL,
    "proteinas" REAL,
    "carbohidratos" REAL,
    "grasas" REAL,
    "porcion" TEXT,
    "region" TEXT
);

-- CreateTable
CREATE TABLE "Receta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "instrucciones" TEXT,
    "porciones" INTEGER NOT NULL DEFAULT 1,
    "tipo" TEXT
);

-- CreateTable
CREATE TABLE "RecetaAlimento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recetaId" INTEGER NOT NULL,
    "alimentoId" INTEGER NOT NULL,
    "gramos" REAL NOT NULL,
    CONSTRAINT "RecetaAlimento_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecetaAlimento_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comida" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "comida_tipo" TEXT NOT NULL,
    "recetaId" INTEGER,
    "alimentoId" INTEGER,
    "gramos" REAL,
    "calorias" REAL,
    "proteinas" REAL,
    "carbohidratos" REAL,
    "grasas" REAL,
    CONSTRAINT "Comida_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Comida_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Comida_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HidratacionDia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "litros" REAL NOT NULL DEFAULT 0,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "HidratacionDia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgresoCorporal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "peso_kg" REAL,
    "grasa_percent" REAL,
    "musculo_percent" REAL,
    "agua_percent" REAL,
    "imc" REAL,
    "cintura_cm" REAL,
    "cadera_cm" REAL,
    "cuello_cm" REAL,
    CONSTRAINT "ProgresoCorporal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanComida" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "comida_tipo" TEXT NOT NULL,
    "recetaId" INTEGER NOT NULL,
    "porciones" INTEGER NOT NULL DEFAULT 1,
    "overrides" JSONB,
    CONSTRAINT "PlanComida_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanComida_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CumplimientoComida" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "comida_tipo" TEXT NOT NULL,
    "cumplido" BOOLEAN NOT NULL DEFAULT false,
    "hora_real" DATETIME,
    CONSTRAINT "CumplimientoComida_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsuarioAlimento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "alimentoId" INTEGER NOT NULL,
    "categoria" TEXT,
    "prioridad" INTEGER,
    CONSTRAINT "UsuarioAlimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsuarioAlimento_alimentoId_fkey" FOREIGN KEY ("alimentoId") REFERENCES "Alimento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Auth_usuarioId_key" ON "Auth"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_email_key" ON "Auth"("email");

-- CreateIndex
CREATE INDEX "HidratacionDia_usuarioId_fecha_idx" ON "HidratacionDia"("usuarioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PlanComida_usuarioId_comida_tipo_key" ON "PlanComida"("usuarioId", "comida_tipo");

-- CreateIndex
CREATE INDEX "CumplimientoComida_usuarioId_fecha_comida_tipo_idx" ON "CumplimientoComida"("usuarioId", "fecha", "comida_tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CumplimientoComida_usuarioId_fecha_comida_tipo_key" ON "CumplimientoComida"("usuarioId", "fecha", "comida_tipo");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioAlimento_usuarioId_alimentoId_key" ON "UsuarioAlimento"("usuarioId", "alimentoId");
