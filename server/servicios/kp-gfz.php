<?php
/*
 * Proxy del índice Kp de GFZ Potsdam (https://kp.gfz.de/app/json/), que no permite CORS y el
 * navegador no puede leer directo. Lo usa «Condiciones para aplicar» para tomar el Kp del intervalo
 * de 3 h de cada registro en fechas de más de una semana (para la última semana usa NOAA).
 * Va en /services/. No usa la base de datos.
 *
 * GET kp-gfz.php?start=2026-10-01T03:00:00Z&end=2026-10-02T03:00:00Z&index=Kp
 *   - bien:  la respuesta de GFZ tal cual: {"Kp":[...],"datetime":[...],"meta":{...},"status":[...]}
 *   - error: {"status":"error","message":"..."} con código 400 o 502
 * Acepta hasta 31 días e index=Kp solamente.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

error_reporting(E_ALL);
ini_set('display_errors', 0);

const URL_GFZ = 'https://kp.gfz.de/app/json/';
const MAX_DIAS = 31;
const TIEMPO_MAXIMO = 10; // segundos para esperar a GFZ

function error_json($codigo, $mensaje)
{
    http_response_code($codigo);
    header('Cache-Control: no-store');
    echo json_encode(['status' => 'error', 'message' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}

// 1) Parámetros: fechas UTC sin milisegundos («2026-10-01T03:00:00Z»), como las manda el sitio
$start = isset($_GET['start']) ? $_GET['start'] : '';
$end = isset($_GET['end']) ? $_GET['end'] : '';
$index = isset($_GET['index']) ? $_GET['index'] : 'Kp';
$formato = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/';
if (!preg_match($formato, $start) || !preg_match($formato, $end)) {
    error_json(400, "Parámetros 'start' y 'end' inválidos. Use AAAA-MM-DDThh:mm:ssZ.");
}
if ($index !== 'Kp') {
    error_json(400, "Sólo se acepta index=Kp.");
}
$desde = strtotime($start);
$hasta = strtotime($end);
if ($desde === false || $hasta === false || $hasta < $desde) {
    error_json(400, 'Período inválido.');
}
if ($hasta - $desde > MAX_DIAS * 86400) {
    error_json(400, 'El período no puede superar ' . MAX_DIAS . ' días.');
}

// 2) Pedido a GFZ (con cURL; si no está, con file_get_contents)
$url = URL_GFZ . '?' . http_build_query(['start' => $start, 'end' => $end, 'index' => 'Kp']);
$cuerpo = false;
$codigo = 0;
if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => TIEMPO_MAXIMO,
        CURLOPT_USERAGENT => 'agromet.eeaoc.gob.ar',
    ]);
    $cuerpo = curl_exec($ch);
    $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $contexto = stream_context_create(['http' => [
        'timeout' => TIEMPO_MAXIMO,
        'user_agent' => 'agromet.eeaoc.gob.ar',
        'ignore_errors' => true,
    ]]);
    $cuerpo = @file_get_contents($url, false, $contexto);
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $codigo = (int)$m[1];
    }
}

// 3) Sólo se reenvía si es un JSON con la forma esperada
$datos = ($cuerpo !== false && $codigo === 200) ? json_decode($cuerpo, true) : null;
if (!is_array($datos) || !isset($datos['datetime']) || !isset($datos['Kp'])) {
    error_json(502, 'No se pudo obtener el Kp de GFZ.');
}

// Los valores de días pasados ya no cambian; los recientes son provisorios («pre»)
$pasado = $hasta < time() - 3 * 86400;
header('Cache-Control: public, max-age=' . ($pasado ? 86400 : 3600));
echo $cuerpo;
