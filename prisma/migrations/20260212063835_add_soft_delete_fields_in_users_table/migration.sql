-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "is_blocked" BOOLEAN NOT NULL DEFAULT false;
