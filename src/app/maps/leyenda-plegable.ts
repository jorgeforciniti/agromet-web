import * as L from 'leaflet';

/** Por debajo de este ancho las leyendas arrancan plegadas para no tapar el mapa. */
const CONSULTA_CELULAR = '(max-width: 620px)';

/**
 * Convierte la caja de una leyenda de Leaflet en una persiana: un clic (o Enter/Espacio) la
 * pliega hasta dejar sólo el título, que tiene que ser lo primero del contenido. Funciona aunque
 * el contenido se reescriba después con innerHTML, porque el estado vive en la clase del div.
 * Estilo: .leyenda-plegable en styles.css. Devuelve el mismo div para usarlo en `onAdd`.
 */
export function leyendaPlegable(div: HTMLElement): HTMLElement {
  div.classList.add('leyenda-plegable');
  div.tabIndex = 0;
  div.setAttribute('role', 'button');
  div.title = 'Mostrar u ocultar las referencias';

  const aplicar = (plegada: boolean) => {
    div.classList.toggle('plegada', plegada);
    div.setAttribute('aria-expanded', String(!plegada));
  };
  aplicar(typeof window !== 'undefined' && window.matchMedia?.(CONSULTA_CELULAR).matches);

  // Sin esto el clic y la rueda también llegan al mapa (arrastre, zoom, popups).
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  div.addEventListener('click', () => aplicar(!div.classList.contains('plegada')));
  div.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      aplicar(!div.classList.contains('plegada'));
    }
  });
  return div;
}
