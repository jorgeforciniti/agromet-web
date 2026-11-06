import * as L from 'leaflet';
import { formatDecimal } from '../pipes/valor.pipe';
import { estadoComunicacion, textoActualizado } from '../shared/estado-estacion';

/*
 * Popup común de las estaciones en los mapas (B2 del informe de mejoras): nombre, ubicación,
 * filas de valores (con la normal y el desvío cuando existen), registros del período, hora del
 * último dato y el botón «Ver ficha». Estilo: .station-popup y .popup-* en styles.css.
 */

export interface FilaPopup {
  etiqueta: string;
  valor: string;
  /** El valor principal del mapa: va en negrita. */
  destacada?: boolean;
}

/** Estación a la que lleva «Ver ficha»: por id si se conoce; si no, por coordenadas. */
export interface RefFicha {
  id?: string;
  lat: number;
  lon: number;
}

export interface DatosPopup {
  titulo: string;
  /** Localidad, coordenadas, etc., en gris debajo del título (puede tener varias líneas). */
  subtitulos?: string[];
  filas: FilaPopup[];
  /** Días con datos sobre los días del período. */
  registros?: { cantidad: number; total: number };
  /** Fecha del último dato: el texto «hace X min» con el color de su estado. */
  actualizado?: Date | null;
  ficha?: RefFicha;
  /** Botones propios de una sección, antes de «Ver ficha» (la favorita de la Red). */
  botonesExtra?: string;
}

/** Los nombres vienen de la base de datos y se insertan como HTML. */
export function escaparHtml(texto: unknown): string {
  return String(texto ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c]);
}

/**
 * Filas de un valor con su normal: «Normal» y «Desvío» con signo y porcentaje de la normal.
 * Sin normal válida devuelve sólo la fila del valor.
 */
export function filasConNormal(etiqueta: string, valor: number, normal: number | null | undefined, unidad: string, decimales = 1): FilaPopup[] {
  const filas: FilaPopup[] = [{ etiqueta, valor: `${formatDecimal(valor, decimales)} ${unidad}`, destacada: true }];
  if (normal == null || !Number.isFinite(normal) || normal <= 0) return filas;
  const desvio = valor - normal;
  const signo = desvio > 0 ? '+' : desvio < 0 ? '−' : '';
  filas.push(
    { etiqueta: 'Normal', valor: `${formatDecimal(normal, decimales)} ${unidad}` },
    { etiqueta: 'Desvío', valor: `${signo}${formatDecimal(Math.abs(desvio), decimales)} ${unidad} (${formatDecimal((valor / normal) * 100, 0)} % de la normal)` }
  );
  return filas;
}

/** Completo / faltan menos del 10 % / hasta el 20 % / más: mismos cortes que tenía el mapa de temperatura. */
function claseRegistros(cantidad: number, total: number): string {
  const faltan = total > 0 ? ((total - cantidad) / total) * 100 : 0;
  if (faltan <= 0) return 'completo';
  if (faltan < 10) return 'casi';
  if (faltan <= 20) return 'incompleto';
  return 'escaso';
}

export function popupEstacion(d: DatosPopup): string {
  const subtitulos = (d.subtitulos ?? []).filter(Boolean)
    .map(s => `<div class="popup-location">${escaparHtml(s)}</div>`).join('');
  const filas = d.filas
    .map(f => `<div${f.destacada ? ' class="popup-destacada"' : ''}>${escaparHtml(f.etiqueta)}: ${escaparHtml(f.valor)}</div>`)
    .join('');
  const registros = d.registros
    ? `<div class="popup-registros popup-registros--${claseRegistros(d.registros.cantidad, d.registros.total)}">` +
      `Registros: ${d.registros.cantidad} de ${d.registros.total} días</div>`
    : '';
  const actualizado = d.actualizado !== undefined
    ? `<div class="popup-actualizado popup-actualizado--${estadoComunicacion(d.actualizado)}">${textoActualizado(d.actualizado)}</div>`
    : '';
  const ficha = d.ficha
    ? `<button type="button" class="popup-ficha"${d.ficha.id ? ` data-id="${escaparHtml(d.ficha.id)}"` : ''}` +
      ` data-lat="${d.ficha.lat}" data-lon="${d.ficha.lon}">Ver ficha</button>`
    : '';
  const botones = d.botonesExtra || ficha ? `<div class="popup-botones">${d.botonesExtra ?? ''}${ficha}</div>` : '';
  return `<div class="station-popup"><h4>${escaparHtml(d.titulo)}</h4>${subtitulos}` +
    `<div class="popup-grid">${filas}</div>${registros}${actualizado}${botones}</div>`;
}

/** Lo que necesitan los botones «Ver ficha» (FichaEstacionService). */
export interface BuscadorFicha {
  buscar(ref: RefFicha): Promise<unknown>;
  abrirPorReferencia(ref: RefFicha): Promise<void>;
}

function leerRef(boton: HTMLElement): RefFicha {
  return { id: boton.dataset['id'], lat: Number(boton.dataset['lat']), lon: Number(boton.dataset['lon']) };
}

/**
 * Atiende los botones «Ver ficha» de los popups del mapa (el contenido del popup es HTML de
 * Leaflet, fuera de Angular). El botón arranca oculto y se muestra sólo si el punto es una
 * estación de la red: los mapas de lluvia también tienen pluviómetros, que no tienen ficha.
 * La Red de estaciones tiene su propio manejador.
 */
export function conectarBotonesFicha(map: L.Map, ficha: BuscadorFicha): void {
  map.on('popupopen', (e: L.PopupEvent) => {
    const boton = e.popup.getElement()?.querySelector<HTMLElement>('.popup-ficha');
    if (!boton) return;
    boton.hidden = true;
    void ficha.buscar(leerRef(boton)).then(estacion => {
      if (!estacion) return;
      boton.hidden = false;
      e.popup.update();
    });
  });
  L.DomEvent.on(map.getContainer(), 'click', (e: Event) => {
    const boton = (e.target as HTMLElement).closest<HTMLElement>('.popup-ficha');
    if (boton) void ficha.abrirPorReferencia(leerRef(boton));
  });
}
