import * as L from 'leaflet';
import { KmzLayerService } from '../services/kmz-layer.service';

/** Zona productiva que se puede superponer en los mapas temáticos (capas KMZ de assets/shapes). */
export interface ZonaProductiva {
  label: string;
  file: string;
  color: string;
  selected: boolean;
  layer?: L.GeoJSON;
}

/** Lista nueva (cada mapa guarda su propio estado de selección y sus capas). */
export function crearZonasProductivas(): ZonaProductiva[] {
  return [
    { label: 'Zona Cañera', file: 'cania.kmz', color: '#f48fb1', selected: false },
    { label: 'Zona Citrícola', file: 'citrus.kmz', color: '#fbc02d', selected: false },
    { label: 'Zona de Granos', file: 'soja_maiz.kmz', color: '#ef6c00', selected: false },
    { label: 'Zona de Tabaco', file: 'tabaco.kmz', color: '#795548', selected: false },
    { label: 'Zona Hortícola', file: 'horticola.kmz', color: '#d32f2f', selected: false },
  ];
}

/** Carga las capas de las zonas en el pane 'zonePane', que cada mapa crea antes de llamar. */
export async function cargarCapasZonas(zonas: ZonaProductiva[], kmzLayerService: KmzLayerService): Promise<void> {
  await Promise.all(zonas.map(async zone => {
    try {
      const data = await kmzLayerService.load(`assets/shapes/${zone.file}`);
      zone.layer = L.geoJSON(data, {
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

/** Muestra u oculta la capa de una zona. */
export function alternarZona(map: L.Map | undefined, zone: ZonaProductiva, selected: boolean): void {
  zone.selected = selected;
  if (!map || !zone.layer) return;

  if (selected) {
    zone.layer.addTo(map);
  } else {
    map.removeLayer(zone.layer);
  }
}
