-- Execute as the schema-owning migrator AFTER every explicit migration phase.
-- No role inheritance or DDL grant; Prisma migration history stays inaccessible.
\set ON_ERROR_STOP on
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO fluivix_app', item.tablename);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fluivix_app;
REVOKE ALL ON TABLE public._prisma_migrations FROM fluivix_app;
