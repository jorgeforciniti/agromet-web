<?php
/*
 * Lluvia por estación en un período, con la cantidad de registros (mapa de lluvias diarias).
 * Va en /services/ junto a datos-alerta.php y usa la misma conexión (conecta_mysql.php).
 * Hace la misma consulta que «Lluvias 9 a 9» de /admin (server/admin/api/lluvias9a9.php), pero es
 * pública y acepta un período de hasta 31 días. Usa el índice `Fecha` de datos_estaciones (EXPLAIN
 * revisado en noviembre de 2026: range sobre `Fecha`, ~7.300 filas para dos días).
 *
 * GET lluvia-periodo.php?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&dia=calendario|pluviometrico
 *   calendario:    de las 0 h de `desde` a las 24 h de `hasta`.
 *   pluviometrico: días de 9 a 9 h que terminan a las 9:00 de cada fecha, de `desde` a `hasta`:
 *                  desde el día anterior a `desde` después de las 9:00 hasta `hasta` a las 9:00 inclusive.
 * {"status":"success","desde","hasta","dia","horasPeriodo",
 *  "estaciones":[{id, nombre, habilitada, mm, maxRegistro, registros, registrosLluvia, horas}]}
 *   mm: null si la estación no tiene registros de lluvia en el período.
 *   maxRegistro: lluvia máxima de un registro (mm).
 *   registrosLluvia: registros con más de 0,3 mm (con menos puede ser rocío).
 *   horas: horas cubiertas por los registros de lluvia (registros × intervalo de la estación / 60). En
 *          /admin se cuentan los de temperatura, pero hay estaciones sin sensor de temperatura (o con
 *          huecos) que sí registran la lluvia.
 *   horasPeriodo: horas transcurridas del período (si termina en el futuro, hasta ahora), para
 *                 comparar con `horas` y marcar las estaciones incompletas.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');

error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

/**
 * Período máximo. La consulta recorre el índice de `fecha` (unos 3.700 registros por día): con 31 días
 * son ~115.000 registros. Períodos más largos tendrían la tabla bloqueada demasiado tiempo para el
 * receptor de datos.
 */
const MAX_DIAS = 31;
/** Tope de la consulta en milisegundos (MySQL 5.7.8 o posterior; otras versiones ignoran la pista) */
const MAX_MS_CONSULTA = 15000;

function error_json($mensaje, $codigo = 400)
{
    http_response_code($codigo);
    echo json_encode(['status' => 'error', 'message' => $mensaje]);
    exit;
}

function leer_fecha($campo)
{
    $v = isset($_GET[$campo]) ? $_GET[$campo] : '';
    $f = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$f || $f->format('Y-m-d') !== $v) {
        error_json("Falta el parámetro $campo (AAAA-MM-DD).");
    }
    return $f;
}

$desde = leer_fecha('desde');
$hasta = leer_fecha('hasta');
$dia = isset($_GET['dia']) ? $_GET['dia'] : 'calendario';
if ($dia !== 'calendario' && $dia !== 'pluviometrico') {
    error_json('El parámetro dia debe ser calendario o pluviometrico.');
}
if ($hasta < $desde) {
    error_json('La fecha hasta es anterior a desde.');
}
if ($desde->diff($hasta)->days + 1 > MAX_DIAS) {
    error_json('El período no puede superar ' . MAX_DIAS . ' días.');
}

// Inicio y fin del período. La consulta filtra por un rango de fechas simple (puede usar el índice
// de `fecha`) y las horas del primer y del último día se descartan aparte: con un OR entre
// condiciones de fecha y hora MySQL recorría la tabla de registros entera y la consulta no terminaba.
if ($dia === 'calendario') {
    $inicio = (clone $desde);
    $fin = (clone $hasta)->modify('+1 day');
    $fechaDesde = $desde->format('Y-m-d');
    $fechaHasta = $hasta->format('Y-m-d');
    $filtroHoras = '';
} else {
    $inicio = (clone $desde)->modify('-1 day')->setTime(9, 0);
    $fin = (clone $hasta)->setTime(9, 0);
    $fechaDesde = $inicio->format('Y-m-d');
    $fechaHasta = $hasta->format('Y-m-d');
    // Del día anterior sólo después de las 9:00; del último día, hasta las 9:00 inclusive
    $filtroHoras = " AND NOT (d.fecha = '$fechaDesde' AND d.hora <= '09:00:00')"
                 . " AND NOT (d.fecha = '$fechaHasta' AND d.hora > '09:00:00')";
}
$ahora = new DateTime();
$finEfectivo = $fin > $ahora ? $ahora : $fin;
$horasPeriodo = max(0, round(($finEfectivo->getTimestamp() - $inicio->getTimestamp()) / 3600, 2));

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

if (!$conexion) {
    error_json('Error de conexión a la base de datos.', 500);
}
mysqli_set_charset($conexion, 'utf8');

// 1) Estaciones (también las que no tienen registros, para no confundirlas con 0 mm)
$resEstaciones = $conexion->query("SELECT identificacion, nombre, habilitada, tiempo FROM estaciones ORDER BY nombre");
if ($resEstaciones === false) {
    error_json('Error en la consulta de estaciones.', 500);
}

// 2) Registros del período agrupados por estación. Las fechas ya están validadas (AAAA-MM-DD), así
//    que se pueden interpolar sin riesgo (y no depende de mysqlnd).
//    ORDER BY NULL evita el ordenamiento que agrega GROUP BY en MySQL 5 (el orden lo da la lista de
//    estaciones).
$sql = "SELECT /*+ MAX_EXECUTION_TIME(" . MAX_MS_CONSULTA . ") */ d.identificacion,
               SUM(d.lluvia) AS mm, MAX(d.lluvia) AS maxRegistro, COUNT(d.lluvia) AS registros,
               COUNT(CASE WHEN d.lluvia > 0.3 THEN 1 END) AS registrosLluvia
        FROM datos_estaciones d
        WHERE d.fecha BETWEEN '$fechaDesde' AND '$fechaHasta'$filtroHoras
        GROUP BY d.identificacion
        ORDER BY NULL";
$resDatos = $conexion->query($sql);
if ($resDatos === false) {
    error_json('Error en la consulta de lluvias.', 500);
}
$datos = [];
while ($f = $resDatos->fetch_assoc()) {
    $datos[(string)$f['identificacion']] = $f;
}

$estaciones = [];
while ($e = $resEstaciones->fetch_assoc()) {
    $id = (string)$e['identificacion'];
    $f = isset($datos[$id]) ? $datos[$id] : null;
    $registros = $f ? (int)$f['registros'] : 0;
    $estaciones[] = [
        'id' => $id,
        'nombre' => trim($e['nombre']),
        'habilitada' => (int)$e['habilitada'],
        'mm' => $registros > 0 ? round((float)$f['mm'], 1) : null,
        'maxRegistro' => $registros > 0 ? round((float)$f['maxRegistro'], 2) : null,
        'registros' => $registros,
        'registrosLluvia' => $f ? (int)$f['registrosLluvia'] : 0,
        // Registros de lluvia × intervalo de la estación (minutos) / 60
        'horas' => round($registros * (float)$e['tiempo'] / 60, 2),
    ];
}
$conexion->close();

echo json_encode([
    'status' => 'success',
    'desde' => $desde->format('Y-m-d'),
    'hasta' => $hasta->format('Y-m-d'),
    'dia' => $dia,
    'horasPeriodo' => $horasPeriodo,
    'estaciones' => $estaciones,
]);
