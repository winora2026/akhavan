-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionOrderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productName" TEXT NOT NULL,
    "length" REAL,
    "width" REAL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "meterage" REAL,
    "thickness" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'در انتظار',
    "barcode" TEXT,
    "currentStationId" TEXT,
    "labelStatus" TEXT NOT NULL DEFAULT 'چاپ‌نشده',
    "labelPrintCount" INTEGER NOT NULL DEFAULT 0,
    "labelPrintedAt" DATETIME,
    "labelReprintAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionItem_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductionItem" ("barcode", "createdAt", "currentStationId", "id", "length", "meterage", "notes", "orderItemId", "productName", "productionOrderId", "quantity", "status", "thickness", "updatedAt", "width") SELECT "barcode", "createdAt", "currentStationId", "id", "length", "meterage", "notes", "orderItemId", "productName", "productionOrderId", "quantity", "status", "thickness", "updatedAt", "width" FROM "ProductionItem";
DROP TABLE "ProductionItem";
ALTER TABLE "new_ProductionItem" RENAME TO "ProductionItem";
CREATE UNIQUE INDEX "ProductionItem_barcode_key" ON "ProductionItem"("barcode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
