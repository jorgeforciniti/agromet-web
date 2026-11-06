<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

header('Content-Type: application/json; charset=utf-8');

// Validar y sanitizar entrada
// tipo=1 (o sin tipo): alertas por área; tipo=2: avisos de corto plazo vigentes de la provincia.
// Antes se leía filter_var($input, ...) ($input no existe) y se comparaba con «if ($tipo=1)», que asigna:
// cualquier tipo devolvía las alertas.
// Los avisos de corto plazo no van por área: la API (ver /v1/swagger-ui.html) los da por provincia
// (/warning/shortterm?province=<código INDEC>), y devuelve una lista (vacía si no hay avisos vigentes).
const PROVINCIA_TUCUMAN = 90;
$area = isset($_GET['area']) ? filter_var($_GET['area'], FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION) : null;
$tipo = isset($_GET['tipo']) ? (int) filter_var($_GET['tipo'], FILTER_SANITIZE_NUMBER_INT) : 1;

// Verificar que el área esté presente
if ($area === null || $area === '') {
    http_response_code(400);
    echo json_encode([
        "error" => "Parámetro 'area' requerido"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($tipo !== 1 && $tipo !== 2) {
    http_response_code(400);
    echo json_encode([
        "error" => "Parámetro 'tipo' inválido (1: alertas, 2: avisos de corto plazo)"
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Cargar token desde archivo
include "smn_token.php";
$datos = file_get_contents("token.json");
$tk = json_decode($datos, true);
$token = $tk['token'] ?? null;

if (!$token) {
    http_response_code(500);
    echo json_encode([
        "error" => "No se pudo obtener el token"
    ]);
    exit;
}

// Funcion para obtener los datos del SMN
function obtenerDatosDelServidor($token, $area, $tipo) {
    if ($tipo === 1) {
        $url = "https://api-test.smn.gob.ar/v1/warning/alert/area/$area/";
    }else{
        // El área no se usa: los avisos son de toda la provincia (cada uno trae su polígono y sus zonas)
        $url = "https://api-test.smn.gob.ar/v1/warning/shortterm?province=" . PROVINCIA_TUCUMAN;
    }

    $options = [
        "http" => [
            "method" => "GET",
            "header" => "Accept: application/json\r\n" .
                        "Authorization: JWT $token\r\n"
        ]
    ];
    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);

    if ($response === false) {
        return [
            "error" => "No se pudo conectar con el servidor del SMN"
        ];
    }

    $httpCode = null;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('#^HTTP/\d+\.\d+\s+(\d+)#', $header, $matches)) {
                $httpCode = intval($matches[1]);
                break;
            }
        }
    }

    if ($httpCode !== 200) {
        return [
            "error" => "Respuesta inesperada del servidor",
            "status" => $httpCode,
            "respuesta_cruda" => $response
        ];
    }

    $json = json_decode($response, true);
    return $json ?? [ "error" => "No se pudo decodificar la respuesta JSON" ];
}

// Ejecutar y mostrar resultado
$resultado = obtenerDatosDelServidor($token, $area, $tipo);
echo json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
