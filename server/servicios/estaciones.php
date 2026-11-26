<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

// Obtener y validar los parámetros GET 'habilitada' y 'estacion' (antes de abrir la conexión, para poder usar el caché)
$habilitada = filter_input(INPUT_GET, 'habilitada', FILTER_VALIDATE_INT);
if ($habilitada === false || $habilitada === null) {
    $habilitada = 0; // valor por defecto
}
// ?estacion=<id>: sólo esa estación, esté o no habilitada (la usa la app móvil)
$estacion = filter_input(INPUT_GET, 'estacion', FILTER_VALIDATE_INT);

// Caché en disco de 30 s: la web y la app piden esta lista muy seguido y casi no cambia (los datos llegan cada
// 15 minutos). Los pedidos repetidos se responden sin abrir conexión a la base. Si el archivo no se puede leer
// o escribir, la API funciona igual y consulta la base.
const CACHE_ESTACIONES_SEGUNDOS = 30;
$archivoCache = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'agromet_services_estaciones_'
    . md5($habilitada . '|' . ($estacion ? $estacion : 0)) . '.json';
if (is_file($archivoCache) && (time() - (int) @filemtime($archivoCache)) < CACHE_ESTACIONES_SEGUNDOS) {
    $enCache = @file_get_contents($archivoCache);
    if ($enCache !== false && $enCache !== '') {
        header('X-Cache: HIT');
        echo $enCache;
        exit;
    }
}

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
$json = json_encode($arr);
header('X-Cache: MISS');
echo $json;

// Guardar en el caché: se escribe un archivo temporal y se renombra, para que nadie lea un archivo a medio escribir
if ($json !== false && $json !== '') {
    $temporal = $archivoCache . '.' . getmypid() . '.tmp';
    if (@file_put_contents($temporal, $json) !== false && !@rename($temporal, $archivoCache)) {
        @unlink($temporal);
    }
}
?>
