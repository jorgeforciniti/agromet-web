<?php
/*
 * Control de estaciones (reemplaza control.php del visor de estaciones). Los pedidos quedan en
 * `comandos_estaciones` y UDPAdmin los envía cuando la estación transmite su próxima trama.
 *
 * GET → {ok, ahora, estaciones:[{id, nombre, fecha_i, min_dato}], pendientes:[...], historial:[...]}
 *   fecha_i y ahora con el formato que espera la estación: dd/mm/aahh:mm (27/10/2613:14).
 * POST {accion:'crear', estacion, comando:'hora'|'borrar', fecha_ref?, confirmar?}
 *   hora: fecha_ref dd/mm/aahh:mm o 00/00/0000:00 (desde dónde reenviar datos).
 *   borrar: confirmar tiene que ser el número de la estación.
 * POST {accion:'cancelar', id} → sólo si sigue pendiente.
 * Cada pedido se anota en comandos.log con el email del administrador.
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();

$est = '`' . DB_ESTACIONES . '`';
$cx = conexion();

try {
    if ($metodo === 'POST') {
        $d = cuerpo_json();
        $accion = $d['accion'] ?? '';
        if ($accion === 'cancelar') {
            $id = (int) ($d['id'] ?? 0);
            $st = $cx->prepare("UPDATE $est.comandos_estaciones SET estado = 'cancelado' WHERE id = ? AND estado = 'pendiente'");
            $st->bind_param('i', $id);
            $st->execute();
            if ($st->affected_rows < 1) {
                error_json('Ese pedido ya no estaba pendiente (probablemente ya se envió).', 409);
            }
            anotar_comando($admin, "cancela el pedido $id");
            responder(['ok' => true, 'mensaje' => "Pedido $id cancelado."]);
        }
        if ($accion !== 'crear') {
            error_json('Acción inválida.');
        }

        $estacion = (int) ($d['estacion'] ?? 0);
        $comando = $d['comando'] ?? '';
        $st = $cx->prepare("SELECT nombre FROM $est.estaciones WHERE Identificacion = ? AND habilitada > 0 AND gprs = 1");
        $st->bind_param('i', $estacion);
        $st->execute();
        $fila = $st->get_result()->fetch_assoc();
        if (!$fila) {
            error_json('Estación inválida.', 422);
        }
        if (!in_array($comando, ['hora', 'borrar'], true)) {
            error_json('Comando inválido.', 422);
        }
        $fecha = '';
        if ($comando === 'hora') {
            $fecha = trim((string) ($d['fecha_ref'] ?? ''));
            if (!preg_match('~^(\d\d/\d\d/\d\d\d\d:\d\d|00/00/0000:00)$~', $fecha)) {
                error_json('La fecha debe tener el formato dd/mm/aahh:mm (ej. 27/10/2613:14).', 422);
            }
        } elseif (trim((string) ($d['confirmar'] ?? '')) !== (string) $estacion) {
            error_json("Para borrar la memoria hay que escribir el número de la estación ($estacion) en el campo de confirmación.", 422);
        }

        $st = $cx->prepare("SELECT id FROM $est.comandos_estaciones WHERE estacion = ? AND comando = ? AND estado = 'pendiente'");
        $st->bind_param('is', $estacion, $comando);
        $st->execute();
        if ($st->get_result()->fetch_assoc()) {
            error_json('Esa estación ya tiene ese pedido pendiente.', 409);
        }

        $ip = ip_cliente();
        $st = $cx->prepare("INSERT INTO $est.comandos_estaciones (estacion, comando, fecha_ref, creado_ip) VALUES (?, ?, ?, ?)");
        $st->bind_param('isss', $estacion, $comando, $fecha, $ip);
        $st->execute();
        anotar_comando($admin, "pide '$comando'" . ($fecha !== '' ? " ($fecha)" : '') . " a la estación $estacion, pedido {$cx->insert_id}");
        responder(['ok' => true, 'mensaje' => 'Pedido cargado para ' . trim($fila['nombre'])
            . '. Se enviará cuando la estación transmita su próxima trama (normalmente en menos de 15 minutos).']);
    }

    $estaciones = $cx->query("
        SELECT e.Identificacion AS id, e.nombre, DATE_FORMAT(e.fecha_I, '%d/%m/%y%H:%i') AS fecha_i,
               (SELECT TIMESTAMPDIFF(MINUTE, TIMESTAMP(d.Fecha, d.Hora), NOW()) FROM $est.datos_estaciones d
                 WHERE d.Identificacion = e.Identificacion ORDER BY d.Fecha DESC, d.Hora DESC LIMIT 1) AS min_dato
        FROM $est.estaciones e WHERE e.habilitada > 0 AND e.gprs = 1 ORDER BY e.nombre")->fetch_all(MYSQLI_ASSOC);
    $ahora = $cx->query("SELECT DATE_FORMAT(NOW(), '%d/%m/%y%H:%i') AS ahora")->fetch_assoc()['ahora'];
    $pendientes = $cx->query("
        SELECT c.id, c.estacion, e.nombre, c.comando, c.fecha_ref, c.creado
        FROM $est.comandos_estaciones c LEFT JOIN $est.estaciones e ON e.Identificacion = c.estacion
        WHERE c.estado = 'pendiente' ORDER BY c.id")->fetch_all(MYSQLI_ASSOC);
    $historial = $cx->query("
        SELECT c.id, c.estacion, e.nombre, c.comando, c.fecha_ref, c.estado, c.creado, c.enviado
        FROM $est.comandos_estaciones c LEFT JOIN $est.estaciones e ON e.Identificacion = c.estacion
        WHERE c.estado <> 'pendiente' ORDER BY c.id DESC LIMIT 20")->fetch_all(MYSQLI_ASSOC);
} catch (mysqli_sql_exception $e) {
    error_tablas_estaciones($e);
}

$pedido = function ($p) {
    return [
        'id' => (int) $p['id'],
        'estacion' => (string) $p['estacion'],
        'nombre' => $p['nombre'] === null ? null : trim($p['nombre']),
        'comando' => $p['comando'],
        'fecha_ref' => (string) $p['fecha_ref'],
        'estado' => $p['estado'] ?? 'pendiente',
        'creado' => $p['creado'],
        'enviado' => $p['enviado'] ?? null,
    ];
};

responder([
    'ok' => true,
    'ahora' => $ahora,
    'estaciones' => array_map(function ($e) {
        return [
            'id' => (string) $e['id'],
            'nombre' => trim((string) $e['nombre']),
            // NULL si fecha_I está vacía o en cero
            'fecha_i' => $e['fecha_i'],
            'min_dato' => $e['min_dato'] === null ? null : (int) $e['min_dato'],
        ];
    }, $estaciones),
    'pendientes' => array_map($pedido, $pendientes),
    'historial' => array_map($pedido, $historial),
]);

/** IP del pedido; detrás del proxy del sitio (nginx en el mismo equipo o la red interna), la que reenvía. */
function ip_cliente(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $reenviada = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '')[0]);
    $proxy = !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    return $proxy && filter_var($reenviada, FILTER_VALIDATE_IP) ? $reenviada : $ip;
}

function anotar_comando(string $admin, string $texto)
{
    @error_log(date('Y-m-d H:i:s') . " $admin (" . ip_cliente() . ") $texto\n", 3, __DIR__ . '/comandos.log');
}
