/** Categorías de informes, con los mismos nombres que /informes. */
export const CATEGORIAS_INFORME = [
  { value: 'll', label: 'Informes de lluvias' },
  { value: 'he', label: 'Informes de heladas' },
  { value: 'bo', label: 'Boletín agrometeorológico' },
  { value: 'co', label: 'Presentaciones en congresos' },
  { value: 'ad', label: 'Seguimiento de adversidades' },
  { value: 'rv', label: 'Artículos en revistas' },
  { value: 'et', label: 'Estadísticas agrometeorológicas' },
  { value: 'ta', label: 'Talleres y reuniones técnicas' }
];

export function nombreCategoria(valor: string): string {
  return CATEGORIAS_INFORME.find(c => c.value === valor)?.label ?? valor;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface Sugerencia {
  titulo: string;
  categoria?: string;
  /** AAAA-MM-DD */
  creado?: string;
}

/**
 * Título, categoría y fecha a partir del nombre del archivo, con los nombres que se usan para los
 * informes de lluvias:
 *   Lluvias_28_10_2026.pdf              → "Informe de precipitaciones al 28 de octubre de 2026"
 *   Lluvias_23_12_2015_al_27_12_2015.pdf → "Informe de precipitaciones del 23 de diciembre al 27 de diciembre de 2015"
 * La fecha sugerida es el día siguiente al del informe (como se vienen cargando), sin pasar de hoy.
 */
export function sugerirDesdeArchivo(nombreArchivo: string, hoy: string): Sugerencia {
  const base = nombreArchivo.replace(/\.[^.]+$/, '');
  const fecha = (d: string, m: string, a: string) => ({ d: +d, m: +m, a: +a });
  const texto = (f: { d: number; m: number }) => `${f.d} de ${MESES[f.m - 1]}`;
  const valida = (f: { d: number; m: number; a: number }) => f.m >= 1 && f.m <= 12 && f.d >= 1 && f.d <= 31;

  const rango = /^lluvias?[_ -](\d{2})[_ -](\d{2})[_ -](\d{4})[_ -]al[_ -](\d{2})[_ -](\d{2})[_ -](\d{4})$/i.exec(base);
  const dia = /^lluvias?[_ -](\d{2})[_ -](\d{2})[_ -](\d{4})$/i.exec(base);
  let fin: { d: number; m: number; a: number } | null = null;
  let titulo = '';
  if (rango) {
    const ini = fecha(rango[1], rango[2], rango[3]);
    fin = fecha(rango[4], rango[5], rango[6]);
    if (valida(ini) && valida(fin)) {
      titulo = ini.a === fin.a
        ? `Informe de precipitaciones del ${texto(ini)} al ${texto(fin)} de ${fin.a}`
        : `Informe de precipitaciones del ${texto(ini)} de ${ini.a} al ${texto(fin)} de ${fin.a}`;
    }
  } else if (dia) {
    fin = fecha(dia[1], dia[2], dia[3]);
    if (valida(fin)) titulo = `Informe de precipitaciones al ${texto(fin)} de ${fin.a}`;
  }

  if (titulo && fin) {
    const siguiente = new Date(fin.a, fin.m - 1, fin.d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${siguiente.getFullYear()}-${pad(siguiente.getMonth() + 1)}-${pad(siguiente.getDate())}`;
    return { titulo, categoria: 'll', creado: iso > hoy ? hoy : iso };
  }
  return { titulo: base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() };
}
