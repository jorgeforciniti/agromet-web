import * as L from 'leaflet';
import { GestureHandling } from 'leaflet-gesture-handling';

/*
 * Manejo de gestos común a todos los mapas (plugin leaflet-gesture-handling, su CSS se
 * importa en styles.css). En pantallas táctiles el mapa se mueve con dos dedos y un dedo
 * desplaza la página; con mouse, el zoom con la rueda requiere Ctrl (⌘ en Mac).
 * Reemplaza los manejadores propios de Ctrl+rueda que tenía cada mapa.
 */
L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

/** Opciones para L.map(): activan el manejo de gestos con los avisos en castellano. */
export const OPCIONES_GESTOS = {
  gestureHandling: true,
  gestureHandlingOptions: {
    text: {
      touch: 'Usá dos dedos para mover el mapa',
      scroll: 'Usá Ctrl + rueda para hacer zoom en el mapa',
      scrollMac: 'Usá ⌘ + rueda para hacer zoom en el mapa'
    },
    duration: 1200
  }
} as L.MapOptions;
