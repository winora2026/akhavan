-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerOrderNumber" TEXT,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'عادی',
    "mapGroup" TEXT,
    "mapNumber" TEXT,
    "customerDocumentNumber" TEXT,
    "totalMeterage" REAL NOT NULL DEFAULT 0,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "hasInstallation" BOOLEAN NOT NULL DEFAULT false,
    "installationDate" DATETIME,
    "installationAddress" TEXT,
    "installationPhone" TEXT,
    "installationNotes" TEXT,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "discountPercent" REAL,
    "isOfficialInvoice" BOOLEAN NOT NULL DEFAULT false,
    "isStop" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ثبت‌شده',
    "mapImageUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "customerDocumentNumber", "customerId", "customerOrderNumber", "deliveryDate", "hasInstallation", "id", "installationDate", "isStop", "mapGroup", "mapImageUrl", "mapNumber", "notes", "orderDate", "orderNumber", "priority", "status", "totalMeterage", "totalQuantity", "updatedAt") SELECT "createdAt", "customerDocumentNumber", "customerId", "customerOrderNumber", "deliveryDate", "hasInstallation", "id", "installationDate", "isStop", "mapGroup", "mapImageUrl", "mapNumber", "notes", "orderDate", "orderNumber", "priority", "status", "totalMeterage", "totalQuantity", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "pieceNumber" TEXT,
    "installationCode" TEXT,
    "unit" TEXT,
    "length" REAL NOT NULL,
    "width" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "meterage" REAL NOT NULL DEFAULT 0,
    "perimeter" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "servicesData" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("createdAt", "id", "installationCode", "length", "meterage", "notes", "orderId", "perimeter", "pieceNumber", "productName", "quantity", "sortOrder", "status", "totalPrice", "unitPrice", "updatedAt", "width") SELECT "createdAt", "id", "installationCode", "length", "meterage", "notes", "orderId", "perimeter", "pieceNumber", "productName", "quantity", "sortOrder", "status", "totalPrice", "unitPrice", "updatedAt", "width" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
