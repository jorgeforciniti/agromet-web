<?php

// Formato de llamada: io_valles.php?fecha=AAAAMMDD

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

date_default_timezone_set("America/Argentina/Buenos_Aires");
set_time_limit(30);

// 1.- IDENTIFICACION nombre de la base, del usuario, clave y servidor
$db = "estaciones";
include("conecta_mysql.php");

// Sensores dados de baja (depuración de datos, /services/depuracion.php): sus valores van en null,
// sin cambiar el formato. Si el archivo no está, responde como antes.
$depuracion = __DIR__ . "/../services/depuracion.php";
if (!is_file($depuracion) && !empty($_SERVER["DOCUMENT_ROOT"])) {
    $depuracion = $_SERVER["DOCUMENT_ROOT"] . "/services/depuracion.php";
}
if (is_file($depuracion)) {
    require_once $depuracion;
}

// Cantidad de consultas (tabla api_consultas; ver LEEME.md)
$registro = __DIR__ . "/../services/registro-consultas.php";
if (!is_file($registro) && !empty($_SERVER["DOCUMENT_ROOT"])) {
    $registro = $_SERVER["DOCUMENT_ROOT"] . "/services/registro-consultas.php";
}
if (is_file($registro)) {
    require_once $registro;
    registrarConsulta($conexion, 'io_valles');
}

if (!$conexion || mysqli_connect_errno()) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'mensaje' => 'No se pudo conectar a la base de datos'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

mysqli_set_charset($conexion, "utf8");

/**
 * Devuelve el valor numérico o -99.9 si no es válido.
 */
function numOrDefault($value, $default = -99.9)
{
    return is_numeric($value) ? (float)$value : $default;
}

/**
 * Devuelve fecha en UTC con formato d.m.Y H:i o null si no es válida.
 */
function formatUtcDate($value)
{
    if (empty($value)) {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return gmdate('d.m.Y H:i', $timestamp);
}

$fec = isset($_GET['fecha']) ? trim($_GET['fecha']) : '';

if (!preg_match('/^\d{8}$/', $fec)) {
    http_response_code(400);
    echo json_encode([
        'error' => true,
        'mensaje' => 'Parámetro fecha inválido. Debe tener formato AAAAMMDD.'
    ], JSON_UNESCAPED_UNICODE);
    mysqli_close($conexion);
    exit;
}

$sql = "
    SELECT
        d.fecha,
        d.horas,
        e.lat,
        e.lon,
        e.alt,
        e.nombre,
        e.identificacion,
        d.temp_max,
        d.temp_min,
        d.rr_24,
        d.Presion_max,
        d.Presion_min,
        d.Rad_Solar_media,
        d.hr_max,
        d.hr_min,
        d.Viento_medio,
        d.Viento_Max,
        d.hum_hoja_hs,
        d.et,
        e.marca,
        e.localidad,
        e.departamento,
        e.provincia,
        e.fecha_i
    FROM datos_diarios d
    INNER JOIN estaciones e
        ON d.Identificacion = e.Identificacion
    WHERE d.fecha = ?
      AND e.habilitada > 0
      AND e.valles > 0
";

$stmt = mysqli_prepare($conexion, $sql);

if (!$stmt) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'mensaje' => 'Error al preparar la consulta'
    ], JSON_UNESCAPED_UNICODE);
    mysqli_close($conexion);
    exit;
}

mysqli_stmt_bind_param($stmt, "s", $fec);

if (!mysqli_stmt_execute($stmt)) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'mensaje' => 'Error al ejecutar la consulta'
    ], JSON_UNESCAPED_UNICODE);
    mysqli_stmt_close($stmt);
    mysqli_close($conexion);
    exit;
}

$resultado = mysqli_stmt_get_result($stmt);

$units = [
    'alt' => 'm',
    'temperature' => 'ºC',
    'pressure' => 'hPa',
    'humidity' => '%',
    'winSpeed' => 'km/h',
    'radiation' => 'W/m2',
    'humhoja' => 'hs',
    'evapotranspiration' => 'mm'
];

$arr = [];

$diaIso = substr($fec, 0, 4) . '-' . substr($fec, 4, 2) . '-' . substr($fec, 6, 2);
$bajas = function_exists("depuracionBajas") ? depuracionBajas($conexion, null, $diaIso, $diaIso) : array();
while ($row = mysqli_fetch_assoc($resultado)) {
    if ($bajas) depuracionAnularRegistro($row, $bajas, DEPURACION_COLUMNAS_DIARIAS);
    $id = $row['identificacion'];

    $station = [
        'name' => $row['nombre'],
        'id' => $id,
        'lon' => numOrDefault($row['lon']),
        'lat' => numOrDefault($row['lat']),
        'alt' => numOrDefault($row['alt']),
        'marca' => $row['marca'],
        'propietario' => 'EEAOC',
        'localidad' => $row['localidad'],
        'departamento' => $row['departamento'],
        'provincia' => $row['provincia']
    ];

    $datos = [
        'fecha' => date('d-m-Y', strtotime($row['fecha'])),
        'registros' => is_numeric($row['horas']) ? (int)$row['horas'] : 0,
        'tempMax' => numOrDefault($row['temp_max']),
        'tempMin' => numOrDefault($row['temp_min']),
        'radSolar' => numOrDefault($row['Rad_Solar_media']),
        'humRelMax' => numOrDefault($row['hr_max']),
        'humRelMin' => numOrDefault($row['hr_min']),
        'presionMax' => numOrDefault($row['Presion_max']),
        'presionMin' => numOrDefault($row['Presion_min']),
        'lluvia' => numOrDefault($row['rr_24']),
        'vientoMedio' => numOrDefault($row['Viento_medio']),
        'vientoMax' => numOrDefault($row['Viento_Max']),
        'hsHumedadHoja' => numOrDefault($row['hum_hoja_hs']),
        'evapotranspiracion' => numOrDefault($row['et'])
    ];

    $arr[$id] = [
        'station' => $station,
        'Units' => $units,
        'fechaUltimoRegistro' => date('d-m-Y H:i', strtotime($row['fecha_i'])),
        'datos' => $datos
    ];
}

mysqli_stmt_close($stmt);
mysqli_close($conexion);

echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>