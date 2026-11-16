<?php
/*
 * Alertas a medida de la app móvil (las crea cada celular con push-alertas.php). Lo llama una tarea
 * programada cada 15 minutos con ?key=... (la misma clave de verificar-heladas-push.php).
 *
 * Para cada alerta activa que no avisó en las últimas ALERTAS_HORAS_ENTRE_AVISOS horas:
 * - temperatura, lluvia del día y ráfaga: compara el último registro de la estación (de menos de 90
 *   minutos y sin los sensores dados de baja);
 * - helada pronosticada: sólo de 17 a 21 h, con la mínima de esta noche de Open-Meteo (gratuito para
 *   uso no comercial), corregida por la altura de la estación.
 *
 * Parámetros opcionales: dry_run=1 (no envía ni actualiza), solo_dispositivo_id=N.
 */
header("Content-Type: application/json; charset=utf-8");
date_default_timezone_set("America/Argentina/Tucuman");

$db = "estaciones";
include(__DIR__ . "/../estaciones/conecta_mysql.php");
include(__DIR__ . "/fcm-v1.php");
require __DIR__ . "/push-alertas-comun.php";

$depuracion = __DIR__ . "/../../services/depuracion.php";
if (is_file($depuracion)) {
    require_once $depuracion;
}

if (!isset($conexion) || !$conexion) {
    alertas_json(array("ok" => false, "error" => "Sin conexión MySQL"), 500);
}
mysqli_set_charset($conexion, "utf8mb4");

if (!is_file(__DIR__ . "/clave-push.php")) {
    alertas_json(array("ok" => false, "error" => "Falta clave-push.php"), 500);
}
require __DIR__ . "/clave-push.php"; // define $KEY_OK
$KEY = isset($_GET["key"]) ? $_GET["key"] : "";
if ($KEY !== $KEY_OK) {
    alertas_json(array("ok" => false, "error" => "Key inválida"), 403);
}

$dryRun = isset($_GET["dry_run"]) && $_GET["dry_run"] == "1";
$soloDispositivoId = isset($_GET["solo_dispositivo_id"]) ? intval($_GET["solo_dispositivo_id"]) : 0;

/* Un registro más viejo no es «ahora»: no avisa */
$MINUTOS_REGISTRO_VIGENTE = 90;
$horaActual = intval(date("G"));
$evaluarPronostico = $horaActual >= 17 && $horaActual <= 21;

$resumen = array(
    "dry_run" => $dryRun ? 1 : 0,
    "alertas_revisadas" => 0,
    "avisos_enviados" => 0,
    "avisos_fallidos" => 0,
    "sin_dato_vigente" => 0,
    "pronostico_evaluado" => $evaluarPronostico ? 1 : 0,
    "detalle" => array(),
);

$variables = alertas_variables();
$horas = intval(ALERTAS_HORAS_ENTRE_AVISOS);
$filtroDispositivo = $soloDispositivoId > 0 ? "AND d.id = " . $soloDispositivoId : "";

$rs = mysqli_query($conexion, "
    SELECT a.id, a.dispositivo_id, a.identificacion, a.variable, a.umbral, d.token
    FROM app_push_alertas a
    JOIN app_push_dispositivos d ON d.id = a.dispositivo_id
    WHERE a.activo = 1
      AND d.activo = 1
      $filtroDispositivo
      AND (a.ultimo_envio IS NULL OR a.ultimo_envio <= DATE_SUB(NOW(), INTERVAL $horas HOUR))
");
if (!$rs) {
    alertas_json(array("ok" => false, "error" => mysqli_error($conexion)), 500);
}

$alertas = array();
$ids = array();
while ($fila = mysqli_fetch_assoc($rs)) {
    $alertas[] = $fila;
    $ids[intval($fila["identificacion"])] = true;
}

/* Último registro de cada estación involucrada, sin los sensores dados de baja */
$estaciones = array();
if (count($ids) > 0) {
    $lista = implode(",", array_map("intval", array_keys($ids)));
    $re = mysqli_query($conexion, "
        SELECT Identificacion, nombre, lat, lon, alt, temp_af, RR_dia, viento_max, fecha_i
        FROM estaciones
        WHERE Identificacion IN ($lista)
    ");
    $bajas = function_exists("depuracionBajas") ? depuracionBajas($conexion, array_keys($ids), date("Y-m-d"), date("Y-m-d")) : array();
    while ($e = mysqli_fetch_assoc($re)) {
        $id = intval($e["Identificacion"]);
        if (function_exists("depuracionLimpiarActual")) {
            depuracionLimpiarActual($e, $bajas, $id);
        }
        $e["vigente"] = strtotime($e["fecha_i"]) >= time() - $MINUTOS_REGISTRO_VIGENTE * 60;
        $estaciones[$id] = $e;
    }
}

/* Mínima pronosticada desde ahora hasta las 10 h de mañana (null si falla Open-Meteo) */
$pronosticos = array();
function minima_esta_noche($e) {
    $url = "https://api.open-meteo.com/v1/forecast?" . http_build_query(array(
        "latitude" => $e["lat"],
        "longitude" => $e["lon"],
        "elevation" => $e["alt"],
        "hourly" => "temperature_2m",
        "timezone" => "America/Argentina/Buenos_Aires",
        "forecast_days" => 2,
    ));
    $ctx = stream_context_create(array("http" => array("timeout" => 10)));
    $json = json_decode(@file_get_contents($url, false, $ctx), true);
    if (!isset($json["hourly"]["time"])) {
        return null;
    }
    $desde = time() - 3600;
    $hasta = strtotime("tomorrow 10:00");
    $minima = null;
    $hora = null;
    foreach ($json["hourly"]["time"] as $i => $t) {
        $ts = strtotime($t);
        $temp = $json["hourly"]["temperature_2m"][$i];
        if ($ts < $desde || $ts > $hasta || $temp === null) {
            continue;
        }
        if ($minima === null || $temp < $minima) {
            $minima = floatval($temp);
            $hora = intval(date("G", $ts));
        }
    }
    return $minima === null ? null : array("minima" => $minima, "hora" => $hora);
}

function fmt_num($n) {
    return str_replace(".", ",", strval(round($n, 1)));
}

foreach ($alertas as $a) {
    $resumen["alertas_revisadas"]++;
    $ident = intval($a["identificacion"]);
    $variable = $a["variable"];
    $umbral = floatval($a["umbral"]);
    if (!isset($variables[$variable]) || !isset($estaciones[$ident])) {
        continue;
    }
    $def = $variables[$variable];
    $e = $estaciones[$ident];
    $nombre = $e["nombre"];

    $titulo = null;
    $mensaje = null;
    $tipo = "alerta";

    if ($variable === "helada_pronostico") {
        if (!$evaluarPronostico) {
            continue;
        }
        if (!array_key_exists($ident, $pronosticos)) {
            $pronosticos[$ident] = minima_esta_noche($e);
        }
        $p = $pronosticos[$ident];
        if ($p !== null && $p["minima"] <= $umbral) {
            $tipo = "helada";
            $titulo = "Helada pronosticada en $nombre";
            $mensaje = "Mínima esperada esta noche: " . fmt_num($p["minima"]) . " °C a las " . $p["hora"] . " h.";
        }
    } else {
        $campo = $def["campo"];
        if (!$e["vigente"] || !isset($e[$campo]) || $e[$campo] === null || $e[$campo] === "") {
            $resumen["sin_dato_vigente"]++;
            continue;
        }
        $valor = floatval($e[$campo]);
        $cumple = $def["bajo"] ? $valor <= $umbral : $valor >= $umbral;
        if ($cumple) {
            $titulo = "$nombre: " . mb_strtolower($def["texto"], "UTF-8") . " " . fmt_num($umbral) . " " . $def["unidad"];
            $mensaje = "Último registro: " . fmt_num($valor) . " " . $def["unidad"] . " a las " . date("H:i", strtotime($e["fecha_i"])) . " h.";
        }
    }

    if ($titulo === null) {
        continue;
    }

    $resumen["detalle"][] = array("alerta" => intval($a["id"]), "titulo" => $titulo, "mensaje" => $mensaje);
    if ($dryRun) {
        $resumen["avisos_enviados"]++;
        continue;
    }

    $fcm = fcm_send_to_token($a["token"], $titulo, $mensaje, array(
        "tipo" => $tipo,
        "estacion_id" => strval($ident),
        "alerta_id" => strval($a["id"]),
    ));

    $st = mysqli_prepare($conexion, "
        INSERT INTO app_push_log
            (dispositivo_id, evento_id, tipo, identificacion, token, titulo, mensaje, enviado_en, resultado, detalle)
        VALUES (?, ?, 'alerta_usuario', ?, ?, ?, ?, NOW(), ?, ?)
    ");
    $dispId = intval($a["dispositivo_id"]);
    $alertaId = intval($a["id"]);
    $resultado = $fcm["ok"] ? "ok" : "error";
    $detalle = substr($fcm["response"] . " " . $fcm["error"], 0, 4000);
    mysqli_stmt_bind_param($st, "iiisssss", $dispId, $alertaId, $ident, $a["token"], $titulo, $mensaje, $resultado, $detalle);
    mysqli_stmt_execute($st);
    mysqli_stmt_close($st);

    if ($fcm["ok"]) {
        mysqli_query($conexion, "UPDATE app_push_alertas SET ultimo_envio = NOW() WHERE id = $alertaId");
        $resumen["avisos_enviados"]++;
    } else {
        $resumen["avisos_fallidos"]++;
    }
}

alertas_json(array("ok" => true, "resumen" => $resumen));
