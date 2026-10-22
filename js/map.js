// Carte Leaflet + tuiles OpenStreetMap, et affichage des pins.
/* global L */

let map;
const markers = new Map(); // id de destination → marqueur Leaflet
let activeId = null;

const pinIcon = (active) => L.divIcon({
  className: `pin${active ? ' is-active' : ''}`,
  html: '<span></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 40],
});

export function createMap(element) {
  map = L.map(element, { worldCopyJump: true, zoomControl: true }).setView([35, 10], 3);
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
  markers.forEach((marker) => marker.remove());
  markers.clear();
  for (const destination of destinations) {
    const marker = L.marker([destination.lat, destination.lng], {
      icon: pinIcon(destination.id === activeId),
      title: destination.nom,
      alt: destination.nom,
      keyboard: true,
    });
    marker.bindTooltip(destination.nom, { direction: 'top', offset: [0, -34] });
    marker.on('click', () => onSelect(destination));
    marker.addTo(map);
    markers.set(destination.id, marker);
  }
}

// Met en évidence le pin de la destination ouverte (null = aucun)
export function setActivePin(id) {
  markers.get(activeId)?.setIcon(pinIcon(false));
  activeId = id;
  markers.get(id)?.setIcon(pinIcon(true));
}

export function flyTo(lat, lng, zoom = 9) {
  map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.8 });
}

// Recalcule la taille de la carte (après changement de mise en page)
export function refreshMapSize() {
  map?.invalidateSize();
}
