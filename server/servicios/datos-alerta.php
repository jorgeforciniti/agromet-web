<?php
// datos-alerta.php
// Resumen por estacion (lluvia y minimas) de un rango de fechas; sin rango: desde las 12:00 de ayer hasta ahora.
//
// Con rango, la consulta agrupa por estación y día, y PHP suma los días: así, con la misma lectura de
// datos_estaciones, también sale la lluvia máxima de un día (de 0 a 24 h) y su fecha (maxLluviaDia,
// fechaMaxLluviaDia). maxLluvia sigue siendo la máxima de un registro. Sin rango esos dos campos van null.
//
// Se resuelve en dos consultas separadas y se unen en PHP. Antes era un JOIN de datos_estaciones (InnoDB, mas de 20 millones
// de filas) con estaciones (MyISAM): en MariaDB el optimizador recorria casi toda datos_estaciones y, como MyISAM bloquea la
// tabla completa, la consulta lenta dejaba bloqueadas la web, las APIs y el guardado de datos de las estaciones.

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
    // Mismo WHERE que antes; sólo se agrega fecha al GROUP BY (ver el encabezado)
    $sql = "SELECT
        identificacion,
        fecha,
        SUM(lluvia)        AS totalLluvia,
        MAX(lluvia)        AS maxLluvia,
        COUNT(CASE WHEN lluvia > 0.3 THEN 1 END) AS registrosLluvia,
        MIN(temp_laf)      AS minimaTemperatura,
        SUM(temp_laf <= 0) AS registrosHelada
    FROM datos_estaciones
    WHERE fecha BETWEEN ? AND ?
    GROUP BY identificacion, fecha
    ORDER BY identificacion, fecha";
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
if ($sinFecha) {
    while ($row = $res->fetch_assoc()) {
        $row['maxLluviaDia'] = null;
        $row['fechaMaxLluviaDia'] = null;
        $agregados[] = $row;
    }
} else {
    // Una fila por estación y día: se juntan por estación (los NULL de SUM, MAX y MIN se respetan)
    $porEstacion = [];
    while ($row = $res->fetch_assoc()) {
        $id = $row['identificacion'];
        if (!isset($porEstacion[$id])) {
            $porEstacion[$id] = [
                'identificacion'    => $id,
                'totalLluvia'       => null,
                'maxLluvia'         => null,
                'registrosLluvia'   => 0,
                'minimaTemperatura' => null,
                'registrosHelada'   => null,
                'maxLluviaDia'      => null,
                'fechaMaxLluviaDia' => null,
            ];
        }
        $a = &$porEstacion[$id];
        if ($row['totalLluvia'] !== null) {
            $lluviaDia = (float) $row['totalLluvia'];
            $a['totalLluvia'] = ($a['totalLluvia'] === null ? 0 : $a['totalLluvia']) + $lluviaDia;
            // Ante empate queda el primer día (las filas vienen ordenadas por fecha)
            if ($a['maxLluviaDia'] === null || $lluviaDia > $a['maxLluviaDia']) {
                $a['maxLluviaDia'] = $lluviaDia;
                $a['fechaMaxLluviaDia'] = $row['fecha'];
            }
        }
        if ($row['maxLluvia'] !== null && ($a['maxLluvia'] === null || (float) $row['maxLluvia'] > $a['maxLluvia'])) {
            $a['maxLluvia'] = (float) $row['maxLluvia'];
        }
        $a['registrosLluvia'] += (int) $row['registrosLluvia'];
        if ($row['minimaTemperatura'] !== null && ($a['minimaTemperatura'] === null || (float) $row['minimaTemperatura'] < $a['minimaTemperatura'])) {
            $a['minimaTemperatura'] = (float) $row['minimaTemperatura'];
        }
        if ($row['registrosHelada'] !== null) {
            $a['registrosHelada'] = ($a['registrosHelada'] === null ? 0 : $a['registrosHelada']) + (int) $row['registrosHelada'];
        }
        unset($a);
    }
    foreach ($porEstacion as $a) {
        // Sumas de decimales: se redondean para no devolver 133.60000000000002
        if ($a['totalLluvia'] !== null) $a['totalLluvia'] = round($a['totalLluvia'], 2);
        if ($a['maxLluviaDia'] !== null) $a['maxLluviaDia'] = round($a['maxLluviaDia'], 2);
        $agregados[] = $a;
    }
}
$stmt->close();

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
        'maxLluviaDia'      => $a['maxLluviaDia'],
        'fechaMaxLluviaDia' => $a['fechaMaxLluviaDia'],
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
