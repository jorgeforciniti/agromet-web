<?php
/*
 * Verificación del ID token de Firebase Auth sin librerías externas (sólo openssl).
 * Sigue https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 *  - firma RS256 con alguno de los certificados públicos de Google (cacheados según Cache-Control);
 *  - aud = id del proyecto, iss = https://securetoken.google.com/<proyecto>;
 *  - exp en el futuro, iat y auth_time en el pasado, sub no vacío.
 * Devuelve los claims del token o null si no es válido.
 */

const URL_CERTIFICADOS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/** Base64url → bytes; false si no es válido. */
function b64url_decode(string $s)
{
    $s = strtr($s, '-_', '+/');
    $s .= str_repeat('=', (4 - strlen($s) % 4) % 4);
    return base64_decode($s, true);
}

/** Certificados públicos de Google, con caché en archivo temporal mientras sigan vigentes. */
function certificados_firebase(): array
{
    $cache = sys_get_temp_dir() . '/agromet_firebase_certs.json';
    if (is_file($cache)) {
        $guardado = json_decode((string) file_get_contents($cache), true);
        if (is_array($guardado) && ($guardado['vence'] ?? 0) > time() && is_array($guardado['certs'] ?? null)) {
            return $guardado['certs'];
        }
    }

    // file_get_contents en vez de curl: el servidor no tiene la extensión curl (requiere allow_url_fopen)
    $contexto = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $cuerpo = @file_get_contents(URL_CERTIFICADOS, false, $contexto);
    $headers = isset($http_response_header) ? implode("\n", $http_response_header) : '';
    if ($cuerpo === false || !preg_match('#^HTTP/\S+\s+200#', $headers)) {
        error_log('usuarios/api: no se pudieron descargar los certificados de Firebase');
        return [];
    }

    $certs = json_decode($cuerpo, true);
    if (!is_array($certs)) {
        return [];
    }
    $maxAge = preg_match('/max-age=(\d+)/i', $headers, $m) ? (int) $m[1] : 3600;
    @file_put_contents($cache, json_encode(['vence' => time() + $maxAge, 'certs' => $certs]), LOCK_EX);
    return $certs;
}

function verificar_token_firebase(string $jwt, string $proyecto): ?array
{
    $partes = explode('.', $jwt);
    if (count($partes) !== 3) {
        return null;
    }
    [$h64, $p64, $f64] = $partes;
    $header = json_decode((string) b64url_decode($h64), true);
    $claims = json_decode((string) b64url_decode($p64), true);
    $firma = b64url_decode($f64);
    if (!is_array($header) || !is_array($claims) || $firma === false) {
        return null;
    }
    if (($header['alg'] ?? '') !== 'RS256' || empty($header['kid'])) {
        return null;
    }

    $cert = certificados_firebase()[$header['kid']] ?? null;
    if (!$cert) {
        return null;
    }
    $clave = openssl_pkey_get_public($cert);
    if ($clave === false || openssl_verify("$h64.$p64", $firma, $clave, OPENSSL_ALGO_SHA256) !== 1) {
        return null;
    }

    $ahora = time();
    $margen = 60; // tolerancia de reloj, en segundos
    if (($claims['aud'] ?? '') !== $proyecto
        || ($claims['iss'] ?? '') !== "https://securetoken.google.com/$proyecto"
        || empty($claims['sub']) || !is_string($claims['sub']) || strlen($claims['sub']) > 128
        || ($claims['exp'] ?? 0) < $ahora - $margen
        || ($claims['iat'] ?? PHP_INT_MAX) > $ahora + $margen
        || ($claims['auth_time'] ?? PHP_INT_MAX) > $ahora + $margen) {
        return null;
    }
    return $claims;
}
