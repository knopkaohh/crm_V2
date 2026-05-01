-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "material" TEXT,
ADD COLUMN "designCount" INTEGER,
ADD COLUMN "baseColor" TEXT,
ADD COLUMN "baseColorCustom" TEXT,
ADD COLUMN "printColor" TEXT,
ADD COLUMN "printColorCustom" TEXT,
ADD COLUMN "cutting" TEXT,
ADD COLUMN "centerFold" TEXT,
ADD COLUMN "freeEdge" TEXT,
ADD COLUMN "postProcessing" TEXT,
ADD COLUMN "coating" TEXT,
ADD COLUMN "density" TEXT,
ADD COLUMN "bagColor" TEXT,
ADD COLUMN "sliderColor" TEXT,
ADD COLUMN "desiredDeadline" TIMESTAMP(3),
ADD COLUMN "productionComments" TEXT;





