<?php
// api_datos_estacion_9.php

ini_set('display_errors', 0);
error_reporting(E_ALL);
date_default_timezone_set('America/Argentina/Tucuman');

// ===============================
// BASE DE DATOS
// ===============================
// IMPORTANTE: colocar aquí el nombre real de la base
$db = 'estaciones';

require_once 'conecta_mysql.php';

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
    registrarConsulta($conexion, 'api_el_charco');
}

// La conexión queda disponible como $conexion
if (!$conexion) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'No se pudo conectar a la base de datos'
    ));
    exit;
}

mysqli_set_charset($conexion, 'utf8');

// ===============================
// CONFIGURACIÓN
// ===============================
$IDENTIFICACION = 9;
$MAX_DIAS = 7;

// csv por defecto
$formato = isset($_GET['formato']) ? strtolower(trim($_GET['formato'])) : 'csv';

$fecha = isset($_GET['fecha']) ? trim($_GET['fecha']) : '';
$hora = isset($_GET['hora']) ? trim($_GET['hora']) : '00:00';

if ($fecha === '') {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Debe indicar el parámetro fecha en formato YYYY-MM-DD'
    ));
    exit;
}

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Formato de fecha inválido. Use YYYY-MM-DD'
    ));
    exit;
}

// La hora debe venir en formato HH:MM.
// Si no se informa, se usa 00:00.
if ($hora === '') {
    $hora = '00:00';
}

if (!preg_match('/^\d{2}:\d{2}$/', $hora)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Formato de hora inválido. Use HH:MM'
    ));
    exit;
}

// Convertimos internamente a HH:MM:SS
$hora .= ':00';

$inicio = DateTime::createFromFormat('Y-m-d H:i:s', $fecha . ' ' . $hora);
$erroresFecha = DateTime::getLastErrors();

if (
    $inicio === false ||
    $erroresFecha['warning_count'] > 0 ||
    $erroresFecha['error_count'] > 0
) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Fecha u hora inválida'
    ));
    exit;
}

// Máximo 7 días corridos
$fin = clone $inicio;
$fin->modify('+' . $MAX_DIAS . ' days');

$fecha_inicio = $inicio->format('Y-m-d');
$hora_inicio  = $inicio->format('H:i:s');

$fecha_fin = $fin->format('Y-m-d');
$hora_fin  = $fin->format('H:i:s');

if ($formato !== 'csv' && $formato !== 'json') {
    $formato = 'csv';
}

// ===============================
// CAMPOS
// ===============================
$campos = array(
    'Id',
    'Identificacion',
    'Fecha',
    'Hora',
    'Temp_AF',
    'Temp_HAF',
    'Temp_LAF',
    'Lluvia',
    'Tasa_Lluvia',
    'Presion',
    'Rad_Solar',
    'N_Muestras_Viento',
    'Temp_AD',
    'Hum_AD',
    'Hum_AF',
    'Viento_Medio',
    'Viento_Max',
    'Direccion_VMax',
    'Direccion_VMed',
    'ET',
    'Rad_Solar_H',
    'Pronostico',
    'Hum_Hoja',
    'Temperatura_Suelo1',
    'Temperatura_Suelo2',
    'Temperatura_Suelo3',
    'Temperatura_Suelo4',
    'Hum_Suelo1',
    'Hum_Suelo2',
    'Hum_Suelo3',
    'ultregrecibido'
);

$lista_campos = implode(', ', $campos);

// Sensores dados de baja en el período: sus valores van vacíos (CSV) o en null (JSON)
$bajas = function_exists('depuracionBajas') ? depuracionBajas($conexion, $IDENTIFICACION, $fecha_inicio, $fecha_fin) : array();

// ===============================
// CONSULTA
// ===============================

$sql = "
    SELECT $lista_campos
    FROM datos_estaciones
    WHERE Identificacion = ?
      AND (
            Fecha > ?
            OR (Fecha = ? AND Hora >= ?)
          )
      AND (
            Fecha < ?
            OR (Fecha = ? AND Hora < ?)
          )
    ORDER BY Fecha ASC, Hora ASC
";

$stmt = mysqli_prepare($conexion, $sql);

if (!$stmt) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Error al preparar la consulta',
        'detalle' => mysqli_error($conexion)
    ));
    exit;
}

mysqli_stmt_bind_param(
    $stmt,
    'issssss',
    $IDENTIFICACION,
    $fecha_inicio,
    $fecha_inicio,
    $hora_inicio,
    $fecha_fin,
    $fecha_fin,
    $hora_fin
);

mysqli_stmt_execute($stmt);
$resultado = mysqli_stmt_get_result($stmt);

if (!$resultado) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
        'error' => true,
        'mensaje' => 'Error al ejecutar la consulta',
        'detalle' => mysqli_error($conexion)
    ));
    exit;
}

// ===============================
// SALIDA CSV
// ===============================

if ($formato === 'csv') {
    $nombreArchivo = 'datos_estacion_9_' . $fecha_inicio . '_' . str_replace(':', '-', $hora_inicio) . '.csv';

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $nombreArchivo . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $out = fopen('php://output', 'w');

    // Encabezado
    fputcsv($out, $campos);

    while ($fila = mysqli_fetch_assoc($resultado)) {
        if ($bajas) depuracionAnularRegistro($fila, $bajas);
        $linea = array();

        foreach ($campos as $campo) {
            $linea[] = isset($fila[$campo]) ? $fila[$campo] : '';
        }

        fputcsv($out, $linea);
    }

    fclose($out);
    mysqli_free_result($resultado);
    mysqli_stmt_close($stmt);
    mysqli_close($conexion);
    exit;
}

// ===============================
// SALIDA JSON
// ===============================

$datos = array();

while ($fila = mysqli_fetch_assoc($resultado)) {
    if ($bajas) depuracionAnularRegistro($fila, $bajas);
    $datos[] = $fila;
}

mysqli_free_result($resultado);
mysqli_stmt_close($stmt);
mysqli_close($conexion);

header('Content-Type: application/json; charset=utf-8');

echo json_encode(array(
    'error' => false,
    'identificacion' => $IDENTIFICACION,
    'desde' => $inicio->format('Y-m-d H:i:s'),
    'hasta' => $fin->format('Y-m-d H:i:s'),
    'limite_dias' => $MAX_DIAS,
    'cantidad' => count($datos),
    'datos' => $datos
));
exit;