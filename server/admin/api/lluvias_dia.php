<?php
/*
 * Datos diarios de la red pluviométrica (tabla datos_rr_dia). Sólo sirven para el acumulado del mes
 * en curso del sitio: se carga ese mes y, hasta el día DIAS_GRACIA_DIARIO del mes siguiente, también
 * el anterior. Sin dato = sin fila.
 *
 * GET ?mes=AAAA-MM → {ok, mes, desde, hasta, valores:[{id, fecha, mm}]}
 *   desde/hasta: las fechas que se pueden cargar hoy.
 * POST {id, fecha, mm, reemplazar?} → un valor (mm null o vacío borra el del día).
 *   Si ya había otro valor y no viene reemplazar: {ok, guardado:false, anterior}.
 *   Si no: {ok, guardado:true, anterior, valor:{id, fecha, mm}}.
 */
require_once __DIR__ . '/lluvias_comun.php';

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();
$cx = conexion_lluvias();

$hoy = date('Y-m-d');
// Primer día que se puede cargar: el 1 del mes en curso o, en el período de gracia, el del anterior
$desde = (int) date('j') <= DIAS_GRACIA_DIARIO ? date('Y-m-01', strtotime('first day of last month')) : date('Y-m-01');

try {
    if ($metodo === 'POST') {
        guardar($cx, cuerpo_json(), $desde, $hoy, $admin);
    }

    $mes = $_GET['mes'] ?? substr($hoy, 0, 7);
    if (!is_string($mes) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mes)) {
        error_json('El mes no es válido.', 422);
    }
    $primero = "$mes-01";
    $ultimo = date('Y-m-t', strtotime($primero));
    $st = $cx->prepare('SELECT identificacion, fecha, mm FROM datos_rr_dia WHERE fecha BETWEEN ? AND ? AND mm >= 0 ORDER BY fecha, identificacion');
    $st->bind_param('ss', $primero, $ultimo);
    $st->execute();
    $valores = [];
    foreach ($st->get_result()->fetch_all(MYSQLI_ASSOC) as $f) {
        $valores[] = ['id' => (int) $f['identificacion'], 'fecha' => $f['fecha'], 'mm' => mm_json($f['mm'])];
    }
    responder(['ok' => true, 'mes' => $mes, 'desde' => $desde, 'hasta' => $hoy, 'valores' => $valores]);
} catch (Throwable $e) {
    error_tablas_lluvias($e);
}

/* ------------------------------------------------------------------------------------------------ */

function guardar(mysqli $cx, array $p, string $desde, string $hoy, string $admin)
{
    $id = leer_id($p['id'] ?? null);
    $fecha = validar_fecha($p['fecha'] ?? '', 'fecha');
    if ($fecha > $hoy) {
        error_json('No se pueden cargar fechas futuras.', 422);
    }
    if ($fecha < $desde) {
        error_json('Los datos diarios se cargan desde el ' . date('d/m/Y', strtotime($desde))
            . ': los meses anteriores ya se cierran con el total mensual.', 422);
    }
    $mm = leer_mm($p['mm'] ?? null, LIMITE_LLUVIA_DIA, 'La lluvia');
    $reemplazar = ($p['reemplazar'] ?? false) === true;
    if (!localidad_existe($cx, $id)) {
        error_json("No existe la localidad $id. Si es nueva, dala de alta en «Localidades».", 422);
    }

    $cx->begin_transaction();
    try {
        $st = $cx->prepare('SELECT Id, mm FROM datos_rr_dia WHERE identificacion = ? AND fecha = ? FOR UPDATE');
        $st->bind_param('is', $id, $fecha);
        $st->execute();
        $filas = $st->get_result()->fetch_all(MYSQLI_ASSOC);
        if (count($filas) > 1) {
            $cx->rollback();
            error_json(nombre_localidad($cx, $id) . " tiene " . count($filas) . " valores el $fecha (filas "
                . implode(', ', array_column($filas, 'Id')) . '). Hay que dejar uno solo desde la base.', 409);
        }
        $anterior = $filas ? mm_json($filas[0]['mm']) : null;

        if ($anterior !== null && $anterior !== $mm && !$reemplazar) {
            $cx->rollback();
            responder(['ok' => true, 'guardado' => false, 'anterior' => $anterior]);
        }

        if ($filas && $mm === null) {
            $st = $cx->prepare('DELETE FROM datos_rr_dia WHERE Id = ?');
            $st->bind_param('i', $filas[0]['Id']);
            $st->execute();
        } elseif ($filas) {
            $st = $cx->prepare('UPDATE datos_rr_dia SET mm = ? WHERE Id = ?');
            $st->bind_param('di', $mm, $filas[0]['Id']);
            $st->execute();
        } elseif ($mm !== null) {
            $st = $cx->prepare('INSERT INTO datos_rr_dia (fecha, identificacion, mm) VALUES (?, ?, ?)');
            $st->bind_param('sid', $fecha, $id, $mm);
            $st->execute();
        }
        $cx->commit();
    } catch (Throwable $e) {
        $cx->rollback();
        error_tablas_lluvias($e);
    }

    if ($anterior !== $mm) {
        anotar_lluvias($admin, "diario $id $fecha " . json_encode($anterior) . ' → ' . json_encode($mm));
    }
    responder(['ok' => true, 'guardado' => true, 'anterior' => $anterior,
        'valor' => ['id' => $id, 'fecha' => $fecha, 'mm' => $mm]]);
}
