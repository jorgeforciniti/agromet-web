<?php
/*
 * Normales mensuales de una estación (tabla `normales` de la base `estaciones`).
 * Va en /services/ junto a datos-diarios.php y usa la misma conexión (conecta_mysql.php).
 *
 * GET normales.php?estacion=2049
 *   - con normales:  {"status":"success","estacion":"2049","normales":{"rr":[12 valores],...},
 *                     "periodo":{"desde":1991,"hasta":2020}}   (o "periodo":"1991-2020")
 *   - sin normales:  {"status":"sin_normales","estacion":"2049"}
 * Cada arreglo tiene 12 valores (enero a diciembre); null si el mes no tiene dato.
 *
 * Unidades (según la tabla): rr mm/mes; tl/th °C; hl/hh %; pr hPa; vi/vix km/h;
 * rg/rgx W/m² (media diaria); et mm/día; hj horas/día.
 *
 * Período de referencia: cada estación tiene normales de un período distinto. Si la fila tiene
 * columnas de período (ver buscarPeriodo), se agrega "periodo"; si no, la clave no se envía y
 * el sitio simplemente no lo muestra.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
// Las normales casi no cambian: el navegador puede reutilizar la respuesta un día
header('Cache-Control: public, max-age=86400');

error_reporting(E_ALL);
ini_set('display_errors', 0);

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion

if (!$conexion) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión a la base de datos.']);
    exit;
}
mysqli_set_charset($conexion, 'utf8');

$estacion = isset($_GET['estacion']) ? $_GET['estacion'] : '';
if (!preg_match('/^\d{1,9}$/', $estacion)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Falta el parámetro estacion (numérico).']);
    exit;
}

// Prefijo de la columna en la tabla => clave en la respuesta
$variables = [
    'rr_m' => 'rr',   // lluvia
    'tl_m' => 'tl',   // temperatura mínima
    'th_m' => 'th',   // temperatura máxima
    'Hl_m' => 'hl',   // humedad relativa mínima
    'Hh_m' => 'hh',   // humedad relativa máxima
    'pr_m' => 'pr',   // presión
    'Vi_m' => 'vi',   // viento medio
    'Vi_x' => 'vix',  // viento máximo
    'RG_m' => 'rg',   // radiación global media
    'RG_x' => 'rgx',  // radiación global máxima
    'ET_m' => 'et',   // evapotranspiración
    'Hj_m' => 'hj',   // humedad de hoja
];
$meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

// $id es entero validado arriba: se puede interpolar sin riesgo (y no depende de mysqlnd)
$id = (int)$estacion;
$resultado = $conexion->query("SELECT * FROM normales WHERE identificacion = $id ORDER BY id DESC LIMIT 1");
if ($resultado === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Error en la consulta de normales.']);
    exit;
}
$fila = $resultado->fetch_assoc();
$conexion->close();

if (!$fila) {
    echo json_encode(['status' => 'sin_normales', 'estacion' => $estacion]);
    exit;
}

// MySQL devuelve los nombres de columna como están definidos (Hl_m_ene, RG_x_dic...)
$normales = [];
foreach ($variables as $prefijo => $clave) {
    $valores = [];
    $alguno = false;
    foreach ($meses as $mes) {
        $col = $prefijo . '_' . $mes;
        $v = array_key_exists($col, $fila) ? $fila[$col] : null;
        if ($v === null || $v === '') {
            $valores[] = null;
        } else {
            $valores[] = (float)$v;
            $alguno = true;
        }
    }
    // Una variable sin ningún mes cargado no se envía: el sitio no grafica su normal
    if ($alguno) {
        $normales[$clave] = $valores;
    }
}

if (!$normales) {
    echo json_encode(['status' => 'sin_normales', 'estacion' => $estacion]);
    exit;
}

$respuesta = ['status' => 'success', 'estacion' => $estacion, 'normales' => $normales];
$periodo = buscarPeriodo($fila);
if ($periodo !== null) {
    $respuesta['periodo'] = $periodo;
}
echo json_encode($respuesta);

/**
 * Busca en la fila las columnas del período de referencia (no conocemos el esquema exacto de la
 * tabla, así que se prueban los nombres probables sin distinguir mayúsculas). Devuelve
 * ['desde' => ..., 'hasta' => ...], un texto («1991-2020») o null si no hay nada.
 */
function buscarPeriodo(array $fila)
{
    $columnas = [];
    foreach ($fila as $nombre => $valor) {
        $columnas[strtolower($nombre)] = $valor;
    }
    $valor = function ($nombre) use ($columnas) {
        if (!array_key_exists($nombre, $columnas)) return null;
        $v = trim((string)$columnas[$nombre]);
        return $v === '' ? null : (preg_match('/^\d+$/', $v) ? (int)$v : $v);
    };

    // Pares desde/hasta
    $pares = [
        ['periodo_desde', 'periodo_hasta'],
        ['periodo_inicio', 'periodo_fin'],
        ['anio_desde', 'anio_hasta'],
        ['ano_desde', 'ano_hasta'],
        ['año_desde', 'año_hasta'],
        ['anio_inicio', 'anio_fin'],
        ['ano_inicio', 'ano_fin'],
        ['anio_ini', 'anio_fin'],
        ['desde', 'hasta'],
        ['inicio', 'fin'],
    ];
    foreach ($pares as $par) {
        $desde = $valor($par[0]);
        $hasta = $valor($par[1]);
        if ($desde !== null || $hasta !== null) {
            return ['desde' => $desde, 'hasta' => $hasta];
        }
    }

    // Una sola columna de texto («1991-2020», «30 años»...)
    foreach (['periodo', 'periodo_referencia', 'periodo_ref', 'anios', 'años', 'anos'] as $nombre) {
        $v = $valor($nombre);
        if ($v !== null) {
            return (string)$v;
        }
    }
    return null;
}
