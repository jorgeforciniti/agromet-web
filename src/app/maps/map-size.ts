import * as L from 'leaflet';

/**
 * Mantiene el tamaño de Leaflet sincronizado con el de su contenedor: cubre la
 * apertura de un diálogo, el cambio de pestaña, la rotación del teléfono y el
 * redimensionado de la ventana, sin depender de setTimeout.
 * Devuelve la función que deja de observar (llamarla antes de map.remove()).
 */
export function seguirTamanioMapa(map: L.Map): () => void {
  if (typeof ResizeObserver === 'undefined') {
    return () => {};
  }
  const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
  observer.observe(map.getContainer());
  return () => observer.disconnect();
}
