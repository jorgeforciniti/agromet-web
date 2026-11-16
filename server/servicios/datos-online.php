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

// Sensores dados de baja: sus campos no se mandan (ver depuracion.php)
require_once 'depuracion.php';

mysqli_set_charset($conexion, 'utf8');

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
$sql = "SELECT identificacion,nombre,lat,lon,alt,fecha_i,temp_af,hum_af,rr_dia,rr_mes,presion,pronostico, viento_medio, viento_max, direc, rafaga24 
                FROM estaciones 
                WHERE habilitada>0 
                order by nombre";

$result = $conexion->query($sql);

// Verificar resultados
if ($result) {
    $bajas = depuracionBajas($conexion);
    while ($row = $result->fetch_assoc()) {
        $fila = [
            'identificacion' => (int)$row['identificacion'],
            'nombre' => trim($row['nombre']),
            'lat' => trim($row['lat']),
            'lon' => trim($row['lon']),
            'alt' => trim($row['alt']),
            'fecha_i' => trim($row['fecha_i']),
            'temp_af' => $row['temp_af'],
            'hum_af' => trim($row['hum_af']),
            'rr_dia' => (float)$row['rr_dia'],
            'rr_mes' => (float)$row['rr_mes'],
            'presion' => (float)$row['presion'],
            'viento_medio' => (float)$row['viento_medio'],
            'viento_max' => (float)$row['viento_max'],
            'direc' => (int)$row['direc'],
            'rafaga24' => trim($row['rafaga24'])
        ];
        depuracionLimpiarActual($fila, $bajas, $row['identificacion'], $row['fecha_i']);
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
