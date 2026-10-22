-- =====================================================================
-- Gestion des éditeurs (comptes autorisés à écrire)
-- À exécuter dans l'éditeur SQL de Supabase, APRÈS avoir créé les comptes
-- dans Authentication > Users. Remplace les valeurs entre < >.
-- =====================================================================

-- Ajouter un éditeur à partir de son email
insert into public.editeurs (user_id, prenom)
select id, '<Prénom>' from auth.users where email = '<email@exemple.com>'
on conflict (user_id) do update set prenom = excluded.prenom;

-- Vérifier la liste
select e.prenom, u.email from public.editeurs e join auth.users u on u.id = e.user_id;

-- Retirer un éditeur (ses commentaires restent, sans auteur)
-- delete from public.editeurs
-- where user_id = (select id from auth.users where email = '<email@exemple.com>');
