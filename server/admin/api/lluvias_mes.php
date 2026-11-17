<?php
/*
 * Totales mensuales de la red pluviométrica (tabla datos_rr_mes: una fila por localidad y año, con
 * ene…dic; -999,9 = sin dato). Se cargan aparte de los diarios, de las planillas.
 *
 * GET ?anio=AAAA → {ok, anio, filas:[{id, meses:[12]}], diarios:[{id, meses:[12 {mm, dias}]}], repetidas:[id]}
 *   diarios: suma de los datos diarios de cada mes, sólo como referencia.
 * GET ?id=N → {ok, id, anios:[{anio, meses:[12]}], repetidas:[anio]}
 *   Con filas repetidas (misma localidad y año) se muestra la de id más alto, como el sitio.
 * POST {accion:'valor', id, anio, mes (1-12), mm, reemplazar?} → un valor (carga rápida).
 *   Si ya había otro valor y no viene reemplazar: {ok, guardado:false, anterior}.
 * POST {accion:'planilla', filas:[{id, anio, meses:[12 mm o null]}]} (hasta MAX_FILAS_MES) → todo o nada.
 *   Responde {ok, guardadas, cambios}.
 * En los dos POST, la fila que falta se crea.
 */
require_once __DIR__ . '/lluvias_comun.php';

const MAX_FILAS_MES = 200;

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();
$cx = conexion_lluvias();

try {
    if ($metodo === 'POST') {
        $cuerpo = cuerpo_json_lluvias();
        $accion = $cuerpo['accion'] ?? '';
        if ($accion === 'valor') {
            guardar_valor($cx, $cuerpo, $admin);
        }
        if ($accion === 'planilla') {
            guardar_planilla($cx, $cuerpo['filas'] ?? null, $admin);
        }
        error_json('Acción desconocida.', 422);
    }

    if (isset($_GET['id'])) {
        responder(serie_localidad($cx, leer_id($_GET['id'])));
    }
    responder(anio_completo($cx, leer_anio($_GET['anio'] ?? date('Y'))));
} catch (Throwable $e) {
    error_tablas_lluvias($e);
}

/* ------------------------------------------------------------------------------------------------ */

/** Una planilla de 200 filas no entra en los 20 000 bytes de cuerpo_json(). */
function cuerpo_json_lluvias(): array
{
    $datos = json_decode((string) file_get_contents('php://input', false, null, 0, 200000), true);
    if (!is_array($datos)) {
        error_json('El cuerpo del pedido debe ser JSON.');
    }
    return $datos;
}

function leer_anio($v): int
{
    if (is_string($v) && ctype_digit($v)) {
        $v = (int) $v;
    }
    $max = (int) date('Y');
    if (!is_int($v) || $v < LLUVIAS_DESDE || $v > $max) {
        error_json('El año tiene que estar entre ' . LLUVIAS_DESDE . " y $max.", 422);
    }
    return $v;
}

function meses_json(array $f): array
{
    $meses = [];
    foreach (MESES_RR as $c) {
        $meses[] = mm_json($f[$c]);
    }
    return $meses;
}

function anio_completo(mysqli $cx, int $anio): array
{
    $st = $cx->prepare('SELECT * FROM datos_rr_mes WHERE anio = ? ORDER BY identificacion, id');
    $st->bind_param('i', $anio);
    $st->execute();
    $porId = [];
    $repetidas = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
        $id = (int) $f['identificacion'];
        if (isset($porId[$id])) {
            $repetidas[$id] = true;
        }
        $porId[$id] = ['id' => $id, 'meses' => meses_json($f)];   // queda la de id más alto
    }

    // Referencia: suma de los diarios de cada mes y días con dato
    $desde = "$anio-01-01";
    $hasta = "$anio-12-31";
    $st = $cx->prepare('SELECT identificacion, MONTH(fecha) AS mes, SUM(mm) AS mm, COUNT(*) AS dias
        FROM datos_rr_dia WHERE fecha BETWEEN ? AND ? AND mm >= 0 GROUP BY identificacion, MONTH(fecha)');
    $st->bind_param('ss', $desde, $hasta);
    $st->execute();
    $diarios = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
        $id = (int) $f['identificacion'];
        $diarios[$id] = $diarios[$id] ?? ['id' => $id, 'meses' => array_fill(0, 12, null)];
        $diarios[$id]['meses'][(int) $f['mes'] - 1] = ['mm' => round((float) $f['mm'], 1), 'dias' => (int) $f['dias']];
    }

    return ['ok' => true, 'anio' => $anio, 'filas' => array_values($porId), 'diarios' => array_values($diarios),
        'repetidas' => array_keys($repetidas)];
}

function serie_localidad(mysqli $cx, int $id): array
{
    $st = $cx->prepare('SELECT * FROM datos_rr_mes WHERE identificacion = ? ORDER BY anio, id');
    $st->bind_param('i', $id);
    $st->execute();
    $porAnio = [];
    $repetidas = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
        $anio = (int) $f['anio'];
        if (isset($porAnio[$anio])) {
            $repetidas[$anio] = true;
        }
        $porAnio[$anio] = ['anio' => $anio, 'meses' => meses_json($f)];
    }
    return ['ok' => true, 'id' => $id, 'anios' => array_values($porAnio), 'repetidas' => array_keys($repetidas)];
}

/** Fila de la localidad y el año (bloqueada hasta el commit), o null. Con repetidas, error 409. */
function fila_bloqueada(mysqli $cx, int $id, int $anio)
{
    $st = $cx->prepare('SELECT * FROM datos_rr_mes WHERE identificacion = ? AND anio = ? FOR UPDATE');
    $st->bind_param('ii', $id, $anio);
    $st->execute();
    $filas = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    if (count($filas) > 1) {
        $cx->rollback();
        error_json(nombre_localidad($cx, $id) . " tiene " . count($filas) . " filas en $anio (id "
            . implode(', ', array_column($filas, 'id')) . '). Hay que dejar una sola desde la base.', 409);
    }
    return $filas[0] ?? null;
}

/** Escribe los 12 meses (null = sin dato) en la fila existente o en una nueva. */
function escribir_fila(mysqli $cx, $fila, int $id, int $anio, array $meses)
{
    $valores = array_map(function ($v) {
        return $v === null ? SIN_DATO : $v;
    }, $meses);
    if ($fila) {
        $st = $cx->prepare('UPDATE datos_rr_mes SET ' . implode(' = ?, ', MESES_RR) . ' = ? WHERE id = ?');
        $tipos = str_repeat('d', 12) . 'i';
        $params = array_merge($valores, [(int) $fila['id']]);
    } else {
        $st = $cx->prepare('INSERT INTO datos_rr_mes (identificacion, anio, ' . implode(', ', MESES_RR) . ') VALUES ('
            . implode(', ', array_fill(0, 14, '?')) . ')');
        $tipos = 'ii' . str_repeat('d', 12);
        $params = array_merge([$id, $anio], $valores);
    }
    $st->bind_param($tipos, ...$params);
    $st->execute();
}

function guardar_valor(mysqli $cx, array $p, string $admin)
{
    $id = leer_id($p['id'] ?? null);
    $anio = leer_anio($p['anio'] ?? null);
    $mes = $p['mes'] ?? null;
    if (!is_int($mes) || $mes < 1 || $mes > 12) {
        error_json('El mes no es válido.', 422);
    }
    if ($anio === (int) date('Y') && $mes > (int) date('n')) {
        error_json('No se pueden cargar meses futuros.', 422);
    }
    $mm = leer_mm($p['mm'] ?? null, LIMITE_LLUVIA_MES, 'El total');
    $reemplazar = ($p['reemplazar'] ?? false) === true;
    if (!localidad_existe($cx, $id)) {
        error_json("No existe la localidad $id. Si es nueva, dala de alta en «Localidades».", 422);
    }

    $cx->begin_transaction();
    try {
        $fila = fila_bloqueada($cx, $id, $anio);
        $meses = $fila ? meses_json($fila) : array_fill(0, 12, null);
        $anterior = $meses[$mes - 1];
        if ($anterior !== null && $anterior !== $mm && !$reemplazar) {
            $cx->rollback();
            responder(['ok' => true, 'guardado' => false, 'anterior' => $anterior]);
        }
        $meses[$mes - 1] = $mm;
        if ($fila || $mm !== null) {
            escribir_fila($cx, $fila, $id, $anio, $meses);
        }
        $cx->commit();
    } catch (Throwable $e) {
        $cx->rollback();
        error_tablas_lluvias($e);
    }

    if ($anterior !== $mm) {
        anotar_lluvias($admin, "mensual $id $anio-" . MESES_RR[$mes - 1] . ' ' . json_encode($anterior) . ' → ' . json_encode($mm));
    }
    responder(['ok' => true, 'guardado' => true, 'anterior' => $anterior,
        'valor' => ['id' => $id, 'anio' => $anio, 'mes' => $mes, 'mm' => $mm]]);
}

function guardar_planilla(mysqli $cx, $filas, string $admin)
{
    if (!is_array($filas) || !$filas || count($filas) > MAX_FILAS_MES) {
        error_json('Mandá entre 1 y ' . MAX_FILAS_MES . ' filas.', 422);
    }

    // Controles de todas las filas antes de tocar la base
    $nuevas = [];
    $hoyAnio = (int) date('Y');
    $hoyMes = (int) date('n');
    foreach ($filas as $p) {
        if (!is_array($p)) {
            error_json('Pedido inválido.', 422);
        }
        $id = leer_id($p['id'] ?? null);
        $anio = leer_anio($p['anio'] ?? null);
        $clave = "$id|$anio";
        if (isset($nuevas[$clave])) {
            error_json("La localidad $id está repetida en $anio.", 422);
        }
        $meses = $p['meses'] ?? null;
        if (!is_array($meses) || count($meses) !== 12) {
            error_json("Localidad $id, $anio: van 12 valores, de enero a diciembre.", 422);
        }
        $leidos = [];
        foreach (array_values($meses) as $i => $v) {
            $mm = leer_mm($v, LIMITE_LLUVIA_MES, "Localidad $id, " . MESES_RR[$i] . " $anio");
            if ($mm !== null && $anio === $hoyAnio && $i + 1 > $hoyMes) {
                error_json("Localidad $id: " . MESES_RR[$i] . " $anio todavía no terminó.", 422);
            }
            $leidos[] = $mm;
        }
        $nuevas[$clave] = ['id' => $id, 'anio' => $anio, 'meses' => $leidos];
    }
    foreach (array_unique(array_column($nuevas, 'id')) as $id) {
        if (!localidad_existe($cx, $id)) {
            error_json("No existe la localidad $id. Si es nueva, dala de alta en «Localidades».", 422);
        }
    }

    $anotaciones = [];
    $cambios = 0;
    $cx->begin_transaction();
    try {
        foreach ($nuevas as $n) {
            $fila = fila_bloqueada($cx, $n['id'], $n['anio']);
            $antes = $fila ? meses_json($fila) : array_fill(0, 12, null);
            $distintos = [];
            foreach ($n['meses'] as $i => $v) {
                if ($antes[$i] !== $v) {
                    $distintos[MESES_RR[$i]] = [$antes[$i], $v];
                }
            }
            if (!$distintos && ($fila || !array_filter($n['meses'], 'is_float'))) {
                continue;   // nada para guardar
            }
            escribir_fila($cx, $fila, $n['id'], $n['anio'], $n['meses']);
            $cambios += count($distintos);
            $anotaciones[] = "mensual {$n['id']} {$n['anio']} " . ($fila ? '' : '(fila nueva) ') . json_encode($distintos);
        }
        $cx->commit();
    } catch (Throwable $e) {
        $cx->rollback();
        error_tablas_lluvias($e);
    }

    foreach ($anotaciones as $a) {
        anotar_lluvias($admin, $a);
    }
    responder(['ok' => true, 'guardadas' => count($anotaciones), 'cambios' => $cambios]);
}
