<?php
/*
 * Control de datos (depuración, etapa 2): revisa los valores diarios de todas las estaciones
 * (`datos_diarios`, una fila por estación y día) y propone los sensores que parecen fallar. No cambia
 * nada: la Sección decide y, si corresponde, da de baja el sensor (sensores_baja.php).
 *
 * GET ?dias=N (7 a 31; por defecto 14) → los N días completos que terminan ayer.
 * {ok, desde, hasta, dias, alertas:[{estacion, nombre, variable, regla, problema, dias, fechas, primera,
 *   ultima, inicio, inicio_limite, ejemplo:{fecha, valor, vecinas}, de_baja}]}
 *
 * inicio: cuándo empezó la falla, que suele ser antes del período revisado (el dato anterior era
 * bueno y no hay que darlo de baja). Se revisa hasta BUSCAR_INICIO_DIAS atrás y se encadenan los
 * días con la regla cumplida mientras entre uno y otro no haya más de MAX_HUECO_DIAS (los sensores
 * que se degradan fallan de a ratos). inicio_limite: la falla ya estaba en el primer día revisado,
 * así que empezó antes de inicio.
 *
 * Reglas (umbrales en las constantes de abajo). Las que comparan con las vecinas usan las estaciones a
 * menos de VECINAS_KM y VECINAS_DESNIVEL (de cualquier zona, como el FWI) y necesitan al menos
 * MIN_VECINAS con dato ese día:
 *   humedad_baja       mínima de 3 % o menos con las vecinas en 20 % o más (sensor que se degrada)
 *   humedad_techo      máxima de 40 % o menos con las vecinas en 60 % o más (no llega a saturar)
 *   humedad_clavada    máxima igual a la mínima (no varió en todo el día)
 *   temperatura_desvio máxima o mínima a más de 5 °C de las vecinas, corregidas por la altura
 *   temperatura_clavada máxima igual a la mínima
 *   viento_cero        ráfaga máxima 0 con las vecinas en 5 km/h o más (anemómetro trabado)
 *   radiacion_cero     radiación media 0 en una estación con sensor, con las vecinas en 50 W/m² o más
 *   lluvia_sin_registro 0 mm con la mediana de las vecinas en 5 mm o más (pluviómetro tapado)
 *   lluvia_aislada     10 mm o más con todas las vecinas en 1 mm o menos (puede ser una tormenta local)
 *   fuera_de_rango     valor imposible (los mismos rangos que src/app/shared/depuracion.ts)
 * Una alerta junta los días en que se cumplió la regla en esa estación; aparece desde MIN_DIAS días
 * (lluvia_aislada, desde uno: hay que confirmarla con quien esté en el lugar). Con un solo día de
 * lluvia sin registro había muchas falsas alarmas por tormentas aisladas. de_baja: el sensor ya está
 * dado de baja en alguno de esos días. Las diferencias que la Sección ya revisó y son reales
 * (REVISADAS) no se proponen.
 */
require_once __DIR__ . '/comun.php';

const VECINAS_KM = 40;
const VECINAS_DESNIVEL = 400;
const MIN_VECINAS = 2;
const MIN_DIAS = 2;
const GRADIENTE_TERMICO = 0.0065; // °C por metro
const BUSCAR_INICIO_DIAS = 400;
const MAX_HUECO_DIAS = 15;

/**
 * Diferencias que la Sección revisó y son reales (no es el sensor): no se proponen. Estación =>
 * [regla => motivo]. Por ejemplo, Santa Cruz está en el valle y sus vecinas a menos de 400 m de
 * desnivel son de otro ambiente.
 */
const REVISADAS = [
    '12' => ['temperatura_desvio' => 'Santa Cruz está en el valle: es más cálida que sus vecinas'],
];
const RANGOS = [
    'temperatura' => [-25, 50], 'humedad' => [1, 100], 'viento' => [0, 250], 'lluvia' => [0, 500], 'radiacion' => [0, 1500],
];

/** Texto de cada regla y sensor al que corresponde */
const REGLAS = [
    'humedad_baja' => ['humedad', 'Humedad mínima de 3 % o menos con las vecinas en 20 % o más'],
    'humedad_techo' => ['humedad', 'Humedad máxima de 40 % o menos con las vecinas en 60 % o más'],
    'humedad_clavada' => ['humedad', 'Humedad máxima igual a la mínima (no varió en el día)'],
    'temperatura_desvio' => ['temperatura', 'Temperatura a más de 5 °C de las vecinas (corregida por altura)'],
    'temperatura_clavada' => ['temperatura', 'Temperatura máxima igual a la mínima'],
    'viento_cero' => ['viento', 'Ráfaga máxima 0 con las vecinas en 5 km/h o más'],
    'radiacion_cero' => ['radiacion', 'Radiación 0 todo el día con las vecinas en 50 W/m² o más'],
    'lluvia_sin_registro' => ['lluvia', 'Sin lluvia con las vecinas en 5 mm o más (mediana)'],
    'lluvia_aislada' => ['lluvia', 'Lluvia de 10 mm o más con todas las vecinas en 1 mm o menos (confirmar: puede ser real)'],
    'fuera_de_rango' => [null, 'Valor fuera del rango posible'],
];

exigir_metodo('GET');
administrador_actual();

$dias = isset($_GET['dias']) ? (int) $_GET['dias'] : 14;
$dias = max(7, min(31, $dias));
$hasta = date('Y-m-d', strtotime('-1 day'));
$desde = date('Y-m-d', strtotime("$hasta -" . ($dias - 1) . ' day'));
// Las reglas se evalúan desde antes, para encontrar cuándo empezó cada falla
$historia = date('Y-m-d', strtotime("$hasta -" . (BUSCAR_INICIO_DIAS - 1) . ' day'));

$est = '`' . DB_ESTACIONES . '`';
$cx = conexion();

// 1) Estaciones habilitadas (SELECT *: isRadiation puede no estar en todas las instalaciones)
$estaciones = [];
foreach ($cx->query("SELECT * FROM $est.estaciones WHERE habilitada > 0")->fetch_all(MYSQLI_ASSOC) as $e) {
    $estaciones[(string) $e['Identificacion']] = [
        'nombre' => trim((string) $e['nombre']),
        'lat' => (float) $e['lat'], 'lon' => (float) $e['lon'], 'alt' => (float) $e['alt'],
        'radiacion' => !isset($e['isRadiation']) || (int) $e['isRadiation'] === 1,
    ];
}
foreach ($estaciones as $id => &$e) {
    $e['vecinas'] = [];
    foreach ($estaciones as $otra => $o) {
        if ($otra !== $id && abs($o['alt'] - $e['alt']) <= VECINAS_DESNIVEL
            && distancia_km($e['lat'], $e['lon'], $o['lat'], $o['lon']) <= VECINAS_KM) {
            $e['vecinas'][] = $otra;
        }
    }
}
unset($e);

// 2) Valores diarios desde $historia (por el índice de fecha: unas 40 filas por día, 16.000 en total)
$st = $cx->prepare("SELECT identificacion, fecha, temp_max, temp_min, hr_max, hr_min, rr_24, viento_max, rad_solar_media
    FROM $est.datos_diarios WHERE fecha BETWEEN ? AND ?");
$st->bind_param('ss', $historia, $hasta);
$st->execute();
$valores = []; // [fecha][id] => [variable => valor]
foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
    $id = (string) $f['identificacion'];
    if (!isset($estaciones[$id])) continue;
    $valores[$f['fecha']][$id] = [
        'tmax' => numero($f['temp_max']), 'tmin' => numero($f['temp_min']),
        'hrmax' => numero($f['hr_max']), 'hrmin' => numero($f['hr_min']),
        'lluvia' => numero($f['rr_24']), 'viento' => numero($f['viento_max']), 'rad' => numero($f['rad_solar_media']),
    ];
}

// 3) Bajas vigentes en el período (para marcar lo que ya está resuelto)
$bajas = [];
try {
    $st = $cx->prepare("SELECT identificacion, variable FROM $est.sensores_baja WHERE desde <= ? AND (hasta IS NULL OR hasta >= ?)");
    $st->bind_param('ss', $hasta, $desde);
    $st->execute();
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $b) $bajas[$b['identificacion'] . '|' . $b['variable']] = true;
} catch (mysqli_sql_exception $e) {
    // sin la tabla, no se marca ninguna
}

// 4) Reglas, día por día
$hallazgos = []; // "id|regla|variable" => [fechas => [fecha => [valor, vecinas]]]
$anotar = function ($id, $regla, $fecha, $valor, $vecinas, $variable = null) use (&$hallazgos) {
    $variable = $variable ?: REGLAS[$regla][0];
    $hallazgos["$id|$regla|$variable"][$fecha] = [$valor, $vecinas];
};

foreach ($valores as $fecha => $delDia) {
    foreach ($delDia as $id => $v) {
        $e = $estaciones[$id];
        // Mediana de las vecinas con dato válido, o null si son menos de MIN_VECINAS
        $vecinas = function ($clave, $corregirAltura = false) use ($delDia, $e, $estaciones) {
            $lista = [];
            foreach ($e['vecinas'] as $o) {
                $x = $delDia[$o][$clave] ?? null;
                if ($x === null || !en_rango($clave, $x)) continue;
                $lista[] = $corregirAltura ? $x - GRADIENTE_TERMICO * ($e['alt'] - $estaciones[$o]['alt']) : $x;
            }
            return count($lista) >= MIN_VECINAS ? mediana($lista) : null;
        };

        foreach ($v as $clave => $x) {
            if ($x !== null && !en_rango($clave, $x)) $anotar($id, 'fuera_de_rango', $fecha, $x, null, variable_de($clave));
        }
        $ok = function ($clave) use ($v) {
            return $v[$clave] !== null && en_rango($clave, $v[$clave]);
        };

        if ($v['hrmin'] !== null && $v['hrmin'] <= 3) {
            $m = $vecinas('hrmin');
            if ($m !== null && $m >= 20) $anotar($id, 'humedad_baja', $fecha, $v['hrmin'], $m);
        }
        if ($ok('hrmax') && $v['hrmax'] <= 40) {
            $m = $vecinas('hrmax');
            if ($m !== null && $m >= 60) $anotar($id, 'humedad_techo', $fecha, $v['hrmax'], $m);
        }
        if ($ok('hrmax') && $ok('hrmin') && $v['hrmax'] == $v['hrmin']) $anotar($id, 'humedad_clavada', $fecha, $v['hrmax'], null);

        if ($ok('tmax') && $ok('tmin') && $v['tmax'] == $v['tmin']) {
            $anotar($id, 'temperatura_clavada', $fecha, $v['tmax'], null);
        } else {
            foreach (['tmax', 'tmin'] as $clave) {
                if (!$ok($clave)) continue;
                $m = $vecinas($clave, true);
                if ($m !== null && abs($v[$clave] - $m) > 5) {
                    $anotar($id, 'temperatura_desvio', $fecha, $v[$clave], round($m, 1));
                    break;
                }
            }
        }

        if ($v['viento'] !== null && $v['viento'] == 0) {
            $m = $vecinas('viento');
            if ($m !== null && $m >= 5) $anotar($id, 'viento_cero', $fecha, 0, $m);
        }
        if ($e['radiacion'] && $v['rad'] !== null && $v['rad'] == 0) {
            $m = $vecinas('rad');
            if ($m !== null && $m >= 50) $anotar($id, 'radiacion_cero', $fecha, 0, $m);
        }

        if ($ok('lluvia')) {
            $lluviaVecinas = [];
            foreach ($e['vecinas'] as $o) {
                $x = $delDia[$o]['lluvia'] ?? null;
                if ($x !== null && en_rango('lluvia', $x)) $lluviaVecinas[] = $x;
            }
            if ($v['lluvia'] == 0 && count($lluviaVecinas) >= MIN_VECINAS && mediana($lluviaVecinas) >= 5) {
                $anotar($id, 'lluvia_sin_registro', $fecha, 0, mediana($lluviaVecinas));
            }
            if ($v['lluvia'] >= 10 && count($lluviaVecinas) >= MIN_VECINAS && max($lluviaVecinas) <= 1) {
                $anotar($id, 'lluvia_aislada', $fecha, $v['lluvia'], max($lluviaVecinas));
            }
        }
    }
}

// 5) Una alerta por estación, regla y sensor (con los días del período; el inicio, con toda la historia)
$alertas = [];
foreach ($hallazgos as $clave => $todas) {
    list($id, $regla, $variable) = explode('|', $clave);
    if (isset(REVISADAS[$id][$regla])) continue;
    ksort($todas);
    $fechas = array_filter($todas, function ($f) use ($desde) { return $f >= $desde; }, ARRAY_FILTER_USE_KEY);
    if (count($fechas) < ($regla === 'lluvia_aislada' ? 1 : MIN_DIAS)) continue;
    $ultima = array_key_last_compat($fechas);
    $inicio = inicio_de_falla(array_keys($todas), array_keys($fechas)[0]);
    $alertas[] = [
        'estacion' => $id,
        'nombre' => $estaciones[$id]['nombre'],
        'variable' => $variable,
        'regla' => $regla,
        'problema' => REGLAS[$regla][1],
        'dias' => count($fechas),
        'fechas' => array_keys($fechas),
        'primera' => array_keys($fechas)[0],
        'ultima' => $ultima,
        // la lluvia aislada es un hecho de un día, no una falla que sigue
        'inicio' => $regla === 'lluvia_aislada' ? array_keys($fechas)[0] : $inicio,
        'inicio_limite' => $regla !== 'lluvia_aislada' && $inicio <= $historia,
        'ejemplo' => ['fecha' => $ultima, 'valor' => $fechas[$ultima][0], 'vecinas' => $fechas[$ultima][1]],
        'de_baja' => isset($bajas["$id|$variable"]),
    ];
}
usort($alertas, function ($a, $b) {
    return [$a['de_baja'], -$a['dias'], $a['nombre']] <=> [$b['de_baja'], -$b['dias'], $b['nombre']];
});

responder(['ok' => true, 'desde' => $desde, 'hasta' => $hasta, 'dias' => $dias, 'alertas' => $alertas]);

/**
 * Primer día de la falla que sigue en el período: desde el primer día con falla del período se va
 * hacia atrás por los días con falla mientras el hueco entre dos de ellos no supere MAX_HUECO_DIAS.
 * $dias: fechas con falla, ordenadas.
 */
function inicio_de_falla(array $dias, string $desdePeriodo): string
{
    $i = array_search($desdePeriodo, $dias, true);
    while ($i > 0 && (strtotime($dias[$i]) - strtotime($dias[$i - 1])) / 86400 <= MAX_HUECO_DIAS) {
        $i--;
    }
    return $dias[$i];
}

function numero($x)
{
    return $x === null || $x === '' ? null : (float) $x;
}

/** Sensor al que corresponde cada valor diario */
function variable_de(string $clave): string
{
    $mapa = ['tmax' => 'temperatura', 'tmin' => 'temperatura', 'hrmax' => 'humedad', 'hrmin' => 'humedad',
        'lluvia' => 'lluvia', 'viento' => 'viento', 'rad' => 'radiacion'];
    return $mapa[$clave];
}

function en_rango(string $clave, float $x): bool
{
    list($min, $max) = RANGOS[variable_de($clave)];
    return $x >= $min && $x <= $max;
}

function mediana(array $lista)
{
    sort($lista);
    $n = count($lista);
    return $n % 2 ? $lista[intdiv($n, 2)] : ($lista[$n / 2 - 1] + $lista[$n / 2]) / 2;
}

/** array_key_last (PHP 7.3) */
function array_key_last_compat(array $a)
{
    end($a);
    return key($a);
}

function distancia_km($lat1, $lon1, $lat2, $lon2)
{
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = pow(sin($dLat / 2), 2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * pow(sin($dLon / 2), 2);
    return 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
}
