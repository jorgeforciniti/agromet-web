<?php

// Activar errores para debug
ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

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
// Para controlar desde afuera si depura (activa) o responde como antes (sin-archivo)
header("X-Depuracion: " . (function_exists("depuracionAnular") ? "activa" : "sin-archivo"));

// Cantidad de consultas (tabla api_consultas; ver LEEME.md)
$registro = __DIR__ . "/../services/registro-consultas.php";
if (!is_file($registro) && !empty($_SERVER["DOCUMENT_ROOT"])) {
    $registro = $_SERVER["DOCUMENT_ROOT"] . "/services/registro-consultas.php";
}
if (is_file($registro)) {
    require_once $registro;
    registrarConsulta($conexion, 'smn-nuevo');
}

mysqli_set_charset($conexion, "utf8mb4");
date_default_timezone_set("America/Argentina/Buenos_Aires");
set_time_limit(0);

$fec = isset($_GET['fecha']) ? intval($_GET['fecha']) : 0;

$response = [];

$units = [
    "alt" => "m",
    "temp" => "°C",
    "pressure" => "hPa",
    "humidity" => "%",
    "speed" => "km/h",
    "deg" => "°",
    "gust" => "km/h",
    "rad" => "W/m²"
];

if ($fec < 20240101) {
    http_response_code(400);
    $response[] = ["Error" => "Para datos anteriores al 2024 solicitar a jorgeforciniti@eeaoc.org.ar"];
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$conexion) {
    http_response_code(500);
    echo json_encode(["Error" => "Error de conexión a la base de datos"]);
    exit;
}

$query = "SELECT fecha, hora, estaciones.lat, estaciones.lon, estaciones.alt, estaciones.nombre,
    estaciones.identificacion, Temp_HAF, Temp_LAF, Lluvia, datos_estaciones.Presion,
    Rad_Solar, datos_estaciones.Hum_AF, datos_estaciones.Viento_medio, datos_estaciones.Viento_Max,
    Direccion_VMed, Direccion_VMax, marca, localidad, departamento, provincia, tiempo,
    datos_estaciones.ultregrecibido
FROM datos_estaciones
INNER JOIN estaciones ON datos_estaciones.Identificacion = estaciones.Identificacion
WHERE fecha = $fec AND estaciones.habilitada > 0 AND smn";

$result = $conexion->query($query);

if (!$result || $result->num_rows === 0) {
    echo json_encode(["Error" => "No se encontraron datos para la fecha proporcionada."], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = [];
$lastId = null;
$lastHour = null;

$diaIso = substr($fec, 0, 4) . '-' . substr($fec, 4, 2) . '-' . substr($fec, 6, 2);
$bajas = function_exists("depuracionBajas") ? depuracionBajas($conexion, null, $diaIso, $diaIso) : array();
while ($row = $result->fetch_assoc()) {
    if ($bajas) depuracionAnularRegistro($row, $bajas);

    $id = $row['identificacion'];
    $hora = $row['hora'];

    if (!isset($data[$id]) || $hora > $lastHour) {
        $station = [
            "name" => $row['nombre'],
            "id" => $id,
            "lon" => floatval($row['lon']),
            "lat" => floatval($row['lat']),
            "alt" => floatval($row['alt']),
            "marca" => $row['marca'],
            "propietario" => "EEAOC",
            "localidad" => trim($row['localidad'] . " " . $row['departamento'] . " " . $row['provincia']),
            "tiempo" => $row['tiempo']
        ];

        $obs = [
            "horaLocal" => $hora,
            "fechaUTC" => gmdate('d.m.Y H:i', strtotime($row['ultregrecibido'])),
            "tempMax" => is_numeric($row['Temp_HAF']) ? floatval($row['Temp_HAF']) : -99.9,
            "tempMin" => is_numeric($row['Temp_LAF']) ? floatval($row['Temp_LAF']) : -99.9,
            "lluvia" => is_numeric($row['Lluvia']) ? floatval($row['Lluvia']) : -99.9,
            "radSolar" => is_numeric($row['Rad_Solar']) ? floatval($row['Rad_Solar']) : -99.9,
            "humRel" => is_numeric($row['Hum_AF']) ? floatval($row['Hum_AF']) : -99.9,
            "vientoMax" => is_numeric($row['Viento_Max']) ? floatval($row['Viento_Max']) : -99.9,
            "vientoMedio" => is_numeric($row['Viento_medio']) ? floatval($row['Viento_medio']) : -99.9,
            "dirVientoMed" => is_numeric($row['Direccion_VMed']) ? floatval($row['Direccion_VMed']) : -99.9,
            "dirVientoMax" => is_numeric($row['Direccion_VMax']) ? floatval($row['Direccion_VMax']) : -99.9
        ];

        $timestamp = gmdate('d.m.Y H:i', strtotime($row['ultregrecibido']));
        $data[$id] = [
            "station" => $station,
            "Units" => $units,
            $timestamp => $obs
        ];

        $lastId = $id;
        $lastHour = $hora;
    }
}

mysqli_close($conexion);

// Función para convertir a UTF-8 sin mbstring
function utf8ize($mixed) {
    if (is_array($mixed)) {
        foreach ($mixed as $k => $v) {
            $mixed[$k] = utf8ize($v);
        }
    } elseif (is_string($mixed)) {
        return utf8_encode($mixed); // reemplazo de mb_convert_encoding
    }
    return $mixed;
}

$data = utf8ize($data);

// Intentar codificar y capturar errores
$output = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
if ($output === false) {
    echo json_encode(["Error JSON" => json_last_error_msg()]);
    exit;
}

echo $output;
