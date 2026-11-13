-- Corrección de la ubicación de estaciones (revisión de noviembre de 2026).
-- Ejecutar en la base de conecta_mysql.php (tablas estaciones y estaciones_rr). Revisar antes de ejecutar.
-- Cada UPDATE exige las coordenadas actuales: si alguien ya las cambió, no toca nada (0 filas).

-- 1) Respaldo: anotar los valores actuales antes de cambiarlos.
SELECT identificacion, nombre, lat, lon, alt, habilitada
  FROM estaciones
 WHERE identificacion IN (2049, 1794);

-- 2) El Colmenar y El Colmenar (2): tenían coordenadas redondeadas (-26.80 / -65.20 y -26.81 / -65.21).
--    Se usan las del pluviómetro El Colmenar de la red (estaciones_rr, identificacion 67).
UPDATE estaciones
   SET lat = -26.77639, lon = -65.18413
 WHERE identificacion = 2049 AND lat = -26.80000 AND lon = -65.20000;

UPDATE estaciones
   SET lat = -26.77639, lon = -65.18413
 WHERE identificacion = 1794 AND lat = -26.81000 AND lon = -65.21000;

-- 3) Verificación: las dos deberían mostrar -26.77639 / -65.18413.
SELECT identificacion, nombre, lat, lon
  FROM estaciones
 WHERE identificacion IN (2049, 1794);

-- Pendientes: falta confirmar la ubicación real. Completar y descomentar cuando se tenga.
--
-- Leales (red pluviométrica): coordenadas redondeadas -27.2 / -65.3.
--   estaciones_rr guarda versiones (los PHP leen la de id más alto), por eso se corrige la última.
-- UPDATE estaciones_rr SET lat = ?, lon = ?
--  WHERE identificacion = 98 ORDER BY id DESC LIMIT 1;
--
-- Los Altos: la automática (37) y la de la red (101) están a 12,7 km; la de la red cae en el pueblo.
-- UPDATE estaciones SET lat = ?, lon = ? WHERE identificacion = 37;
--
-- Ingas: la automática (13) y la de la red (87) están a 7 km (puede ser otro pluviómetro).
-- Frías (75, deshabilitada): figura en Santiago del Estero pero el punto cae en Catamarca.
-- Don Vicente (46) y El Guayal (61): altura ~110 m por debajo del terreno (coordenada o altura).
-- Chaguaral Oeste (36): altura 0; el terreno ahí está a unos 358 m.
-- UPDATE estaciones SET alt = ? WHERE identificacion = 36;
