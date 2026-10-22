// Composants d'interface réutilisables : formulaires modaux, confirmations, messages.

const modal = document.getElementById('modal');
const toastEl = document.getElementById('toast');
let toastTimer = null;

// Échappe le texte saisi avant de l'insérer dans du HTML (anti-injection)
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function toast(message, { error = false } = {}) {
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', error);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, error ? 5000 : 2500);
}

// Une ligne de la liste d'étapes : numéro (compteur CSS), nom, boutons ↑ ↓ ✕
function stepItemHtml(name, value, label) {
  return `
    <li class="step">
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
      <span class="step-name">${esc(label)}</span>
      <button type="button" class="btn btn-icon btn-small" data-step="up" aria-label="Monter ${esc(label)}">↑</button>
      <button type="button" class="btn btn-icon btn-small" data-step="down" aria-label="Descendre ${esc(label)}">↓</button>
      <button type="button" class="btn btn-icon btn-small btn-danger" data-step="remove" aria-label="Retirer ${esc(label)}">✕</button>
    </li>`;
}

// Génère le HTML d'un champ de formulaire
function fieldHtml(field, index) {
  const id = `f-${index}-${field.name}`;
  const value = field.value ?? '';
  const common = `id="${id}" name="${esc(field.name)}" ${field.required ? 'required' : ''} ${field.attrs ?? ''}`;
  if (field.type === 'hidden') {
    return `<input type="hidden" name="${esc(field.name)}" value="${esc(value)}">`;
  }
  if (field.type === 'swatches') {
    // Choix de couleur : boutons radio présentés en pastilles
    const swatches = field.options.map((o) => `
      <label class="swatch" title="${esc(o.label)}">
        <input type="radio" name="${esc(field.name)}" value="${esc(o.value)}" ${o.value === value ? 'checked' : ''}>
        <span style="background:${esc(o.value)}"></span>
        <span class="sr-only">${esc(o.label)}</span>
      </label>`).join('');
    // Dernière pastille : couleur libre, via le sélecteur de couleur du système
    const isCustom = Boolean(value) && !field.options.some((o) => o.value === value);
    const customValue = isCustom ? value : '#ff69b4';
    const custom = `
      <label class="swatch swatch-custom" title="Autre couleur">
        <input type="radio" name="${esc(field.name)}" value="${esc(customValue)}" data-custom-radio ${isCustom ? 'checked' : ''}>
        <span data-custom-preview ${isCustom ? `style="background:${esc(customValue)}"` : ''}></span>
        <span class="sr-only">Autre couleur</span>
        <input type="color" value="${esc(customValue)}" data-custom-color aria-label="Choisir une autre couleur">
      </label>`;
    return `<fieldset class="field"><legend>${esc(field.label)}</legend><div class="swatches">${swatches}${custom}</div></fieldset>`;
  }
  if (field.type === 'steps') {
    // Liste ordonnée et numérotée ; une même option peut être ajoutée plusieurs fois
    const labelOf = new Map(field.options.map((o) => [o.value, o.label]));
    const items = (field.value ?? []).map((v) => stepItemHtml(field.name, v, labelOf.get(v) ?? '?')).join('');
    let group = null;
    const optionsHtml = field.options.map((o) => {
      const open = o.group !== group ? `${group !== null ? '</optgroup>' : ''}<optgroup label="${esc(o.group || 'Autres')}">` : '';
      group = o.group;
      return `${open}<option value="${esc(o.value)}">${esc(o.label)}</option>`;
    }).join('') + (group !== null ? '</optgroup>' : '');
    return `
      <fieldset class="field">
        <legend>${esc(field.label)}</legend>
        <ol class="steps" data-steps="${esc(field.name)}">${items}</ol>
        <div class="step-add">
          <select data-step-select aria-label="Étape à ajouter">${optionsHtml}</select>
          <button type="button" class="btn btn-small" data-step="add">＋ Ajouter</button>
        </div>
      </fieldset>`;
  }
  if (field.type === 'checklist') {
    // Liste de cases à cocher, avec intertitres quand le groupe change (ex. pays)
    const checked = new Set(field.value ?? []);
    let group = null;
    const items = field.options.map((o) => {
      const heading = o.group !== group ? `<p class="checklist-group">${esc(o.group || 'Autres')}</p>` : '';
      group = o.group;
      return `${heading}
        <label class="checklist-item">
          <input type="checkbox" name="${esc(field.name)}" value="${esc(o.value)}" ${checked.has(o.value) ? 'checked' : ''}>
          <span>${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span>
        </label>`;
    }).join('');
    return `<fieldset class="field"><legend>${esc(field.label)}</legend><div class="checklist">${items}</div></fieldset>`;
  }
  let control;
  if (field.type === 'textarea') {
    control = `<textarea ${common}>${esc(value)}</textarea>`;
  } else if (field.type === 'select') {
    const options = field.options
      .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('');
    control = `<select ${common}>${options}</select>`;
  } else {
    control = `<input type="${field.type ?? 'text'}" value="${esc(value)}" ${common}>`;
  }
  return `<div class="field"><label for="${id}">${esc(field.label)}</label>${control}</div>`;
}

/**
 * Ouvre un formulaire modal.
 * onSubmit(values) peut être asynchrone : s'il lève une erreur, elle s'affiche
 * dans le formulaire, qui reste ouvert. Renvoie le résultat de onSubmit, ou null si annulé.
 * dangerLabel (facultatif) ajoute un bouton rouge à gauche : il ferme le formulaire
 * et renvoie { danger: true } (l'appelant demande alors confirmation).
 */
export function openForm({ title, intro = '', fields, submitLabel = 'Enregistrer', dangerLabel = '', onSubmit }) {
  modal.innerHTML = `
    <form method="dialog" novalidate>
      <h2>${esc(title)}</h2>
      ${intro ? `<p class="muted">${esc(intro)}</p>` : ''}
      ${fields.map(fieldHtml).join('')}
      <p class="form-error" hidden></p>
      <div class="modal-actions">
        ${dangerLabel ? `<button type="button" class="btn btn-danger modal-danger" data-danger>${esc(dangerLabel)}</button>` : ''}
        <button type="button" class="btn" data-cancel>Annuler</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  const form = modal.querySelector('form');
  const errorEl = form.querySelector('.form-error');
  const submitBtn = form.querySelector('[type=submit]');

  return new Promise((resolve) => {
    const close = (result) => {
      modal.close();
      resolve(result);
    };
    form.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    form.querySelector('[data-danger]')?.addEventListener('click', () => close({ danger: true }));
    modal.oncancel = (event) => { event.preventDefault(); close(null); };

    // Liste d'étapes : ajouter, monter, descendre, retirer (les numéros se recalculent en CSS)
    form.addEventListener('click', (event) => {
      const button = event.target.closest('[data-step]');
      if (!button) return;
      const fieldset = button.closest('fieldset');
      const list = fieldset.querySelector('[data-steps]');
      const item = button.closest('.step');
      if (button.dataset.step === 'up') item.previousElementSibling?.before(item);
      if (button.dataset.step === 'down') item.nextElementSibling?.after(item);
      if (button.dataset.step === 'remove') item.remove();
      if (button.dataset.step === 'add') {
        const option = fieldset.querySelector('[data-step-select]').selectedOptions[0];
        list.insertAdjacentHTML('beforeend', stepItemHtml(list.dataset.steps, option.value, option.textContent));
        list.lastElementChild.scrollIntoView({ block: 'nearest' });
      }
    });

    // Couleur libre : la valeur choisie devient celle de la pastille « Autre couleur »
    form.addEventListener('input', (event) => {
      if (!event.target.matches('[data-custom-color]')) return;
      const swatch = event.target.closest('.swatch-custom');
      const radio = swatch.querySelector('[data-custom-radio]');
      radio.value = event.target.value.toLowerCase();
      radio.checked = true;
      swatch.querySelector('[data-custom-preview]').style.background = radio.value;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const values = Object.fromEntries(data);
      // Cases à cocher et liste d'étapes renvoient toutes leurs valeurs (dans l'ordre affiché)
      fields.filter((f) => f.type === 'checklist' || f.type === 'steps')
        .forEach((f) => { values[f.name] = data.getAll(f.name); });
      submitBtn.disabled = true;
      errorEl.hidden = true;
      try {
        const result = onSubmit ? await onSubmit(values) : values;
        close(result ?? values);
      } catch (error) {
        errorEl.textContent = error.userMessage || error.message || String(error);
        errorEl.hidden = false;
        submitBtn.disabled = false;
      }
    });

    modal.showModal();
    form.querySelector('input:not([type=hidden]), textarea, select')?.focus();
  });
}

// Affiche une photo en grand ; un clic ou Échap la referme
export function showImage(url, caption = '') {
  modal.innerHTML = `
    <figure class="lightbox">
      <img src="${esc(url)}" alt="${esc(caption)}">
      ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
    </figure>
    <form method="dialog" class="lightbox-close">
      <button class="btn" type="submit">Fermer</button>
    </form>`;
  modal.classList.add('is-lightbox');
  modal.querySelector('figure').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => modal.classList.remove('is-lightbox'), { once: true });
  modal.oncancel = null;
  modal.showModal();
}

// Demande une confirmation avant une action irréversible. Renvoie true ou false.
export function confirmDialog(message, { confirmLabel = 'Supprimer' } = {}) {
  modal.innerHTML = `
    <form method="dialog">
      <h2>Confirmer</h2>
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Annuler</button>
        <button type="submit" class="btn btn-danger">${esc(confirmLabel)}</button>
      </div>
    </form>`;
  const form = modal.querySelector('form');
  return new Promise((resolve) => {
    const close = (result) => { modal.close(); resolve(result); };
    form.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    modal.oncancel = (event) => { event.preventDefault(); close(false); };
    form.addEventListener('submit', (event) => { event.preventDefault(); close(true); });
    modal.showModal();
    form.querySelector('[data-cancel]').focus();
  });
}
