<?php
/*
 * Serie diaria de El Colmenar (base `colmenar`, tabla clima_diario_el_colmenar): carga de los días
 * faltantes y validación de los provisionales.
 *
 * GET ?resumen=1 → {ok, inicio, hoy, total, anios:[{anio, dias, sin_fila, provisionales, sin_max, sin_min, sin_pp}]}
 *   Sólo los años con algo pendiente. dias: días del año entre `inicio` y hoy.
 * GET ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&pendientes=1] (hasta 366 días, sin pasar de hoy)
 *   → {ok, inicio, hoy, desde, hasta, dias:[dia]}: todos los días del período, también los que no
 *   tienen fila (existe: false). Con pendientes=1, sólo los que tienen algo para cargar.
 * POST {dias:[{fecha, temp_max, temp_min, precipitacion, traza, observaciones?}]} (hasta 366)
 *   Todo o nada: si un día no pasa los controles no se guarda ninguno.
 *   - Día sin fila o provisional (estado_registro = 0): se guardan los tres valores (null = sin
 *     dato) y queda definitivo (estado_registro = 1). Si cambia algún valor, origen = 'convencional';
 *     si se confirma tal cual, conserva su origen.
 *   - Día definitivo: sólo se pueden completar los valores que están en null; los demás tienen que
 *     venir iguales. Conserva su origen.
 *   estado_pp se calcula: null → 3, traza → 1 (con 0 mm), 0 → 0, 0,1 mm o más → 2.
 *   Cada día guardado se anota en colmenar.log (email, IP, valores anteriores y nuevos).
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();

const MAX_DIAS_COLMENAR = 366;
const TABLA_COLMENAR = '`' . DB_COLMENAR . '`.clima_diario_el_colmenar';
const COLUMNAS_COLMENAR = 'fecha, temp_max, temp_min, precipitacion, estado_pp, origen, estado_registro, observaciones, actualizado_en';

$cx = conexion_colmenar();
$hoy = date('Y-m-d');
$inicio = primer_dia($cx);

try {
    if ($metodo === 'POST') {
        guardar($cx, cuerpo_json_grande(), $inicio, $hoy, $admin);
    }
    if (isset($_GET['resumen'])) {
        responder(resumen($cx, $inicio, $hoy));
    }

    $desde = validar_fecha($_GET['desde'] ?? '', 'fecha inicial');
    $hasta = validar_fecha($_GET['hasta'] ?? '', 'fecha final');
    if ($desde > $hasta) {
        error_json('La fecha inicial es posterior a la final.', 422);
    }
    if ($hasta > $hoy) {
        $hasta = $hoy;
    }
    if ($desde < $inicio) {
        $desde = $inicio;
    }
    if ($desde > $hasta) {
        error_json("La serie va del $inicio a hoy.", 422);
    }
    if (dias_entre($desde, $hasta) > MAX_DIAS_COLMENAR) {
        error_json('El período puede tener hasta ' . MAX_DIAS_COLMENAR . ' días.', 422);
    }
    $soloPendientes = !empty($_GET['pendientes']);

    $dias = [];
    foreach (leer_periodo($cx, $desde, $hasta) as $dia) {
        if (!$soloPendientes || $dia['pendiente']) {
            $dias[] = $dia;
        }
    }
    responder(['ok' => true, 'inicio' => $inicio, 'hoy' => $hoy, 'desde' => $desde, 'hasta' => $hasta, 'dias' => $dias]);
} catch (mysqli_sql_exception $e) {
    error_tabla_colmenar($e);
}

/* ------------------------------------------------------------------------------------------------ */

/** Conexión con conecta_colmenar.php (recibe $db y define $conexion, como conecta_mysql.php). */
function conexion_colmenar(): mysqli
{
    if (!is_file(RUTA_CONECTA_COLMENAR)) {
        error_json('Instalación incompleta en el servidor: falta conecta_colmenar.php.', 500);
    }
    $db = DB_COLMENAR;
    ob_start();
    require RUTA_CONECTA_COLMENAR;
    ob_end_clean();
    if (!isset($conexion) || !($conexion instanceof mysqli) || $conexion->connect_errno) {
        error_json('No se pudo conectar a la base de El Colmenar.', 500);
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conexion->set_charset('utf8mb4');
    return $conexion;
}

function error_tabla_colmenar(mysqli_sql_exception $e)
{
    if ($e->getCode() === 1142 || $e->getCode() === 1044) {
        error_json('El usuario de conecta_colmenar.php no tiene permiso sobre clima_diario_el_colmenar (hace falta SELECT, INSERT y UPDATE).', 500);
    }
    if ($e->getCode() === 1146) {
        error_json('La base `' . DB_COLMENAR . '` no tiene la tabla clima_diario_el_colmenar.', 500);
    }
    throw $e;
}

/** Primer día de la serie (el de la tabla, o COLMENAR_DESDE si está vacía). */
function primer_dia(mysqli $cx): string
{
    try {
        $f = $cx->query('SELECT MIN(fecha) AS f FROM ' . TABLA_COLMENAR)->fetch_assoc();
    } catch (mysqli_sql_exception $e) {
        error_tabla_colmenar($e);
    }
    return $f && $f['f'] ? min($f['f'], COLMENAR_DESDE) : COLMENAR_DESDE;
}

function dias_entre(string $desde, string $hasta): int
{
    return (int) (new DateTime($desde))->diff(new DateTime($hasta))->days + 1;
}

/** El cuerpo de un POST de 366 días no entra en los 20 000 bytes de cuerpo_json(). */
function cuerpo_json_grande(): array
{
    $datos = json_decode((string) file_get_contents('php://input', false, null, 0, 200000), true);
    if (!is_array($datos)) {
        error_json('El cuerpo del pedido debe ser JSON.');
    }
    return $datos;
}

/** Años con días pendientes: sin fila, provisionales o con algún valor en null. */
function resumen(mysqli $cx, string $inicio, string $hoy): array
{
    $filas = $cx->query('SELECT YEAR(fecha) AS anio, COUNT(*) AS filas,
                SUM(estado_registro = 0) AS provisionales,
                SUM(estado_registro <> 0 AND temp_max IS NULL) AS sin_max,
                SUM(estado_registro <> 0 AND temp_min IS NULL) AS sin_min,
                SUM(estado_registro <> 0 AND precipitacion IS NULL) AS sin_pp
            FROM ' . TABLA_COLMENAR . ' GROUP BY YEAR(fecha)')->fetch_all(MYSQLI_ASSOC);
    $porAnio = [];
    foreach ($filas as $f) {
        $porAnio[(int) $f['anio']] = $f;
    }

    $anios = [];
    $total = 0;
    for ($a = (int) substr($inicio, 0, 4); $a <= (int) substr($hoy, 0, 4); $a++) {
        $dias = dias_entre(max($inicio, "$a-01-01"), min($hoy, "$a-12-31"));
        $f = $porAnio[$a] ?? ['filas' => 0, 'provisionales' => 0, 'sin_max' => 0, 'sin_min' => 0, 'sin_pp' => 0];
        $fila = [
            'anio' => $a,
            'dias' => $dias,
            // Filas fuera del período (días futuros) no restan: no hay ninguna, pero por las dudas
            'sin_fila' => max(0, $dias - (int) $f['filas']),
            'provisionales' => (int) $f['provisionales'],
            'sin_max' => (int) $f['sin_max'],
            'sin_min' => (int) $f['sin_min'],
            'sin_pp' => (int) $f['sin_pp'],
        ];
        $pendientes = $fila['sin_fila'] + $fila['provisionales'] + $fila['sin_max'] + $fila['sin_min'] + $fila['sin_pp'];
        if ($pendientes > 0) {
            $anios[] = $fila;
            $total += $pendientes;
        }
    }
    return ['ok' => true, 'inicio' => $inicio, 'hoy' => $hoy, 'total' => $total, 'anios' => $anios];
}

/** Todos los días del período, con los que no tienen fila completados como faltantes. */
function leer_periodo(mysqli $cx, string $desde, string $hasta): array
{
    $st = $cx->prepare('SELECT ' . COLUMNAS_COLMENAR . ' FROM ' . TABLA_COLMENAR . ' WHERE fecha BETWEEN ? AND ? ORDER BY fecha');
    $st->bind_param('ss', $desde, $hasta);
    $st->execute();
    $guardados = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
        $guardados[$f['fecha']] = $f;
    }

    $dias = [];
    for ($d = new DateTime($desde), $fin = new DateTime($hasta); $d <= $fin; $d->modify('+1 day')) {
        $fecha = $d->format('Y-m-d');
        $dias[] = dia_json($fecha, $guardados[$fecha] ?? null);
    }
    return $dias;
}

function numero_o_null($v)
{
    return $v === null ? null : round((float) $v, 1);
}

function dia_json(string $fecha, ?array $f): array
{
    if (!$f) {
        return ['fecha' => $fecha, 'existe' => false, 'temp_max' => null, 'temp_min' => null, 'precipitacion' => null,
            'estado_pp' => 3, 'origen' => null, 'definitivo' => false, 'observaciones' => null, 'actualizado_en' => null,
            'pendiente' => true];
    }
    $dia = [
        'fecha' => $fecha,
        'existe' => true,
        'temp_max' => numero_o_null($f['temp_max']),
        'temp_min' => numero_o_null($f['temp_min']),
        'precipitacion' => numero_o_null($f['precipitacion']),
        'estado_pp' => (int) $f['estado_pp'],
        'origen' => $f['origen'],
        'definitivo' => (int) $f['estado_registro'] === 1,
        'observaciones' => $f['observaciones'],
        'actualizado_en' => $f['actualizado_en'],
    ];
    $dia['pendiente'] = !$dia['definitivo'] || $dia['temp_max'] === null || $dia['temp_min'] === null || $dia['precipitacion'] === null;
    return $dia;
}

/** null, o un número con un decimal como máximo dentro de [min, max]; si no, error 422. */
function valor_decimal($v, float $min, float $max, string $que, string $fecha)
{
    if ($v === null || $v === '') {
        return null;
    }
    if (!is_int($v) && !is_float($v)) {
        error_json("$fecha: $que no es un número.", 422);
    }
    $v = (float) $v;
    if (abs($v * 10 - round($v * 10)) > 1e-6) {
        error_json("$fecha: $que admite un decimal como máximo.", 422);
    }
    if ($v < $min || $v > $max) {
        error_json("$fecha: $que tiene que estar entre " . str_replace('.', ',', (string) $min) . ' y ' . str_replace('.', ',', (string) $max) . '.', 422);
    }
    return round($v, 1);
}

function guardar(mysqli $cx, array $cuerpo, string $inicio, string $hoy, string $admin)
{
    $pedidos = $cuerpo['dias'] ?? null;
    if (!is_array($pedidos) || !$pedidos || count($pedidos) > MAX_DIAS_COLMENAR) {
        error_json('Mandá entre 1 y ' . MAX_DIAS_COLMENAR . ' días.', 422);
    }

    // Controles de cada día antes de tocar la base
    $nuevos = [];
    foreach ($pedidos as $p) {
        if (!is_array($p)) {
            error_json('Pedido inválido.', 422);
        }
        $fecha = validar_fecha($p['fecha'] ?? '', 'fecha');
        if ($fecha < $inicio || $fecha > $hoy) {
            error_json("$fecha: la serie va del $inicio a hoy.", 422);
        }
        if (isset($nuevos[$fecha])) {
            error_json("$fecha: está repetida.", 422);
        }
        $max = valor_decimal($p['temp_max'] ?? null, LIMITES_COLMENAR['temp'][0], LIMITES_COLMENAR['temp'][1], 'la máxima', $fecha);
        $min = valor_decimal($p['temp_min'] ?? null, LIMITES_COLMENAR['temp'][0], LIMITES_COLMENAR['temp'][1], 'la mínima', $fecha);
        $pp = valor_decimal($p['precipitacion'] ?? null, 0, LIMITES_COLMENAR['pp'], 'la lluvia', $fecha);
        $traza = ($p['traza'] ?? false) === true;
        if ($max !== null && $min !== null && $max < $min) {
            error_json("$fecha: la máxima es menor que la mínima.", 422);
        }
        if ($traza && $pp !== 0.0) {
            error_json("$fecha: la traza se carga con 0 mm de lluvia.", 422);
        }
        if ($max === null && $min === null && $pp === null) {
            error_json("$fecha: cargá al menos un valor.", 422);
        }
        // Vacías: se conservan las que tenga el día
        $obs = isset($p['observaciones']) && is_string($p['observaciones']) ? trim($p['observaciones']) : '';
        // Hasta 255 caracteres (no bytes); sin mb_strlen, que necesita la extensión mbstring
        if (!preg_match('/^.{0,255}$/su', $obs)) {
            error_json("$fecha: las observaciones pueden tener hasta 255 caracteres.", 422);
        }
        $nuevos[$fecha] = [
            'temp_max' => $max,
            'temp_min' => $min,
            'precipitacion' => $pp,
            'estado_pp' => $pp === null ? 3 : ($traza ? 1 : ($pp > 0 ? 2 : 0)),
            'observaciones' => $obs,
        ];
    }

    $fechas = array_keys($nuevos);
    $desde = min($fechas);
    $hasta = max($fechas);
    if (dias_entre($desde, $hasta) > MAX_DIAS_COLMENAR) {
        error_json('Los días tienen que estar dentro de un período de ' . MAX_DIAS_COLMENAR . ' días.', 422);
    }

    $cx->begin_transaction();
    $anotaciones = [];
    try {
        $leer = $cx->prepare('SELECT ' . COLUMNAS_COLMENAR . ' FROM ' . TABLA_COLMENAR . ' WHERE fecha = ? FOR UPDATE');
        $insertar = $cx->prepare('INSERT INTO ' . TABLA_COLMENAR . " (fecha, temp_max, temp_min, precipitacion, estado_pp, origen, estado_registro, observaciones)
            VALUES (?, ?, ?, ?, ?, 'convencional', 1, ?)");
        $actualizar = $cx->prepare('UPDATE ' . TABLA_COLMENAR . ' SET temp_max = ?, temp_min = ?, precipitacion = ?, estado_pp = ?,
            origen = ?, estado_registro = 1, observaciones = ? WHERE fecha = ?');

        foreach ($nuevos as $fecha => $n) {
            $leer->bind_param('s', $fecha);
            $leer->execute();
            $antes = $leer->get_result()->fetch_assoc();
            $obs = $n['observaciones'] !== '' ? $n['observaciones'] : null;

            if (!$antes) {
                $insertar->bind_param('sdddis', $fecha, $n['temp_max'], $n['temp_min'], $n['precipitacion'], $n['estado_pp'], $obs);
                $insertar->execute();
                $anotaciones[] = "$fecha carga " . json_encode(array_diff_key($n, ['observaciones' => 1]));
                continue;
            }

            $viejo = dia_json($fecha, $antes);
            $cambia = false;
            foreach (['temp_max', 'temp_min', 'precipitacion', 'estado_pp'] as $campo) {
                if ($viejo[$campo] === $n[$campo]) {
                    continue;
                }
                // Un día definitivo sólo admite completar los valores vacíos
                if ($viejo['definitivo'] && $campo !== 'estado_pp' && $viejo[$campo] !== null) {
                    error_json("$fecha: el día ya está validado y sólo se pueden completar los valores vacíos.", 409);
                }
                if ($viejo['definitivo'] && $campo === 'estado_pp' && $viejo['precipitacion'] !== null) {
                    error_json("$fecha: el día ya está validado; no se puede cambiar la traza.", 409);
                }
                $cambia = true;
            }
            if (!$cambia && $viejo['definitivo']) {
                continue;   // nada para guardar
            }
            if ($obs === null) {
                $obs = $antes['observaciones'];
            }
            $origen = $viejo['definitivo'] || !$cambia ? $antes['origen'] : 'convencional';
            $actualizar->bind_param('dddisss', $n['temp_max'], $n['temp_min'], $n['precipitacion'], $n['estado_pp'], $origen, $obs, $fecha);
            $actualizar->execute();
            $anotaciones[] = "$fecha " . ($viejo['definitivo'] ? 'completa' : 'valida') . ' '
                . json_encode(array_intersect_key($viejo, array_flip(['temp_max', 'temp_min', 'precipitacion', 'estado_pp', 'origen', 'definitivo'])))
                . ' → ' . json_encode(array_diff_key($n, ['observaciones' => 1]) + ['origen' => $origen]);
        }
        $cx->commit();
    } catch (Throwable $e) {
        $cx->rollback();
        if ($e instanceof mysqli_sql_exception) {
            error_tabla_colmenar($e);
        }
        throw $e;
    }

    $ip = ip_cliente();
    foreach ($anotaciones as $a) {
        @error_log(date('Y-m-d H:i:s') . " $admin $ip $a\n", 3, __DIR__ . '/colmenar.log');
    }

    $dias = array_values(array_filter(leer_periodo($cx, $desde, $hasta), function ($d) use ($nuevos) {
        return isset($nuevos[$d['fecha']]);
    }));
    responder(['ok' => true, 'guardados' => count($anotaciones), 'dias' => $dias]);
}
