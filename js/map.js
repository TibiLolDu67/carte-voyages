// Carte Leaflet + tuiles OpenStreetMap, et affichage des pins.
/* global L */

let map;
const markers = new Map(); // id de destination → { marker, color }
let activeId = null;

// Couleurs proposées pour les pins (valeurs autorisées par la base : #rrggbb)
// (une couleur personnalisée reste possible en plus de cette liste)
export const PIN_COLORS = [
  { value: '#c2410c', label: 'Orange brûlé' },
  { value: '#f97316', label: 'Orange vif' },
  { value: '#dc2626', label: 'Rouge' },
  { value: '#9f1239', label: 'Bordeaux' },
  { value: '#db2777', label: 'Rose' },
  { value: '#f472b6', label: 'Rose clair' },
  { value: '#c026d3', label: 'Fuchsia' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#4338ca', label: 'Indigo' },
  { value: '#2563eb', label: 'Bleu' },
  { value: '#38bdf8', label: 'Bleu ciel' },
  { value: '#0891b2', label: 'Turquoise' },
  { value: '#0d9488', label: 'Bleu canard' },
  { value: '#16a34a', label: 'Vert' },
  { value: '#84cc16', label: 'Vert pomme' },
  { value: '#166534', label: 'Vert sapin' },
  { value: '#facc15', label: 'Jaune' },
  { value: '#ca8a04', label: 'Moutarde' },
  { value: '#92400e', label: 'Marron' },
  { value: '#4b5563', label: 'Gris' },
  { value: '#111827', label: 'Noir' },
];
export const DEFAULT_PIN_COLOR = PIN_COLORS[0].value;

// N'accepte qu'une couleur #rrggbb (sinon couleur par défaut)
const safeColor = (color) => (/^#[0-9a-f]{6}$/.test(color ?? '') ? color : DEFAULT_PIN_COLOR);

const pinIcon = (color, active) => L.divIcon({
  className: `pin${active ? ' is-active' : ''}`,
  html: `<span style="background:${safeColor(color)}"></span>`,
  iconSize: [44, 44],
  iconAnchor: [22, 40],
});

export function createMap(element) {
  map = L.map(element, { worldCopyJump: true, zoomControl: true }).setView([35, 10], 3);
  // Tuiles OpenStreetMap (sans clé) ; leurs couleurs sont adoucies en CSS (.leaflet-tile-pane)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

export function onMapClick(callback) {
  map.on('click', (event) => callback(event.latlng));
}

// Remplace tous les pins par la liste fournie
export function renderPins(destinations, onSelect) {
  markers.forEach(({ marker }) => marker.remove());
  markers.clear();
  for (const destination of destinations) {
    const marker = L.marker([destination.lat, destination.lng], {
      icon: pinIcon(destination.couleur, destination.id === activeId),
      title: destination.nom,
      alt: destination.nom,
      keyboard: true,
    });
    marker.bindTooltip(destination.nom, { direction: 'top', offset: [0, -34] });
    marker.on('click', () => onSelect(destination));
    marker.addTo(map);
    markers.set(destination.id, { marker, color: destination.couleur });
  }
}

// Met en évidence le pin de la destination ouverte (null = aucun)
export function setActivePin(id) {
  const previous = markers.get(activeId);
  previous?.marker.setIcon(pinIcon(previous.color, false));
  activeId = id;
  const next = markers.get(id);
  next?.marker.setIcon(pinIcon(next.color, true));
}

export function flyTo(lat, lng, zoom = 9) {
  map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.8 });
}

// Recalcule la taille de la carte (après changement de mise en page)
export function refreshMapSize() {
  map?.invalidateSize();
}
