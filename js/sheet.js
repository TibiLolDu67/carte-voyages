// Fiche destination : en-tête, choix du séjour et onglets
// (Séjours, Lieux, Photo, Spécialités, Commentaires) avec ajout, modification, suppression.
// Les données sont toujours relues depuis Supabase après chaque écriture.
import {
  getDestinationDetails, insertRow, updateRow, deleteRow, listEditors, errorMessage,
} from './db.js';
import { currentEditor } from './auth.js';
import { esc, openForm, confirmDialog, toast, showImage } from './ui.js';
import { photoUrl, setSejourPhoto, clearSejourPhoto, removePhotos } from './photos.js';

const sheet = document.getElementById('sheet');

const TABS = [
  { id: 'sejours', label: 'Séjours' },
  { id: 'lieux', label: 'Lieux' },
  { id: 'photo', label: 'Photo' },
  { id: 'specialites', label: 'Spécialités' },
  { id: 'commentaires', label: 'Commentaires' },
];

// État d'affichage uniquement (aucune donnée métier conservée hors de la base)
let current = null;          // destination affichée, avec ses séjours et commentaires
let selectedSejourId = null; // séjour choisi dans la rangée de pastilles
let activeTab = 'sejours';
let editors = [];            // [{ user_id, prenom }]
let handlers = {};
let loadToken = 0;           // évite qu'une réponse ancienne écrase une plus récente

// ---------- Mise en forme ----------
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

// Les dates "AAAA-MM-JJ" sont lues en heure locale pour éviter un décalage d'un jour
const parseDay = (value) => new Date(`${value}T12:00:00`);

function formatPeriod(sejour) {
  const start = dateFormat.format(parseDay(sejour.date_debut));
  if (!sejour.date_fin || sejour.date_fin === sejour.date_debut) return start;
  return `du ${start} au ${dateFormat.format(parseDay(sejour.date_fin))}`;
}

const chipLabel = (sejour) => monthFormat.format(parseDay(sejour.date_debut));
const authorName = (id) => editors.find((e) => e.user_id === id)?.prenom ?? 'Anonyme';
const stars = (n) => `<span class="stars" aria-label="${n} sur 5">${'★'.repeat(n)}<span class="stars-off">${'☆'.repeat(5 - n)}</span></span>`;
const multiline = (text) => esc(text).replaceAll('\n', '<br>');

function selectedSejour() {
  return current?.sejours.find((s) => s.id === selectedSejourId) ?? null;
}

// Boutons Modifier / Supprimer d'un élément de liste (visibles pour les éditeurs)
function itemTools(kind, id) {
  return `
    <div class="item-tools editor-only">
      <button class="btn btn-small" type="button" data-action="edit-${kind}" data-id="${esc(id)}">Modifier</button>
      <button class="btn btn-small btn-danger" type="button" data-action="delete-${kind}" data-id="${esc(id)}">Supprimer</button>
    </div>`;
}

const addButton = (action, label) =>
  `<button class="btn btn-primary btn-block editor-only" type="button" data-action="${action}">＋ ${esc(label)}</button>`;

const needSejour = () => `
  <p class="muted">Ajoutez d'abord un séjour pour cette destination.</p>
  ${addButton('add-sejour', 'Ajouter un séjour')}`;

// ---------- Contenu des onglets ----------
function renderSejoursTab() {
  if (!current.sejours.length) {
    return `<p class="muted">Aucun séjour pour l'instant.</p>${addButton('add-sejour', 'Ajouter un séjour')}`;
  }
  const items = current.sejours.map((s) => `
    <li class="item${s.id === selectedSejourId ? ' is-selected' : ''}">
      <button class="item-main item-with-thumb" type="button" data-action="select-sejour" data-id="${esc(s.id)}">
        ${s.photo_path
          ? `<img class="thumb-small" src="${esc(photoUrl(s.photo_path))}" alt="" loading="lazy">`
          : '<span class="thumb-small thumb-empty" aria-hidden="true">📷</span>'}
        <span>
          <strong>${esc(formatPeriod(s))}</strong>
          <small>${s.lieux.length} lieu(x) · ${s.specialites.length} spécialité(s)</small>
        </span>
      </button>
      ${itemTools('sejour', s.id)}
    </li>`).join('');
  return `<ul class="list">${items}</ul>${addButton('add-sejour', 'Ajouter un séjour')}`;
}

function renderLieuxTab() {
  const sejour = selectedSejour();
  if (!sejour) return needSejour();
  const items = sejour.lieux.map((l) => `
    <li class="item">
      <div class="item-main">
        <strong>${esc(l.nom)}</strong>
        ${l.note ? `<p>${multiline(l.note)}</p>` : ''}
      </div>
      ${itemTools('lieu', l.id)}
    </li>`).join('');
  return `
    ${items ? `<ul class="list">${items}</ul>` : '<p class="muted">Aucun lieu pour ce séjour.</p>'}
    ${addButton('add-lieu', 'Ajouter un lieu')}`;
}

function renderPhotoTab() {
  const sejour = selectedSejour();
  if (!sejour) return needSejour();
  const picker = (label) => `
    <label class="btn btn-primary btn-block editor-only file-btn">
      ${esc(label)}
      <input type="file" accept="image/*" data-photo-input hidden>
    </label>`;
  if (!sejour.photo_path) {
    return `<p class="muted">Pas encore de photo préférée pour ce séjour.</p>${picker('＋ Choisir une photo')}`;
  }
  return `
    <button class="photo-thumb" type="button" data-action="zoom-photo" aria-label="Agrandir la photo">
      <img src="${esc(photoUrl(sejour.photo_path))}" alt="Photo préférée du séjour ${esc(formatPeriod(sejour))}">
    </button>
    ${picker('Remplacer la photo')}
    <button class="btn btn-danger btn-block editor-only" type="button" data-action="delete-photo">Retirer la photo</button>`;
}

function renderSpecialitesTab() {
  const sejour = selectedSejour();
  if (!sejour) return needSejour();
  const items = sejour.specialites.map((s) => `
    <li class="item">
      <div class="item-main">
        <strong>${esc(s.nom)}</strong> ${stars(s.note_1_5)}
        ${s.avis ? `<p>${multiline(s.avis)}</p>` : ''}
        <small>Avis de ${esc(authorName(s.auteur_id))}</small>
      </div>
      ${itemTools('specialite', s.id)}
    </li>`).join('');
  return `
    ${items ? `<ul class="list">${items}</ul>` : '<p class="muted">Aucune spécialité pour ce séjour.</p>'}
    ${addButton('add-specialite', 'Ajouter une spécialité')}`;
}

function renderCommentairesTab() {
  const items = current.commentaires.map((c) => `
    <li class="item">
      <div class="item-main">
        <p>${multiline(c.texte)}</p>
        <small>${esc(authorName(c.auteur_id))} · ${esc(dateTimeFormat.format(new Date(c.created_at)))}</small>
      </div>
      ${itemTools('commentaire', c.id)}
    </li>`).join('');
  return `
    ${addButton('add-commentaire', 'Ajouter un commentaire')}
    ${items ? `<ul class="list">${items}</ul>` : '<p class="muted">Aucun commentaire.</p>'}`;
}

const TAB_RENDERERS = {
  sejours: renderSejoursTab,
  lieux: renderLieuxTab,
  photo: renderPhotoTab,
  specialites: renderSpecialitesTab,
  commentaires: renderCommentairesTab,
};

// Onglets qui dépendent du séjour choisi : on rappelle lequel en en-tête
const SEJOUR_TABS = new Set(['lieux', 'photo', 'specialites']);

// ---------- Rendu complet de la fiche ----------
function render() {
  const sejour = selectedSejour();
  const chips = current.sejours.map((s) => `
    <button class="chip" type="button" data-action="select-sejour" data-id="${esc(s.id)}"
      aria-pressed="${s.id === selectedSejourId}">${esc(chipLabel(s))}</button>`).join('');
  const tabs = TABS.map((t) => `
    <button class="tab" type="button" role="tab" id="tab-${t.id}" data-action="tab" data-tab="${t.id}"
      aria-selected="${t.id === activeTab}" aria-controls="tab-panel">${t.label}</button>`).join('');

  sheet.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-heading">
        <h2 id="sheet-title">${esc(current.nom)}</h2>
        ${current.pays ? `<p>${esc(current.pays)}</p>` : ''}
      </div>
      <button class="btn btn-icon" type="button" data-action="close" aria-label="Fermer la fiche">✕</button>
    </div>
    <div class="sheet-tools editor-only">
      <button class="btn btn-small" type="button" data-action="edit-destination">Modifier la destination</button>
      <button class="btn btn-small btn-danger" type="button" data-action="delete-destination">Supprimer</button>
    </div>
    ${chips ? `<div class="chips" aria-label="Séjours">${chips}</div>` : ''}
    <div class="tabs" role="tablist">${tabs}</div>
    <div class="sheet-body" id="tab-panel" role="tabpanel" aria-labelledby="tab-${activeTab}">
      ${SEJOUR_TABS.has(activeTab) && sejour ? `<p class="context">Séjour ${esc(formatPeriod(sejour))}</p>` : ''}
      ${TAB_RENDERERS[activeTab]()}
    </div>`;
  // Garde visibles la pastille et l'onglet actifs quand la rangée défile
  sheet.querySelector('.chip[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  sheet.querySelector('.tab[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderLoading(destination) {
  sheet.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-heading">
        <h2 id="sheet-title">${esc(destination.nom)}</h2>
        ${destination.pays ? `<p>${esc(destination.pays)}</p>` : ''}
      </div>
      <button class="btn btn-icon" type="button" data-action="close" aria-label="Fermer la fiche">✕</button>
    </div>
    <div class="sheet-body"><p class="muted">Chargement…</p></div>`;
}

// Relit la fiche depuis la base puis l'affiche
async function refresh() {
  if (!current) return;
  const token = ++loadToken;
  try {
    const details = await getDestinationDetails(current.id);
    if (token !== loadToken || !current) return;
    if (!details) { closeSheet(); return; }
    current = details;
    if (!current.sejours.some((s) => s.id === selectedSejourId)) {
      selectedSejourId = current.sejours[0]?.id ?? null;
    }
    render();
  } catch (error) {
    toast(errorMessage(error), { error: true });
  }
}

// ---------- Formulaires ----------
// Exécute une écriture : message d'erreur lisible, puis rechargement de la fiche
async function save(action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(errorMessage(error));
  } finally {
    // On recharge même en cas d'échec, pour afficher l'état réel de la base
    refresh();
  }
}

async function sejourForm(sejour = null) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await openForm({
    title: sejour ? 'Modifier le séjour' : 'Nouveau séjour',
    fields: [
      { name: 'date_debut', label: 'Date de début', type: 'date', value: sejour?.date_debut ?? today, required: true },
      { name: 'date_fin', label: 'Date de fin', type: 'date', value: sejour?.date_fin ?? '' },
    ],
    submitLabel: sejour ? 'Enregistrer' : 'Ajouter',
    onSubmit: (values) => {
      const row = { date_debut: values.date_debut, date_fin: values.date_fin || null };
      if (row.date_fin && row.date_fin < row.date_debut) {
        throw new Error('La date de fin doit être après la date de début.');
      }
      return save(async () => {
        if (sejour) return updateRow('sejours', sejour.id, row);
        const created = await insertRow('sejours', { ...row, destination_id: current.id });
        selectedSejourId = created.id; // le nouveau séjour devient le séjour affiché
        return created;
      });
    },
  });
  if (result) toast(sejour ? 'Séjour modifié' : 'Séjour ajouté');
}

async function lieuForm(lieu = null) {
  const result = await openForm({
    title: lieu ? 'Modifier le lieu' : 'Nouveau lieu visité',
    fields: [
      { name: 'nom', label: 'Nom du lieu', value: lieu?.nom, required: true, attrs: 'maxlength="120"' },
      { name: 'note', label: 'Note (facultatif)', type: 'textarea', value: lieu?.note, attrs: 'maxlength="500"' },
    ],
    submitLabel: lieu ? 'Enregistrer' : 'Ajouter',
    onSubmit: (values) => {
      const row = { nom: values.nom.trim(), note: values.note.trim() || null };
      return save(() => (lieu
        ? updateRow('lieux', lieu.id, row)
        : insertRow('lieux', { ...row, sejour_id: selectedSejourId })));
    },
  });
  if (result) toast(lieu ? 'Lieu modifié' : 'Lieu ajouté');
}

async function specialiteForm(specialite = null) {
  const defaultAuthor = specialite?.auteur_id ?? currentEditor()?.user_id ?? editors[0]?.user_id;
  const result = await openForm({
    title: specialite ? 'Modifier la spécialité' : 'Nouvelle spécialité goûtée',
    fields: [
      { name: 'nom', label: 'Plat', value: specialite?.nom, required: true, attrs: 'maxlength="120"' },
      {
        name: 'note_1_5',
        label: 'Note',
        type: 'select',
        value: specialite?.note_1_5 ?? 4,
        options: [5, 4, 3, 2, 1].map((n) => ({ value: n, label: `${'★'.repeat(n)}${'☆'.repeat(5 - n)}  (${n}/5)` })),
      },
      { name: 'avis', label: 'Avis (facultatif)', type: 'textarea', value: specialite?.avis, attrs: 'maxlength="1000"' },
      {
        name: 'auteur_id',
        label: 'Avis de',
        type: 'select',
        value: defaultAuthor,
        options: editors.map((e) => ({ value: e.user_id, label: e.prenom })),
      },
    ],
    submitLabel: specialite ? 'Enregistrer' : 'Ajouter',
    onSubmit: (values) => {
      const row = {
        nom: values.nom.trim(),
        note_1_5: Number(values.note_1_5),
        avis: values.avis.trim() || null,
        auteur_id: values.auteur_id || null,
      };
      return save(() => (specialite
        ? updateRow('specialites', specialite.id, row)
        : insertRow('specialites', { ...row, sejour_id: selectedSejourId })));
    },
  });
  if (result) toast(specialite ? 'Spécialité modifiée' : 'Spécialité ajoutée');
}

async function commentaireForm(commentaire = null) {
  const result = await openForm({
    title: commentaire ? 'Modifier le commentaire' : 'Nouveau commentaire',
    fields: [
      { name: 'texte', label: 'Commentaire', type: 'textarea', value: commentaire?.texte, required: true, attrs: 'maxlength="2000"' },
    ],
    submitLabel: commentaire ? 'Enregistrer' : 'Publier',
    onSubmit: (values) => {
      const row = { texte: values.texte.trim() };
      // L'auteur d'un nouveau commentaire est rempli par la base (utilisateur connecté)
      return save(() => (commentaire
        ? updateRow('commentaires', commentaire.id, row)
        : insertRow('commentaires', { ...row, destination_id: current.id })));
    },
  });
  if (result) toast(commentaire ? 'Commentaire modifié' : 'Commentaire publié');
}

// Suppression avec confirmation
async function removeItem(table, id, message, successMessage) {
  if (!(await confirmDialog(message))) return false;
  let deleted = false;
  try {
    await deleteRow(table, id);
    deleted = true;
    toast(successMessage);
  } catch (error) {
    toast(errorMessage(error), { error: true });
  }
  refresh();
  return deleted;
}

// Envoi d'une photo choisie dans l'onglet Photo
async function uploadPhoto(input) {
  const file = input.files?.[0];
  const sejour = selectedSejour();
  if (!file || !sejour) return;
  const label = input.closest('label');
  label.classList.add('is-busy');
  try {
    const { size } = await setSejourPhoto(sejour, file, (step) => {
      label.firstChild.textContent = step;
    });
    toast(`Photo enregistrée (${Math.round(size / 1000)} Ko)`);
  } catch (error) {
    toast(errorMessage(error), { error: true });
  }
  refresh();
}

// Retrouve un élément de la fiche par son type et son id
function findItem(kind, id) {
  if (kind === 'sejour') return current.sejours.find((s) => s.id === id);
  if (kind === 'commentaire') return current.commentaires.find((c) => c.id === id);
  for (const s of current.sejours) {
    const list = kind === 'lieu' ? s.lieux : s.specialites;
    const item = list.find((x) => x.id === id);
    if (item) return item;
  }
  return null;
}

// ---------- Actions (délégation d'événements) ----------
async function handleAction(action, button) {
  const id = button.dataset.id;
  switch (action) {
    case 'close': closeSheet(); break;
    case 'edit-destination': handlers.onEdit(current); break;
    case 'delete-destination': handlers.onDelete(current); break;
    case 'tab': activeTab = button.dataset.tab; render(); break;
    case 'select-sejour':
      selectedSejourId = id;
      if (activeTab === 'sejours') activeTab = 'lieux';
      render();
      break;

    case 'add-sejour': await sejourForm(); break;
    case 'edit-sejour': await sejourForm(findItem('sejour', id)); break;
    case 'delete-sejour': {
      const s = findItem('sejour', id);
      const deleted = await removeItem('sejours', id,
        `Supprimer le séjour ${formatPeriod(s)}, avec ses lieux, sa photo et ses spécialités ?`, 'Séjour supprimé');
      // La base supprime la ligne ; le fichier photo doit être retiré du bucket à part
      if (deleted) await removePhotos([s.photo_path]);
      break;
    }

    case 'zoom-photo': {
      const s = selectedSejour();
      showImage(photoUrl(s.photo_path), `${current.nom} – ${formatPeriod(s)}`);
      break;
    }
    case 'delete-photo': {
      const s = selectedSejour();
      if (!(await confirmDialog('Retirer la photo de ce séjour ?', { confirmLabel: 'Retirer' }))) break;
      try {
        await clearSejourPhoto(s);
        toast('Photo retirée');
      } catch (error) {
        toast(errorMessage(error), { error: true });
      }
      refresh();
      break;
    }

    case 'add-lieu': await lieuForm(); break;
    case 'edit-lieu': await lieuForm(findItem('lieu', id)); break;
    case 'delete-lieu':
      await removeItem('lieux', id, `Supprimer le lieu « ${findItem('lieu', id).nom} » ?`, 'Lieu supprimé');
      break;

    case 'add-specialite': await specialiteForm(); break;
    case 'edit-specialite': await specialiteForm(findItem('specialite', id)); break;
    case 'delete-specialite':
      await removeItem('specialites', id,
        `Supprimer la spécialité « ${findItem('specialite', id).nom} » ?`, 'Spécialité supprimée');
      break;

    case 'add-commentaire': await commentaireForm(); break;
    case 'edit-commentaire': await commentaireForm(findItem('commentaire', id)); break;
    case 'delete-commentaire':
      await removeItem('commentaires', id, 'Supprimer ce commentaire ?', 'Commentaire supprimé');
      break;

    default: break;
  }
}

// ---------- API du module ----------
export function initSheet({ onEdit, onDelete, onClose }) {
  handlers = { onEdit, onDelete, onClose };
  // Liste des éditeurs : sert à afficher et choisir l'auteur des avis
  listEditors().then((list) => { editors = list; }).catch(() => {});

  sheet.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !current) return;
    handleAction(button.dataset.action, button);
  });
  sheet.addEventListener('change', (event) => {
    if (event.target.matches('[data-photo-input]')) uploadPhoto(event.target);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sheet.hidden && !document.querySelector('dialog[open]')) closeSheet();
  });
}

export function openSheet(destination) {
  if (current?.id !== destination.id) {
    selectedSejourId = null;
    activeTab = 'sejours';
    renderLoading(destination);
  }
  current = { ...destination, sejours: current?.id === destination.id ? current.sejours : [], commentaires: [] };
  sheet.hidden = false;
  refresh();
}

export function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  current = null;
  loadToken += 1;
  handlers.onClose?.();
}

export function currentDestination() {
  return current;
}
