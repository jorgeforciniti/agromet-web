import { LocalidadRr } from '../../services/admin-api.service';

/** Los mismos valores que server/admin/api/config.php. */
export const LIMITE_LLUVIA_DIA = 500;
export const AVISO_LLUVIA_DIA = 150;
export const LIMITE_LLUVIA_MES = 2000;
export const AVISO_LLUVIA_MES = 800;
export const LLUVIAS_DESDE = 1900;

export const MESES_RR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MESES_LARGOS_RR = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre'];

/** Minúsculas y sin acentos, para buscar «famailla» o «FAMAILLÁ» igual. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Localidades que coinciden con lo tipeado: un número busca por número (primero la exacta); un texto,
 * en cualquier parte del nombre (primero las que empiezan así).
 */
export function buscarLocalidades(lista: LocalidadRr[], texto: string, proveedor = '', max = 8): LocalidadRr[] {
  const t = normalizar(texto);
  const candidatas = proveedor ? lista.filter(l => l.proveedor === proveedor) : lista;
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return candidatas.filter(l => String(l.id).startsWith(t))
      .sort((a, b) => Number(b.id === n) - Number(a.id === n) || a.id - b.id)
      .slice(0, max);
  }
  const empiezan: LocalidadRr[] = [];
  const contienen: LocalidadRr[] = [];
  for (const l of candidatas) {
    const nombre = normalizar(l.nombre);
    if (nombre.startsWith(t)) empiezan.push(l);
    else if (nombre.includes(t)) contienen.push(l);
  }
  return [...empiezan, ...contienen].slice(0, max);
}

/** mm con un decimal como máximo (admite coma); null si está vacío; undefined si no es válido. */
export function leerMm(texto: string): number | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d)?$/.test(t)) return undefined;
  return Number(t);
}

export function escribirMm(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : v.toFixed(1).replace('.', ',');
}

/** Proveedores presentes en la lista, ordenados. */
export function proveedores(lista: LocalidadRr[]): string[] {
  return [...new Set(lista.map(l => l.proveedor).filter(p => p))].sort();
}

/** dd/mm/aaaa */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
