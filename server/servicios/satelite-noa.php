<?php
/*
 * Imagen satelital del NOA para la app móvil (Mapa → Satélite): recorte de 400 × 400 píxeles
 * (unos 800 km, 2 km por píxel) centrado en San Miguel de Tucumán de la imagen GeoColor de GOES-19
 * del sector «ssa» (sur de Sudamérica) de NOAA/NESDIS/STAR. Muestra nubes, no lluvia. Es de dominio
 * público; hay que citar la fuente. Va en /services/. No usa la base de datos.
 *
 * GET satelite-noa.php
 *   {"status":"success","hora":"2026-11-16T20:20:00Z","origen":"noaa|cache",
 *    "imagen":"satelite-noa.php?imagen=20263202020","fuente":"NOAA/NESDIS/STAR · GOES-19 GeoColor",
 *    "tucuman":{"x":0.5,"y":0.5}}
 *   - error: {"status":"error","message":"..."} con código 502 (NOAA no responde y no hay copia)
 * GET satelite-noa.php?imagen=AAAADDDhhmm  → el JPEG del recorte (siempre el último guardado)
 *
 * NOAA publica una imagen cada 10 minutos, con unos 15 de atraso. Se guarda el recorte en la carpeta
 * temporal de PHP y se renueva cuando tiene más de CACHE_MINUTOS; si NOAA no responde, va la copia.
 * El recorte está calibrado para la imagen de 3600 × 2160 (ver LEEME.md): si NOAA cambia el sector o
 * el tamaño, el PHP lo rechaza en vez de mostrar otra zona.
 */

header('Access-Control-Allow-Origin: *');

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('memory_limit', '256M'); // la imagen de 3600 × 2160 ocupa unos 31 MB descomprimida

const URL_SECTOR = 'https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/GEOCOLOR/';
const ANCHO_ORIGEN = 3600;
const ALTO_ORIGEN = 2160;
// Recorte en la imagen de 3600 × 2160: San Miguel de Tucumán (-26,83; -65,22) cae en el píxel (1423, 736)
const RECORTE_X = 1223;
const RECORTE_Y = 536;
const RECORTE_LADO = 400;
const CACHE_MINUTOS = 10;
const TIEMPO_MAXIMO = 25; // segundos para bajar la imagen (unos 4 MB)
const FUENTE = 'NOAA/NESDIS/STAR · GOES-19 GeoColor';

$carpeta = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR;
$archivoImagen = $carpeta . 'agromet-satelite-noa.jpg';
$archivoDatos = $carpeta . 'agromet-satelite-noa.json';

function error_json($codigo, $mensaje)
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['status' => 'error', 'message' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Pedido HTTP a NOAA: ['codigo' => 200, 'cuerpo' => ..., 'modificado' => timestamp|null] */
function pedir($url, $soloEncabezados = false)
{
    $modificado = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_NOBODY => $soloEncabezados,
            CURLOPT_FILETIME => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => TIEMPO_MAXIMO,
            CURLOPT_USERAGENT => 'agromet.eeaoc.gob.ar',
        ]);
        $cuerpo = curl_exec($ch);
        $codigo = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $hora = curl_getinfo($ch, CURLINFO_FILETIME);
        curl_close($ch);
        if ($hora > 0) $modificado = $hora;
    } else {
        $contexto = stream_context_create(['http' => [
            'method' => $soloEncabezados ? 'HEAD' : 'GET',
            'timeout' => TIEMPO_MAXIMO,
            'user_agent' => 'agromet.eeaoc.gob.ar',
            'ignore_errors' => true,
        ]]);
        $cuerpo = @file_get_contents($url, false, $contexto);
        $codigo = 0;
        foreach (isset($http_response_header) ? $http_response_header : [] as $linea) {
            if (preg_match('/^HTTP\/\S+\s(\d{3})/', $linea, $m)) $codigo = (int)$m[1];
            if (stripos($linea, 'Last-Modified:') === 0) $modificado = strtotime(trim(substr($linea, 14)));
        }
    }
    return ['codigo' => $codigo, 'cuerpo' => $cuerpo, 'modificado' => $modificado];
}

/**
 * Baja la última imagen y guarda el recorte. La hora del barrido sale del nombre del archivo
 * (AAAADDDhhmm, día del año y hora UTC): NOAA lo publica unos 15 minutos después, así que se prueba
 * desde la hora de publicación del último hacia atrás, de a 10 minutos.
 */
function actualizar($archivoImagen, $archivoDatos)
{
    if (!function_exists('imagecreatefromstring')) return 'El servidor no tiene la extensión GD de PHP.';

    $ultimo = pedir(URL_SECTOR . ANCHO_ORIGEN . 'x' . ALTO_ORIGEN . '.jpg', true);
    if ($ultimo['codigo'] !== 200 || !$ultimo['modificado']) return 'NOAA no responde.';

    $base = intdiv($ultimo['modificado'], 600) * 600;
    $imagen = null;
    $sello = null;
    for ($i = 0; $i < 4 && !$imagen; $i++) {
        $hora = $base - $i * 600;
        $candidato = gmdate('Y', $hora) . sprintf('%03d', (int)gmdate('z', $hora) + 1) . gmdate('Hi', $hora);
        $r = pedir(URL_SECTOR . $candidato . '_GOES19-ABI-ssa-GEOCOLOR-' . ANCHO_ORIGEN . 'x' . ALTO_ORIGEN . '.jpg');
        if ($r['codigo'] === 200 && $r['cuerpo']) {
            $imagen = @imagecreatefromstring($r['cuerpo']);
            $sello = $candidato;
            $horaBarrido = $hora;
        }
    }
    if (!$imagen) return 'No se pudo bajar la imagen de NOAA.';
    if (imagesx($imagen) !== ANCHO_ORIGEN || imagesy($imagen) !== ALTO_ORIGEN) {
        imagedestroy($imagen);
        return 'La imagen de NOAA cambió de tamaño: hay que volver a calibrar el recorte.';
    }

    $recorte = imagecreatetruecolor(RECORTE_LADO, RECORTE_LADO);
    imagecopy($recorte, $imagen, 0, 0, RECORTE_X, RECORTE_Y, RECORTE_LADO, RECORTE_LADO);
    imagedestroy($imagen);

    // San Miguel de Tucumán: un círculo chico en el centro
    $centro = intdiv(RECORTE_LADO, 2);
    imagesetthickness($recorte, 2);
    imageellipse($recorte, $centro, $centro, 9, 9, imagecolorallocate($recorte, 255, 196, 0));

    $temporal = $archivoImagen . '.' . getmypid();
    imagejpeg($recorte, $temporal, 85);
    imagedestroy($recorte);
    if (!@rename($temporal, $archivoImagen)) {
        @unlink($temporal);
        return 'No se pudo guardar la imagen.';
    }
    @file_put_contents($archivoDatos, json_encode([
        'guardado' => time(),
        'sello' => $sello,
        'hora' => gmdate('Y-m-d\TH:i:s\Z', $horaBarrido),
    ]), LOCK_EX);
    return null;
}

$datos = is_readable($archivoDatos) ? json_decode((string)@file_get_contents($archivoDatos), true) : null;
$hayCopia = is_array($datos) && isset($datos['guardado'], $datos['sello'], $datos['hora']) && is_readable($archivoImagen);

// La imagen: siempre el último recorte guardado (el sello del pedido sólo evita la caché vieja)
if (isset($_GET['imagen'])) {
    if (!$hayCopia) error_json(404, 'Todavía no hay imagen.');
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=' . ($_GET['imagen'] === $datos['sello'] ? 86400 : 60));
    readfile($archivoImagen);
    exit;
}

$origen = 'cache';
if (!$hayCopia || time() - $datos['guardado'] >= CACHE_MINUTOS * 60) {
    // Un solo pedido a NOAA a la vez; los demás usan la copia mientras tanto
    $candado = @fopen($archivoDatos . '.lock', 'c');
    if ($candado && flock($candado, $hayCopia ? LOCK_EX | LOCK_NB : LOCK_EX)) {
        // Si esperó a otro pedido, puede que ya esté renovada
        clearstatcache();
        $previo = json_decode((string)@file_get_contents($archivoDatos), true);
        $vigente = is_array($previo) && isset($previo['guardado']) && time() - $previo['guardado'] < CACHE_MINUTOS * 60;
        $problema = $vigente ? null : actualizar($archivoImagen, $archivoDatos);
        flock($candado, LOCK_UN);
        if ($problema === null) {
            $origen = $vigente ? 'cache' : 'noaa';
        } elseif (!$hayCopia) {
            error_json(502, $problema);
        }
        $datos = json_decode((string)@file_get_contents($archivoDatos), true);
    }
    if ($candado) fclose($candado);
    if (!is_array($datos) || !isset($datos['sello'])) error_json(502, 'No hay imagen satelital.');
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=120');
echo json_encode([
    'status' => 'success',
    'hora' => $datos['hora'],
    'origen' => $origen,
    'imagen' => 'satelite-noa.php?imagen=' . $datos['sello'],
    'fuente' => FUENTE,
    'tucuman' => ['x' => 0.5, 'y' => 0.5],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
