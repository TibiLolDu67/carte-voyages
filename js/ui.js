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

// Génère le HTML d'un champ de formulaire
function fieldHtml(field, index) {
  const id = `f-${index}-${field.name}`;
  const value = field.value ?? '';
  const common = `id="${id}" name="${esc(field.name)}" ${field.required ? 'required' : ''} ${field.attrs ?? ''}`;
  if (field.type === 'hidden') {
    return `<input type="hidden" name="${esc(field.name)}" value="${esc(value)}">`;
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
 */
export function openForm({ title, intro = '', fields, submitLabel = 'Enregistrer', onSubmit }) {
  modal.innerHTML = `
    <form method="dialog" novalidate>
      <h2>${esc(title)}</h2>
      ${intro ? `<p class="muted">${esc(intro)}</p>` : ''}
      ${fields.map(fieldHtml).join('')}
      <p class="form-error" hidden></p>
      <div class="modal-actions">
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
    modal.oncancel = (event) => { event.preventDefault(); close(null); };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
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
