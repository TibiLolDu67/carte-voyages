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

// Roadtrips : tracé visible seulement à partir de ce zoom (pour ne pas charger la vue monde)
const ROADTRIP_MIN_ZOOM = 5;
const DEFAULT_ROADTRIP_COLOR = '#111827';
let roadtripLayer = null;

// ring = couleur du roadtrip : le pin reçoit alors un contour de cette couleur
// step = numéro(s) d'étape affichés sur le pin quand on zoome (ex. « 1·8 »)
const pinIcon = ({ color, ring, step }, active) => L.divIcon({
  className: `pin${active ? ' is-active' : ''}${ring ? ' in-roadtrip' : ''}`,
  html: `<span style="background:${safeColor(color)}${ring ? `;border-color:${ring}` : ''}"></span>`
    + (step ? `<b class="pin-step" style="background:${ring}">${step}</b>` : ''),
  iconSize: [44, 44],
  iconAnchor: [22, 40],
});

export const roadtripColor = (roadtrip) =>
  (/^#[0-9a-f]{6}$/.test(roadtrip?.couleur ?? '') ? roadtrip.couleur : DEFAULT_ROADTRIP_COLOR);

// Étapes d'un roadtrip dans l'ordre choisi (positions 1, 2, 3…), doublons compris
export function roadtripStops(destinations, roadtrip) {
  const byId = new Map(destinations.map((d) => [d.id, d]));
  return [...(roadtrip?.roadtrip_etapes ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((etape) => byId.get(etape.destination_id))
    .filter(Boolean);
}

// Affiche ou masque tracés et numéros d'étape selon le zoom
function updateRoadtripVisibility() {
  const visible = map.getZoom() >= ROADTRIP_MIN_ZOOM;
  map.getContainer().classList.toggle('show-roadtrip-steps', visible);
  if (!roadtripLayer) return;
  if (visible && !map.hasLayer(roadtripLayer)) roadtripLayer.addTo(map);
  if (!visible && map.hasLayer(roadtripLayer)) roadtripLayer.remove();
}

export function createMap(element) {
  map = L.map(element, { worldCopyJump: true, zoomControl: true }).setView([35, 10], 3);
  // Tuiles d'OpenStreetMap France (sans clé) : noms de lieux en français partout
  // (« Allemagne », « Venise »…). Couleurs adoucies en CSS (.leaflet-tile-pane).
  const frenchTiles = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, fond <a href="https://www.openstreetmap.fr/">OSM France</a>',
  }).addTo(map);

  // Secours : si le serveur français ne répond pas, on bascule sur les tuiles OSM standard
  let loaded = 0;
  let failed = 0;
  frenchTiles.on('tileload', () => { loaded += 1; });
  frenchTiles.on('tileerror', () => {
    failed += 1;
    if (failed === 6 && loaded === 0) {
      frenchTiles.remove();
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    }
  });
  map.on('zoomend', updateRoadtripVisibility);
  return map;
}

export function onMapClick(callback) {
  map.on('click', (event) => callback(event.latlng));
}

// Remplace tous les pins et tracés de roadtrip par ceux fournis
export function renderPins(destinations, roadtrips, onSelect) {
  markers.forEach(({ marker }) => marker.remove());
  markers.clear();

  // Pour chaque destination : son (premier) roadtrip et ses numéros d'étape dans celui-ci
  const membership = new Map();
  for (const roadtrip of roadtrips) {
    for (const etape of [...roadtrip.roadtrip_etapes].sort((a, b) => a.position - b.position)) {
      const entry = membership.get(etape.destination_id) ?? { roadtrip, steps: [] };
      if (entry.roadtrip === roadtrip) entry.steps.push(etape.position);
      membership.set(etape.destination_id, entry);
    }
  }

  for (const destination of destinations) {
    const { roadtrip, steps } = membership.get(destination.id) ?? {};
    const style = {
      color: destination.couleur,
      ring: roadtrip ? roadtripColor(roadtrip) : null,
      step: steps?.join('·'),
    };
    const marker = L.marker([destination.lat, destination.lng], {
      icon: pinIcon(style, destination.id === activeId),
      title: destination.nom,
      alt: destination.nom,
      keyboard: true,
    });
    const label = roadtrip ? `${destination.nom} · ${roadtrip.nom}` : destination.nom;
    marker.bindTooltip(label, { direction: 'top', offset: [0, -34] });
    marker.on('click', () => onSelect(destination));
    marker.addTo(map);
    markers.set(destination.id, { marker, style });
  }

  // Tracé en pointillés légers reliant les étapes de chaque roadtrip
  roadtripLayer?.remove();
  roadtripLayer = L.layerGroup();
  for (const roadtrip of roadtrips) {
    const stops = roadtripStops(destinations, roadtrip);
    if (stops.length < 2) continue;
    L.polyline(stops.map((d) => [d.lat, d.lng]), {
      color: roadtripColor(roadtrip),
      weight: 3,
      opacity: 0.6,
      dashArray: '1 9',
      lineCap: 'round',
      lineJoin: 'round',
    }).bindTooltip(roadtrip.nom, { sticky: true }).addTo(roadtripLayer);
  }
  updateRoadtripVisibility();
}

// Met en évidence le pin de la destination ouverte (null = aucun)
export function setActivePin(id) {
  const previous = markers.get(activeId);
  previous?.marker.setIcon(pinIcon(previous.style, false));
  activeId = id;
  const next = markers.get(id);
  next?.marker.setIcon(pinIcon(next.style, true));
}

// Cadre la carte sur toutes les étapes d'un roadtrip
export function fitStops(stops) {
  if (stops.length) map.flyToBounds(stops.map((d) => [d.lat, d.lng]), { padding: [60, 60], maxZoom: 9, duration: 0.8 });
}

export function flyTo(lat, lng, zoom = 9) {
  map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.8 });
}

// Recalcule la taille de la carte (après changement de mise en page)
export function refreshMapSize() {
  map?.invalidateSize();
}
