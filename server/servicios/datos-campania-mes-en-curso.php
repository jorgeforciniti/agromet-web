<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Buenos_Aires');

/* ───── Conexión ─────────────────────────────────────────────── */
$db = 'estaciones';
require_once 'conecta_mysql.php';           // crea $conexion

if (!$conexion) {
    http_response_code(500);
    exit(json_encode(['status' => 'error', 'message' => 'Sin conexión a base']));
}
mysqli_set_charset($conexion, 'utf8mb4');

/* ───── Parámetros opcionales month / year (validados) ───────── */
$year  = filter_input(INPUT_GET, 'year',  FILTER_VALIDATE_INT, [
            'options' => ['default' => (int)date('Y'), 'min_range' => 2000, 'max_range' => 2100]
         ]);
$month = filter_input(INPUT_GET, 'month', FILTER_VALIDATE_INT, [
            'options' => ['default' => (int)date('n'), 'min_range' => 1, 'max_range' => 12]
         ]);

/* ───── Consulta segura ─────────────────────────────────────── */
// Rango de fechas (usa el índice por fecha, a diferencia de YEAR()/MONTH()). Sólo valores >= 0: un
// -999,9 (sin dato) restaría al acumulado.
$desde = sprintf('%04d-%02d-01', $year, $month);
$hasta = date('Y-m-t', strtotime($desde));
$sql = "
  SELECT identificacion,
         SUM(mm)   AS total_mm,
         MAX(fecha) AS ultima_fecha
    FROM datos_rr_dia
   WHERE fecha BETWEEN ? AND ? AND mm >= 0
GROUP BY identificacion
ORDER BY identificacion
";
$stmt = $conexion->prepare($sql);
if (!$stmt) {
    http_response_code(500);
    exit(json_encode(['status' => 'error', 'message' => 'Error preparando SQL']));
}
$stmt->bind_param('ss', $desde, $hasta);
$stmt->execute();
$res = $stmt->get_result();

/* ───── Formateo de salida ──────────────────────────────────── */
$data = [];
while ($row = $res->fetch_assoc()) {
    $data[] = [
        'id'     => (int)$row['identificacion'],
        'mm'     => (float)$row['total_mm'],
        'ultimo' => $row['ultima_fecha']          // yyyy-mm-dd
    ];
}

$stmt->close();
$conexion->close();

echo json_encode(['status' => 'success', 'month' => $month, 'year' => $year, 'data' => $data], JSON_UNESCAPED_UNICODE);
