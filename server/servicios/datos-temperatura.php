<?php
/*
 * Temperaturas de un período por estación (tabla `datos_diarios` de la base `estaciones`), para el
 * mapa de temperaturas. Va en /services/ y usa conecta_mysql.php.
 *
 * GET datos-temperatura.php?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *   {"status":"success","desde":...,"hasta":...,"total":N,"data":[{nombre, lat, lon, alt,
 *    avg_temp_max, abs_max_temp, avg_temp_min, abs_min_temp, avg_temp_period, abs_max_date,
 *    abs_min_date, count_records, dias_max, dias_min, dias_media}, ...]}
 *
 * Valores fuera de rango: los días con temp_max o temp_min fuera de −25 a 50 °C (valores erróneos
 * o de relleno, como −99,9) no entran en los promedios ni en los extremos de esa variable. La media
 * del día sólo se calcula si las dos son válidas. Si una estación no tiene ningún día válido, la
 * variable sale null y el mapa no la muestra.
 *   count_records: días con fila en datos_diarios (como antes).
 *   dias_max / dias_min / dias_media: días válidos de cada variable; el mapa los usa para marcar
 *   las estaciones incompletas.
 *
 * La consulta filtra igual que antes (estación habilitada y rango de fecha): el filtro de valores
 * va dentro de los agregados, así que no cambia qué filas se leen.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

// Rango físico aceptado (°C); el mismo que TEMP_MIN_VALIDA y TEMP_MAX_VALIDA del mapa
const TEMP_MIN_VALIDA = -25;
const TEMP_MAX_VALIDA = 50;

function badRequest($msg) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// 1) Leer y validar parámetros
$desde = isset($_GET['desde']) ? $_GET['desde'] : '';
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : '';
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$desde)) badRequest("Parámetro 'desde' inválido. Use YYYY-MM-DD.");
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$hasta)) badRequest("Parámetro 'hasta' inválido. Use YYYY-MM-DD.");

// 2) Verificar conexión
if (!$conexion) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Error de conexión a la base de datos.']);
    exit;
}
$conexion->set_charset('utf8mb4');

// 3) Preparar consulta. Las condiciones de validez son constantes (no vienen del usuario).
$maxOk = "d.temp_max BETWEEN " . TEMP_MIN_VALIDA . " AND " . TEMP_MAX_VALIDA;
$minOk = "d.temp_min BETWEEN " . TEMP_MIN_VALIDA . " AND " . TEMP_MAX_VALIDA;
$ddMaxOk = str_replace('d.', 'dd.', $maxOk);
$ddMinOk = str_replace('d.', 'dd.', $minOk);

$sql = "
SELECT
  e.identificacion,
  e.nombre,
  e.lat,
  e.lon,
  e.alt,

  /* Promedios (sólo días válidos; AVG ignora los NULL del CASE) */
  AVG(CASE WHEN $maxOk THEN d.temp_max END)                          AS avg_temp_max,
  AVG(CASE WHEN $minOk THEN d.temp_min END)                          AS avg_temp_min,
  AVG(CASE WHEN $maxOk AND $minOk THEN (d.temp_max + d.temp_min)/2 END) AS avg_temp_period,

  /* Extremos absolutos */
  MAX(CASE WHEN $maxOk THEN d.temp_max END)                          AS abs_max_temp,
  MIN(CASE WHEN $minOk THEN d.temp_min END)                          AS abs_min_temp,

  /* Fechas de los extremos (subconsulta correlacionada, con el mismo filtro de validez) */
  ( SELECT dd.fecha
    FROM datos_diarios dd
    WHERE dd.identificacion = d.identificacion
      AND dd.fecha BETWEEN ? AND ?
      AND $ddMaxOk
    ORDER BY dd.temp_max DESC, dd.fecha ASC
    LIMIT 1
  ) AS abs_max_date,

  ( SELECT dd.fecha
    FROM datos_diarios dd
    WHERE dd.identificacion = d.identificacion
      AND dd.fecha BETWEEN ? AND ?
      AND $ddMinOk
    ORDER BY dd.temp_min ASC, dd.fecha ASC
    LIMIT 1
  ) AS abs_min_date,

  /* Cantidad de registros: todos y los válidos de cada variable */
  COUNT(*)                                          AS count_records,
  SUM(CASE WHEN $maxOk THEN 1 ELSE 0 END)           AS dias_max,
  SUM(CASE WHEN $minOk THEN 1 ELSE 0 END)           AS dias_min,
  SUM(CASE WHEN $maxOk AND $minOk THEN 1 ELSE 0 END) AS dias_media

FROM datos_diarios d
JOIN estaciones e
  ON e.identificacion = d.identificacion

WHERE habilitada>=1 AND d.fecha BETWEEN ? AND ?
GROUP BY d.identificacion, e.nombre, e.lat, e.lon, e.alt
ORDER BY e.nombre;
";

$stmt = $conexion->prepare($sql);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Error al preparar la consulta.']);
    exit;
}
// 4) Vincular parámetros (seis ?, todos strings 'YYYY-MM-DD')
$stmt->bind_param(
    'ssssss',
    $desde, $hasta,
    $desde, $hasta,
    $desde, $hasta
);

// 5) Ejecutar y construir respuesta
if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>'Error al ejecutar la consulta.']);
    exit;
}
$res = $stmt->get_result();
$data = [];
while ($row = $res->fetch_assoc()) {
    $data[] = [
        'nombre'           => $row['nombre'],
        'lat'              => isset($row['lat'])           ? (float)$row['lat'] : null,
        'lon'              => isset($row['lon'])           ? (float)$row['lon'] : null,
        'alt'              => isset($row['alt'])           ? (float)$row['alt'] : null,

        'avg_temp_max'     => $row['avg_temp_max']  !== null ? (float)$row['avg_temp_max']  : null,
        'abs_max_temp'     => $row['abs_max_temp']  !== null ? (float)$row['abs_max_temp']  : null,
        'avg_temp_min'     => $row['avg_temp_min']  !== null ? (float)$row['avg_temp_min']  : null,
        'abs_min_temp'     => $row['abs_min_temp']  !== null ? (float)$row['abs_min_temp']  : null,
        'avg_temp_period'  => $row['avg_temp_period']!== null ? (float)$row['avg_temp_period']: null,

        'abs_max_date'     => $row['abs_max_date'],
        'abs_min_date'     => $row['abs_min_date'],
        'count_records'    => (int)$row['count_records'],
        'dias_max'         => (int)$row['dias_max'],
        'dias_min'         => (int)$row['dias_min'],
        'dias_media'       => (int)$row['dias_media'],
    ];
}

// 6) Enviar JSON final
echo json_encode([
    'status' => 'success',
    'desde'  => $desde,
    'hasta'  => $hasta,
    'total'  => count($data),
    'data'   => $data
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

$conexion->close();
