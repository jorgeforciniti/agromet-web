<?php
/*
 * Alertas a medida de la app móvil: el celular las lista, agrega y borra.
 *
 * POST JSON: { token, dispositivo_id, accion: "listar" | "agregar" | "borrar", ... }
 *   agregar: identificacion, variable (ver alertas_variables()), umbral
 *   borrar:  id
 * El celular se identifica con su token de FCM y el dispositivo_id que le dio push-registrar-token.php
 * (los dos tienen que coincidir en app_push_dispositivos).
 */
date_default_timezone_set("America/Argentina/Tucuman");

require __DIR__ . "/push-alertas-comun.php";
alertas_cabeceras();

$db = "estaciones";
include(__DIR__ . "/../estaciones/conecta_mysql.php");

if (!isset($conexion) || !$conexion) {
    alertas_json(array("ok" => false, "error" => "Sin conexión MySQL"), 500);
}
mysqli_set_charset($conexion, "utf8mb4");

$entrada = json_decode(file_get_contents("php://input"), true);
if (!is_array($entrada)) {
    alertas_json(array("ok" => false, "error" => "Falta el cuerpo JSON"), 400);
}

$token = isset($entrada["token"]) ? strval($entrada["token"]) : "";
$dispositivoId = isset($entrada["dispositivo_id"]) ? intval($entrada["dispositivo_id"]) : 0;
$accion = isset($entrada["accion"]) ? strval($entrada["accion"]) : "listar";

if ($token === "" || $dispositivoId <= 0) {
    alertas_json(array("ok" => false, "error" => "Faltan token o dispositivo_id"), 400);
}

$st = mysqli_prepare($conexion, "SELECT id FROM app_push_dispositivos WHERE id = ? AND token = ? AND activo = 1");
mysqli_stmt_bind_param($st, "is", $dispositivoId, $token);
mysqli_stmt_execute($st);
mysqli_stmt_store_result($st);
if (mysqli_stmt_num_rows($st) === 0) {
    alertas_json(array("ok" => false, "error" => "Dispositivo no registrado"), 403);
}
mysqli_stmt_close($st);

$variables = alertas_variables();

if ($accion === "agregar") {
    $identificacion = isset($entrada["identificacion"]) ? intval($entrada["identificacion"]) : 0;
    $variable = isset($entrada["variable"]) ? strval($entrada["variable"]) : "";
    $umbral = isset($entrada["umbral"]) ? floatval($entrada["umbral"]) : null;

    if (!isset($variables[$variable])) {
        alertas_json(array("ok" => false, "error" => "Variable desconocida"), 400);
    }
    $def = $variables[$variable];
    if ($umbral === null || $umbral < $def["min"] || $umbral > $def["max"]) {
        alertas_json(array(
            "ok" => false,
            "error" => "El valor tiene que estar entre " . $def["min"] . " y " . $def["max"] . " " . $def["unidad"]
        ), 400);
    }

    $st = mysqli_prepare($conexion, "SELECT 1 FROM estaciones WHERE Identificacion = ? AND habilitada <> 0");
    mysqli_stmt_bind_param($st, "i", $identificacion);
    mysqli_stmt_execute($st);
    mysqli_stmt_store_result($st);
    if (mysqli_stmt_num_rows($st) === 0) {
        alertas_json(array("ok" => false, "error" => "Estación inexistente"), 400);
    }
    mysqli_stmt_close($st);

    $st = mysqli_prepare($conexion, "SELECT COUNT(*) FROM app_push_alertas WHERE dispositivo_id = ? AND activo = 1");
    mysqli_stmt_bind_param($st, "i", $dispositivoId);
    mysqli_stmt_execute($st);
    mysqli_stmt_bind_result($st, $cantidad);
    mysqli_stmt_fetch($st);
    mysqli_stmt_close($st);
    if ($cantidad >= ALERTAS_MAXIMO) {
        alertas_json(array("ok" => false, "error" => "Podés tener hasta " . ALERTAS_MAXIMO . " alertas"), 400);
    }

    $st = mysqli_prepare($conexion, "
        INSERT INTO app_push_alertas (dispositivo_id, identificacion, variable, umbral, activo, creado)
        VALUES (?, ?, ?, ?, 1, NOW())
    ");
    mysqli_stmt_bind_param($st, "iisd", $dispositivoId, $identificacion, $variable, $umbral);
    mysqli_stmt_execute($st);
    mysqli_stmt_close($st);
} elseif ($accion === "borrar") {
    $id = isset($entrada["id"]) ? intval($entrada["id"]) : 0;
    $st = mysqli_prepare($conexion, "UPDATE app_push_alertas SET activo = 0 WHERE id = ? AND dispositivo_id = ?");
    mysqli_stmt_bind_param($st, "ii", $id, $dispositivoId);
    mysqli_stmt_execute($st);
    mysqli_stmt_close($st);
} elseif ($accion !== "listar") {
    alertas_json(array("ok" => false, "error" => "Acción desconocida"), 400);
}

// Siempre devuelve la lista actualizada
$st = mysqli_prepare($conexion, "
    SELECT a.id, a.identificacion, e.nombre, a.variable, a.umbral, a.ultimo_envio
    FROM app_push_alertas a
    LEFT JOIN estaciones e ON e.Identificacion = a.identificacion
    WHERE a.dispositivo_id = ? AND a.activo = 1
    ORDER BY a.id
");
mysqli_stmt_bind_param($st, "i", $dispositivoId);
mysqli_stmt_execute($st);
mysqli_stmt_bind_result($st, $id, $ident, $nombre, $variable, $umbral, $ultimo);

$alertas = array();
while (mysqli_stmt_fetch($st)) {
    $def = isset($variables[$variable]) ? $variables[$variable] : null;
    $alertas[] = array(
        "id" => $id,
        "identificacion" => $ident,
        "estacion" => $nombre,
        "variable" => $variable,
        "umbral" => floatval($umbral),
        "texto" => $def ? $def["texto"] : $variable,
        "unidad" => $def ? $def["unidad"] : "",
        "ultimo_envio" => $ultimo,
    );
}
mysqli_stmt_close($st);

// Las opciones también, para que la app no tenga que repetir rangos ni textos
$opciones = array();
foreach ($variables as $clave => $def) {
    $opciones[] = array(
        "variable" => $clave,
        "texto" => $def["texto"],
        "unidad" => $def["unidad"],
        "min" => $def["min"],
        "max" => $def["max"],
    );
}

alertas_json(array("ok" => true, "alertas" => $alertas, "opciones" => $opciones, "maximo" => ALERTAS_MAXIMO));
