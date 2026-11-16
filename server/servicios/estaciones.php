<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

// Conectar a la base de datos
$db = "estaciones";
include("conecta_mysql.php");

// Sensores dados de baja: sus campos no se mandan (ver depuracion.php)
require_once 'depuracion.php';

if (!$conexion) {
    http_response_code(500);
    echo json_encode(["error" => "No se pudo conectar a la base de datos."]);
    exit;
}

mysqli_set_charset($conexion, "utf8");
date_default_timezone_set("America/Argentina/Buenos_Aires");

// Obtener y validar el parámetro GET 'habilitada'
$habilitada = filter_input(INPUT_GET, 'habilitada', FILTER_VALIDATE_INT);
if ($habilitada === false || $habilitada === null) {
    $habilitada = 0; // valor por defecto
}

$hoy = date("Ymd");

// Seleccionar la consulta según el valor de "habilitada"
switch ($habilitada) {
    case 1:
        $query = "SELECT * FROM estaciones WHERE habilitada > 0 ORDER BY nombre";
        break;
    case 2:
        $query = "SELECT * FROM estaciones WHERE habilitada > 0 AND DATE_FORMAT(fecha_I, '%Y%m%d') = '$hoy' ORDER BY nombre";
        break;
    case 0:
    default:
        $query = "SELECT * FROM estaciones ORDER BY nombre";
        break;
}

// ?estacion=<id>: sólo esa estación, esté o no habilitada (la usa la app móvil)
$estacion = filter_input(INPUT_GET, 'estacion', FILTER_VALIDATE_INT);
if ($estacion) {
    $query = "SELECT * FROM estaciones WHERE Identificacion = $estacion";
}

$resultado = $conexion->query($query);
if (!$resultado) {
    http_response_code(500);
    echo json_encode(["error" => "Error en la consulta: " . $conexion->error]);
    mysqli_close($conexion);
    exit;
}

$arr = [];
$bajas = depuracionBajas($conexion);

// Campos para sanitizar valores centinela
$fieldsToCheck = ['temp_af', 'hum_af', 'RR_dia', 'viento_medio', 'viento_max'];

// Valores centinela
$sentinels = [10000.0, -999.9];

// Recorrer el resultado y poblar el arreglo
while ($fila = $resultado->fetch_assoc()) {
    // Convertir y filtrar valores centinela
    foreach ($fieldsToCheck as $field) {
        if (isset($fila[$field])) {
            $val = (float) $fila[$field];
            if (in_array($val, $sentinels, true)) {
                $fila[$field] = null;
            }
        }
    }
    depuracionLimpiarActual($fila, $bajas, $fila['Identificacion'], $fila['fecha_I']);
    $arr[] = $fila;
}

mysqli_close($conexion);
echo json_encode($arr);
?>
