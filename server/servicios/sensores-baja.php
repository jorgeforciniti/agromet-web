<?php
/*
 * Sensores dados de baja (depuración de datos), para todo el sitio. Va en /services/ y usa
 * conecta_mysql.php (base `estaciones`). Las bajas se cargan en /admin, pestaña «Sensores dados de
 * baja» (server/admin/api/sensores_baja.php). Sólo lee.
 *
 * GET sensores-baja.php
 *   {"status":"success","data":[{estacion, variable, desde, hasta, motivo}, ...]}
 *   hasta: null si el sensor sigue de baja. Variables: temperatura, humedad, viento, lluvia,
 *   radiacion, presion, hoja.
 *
 * Si la tabla todavía no existe, devuelve la lista vacía: el sitio funciona igual, sin depurar.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: max-age=300');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

function errorJson($codigo, $msg) {
    http_response_code($codigo);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$conexion) errorJson(500, 'Error de conexión a la base de datos.');
$conexion->set_charset('utf8mb4');

$data = [];
try {
    $res = @$conexion->query("SELECT identificacion, variable, desde, hasta, motivo FROM sensores_baja ORDER BY identificacion, variable, desde");
} catch (Throwable $e) {
    $res = false; // con mysqli en modo estricto, la tabla inexistente lanza una excepción
}
if ($res !== false) {
    while ($f = $res->fetch_assoc()) {
        $data[] = [
            'estacion' => (string)$f['identificacion'],
            'variable' => $f['variable'],
            'desde' => $f['desde'],
            'hasta' => $f['hasta'],
            'motivo' => $f['motivo'],
        ];
    }
}

echo json_encode(['status' => 'success', 'data' => $data], JSON_UNESCAPED_UNICODE);
$conexion->close();
