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
$db="estaciones";
require_once 'conecta_mysql.php'; // Se espera que ahí estén las variables $conexion

mysqli_set_charset($conexion, 'utf8');

// Sensores dados de baja: sus campos no se mandan (ver depuracion.php)
require_once 'depuracion.php';

function validarFecha($fecha) {
    $d = DateTime::createFromFormat('Y-m-d', $fecha);
    return $d && $d->format('Y-m-d') === $fecha;
}

$desde = isset($_GET['desde']) ? $_GET['desde'] : null;
$hasta = isset($_GET['hasta']) ? $_GET['hasta'] : null;

$desde = (validarFecha($desde)) ? $desde : null;
$hasta = (validarFecha($hasta)) ? $hasta : null;

$estacion = isset($_GET['estacion']) ? filter_var($_GET['estacion'], FILTER_SANITIZE_NUMBER_INT) : null;

if (is_null($estacion) || is_null($desde) || is_null($hasta)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Faltan parámetros requeridos: estacion, desde o hasta.'
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
        fecha,
        temp_max,
        temp_min,
        HR_max,
        HR_min,
        rr_24,
        presion_media_24,
        viento_medio,
        viento_max,
        rad_solar_media,
        rad_solar_max,
        et,
        hum_hoja_hs 
        FROM datos_diarios 
        where identificacion=$estacion and fecha>='$desde' and fecha<='$hasta'";

$result = $conexion->query($sql);
$bajas = depuracionBajas($conexion, $estacion, $desde, $hasta);

// Verificar resultados
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $fila = [
            'fecha' => (string)$row['fecha'],
            'temp_max' => (float)$row['temp_max'],
            'temp_min' => (float)$row['temp_min'],
            'HR_max' => (int)$row['HR_max'],
            'HR_min' => (int)$row['HR_min'],
            'rr_24' => (float)$row['rr_24'],
            'presion_media_24' => (float)$row['presion_media_24'],
            'viento_medio' => (float)$row['viento_medio'],
            'viento_max' => (float)$row['viento_max'],
            'rad_solar_media' => (float)$row['rad_solar_media'],
            'rad_solar_max' => (float)$row['rad_solar_max'],
            'et' => (float)$row['et'],
            'hum_hoja_hs' => (float)$row['hum_hoja_hs']
        ];
        depuracionLimpiarDia($fila, $bajas, $estacion, $row['fecha'], DEPURACION_CAMPOS_DIARIOS);
        $response[] = $fila;
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

?>
