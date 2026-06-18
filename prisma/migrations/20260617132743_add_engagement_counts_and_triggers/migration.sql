-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "play_count" INTEGER NOT NULL DEFAULT 0;

-- Create trigger function for track_likes
CREATE OR REPLACE FUNCTION update_track_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "tracks" SET "like_count" = "like_count" + 1 WHERE "id" = NEW."track_id";
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE "tracks" SET "like_count" = "like_count" - 1 WHERE "id" = OLD."track_id";
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for track_likes
CREATE TRIGGER track_likes_count_trigger
AFTER INSERT OR DELETE ON "track_likes"
FOR EACH ROW
EXECUTE FUNCTION update_track_like_count();

-- Create trigger function for track_plays
CREATE OR REPLACE FUNCTION update_track_play_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE "tracks" SET "play_count" = "play_count" + 1 WHERE "id" = NEW."track_id";
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE "tracks" SET "play_count" = "play_count" - 1 WHERE "id" = OLD."track_id";
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for track_plays
CREATE TRIGGER track_plays_count_trigger
AFTER INSERT OR DELETE ON "track_plays"
FOR EACH ROW
EXECUTE FUNCTION update_track_play_count();

-- Backfill existing counts for tracks
UPDATE "tracks" t
SET
  "like_count" = (SELECT COUNT(*) FROM "track_likes" l WHERE l."track_id" = t."id"),
  "play_count" = (SELECT COUNT(*) FROM "track_plays" p WHERE p."track_id" = t."id");

