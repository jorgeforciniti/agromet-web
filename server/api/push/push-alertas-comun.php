<?php
/*
 * Definición de las alertas a medida, compartida por push-alertas.php (la app las crea y borra) y
 * verificar-alertas-push.php (la tarea programada que avisa).
 */

/* Máximo de alertas por celular: pocas y claras, para no llenar de avisos */
define("ALERTAS_MAXIMO", 5);

/* Una misma alerta no vuelve a avisar antes de estas horas */
define("ALERTAS_HORAS_ENTRE_AVISOS", 12);

/*
 * variable => [texto para la app, unidad, mínimo y máximo permitidos para el umbral, campo de la tabla
 * estaciones (null: pronóstico) y si avisa cuando el valor baja del umbral].
 */
function alertas_variables() {
    return array(
        "temp_bajo" => array("texto" => "Temperatura por debajo de", "unidad" => "°C", "min" => -15, "max" => 20, "campo" => "temp_af", "bajo" => true),
        "temp_sobre" => array("texto" => "Temperatura por encima de", "unidad" => "°C", "min" => 20, "max" => 50, "campo" => "temp_af", "bajo" => false),
        "lluvia_dia" => array("texto" => "Lluvia del día mayor a", "unidad" => "mm", "min" => 1, "max" => 300, "campo" => "RR_dia", "bajo" => false),
        "rafaga" => array("texto" => "Ráfaga mayor a", "unidad" => "km/h", "min" => 10, "max" => 150, "campo" => "viento_max", "bajo" => false),
        "helada_pronostico" => array("texto" => "Helada pronosticada esta noche (mínima ≤)", "unidad" => "°C", "min" => -10, "max" => 5, "campo" => null, "bajo" => true),
    );
}

/* CORS y JSON para los PHP que llama la app */
function alertas_cabeceras() {
    header("Content-Type: application/json; charset=utf-8");
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    if (isset($_SERVER["REQUEST_METHOD"]) && $_SERVER["REQUEST_METHOD"] === "OPTIONS") {
        exit;
    }
}

function alertas_json($datos, $codigo = 200) {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}
