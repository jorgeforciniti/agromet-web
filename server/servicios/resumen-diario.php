<?php
/*
 * Resumen de un día en todas las estaciones (tabla `datos_diarios` de la base `estaciones`), para
 * el diálogo «Resumen diario de la red» de /datos. Va en /services/ y usa conecta_mysql.php.
 *
 * GET resumen-diario.php?fecha=AAAA-MM-DD
 *   {"status":"success","fecha":...,"total":N,"data":[{identificacion, temp_max, temp_min, HR_max,
 *    HR_min, rr_24, presion_media_24, viento_medio, viento_max, rad_solar_media, rad_solar_max, et,
 *    hum_hoja_hs}, ...]}
 *
 * Una fila por estación que tenga la fila del día en datos_diarios (las mismas columnas que
 * devuelve datos-diarios.php para una estación). La fila del día en curso se va completando
 * durante el día. Los datos de cada estación (nombre, localidad, zona) los trae el sitio de
 * estaciones.php; acá sólo van los valores. No modifica datos.
 *
 * Los valores se devuelven como están en la tabla (los de relleno, como −99,9, también): el sitio
 * descarta los que están fuera de rango.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

// Columnas de datos_diarios => nombre en la respuesta (el mismo que usa datos-diarios.php; en la
// tabla la humedad es hr_max/hr_min, en minúscula)
const COLUMNAS = [
    'temp_max' => 'temp_max', 'temp_min' => 'temp_min', 'hr_max' => 'HR_max', 'hr_min' => 'HR_min',
    'rr_24' => 'rr_24', 'presion_media_24' => 'presion_media_24', 'viento_medio' => 'viento_medio',
    'viento_max' => 'viento_max', 'rad_solar_media' => 'rad_solar_media', 'rad_solar_max' => 'rad_solar_max',
    'et' => 'et', 'hum_hoja_hs' => 'hum_hoja_hs'
];

function errorJson($codigo, $msg) {
    http_response_code($codigo);
    echo json_encode(['status'=>'error','message'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// 1) Leer y validar la fecha
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : '';
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) errorJson(400, "Parámetro 'fecha' inválido. Use YYYY-MM-DD.");

// 2) Verificar conexión
if (!$conexion) errorJson(500, 'Error de conexión a la base de datos.');
$conexion->set_charset('utf8mb4');

// 3) Una fila por estación (filtra por fecha: usa el índice de fecha de datos_diarios)
$campos = [];
foreach (COLUMNAS as $columna => $nombre) {
    $campos[] = "d.$columna AS $nombre";
}
$sql = "SELECT d.identificacion, " . implode(', ', $campos) . "
    FROM datos_diarios d
    JOIN estaciones e ON e.identificacion = d.identificacion
    WHERE e.habilitada >= 1 AND d.fecha = ?";

$stmt = $conexion->prepare($sql);
if (!$stmt) errorJson(500, 'Error al preparar la consulta.');
$stmt->bind_param('s', $fecha);
if (!$stmt->execute()) errorJson(500, 'Error al ejecutar la consulta.');

// 4) Armar la respuesta
$res = $stmt->get_result();
$data = [];
while ($row = $res->fetch_assoc()) {
    $fila = ['identificacion' => (string)$row['identificacion']];
    foreach (COLUMNAS as $c) {   // $c: nombre en la respuesta (el alias del SELECT)
        $fila[$c] = $row[$c] !== null ? (float)$row[$c] : null;
    }
    $data[] = $fila;
}
$stmt->close();

echo json_encode([
    'status' => 'success',
    'fecha'  => $fecha,
    'total'  => count($data),
    'data'   => $data
], JSON_UNESCAPED_UNICODE);

$conexion->close();
