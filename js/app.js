// Point d'entrée : relie la carte, la recherche, la fiche et l'authentification.
import {
  listDestinations, createDestination, updateDestination, deleteDestination, listPhotoPaths, errorMessage,
  listRoadtrips, saveRoadtrip, deleteRoadtrip,
} from './db.js';
import { removePhotos } from './photos.js';
import { initAuth, onAuthChange, isEditor, currentEditor, signIn, signOut } from './auth.js';
import {
  createMap, onMapClick, renderPins, setActivePin, flyTo, refreshMapSize, PIN_COLORS, DEFAULT_PIN_COLOR,
  roadtripStops, fitStops,
} from './map.js';
import { searchPlaces, reversePlace } from './geocode.js';
import { initSheet, openSheet, closeSheet, currentDestination } from './sheet.js';
import { openForm, confirmDialog, toast, esc } from './ui.js';

const topbar = document.querySelector('.topbar');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('search-results');
const addModeBtn = document.getElementById('add-mode-btn');
const addBanner = document.getElementById('add-banner');
const authBtn = document.getElementById('auth-btn');

// Liste affichée, toujours relue depuis la base après chaque modification
let destinations = [];
let roadtrips = [];
let signedIn = false;

// ---------- Mise en page : la carte démarre sous la barre du haut ----------
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  refreshMapSize();
}).observe(topbar);

// ---------- Accueil ↔ carte (l'adresse se termine par #carte quand la carte est affichée) ----------
const homeStats = document.getElementById('home-stats');

function showRoute() {
  const onMap = location.hash === '#carte';
  document.body.classList.toggle('on-home', !onMap);
  if (onMap) {
    refreshMapSize();
  } else {
    hideResults();
    setAddMode(false);
  }
}
window.addEventListener('hashchange', showRoute);

// Petit compteur affiché sur l'accueil
function updateHomeStats() {
  const countries = new Set(destinations.map((d) => d.pays).filter(Boolean)).size;
  const n = destinations.length;
  const r = roadtrips.length;
  homeStats.textContent = n
    ? `${n} destination${n > 1 ? 's' : ''} · ${countries} pays${r ? ` · ${r} roadtrip${r > 1 ? 's' : ''}` : ''}`
    : '';
}

// ---------- Chargement des destinations et roadtrips ----------
async function loadDestinations() {
  try {
    [destinations, roadtrips] = await Promise.all([listDestinations(), listRoadtrips()]);
    updateHomeStats();
    renderPins(destinations, roadtrips, selectDestination);
    setActivePin(currentDestination()?.id ?? null);
  } catch (error) {
    toast(errorMessage(error), { error: true });
  }
}

function selectDestination(destination) {
  hideResults();
  openSheet(destination);
  setActivePin(destination.id);
}

// ---------- Ajout, modification, suppression d'une destination ----------
// Champs communs aux formulaires d'ajout et de modification
const destinationFields = (destination) => [
  { name: 'nom', label: 'Ville ou région', value: destination.nom, required: true, attrs: 'maxlength="120"' },
  { name: 'pays', label: 'Pays', value: destination.pays, attrs: 'maxlength="80"' },
  { name: 'couleur', label: 'Couleur du pin', type: 'swatches', value: destination.couleur ?? DEFAULT_PIN_COLOR, options: PIN_COLORS },
];

async function addDestination(place) {
  const created = await openForm({
    title: 'Nouvelle destination',
    fields: destinationFields(place),
    submitLabel: 'Ajouter',
    onSubmit: async (values) => {
      try {
        return await createDestination({
          nom: values.nom.trim(),
          pays: values.pays.trim() || null,
          couleur: values.couleur || null,
          lat: place.lat,
          lng: place.lng,
        });
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    },
  });
  if (!created) return;
  toast('Destination ajoutée');
  await loadDestinations();
  selectDestination(created);
}

async function editDestination(destination) {
  const updated = await openForm({
    title: 'Modifier la destination',
    fields: destinationFields(destination),
    onSubmit: async (values) => {
      try {
        return await updateDestination(destination.id, {
          nom: values.nom.trim(),
          pays: values.pays.trim() || null,
          couleur: values.couleur || null,
        });
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    },
  });
  if (!updated) return;
  toast('Destination modifiée');
  await loadDestinations();
  openSheet(updated);
}

async function removeDestination(destination) {
  const ok = await confirmDialog(
    `Supprimer « ${destination.nom} » ainsi que tous ses séjours, lieux, photos, spécialités et commentaires ?`,
  );
  if (!ok) return;
  try {
    // Les lignes partent en cascade, mais les fichiers photo doivent être retirés à part
    const photoPaths = await listPhotoPaths(destination.id);
    await deleteDestination(destination.id);
    await removePhotos(photoPaths);
    closeSheet();
    toast('Destination supprimée');
    await loadDestinations();
  } catch (error) {
    toast(errorMessage(error), { error: true });
  }
}

// ---------- Roadtrips ----------
// Roadtrips dont la destination est une étape
const roadtripsOf = (destination) =>
  roadtrips.filter((r) => r.roadtrip_etapes.some((e) => e.destination_id === destination?.id));

// Bouton « Roadtrip » de la fiche : modifie directement le roadtrip de la destination
// s'il n'y en a qu'un, sinon demande lequel (ou d'en créer un nouveau)
async function manageRoadtrip(destination) {
  const mine = roadtripsOf(destination);
  let roadtrip = mine.length === 1 ? mine[0] : null;
  if (!roadtrip && roadtrips.length) {
    const choice = await openForm({
      title: 'Choisir un roadtrip',
      fields: [{
        name: 'roadtrip',
        label: 'Roadtrip',
        type: 'select',
        value: (mine[0] ?? roadtrips[roadtrips.length - 1]).id,
        options: [...roadtrips.map((r) => ({ value: r.id, label: r.nom })), { value: 'new', label: '＋ Nouveau roadtrip' }],
      }],
      submitLabel: 'Continuer',
    });
    if (!choice) return;
    roadtrip = roadtrips.find((r) => r.id === choice.roadtrip) ?? null;
  }
  await roadtripForm(roadtrip, destination);
}

async function roadtripForm(roadtrip, destination) {
  // Étapes actuelles dans l'ordre ; la destination ouverte est ajoutée à la fin si absente
  const steps = roadtripStops(destinations, roadtrip).map((d) => d.id);
  if (!steps.includes(destination.id)) steps.push(destination.id);

  // Toutes les destinations, groupées par pays (celui de la destination en premier)
  const samePays = (d) => (d.pays === destination.pays ? 0 : 1);
  const options = [...destinations]
    .sort((a, b) => samePays(a) - samePays(b)
      || (a.pays ?? '').localeCompare(b.pays ?? '', 'fr') || a.nom.localeCompare(b.nom, 'fr'))
    .map((d) => ({ value: d.id, label: d.nom, group: d.pays }));

  const result = await openForm({
    title: roadtrip ? 'Modifier le roadtrip' : 'Nouveau roadtrip',
    intro: 'Le tracé relie les étapes dans l\'ordre des numéros. Une ville peut revenir plusieurs fois.',
    fields: [
      { name: 'nom', label: 'Nom du roadtrip', value: roadtrip?.nom ?? (destination.pays ? `Roadtrip ${destination.pays}` : ''), required: true, attrs: 'maxlength="80"' },
      { name: 'couleur', label: 'Couleur du tracé et des contours', type: 'swatches', value: roadtrip?.couleur ?? '#111827', options: PIN_COLORS },
      { name: 'etapes', label: 'Étapes (dans l\'ordre du trajet)', type: 'steps', value: steps, options },
    ],
    submitLabel: roadtrip ? 'Enregistrer' : 'Créer le roadtrip',
    dangerLabel: roadtrip ? 'Supprimer' : '',
    onSubmit: async (values) => {
      if (!values.etapes.length) throw new Error('Ajoutez au moins une étape.');
      try {
        return await saveRoadtrip(roadtrip?.id, { nom: values.nom.trim(), couleur: values.couleur || null }, values.etapes);
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    },
  });
  if (!result) return;

  if (result.danger) {
    const ok = await confirmDialog(`Supprimer le roadtrip « ${roadtrip.nom} » ? Ses destinations restent sur la carte.`);
    if (!ok) return;
    try {
      await deleteRoadtrip(roadtrip.id);
      toast('Roadtrip supprimé');
    } catch (error) {
      toast(errorMessage(error), { error: true });
    }
  } else {
    toast(roadtrip ? 'Roadtrip modifié' : 'Roadtrip créé');
  }
  await loadDestinations();
  openSheet(destinations.find((d) => d.id === destination.id) ?? destination);
  if (!result.danger) fitStops(roadtripStops(destinations, roadtrips.find((r) => r.id === result.id)));
}

// Clic sur un badge de roadtrip : cadre la carte sur tout le tracé
function showRoadtrip(roadtripId) {
  const roadtrip = roadtrips.find((r) => r.id === roadtripId);
  if (roadtrip) fitStops(roadtripStops(destinations, roadtrip));
}

initSheet({
  onEdit: editDestination,
  onDelete: removeDestination,
  onClose: () => setActivePin(null),
  onRoadtrip: manageRoadtrip,
  onShowRoadtrip: showRoadtrip,
  getRoadtrips: roadtripsOf,
});

// ---------- Recherche ----------
// Compare sans tenir compte des accents ni des majuscules
const normalize = (text) => (text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function hideResults() {
  resultsEl.hidden = true;
  resultsEl.innerHTML = '';
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const submitBtn = searchForm.querySelector('button');
  submitBtn.disabled = true;

  // 1. Destinations déjà sur la carte
  const known = destinations.filter((d) => normalize(d.nom).includes(normalize(query)));
  let html = '';
  if (known.length) {
    html += '<h2>Déjà sur la carte</h2>' + known.map((d) => `
      <button class="result" type="button" data-known="${esc(d.id)}">
        ${esc(d.nom)}<small>${esc(d.pays ?? '')}</small>
      </button>`).join('');
  }
  resultsEl.innerHTML = html + '<p>Recherche en cours…</p>';
  resultsEl.hidden = false;

  // 2. Lieux trouvés par Nominatim
  try {
    const places = await searchPlaces(query);
    html += '<h2>Lieux trouvés</h2>';
    html += places.length
      ? places.map((p, i) => `
        <button class="result" type="button" data-place="${i}">
          ${esc(p.nom)}<small>${esc(p.label)}</small>
        </button>`).join('')
      : '<p>Aucun lieu trouvé.</p>';
    resultsEl.innerHTML = html;
    resultsEl.places = places;
  } catch (error) {
    resultsEl.innerHTML = html + `<p>${esc(error.message)}</p>`;
  } finally {
    submitBtn.disabled = false;
  }
});

resultsEl.addEventListener('click', (event) => {
  const button = event.target.closest('.result');
  if (!button) return;
  if (button.dataset.known) {
    const destination = destinations.find((d) => d.id === button.dataset.known);
    flyTo(destination.lat, destination.lng);
    selectDestination(destination);
    return;
  }
  const place = resultsEl.places[Number(button.dataset.place)];
  hideResults();
  flyTo(place.lat, place.lng);
  if (isEditor()) addDestination(place);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideResults();
    setAddMode(false);
  }
});

// ---------- Ajout par clic sur la carte ----------
let addMode = false;

function setAddMode(enabled) {
  addMode = enabled && isEditor();
  document.body.classList.toggle('add-mode', addMode);
  addBanner.hidden = !addMode;
  addModeBtn.setAttribute('aria-pressed', String(addMode));
}

addModeBtn.addEventListener('click', () => {
  hideResults();
  setAddMode(!addMode);
});

createMap(document.getElementById('map'));

onMapClick(async ({ lat, lng }) => {
  hideResults();
  if (!addMode) return;
  setAddMode(false);
  toast('Recherche du nom du lieu…');
  let place = { nom: '', pays: '', lat, lng };
  try {
    place = await reversePlace(lat, lng);
  } catch {
    // Sans nom trouvé, on laisse l'utilisateur le saisir
  }
  addDestination(place);
});

// ---------- Connexion ----------
authBtn.addEventListener('click', async () => {
  if (signedIn) {
    const name = currentEditor()?.prenom;
    const ok = await confirmDialog(
      name ? `Connecté en tant que ${name}. Se déconnecter ?` : 'Se déconnecter ?',
      { confirmLabel: 'Se déconnecter' },
    );
    if (!ok) return;
    await signOut();
    toast('Déconnecté');
    return;
  }
  await openForm({
    title: 'Connexion',
    intro: 'Réservé à Victor et Emilie.',
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true, attrs: 'autocomplete="username"' },
      { name: 'password', label: 'Mot de passe', type: 'password', required: true, attrs: 'autocomplete="current-password"' },
    ],
    submitLabel: 'Se connecter',
    onSubmit: (values) => signIn(values.email.trim(), values.password),
  });
});

onAuthChange(({ user, editor }) => {
  signedIn = Boolean(user);
  // Connecté : pastille avec l'initiale ; visiteur : bouton « Connexion »
  authBtn.classList.toggle('avatar', Boolean(editor));
  authBtn.textContent = editor ? editor.prenom.charAt(0).toUpperCase() : (signedIn ? 'Quitter' : 'Connexion');
  const label = editor ? `Connecté : ${editor.prenom} (se déconnecter)` : (signedIn ? 'Se déconnecter' : 'Se connecter');
  authBtn.setAttribute('aria-label', label);
  authBtn.title = label;
  if (user && !editor) toast("Ce compte n'est pas autorisé à modifier la carte.", { error: true });
  if (!editor) setAddMode(false);
});

initAuth();
showRoute();
loadDestinations();
