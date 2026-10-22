# Bibou Travel — carte de nos voyages

Carte du monde partagée de nos destinations : séjours, lieux visités, photo préférée,
spécialités goûtées et commentaires. Lecture publique, écriture réservée à Victor et Emilie.

- **Frontend** : HTML/CSS/JavaScript sans build (modules ES), hébergé sur GitHub Pages.
- **Carte** : Leaflet + tuiles OpenStreetMap ; recherche de villes avec Nominatim (sans clé).
- **Données** : Supabase (Postgres + Auth + Storage), plan gratuit.
- **Toutes les données sont en base** : rien n'est stocké sur l'appareil, à part la session
  de connexion gérée par Supabase. Ce qui est saisi sur le PC apparaît sur le téléphone après rechargement.

## Structure

```
index.html              page unique
css/style.css           styles (mobile d'abord, cibles tactiles ≥ 44 px)
js/config.js            URL Supabase + clé publique
js/app.js               point d'entrée : carte, recherche, connexion
js/db.js                accès aux tables Supabase
js/auth.js              connexion, état éditeur / visiteur
js/map.js               carte et pins
js/geocode.js           Nominatim (1 requête/seconde max)
js/sheet.js             fiche destination et onglets
js/photos.js            compression (≤ 400 Ko, ≤ 1600 px) et envoi des photos
js/ui.js                formulaires, confirmations, messages
supabase/schema.sql     tables, RLS, bucket photos (à exécuter une fois)
supabase/editeurs.sql   ajouter / retirer un éditeur
supabase/verification.sql  contrôle du schéma
serve.ps1               serveur local de test (Windows, rien à installer)
.github/workflows/keep-alive.yml  évite la mise en pause de Supabase
```

## Installation locale

Les modules JavaScript ne fonctionnent pas en ouvrant `index.html` directement (`file://`) :
il faut un petit serveur local.

1. Ouvrir un terminal PowerShell dans le dossier du projet.
2. Lancer :
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
   ```
3. Ouvrir http://localhost:8080. Arrêter avec Ctrl+C.

(Alternative si Python est installé : `python -m http.server 8080`.)

## Configuration Supabase (une seule fois)

1. Créer un projet Supabase (plan gratuit, sans carte bancaire).
2. **SQL Editor** : exécuter tout `supabase/schema.sql`.
3. Exécuter `supabase/verification.sql` : résultat attendu `6 | 21 | 4 | true | 409600`.
4. **Authentication > Sign In / Providers** : désactiver « Allow new users to sign up »,
   puis enregistrer (l'intitulé peut évoluer).
5. **Authentication > Users** : créer les comptes (« Add user », cocher « Auto Confirm User »).
6. Déclarer chaque compte comme éditeur avec `supabase/editeurs.sql`.
7. **Project Settings > API Keys** : copier l'URL du projet et la clé publique
   (`sb_publishable_…` ou ancienne clé `anon`) dans `js/config.js`.

## Déploiement (GitHub Pages)

1. Créer un dépôt **public** sur GitHub (Pages gratuit exige un dépôt public).
2. Pousser le code sur la branche `main`.
3. Dans le dépôt : **Settings > Pages** → Source « Deploy from a branch »,
   branche `main`, dossier `/ (root)`, enregistrer.
4. Après une à deux minutes, le site est en ligne sur `https://<utilisateur>.github.io/<dépôt>/`.
5. Chaque `git push` sur `main` met le site à jour automatiquement.

Aucune variable d'environnement n'est nécessaire : seules l'URL et la clé publique sont
utilisées, et elles sont faites pour être visibles.

## Ajouter ou retirer un utilisateur autorisé

L'écriture est réservée aux comptes présents dans la table `editeurs` (vérifié par les RLS en base,
pas seulement par l'interface).

- **Ajouter** : créer le compte dans Authentication > Users, puis exécuter dans SQL Editor
  la requête « Ajouter un éditeur » de `supabase/editeurs.sql` (email + prénom).
- **Retirer** : exécuter la requête « Retirer un éditeur » du même fichier, puis supprimer le compte
  dans Authentication > Users si besoin. Ses commentaires et avis restent, sans auteur.
- **Mot de passe oublié** : dans Authentication > Users, ouvrir le compte et utiliser l'action
  de réinitialisation ou de changement de mot de passe.

## Sécurité

- Lecture publique ; création, modification et suppression refusées par les RLS à tout compte
  absent de `editeurs` (tables et bucket photos).
- Inscription libre désactivée.
- Seules l'URL et la clé **publique** sont dans le code. La clé `service_role` / *secret key*
  ne doit jamais apparaître dans le dépôt.
- Le bucket refuse côté serveur les fichiers de plus de 400 Kio et les formats autres que WebP/JPEG.

## Limites du plan gratuit

| Ressource | Limite gratuite (à vérifier sur supabase.com/pricing) | Usage prévu |
|---|---|---|
| Base de données | 500 Mo | quelques Mo |
| Stockage fichiers | 1 Go | ~200 photos × 400 Ko ≈ 80 Mo |
| Bande passante | 5 Go / mois | largement suffisant pour 2 personnes |
| Projets actifs | 2 par compte | ce projet + l'appli de musculation |

**Mise en pause** : un projet gratuit est suspendu après environ 7 jours sans activité.
- Le workflow `.github/workflows/keep-alive.yml` fait une lecture deux fois par semaine pour l'éviter.
  GitHub désactive les tâches planifiées d'un dépôt sans commit depuis 60 jours : il envoie alors
  un email, et il suffit de cliquer sur « Enable workflow » dans l'onglet Actions.
- Si le projet est en pause malgré tout : le site affiche « Connexion impossible au serveur ».
  Ouvrir le tableau de bord Supabase, choisir le projet et cliquer sur **Restore project**
  (quelques minutes ; aucune donnée perdue).

Nominatim (recherche de villes) est un service gratuit à usage modéré : l'application n'envoie
qu'une requête à la validation, et au maximum une par seconde.
