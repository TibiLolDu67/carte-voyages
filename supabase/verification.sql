-- =====================================================================
-- Contrôle après exécution de schema.sql (lecture seule)
-- L'éditeur SQL n'affiche que le résultat de la DERNIÈRE requête :
-- tout est donc regroupé en une seule ligne de résultat.
-- Résultat attendu : tables_rls = 6, politiques_public = 21,
-- politiques_photos = 4, bucket_public = true, bucket_limite = 409600
-- =====================================================================
select
  (select count(*) from pg_tables
    where schemaname = 'public' and rowsecurity
      and tablename in ('editeurs', 'destinations', 'sejours', 'lieux', 'specialites', 'commentaires')
  ) as tables_rls,
  (select count(*) from pg_policies where schemaname = 'public') as politiques_public,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'photos_%'
  ) as politiques_photos,
  (select public from storage.buckets where id = 'photos') as bucket_public,
  (select file_size_limit from storage.buckets where id = 'photos') as bucket_limite;
