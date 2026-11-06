/**
 * Registros horarios de un día (datos-24hs.php). Las estaciones no registran todas igual: la
 * mayoría cada 15 minutos (96 registros por día), algunas cada 30 (48) y otras cada hora (24).
 * El intervalo se deduce de las horas de los registros del día, en lugar de suponer 15 minutos.
 * No se usa el campo `tiempo` de estaciones.php: es la configuración actual y no siempre coincide
 * (en noviembre de 2026 Los Altos decía 10 y registraba cada hora, y antes 2 veces por hora; Don
 * Vicente decía 30 y registraba cada 15). Deducirlo por día sirve también para fechas pasadas.
 */

/** Fracción de los registros esperados que hace falta para calcular un día (80 de 96, 20 de 24) */
const FRACCION_MINIMA = 5 / 6;

/** "13:45:00" → minutos desde la medianoche */
function minutosDe(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ''));
  return m ? +m[1] * 60 + +m[2] : null;
}

/**
 * Intervalo habitual entre registros del día, en minutos. Se cuenta cuántos registros hay en
 * cada hora del reloj y se toma la mediana: no depende de que estén parejos (Los Altos registra a
 * los :49 y a los :59 de cada hora = 2 por hora) ni se confunde por algún hueco.
 */
export function intervaloMinutos(horas: string[]): number | null {
  const porHora = new Map<number, number>();
  for (const m of horas.map(minutosDe)) {
    if (m !== null) porHora.set(Math.floor(m / 60), (porHora.get(Math.floor(m / 60)) ?? 0) + 1);
  }
  const cuentas = [...porHora.values()].sort((a, b) => a - b);
  if (!cuentas.length) return null;
  const mediana = cuentas[Math.floor(cuentas.length / 2)];
  return 60 / mediana;
}

/** Horas que representa cada registro y si el día tiene registros suficientes para calcular. */
export function evaluarDia(horas: string[], validos: number): { horasPorRegistro: number; suficiente: boolean } {
  const intervalo = intervaloMinutos(horas);
  if (!intervalo) return { horasPorRegistro: 0.25, suficiente: false };
  const esperados = 1440 / intervalo;
  return { horasPorRegistro: intervalo / 60, suficiente: validos >= Math.ceil(esperados * FRACCION_MINIMA) };
}
