/*
 * Armado y descarga de CSV común a todo el sitio: ";" y coma decimal (lo que espera Excel en
 * castellano), UTF-8 con BOM y, al pie, el aviso de datos provisorios y la fuente.
 * Lo usan los gráficos (exportar-grafico.component.ts) y las tablas con descarga permitida.
 */
import { fechaIso } from './enlace-consulta';
import { FUENTE_NOMBRE, FUENTE_URL } from './fuente';

/** Valor de una celda: números con hasta 2 decimales y coma; texto entre comillas si hace falta. */
export function celdaCsv(v: unknown): string {
  if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '';
  // Hasta 2 decimales: las sumas de los gráficos arrastran restos de punto flotante (229,34000000000006)
  if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
  if (typeof v === 'object' && 'y' in (v as object)) return celdaCsv((v as { y: unknown }).y);
  const texto = Array.isArray(v) ? v.join(' ') : String(v);
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Descarga `nombre_AAAA-MM-DD.csv` con las filas dadas (cada celda pasa por celdaCsv) y, al pie,
 * las notas propias de la descarga, el aviso de datos provisorios y la fuente.
 */
export function descargarCsv(nombre: string, filas: unknown[][], notas: string[] = []): void {
  const lineas = filas.map(f => f.map(celdaCsv).join(';'));
  lineas.push('');
  for (const nota of [...notas, 'Los datos son de carácter provisorio y pueden estar sujetos a revisión.',
    `Fuente: ${FUENTE_NOMBRE} - ${FUENTE_URL}`]) {
    lineas.push(celdaCsv(nota));
  }
  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM: Excel lo abre como UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}_${fechaIso(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
