<?php
/*
 * Base de la pestaña «Red pluviométrica» (lluvias_localidades.php, lluvias_dia.php, lluvias_mes.php):
 * conexión con conecta_lluvias.php, validación de los mm, localidades y alta automática del año.
 *
 * Tablas de la base `estaciones` (ver docs/admin-lluvias-red-diseno.md):
 *   estaciones_rr  una fila por versión de cada localidad; vale la de id más alto
 *   datos_rr_mes   un total por mes (ene…dic) por localidad y año; -999,9 = sin dato
 *   datos_rr_dia   un valor por localidad y fecha; sin dato = sin fila. Sólo se usa el mes en curso
 */
require_once __DIR__ . '/comun.php';

const SIN_DATO = -999.9;
const MESES_RR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NORMALES_RR = ['nene', 'nfeb', 'nmar', 'nabr', 'nmay', 'njun', 'njul', 'nago', 'nsep', 'noct', 'nnov', 'ndic'];

/** Conexión con conecta_lluvias.php (recibe $db y define $conexion, como conecta_mysql.php). */
function conexion_lluvias(): mysqli
{
    if (!is_file(RUTA_CONECTA_LLUVIAS)) {
        error_json('Instalación incompleta en el servidor: falta conecta_lluvias.php.', 500);
    }
    $db = DB_ESTACIONES;
    ob_start();
    try {
        require RUTA_CONECTA_LLUVIAS;
    } catch (mysqli_sql_exception $e) {
        // Desde PHP 8.1 mysqli lanza la excepción antes de que se pueda mirar connect_errno
        error_log('admin/api lluvias: sin conexión (' . $e->getCode() . ')');
        $conexion = null;
    }
    ob_end_clean();
    if (!isset($conexion) || !($conexion instanceof mysqli) || $conexion->connect_errno) {
        error_json('No se pudo conectar a la base de datos de la red pluviométrica.', 500);
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $conexion->set_charset('utf8mb4');
    return $conexion;
}

/** Errores de permisos o de tablas con un mensaje claro; el resto sigue al manejador de comun.php. */
function error_tablas_lluvias(Throwable $e)
{
    if ($e instanceof mysqli_sql_exception) {
        if ($e->getCode() === 1142 || $e->getCode() === 1044) {
            error_json('El usuario de conecta_lluvias.php no tiene permiso sobre las tablas de la red pluviométrica (ver server/admin/LEEME.md).', 500);
        }
        if ($e->getCode() === 1146) {
            error_json('La base `' . DB_ESTACIONES . '` no tiene las tablas de la red pluviométrica.', 500);
        }
    }
    throw $e;
}

/** Anota un cambio en lluvias.log (fecha, email, IP y texto). */
function anotar_lluvias(string $admin, string $texto)
{
    @error_log(date('Y-m-d H:i:s') . " $admin " . ip_cliente() . " $texto\n", 3, __DIR__ . '/lluvias.log');
}

/**
 * mm con un decimal como máximo entre 0 y $limite; null si viene vacío. Si no, error 422.
 * Acepta números o texto con coma o punto decimal.
 */
function leer_mm($v, float $limite, string $que)
{
    if ($v === null || $v === '') {
        return null;
    }
    if (is_string($v)) {
        $t = str_replace(',', '.', trim($v));
        if (!preg_match('/^\d+(\.\d+)?$/', $t)) {
            error_json("$que no es un número.", 422);
        }
        $v = (float) $t;
    }
    if (!is_int($v) && !is_float($v)) {
        error_json("$que no es un número.", 422);
    }
    $v = (float) $v;
    if (abs($v * 10 - round($v * 10)) > 1e-6) {
        error_json("$que admite un decimal como máximo.", 422);
    }
    if ($v < 0 || $v > $limite) {
        error_json("$que tiene que estar entre 0 y " . str_replace('.', ',', (string) $limite) . ' mm.', 422);
    }
    return round($v, 1);
}

/** Valor de la tabla para la respuesta: null si es negativo (-999,9 = sin dato). */
function mm_json($v)
{
    if ($v === null) {
        return null;
    }
    $v = (float) $v;
    return $v < 0 ? null : round($v, 1);
}

/** Número de localidad (1 a 32767, el rango de smallint), o error 422. */
function leer_id($v): int
{
    if (is_string($v) && ctype_digit($v)) {
        $v = (int) $v;
    }
    if (!is_int($v) || $v < 1 || $v > 32767) {
        error_json('El número de localidad no es válido.', 422);
    }
    return $v;
}

/** La localidad tiene ficha en estaciones_rr o algún dato. */
function localidad_existe(mysqli $cx, int $id): bool
{
    $st = $cx->prepare('SELECT 1 FROM estaciones_rr WHERE identificacion = ?
        UNION ALL SELECT 1 FROM datos_rr_mes WHERE identificacion = ?
        UNION ALL SELECT 1 FROM datos_rr_dia WHERE identificacion = ? LIMIT 1');
    $st->bind_param('iii', $id, $id, $id);
    $st->execute();
    return (bool) $st->get_result()->fetch_row();
}

/** Nombre de la versión vigente (para el log y los mensajes). */
function nombre_localidad(mysqli $cx, int $id): string
{
    $st = $cx->prepare('SELECT nombre FROM estaciones_rr WHERE identificacion = ? ORDER BY id DESC LIMIT 1');
    $st->bind_param('i', $id);
    $st->execute();
    $f = $st->get_result()->fetch_assoc();
    return $f ? trim($f['nombre']) . " ($id)" : "Localidad $id";
}

/**
 * Todas las localidades: las que tienen ficha en estaciones_rr y las que tienen algún dato mensual o
 * diario. Nombre, zona y proveedor de la versión vigente (la de id más alto).
 */
function localidades(mysqli $cx): array
{
    $filas = $cx->query('SELECT l.identificacion, e.nombre, e.zona, e.proveedor, e.lat, e.lon, e.alt
        FROM (SELECT identificacion FROM datos_rr_mes
              UNION SELECT identificacion FROM datos_rr_dia
              UNION SELECT identificacion FROM estaciones_rr) l
        LEFT JOIN (SELECT identificacion, MAX(id) AS id FROM estaciones_rr GROUP BY identificacion) v
               ON v.identificacion = l.identificacion
        LEFT JOIN estaciones_rr e ON e.id = v.id
        ORDER BY e.nombre IS NULL, e.nombre, l.identificacion')->fetch_all(MYSQLI_ASSOC);
    $lista = [];
    foreach ($filas as $f) {
        $ficha = $f['nombre'] !== null;
        $lista[] = [
            'id' => (int) $f['identificacion'],
            'nombre' => $ficha ? trim($f['nombre']) : 'Localidad ' . $f['identificacion'] . ' (sin ficha)',
            'zona' => $ficha ? trim($f['zona']) : '',
            'proveedor' => $ficha ? trim($f['proveedor']) : '',
            'lat' => $ficha ? (float) $f['lat'] : null,
            'lon' => $ficha ? (float) $f['lon'] : null,
            'alt' => $ficha ? (float) $f['alt'] : null,
            'ficha' => $ficha,
        ];
    }
    return $lista;
}

/** La tabla tiene el índice (para saber si ya se aplicaron los cambios de la base). */
function tiene_indice(mysqli $cx, string $tabla, string $indice): bool
{
    $st = $cx->prepare('SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1');
    $base = DB_ESTACIONES;
    $st->bind_param('sss', $base, $tabla, $indice);
    $st->execute();
    return (bool) $st->get_result()->fetch_row();
}

/**
 * Crea las filas del año en datos_rr_mes, todas en -999,9, para todas las localidades que no la
 * tengan. Devuelve cuántas creó, o null si falta la clave única (identificacion, anio): sin ella el
 * INSERT IGNORE duplicaría filas.
 */
function asegurar_anio(mysqli $cx, int $anio, string $admin)
{
    if (!tiene_indice($cx, 'datos_rr_mes', 'estacion_anio')) {
        return null;
    }
    $sin = implode(', ', array_fill(0, 12, SIN_DATO));
    $st = $cx->prepare('INSERT IGNORE INTO datos_rr_mes (identificacion, anio, ' . implode(', ', MESES_RR) . ")
        SELECT l.identificacion, ?, $sin
          FROM (SELECT identificacion FROM datos_rr_mes
                UNION SELECT identificacion FROM datos_rr_dia
                UNION SELECT identificacion FROM estaciones_rr) l");
    $st->bind_param('i', $anio);
    $st->execute();
    $creadas = $st->affected_rows;
    if ($creadas > 0) {
        anotar_lluvias($admin, "año $anio creado para $creadas localidades");
    }
    return $creadas;
}
