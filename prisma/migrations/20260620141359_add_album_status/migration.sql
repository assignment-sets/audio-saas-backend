-- CreateEnum
CREATE TYPE "AlbumStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "albums" ADD COLUMN     "status" "AlbumStatus" NOT NULL DEFAULT 'DRAFT';
