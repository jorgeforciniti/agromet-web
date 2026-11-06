import * as L from 'leaflet';

/** Provincia de Tucumán: vista inicial de los mapas del sitio. */
export const LIMITES_TUCUMAN = L.latLngBounds(
  L.latLng(-26.05, -66.2),
  L.latLng(-28.03, -64.48)
);

/**
 * Zoom inicial común a todos los mapas. Es fijo (no se calcula con fitBounds) para que todos
 * se vean a la misma escala. Con zoom 8 la provincia ocupa unos 320 × 410 px: por eso los
 * contenedores de los mapas miden como mínimo 480 px de alto (en el CSS de cada componente).
 */
export const ZOOM_TUCUMAN = 8;

/**
 * Centra la provincia con ZOOM_TUCUMAN. Se llama una sola vez, al crear el mapa: después la
 * vista queda donde la deje el usuario (sin maxBounds ni reencuadres al llegar datos).
 * Si el contenedor todavía no tiene tamaño (diálogos), seguirTamanioMapa llama a
 * invalidateSize cuando lo tenga, y Leaflet conserva el centro.
 */
export function encuadrarTucuman(map: L.Map): void {
  map.setView(LIMITES_TUCUMAN.getCenter(), ZOOM_TUCUMAN, { animate: false });
}
