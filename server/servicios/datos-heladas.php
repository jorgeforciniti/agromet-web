<?php
// minmax_period_api.php

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

$db = "estaciones";
require_once 'conecta_mysql.php';
// Helpers de error
function badRequest($msg) {
    http_response_code(400);
    echo json_encode(['status'=>'error','message'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}
function serverError($msg) {
    http_response_code(500);
    echo json_encode(['status'=>'error','message'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// 1) Leer y validar parámetros
$desde = isset($_GET['desde']) ? $_GET['desde'] : '';
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : '';
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) badRequest("Parámetro 'desde' inválido. Use YYYY-MM-DD.");
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta)) badRequest("Parámetro 'hasta' inválido. Use YYYY-MM-DD.");

// 2) Verificar conexión
if (!$conexion) {
    serverError("Error de conexión a la base de datos.");
}
$conexion->set_charset('utf8mb4');

// 3) Preparar consulta con marcadores
$sql = "
    SELECT 
        e.nombre,
        e.lat,
        e.lon,
        e.alt,
        MIN(d.temp_min) AS minAbs,
        MAX(d.t_hs_debajo_M4) AS hsDebajoMenos4,
        MAX(d.t_hs_debajo_M2) AS hsDebajoMenos2,
        MAX(d.t_hs_debajo_0) AS maxHsDebajo0,
        COUNT(*) AS cantidadDias,
        SUM(d.temp_min <= 0) AS diasHeladas,
        MIN(CASE WHEN d.temp_min <= 0 THEN d.fecha END) AS FPH,
        MAX(CASE WHEN d.temp_min <= 0 THEN d.fecha END) AS FUH,
        e.habilitada,
        e.identificacion,
        SUM(d.t_hs_debajo_0) AS hsDebajo0
    FROM datos_diarios d
    INNER JOIN estaciones e ON d.identificacion = e.identificacion
    WHERE d.fecha BETWEEN ? AND ?
    GROUP BY d.identificacion
    ORDER BY e.nombre
";

$stmt = $conexion->prepare($sql);
if (!$stmt) {
    serverError("Error al preparar la consulta: " . $conexion->error);
}

// 4) Vincular los dos parámetros de fecha
$stmt->bind_param('ss', $desde, $hasta);

// 5) Ejecutar y construir la respuesta
if (!$stmt->execute()) {
    serverError("Error al ejecutar la consulta: " . $stmt->error);
}
$res = $stmt->get_result();

$data = [];
while ($row = $res->fetch_assoc()) {
    $data[] = [
        'nombre'           => $row['nombre'],
        'lat'              => (float)$row['lat'],
        'lon'              => (float)$row['lon'],
        'alt'              => (float)$row['alt'],
        'minAbs'           => (float)$row['minAbs'],
        'hsDebajo-4'   => (float)$row['hsDebajoMenos4'],
        'hsDebajo-2'   => (float)$row['hsDebajoMenos2'],
        'maxHsDebajo0'     => (float)$row['maxHsDebajo0'],
        'cantidadDias'     => (int)$row['cantidadDias'],
        'diasHeladas'      => (int)$row['diasHeladas'],
        'FPH'              => $row['FPH'],   // si quieres fecha textualmente
        'FUH'              => $row['FUH'],
        'habilitada'       => (bool)$row['habilitada'],
        'identificacion'   => $row['identificacion'],
        'hsDebajo0'        => (float)$row['hsDebajo0'],
    ];
}

// 6) Devolver JSON
echo json_encode([
    'status'  => 'success',
    'desde'   => $desde,
    'hasta'   => $hasta,
    'total'   => count($data),
    'data'    => $data
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

// 7) Cerrar
$stmt->close();
$conexion->close();
