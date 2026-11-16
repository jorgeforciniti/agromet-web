<?php

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

error_reporting(E_ALL);
ini_set('display_errors', 0);

date_default_timezone_set('America/Argentina/Buenos_Aires');

$db = "estaciones";
require_once 'conecta_mysql.php';

// Sensores dados de baja: sus campos no se mandan (ver depuracion.php)
require_once 'depuracion.php';

mysqli_set_charset($conexion, 'utf8');

function validarFecha($fecha)
{
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    return $d && $d->format('Y-m-d') === $fecha;
}

function traeDirViento($dir)
{
    switch ((int) $dir) {
        case 0:
            return "CALMA";
        case 1:
            return "N";
        case 2:
            return "NNE";
        case 3:
            return "NE";
        case 4:
            return "ENE";
        case 5:
            return "E";
        case 6:
            return "ESE";
        case 7:
            return "SE";
        case 8:
            return "SSE";
        case 9:
            return "S";
        case 10:
            return "SSW";
        case 11:
            return "SW";
        case 12:
            return "WSW";
        case 13:
            return "W";
        case 14:
            return "WNW";
        case 15:
            return "NW";
        case 16:
            return "NNW";
        default:
            return "---";
    }
}

function safeFloat($value)
{
    return is_numeric($value) ? (float) $value : null;
}

function safeInt($value)
{
    return is_numeric($value) ? (int) $value : null;
}

$desde = isset($_GET['desde']) ? $_GET['desde'] : null;
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : null;
$estacion = isset($_GET['estacion']) ? filter_var($_GET['estacion'], FILTER_SANITIZE_NUMBER_INT) : null;

$desde = validarFecha($desde) ? $desde : null;
$hasta = validarFecha($hasta) ? $hasta : null;

if (is_null($estacion) || is_null($desde) || is_null($hasta)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Faltan parametros requeridos: estacion, desde o hasta.'
    ]);
    exit;
}

if ($desde > $hasta) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'El parametro desde no puede ser mayor que hasta.'
    ]);
    exit;
}

if (!$conexion) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error de conexion a la base de datos.'
    ]);
    exit;
}

$sql = "SELECT
            Fecha,
            Hora,
            Temp_AF,
            Temp_HAF,
            Temp_LAF,
            Lluvia,
            Tasa_Lluvia,
            Presion,
            Temp_AD,
            Hum_AD,
            Hum_AF,
            Viento_Medio,
            Viento_Max,
            Direccion_VMax,
            Direccion_VMed,
            ET,
            Rad_Solar,
            Rad_Solar_H,
            Pronostico,
            Hum_Hoja,
            Temperatura_Suelo1,
            Temperatura_Suelo2,
            Temperatura_Suelo3,
            Temperatura_suelo4,
            Hum_Suelo1,
            Hum_Suelo2,
            Hum_Suelo3,
            ultregrecibido
        FROM datos_estaciones
        WHERE Identificacion = $estacion
          AND Fecha >= '$desde'
          AND Fecha <= '$hasta'
        ORDER BY Fecha, Hora";

$result = $conexion->query($sql);

if (!$result) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error en la consulta de datos.'
    ]);
    exit;
}

$response = [];
$bajas = depuracionBajas($conexion, $estacion, $desde, $hasta);

while ($row = $result->fetch_assoc()) {
    $fila = [
        'fecha' => (string) $row['Fecha'],
        'hora' => (string) $row['Hora'],
        'temp_af' => safeFloat($row['Temp_AF']),
        'temp_haf' => safeFloat($row['Temp_HAF']),
        'temp_laf' => safeFloat($row['Temp_LAF']),
        'lluvia' => safeFloat($row['Lluvia']),
        'tasa_lluvia' => safeFloat($row['Tasa_Lluvia']),
        'presion' => safeFloat($row['Presion']),
        'temp_ad' => safeFloat($row['Temp_AD']),
        'hum_ad' => safeInt($row['Hum_AD']),
        'hum_af' => safeInt($row['Hum_AF']),
        'viento_medio' => safeFloat($row['Viento_Medio']),
        'viento_max' => safeFloat($row['Viento_Max']),
        'direccion_vmax' => safeInt($row['Direccion_VMax']),
        'direccion_vmed' => safeInt($row['Direccion_VMed']),
        'direccion' => traeDirViento($row['Direccion_VMed']),
        'et' => safeFloat($row['ET']),
        'rad_solar' => safeFloat($row['Rad_Solar']),
        'rad_solar_h' => safeFloat($row['Rad_Solar_H']),
        'pronostico' => safeInt($row['Pronostico']),
        'hum_hoja' => safeInt($row['Hum_Hoja']),
        'temperatura_suelo1' => safeFloat($row['Temperatura_Suelo1']),
        'temperatura_suelo2' => safeFloat($row['Temperatura_Suelo2']),
        'temperatura_suelo3' => safeFloat($row['Temperatura_Suelo3']),
        'temperatura_suelo4' => safeFloat($row['Temperatura_suelo4']),
        'hum_suelo1' => safeInt($row['Hum_Suelo1']),
        'hum_suelo2' => safeInt($row['Hum_Suelo2']),
        'hum_suelo3' => safeInt($row['Hum_Suelo3']),
        'ultregrecibido' => isset($row['ultregrecibido']) ? (string) $row['ultregrecibido'] : null
    ];
    depuracionLimpiarDia($fila, $bajas, $estacion, $row['Fecha'], DEPURACION_CAMPOS_REGISTRO);
    $response[] = $fila;
}

$conexion->close();

echo json_encode([
    'status' => 'success',
    'data' => $response
]);

?>
