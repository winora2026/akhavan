-- CreateTable
CREATE TABLE "ProductionStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productionNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'در انتظار',
    "priority" TEXT NOT NULL DEFAULT 'عادی',
    "notes" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "ProductionOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionItem" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionItem_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionItemStation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionItemId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'در انتظار',
    "quantityIn" INTEGER,
    "quantityOut" INTEGER,
    "quantityWaste" INTEGER,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "operatorId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionItemStation_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionItemStation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionOrderId" TEXT,
    "productionItemId" TEXT,
    "productionItemStationId" TEXT,
    "stationId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "quantity" INTEGER,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionHistory_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionHistory_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionHistory_productionItemStationId_fkey" FOREIGN KEY ("productionItemStationId") REFERENCES "ProductionItemStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Waste" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionItemId" TEXT NOT NULL,
    "stationId" TEXT,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "operatorId" TEXT,
    "isReworked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Waste_productionItemId_fkey" FOREIGN KEY ("productionItemId") REFERENCES "ProductionItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStation_code_key" ON "ProductionStation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_productionNumber_key" ON "ProductionOrder"("productionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionItem_barcode_key" ON "ProductionItem"("barcode");
