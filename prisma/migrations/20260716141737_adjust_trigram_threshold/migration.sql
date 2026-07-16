-- Lower pg_trgm similarity threshold dynamically on the current database to 0.2
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET pg_trgm.similarity_threshold = 0.2';
END
$$;