// Authentification : connexion par email + mot de passe, état éditeur ou visiteur.
import { supabase } from './db.js';

// État courant : utilisateur connecté et sa ligne dans la table editeurs
const state = { user: null, editor: null };
const listeners = new Set();

export function currentEditor() {
  return state.editor;
}

export function isEditor() {
  return state.editor !== null;
}

// Prévient l'application à chaque changement de connexion
export function onAuthChange(callback) {
  listeners.add(callback);
}

export function initAuth() {
  // onAuthStateChange déclenche aussi l'événement initial (session existante ou non).
  // On diffère le traitement : Supabase déconseille d'appeler l'API dans ce callback.
  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => applySession(session), 0);
  });
}

async function applySession(session) {
  state.user = session?.user ?? null;
  state.editor = null;
  if (state.user) {
    const { data } = await supabase
      .from('editeurs')
      .select('user_id, prenom')
      .eq('user_id', state.user.id)
      .maybeSingle();
    state.editor = data ?? null;
  }
  document.body.classList.toggle('is-editor', isEditor());
  listeners.forEach((callback) => callback(state));
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(error.message === 'Invalid login credentials'
      ? 'Email ou mot de passe incorrect.'
      : error.message);
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}
