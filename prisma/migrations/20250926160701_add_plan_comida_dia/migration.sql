/*
  Warnings:

  - You are about to alter the column `overrides` on the `PlanComidaDia` table. The data in that column could be lost. The data in that column will be cast from `Unsupported("json")` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlanComidaDia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL,
    "comida_tipo" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "recetaId" INTEGER,
    "porciones" INTEGER NOT NULL DEFAULT 1,
    "overrides" JSONB,
    CONSTRAINT "PlanComidaDia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanComidaDia_recetaId_fkey" FOREIGN KEY ("recetaId") REFERENCES "Receta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlanComidaDia" ("comida_tipo", "fecha", "id", "overrides", "porciones", "recetaId", "usuarioId", "variant") SELECT "comida_tipo", "fecha", "id", "overrides", "porciones", "recetaId", "usuarioId", "variant" FROM "PlanComidaDia";
DROP TABLE "PlanComidaDia";
ALTER TABLE "new_PlanComidaDia" RENAME TO "PlanComidaDia";
CREATE INDEX "PlanComidaDia_usuarioId_fecha_idx" ON "PlanComidaDia"("usuarioId", "fecha");
CREATE UNIQUE INDEX "PlanComidaDia_usuarioId_fecha_comida_tipo_variant_key" ON "PlanComidaDia"("usuarioId", "fecha", "comida_tipo", "variant");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
