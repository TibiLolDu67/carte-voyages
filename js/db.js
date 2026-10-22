// Accès aux données : toutes les lectures et écritures passent par Supabase.
// Aucune donnée métier n'est gardée dans le navigateur (ni localStorage, ni cache).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Le client ne stocke dans localStorage que la session de connexion (géré par Supabase).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Transforme une réponse Supabase en données, ou lève l'erreur
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- Destinations ----------
export async function listDestinations() {
  return unwrap(await supabase.from('destinations').select('id, nom, pays, lat, lng, couleur').order('nom'));
}

export async function createDestination(destination) {
  return unwrap(await supabase.from('destinations').insert(destination).select().single());
}

export async function updateDestination(id, changes) {
  return unwrap(await supabase.from('destinations').update(changes).eq('id', id).select().single());
}

export async function deleteDestination(id) {
  unwrap(await supabase.from('destinations').delete().eq('id', id));
}

// Chemins des photos d'une destination (pour les retirer du bucket lors d'une suppression)
export async function listPhotoPaths(destinationId) {
  const rows = unwrap(await supabase
    .from('sejours').select('photo_path').eq('destination_id', destinationId).not('photo_path', 'is', null));
  return rows.map((row) => row.photo_path);
}

// Fiche complète : séjours (avec lieux et spécialités) et commentaires, en une requête
export async function getDestinationDetails(id) {
  return unwrap(await supabase
    .from('destinations')
    .select(`id, nom, pays, lat, lng, couleur,
      sejours (id, date_debut, date_fin, photo_path,
        lieux (id, nom, note, created_at),
        specialites (id, nom, note_1_5, avis, auteur_id, created_at)),
      commentaires (id, texte, auteur_id, created_at)`)
    .eq('id', id)
    .order('date_debut', { referencedTable: 'sejours', ascending: false })
    .order('created_at', { referencedTable: 'sejours.lieux', ascending: true })
    .order('created_at', { referencedTable: 'sejours.specialites', ascending: true })
    .order('created_at', { referencedTable: 'commentaires', ascending: false })
    .maybeSingle());
}

// ---------- Séjours, lieux, spécialités, commentaires (fonctions génériques) ----------
export async function insertRow(table, row) {
  return unwrap(await supabase.from(table).insert(row).select().single());
}

export async function updateRow(table, id, changes) {
  return unwrap(await supabase.from(table).update(changes).eq('id', id).select().single());
}

export async function deleteRow(table, id) {
  unwrap(await supabase.from(table).delete().eq('id', id));
}

// ---------- Éditeurs ----------
export async function listEditors() {
  return unwrap(await supabase.from('editeurs').select('user_id, prenom').order('prenom'));
}

// Message d'erreur compréhensible pour l'utilisateur
export function errorMessage(error) {
  if (!error) return 'Erreur inconnue';
  if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
    return 'Action refusée : connectez-vous avec un compte autorisé.';
  }
  if (error.code === '23514') {
    return 'Valeur invalide (par exemple une date de fin avant la date de début).';
  }
  if (error.message === 'Failed to fetch') {
    return 'Connexion impossible au serveur (réseau, ou projet Supabase en pause).';
  }
  return error.message || String(error);
}
