<?php
// datos-alerta.php
// Resumen por estacion (lluvia y minimas) de un rango de fechas; sin rango: desde las 12:00 de ayer hasta ahora.
//
// Se resuelve en dos consultas separadas y se unen en PHP. Antes era un JOIN de datos_estaciones (InnoDB, mas de 20 millones
// de filas) con estaciones (MyISAM): en MariaDB el optimizador recorria casi toda datos_estaciones y, como MyISAM bloquea la
// tabla completa, la consulta lenta dejaba bloqueadas la web, las APIs y el guardado de datos de las estaciones.
//
// No agrupar también por fecha (para sacar la lluvia máxima diaria): se probó en noviembre de 2026 y, con
// 90 días, la consulta tardó 70 s contra menos de 1 s de esta versión, aunque el EXPLAIN se veía parecido.
// La máxima diaria (maxLluviaDia, fechaMaxLluviaDia) sale de datos_diarios.rr_24, una fila por estación y
// día (ver el paso 3b); sólo con rango y sólo de los días que ya tienen su fila en datos_diarios.

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

$db = "estaciones";
require_once 'conecta_mysql.php';
// Helpers de error
function badRequest($msg)
{
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
function serverError($msg)
{
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

const MAX_DIAS_RANGO = 400;

// 1) Leer y validar parámetros
$desde = isset($_GET['desde']) ? $_GET['desde'] : '';
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : '';
$sinFecha = false;
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde))
    $sinFecha = true;
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta))
    $sinFecha = true;

if (!$sinFecha) {
    $dias = (strtotime($hasta) - strtotime($desde)) / 86400;
    if ($dias > MAX_DIAS_RANGO) {
        badRequest("El rango no puede superar " . MAX_DIAS_RANGO . " días.");
    }
}

// 2) Verificar conexión
if (!$conexion) {
    serverError("Error de conexión a la base de datos.");
}
$conexion->set_charset('utf8mb4');

// 3) Agregados sobre datos_estaciones (solo esa tabla, usando el índice de fecha)
if ($sinFecha) {
    $sql = "SELECT
        identificacion,
        SUM(lluvia)        AS totalLluvia,
        MAX(lluvia)        AS maxLluvia,
        COUNT(CASE WHEN lluvia > 0 THEN 1 END) AS registrosLluvia,
        MIN(temp_laf)      AS minimaTemperatura,
        SUM(temp_laf <= 0) AS registrosHelada
    FROM datos_estaciones
    WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      AND (fecha > DATE_SUB(CURDATE(), INTERVAL 1 DAY) OR hora > '12:00:00')
    GROUP BY identificacion
    ORDER BY identificacion";
} else {
    $sql = "SELECT
        identificacion,
        SUM(lluvia)        AS totalLluvia,
        MAX(lluvia)        AS maxLluvia,
        COUNT(CASE WHEN lluvia > 0.3 THEN 1 END) AS registrosLluvia,
        MIN(temp_laf)      AS minimaTemperatura,
        SUM(temp_laf <= 0) AS registrosHelada
    FROM datos_estaciones
    WHERE fecha BETWEEN ? AND ?
    GROUP BY identificacion
    ORDER BY identificacion";
}

$stmt = $conexion->prepare($sql);
if (!$stmt) {
    serverError("Error al preparar la consulta: " . $conexion->error);
}
if (!$sinFecha) {
    $stmt->bind_param('ss', $desde, $hasta);
}
if (!$stmt->execute()) {
    serverError("Error al ejecutar la consulta: " . $stmt->error);
}
$res = $stmt->get_result();
$agregados = [];
while ($row = $res->fetch_assoc()) {
    $agregados[] = $row;
}
$stmt->close();

// 3b) Lluvia máxima de un día (de 0 a 24 h) por estación, de datos_diarios (tabla resumida: una fila por
//     estación y día). Se leen las filas y el máximo se busca en PHP; ante empate queda el primer día.
$maxDia = [];
if (!$sinFecha) {
    $stmtDia = $conexion->prepare("SELECT identificacion, fecha, rr_24
        FROM datos_diarios
        WHERE fecha BETWEEN ? AND ? AND rr_24 BETWEEN 0 AND 1000
        ORDER BY fecha");
    // Si falla, la respuesta sale igual, sin la máxima diaria
    if ($stmtDia) {
        $stmtDia->bind_param('ss', $desde, $hasta);
        if ($stmtDia->execute()) {
            $resDia = $stmtDia->get_result();
            while ($row = $resDia->fetch_assoc()) {
                $id = (int) $row['identificacion'];
                $mm = (float) $row['rr_24'];
                if (!isset($maxDia[$id]) || $mm > $maxDia[$id]['mm']) {
                    $maxDia[$id] = ['mm' => $mm, 'fecha' => $row['fecha']];
                }
            }
        }
        $stmtDia->close();
    }
}

// 4) Datos de las estaciones (tabla chica); sin rango solo las habilitadas
$sqlEst = "SELECT identificacion, nombre, lat, lon, alt, tiempo AS frecuenciaDato, habilitada FROM estaciones"
    . ($sinFecha ? " WHERE habilitada > 0" : "");
$stmtEst = $conexion->prepare($sqlEst);
if (!$stmtEst) {
    serverError("Error al preparar la consulta: " . $conexion->error);
}
if (!$stmtEst->execute()) {
    serverError("Error al ejecutar la consulta: " . $stmtEst->error);
}
$resEst = $stmtEst->get_result();
$estaciones = [];
while ($row = $resEst->fetch_assoc()) {
    $estaciones[(int) $row['identificacion']] = $row;
}
$stmtEst->close();

// 5) Unir (equivale al JOIN anterior: solo estaciones que existen y, sin rango, están habilitadas)
$data = [];
foreach ($agregados as $a) {
    $id = (int) $a['identificacion'];
    if (!isset($estaciones[$id])) {
        continue;
    }
    $e = $estaciones[$id];
    $data[] = [
        'identificacion'    => $a['identificacion'],
        'nombre'            => $e['nombre'],
        'lat'               => $e['lat'],
        'lon'               => $e['lon'],
        'alt'               => $e['alt'],
        'frecuenciaDato'    => $e['frecuenciaDato'],
        'habilitada'        => $e['habilitada'],
        'totalLluvia'       => $a['totalLluvia'],
        'maxLluvia'         => $a['maxLluvia'],
        'maxLluviaDia'      => isset($maxDia[$id]) ? $maxDia[$id]['mm'] : null,
        'fechaMaxLluviaDia' => isset($maxDia[$id]) ? $maxDia[$id]['fecha'] : null,
        'registrosLluvia'   => $a['registrosLluvia'],
        'minimaTemperatura' => $a['minimaTemperatura'],
        'registrosHelada'   => $a['registrosHelada'],
    ];
}

// 6) Devolver JSON
echo json_encode([
    'status' => 'success',
    'desde' => $desde,
    'hasta' => $hasta,
    'total' => count($data),
    'data' => $data
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

// 7) Cerrar
$conexion->close();
