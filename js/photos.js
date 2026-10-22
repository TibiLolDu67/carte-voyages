// Photos : compression dans le navigateur, puis envoi dans le bucket Supabase "photos".
// La photo d'origine n'est jamais envoyée : seule la version compressée part sur le serveur.
import { supabase } from './db.js';

const BUCKET = 'photos';
export const MAX_DIMENSION = 1600;     // px, largeur (et hauteur) maximale
export const MAX_BYTES = 400 * 1000;   // 400 Ko (le bucket refuse au-delà de 400 Kio)

// Encode le canvas ; renvoie null si le navigateur ne sait pas produire ce format
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

async function decodeImage(file) {
  try {
    // "from-image" applique l'orientation EXIF (photos de téléphone)
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("Format d'image non lu par ce navigateur (essayez une photo JPEG ou PNG).");
  }
}

/**
 * Compresse une image : 1600 px maximum, WebP (ou JPEG si WebP indisponible),
 * qualité réduite progressivement jusqu'à passer sous 400 Ko.
 * Renvoie { blob, type, width, height }.
 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.");
  const bitmap = await decodeImage(file);
  let scale = Math.min(1, MAX_DIMENSION / bitmap.width, MAX_DIMENSION / bitmap.height);

  try {
    // Jusqu'à 4 réductions de taille si la qualité minimale ne suffit pas
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff'; // fond blanc pour les PNG transparents passés en JPEG
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
        let blob = await canvasToBlob(canvas, 'image/webp', quality);
        if (!blob) blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (!blob) throw new Error("Impossible de compresser l'image sur ce navigateur.");
        if (blob.size <= MAX_BYTES) {
          return { blob, type: blob.type, width: canvas.width, height: canvas.height };
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("L'image reste trop lourde après compression.");
}

export function photoUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : '';
}

// Supprime des fichiers du bucket (les erreurs sont ignorées : fichier déjà absent, etc.)
export async function removePhotos(paths) {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from(BUCKET).remove(list);
}

/**
 * Compresse puis enregistre la photo d'un séjour, et supprime l'ancienne.
 * onStep(message) permet d'afficher l'avancement.
 */
export async function setSejourPhoto(sejour, file, onStep = () => {}) {
  onStep('Compression…');
  const { blob, type } = await compressImage(file);
  const extension = type === 'image/webp' ? 'webp' : 'jpg';
  // Nom unique à chaque envoi : évite qu'un ancien fichier reste en cache
  const path = `sejours/${sejour.id}/${Date.now()}.${extension}`;

  onStep(`Envoi (${Math.round(blob.size / 1000)} Ko)…`);
  const upload = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (upload.error) throw upload.error;

  const update = await supabase.from('sejours').update({ photo_path: path }).eq('id', sejour.id);
  if (update.error) {
    await removePhotos([path]); // on ne laisse pas de fichier orphelin
    throw update.error;
  }
  if (sejour.photo_path) await removePhotos([sejour.photo_path]);
  return { path, size: blob.size };
}

// Retire la photo d'un séjour (ligne en base puis fichier)
export async function clearSejourPhoto(sejour) {
  const update = await supabase.from('sejours').update({ photo_path: null }).eq('id', sejour.id);
  if (update.error) throw update.error;
  await removePhotos([sejour.photo_path]);
}
