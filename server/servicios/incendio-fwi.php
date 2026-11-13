<?php
/*
 * Índice meteorológico de peligro de incendios forestales (FWI) del sistema canadiense, ajustado
 * al hemisferio sur, para el diálogo «Peligro de incendios» de /datos. Va en /services/ y usa
 * conecta_mysql.php (base `estaciones`). Los valores se guardan en la tabla `fwi_diario` (una fila
 * por estación y día; el SQL para crearla está en el LEEME).
 *
 * GET incendio-fwi.php?fecha=AAAA-MM-DD
 *   {"status":"success","fecha":...,"calculadoHasta":...,"pendientes":N,"data":[{identificacion,
 *    temp, hr, viento, lluvia, ffmc, dmc, dc, isi, bui, fwi, estimado:{...}, diasSinDatos}, ...]}
 * GET incendio-fwi.php?estacion=<identificacion>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *   {"status":"success","estacion":...,"calculadoHasta":...,"pendientes":N,"data":[{fecha, ...}]}
 * GET incendio-fwi.php?prueba=guia
 *   Calcula el ejemplo de octubre de la guía (sin usar la base) para comparar con sus tablas.
 *
 * Método (guía de campo «Tablas para el cálculo del FWI», PNMF 1998, sobre Van Wagner 1984; las
 * ecuaciones son las de Van Wagner y Pickett 1985, que dan las mismas tablas):
 *   - Observaciones del mediodía (12 h): temperatura, humedad relativa y viento medio; lluvia de
 *     12 a 12 h. Salen de los registros de datos_estaciones.
 *   - El viento se lleva a 10 m: los anemómetros de la red están a 3 m y la guía suma 35 %.
 *   - Factores de duración del día del DMC y del DC corridos 6 meses (hemisferio sur).
 *   - Cada día parte de los códigos del día anterior. Se arranca en INICIO con FFMC 85, DMC 6 y DC 15.
 *
 * Sensores dados de baja (tabla `sensores_baja`, se cargan en /admin): sus valores se descartan y se
 * estiman como si faltaran; en `estimado` el motivo lleva el prefijo 'baja:' (por ejemplo
 * 'baja:vecinas'). Tampoco se usan para estimar a las vecinas.
 *
 * Observaciones faltantes (la guía pide no saltear días y estimar el dato), en este orden:
 *   1. el registro más cercano a las 12 h entre las 11 y las 13 h ('hora' si está a más de 15 min);
 *   2. el promedio de las estaciones vecinas (misma zona, a menos de VECINAS_KM y VECINAS_DESNIVEL)
 *      que sí lo tienen ('vecinas');
 *   3. el promedio del día anterior y del siguiente ('interpolado');
 *   4. el valor del día anterior ('anterior').
 * La lluvia: la de la estación si sus registros cubren el 90 % de las 24 h; si no, la de las vecinas;
 * si no, la parcial de la estación ('incompleta') o 0 ('sin-dato'). Cada valor estimado queda en
 * `estimado` y el sitio lo marca. Si la estación pasa más de MAX_DIAS_SIN_DATOS días sin registros
 * propios, los índices quedan en null; cuando vuelve, arranca con los códigos de sus vecinas
 * ('codigos' => 'vecinas') o con los iniciales ('inicio').
 *
 * Cálculo: cada consulta completa los días que faltan hasta hoy (desde las HORA_CALCULO h; antes,
 * hasta ayer), de a DIAS_POR_PEDIDO por vez, y vuelve a calcular los últimos RECALCULAR_DIAS días
 * (cada MINUTOS_ENTRE_RECALCULOS como mucho) por los registros que llegan tarde. Lee
 * datos_estaciones de a un día (unos 3.700 registros por consulta, por el índice de fecha).
 */

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Tucuman');

/** Primer día del cálculo (los códigos de la víspera son los iniciales) */
const INICIO = '2026-07-01';
const INICIAL = ['ffmc' => 85.0, 'dmc' => 6.0, 'dc' => 15.0];
/** Desde esta hora se calcula el día en curso (hace falta el registro de las 12 h) */
const HORA_CALCULO = 13;
const DIAS_POR_PEDIDO = 20;
const RECALCULAR_DIAS = 2;
const MINUTOS_ENTRE_RECALCULOS = 30;
const MAX_DIAS_SIN_DATOS = 10;
const MAX_DIAS_SERIE = 400;
/** Anemómetro a 3 m: la guía suma 35 % para llevar el viento a 10 m */
const FACTOR_VIENTO = 1.35;
/** Parte de las 24 h que tienen que cubrir los registros de lluvia */
const COBERTURA_LLUVIA = 0.9;
const VECINAS_KM = 40;
const VECINAS_DESNIVEL = 400;
const VECINAS_MAX = 3;
/** Un registro a más minutos de las 12 h se marca como estimado */
const MINUTOS_OBSERVADO = 15;

/** Factores de duración del día (enero a diciembre), corridos 6 meses para el hemisferio sur */
const LE_DMC = [12.4, 10.9, 9.4, 8.0, 7.0, 6.0, 6.5, 7.5, 9.0, 12.8, 13.9, 13.9];
const LF_DC = [6.4, 5.0, 2.4, 0.4, -1.6, -1.6, -1.6, -1.6, -1.6, 0.9, 3.8, 5.8];

/** Columnas de datos_estaciones y rango válido de cada variable */
const VARIABLES = [
    'temp' => ['columna' => 'temp_af', 'min' => -25, 'max' => 50],
    'hr' => ['columna' => 'hum_af', 'min' => 1, 'max' => 100],
    'viento' => ['columna' => 'viento_medio', 'min' => 0, 'max' => 150],
];

function errorJson($codigo, $msg) {
    http_response_code($codigo);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------------------------------------------------------------------------------------------
// Ecuaciones del FWI (Van Wagner y Pickett 1985)
// ---------------------------------------------------------------------------------------------

function calcFfmc($f0, $t, $h, $w, $r) {
    $mo = 147.2 * (101 - $f0) / (59.5 + $f0);
    if ($r > 0.5) {
        $rf = $r - 0.5;
        $mr = $mo + 42.5 * $rf * exp(-100 / (251 - $mo)) * (1 - exp(-6.93 / $rf));
        if ($mo > 150) $mr += 0.0015 * pow($mo - 150, 2) * sqrt($rf);
        $mo = min($mr, 250);
    }
    $ed = 0.942 * pow($h, 0.679) + 11 * exp(($h - 100) / 10) + 0.18 * (21.1 - $t) * (1 - exp(-0.115 * $h));
    if ($mo > $ed) {
        $ko = 0.424 * (1 - pow($h / 100, 1.7)) + 0.0694 * sqrt($w) * (1 - pow($h / 100, 8));
        $kd = $ko * 0.581 * exp(0.0365 * $t);
        $m = $ed + ($mo - $ed) * pow(10, -$kd);
    } else {
        $ew = 0.618 * pow($h, 0.753) + 10 * exp(($h - 100) / 10) + 0.18 * (21.1 - $t) * (1 - exp(-0.115 * $h));
        if ($mo < $ew) {
            $kl = 0.424 * (1 - pow((100 - $h) / 100, 1.7)) + 0.0694 * sqrt($w) * (1 - pow((100 - $h) / 100, 8));
            $kw = $kl * 0.581 * exp(0.0365 * $t);
            $m = $ew - ($ew - $mo) * pow(10, -$kw);
        } else {
            $m = $mo;
        }
    }
    return max(0, min(101, 59.5 * (250 - $m) / (147.2 + $m)));
}

function calcDmc($p0, $t, $h, $r, $mes) {
    if ($r > 1.5) {
        $re = 0.92 * $r - 1.27;
        $mo = 20 + exp(5.6348 - $p0 / 43.43);
        if ($p0 <= 33) $b = 100 / (0.5 + 0.3 * $p0);
        elseif ($p0 <= 65) $b = 14 - 1.3 * log($p0);
        else $b = 6.2 * log($p0) - 17.2;
        $mr = $mo + 1000 * $re / (48.77 + $b * $re);
        $p0 = max(244.72 - 43.43 * log($mr - 20), 0);
    }
    $t = max($t, -1.1);
    return $p0 + 1.894 * ($t + 1.1) * (100 - $h) * LE_DMC[$mes - 1] * 1e-4;
}

function calcDc($d0, $t, $r, $mes) {
    if ($r > 2.8) {
        $rd = 0.83 * $r - 1.27;
        $qr = 800 * exp(-$d0 / 400) + 3.937 * $rd;
        $d0 = max(400 * log(800 / $qr), 0);
    }
    $t = max($t, -2.8);
    return $d0 + 0.5 * max(0.36 * ($t + 2.8) + LF_DC[$mes - 1], 0);
}

function calcIsi($f, $w) {
    $m = 147.2 * (101 - $f) / (59.5 + $f);
    $ff = 91.9 * exp(-0.1386 * $m) * (1 + pow($m, 5.31) / 4.93e7);
    return 0.208 * exp(0.05039 * $w) * $ff;
}

function calcBui($p, $d) {
    if ($p == 0 && $d == 0) return 0;
    if ($p <= 0.4 * $d) $u = 0.8 * $p * $d / ($p + 0.4 * $d);
    else $u = $p - (1 - 0.8 * $d / ($p + 0.4 * $d)) * (0.92 + pow(0.0114 * $p, 1.7));
    return max($u, 0);
}

function calcFwi($isi, $bui) {
    $fd = $bui <= 80 ? 0.626 * pow($bui, 0.809) + 2 : 1000 / (25 + 108.64 * exp(-0.023 * $bui));
    $b = 0.1 * $isi * $fd;
    return $b > 1 ? exp(2.72 * pow(0.434 * log($b), 0.647)) : $b;
}

/** Los seis componentes de un día a partir de los códigos de la víspera */
function calcularIndices($previo, $t, $h, $w, $r, $mes) {
    $ffmc = calcFfmc($previo['ffmc'], $t, $h, $w, $r);
    $dmc = calcDmc($previo['dmc'], $t, $h, $r, $mes);
    $dc = calcDc($previo['dc'], $t, $r, $mes);
    $isi = calcIsi($ffmc, $w);
    $bui = calcBui($dmc, $dc);
    return ['ffmc' => $ffmc, 'dmc' => $dmc, 'dc' => $dc, 'isi' => $isi, 'bui' => $bui, 'fwi' => calcFwi($isi, $bui)];
}

// ---------------------------------------------------------------------------------------------
// ?prueba=guia: ejemplo de octubre de la guía (planilla «Ejemplos de cálculo»)
// ---------------------------------------------------------------------------------------------

if (isset($_GET['prueba'])) {
    // día, temperatura, HR, viento, lluvia, y FFMC, DMC, DC, ISI, BUI, FWI de la planilla
    $ejemplo = [
        [14, 17, 42, 25, 0, 87, 8, 19, 10, 8, 9], [15, 20, 21, 25, 2.4, 83, 8, 23, 6, 10, 7],
        [16, 8.5, 40, 17, 0, 85, 9, 26, 5, 10, 6], [17, 6.5, 25, 6, 0, 88, 10, 28, 4, 11, 4],
        [18, 13, 34, 24, 0, 88, 12, 31, 11, 12, 12], [19, 6, 40, 22, 0.4, 87, 13, 33, 8, 13, 10],
        [20, 5.5, 52, 6, 0, 86, 14, 35, 3, 14, 4], [21, 8.5, 46, 16, 0, 86, 15, 38, 5, 15, 7],
        [22, 9.5, 54, 20, 0, 86, 15, 41, 7, 17, 9], [23, 7, 93, 14, 9, 35, 8, 26, 0, 10, 0],
        [24, 6.5, 71, 17, 1, 55, 8, 28, 0.5, 10, 0], [25, 6, 59, 17, 0, 72, 8, 30, 1.5, 10, 1],
        [26, 13, 52, 4, 0, 79, 9, 33, 1, 10, 1], [27, 15.5, 40, 11, 0, 85, 11, 37, 4, 11, 4],
        [28, 23, 25, 9, 0, 91, 15, 42, 8, 17, 11], [29, 19, 46, 16, 0, 89, 17, 46, 8, 19, 11],
        [30, 18, 41, 20, 0, 89, 19, 50, 10, 20, 14], [31, 14.5, 51, 16, 0, 87, 20, 54, 6, 20, 9],
    ];
    $previo = INICIAL;
    $filas = [];
    foreach ($ejemplo as $e) {
        $previo = calcularIndices($previo, $e[1], $e[2], $e[3], $e[4], 10);
        $calculado = [];
        foreach ($previo as $k => $v) $calculado[$k] = round($v, 1);
        $filas[] = ['dia' => $e[0], 'calculado' => $calculado,
            'guia' => array_combine(['ffmc', 'dmc', 'dc', 'isi', 'bui', 'fwi'], array_slice($e, 5))];
    }
    echo json_encode(['status' => 'success', 'prueba' => 'guia', 'data' => $filas], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------------------------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------------------------

function leerFecha($campo) {
    $v = isset($_GET[$campo]) ? $_GET[$campo] : '';
    $f = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$f || $f->format('Y-m-d') !== $v) errorJson(400, "Parámetro '$campo' inválido. Use AAAA-MM-DD.");
    return $f;
}

$estacion = isset($_GET['estacion']) ? $_GET['estacion'] : null;
if ($estacion !== null) {
    if (!preg_match('/^[0-9A-Za-z_-]{1,16}$/', $estacion)) errorJson(400, "Parámetro 'estacion' inválido.");
    $desde = leerFecha('desde');
    $hasta = leerFecha('hasta');
    if ($hasta < $desde) errorJson(400, 'La fecha hasta es anterior a desde.');
    if ($desde->diff($hasta)->days + 1 > MAX_DIAS_SERIE) errorJson(400, 'El período no puede superar ' . MAX_DIAS_SERIE . ' días.');
} else {
    $fecha = leerFecha('fecha');
}

$db = "estaciones";
require_once 'conecta_mysql.php'; // define $conexion
if (!$conexion) errorJson(500, 'Error de conexión a la base de datos.');
$conexion->set_charset('utf8mb4');
@set_time_limit(90);

// ---------------------------------------------------------------------------------------------
// Datos de entrada
// ---------------------------------------------------------------------------------------------

function consultar($conexion, $sql) {
    $res = $conexion->query($sql);
    if ($res === false) errorJson(500, 'Error en la consulta del índice de incendios.');
    return $res;
}

function minutosDelDia($hora) {
    $p = explode(':', $hora);
    return (int)$p[0] * 60 + (int)$p[1];
}

/**
 * Registro más cercano a las 12 h de cada variable, entre las 11 y las 13 h:
 * [id => [variable => ['valor' => ..., 'minutos' => distancia a las 12 h]]]. El viento ya va a 10 m.
 */
function lecturasMediodia($conexion, $fecha) {
    $columnas = [];
    foreach (VARIABLES as $nombre => $v) $columnas[] = "d.{$v['columna']} AS $nombre";
    $res = consultar($conexion, "SELECT d.identificacion, d.hora, " . implode(', ', $columnas) . "
        FROM datos_estaciones d
        WHERE d.fecha = '$fecha' AND d.hora BETWEEN '11:00:00' AND '13:00:00'");
    $lecturas = [];
    while ($f = $res->fetch_assoc()) {
        $id = (string)$f['identificacion'];
        $distancia = abs(minutosDelDia($f['hora']) - 720);
        foreach (VARIABLES as $nombre => $v) {
            if ($f[$nombre] === null || $f[$nombre] === '') continue;
            $valor = (float)$f[$nombre];
            if ($valor < $v['min'] || $valor > $v['max']) continue;
            if (isset($lecturas[$id][$nombre]) && $lecturas[$id][$nombre]['minutos'] <= $distancia) continue;
            if ($nombre === 'viento') $valor *= FACTOR_VIENTO;
            $lecturas[$id][$nombre] = ['valor' => $valor, 'minutos' => $distancia];
        }
    }
    return $lecturas;
}

/** Lluvia de 12 a 12 h que termina ese día: [id => ['mm' => ..., 'cobertura' => 0 a 1]] */
function lluviaDelDia($conexion, $fecha, $estaciones) {
    $ayer = date('Y-m-d', strtotime("$fecha -1 day"));
    // Mismo filtro que lluvia-periodo.php: rango de fechas simple y las horas de los extremos aparte
    $res = consultar($conexion, "SELECT d.identificacion, SUM(d.lluvia) AS mm, COUNT(d.lluvia) AS registros
        FROM datos_estaciones d
        WHERE d.fecha BETWEEN '$ayer' AND '$fecha'
          AND NOT (d.fecha = '$ayer' AND d.hora <= '12:00:00')
          AND NOT (d.fecha = '$fecha' AND d.hora > '12:00:00')
        GROUP BY d.identificacion
        ORDER BY NULL");
    $lluvia = [];
    while ($f = $res->fetch_assoc()) {
        $id = (string)$f['identificacion'];
        if (!isset($estaciones[$id]) || (int)$f['registros'] === 0) continue;
        $horas = (int)$f['registros'] * $estaciones[$id]['tiempo'] / 60;
        $lluvia[$id] = ['mm' => max(0, (float)$f['mm']), 'cobertura' => min(1, $horas / 24)];
    }
    return $lluvia;
}

/** Estaciones habilitadas con sus vecinas (misma zona, cercanas y de altura parecida) */
function leerEstaciones($conexion) {
    $res = consultar($conexion, "SELECT identificacion, lat, lon, alt, zona, tiempo FROM estaciones WHERE habilitada >= 1");
    $estaciones = [];
    while ($f = $res->fetch_assoc()) {
        $estaciones[(string)$f['identificacion']] = [
            'lat' => (float)$f['lat'], 'lon' => (float)$f['lon'], 'alt' => (float)$f['alt'],
            'zona' => (string)$f['zona'], 'tiempo' => (float)$f['tiempo'] > 0 ? (float)$f['tiempo'] : 15,
            'vecinas' => []
        ];
    }
    foreach ($estaciones as $id => &$e) {
        $distancias = [];
        foreach ($estaciones as $otra => $o) {
            if ($otra === $id || $o['zona'] !== $e['zona'] || abs($o['alt'] - $e['alt']) > VECINAS_DESNIVEL) continue;
            $km = distanciaKm($e['lat'], $e['lon'], $o['lat'], $o['lon']);
            if ($km <= VECINAS_KM) $distancias[$otra] = $km;
        }
        asort($distancias);
        $e['vecinas'] = array_slice(array_keys($distancias), 0, VECINAS_MAX);
    }
    unset($e);
    return $estaciones;
}

function distanciaKm($lat1, $lon1, $lat2, $lon2) {
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = pow(sin($dLat / 2), 2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * pow(sin($dLon / 2), 2);
    return 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function promedio($valores) {
    return count($valores) ? array_sum($valores) / count($valores) : null;
}

/**
 * Variables dadas de baja ese día: [id => [variable => true]] con los nombres de VARIABLES y 'lluvia'.
 * Si la tabla sensores_baja todavía no existe, no descarta nada.
 */
function bajasDelDia($conexion, $fecha) {
    $nombres = ['temperatura' => 'temp', 'humedad' => 'hr', 'viento' => 'viento', 'lluvia' => 'lluvia'];
    $bajas = [];
    try {
        $res = @$conexion->query("SELECT identificacion, variable FROM sensores_baja
            WHERE desde <= '$fecha' AND (hasta IS NULL OR hasta >= '$fecha')");
    } catch (Throwable $e) {
        $res = false;
    }
    if ($res === false) return $bajas;
    while ($f = $res->fetch_assoc()) {
        if (isset($nombres[$f['variable']])) $bajas[(string)$f['identificacion']][$nombres[$f['variable']]] = true;
    }
    return $bajas;
}

/** Saca de las lecturas y de la lluvia los valores de los sensores dados de baja */
function descartarBajas(&$lecturas, &$lluvias, $bajas) {
    foreach ($bajas as $id => $variables) {
        foreach (array_keys($variables) as $v) {
            if ($v === 'lluvia') unset($lluvias[$id]);
            else unset($lecturas[$id][$v]);
        }
        if (isset($lecturas[$id]) && !$lecturas[$id]) unset($lecturas[$id]);
    }
}

/** Filas de fwi_diario de un día: [id => fila] */
function filasDelDia($conexion, $fecha) {
    $res = consultar($conexion, "SELECT * FROM fwi_diario WHERE fecha = '$fecha'");
    $filas = [];
    while ($f = $res->fetch_assoc()) $filas[(string)$f['identificacion']] = $f;
    return $filas;
}

// ---------------------------------------------------------------------------------------------
// Cálculo de un día en todas las estaciones
// ---------------------------------------------------------------------------------------------

function calcularDia($conexion, $fecha, $estaciones, $ultimoCalculable) {
    $ayer = date('Y-m-d', strtotime("$fecha -1 day"));
    $manana = date('Y-m-d', strtotime("$fecha +1 day"));
    $previos = filasDelDia($conexion, $ayer);
    $hoy = lecturasMediodia($conexion, $fecha);
    $lluvias = lluviaDelDia($conexion, $fecha, $estaciones);
    $bajas = bajasDelDia($conexion, $fecha);
    descartarBajas($hoy, $lluvias, $bajas);
    $siguiente = null; // lecturas del día siguiente, sólo si hacen falta
    $mes = (int)substr($fecha, 5, 2);
    $ahora = date('Y-m-d H:i:s');

    $stmt = $conexion->prepare("REPLACE INTO fwi_diario
        (identificacion, fecha, temp, hr, viento, lluvia, ffmc, dmc, dc, isi, bui, fwi, estimado, dias_sin_datos, calculado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    // El número de error de MySQL ayuda a instalarlo: 1142 = falta permiso de INSERT o DELETE en
    // fwi_diario, 1146 = no existe la tabla, 1054 = una columna no coincide con el SQL del LEEME
    if (!$stmt) errorJson(500, 'Error al preparar el guardado del índice de incendios (MySQL ' . $conexion->errno . ').');

    foreach ($estaciones as $id => $e) {
        $previo = isset($previos[$id]) ? $previos[$id] : null;
        $valores = [];
        $estimado = [];

        foreach (array_keys(VARIABLES) as $v) {
            if (isset($hoy[$id][$v])) {
                $valores[$v] = $hoy[$id][$v]['valor'];
                if ($hoy[$id][$v]['minutos'] > MINUTOS_OBSERVADO) $estimado[$v] = 'hora';
                continue;
            }
            $deVecinas = [];
            foreach ($e['vecinas'] as $o) {
                if (isset($hoy[$o][$v]) && $hoy[$o][$v]['minutos'] <= MINUTOS_OBSERVADO) $deVecinas[] = $hoy[$o][$v]['valor'];
            }
            if ($deVecinas) {
                $valores[$v] = promedio($deVecinas);
                $estimado[$v] = 'vecinas';
                continue;
            }
            $anterior = $previo && $previo[$v] !== null ? (float)$previo[$v] : null;
            if ($anterior !== null && $manana <= $ultimoCalculable) {
                if ($siguiente === null) {
                    $siguiente = lecturasMediodia($conexion, $manana);
                    $sinLluvia = [];
                    descartarBajas($siguiente, $sinLluvia, bajasDelDia($conexion, $manana));
                }
                if (isset($siguiente[$id][$v])) {
                    $valores[$v] = ($anterior + $siguiente[$id][$v]['valor']) / 2;
                    $estimado[$v] = 'interpolado';
                    continue;
                }
            }
            $valores[$v] = $anterior;
            if ($anterior !== null) $estimado[$v] = 'anterior';
        }

        if (isset($lluvias[$id]) && $lluvias[$id]['cobertura'] >= COBERTURA_LLUVIA) {
            $valores['lluvia'] = $lluvias[$id]['mm'];
        } else {
            $deVecinas = [];
            foreach ($e['vecinas'] as $o) {
                if (isset($lluvias[$o]) && $lluvias[$o]['cobertura'] >= COBERTURA_LLUVIA) $deVecinas[] = $lluvias[$o]['mm'];
            }
            if ($deVecinas) {
                $valores['lluvia'] = promedio($deVecinas);
                $estimado['lluvia'] = 'vecinas';
            } elseif (isset($lluvias[$id])) {
                $valores['lluvia'] = $lluvias[$id]['mm'];
                $estimado['lluvia'] = 'incompleta';
            } else {
                $valores['lluvia'] = 0.0;
                $estimado['lluvia'] = 'sin-dato';
            }
        }

        foreach (array_keys(isset($bajas[$id]) ? $bajas[$id] : []) as $v) {
            $estimado[$v] = 'baja:' . (isset($estimado[$v]) ? $estimado[$v] : 'sin-dato');
        }

        // Días seguidos sin registros propios del mediodía
        $diasSinDatos = isset($hoy[$id]) ? 0 : ($previo ? (int)$previo['dias_sin_datos'] + 1 : 1);

        // Códigos de la víspera; si no hay (primer día o la estación estuvo sin datos), los de las
        // vecinas o los iniciales
        if ($previo && $previo['ffmc'] !== null) {
            $codigos = ['ffmc' => (float)$previo['ffmc'], 'dmc' => (float)$previo['dmc'], 'dc' => (float)$previo['dc']];
        } else {
            $deVecinas = [];
            foreach ($e['vecinas'] as $o) {
                if (isset($previos[$o]) && $previos[$o]['ffmc'] !== null) $deVecinas[] = $previos[$o];
            }
            if ($deVecinas) {
                $codigos = [];
                foreach (['ffmc', 'dmc', 'dc'] as $c) $codigos[$c] = promedio(array_map('floatval', array_column($deVecinas, $c)));
                $estimado['codigos'] = 'vecinas';
            } else {
                $codigos = INICIAL;
                $estimado['codigos'] = 'inicio';
            }
        }

        $completos = $valores['temp'] !== null && $valores['hr'] !== null && $valores['viento'] !== null;
        $indices = $completos && $diasSinDatos <= MAX_DIAS_SIN_DATOS
            ? calcularIndices($codigos, $valores['temp'], $valores['hr'], $valores['viento'], $valores['lluvia'], $mes)
            : array_fill_keys(['ffmc', 'dmc', 'dc', 'isi', 'bui', 'fwi'], null);
        if (!$completos || $diasSinDatos > MAX_DIAS_SIN_DATOS) unset($estimado['codigos']);

        $fila = [$id, $fecha];
        foreach (['temp', 'hr', 'viento', 'lluvia'] as $v) $fila[] = $valores[$v] === null ? null : round($valores[$v], 1);
        foreach ($indices as $v) $fila[] = $v === null ? null : round($v, 2);
        $fila[] = $estimado ? json_encode($estimado) : '';
        $fila[] = $diasSinDatos;
        $fila[] = $ahora;
        $stmt->bind_param('ssddddddddddsis', ...$fila);
        if (!$stmt->execute()) errorJson(500, 'Error al guardar el índice de incendios (MySQL ' . $stmt->errno . ').');
    }
    $stmt->close();
}

/**
 * Completa fwi_diario hasta el último día calculable y vuelve a calcular los últimos días.
 * Devuelve [último día calculado, días que faltan].
 */
function actualizar($conexion) {
    $ultimoCalculable = (int)date('G') >= HORA_CALCULO ? date('Y-m-d') : date('Y-m-d', strtotime('-1 day'));

    // Un cálculo por vez: si otro pedido ya está calculando, se responde con lo que hay
    $lock = consultar($conexion, "SELECT GET_LOCK('agromet_fwi', 0) AS ok")->fetch_assoc();
    $calcula = (int)$lock['ok'] === 1;

    // Si cambiaron los sensores dados de baja, se borra lo calculado desde la fecha afectada y se
    // vuelve a calcular (de a DIAS_POR_PEDIDO por pedido, como la primera vez)
    if ($calcula) {
        $recalcularDesde = cambiosEnBajas($conexion);
        if ($recalcularDesde !== null) {
            consultar($conexion, "DELETE FROM fwi_diario WHERE fecha >= '" . max(INICIO, $recalcularDesde) . "'");
        }
    }

    $f = consultar($conexion, "SELECT MAX(fecha) AS ultimo, MAX(calculado) AS calculado FROM fwi_diario")->fetch_assoc();
    $ultimo = $f['ultimo'];
    $reciente = $f['calculado'] && strtotime($f['calculado']) > time() - MINUTOS_ENTRE_RECALCULOS * 60;
    if ($ultimo === null) {
        $desde = INICIO;
    } elseif ($ultimo >= $ultimoCalculable && $reciente) {
        $calcula = false;
        $desde = null;
    } else {
        $siguiente = date('Y-m-d', strtotime("$ultimo +1 day"));
        $recalcular = date('Y-m-d', strtotime("$ultimoCalculable -" . RECALCULAR_DIAS . " day"));
        $desde = max(INICIO, min($siguiente, $recalcular));
    }

    if ($calcula) {
        $estaciones = leerEstaciones($conexion);
        for ($i = 0, $d = $desde; $i < DIAS_POR_PEDIDO && $d <= $ultimoCalculable; $i++) {
            calcularDia($conexion, $d, $estaciones, $ultimoCalculable);
            $ultimo = max((string)$ultimo, $d);
            $d = date('Y-m-d', strtotime("$d +1 day"));
        }
    }
    if ((int)$lock['ok'] === 1) consultar($conexion, "SELECT RELEASE_LOCK('agromet_fwi')");

    $pendientes = $ultimo === null ? null
        : max(0, (int)round((strtotime($ultimoCalculable) - strtotime($ultimo)) / 86400));
    return [$ultimo, $pendientes];
}

/**
 * Fecha desde la que hay que recalcular porque cambiaron los sensores dados de baja, o null. Compara
 * la tabla con lo que vio la última vez (cantidad de filas y último cambio, guardados en
 * agromet-fwi-bajas.json de la carpeta temporal de PHP): una baja nueva se recalcula desde su
 * fecha; una editada o borrada, desde INICIO (no se sabe qué fechas tenía antes).
 */
function cambiosEnBajas($conexion) {
    try {
        $res = @$conexion->query("SELECT COUNT(*) AS n, MAX(creado) AS creado, MAX(modificado) AS modificado,
            MIN(desde) AS desde FROM sensores_baja");
    } catch (Throwable $e) {
        $res = false;
    }
    if ($res === false) return null; // todavía no existe la tabla
    $actual = $res->fetch_assoc();
    $actual = ['n' => (int)$actual['n'], 'creado' => (string)$actual['creado'],
        'modificado' => (string)$actual['modificado'], 'desde' => (string)$actual['desde']];

    $archivo = sys_get_temp_dir() . '/agromet-fwi-bajas.json';
    $previo = is_file($archivo) ? json_decode((string)@file_get_contents($archivo), true) : null;
    if ($previo == $actual) return null;
    @file_put_contents($archivo, json_encode($actual));

    if (!is_array($previo)) return $actual['n'] > 0 ? $actual['desde'] : null;
    if ($actual['n'] < $previo['n'] || $actual['modificado'] !== $previo['modificado']) return INICIO;
    $res = consultar($conexion, "SELECT MIN(desde) AS desde FROM sensores_baja WHERE creado > '"
        . $conexion->real_escape_string($previo['creado']) . "'");
    $nuevas = $res->fetch_assoc();
    return $nuevas['desde'] !== null ? $nuevas['desde'] : INICIO;
}

// ---------------------------------------------------------------------------------------------
// Respuesta
// ---------------------------------------------------------------------------------------------

function filaRespuesta($f) {
    $fila = [];
    foreach (['temp', 'hr', 'viento', 'lluvia', 'ffmc', 'dmc', 'dc', 'isi', 'bui', 'fwi'] as $c) {
        $fila[$c] = $f[$c] === null ? null : (float)$f[$c];
    }
    $fila['estimado'] = $f['estimado'] !== '' ? json_decode($f['estimado'], true) : new stdClass();
    $fila['diasSinDatos'] = (int)$f['dias_sin_datos'];
    return $fila;
}

list($calculadoHasta, $pendientes) = actualizar($conexion);

$data = [];
if ($estacion !== null) {
    $id = $conexion->real_escape_string($estacion);
    $res = consultar($conexion, "SELECT * FROM fwi_diario WHERE identificacion = '$id'
        AND fecha BETWEEN '{$desde->format('Y-m-d')}' AND '{$hasta->format('Y-m-d')}' ORDER BY fecha");
    while ($f = $res->fetch_assoc()) $data[] = ['fecha' => $f['fecha']] + filaRespuesta($f);
    $respuesta = ['status' => 'success', 'estacion' => $estacion,
        'desde' => $desde->format('Y-m-d'), 'hasta' => $hasta->format('Y-m-d')];
} else {
    foreach (filasDelDia($conexion, $fecha->format('Y-m-d')) as $id => $f) {
        $data[] = ['identificacion' => (string)$id] + filaRespuesta($f);
    }
    $respuesta = ['status' => 'success', 'fecha' => $fecha->format('Y-m-d')];
}

$respuesta['inicio'] = INICIO;
$respuesta['calculadoHasta'] = $calculadoHasta;
$respuesta['pendientes'] = $pendientes;
$respuesta['data'] = $data;
echo json_encode($respuesta, JSON_UNESCAPED_UNICODE);

$conexion->close();
