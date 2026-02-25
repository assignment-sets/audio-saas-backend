/*
  Warnings:

  - A unique constraint covering the columns `[artist_name]` on the table `artist_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "artist_profiles_artist_name_key" ON "artist_profiles"("artist_name");
