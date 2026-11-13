<?php
/*
 * Sensores dados de baja (depuración de datos). Cada fila dice que una variable de una estación da
 * valores erróneos desde una fecha (y hasta otra, si ya se arregló). El sitio no usa esos valores en
 * ninguna sección: los lee de /services/sensores-baja.php. La tabla está en la base `estaciones`.
 *
 * GET → {ok, variables:[...], estaciones:[{id, nombre}], bajas:[{id, estacion, nombre, variable, desde,
 *        hasta, motivo, cargado_por, creado}]}
 * POST {accion:'crear', estacion, variable, desde, hasta?, motivo}
 * POST {accion:'editar', id, desde, hasta?, motivo}   (para cerrarla, poner hasta: el día anterior al arreglo)
 * POST {accion:'borrar', id}                         (sólo si se cargó por error)
 * Cada cambio se anota en sensores.log con el email del administrador.
 */
require_once __DIR__ . '/comun.php';

/** Variables que se pueden dar de baja (las mismas que src/app/shared/depuracion.ts) */
const VARIABLES_SENSOR = ['temperatura', 'humedad', 'viento', 'lluvia', 'radiacion', 'presion', 'hoja'];

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();

$est = '`' . DB_ESTACIONES . '`';
$cx = conexion();

try {
    if ($metodo === 'POST') {
        $d = cuerpo_json();
        $accion = $d['accion'] ?? '';

        if ($accion === 'borrar') {
            $id = (int) ($d['id'] ?? 0);
            $st = $cx->prepare("DELETE FROM $est.sensores_baja WHERE id = ?");
            $st->bind_param('i', $id);
            $st->execute();
            if ($st->affected_rows < 1) {
                error_json('Esa baja ya no existe.', 404);
            }
            anotar_sensor($admin, "borra la baja $id");
            responder(['ok' => true, 'mensaje' => 'Baja borrada.']);
        }

        if ($accion !== 'crear' && $accion !== 'editar') {
            error_json('Acción inválida.');
        }
        $desde = validar_fecha($d['desde'] ?? '', 'fecha desde');
        $hasta = isset($d['hasta']) && $d['hasta'] !== '' && $d['hasta'] !== null ? validar_fecha($d['hasta'], 'fecha hasta') : null;
        if ($hasta !== null && $hasta < $desde) {
            error_json('La fecha hasta es anterior a la fecha desde.', 422);
        }
        $motivo = is_string($d['motivo'] ?? null) ? trim($d['motivo']) : '';
        if ($motivo === '' || mb_strlen($motivo) > 255) {
            error_json('Escribí el motivo (hasta 255 caracteres).', 422);
        }

        if ($accion === 'editar') {
            $id = (int) ($d['id'] ?? 0);
            $st = $cx->prepare("UPDATE $est.sensores_baja SET desde = ?, hasta = ?, motivo = ?, modificado = NOW() WHERE id = ?");
            $st->bind_param('sssi', $desde, $hasta, $motivo, $id);
            $st->execute();
            if ($st->affected_rows < 1 && !existe_baja($cx, $est, $id)) {
                error_json('Esa baja ya no existe.', 404);
            }
            anotar_sensor($admin, "edita la baja $id: $desde a " . ($hasta ?? 'sin fin'));
            responder(['ok' => true, 'mensaje' => 'Baja actualizada.']);
        }

        $estacion = trim((string) ($d['estacion'] ?? ''));
        $st = $cx->prepare("SELECT nombre FROM $est.estaciones WHERE Identificacion = ?");
        $st->bind_param('s', $estacion);
        $st->execute();
        $fila = $st->get_result()->fetch_assoc();
        if (!$fila) {
            error_json('Estación inválida.', 422);
        }
        $variable = $d['variable'] ?? '';
        if (!in_array($variable, VARIABLES_SENSOR, true)) {
            error_json('Variable inválida.', 422);
        }

        $st = $cx->prepare("INSERT INTO $est.sensores_baja (identificacion, variable, desde, hasta, motivo, cargado_por)
            VALUES (?, ?, ?, ?, ?, ?)");
        $st->bind_param('ssssss', $estacion, $variable, $desde, $hasta, $motivo, $admin);
        $st->execute();
        anotar_sensor($admin, "da de baja $variable de la estación $estacion desde $desde, baja {$cx->insert_id}");
        responder(['ok' => true, 'mensaje' => 'Sensor de ' . $variable . ' de ' . trim($fila['nombre']) . ' dado de baja.']);
    }

    $estaciones = $cx->query("SELECT Identificacion AS id, nombre FROM $est.estaciones WHERE habilitada > 0 ORDER BY nombre")
        ->fetch_all(MYSQLI_ASSOC);
    $bajas = $cx->query("
        SELECT b.id, b.identificacion, e.nombre, b.variable, b.desde, b.hasta, b.motivo, b.cargado_por, b.creado
        FROM $est.sensores_baja b LEFT JOIN $est.estaciones e ON e.Identificacion = b.identificacion
        ORDER BY (b.hasta IS NULL OR b.hasta >= CURDATE()) DESC, e.nombre, b.variable, b.desde DESC")->fetch_all(MYSQLI_ASSOC);
} catch (mysqli_sql_exception $e) {
    if ($e->getCode() === 1146) {
        error_json('Falta crear la tabla sensores_baja en la base `' . DB_ESTACIONES . '` (ver server/admin/LEEME.md).', 500);
    }
    if ($e->getCode() === 1142) {
        error_json('El usuario de conecta_admin.php no tiene permiso sobre la tabla sensores_baja.', 500);
    }
    throw $e;
}

responder([
    'ok' => true,
    'variables' => VARIABLES_SENSOR,
    'estaciones' => array_map(function ($e) {
        return ['id' => (string) $e['id'], 'nombre' => trim((string) $e['nombre'])];
    }, $estaciones),
    'bajas' => array_map(function ($b) {
        return [
            'id' => (int) $b['id'],
            'estacion' => (string) $b['identificacion'],
            'nombre' => $b['nombre'] === null ? null : trim($b['nombre']),
            'variable' => $b['variable'],
            'desde' => $b['desde'],
            'hasta' => $b['hasta'],
            'motivo' => $b['motivo'],
            'cargado_por' => $b['cargado_por'],
            'creado' => $b['creado'],
        ];
    }, $bajas),
]);

function existe_baja(mysqli $cx, string $est, int $id): bool
{
    $st = $cx->prepare("SELECT id FROM $est.sensores_baja WHERE id = ?");
    $st->bind_param('i', $id);
    $st->execute();
    return (bool) $st->get_result()->fetch_assoc();
}

function anotar_sensor(string $admin, string $texto)
{
    @error_log(date('Y-m-d H:i:s') . " $admin $texto\n", 3, __DIR__ . '/sensores.log');
}
