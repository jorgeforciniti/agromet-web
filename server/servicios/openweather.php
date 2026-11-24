<?php
/*
 * No es un servicio: lo usan forecast.php y now.php para pedirle datos a OpenWeatherMap con caché.
 *
 * Todos los pedidos (el sitio, los mosaicos del mapa y la app móvil) salen de la misma cuenta de
 * OpenWeatherMap. Si se pasa del límite del plan, OpenWeatherMap la bloquea por un tiempo (HTTP 429)
 * y el pronóstico deja de verse en todos lados (pasó en noviembre de 2026). Por eso:
 *   - cada respuesta se guarda en la carpeta temporal de PHP por coordenada redondeada a 0,01°
 *     (~1 km), durante los minutos que indique cada servicio;
 *   - si OpenWeatherMap no responde o rechaza el pedido, se manda la última copia guardada (hasta
 *     OWM_HORAS_COPIA_VENCIDA horas);
 *   - con un 429 no se le vuelve a pedir nada durante OWM_MINUTOS_PAUSA_429 minutos, para no
 *     estirar el bloqueo.
 * La cabecera X-Cache dice de dónde salió la respuesta: guardada, nueva o vencida.
 *
 * La clave va en openweather-clave.php (no está en el repositorio; ver openweather-clave.ejemplo.php).
 */

/** Horas que se usa una copia vencida si OpenWeatherMap no responde */
const OWM_HORAS_COPIA_VENCIDA = 12;
/** Minutos sin pedirle nada a OpenWeatherMap después de un 429 */
const OWM_MINUTOS_PAUSA_429 = 15;

function owm_responder_error($codigo, $mensaje)
{
    http_response_code($codigo);
    header('Cache-Control: no-store');
    echo json_encode(array('error' => $mensaje));
    exit;
}

/** Manda la respuesta guardada en $archivo, con la cabecera X-Cache y max-age según su vigencia */
function owm_responder_copia($archivo, $origen, $segundosVigencia)
{
    header('X-Cache: ' . $origen);
    header('Cache-Control: public, max-age=' . max(60, (int)$segundosVigencia));
    readfile($archivo);
    exit;
}

/**
 * Pide $endpoint (forecast o weather) para las coordenadas de ?lat= y ?lon= y lo manda tal cual
 * (JSON de OpenWeatherMap, en métrico y en español). Corta el script.
 */
function owm_proxy($endpoint, $minutosCache)
{
    header('Content-Type: application/json; charset=utf-8');
    // Como los demás servicios: la app del celular lo pide desde otro origen (https://localhost)
    header('Access-Control-Allow-Origin: *');

    $lat = isset($_GET['lat']) ? floatval($_GET['lat']) : 0;
    $lon = isset($_GET['lon']) ? floatval($_GET['lon']) : 0;
    if (!$lat || !$lon || abs($lat) > 90 || abs($lon) > 180) {
        owm_responder_error(400, 'coords required');
    }
    // %F no depende del locale (con %f o al pasar el float a texto podría salir una coma decimal)
    $lat = sprintf('%.2F', $lat);
    $lon = sprintf('%.2F', $lon);

    $carpeta = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR;
    $archivo = $carpeta . "agromet-owm-{$endpoint}-{$lat}_{$lon}.json";
    $archivoPausa = $carpeta . 'agromet-owm-pausa-429';
    $edad = is_readable($archivo) ? time() - filemtime($archivo) : null;

    // 1) Copia vigente
    if ($edad !== null && $edad < $minutosCache * 60) {
        owm_responder_copia($archivo, 'guardada', $minutosCache * 60 - $edad);
    }

    // 2) OpenWeatherMap, salvo que esté en pausa por un 429 reciente
    $codigo = 0;
    $respuesta = false;
    $enPausa = is_file($archivoPausa) && time() - filemtime($archivoPausa) < OWM_MINUTOS_PAUSA_429 * 60;
    if (!$enPausa) {
        if (!is_file(__DIR__ . '/openweather-clave.php')) {
            owm_responder_error(500, 'Instalación incompleta en el servidor: falta openweather-clave.php.');
        }
        require __DIR__ . '/openweather-clave.php'; // define $owmClave
        $url = "https://api.openweathermap.org/data/2.5/{$endpoint}?lat={$lat}&lon={$lon}&units=metric&lang=es&appid="
             . urlencode($owmClave);
        $contexto = stream_context_create(array('http' => array(
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: PHP\r\n",
            'ignore_errors' => true, // para leer el código aunque no sea 200
        )));
        $respuesta = @file_get_contents($url, false, $contexto);
        if (isset($http_response_header[0]) && preg_match('#^HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) {
            $codigo = (int)$m[1];
        }
        if ($codigo === 429) {
            @touch($archivoPausa);
        }
    }

    if ($respuesta !== false && $codigo === 200 && json_decode($respuesta) !== null) {
        @file_put_contents($archivo, $respuesta, LOCK_EX);
        header('X-Cache: nueva');
        header('Cache-Control: public, max-age=' . ($minutosCache * 60));
        echo $respuesta;
        exit;
    }

    // 3) Falló: la última copia, si no es demasiado vieja
    if ($edad !== null && $edad < OWM_HORAS_COPIA_VENCIDA * 3600) {
        owm_responder_copia($archivo, 'vencida', 300);
    }
    error_log("openweather.php: $endpoint sin respuesta (HTTP $codigo" . ($enPausa ? ', en pausa por 429' : '') . ')');
    owm_responder_error(502, 'API request failed');
}
