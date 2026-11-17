<?php
/*
 * Localidades de la red pluviométrica (tabla estaciones_rr, una fila por versión).
 *
 * GET → {ok, anio, creadas, aviso_anio, siguiente_id, localidades:[{id, nombre, zona, proveedor, lat, lon, alt, ficha}]}
 *   Todas las localidades con ficha o con algún dato. Antes crea las filas del año en curso en
 *   datos_rr_mes (creadas: cuántas; null si la tabla todavía no tiene la clave única o si falló, y
 *   entonces aviso_anio dice por qué).
 * GET ?id=N → {ok, localidad, versiones:[…]}: la versión vigente con las normales y las anteriores.
 * POST {accion:'crear', localidad} → alta con el número indicado o, sin número, el siguiente libre.
 * POST {accion:'editar', id, localidad} → versión nueva de la localidad (las anteriores quedan).
 *   localidad: {id?, nombre, zona, proveedor, lat, lon, alt, periodo_normal, normales:[12 mm o null]}
 *   Responde {ok, localidad, aviso?} (aviso: la ubicación cae fuera de la zona de la red).
 */
require_once __DIR__ . '/lluvias_comun.php';

$metodo = exigir_metodo('GET', 'POST');
$admin = administrador_actual();
$cx = conexion_lluvias();

try {
    if ($metodo === 'POST') {
        $cuerpo = cuerpo_json();
        $accion = $cuerpo['accion'] ?? '';
        if ($accion === 'crear') {
            crear($cx, $cuerpo['localidad'] ?? null, $admin);
        }
        if ($accion === 'editar') {
            editar($cx, leer_id($cuerpo['id'] ?? null), $cuerpo['localidad'] ?? null, $admin);
        }
        error_json('Acción desconocida.', 422);
    }

    if (isset($_GET['id'])) {
        responder(['ok' => true] + ficha($cx, leer_id($_GET['id'])));
    }

    $anio = (int) date('Y');
    // El alta del año es un extra: si falla (permiso, bloqueo), la lista se responde igual
    $avisoAnio = null;
    try {
        $creadas = asegurar_anio($cx, $anio, $admin);
    } catch (mysqli_sql_exception $e) {
        error_log('admin/api lluvias: alta del año ' . $anio . ': ' . $e->getMessage());
        $creadas = null;
        $avisoAnio = "No se pudo crear el año $anio (MySQL {$e->getCode()}). La fila de cada localidad se crea al cargarle el primer total.";
    }
    responder([
        'ok' => true,
        'anio' => $anio,
        'creadas' => $creadas,
        'aviso_anio' => $avisoAnio,
        'siguiente_id' => siguiente_id($cx),
        'localidades' => localidades($cx),
    ]);
} catch (Throwable $e) {
    error_tablas_lluvias($e);
}

/* ------------------------------------------------------------------------------------------------ */

function siguiente_id(mysqli $cx): int
{
    $f = $cx->query('SELECT MAX(identificacion) AS m FROM (SELECT MAX(identificacion) AS identificacion FROM estaciones_rr
        UNION ALL SELECT MAX(identificacion) FROM datos_rr_mes
        UNION ALL SELECT MAX(identificacion) FROM datos_rr_dia) t')->fetch_assoc();
    return (int) $f['m'] + 1;
}

function version_json(array $f): array
{
    $normales = [];
    foreach (NORMALES_RR as $c) {
        $normales[] = mm_json($f[$c]);
    }
    return [
        'version' => (int) $f['id'],
        'id' => (int) $f['identificacion'],
        'nombre' => trim($f['nombre']),
        'zona' => trim($f['zona']),
        'proveedor' => trim($f['proveedor']),
        'lat' => (float) $f['lat'],
        'lon' => (float) $f['lon'],
        'alt' => (float) $f['alt'],
        'periodo_normal' => trim($f['periodo_normal']),
        'normales' => $normales,
    ];
}

function ficha(mysqli $cx, int $id): array
{
    $st = $cx->prepare('SELECT * FROM estaciones_rr WHERE identificacion = ? ORDER BY id DESC');
    $st->bind_param('i', $id);
    $st->execute();
    $filas = $st->get_result()->fetch_all(MYSQLI_ASSOC);
    if (!$filas) {
        error_json("La localidad $id no tiene ficha.", 404);
    }
    $versiones = array_map('version_json', $filas);
    return ['localidad' => $versiones[0], 'versiones' => array_slice($versiones, 1)];
}

/** Texto de 0 a $max caracteres (no bytes; sin mb_strlen, que el servidor no tiene). */
function texto($v, int $max, string $que, bool $obligatorio = false): string
{
    $t = is_string($v) ? trim($v) : '';
    if ($obligatorio && $t === '') {
        error_json("Falta $que.", 422);
    }
    if (!preg_match('/^.{0,' . $max . '}$/su', $t)) {
        error_json("$que puede tener hasta $max caracteres.", 422);
    }
    return $t;
}

function coordenada($v, float $min, float $max, string $que): float
{
    if (is_string($v)) {
        $v = str_replace(',', '.', trim($v));
        $v = is_numeric($v) ? (float) $v : null;
    }
    if (!is_int($v) && !is_float($v)) {
        error_json("Falta $que.", 422);
    }
    $v = (float) $v;
    if ($v < $min || $v > $max) {
        error_json("$que tiene que estar entre $min y $max.", 422);
    }
    return $v;
}

/** Campos validados de una localidad, listos para estaciones_rr. */
function datos_localidad($l): array
{
    if (!is_array($l)) {
        error_json('Faltan los datos de la localidad.', 422);
    }
    $d = [
        'nombre' => texto($l['nombre'] ?? null, 50, 'el nombre', true),
        'zona' => texto($l['zona'] ?? null, 2, 'La zona'),
        'proveedor' => strtoupper(texto($l['proveedor'] ?? null, 2, 'El proveedor')),
        'lat' => round(coordenada($l['lat'] ?? null, -90, 90, 'la latitud'), 5),
        'lon' => round(coordenada($l['lon'] ?? null, -180, 180, 'la longitud'), 5),
        'alt' => ($l['alt'] ?? null) === null || ($l['alt'] ?? '') === '' ? 0.0 : round(coordenada($l['alt'], -500, 7000, 'la altura'), 2),
        'periodo_normal' => texto($l['periodo_normal'] ?? null, 15, 'El período de las normales'),
        'normales' => [],
    ];
    $normales = $l['normales'] ?? [];
    if (!is_array($normales) || count($normales) > 12) {
        error_json('Las normales son 12 valores, de enero a diciembre.', 422);
    }
    for ($i = 0; $i < 12; $i++) {
        $v = leer_mm($normales[$i] ?? null, LIMITE_LLUVIA_MES, 'La normal de ' . MESES_RR[$i]);
        $d['normales'][] = $v === null ? SIN_DATO : $v;
    }
    return $d;
}

function aviso_zona(array $d)
{
    $fuera = $d['lat'] < ZONA_RED['lat'][0] || $d['lat'] > ZONA_RED['lat'][1]
        || $d['lon'] < ZONA_RED['lon'][0] || $d['lon'] > ZONA_RED['lon'][1];
    return $fuera ? 'La ubicación cae fuera de la zona de la red: revisá la latitud y la longitud (en grados, negativas).' : null;
}

/** Inserta una versión; foto, normal y ultregrecibido (NOT NULL, sin uso acá) vienen de $base. */
function insertar_version(mysqli $cx, int $id, array $d, array $base)
{
    $columnas = 'identificacion, nombre, lat, lon, alt, foto, ultregrecibido, zona, normal, '
        . implode(', ', NORMALES_RR) . ', proveedor, periodo_normal';
    $st = $cx->prepare("INSERT INTO estaciones_rr ($columnas) VALUES (" . implode(', ', array_fill(0, 23, '?')) . ')');
    $n = $d['normales'];
    $st->bind_param('isdddssss' . str_repeat('d', 12) . 'ss', $id, $d['nombre'], $d['lat'], $d['lon'], $d['alt'],
        $base['foto'], $base['ultregrecibido'], $d['zona'], $base['normal'],
        $n[0], $n[1], $n[2], $n[3], $n[4], $n[5], $n[6], $n[7], $n[8], $n[9], $n[10], $n[11],
        $d['proveedor'], $d['periodo_normal']);
    $st->execute();
}

function crear(mysqli $cx, $l, string $admin)
{
    $d = datos_localidad($l);
    $id = isset($l['id']) && $l['id'] !== null && $l['id'] !== '' ? leer_id($l['id']) : siguiente_id($cx);
    if (localidad_existe($cx, $id)) {
        error_json("El número $id ya es de otra localidad (" . nombre_localidad($cx, $id) . ').', 409);
    }
    insertar_version($cx, $id, $d, ['foto' => '', 'ultregrecibido' => date('Y-m-d'), 'normal' => '']);
    anotar_lluvias($admin, "alta de localidad $id " . json_encode(array_diff_key($d, ['normales' => 1]), JSON_UNESCAPED_UNICODE));

    // La localidad nueva ya tiene la fila del año en curso. La localidad ya quedó creada: si esto falla
    // no se responde error (al reintentar diría que el número ya es de otra); la fila se crea al cargar
    try {
        asegurar_anio($cx, (int) date('Y'), $admin);
    } catch (mysqli_sql_exception $e) {
        error_log('admin/api lluvias: alta del año para la localidad ' . $id . ': ' . $e->getMessage());
    }
    responder(['ok' => true, 'aviso' => aviso_zona($d)] + ficha($cx, $id));
}

function editar(mysqli $cx, int $id, $l, string $admin)
{
    $d = datos_localidad($l);
    $st = $cx->prepare('SELECT * FROM estaciones_rr WHERE identificacion = ? ORDER BY id DESC LIMIT 1');
    $st->bind_param('i', $id);
    $st->execute();
    $vigente = $st->get_result()->fetch_assoc();
    // Una localidad con datos y sin ficha recibe su primera versión
    if (!$vigente && !localidad_existe($cx, $id)) {
        error_json("No existe la localidad $id.", 404);
    }
    $base = $vigente ?: ['foto' => '', 'ultregrecibido' => date('Y-m-d'), 'normal' => ''];
    insertar_version($cx, $id, $d, $base);
    $antes = $vigente ? array_intersect_key(version_json($vigente), $d) : null;
    anotar_lluvias($admin, "localidad $id " . json_encode($antes, JSON_UNESCAPED_UNICODE) . ' → '
        . json_encode($d, JSON_UNESCAPED_UNICODE));
    responder(['ok' => true, 'aviso' => aviso_zona($d)] + ficha($cx, $id));
}
