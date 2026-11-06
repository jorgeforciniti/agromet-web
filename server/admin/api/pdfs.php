<?php
/*
 * GET  ?q=&categoria=&anio=&pagina=1 → {ok, informes:[20 por página, del último cargado al primero], total}
 * POST multipart: titulo, categoria, creado (AAAA-MM-DD), archivo → {ok, informe}
 *      Guarda el archivo en PDFS/ y lo registra en admin.pdfs (reemplaza admin.php + admin-pdfs.php).
 */
require_once __DIR__ . '/comun.php';

$metodo = exigir_metodo('GET', 'POST');
administrador_actual();
$tabla = '`' . DB_ADMIN . '`.`pdfs`';

if ($metodo === 'GET') {
    $where = ['1 = 1'];
    $tipos = '';
    $valores = [];
    $categoria = trim((string) ($_GET['categoria'] ?? ''));
    if ($categoria !== '') {
        $where[] = 'categoria = ?';
        $tipos .= 's';
        $valores[] = validar_categoria($categoria);
    }
    $anio = trim((string) ($_GET['anio'] ?? ''));
    if ($anio !== '') {
        if (!preg_match('/^\d{4}$/', $anio)) error_json('Año inválido.', 422);
        $where[] = 'creado >= ? AND creado < ?';
        $tipos .= 'ss';
        $valores[] = "$anio-01-01";
        $valores[] = ((int) $anio + 1) . '-01-01';
    }
    // Cada palabra en el título o en el nombre del archivo (también con entidades HTML: &iacute;)
    $q = trim((string) ($_GET['q'] ?? ''));
    foreach (array_slice(preg_split('/\s+/u', $q, -1, PREG_SPLIT_NO_EMPTY), 0, 6) as $p) {
        $plano = '%' . addcslashes($p, '%_\\') . '%';
        $codificado = '%' . addcslashes(htmlentities($p, ENT_QUOTES, 'UTF-8'), '%_\\') . '%';
        $where[] = '(titulo LIKE ? OR titulo LIKE ? OR archivo LIKE ?)';
        $tipos .= 'sss';
        array_push($valores, $plano, $codificado, $plano);
    }
    $condicion = implode(' AND ', $where);
    $pagina = max(1, (int) ($_GET['pagina'] ?? 1));
    $desde = ($pagina - 1) * 20;

    $db = conexion();
    $st = $db->prepare("SELECT COUNT(*) FROM $tabla WHERE $condicion");
    if ($tipos !== '') $st->bind_param($tipos, ...$valores);
    $st->execute();
    $total = (int) $st->get_result()->fetch_row()[0];

    $st = $db->prepare("SELECT id, titulo, archivo, creado, categoria FROM $tabla WHERE $condicion
                        ORDER BY id DESC LIMIT 20 OFFSET $desde");
    if ($tipos !== '') $st->bind_param($tipos, ...$valores);
    $st->execute();
    $informes = array_map('informe_json', $st->get_result()->fetch_all(MYSQLI_ASSOC));
    responder(['ok' => true, 'informes' => $informes, 'total' => $total]);
}

// POST: validar todo antes de escribir
$titulo = validar_titulo($_POST['titulo'] ?? '');
$categoria = validar_categoria($_POST['categoria'] ?? '');
$creado = validar_fecha($_POST['creado'] ?? '', 'fecha del informe');
$arch = $_FILES['archivo'] ?? null;

if (!$arch || ($arch['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
    error_json('Elegí un archivo.', 422);
}
if (in_array($arch['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || $arch['size'] > MAX_BYTES) {
    error_json('El archivo es demasiado grande (máximo ' . (MAX_BYTES / 1024 / 1024) . ' MB).', 413);
}
if ($arch['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($arch['tmp_name'])) {
    error_json('No se pudo recibir el archivo. Volvé a intentar.', 400);
}

// Sólo el nombre, sin rutas ni caracteres no válidos en Windows
$nombre = basename(str_replace('\\', '/', (string) $arch['name']));
$nombre = trim(preg_replace('/[\x00-\x1F\\\\\/:*?"<>|]/', '_', $nombre));
$extension = strtolower(pathinfo($nombre, PATHINFO_EXTENSION));
if ($nombre === '' || $nombre[0] === '.' || !in_array($extension, EXTENSIONES, true)) {
    error_json('Tipo de archivo no permitido (sólo ' . implode(', ', EXTENSIONES) . ').', 422);
}
// El contenido tiene que coincidir con la extensión (un .pdf renombrado no pasa)
$inicio = (string) file_get_contents($arch['tmp_name'], false, null, 0, 5);
if (($extension === 'pdf' && $inicio !== '%PDF-') || ($extension === 'xlsx' && substr($inicio, 0, 4) !== "PK\x03\x04")) {
    error_json('El archivo no es un ' . strtoupper($extension) . ' válido.', 422);
}

$carpeta = realpath(CARPETA_PDFS);
if ($carpeta === false || !is_dir($carpeta) || !is_writable($carpeta)) {
    error_json('No se encontró la carpeta de informes en el servidor.', 500);
}
$destino = $carpeta . DIRECTORY_SEPARATOR . $nombre;
if (file_exists($destino)) {
    error_json("Ya existe un archivo llamado $nombre. Cambiale el nombre antes de subirlo.", 409);
}

$db = conexion();
// Primero el archivo y después el registro: si falla la copia no queda un registro sin archivo
if (!move_uploaded_file($arch['tmp_name'], $destino)) {
    error_json('No se pudo guardar el archivo en el servidor.', 500);
}
try {
    $st = $db->prepare("INSERT INTO $tabla (titulo, archivo, creado, categoria) VALUES (?, ?, ?, ?)");
    $st->bind_param('ssss', $titulo, $nombre, $creado, $categoria);
    $st->execute();
} catch (Throwable $e) {
    @unlink($destino);   // sin registro, el archivo no se publica
    throw $e;
}

responder(['ok' => true, 'informe' => [
    'id' => (int) $db->insert_id,
    'titulo' => $titulo,
    'archivo' => $nombre,
    'creado' => $creado,
    'categoria' => $categoria,
]]);
