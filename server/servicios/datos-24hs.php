<?php

// Habilitar CORS
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

// Configuración de errores
error_reporting(E_ALL);
ini_set('display_errors', 0); // No mostrar errores al usuario final

// Configuración de zona horaria
date_default_timezone_set('America/Argentina/Buenos_Aires');

// Conexión a la base de datos
$db = "estaciones";
require_once 'conecta_mysql.php'; // Se espera que ahí estén las variables $conexion

mysqli_set_charset($conexion, 'utf8');

function validarFecha($fechas)
{
    $d = DateTime::createFromFormat('Y-m-d', $fechas);
    return $d && $d->format('Y-m-d') === $fechas;
}

function traeDirViento($dir)
{
    switch ($dir) {
        case 0:
            return "CALMA";
            break;
        case 1:
            return "N";
            break;
        case 2:
            return "NNE";
            break;
        case 3:
            return "NE";
            break;
        case 4:
            return "ENE";
            break;
        case 5:
            return "E";
            break;
        case 6:
            return "ESE";
            break;
        case 7:
            return "SE";
            break;
        case 8:
            return "SSE";
            break;
        case 9:
            return "S";
            break;
        case 10:
            return "SSW";
            break;
        case 11:
            return "SW";
            break;
        case 12:
            return "WSW";
            break;
        case 13:
            return "W";
            break;
        case 14:
            return "WNW";
            break;
        case 15:
            return "NW";
            break;
        case 16:
            return "NNW";
            break;
        default:
            return "---";
            break;
    }
}

$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;

$fecha = (validarFecha($fecha)) ? $fecha : null;

$estacion = isset($_GET['estacion']) ? filter_var($_GET['estacion'], FILTER_SANITIZE_NUMBER_INT) : null;

if (is_null($estacion) || is_null($fecha)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Faltan parámetros requeridos: estacion o fecha.' . $fecha . ' - ' . $estacion
    ]);
    exit;
}

// Array de respuesta
$response = [];

// Validar conexión
if (!$conexion) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error de conexión a la base de datos.'
    ]);
    exit;
}

// Consulta de los PDFs creados en los últimos 30 días


$sql = "SELECT 
            hora, 
            temp_af, 
            hum_af, 
            viento_medio, 
            viento_max, 
            lluvia, 
            direccion_vmed,
            Temperatura_Suelo1,
            Temperatura_Suelo2,
            presion 
        FROM datos_estaciones 
        where identificacion=$estacion and fecha='$fecha'
        order by hora";

$result = $conexion->query($sql);

// Verificar resultados
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $dire = traeDirViento((int) $row['direccion_vmed']);
        $response[] = [
            'hora' => (string) $row['hora'],
            'temp_af' => safeFloat($row['temp_af']),
            'hum_af' => safeFloat($row['hum_af']),
            'lluvia' => safeFloat($row['lluvia']),
            'viento_medio' => safeFloat($row['viento_medio']),
            'viento_max' => safeFloat($row['viento_max']),
            'direccion' => $dire,                   // ya es string
            'temp_20' => safeFloat($row['Temperatura_Suelo1']),
            'temp_50' => safeFloat($row['Temperatura_Suelo2']),
            'presion' => safeFloat($row['presion']),
        ];
    }
} else {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Error en la consulta de datos.'
    ]);
    exit;
}

// Cerrar conexión
$conexion->close();

// Enviar respuesta
echo json_encode([
    'status' => 'success',
    'data' => $response
]);

function safeFloat($value): ?float
{
    return is_numeric($value) ? (float) $value : null;   // null o número
}
?>