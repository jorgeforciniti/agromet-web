import { fechaIso, periodosDe, valorDiario } from '../charts/dias-faltantes';

/*
 * Balance hidrológico seriado decádico (mismo cálculo que bhs.php / traer_bhs.php del sitio anterior).
 *
 * Por década: P = lluvia, EP = evapotranspiración potencial de la estación (suma de los días).
 *   P ≥ EP: Alm = min(Alm anterior + P − EP, CMR); ER = EP; SH = excedente sobre CMR; ER% = 100
 *   P < EP: Alm = Alm anterior · e^(−(EP − P) / CMR); ER = Alm anterior − Alm + P; SH = ER − EP (déficit)
 * Por defecto arranca con 100 mm de almacenaje 18 décadas (unos 6 meses) antes de la primera que
 * se muestra, para que el almacenaje inicial pese poco. Si se conoce el almacenaje al inicio del
 * período (por ejemplo, medido a la siembra), arranca con ese valor en la primera década mostrada.
 *
 * Datos faltantes: una década con algunos días sin dato se calcula con los días que hay y queda
 * marcada como incompleta. Una década sin lluvia o sin EP:
 *  - dentro del período mostrado corta el balance desde ahí (el almacenaje queda desconocido);
 *  - en la estabilización, el balance vuelve a empezar con 100 mm después del hueco.
 */

export const CMR = 300;
export const ALMACENAJE_INICIAL = 100;
export const DECADAS_ESTABILIZACION = 18;

export type EstadoDecada = 'completa' | 'incompleta' | 'sin-datos' | 'cortada';

export interface DecadaBalance {
  clave: string;
  /** "1ª ene 2026" */
  etiqueta: string;
  desde: string;
  hasta: string;
  dias: number;
  diasLluvia: number;
  diasEp: number;
  lluvia: number | null;
  ep: number | null;
  pMenosEp: number | null;
  almacenaje: number | null;
  /** Situación hídrica: excedente (+) o déficit (−) */
  situacion: number | null;
  erReal: number | null;
  /** ER / EP en % */
  erRelativa: number | null;
  estado: EstadoDecada;
}

export interface ResultadoBalance {
  decadas: DecadaBalance[];
  /** Primer día del cálculo (con la estabilización) */
  inicioCalculo: string;
  /** Si hubo que reiniciar el balance en la estabilización por falta de datos: desde qué día */
  reinicio: string | null;
  /** Primer día del período mostrado sin datos, si el balance se cortó */
  corte: string | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Primer día de la década que contiene la fecha, corrida n décadas (n negativo: hacia atrás). */
export function inicioDeDecada(fecha: Date, n = 0): Date {
  const dec = fecha.getDate() <= 10 ? 0 : fecha.getDate() <= 20 ? 1 : 2;
  const indice = fecha.getFullYear() * 36 + fecha.getMonth() * 3 + dec + n;
  const anio = Math.floor(indice / 36), resto = indice - anio * 36;
  return new Date(anio, Math.floor(resto / 3), [1, 11, 21][resto % 3]);
}

export interface OpcionesBalance {
  /** mm al arrancar el cálculo (0 a CMR) */
  almacenajeInicial: number;
  /** true: arranca 18 décadas antes para estabilizar; false: arranca en la primera década mostrada */
  estabilizar: boolean;
}

export const OPCIONES_POR_DEFECTO: OpcionesBalance = { almacenajeInicial: ALMACENAJE_INICIAL, estabilizar: true };

/** Primer día a pedir a la API según las opciones. */
export function inicioDelCalculo(desde: Date, opciones: OpcionesBalance): Date {
  return inicioDeDecada(desde, opciones.estabilizar ? -DECADAS_ESTABILIZACION : 0);
}

/**
 * @param registros datos diarios por fecha (datos-diarios.php), desde inicioCalculo hasta el final
 * @param fechas calendario completo desde inicioCalculo hasta el último día a calcular
 * @param primeraMostrada primer día del período pedido (las décadas anteriores sólo estabilizan)
 */
export function calcularBalance(registros: Map<string, object>, fechas: string[], primeraMostrada: Date,
  opciones: OpcionesBalance = OPCIONES_POR_DEFECTO): ResultadoBalance {
  const inicioMostrado = fechaIso(inicioDeDecada(primeraMostrada));
  const decadas: DecadaBalance[] = [];
  let almAnterior: number | null = Math.min(Math.max(opciones.almacenajeInicial, 0), CMR);
  let reinicio: string | null = null;
  let corte: string | null = null;

  for (const p of periodosDe(fechas, 'decadico')) {
    const desde = p.fechas[0], hasta = p.fechas[p.fechas.length - 1];
    const mostrada = desde >= inicioMostrado;
    const lluvias = p.fechas.map(f => valorDiario(registros.get(f), 'rr_24')).filter((v): v is number => v !== null);
    const eps = p.fechas.map(f => valorDiario(registros.get(f), 'et')).filter((v): v is number => v !== null);
    const dec = Number(desde.slice(8, 10)) <= 10 ? 1 : Number(desde.slice(8, 10)) <= 20 ? 2 : 3;
    const fila: DecadaBalance = {
      clave: p.clave,
      etiqueta: `${dec}ª ${MESES[Number(desde.slice(5, 7)) - 1]} ${desde.slice(0, 4)}`,
      desde, hasta,
      dias: p.fechas.length,
      diasLluvia: lluvias.length,
      diasEp: eps.length,
      lluvia: lluvias.length ? lluvias.reduce((a, b) => a + b, 0) : null,
      ep: eps.length ? eps.reduce((a, b) => a + b, 0) : null,
      pMenosEp: null, almacenaje: null, situacion: null, erReal: null, erRelativa: null,
      estado: 'completa'
    };

    if (fila.lluvia === null || fila.ep === null) {
      fila.estado = 'sin-datos';
      if (mostrada) {
        corte ??= desde;
      } else {
        // Hueco en la estabilización: se reinicia con el almacenaje inicial después
        almAnterior = null;
      }
    } else {
      fila.pMenosEp = fila.lluvia - fila.ep;
      if (corte) {
        fila.estado = 'cortada';
      } else {
        if (almAnterior === null) {
          almAnterior = Math.min(Math.max(opciones.almacenajeInicial, 0), CMR);
          reinicio = desde;
        }
        const r = paso(fila.lluvia, fila.ep, almAnterior);
        Object.assign(fila, r);
        almAnterior = r.almacenaje;
        fila.estado = fila.diasLluvia < fila.dias || fila.diasEp < fila.dias ? 'incompleta' : 'completa';
      }
    }
    if (mostrada) decadas.push(fila);
  }

  return { decadas, inicioCalculo: fechas[0] ?? inicioMostrado, reinicio, corte };
}

/** Un paso del balance (fórmulas de traer_bhs.php). */
function paso(p: number, ep: number, almAnterior: number) {
  const prueba = p + almAnterior - ep;
  if (p < ep) {
    const almacenaje = almAnterior * Math.exp(-(ep - p) / CMR);
    const erReal = almAnterior - almacenaje + p;
    return { almacenaje, erReal, situacion: erReal - ep, erRelativa: ep > 0 ? erReal / ep * 100 : 100 };
  }
  return {
    almacenaje: Math.min(prueba, CMR),
    erReal: ep,
    situacion: prueba > CMR ? prueba - CMR : 0,
    erRelativa: 100
  };
}
