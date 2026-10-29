<?php
// Informes con filtros y páginas.
//
// Sin parámetros devuelve un resumen: los últimos 3 informes de cada categoría.
// Con algún filtro devuelve una página de resultados, del más nuevo al más viejo:
//   categoria  código de dos letras (ll, he, bo, co, ad, rv, et, ta)
//   anio       año de creación (por ejemplo 2019)
//   q          palabras a buscar en el título (todas deben aparecer)
//   limite     informes por página (1 a 50, 20 por defecto)
//   despues    cursor "AAAA-MM-DD_id" que devolvió la página anterior en 'siguiente'
//
// Respuesta: { status, modo: 'resumen'|'lista', data, total, siguiente, anios }

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);
date_default_timezone_set('America/Argentina/Buenos_Aires');

$db = "admin";
require_once 'conecta_mysql.php';

// Las mismas categorías que muestra la web; las demás no se publican.
$CATEGORIAS = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et', 'ta'];

function badRequest($msg) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
function serverError($msg) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// Ejecuta una consulta preparada y devuelve todas las filas.
function consultar($conexion, $sql, $tipos, $valores) {
    $stmt = $conexion->prepare($sql);
    if (!$stmt) serverError('Error al preparar la consulta.');
    if ($tipos !== '') {
        $refs = [];
        foreach ($valores as $i => $v) $refs[$i] = &$valores[$i];
        array_unshift($refs, $tipos);
        call_user_func_array([$stmt, 'bind_param'], $refs);
    }
    if (!$stmt->execute()) serverError('Error en la consulta de datos.');
    $res = $stmt->get_result();
    $filas = [];
    while ($fila = $res->fetch_assoc()) $filas[] = $fila;
    $stmt->close();
    return $filas;
}

function informe($row) {
    return [
        'id'        => (int)$row['id'],
        'titulo'    => html_entity_decode(trim($row['titulo']), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
        'archivo'   => trim($row['archivo']),
        'creado'    => $row['creado'],
        'categoria' => trim($row['categoria']),
        'posicion'  => (int)$row['posicion'],
        'url_img'   => trim($row['url_img'])
    ];
}

// 1) Parámetros
$categoria = isset($_GET['categoria']) ? trim($_GET['categoria']) : '';
$anio      = isset($_GET['anio']) ? trim($_GET['anio']) : '';
$q         = isset($_GET['q']) ? trim($_GET['q']) : '';
$limite    = isset($_GET['limite']) ? (int)$_GET['limite'] : 20;
$despues   = isset($_GET['despues']) ? trim($_GET['despues']) : '';

if ($categoria !== '' && !in_array($categoria, $CATEGORIAS, true)) badRequest("Parámetro 'categoria' inválido.");
if ($anio !== '' && !preg_match('/^(19|20)\d{2}$/', $anio)) badRequest("Parámetro 'anio' inválido.");
// Sin mb_strlen: el servidor no tiene la extensión mbstring.
if (!preg_match('/^.{0,100}$/us', $q)) badRequest("Parámetro 'q' demasiado largo.");
if ($limite < 1 || $limite > 50) $limite = 20;
$cursorFecha = null; $cursorId = null;
if ($despues !== '') {
    if (!preg_match('/^(\d{4}-\d{2}-\d{2})_(\d+)$/', $despues, $m)) badRequest("Parámetro 'despues' inválido.");
    $cursorFecha = $m[1];
    $cursorId = (int)$m[2];
}

if (!isset($conexion) || !$conexion || $conexion->connect_error) serverError('Error de conexión a la base de datos.');
mysqli_set_charset($conexion, 'utf8');

$COLUMNAS = 'id, titulo, archivo, creado, categoria, posicion, url_img';
$marcas = implode(',', array_fill(0, count($CATEGORIAS), '?'));

// 2) Filtros comunes (sin cursor), para la lista y el total
$where = ["categoria IN ($marcas)"];
$tipos = str_repeat('s', count($CATEGORIAS));
$valores = $CATEGORIAS;

if ($categoria !== '') {
    $where[] = 'categoria = ?';
    $tipos .= 's';
    $valores[] = $categoria;
}
if ($anio !== '') {
    // Rango de fechas en vez de YEAR(creado) para poder usar un índice sobre 'creado'.
    $where[] = 'creado >= ? AND creado < ?';
    $tipos .= 'ss';
    $valores[] = $anio . '-01-01';
    $valores[] = ((int)$anio + 1) . '-01-01';
}
if ($q !== '') {
    // Hay títulos guardados con entidades HTML (&iacute;), así que cada palabra se busca
    // tal cual y también codificada.
    $palabras = array_slice(preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY), 0, 6);
    foreach ($palabras as $p) {
        $plano = '%' . addcslashes($p, '%_\\') . '%';
        $codificado = '%' . addcslashes(htmlentities($p, ENT_QUOTES, 'UTF-8'), '%_\\') . '%';
        $where[] = '(titulo LIKE ? OR titulo LIKE ?)';
        $tipos .= 'ss';
        $valores[] = $plano;
        $valores[] = $codificado;
    }
}

// Años con informes, para el selector (según la categoría elegida, sin otros filtros)
if ($categoria !== '') {
    $filasAnios = consultar($conexion,
        "SELECT DISTINCT YEAR(creado) AS anio FROM pdfs WHERE categoria = ? ORDER BY anio DESC",
        's', [$categoria]);
} else {
    $filasAnios = consultar($conexion,
        "SELECT DISTINCT YEAR(creado) AS anio FROM pdfs WHERE categoria IN ($marcas) ORDER BY anio DESC",
        str_repeat('s', count($CATEGORIAS)), $CATEGORIAS);
}
$anios = array_map(function ($f) { return (int)$f['anio']; }, $filasAnios);

// 3a) Resumen: últimos 3 de cada categoría
if ($categoria === '' && $anio === '' && $q === '') {
    $data = [];
    foreach ($CATEGORIAS as $cat) {
        $filas = consultar($conexion,
            "SELECT $COLUMNAS FROM pdfs WHERE categoria = ? ORDER BY creado DESC, id DESC LIMIT 3",
            's', [$cat]);
        foreach ($filas as $f) $data[] = informe($f);
    }
    usort($data, function ($a, $b) {
        return strcmp($b['creado'], $a['creado']) ?: $b['id'] - $a['id'];
    });
    $conexion->close();
    echo json_encode([
        'status' => 'success', 'modo' => 'resumen', 'data' => $data,
        'total' => count($data), 'siguiente' => null, 'anios' => $anios
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// 3b) Lista paginada
$condicion = implode(' AND ', $where);
$total = consultar($conexion, "SELECT COUNT(*) AS n FROM pdfs WHERE $condicion", $tipos, $valores);
$total = (int)$total[0]['n'];

$sql = "SELECT $COLUMNAS FROM pdfs WHERE $condicion";
if ($cursorFecha !== null) {
    $sql .= ' AND (creado < ? OR (creado = ? AND id < ?))';
    $tipos .= 'ssi';
    $valores[] = $cursorFecha;
    $valores[] = $cursorFecha;
    $valores[] = $cursorId;
}
// Uno de más para saber si hay otra página
$sql .= ' ORDER BY creado DESC, id DESC LIMIT ' . ($limite + 1);
$filas = consultar($conexion, $sql, $tipos, $valores);

$siguiente = null;
if (count($filas) > $limite) {
    $filas = array_slice($filas, 0, $limite);
    $ultima = end($filas);
    $siguiente = substr($ultima['creado'], 0, 10) . '_' . $ultima['id'];
}

$conexion->close();
echo json_encode([
    'status' => 'success', 'modo' => 'lista', 'data' => array_map('informe', $filas),
    'total' => $total, 'siguiente' => $siguiente, 'anios' => $anios
], JSON_UNESCAPED_UNICODE);
