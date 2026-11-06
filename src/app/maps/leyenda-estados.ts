import * as L from 'leaflet';
import { leyendaPlegable } from './leyenda-plegable';
import { ETIQUETA_ESTADO, EstadoComunicacion } from '../shared/estado-estacion';

/** Cómo dibuja el mapa sus marcadores, para que las muestras de la referencia coincidan */
export interface EstiloMarcadores {
  /** Color del marcador al día */
  color: string;
  /**
   * 'pin': íconos que se atenúan y pasan a gris sin datos (.marcador--* en styles.css).
   * 'circulo': circleMarker con relleno tenue si está atrasada y hueco punteado sin datos.
   */
  forma: 'pin' | 'circulo';
}

/** Gris de un pin sin datos hoy (el ícono rojo con grayscale y opacidad .5) */
const GRIS_PIN = '#b5b5b5';

/**
 * Referencia plegable de los estados de comunicación de las estaciones (shared/estado-estacion.ts),
 * para los mapas en tiempo real. Cada muestra imita cómo se dibuja ese estado en el mapa.
 */
export function leyendaEstados(estilo: EstiloMarcadores, position: L.ControlPosition = 'bottomright'): L.Control {
  const control = new L.Control({ position });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'info legend leyenda-estados');
    const estados: EstadoComunicacion[] = ['al-dia', 'atrasada', 'sin-datos-hoy'];
    div.innerHTML = '<strong>Último dato</strong>' + estados
      .map(e => `<div class="legend-item"><i class="leyenda-estados__muestra" style="${muestra(e, estilo)}"></i> ${ETIQUETA_ESTADO[e]}</div>`)
      .join('');
    return leyendaPlegable(div);
  };
  return control;
}

function muestra(estado: EstadoComunicacion, { color, forma }: EstiloMarcadores): string {
  if (estado === 'al-dia') return `background:${color}`;
  if (estado === 'atrasada') return `background:${color};opacity:${forma === 'pin' ? .55 : .4}`;
  return forma === 'pin'
    ? `background:${GRIS_PIN}`
    : 'background:#ffffff;border:1.5px dashed #9ca3af';
}
