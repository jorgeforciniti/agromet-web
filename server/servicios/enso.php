<?php
/*
 * Índice RONI (Relative Oceanic Niño Index) de NOAA CPC y estado del ENSO (El Niño / La Niña).
 * Lo usan la sección «El Niño» de El Colmenar (/estadisticas-historicas) y la tarjeta de Estado actual.
 * Va en /services/. No usa la base de datos.
 *
 * Se actualiza solo: baja la tabla RONI y el estado de alerta de CPC y los guarda en caché (en la carpeta
 * temporal del servidor) por CACHE_HORAS. Si NOAA no responde, usa la última copia guardada y, si no hay,
 * la tabla fija de este archivo ($RONI_FIJO), que conviene renovar de vez en cuando (ver LEEME.md).
 *
 * GET enso.php
 *   {"status":"success","indice":"RONI","origen":"noaa|cache|fijo","actualizado":"2026-11-11",
 *    "temporadas":["DJF",...,"NDJ"],"datos":[{"anio":1950,"valores":[12 valores]},...],
 *    "estado":{"alerta":"...","fecha_discusion":"2026-10-08","proxima_discusion":"2026-11-12","resumen":"...","url":"..."}}
 * Cada valor es la media móvil de 3 meses (DJF = dic–ene–feb, centrada en enero); null si todavía no se
 * publicó. Desde 2026 CPC clasifica los eventos con el RONI (base 1991–2020) en lugar del ONI.
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

error_reporting(E_ALL);
ini_set('display_errors', 0);

const URL_RONI = 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt';
const URL_DISCUSION = 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml';
const CACHE_HORAS = 24;
const TIEMPO_MAXIMO = 10; // segundos para esperar a NOAA
const TEMPORADAS = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];

// Copia fija de RONI.ascii.txt (respaldo si NOAA no responde y no hay caché)
const FIJO_ACTUALIZADO = '2026-11-11';
$RONI_FIJO = [
    1950 => [-1.19, -1.08, -0.96, -1.00, -0.99, -0.75, -0.38, -0.32, -0.29, -0.38, -0.36, -0.50],
    1951 => [-0.28,  0.09,  0.48,  0.63,  0.59,  0.69,  0.79,  0.97,  1.04,  0.98,  0.94,  0.71],
    1952 => [ 0.65,  0.33,  0.46,  0.24, -0.03, -0.45, -0.41, -0.14,  0.08,  0.04, -0.10,  0.10],
    1953 => [ 0.40,  0.67,  0.68,  0.72,  0.94,  0.84,  0.68,  0.73,  0.65,  0.84,  0.57,  0.66],
    1954 => [ 0.63,  0.63,  0.31, -0.02, -0.24, -0.21, -0.45, -0.62, -0.54, -0.31, -0.09, -0.18],
    1955 => [-0.12, -0.14, -0.13, -0.38, -0.36, -0.52, -0.40, -0.70, -0.90, -1.31, -1.40, -1.31],
    1956 => [-0.81, -0.40, -0.12, -0.09, -0.03, -0.01, -0.15, -0.18, -0.12, -0.14, -0.14, -0.17],
    1957 => [ 0.00,  0.22,  0.53,  0.83,  0.88,  0.90,  1.03,  1.05,  1.14,  1.16,  1.45,  1.75],
    1958 => [ 1.89,  1.79,  1.31,  0.95,  0.66,  0.56,  0.45,  0.26,  0.23,  0.24,  0.36,  0.64],
    1959 => [ 0.77,  0.83,  0.64,  0.48,  0.33,  0.09, -0.11, -0.23, -0.07,  0.04,  0.24,  0.22],
    1960 => [ 0.20,  0.19,  0.21,  0.25,  0.16,  0.06,  0.12,  0.20,  0.26,  0.08, -0.07, -0.09],
    1961 => [ 0.03,  0.08,  0.03,  0.06,  0.24,  0.30,  0.20, -0.07, -0.23, -0.16, -0.06,  0.02],
    1962 => [-0.01, -0.01,  0.00, -0.16, -0.17, -0.14,  0.01, -0.10, -0.15, -0.30, -0.29, -0.37],
    1963 => [-0.29, -0.12,  0.04,  0.06,  0.01,  0.37,  0.73,  1.08,  1.07,  1.06,  1.11,  1.07],
    1964 => [ 1.00,  0.60,  0.10, -0.37, -0.66, -0.66, -0.59, -0.55, -0.53, -0.64, -0.58, -0.48],
    1965 => [-0.16,  0.10,  0.22,  0.36,  0.64,  1.01,  1.33,  1.49,  1.76,  1.86,  1.99,  1.81],
    1966 => [ 1.53,  1.29,  1.04,  0.59,  0.31,  0.22,  0.32,  0.19,  0.00, -0.03, -0.12, -0.22],
    1967 => [-0.26, -0.24, -0.35, -0.31, -0.09,  0.21,  0.25, -0.01, -0.11, -0.08,  0.01, -0.03],
    1968 => [-0.23, -0.36, -0.32, -0.26,  0.07,  0.32,  0.56,  0.46,  0.39,  0.56,  0.74,  1.02],
    1969 => [ 1.07,  1.00,  0.67,  0.44,  0.37,  0.30,  0.28,  0.34,  0.57,  0.67,  0.81,  0.68],
    1970 => [ 0.46,  0.21,  0.24,  0.24,  0.12, -0.23, -0.47, -0.64, -0.55, -0.57, -0.55, -0.85],
    1971 => [-0.95, -1.00, -0.78, -0.57, -0.48, -0.37, -0.30, -0.25, -0.30, -0.40, -0.41, -0.38],
    1972 => [-0.21,  0.03,  0.32,  0.51,  0.66,  0.87,  1.14,  1.40,  1.64,  1.82,  1.97,  1.88],
    1973 => [ 1.69,  1.25,  0.58, -0.17, -0.73, -0.98, -1.10, -1.19, -1.30, -1.63, -1.86, -1.91],
    1974 => [-1.60, -1.28, -0.97, -0.84, -0.57, -0.50, -0.27, -0.21, -0.24, -0.45, -0.59, -0.35],
    1975 => [-0.12, -0.13, -0.29, -0.42, -0.61, -0.73, -0.87, -0.88, -0.98, -0.95, -1.02, -1.11],
    1976 => [-1.00, -0.65, -0.26, -0.14,  0.01,  0.27,  0.52,  0.72,  0.89,  1.04,  1.05,  1.08],
    1977 => [ 0.96,  0.89,  0.46,  0.32,  0.25,  0.51,  0.48,  0.48,  0.62,  0.89,  1.10,  1.05],
    1978 => [ 0.96,  0.71,  0.26, -0.07, -0.33, -0.25, -0.32, -0.27, -0.27, -0.08,  0.15,  0.27],
    1979 => [ 0.35,  0.30,  0.30,  0.23,  0.13,  0.03,  0.04,  0.26,  0.41,  0.52,  0.52,  0.64],
    1980 => [ 0.65,  0.45,  0.25,  0.14,  0.27,  0.28,  0.14, -0.10, -0.18, -0.06,  0.14,  0.09],
    1981 => [-0.03, -0.18, -0.28, -0.24, -0.30, -0.26, -0.23, -0.16, -0.02, -0.17, -0.21, -0.08],
    1982 => [ 0.11,  0.22,  0.23,  0.46,  0.74,  0.84,  0.89,  1.14,  1.64,  2.03,  2.24,  2.36],
    1983 => [ 2.40,  2.15,  1.67,  1.30,  0.87,  0.47,  0.03, -0.23, -0.59, -0.90, -1.10, -0.96],
    1984 => [-0.63, -0.52, -0.45, -0.59, -0.62, -0.51, -0.32, -0.17, -0.28, -0.61, -0.88, -0.93],
    1985 => [-0.83, -0.68, -0.75, -0.76, -0.77, -0.55, -0.33, -0.20, -0.16, -0.18, -0.14, -0.21],
    1986 => [-0.26, -0.27, -0.19, -0.14, -0.11, -0.01,  0.26,  0.57,  0.79,  1.00,  1.22,  1.42],
    1987 => [ 1.46,  1.35,  1.14,  0.93,  0.85,  0.94,  1.11,  1.30,  1.34,  1.20,  0.98,  0.80],
    1988 => [ 0.45,  0.11, -0.40, -0.91, -1.49, -1.74, -1.64, -1.36, -1.44, -1.71, -1.95, -1.94],
    1989 => [-1.64, -1.37, -1.11, -0.89, -0.65, -0.43, -0.41, -0.38, -0.31, -0.23, -0.08,  0.06],
    1990 => [ 0.32,  0.30,  0.32,  0.26,  0.19,  0.20,  0.21,  0.33,  0.33,  0.27,  0.30,  0.43],
    1991 => [ 0.57,  0.53,  0.42,  0.42,  0.56,  0.70,  0.86,  0.83,  1.01,  1.20,  1.66,  1.97],
    1992 => [ 2.12,  2.08,  1.94,  1.76,  1.40,  0.93,  0.52,  0.30,  0.13,  0.10,  0.12,  0.35],
    1993 => [ 0.55,  0.70,  0.86,  1.06,  1.00,  0.77,  0.45,  0.46,  0.48,  0.46,  0.44,  0.42],
    1994 => [ 0.33,  0.24,  0.23,  0.32,  0.40,  0.41,  0.53,  0.60,  0.79,  0.97,  1.23,  1.28],
    1995 => [ 1.17,  0.86,  0.55,  0.20, -0.07, -0.23, -0.41, -0.57, -0.76, -0.93, -1.02, -0.99],
    1996 => [-0.87, -0.75, -0.58, -0.37, -0.25, -0.24, -0.20, -0.20, -0.20, -0.25, -0.30, -0.29],
    1997 => [-0.21, -0.03,  0.17,  0.47,  0.83,  1.20,  1.50,  1.84,  2.07,  2.22,  2.25,  2.28],
    1998 => [ 2.13,  1.82,  1.22,  0.81,  0.07, -0.46, -1.05, -1.14, -1.24, -1.33, -1.51, -1.61],
    1999 => [-1.56, -1.28, -0.99, -0.88, -0.81, -0.82, -0.83, -0.86, -0.87, -1.06, -1.33, -1.56],
    2000 => [-1.50, -1.31, -1.06, -0.88, -0.68, -0.54, -0.35, -0.29, -0.36, -0.55, -0.79, -0.82],
    2001 => [-0.79, -0.62, -0.55, -0.41, -0.28, -0.08,  0.01, -0.02, -0.05, -0.18, -0.27, -0.32],
    2002 => [-0.16,  0.01,  0.03,  0.05,  0.22,  0.44,  0.64,  0.80,  0.97,  1.18,  1.33,  1.13],
    2003 => [ 0.85,  0.47,  0.23, -0.19, -0.34, -0.24,  0.04,  0.09,  0.17,  0.17,  0.25,  0.22],
    2004 => [ 0.23,  0.12,  0.07,  0.09,  0.18,  0.36,  0.54,  0.69,  0.71,  0.70,  0.70,  0.69],
    2005 => [ 0.54,  0.40,  0.26,  0.25,  0.20,  0.05, -0.06, -0.11, -0.04, -0.18, -0.50, -0.81],
    2006 => [-0.90, -0.87, -0.69, -0.49, -0.19, -0.05,  0.15,  0.36,  0.57,  0.73,  0.91,  0.89],
    2007 => [ 0.60,  0.16, -0.15, -0.33, -0.36, -0.44, -0.50, -0.79, -1.04, -1.33, -1.49, -1.65],
    2008 => [-1.73, -1.62, -1.39, -1.04, -0.80, -0.46, -0.24, -0.17, -0.26, -0.38, -0.60, -0.86],
    2009 => [-0.96, -0.92, -0.70, -0.43, -0.05,  0.24,  0.35,  0.42,  0.53,  0.86,  1.29,  1.50],
    2010 => [ 1.44,  1.11,  0.69,  0.10, -0.50, -0.97, -1.21, -1.39, -1.54, -1.61, -1.63, -1.55],
    2011 => [-1.42, -1.21, -0.97, -0.76, -0.52, -0.29, -0.29, -0.41, -0.70, -0.91, -1.02, -0.96],
    2012 => [-0.77, -0.60, -0.50, -0.42, -0.26,  0.01,  0.33,  0.43,  0.37,  0.21, -0.03, -0.27],
    2013 => [-0.55, -0.57, -0.49, -0.44, -0.48, -0.48, -0.48, -0.38, -0.38, -0.22, -0.23, -0.27],
    2014 => [-0.43, -0.38, -0.15,  0.11,  0.15,  0.00, -0.14, -0.09,  0.06,  0.35,  0.54,  0.62],
    2015 => [ 0.54,  0.47,  0.59,  0.72,  0.89,  1.02,  1.27,  1.54,  1.80,  2.03,  2.18,  2.25],
    2016 => [ 2.14,  1.81,  1.30,  0.65,  0.08, -0.43, -0.70, -0.81, -0.88, -0.96, -0.96, -0.89],
    2017 => [-0.60, -0.44, -0.18, -0.10, -0.02, -0.04, -0.23, -0.46, -0.62, -0.82, -0.97, -1.14],
    2018 => [-1.08, -1.04, -0.90, -0.69, -0.33, -0.02,  0.08,  0.16,  0.35,  0.62,  0.82,  0.78],
    2019 => [ 0.68,  0.64,  0.57,  0.53,  0.37,  0.24,  0.04, -0.12, -0.01,  0.15,  0.29,  0.22],
    2020 => [ 0.14,  0.10,  0.02, -0.25, -0.55, -0.72, -0.76, -0.85, -1.16, -1.37, -1.46, -1.39],
    2021 => [-1.32, -1.18, -1.08, -0.89, -0.68, -0.57, -0.60, -0.76, -0.95, -1.08, -1.24, -1.22],
    2022 => [-1.18, -1.13, -1.19, -1.26, -1.17, -0.95, -0.86, -0.94, -1.07, -1.10, -1.05, -0.99],
    2023 => [-0.86, -0.68, -0.55, -0.31, -0.04,  0.28,  0.54,  0.79,  1.04,  1.30,  1.42,  1.40],
    2024 => [ 1.13,  0.78,  0.42,  0.04, -0.28, -0.45, -0.49, -0.56, -0.67, -0.76, -0.88, -1.05],
    2025 => [-1.10, -0.85, -0.66, -0.50, -0.48, -0.36, -0.41, -0.59, -0.78, -0.93, -0.98, -1.04],
    2026 => [-0.91, -0.76, -0.44, -0.04,  0.49,  0.97,  1.36,  1.69,  1.97, null, null, null],
];

// Estado al copiar la tabla fija (discusión de CPC del 8 de octubre de 2026)
$ESTADO_FIJO = [
    'alerta' => 'Advertencia de El Niño',
    'fecha_discusion' => '2026-10-08',
    'proxima_discusion' => '2026-11-12',
];

// Resumen en castellano de una discusión puntual. Se muestra sólo mientras esa sea la discusión vigente;
// con una discusión nueva queda sin resumen hasta que se escriba otro (es opcional).
$RESUMENES = [
    '2026-10-08' => 'El Niño sigue fortaleciéndose: es probable un evento fuerte a muy fuerte hasta enero–marzo '
        . 'de 2027 (más del 83 % de probabilidad), con chances altas de superar a los eventos más intensos desde 1950.',
];

// Estados del sistema de alerta de CPC (en minúsculas, sin tildes ni eñes)
$ALERTAS = [
    'el nino advisory' => 'Advertencia de El Niño',
    'final el nino advisory' => 'Fin de El Niño',
    'el nino watch' => 'Vigilancia de El Niño',
    'la nina advisory' => 'Advertencia de La Niña',
    'final la nina advisory' => 'Fin de La Niña',
    'la nina watch' => 'Vigilancia de La Niña',
    'not active' => 'Sin alerta (condiciones neutras)',
];

function descargar($url)
{
    $cuerpo = false;
    $codigo = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
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
    return ($cuerpo !== false && $codigo === 200) ? $cuerpo : null;
}

/** RONI.ascii.txt («SEAS YR ANOM» por línea) → [año => 12 valores o null]. Null si el formato no es el esperado. */
function leerRoni($texto)
{
    $tabla = [];
    foreach (preg_split('/\r?\n/', $texto) as $linea) {
        if (!preg_match('/^\s*([A-Z]{3})\s+(\d{4})\s+(-?\d+(?:\.\d+)?)\s*$/', $linea, $m)) {
            continue;
        }
        $i = array_search($m[1], TEMPORADAS, true);
        if ($i === false) {
            continue;
        }
        $anio = (int)$m[2];
        if (!isset($tabla[$anio])) {
            $tabla[$anio] = array_fill(0, 12, null);
        }
        $tabla[$anio][$i] = round((float)$m[3], 2);
    }
    ksort($tabla);
    // Control mínimo: tiene que empezar en 1950 y llegar al año pasado
    return (isset($tabla[1950]) && max(array_keys($tabla)) >= (int)date('Y') - 1) ? $tabla : null;
}

/** Fecha «8 October 2026» → «2026-10-08». */
function fechaIngles($texto)
{
    $t = strtotime($texto);
    return $t === false ? null : date('Y-m-d', $t);
}

/** Estado de alerta y fechas de la discusión diagnóstica de CPC. Null si no se pudo leer. */
function leerDiscusion($html, $alertas)
{
    $texto = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $texto = preg_replace('/\s+/u', ' ', $texto);
    if (!preg_match('/ENSO Alert System Status:\s*(.+?)\s*Synopsis/iu', $texto, $m)) {
        return null;
    }
    $clave = strtolower(str_replace(['ñ', 'Ñ'], 'n', $m[1]));
    $clave = trim(preg_replace('/[^a-z]+/', ' ', $clave));
    $estado = [
        'alerta' => isset($alertas[$clave]) ? $alertas[$clave] : trim($m[1]),
        'fecha_discusion' => null,
        'proxima_discusion' => null,
    ];
    $mes = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
    if (preg_match('/issued by .*?(\d{1,2} ' . $mes . ' \d{4})/iu', $texto, $f)) {
        $estado['fecha_discusion'] = fechaIngles($f[1]);
    }
    if (preg_match('/next ENSO Diagnostics Discussion is scheduled for (\d{1,2} ' . $mes . ' \d{4})/iu', $texto, $f)) {
        $estado['proxima_discusion'] = fechaIngles($f[1]);
    }
    return $estado;
}

// 1) Caché vigente
$archivoCache = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'agromet-enso.json';
$cache = is_readable($archivoCache) ? json_decode((string)@file_get_contents($archivoCache), true) : null;
$hayCache = is_array($cache) && isset($cache['guardado'], $cache['roni'], $cache['estado']);

if ($hayCache && time() - $cache['guardado'] < CACHE_HORAS * 3600) {
    $roni = $cache['roni'];
    $estado = $cache['estado'];
    $origen = 'cache';
    $actualizado = date('Y-m-d', $cache['guardado']);
} else {
    // 2) NOAA; lo que no se pueda leer sale de la caché vencida o de la copia fija
    $texto = descargar(URL_RONI);
    $roni = $texto !== null ? leerRoni($texto) : null;
    $html = descargar(URL_DISCUSION);
    $estado = $html !== null ? leerDiscusion($html, $ALERTAS) : null;
    if ($estado === null) {
        $estado = $hayCache ? $cache['estado'] : $ESTADO_FIJO;
    }

    if ($roni !== null) {
        $origen = 'noaa';
        $actualizado = date('Y-m-d');
        @file_put_contents($archivoCache, json_encode(['guardado' => time(), 'roni' => $roni, 'estado' => $estado]), LOCK_EX);
    } elseif ($hayCache) {
        $roni = $cache['roni'];
        $origen = 'cache';
        $actualizado = date('Y-m-d', $cache['guardado']);
    } else {
        $roni = $RONI_FIJO;
        $origen = 'fijo';
        $actualizado = FIJO_ACTUALIZADO;
    }
}

// Si no se pudo bajar de NOAA, se vuelve a intentar pronto
header('Cache-Control: public, max-age=' . ($origen === 'fijo' ? 600 : 21600));

$fecha = isset($estado['fecha_discusion']) ? $estado['fecha_discusion'] : null;
$estado['resumen'] = ($fecha !== null && isset($RESUMENES[$fecha])) ? $RESUMENES[$fecha] : null;
$estado['url'] = URL_DISCUSION;

$datos = [];
foreach ($roni as $anio => $valores) {
    $datos[] = ['anio' => (int)$anio, 'valores' => array_values($valores)];
}

echo json_encode([
    'status' => 'success',
    'indice' => 'RONI',
    'fuente' => 'NOAA Climate Prediction Center',
    'origen' => $origen,
    'actualizado' => $actualizado,
    'temporadas' => TEMPORADAS,
    'datos' => $datos,
    'estado' => $estado,
], JSON_UNESCAPED_UNICODE);
