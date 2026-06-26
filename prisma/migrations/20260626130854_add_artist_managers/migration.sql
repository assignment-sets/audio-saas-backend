-- CreateTable
CREATE TABLE "artist_managers" (
    "artist_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_managers_pkey" PRIMARY KEY ("artist_id","user_id")
);

-- AddForeignKey
ALTER TABLE "artist_managers" ADD CONSTRAINT "artist_managers_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_managers" ADD CONSTRAINT "artist_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
