/*
 * Colores de la lluvia como porcentaje de la normal (paleta RdYlBu, apta para daltonismo).
 * La usan Lluvias mensuales y Lluvia acumulada, para que el mismo color diga lo mismo en ambos.
 */

export interface ClasePorcentajeNormal {
  /** Límite superior de la clase (proporción de la normal: 1 = 100 %). */
  hasta: number;
  color: string;
  etiqueta: string;
}

export const CLASES_PORCENTAJE_NORMAL: ClasePorcentajeNormal[] = [
  { hasta: 0.33, color: '#d73027', etiqueta: '< 33%' },
  { hasta: 0.66, color: '#fc8d59', etiqueta: '33 a < 66%' },
  { hasta: 1.0, color: '#fee090', etiqueta: '66 a < 100%' },
  { hasta: 1.5, color: '#e0f3f8', etiqueta: '100 a < 150%' },
  { hasta: 2.0, color: '#91bfdb', etiqueta: '150 a < 200%' },
  { hasta: Infinity, color: '#4575b4', etiqueta: '≥ 200%' }
];

/** Gris de los puntos sin normal. */
export const COLOR_SIN_NORMAL = '#808080';

export function colorPorcentajeNormal(valor: number, normal: number | null | undefined): string {
  if (normal == null || !(normal > 0)) return COLOR_SIN_NORMAL;
  const proporcion = valor / normal;
  // Intervalos semiabiertos sin huecos, iguales a los de Lluvias por campaña
  const clase = CLASES_PORCENTAJE_NORMAL.find(c => proporcion < c.hasta);
  return (clase ?? CLASES_PORCENTAJE_NORMAL[CLASES_PORCENTAJE_NORMAL.length - 1]).color;
}

/** Filas de la leyenda (después del título), con el cuadrado de color de cada clase. */
export function filasLeyendaPorcentajeNormal(conSinNormal = false): string {
  const cuadro = (color: string) =>
    `<i style="background:${color}; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i>`;
  const filas = CLASES_PORCENTAJE_NORMAL.map(c => `${cuadro(c.color)} ${c.etiqueta.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br>`);
  if (conSinNormal) filas.push(`${cuadro(COLOR_SIN_NORMAL)} Sin normal cercana<br>`);
  return filas.join('');
}
