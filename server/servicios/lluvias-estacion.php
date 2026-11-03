<?php
/*
 * Serie histórica de lluvias mensuales de una estación de la red pluviométrica
 * (tablas `estaciones_rr` y `datos_rr_mes` de la base `estaciones`, las mismas que usa
 * datos-campania.php). Va en /services/ y usa la misma conexión (conecta_mysql.php).
 *
 * GET lluvias-estacion.php?estacion=123
 *   - con datos:
 *     {"status":"success",
 *      "estacion":{"id":123,"name":"...","lat":-26.8,"lon":-65.2,"alt":480,"zone":"..",
 *                  "reference_period":"1991-2020","normales":[12 valores]},
 *      "anios":[{"anio":1990,"meses":[12 valores]}, ...]}
 *   - estación inexistente: {"status":"sin_datos","estacion":123}
 * Cada arreglo tiene 12 valores (enero a diciembre) en mm; null si el mes no tiene dato
 * (en la tabla los meses sin dato se guardan como -999.9).
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
// Los totales mensuales cambian a lo sumo una vez por día: el navegador puede reutilizarlos una hora
header('Cache-Control: public, max-age=3600');

error_reporting(E_ALL);
ini_set('display_errors', 0);

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

if (!$conexion) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la base de datos.']);
    exit;
}
mysqli_set_charset($conexion, 'utf8');

$estacion = isset($_GET['estacion']) ? $_GET['estacion'] : '';
if (!preg_match('/^\d{1,5}$/', $estacion)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Falta el parámetro estacion (numérico).']);
    exit;
}
// $id es entero validado arriba: se puede interpolar sin riesgo (y no depende de mysqlnd)
$id = (int)$estacion;

/** Valor de la tabla => número o null (los meses sin dato se guardan como -999.9). */
function valorMes($v) {
    if ($v === null || $v === '') {
        return null;
    }
    $n = (float)$v;
    return $n < 0 ? null : $n;
}

$meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Datos de la estación
$resultado = $conexion->query(
    "SELECT identificacion, nombre, lat, lon, alt, zona, periodo_normal,
            nene, nfeb, nmar, nabr, nmay, njun, njul, nago, nsep, noct, nnov, ndic
     FROM estaciones_rr WHERE identificacion = $id ORDER BY id DESC LIMIT 1"
);
if ($resultado === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error en la consulta de la estación.']);
    exit;
}
$fila = $resultado->fetch_assoc();
if (!$fila) {
    $conexion->close();
    echo json_encode(['status' => 'sin_datos', 'estacion' => $id]);
    exit;
}

$normales = [];
foreach ($meses as $mes) {
    $normales[] = valorMes($fila['n' . $mes]);
}

$respuestaEstacion = [
    'id' => (int)$fila['identificacion'],
    'name' => $fila['nombre'],
    'lat' => (float)$fila['lat'],
    'lon' => (float)$fila['lon'],
    'alt' => (float)$fila['alt'],
    'zone' => $fila['zona'],
    'reference_period' => $fila['periodo_normal'],
    'normales' => $normales
];

// Serie mensual. Si hubiera dos filas para el mismo año, prevalece la cargada más tarde (id mayor).
$resultado = $conexion->query(
    "SELECT anio, ene, feb, mar, abr, may, jun, jul, ago, sep, oct, nov, dic
     FROM datos_rr_mes WHERE identificacion = $id ORDER BY anio, id"
);
if ($resultado === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error en la consulta de lluvias.']);
    exit;
}

$porAnio = [];
while ($r = $resultado->fetch_assoc()) {
    $valores = [];
    foreach ($meses as $mes) {
        $valores[] = valorMes($r[$mes]);
    }
    $porAnio[(int)$r['anio']] = $valores;
}
$conexion->close();

$anios = [];
foreach ($porAnio as $anio => $valores) {
    $anios[] = ['anio' => $anio, 'meses' => $valores];
}

echo json_encode(
    ['status' => 'success', 'estacion' => $respuestaEstacion, 'anios' => $anios],
    JSON_UNESCAPED_UNICODE
);
