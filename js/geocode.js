// Géocodage avec Nominatim (OpenStreetMap), sans clé API.
// Politique d'usage : 1 requête par seconde maximum, pas d'autocomplétion.
// On ne lance donc une recherche qu'à la validation, et on espace les appels.

const BASE_URL = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;
let nextSlot = 0;

// Attend le prochain créneau libre avant d'interroger Nominatim
async function throttledFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = now + wait + MIN_INTERVAL_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Recherche indisponible (code ${response.status}).`);
  return response.json();
}

// Choisit le nom le plus parlant (ville, sinon village, région…)
function placeName(address = {}, fallback = '') {
  return address.city || address.town || address.village || address.municipality
    || address.county || address.state || address.region || fallback;
}

function toPlace(item) {
  return {
    nom: placeName(item.address, item.name || item.display_name.split(',')[0]),
    pays: item.address?.country ?? '',
    lat: Number(item.lat),
    lng: Number(item.lon),
    label: item.display_name,
  };
}

// Recherche par nom : renvoie jusqu'à 5 lieux
export async function searchPlaces(query) {
  const params = new URLSearchParams({
    q: query, format: 'jsonv2', addressdetails: '1', limit: '5', 'accept-language': 'fr',
  });
  const results = await throttledFetch(`${BASE_URL}/search?${params}`);
  // Nominatim renvoie parfois deux fois le même lieu (ville + commune) : on dédoublonne
  const seen = new Set();
  return results.map(toPlace).filter((place) => !seen.has(place.label) && seen.add(place.label));
}

// Géocodage inverse : nom du lieu à partir d'un clic sur la carte
export async function reversePlace(lat, lng) {
  const params = new URLSearchParams({
    lat, lon: lng, format: 'jsonv2', addressdetails: '1', zoom: '10', 'accept-language': 'fr',
  });
  const result = await throttledFetch(`${BASE_URL}/reverse?${params}`);
  if (result.error) return { nom: '', pays: '', lat, lng };
  return { ...toPlace(result), lat, lng };
}
