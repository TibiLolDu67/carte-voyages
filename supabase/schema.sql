-- =====================================================================
-- Carte de nos voyages : schéma complet (tables, RLS, bucket photos)
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor > New query).
-- Le script est ré-exécutable : il ne supprime aucune donnée existante.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Liste blanche des éditeurs
--    Une ligne = un compte autorisé à écrire. Aucune politique d'écriture
--    n'est définie : seule l'éditeur SQL (rôle postgres) peut la modifier.
-- ---------------------------------------------------------------------
create table if not exists public.editeurs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prenom  text not null check (char_length(prenom) between 1 and 40)
);

-- Vrai si l'utilisateur connecté figure dans la liste blanche.
-- "security definer" : la fonction lit editeurs sans dépendre des RLS.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.editeurs where user_id = auth.uid());
$$;

grant execute on function public.is_editor() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Tables métier (suppression en cascade sur les clés étrangères)
-- ---------------------------------------------------------------------
create table if not exists public.destinations (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null check (char_length(nom) between 1 and 120),
  pays       text check (char_length(pays) <= 80),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);

-- Couleur du pin sur la carte (#rrggbb) ; null = couleur par défaut.
-- Ajoutée après coup : "add column if not exists" la crée aussi sur une base existante.
alter table public.destinations
  add column if not exists couleur text check (couleur ~ '^#[0-9a-f]{6}$');

create table if not exists public.sejours (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  date_debut     date not null,
  date_fin       date,
  -- Chemin du fichier dans le bucket "photos" (ex. sejours/<id>/1700000000.webp)
  photo_path     text,
  created_at     timestamptz not null default now(),
  check (date_fin is null or date_fin >= date_debut)
);

create table if not exists public.lieux (
  id         uuid primary key default gen_random_uuid(),
  sejour_id  uuid not null references public.sejours (id) on delete cascade,
  nom        text not null check (char_length(nom) between 1 and 120),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.specialites (
  id         uuid primary key default gen_random_uuid(),
  sejour_id  uuid not null references public.sejours (id) on delete cascade,
  nom        text not null check (char_length(nom) between 1 and 120),
  note_1_5   smallint not null check (note_1_5 between 1 and 5),
  avis       text check (char_length(avis) <= 1000),
  -- Auteur de l'avis, choisi parmi les éditeurs (pas forcément la personne connectée)
  auteur_id  uuid references public.editeurs (user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.commentaires (
  id             uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations (id) on delete cascade,
  texte          text not null check (char_length(texte) between 1 and 2000),
  -- Rempli automatiquement avec l'utilisateur connecté
  auteur_id      uuid default auth.uid() references public.editeurs (user_id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Index sur les clés étrangères (accélère les fiches et les cascades)
create index if not exists sejours_destination_idx      on public.sejours (destination_id);
create index if not exists lieux_sejour_idx             on public.lieux (sejour_id);
create index if not exists specialites_sejour_idx       on public.specialites (sejour_id);
create index if not exists commentaires_destination_idx on public.commentaires (destination_id);


-- ---------------------------------------------------------------------
-- 3. Droits d'accès de l'API
--    Les visiteurs (anon) ne reçoivent que la lecture ; les comptes
--    connectés reçoivent l'écriture, filtrée ensuite par les RLS.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.editeurs, public.destinations, public.sejours,
                public.lieux, public.specialites, public.commentaires
  to anon, authenticated;
grant insert, update, delete on public.destinations, public.sejours,
                public.lieux, public.specialites, public.commentaires
  to authenticated;


-- ---------------------------------------------------------------------
-- 4. Row Level Security
--    SELECT : tout le monde. INSERT / UPDATE / DELETE : is_editor().
-- ---------------------------------------------------------------------
alter table public.editeurs enable row level security;

drop policy if exists editeurs_lecture on public.editeurs;
create policy editeurs_lecture on public.editeurs
  for select to anon, authenticated using (true);

-- Mêmes quatre politiques pour chaque table métier
do $$
declare
  t text;
begin
  foreach t in array array['destinations', 'sejours', 'lieux', 'specialites', 'commentaires']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || '_lecture', t);

    execute format('drop policy if exists %I on public.%I', t || '_ajout', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_editor())',
                   t || '_ajout', t);

    execute format('drop policy if exists %I on public.%I', t || '_modif', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_editor()) with check (public.is_editor())',
                   t || '_modif', t);

    execute format('drop policy if exists %I on public.%I', t || '_suppr', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_editor())',
                   t || '_suppr', t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------
-- 5. Bucket Storage "photos"
--    Lecture publique ; 400 Ko max par fichier ; WebP ou JPEG uniquement.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 409600, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_lecture on storage.objects;
create policy photos_lecture on storage.objects
  for select to anon, authenticated using (bucket_id = 'photos');

drop policy if exists photos_ajout on storage.objects;
create policy photos_ajout on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_editor());

drop policy if exists photos_modif on storage.objects;
create policy photos_modif on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_editor())
  with check (bucket_id = 'photos' and public.is_editor());

drop policy if exists photos_suppr on storage.objects;
create policy photos_suppr on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_editor());
