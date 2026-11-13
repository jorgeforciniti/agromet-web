import * as L from 'leaflet';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Feature, FeatureCollection, GeoJsonObject, Position } from 'geojson';

/*
 * Mapa base común (B3 del informe de mejoras): calles de OpenStreetMap o imagen satelital de
 * Esri, con el control de capas de Leaflet arriba a la derecha, y el límite de las provincias.
 * Reemplaza las copias de las URL, atribuciones y desplegables «Mapa Base» de cada mapa.
 */

/**
 * zIndex 0: el mapa base queda debajo de cualquier otra capa de mosaicos que se agregue
 * después en el tilePane (capas del visor de Estado actual, NDVI), aunque se cambie de base.
 */
function capaCalles(): L.TileLayer {
  // Sin subdominios a/b/c: OpenStreetMap pide usar sólo tile.openstreetmap.org (HTTP/2).
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 19,
    zIndex: 0
  });
}

/** Esri tiene imágenes hasta el nivel 18 en la zona; más cerca se amplían los mosaicos. */
function capaSatelital(): L.TileLayer {
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imágenes &copy; Esri',
    maxNativeZoom: 18,
    maxZoom: 19,
    zIndex: 0
  });
}

/**
 * Agrega el mapa de calles. Con `selector` (por defecto) agrega también el control para pasar a
 * la imagen satelital y lo devuelve, para sumarle capas superpuestas (ver cargarProvincias).
 * Los mapas chicos de una sola estación (ficha, lluvias por campaña) van sin selector.
 */
export function agregarMapaBase(map: L.Map, { selector = true } = {}): L.Control.Layers | undefined {
  const calles = capaCalles().addTo(map);
  if (!selector) return undefined;
  return L.control.layers(
    { 'Calles': calles, 'Satelital': capaSatelital() },
    undefined,
    { position: 'topright' }
  ).addTo(map);
}

/** Estilo común del límite provincial. */
export const ESTILO_PROVINCIAS: L.PathOptions = {
  color: 'blue',
  weight: 1,
  opacity: 0.8,
  fillOpacity: 0
};

/**
 * Dibuja el límite de las provincias en un pane propio, sin capturar clics (no tapa los
 * marcadores ni abre popups con el nombre). Si se pasa el control de capas, se puede ocultar
 * desde ahí. `zIndex`: 350 lo deja debajo de las capas superpuestas (400); el visor de Estado
 * actual lo sube para que el límite se vea sobre sus capas de lluvia, nubes, etc.
 */
export async function cargarProvincias(
  map: L.Map,
  http: HttpClient,
  { control, zIndex = 350 }: { control?: L.Control.Layers; zIndex?: number } = {}
): Promise<L.GeoJSON | undefined> {
  try {
    const datos = await firstValueFrom(http.get<GeoJsonObject>('assets/shapes/provincias.geojson'));
    if (!map.getPane('provincePane')) map.createPane('provincePane').style.zIndex = String(zIndex);
    const capa = L.geoJSON(datos, { pane: 'provincePane', interactive: false, style: ESTILO_PROVINCIAS });
    const sinTucuman = L.geoJSON(limitesSinTucuman(datos as FeatureCollection), {
      pane: 'provincePane', interactive: false, style: ESTILO_PROVINCIAS
    });
    // El grupo es lo que se prende y apaga desde el control; adentro va una de las dos versiones.
    const grupo = L.featureGroup([capa]).addTo(map);
    limitesPorMapa.set(map, { grupo, completa: capa, sinTucuman });
    control?.addOverlay(grupo, 'Límites provinciales');
    return capa;
  } catch (error) {
    console.error('Error al cargar provincias:', error);
    return undefined;
  }
}

/** Las dos versiones del límite provincial de cada mapa (ver ocultarLimiteTucuman). */
const limitesPorMapa = new WeakMap<L.Map, { grupo: L.FeatureGroup; completa: L.GeoJSON; sinTucuman: L.GeoJSON }>();

/**
 * Saca o repone el borde de Tucumán en el límite provincial. Se usa con la capa de regiones
 * agroecológicas, cuyo contorno no coincide exactamente con el del IGN y lo reemplaza.
 */
export function ocultarLimiteTucuman(map: L.Map | undefined, ocultar: boolean): void {
  const limites = map && limitesPorMapa.get(map);
  if (!limites) return;
  const { grupo, completa, sinTucuman } = limites;
  grupo.clearLayers().addLayer(ocultar ? sinTucuman : completa);
}

/**
 * Las provincias como líneas, sin Tucumán ni los tramos que las vecinas comparten con ella
 * (en el archivo del IGN los vértices del borde común son exactamente los mismos).
 */
function limitesSinTucuman(datos: FeatureCollection): FeatureCollection {
  const anillos = (f: Feature): Position[][] =>
    f.geometry.type === 'Polygon' ? f.geometry.coordinates
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat() : [];
  const tucuman = datos.features.find(f => f.properties?.['nam'] === 'Tucumán');
  const borde = new Set(tucuman ? anillos(tucuman).flat().map(p => p.join(',')) : []);
  const enBorde = (p: Position) => borde.has(p.join(','));

  const features: Feature[] = datos.features.filter(f => f !== tucuman).map(f => {
    const lineas: Position[][] = [];
    for (const anillo of anillos(f)) {
      let actual: Position[] = [anillo[0]];
      for (let i = 1; i < anillo.length; i++) {
        if (enBorde(anillo[i - 1]) && enBorde(anillo[i])) {
          if (actual.length > 1) lineas.push(actual);
          actual = [anillo[i]];
        } else {
          actual.push(anillo[i]);
        }
      }
      if (actual.length > 1) lineas.push(actual);
    }
    return { type: 'Feature', properties: f.properties, geometry: { type: 'MultiLineString', coordinates: lineas } };
  });
  return { type: 'FeatureCollection', features };
}
