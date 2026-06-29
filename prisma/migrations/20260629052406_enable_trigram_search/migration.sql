-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes
CREATE INDEX IF NOT EXISTS artist_profiles_artist_name_trgm_idx ON artist_profiles USING gin (artist_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tracks_title_trgm_idx ON tracks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS albums_title_trgm_idx ON albums USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS playlists_name_trgm_idx ON playlists USING gin (name gin_trgm_ops);