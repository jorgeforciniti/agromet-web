/**
 * Grados-día de un día a partir de la mínima y la máxima (E1 del informe de mejoras).
 *
 * - Promedio: ((mín(Tmáx, tope) + Tmín) / 2) − base, sin negativos. Es el método histórico de la
 *   herramienta.
 * - Seno simple (Baskerville y Emin, 1969; formulación del UC IPM): la temperatura del día se
 *   aproxima con una onda senoidal entre Tmín y Tmáx y se integra el área entre la base y el tope
 *   (corte horizontal). Suma algo aunque la mínima esté por debajo de la base, cuando el promedio
 *   daría cero o casi nada.
 */
export type MetodoGradosDia = 'promedio' | 'seno';

export function gradosDia(tmin: number, tmax: number, base: number, tope: number, metodo: MetodoGradosDia): number {
  if (metodo === 'promedio') {
    return Math.max(0, (Math.min(tmax, tope) + tmin) / 2 - base);
  }
  return gradosDiaSeno(tmin, tmax, base, tope);
}

export function gradosDiaSeno(tmin: number, tmax: number, base: number, tope: number): number {
  if (tmax < tmin) [tmin, tmax] = [tmax, tmin];
  if (tmin >= tope) return tope - base;              // todo el día por encima del tope
  if (tmax <= base) return 0;                        // todo el día por debajo de la base
  const media = (tmax + tmin) / 2;
  if (tmin >= base && tmax <= tope) return media - base;

  const amplitud = (tmax - tmin) / 2;
  const PI = Math.PI;
  // Ángulos donde la onda cruza la base (θ1) y el tope (θ2)
  const theta1 = tmin < base ? Math.asin((base - media) / amplitud) : -PI / 2;
  const theta2 = tmax > tope ? Math.asin((tope - media) / amplitud) : PI / 2;
  return ((media - base) * (theta2 - theta1) + amplitud * (Math.cos(theta1) - Math.cos(theta2))
    + (tope - base) * (PI / 2 - theta2)) / PI;
}
