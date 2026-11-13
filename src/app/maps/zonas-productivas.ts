import * as L from 'leaflet';
import type { Feature } from 'geojson';
import { KmzLayerService } from '../services/kmz-layer.service';
import { ocultarLimiteTucuman } from './mapa-base';
import { leyendaPlegable } from './leyenda-plegable';

/** Zona productiva que se puede superponer en los mapas temáticos (capas KMZ o GeoJSON de assets/shapes). */
export interface ZonaProductiva {
  label: string;
  file: string;
  color: string;
  selected: boolean;
  /** Colorea cada polígono según su propiedad `region` y la muestra al pasar el mouse. */
  porRegion?: boolean;
  layer?: L.GeoJSON;
  leyenda?: L.Control;
}

/**
 * Colores de las regiones agroecológicas, de la sierra a la llanura. Sin azules, celestes ni verdes,
 * que son los de las escalas de lluvia, temperatura y NDVI y los de los marcadores de estaciones.
 */
const COLORES_REGIONES: Record<string, string> = {
  'Serrana': '#762a83',
  'Cuencas y Valles Intermontanos': '#c51b7d',
  'Pedemonte': '#8c510a',
  'Llanura Chaco-Pampeana': '#e08214',
  'Llanura Deprimida': '#4d4d4d',
};

/** Lista nueva (cada mapa guarda su propio estado de selección y sus capas). */
export function crearZonasProductivas(): ZonaProductiva[] {
  return [
    { label: 'Zona Cañera', file: 'cania.kmz', color: '#009e73', selected: false },
    { label: 'Zona Citrícola', file: 'citrus.kmz', color: '#f0e442', selected: false },
    { label: 'Zona de Granos', file: 'soja_maiz.kmz', color: '#d55e00', selected: false },
    { label: 'Zona de Tabaco', file: 'tabaco.kmz', color: '#5b3a1a', selected: false },
    { label: 'Zona Hortícola', file: 'horticola.kmz', color: '#a6d96a', selected: false },
    { label: 'Regiones Agroecológicas', file: 'regiones_agroecologicas.geojson', color: '#6a3d9a', selected: false, porRegion: true },
  ];
}

/** Carga las capas de las zonas en el pane 'zonePane', que cada mapa crea antes de llamar. */
export async function cargarCapasZonas(zonas: ZonaProductiva[], kmzLayerService: KmzLayerService): Promise<void> {
  await Promise.all(zonas.map(async zone => {
    try {
      const data = await kmzLayerService.load(`assets/shapes/${zone.file}`);
      zone.layer = zone.porRegion ? capaPorRegion(data) : L.geoJSON(data, {
        pane: 'zonePane',
        style: {
          color: zone.color,
          weight: 2,
          opacity: 0.9,
          fillColor: zone.color,
          fillOpacity: 0.35
        }
      });
    } catch (error) {
      console.error(`Error al cargar ${zone.file}:`, error);
    }
  }));
}

/** Regiones: borde del color de la región y relleno suave para no tapar el mapa de abajo. */
function capaPorRegion(data: GeoJSON.FeatureCollection): L.GeoJSON {
  const color = (f?: Feature) => COLORES_REGIONES[f?.properties?.['region']] ?? '#333333';
  return L.geoJSON(data, {
    pane: 'zonePane',
    style: f => ({ color: color(f), weight: 2, opacity: 0.9, fillColor: color(f), fillOpacity: 0.12 }),
    onEachFeature: (f, layer) => layer.bindTooltip(f.properties?.['region'] ?? '', { sticky: true })
  });
}

/** Leyenda de las regiones, abajo a la izquierda (la de la variable del mapa va a la derecha). */
function leyendaRegiones(): L.Control {
  const leyenda = new L.Control({ position: 'bottomleft' });
  leyenda.onAdd = () => {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = '<strong>Regiones agroecológicas</strong><br>' + Object.entries(COLORES_REGIONES)
      .map(([region, color]) => `<i style="background:${color}33;box-shadow:inset 0 0 0 2px ${color}"></i> ${region}<br>`)
      .join('');
    return leyendaPlegable(div);
  };
  return leyenda;
}

/** Muestra u oculta la capa de una zona. */
export function alternarZona(map: L.Map | undefined, zone: ZonaProductiva, selected: boolean): void {
  zone.selected = selected;
  if (!map || !zone.layer) return;
  if (zone.porRegion) {
    ocultarLimiteTucuman(map, selected);
    zone.leyenda ??= leyendaRegiones();
    if (selected) zone.leyenda.addTo(map); else zone.leyenda.remove();
  }

  if (selected) {
    zone.layer.addTo(map);
  } else {
    map.removeLayer(zone.layer);
  }
}
