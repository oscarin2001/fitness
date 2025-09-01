/*
  Warnings:

  - A unique constraint covering the columns `[usuarioId,fecha]` on the table `ProgresoCorporal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ProgresoCorporal" ADD COLUMN "brazo_cm" REAL;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "foto_url" TEXT;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "fuente" TEXT;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "gluteo_cm" REAL;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "muslo_cm" REAL;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "notas" TEXT;
ALTER TABLE "ProgresoCorporal" ADD COLUMN "pecho_cm" REAL;

-- CreateIndex
CREATE INDEX "ProgresoCorporal_usuarioId_fecha_idx" ON "ProgresoCorporal"("usuarioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ProgresoCorporal_usuarioId_fecha_key" ON "ProgresoCorporal"("usuarioId", "fecha");
