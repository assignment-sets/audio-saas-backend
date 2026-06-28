/*
  Warnings:

  - Added the required column `stripe_price_id` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "stripe_price_id" TEXT NOT NULL;
