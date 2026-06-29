-- CreateIndex
CREATE INDEX "albums_title_idx" ON "albums" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "artist_profiles_artist_name_idx" ON "artist_profiles" USING GIN ("artist_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "playlists_name_idx" ON "playlists" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "tracks_title_idx" ON "tracks" USING GIN ("title" gin_trgm_ops);
