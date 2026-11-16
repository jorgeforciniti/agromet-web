<?php
header("Content-Type: application/json; charset=utf-8");

date_default_timezone_set("America/Argentina/Tucuman");

$db = "estaciones";

include(__DIR__ . "/../estaciones/conecta_mysql.php");
include(__DIR__ . "/fcm-v1.php");

/*
  Sensores dados de baja (depuración de datos, /services/depuracion.php): una estación con la
  temperatura de baja no avisa helada. Si el archivo no está, sigue como antes.
*/
$depuracion = __DIR__ . "/../../services/depuracion.php";
if (is_file($depuracion)) {
    require_once $depuracion;
}

if (!isset($conexion) || !$conexion) {
    http_response_code(500);
    echo json_encode(array(
        "ok" => false,
        "error" => "Sin conexión MySQL"
    ), JSON_UNESCAPED_UNICODE);
    exit;
}

mysqli_set_charset($conexion, "utf8mb4");

/*
  Clave simple para evitar ejecuciones públicas accidentales.
  Más adelante podemos moverla a un archivo privado.
*/
$KEY = isset($_GET["key"]) ? $_GET["key"] : "";

/*
  La clave está en clave-push.php (no se sube al repositorio; ver clave-push.ejemplo.php).
*/
if (!is_file(__DIR__ . "/clave-push.php")) {
    http_response_code(500);
    echo json_encode(array(
        "ok" => false,
        "error" => "Falta clave-push.php"
    ), JSON_UNESCAPED_UNICODE);
    exit;
}
require __DIR__ . "/clave-push.php"; // define $KEY_OK

if ($KEY !== $KEY_OK) {
    http_response_code(403);
    echo json_encode(array(
        "ok" => false,
        "error" => "Key inválida"
    ), JSON_UNESCAPED_UNICODE);
    exit;
}

/*
  Parámetros opcionales:
  dry_run=1                 → no inserta ni actualiza base, no envía push.
  test_identificacion=31    → simula una estación específica.
  test_temp=-0.4            → temperatura simulada.
  solo_dispositivo_id=2     → limita el envío real a un dispositivo.
*/
$dryRun = isset($_GET["dry_run"]) && $_GET["dry_run"] == "1";
$testIdentificacion = isset($_GET["test_identificacion"]) ? intval($_GET["test_identificacion"]) : 0;
$testTemp = isset($_GET["test_temp"]) ? floatval($_GET["test_temp"]) : null;
$modoTest = ($testIdentificacion > 0 && $testTemp !== null);
$soloDispositivoId = isset($_GET["solo_dispositivo_id"]) ? intval($_GET["solo_dispositivo_id"]) : 0;

$resumen = array(
    "dry_run" => $dryRun ? 1 : 0,
    "modo_test" => $modoTest ? 1 : 0,
    "test_identificacion" => $testIdentificacion,
    "test_temp" => $testTemp,
    "solo_dispositivo_id" => $soloDispositivoId,
    "episodio_id" => null,
    "episodio_nuevo" => 0,
    "aviso_inicio_provincial" => 0,
    "aviso_resumen_provincial" => 0,
    "helando" => 0,
    "eventos_nuevos" => 0,
    "eventos_actualizados" => 0,
    "eventos_cerrados" => 0,
    "tokens_candidatos" => 0,
    "notificaciones_enviadas" => 0,
    "notificaciones_fallidas" => 0,
    "episodio_cerrado" => 0,
    "omitidas_por_baja" => array()
);

$eventosNuevos = array();
$estacionesHelando = array();

function qpush($conexion, $sql) {
    $r = mysqli_query($conexion, $sql);
    if (!$r) {
        throw new Exception(mysqli_error($conexion) . " SQL: " . $sql);
    }
    return $r;
}

function escpush($conexion, $s) {
    return mysqli_real_escape_string($conexion, $s);
}

function fmt_temp_push($t) {
    return number_format(floatval($t), 1, ".", "");
}

function obtener_episodio_abierto($conexion) {
    $sql = "
        SELECT *
        FROM app_helada_episodios
        WHERE estado = 'abierto'
        ORDER BY id DESC
        LIMIT 1
    ";

    $rs = qpush($conexion, $sql);

    if ($row = mysqli_fetch_assoc($rs)) {
        return $row;
    }

    return null;
}

/*
  Estaciones con el sensor de temperatura dado de baja hoy: [identificacion => true]
*/
function estaciones_temp_baja($conexion) {
    $ids = array();
    if (!function_exists("depuracionBajas")) {
        return $ids;
    }
    $hoy = date("Y-m-d");
    $bajas = depuracionBajas($conexion, null, $hoy, $hoy);
    foreach (array_keys($bajas) as $id) {
        if (in_array("temperatura", depuracionVariables($bajas, $id, $hoy), true)) {
            $ids[intval($id)] = true;
        }
    }
    return $ids;
}

try {

    $tempBaja = estaciones_temp_baja($conexion);

    /*
      0) Cerrar los eventos abiertos de estaciones con la temperatura dada de baja: su sensor no
      sirve para decir si sigue helando, y si quedara clavado bajo cero el episodio no cerraría.
    */
    if (count($tempBaja) > 0) {
        $rsBaja = qpush($conexion, "
            SELECT id, identificacion
            FROM app_helada_eventos
            WHERE estado = 'abierto'
              AND identificacion IN (" . implode(",", array_keys($tempBaja)) . ")
        ");

        while ($r = mysqli_fetch_assoc($rsBaja)) {
            if (!$dryRun) {
                qpush($conexion, "
                    UPDATE app_helada_eventos
                    SET estado = 'cerrado',
                        fecha_fin = NOW(),
                        fecha_ultimo_evento = NOW()
                    WHERE id = " . intval($r["id"]) . "
                ");
            }

            $resumen["eventos_cerrados"]++;
        }
    }

    /*
      1) Cerrar eventos por estación cuando la estación salió de helada.

      Regla inicial simple:
      - temp_af > 0.5 °C
      - dato reciente: últimos 45 minutos

      Más adelante podemos exigir 2 registros consecutivos > 0.5 °C.
    */
    $sqlCerrar = "
        SELECT
            e.id,
            e.identificacion,
            es.temp_af,
            es.fecha_i
        FROM app_helada_eventos e
        JOIN estaciones es ON es.Identificacion = e.identificacion
        WHERE e.estado = 'abierto'
          AND es.temp_af > 0.5
          AND es.fecha_i >= DATE_SUB(NOW(), INTERVAL 45 MINUTE)
    ";

    $rsCerrar = qpush($conexion, $sqlCerrar);

    while ($r = mysqli_fetch_assoc($rsCerrar)) {
        $id = intval($r["id"]);
        $temp = floatval($r["temp_af"]);

        if (!$dryRun) {
            $sql = "
                UPDATE app_helada_eventos
                SET estado = 'cerrado',
                    fecha_fin = NOW(),
                    fecha_ultimo_evento = NOW(),
                    temp_ultimo = $temp
                WHERE id = $id
            ";

            qpush($conexion, $sql);
        }

        $resumen["eventos_cerrados"]++;
    }

    /*
      2) Buscar estaciones actualmente helando.

      Regla real:
      - estación habilitada
      - temp_af <= 0
      - dato reciente

      Modo test:
      - fuerza una estación y temperatura simulada.
    */
    if ($modoTest) {
        $sqlHelando = "
            SELECT
                Identificacion,
                nombre,
                " . floatval($testTemp) . " AS temp_af,
                NOW() AS fecha_i
            FROM estaciones
            WHERE Identificacion = " . intval($testIdentificacion) . "
            LIMIT 1
        ";
    } else {
        $sqlHelando = "
            SELECT
                Identificacion,
                nombre,
                temp_af,
                fecha_i
            FROM estaciones
            WHERE habilitada <> 0
              AND temp_af <= 0
              AND fecha_i >= DATE_SUB(NOW(), INTERVAL 45 MINUTE)
            ORDER BY temp_af ASC
        ";
    }

    $rs = qpush($conexion, $sqlHelando);

    while ($row = mysqli_fetch_assoc($rs)) {
        $ident = intval($row["Identificacion"]);
        $nombre = $row["nombre"];
        $temp = floatval($row["temp_af"]);
        $fechaDato = $row["fecha_i"];

        // Temperatura dada de baja: no cuenta como helada (en modo test, sí)
        if (!$modoTest && isset($tempBaja[$ident])) {
            $resumen["omitidas_por_baja"][] = array(
                "identificacion" => $ident,
                "nombre" => $nombre,
                "temp" => $temp
            );
            continue;
        }

        $resumen["helando"]++;

        $estacionesHelando[] = array(
            "identificacion" => $ident,
            "nombre" => $nombre,
            "temp" => $temp,
            "fecha_i" => $fechaDato
        );

        /*
          Ver si ya hay evento abierto para esta estación.
        */
        $sqlEvento = "
            SELECT id, temp_min
            FROM app_helada_eventos
            WHERE identificacion = $ident
              AND estado = 'abierto'
            LIMIT 1
        ";

        $ev = qpush($conexion, $sqlEvento);

        if ($e = mysqli_fetch_assoc($ev)) {
            $eventoId = intval($e["id"]);
            $tempMinActual = is_null($e["temp_min"]) ? $temp : floatval($e["temp_min"]);

            $nuevoMin = $temp < $tempMinActual ? $temp : $tempMinActual;
            $fechaMinSql = $temp < $tempMinActual ? ", fecha_temp_min = NOW()" : "";

            if (!$dryRun) {
                $sqlUpdate = "
                    UPDATE app_helada_eventos
                    SET fecha_ultimo_evento = NOW(),
                        temp_ultimo = $temp,
                        temp_min = $nuevoMin,
                        registros_bajo_cero = registros_bajo_cero + 1
                        $fechaMinSql
                    WHERE id = $eventoId
                ";

                qpush($conexion, $sqlUpdate);
            }

            $resumen["eventos_actualizados"]++;

        } else {
            /*
              Nuevo evento de helada en esta estación.
            */
            if (!$dryRun) {
                $sqlInsert = "
                    INSERT INTO app_helada_eventos
                        (
                          identificacion,
                          nombre,
                          estado,
                          fecha_inicio,
                          fecha_ultimo_evento,
                          temp_inicio,
                          temp_min,
                          temp_ultimo,
                          fecha_temp_min,
                          registros_bajo_cero,
                          recuperaciones_consecutivas,
                          descripcion
                        )
                    VALUES
                        (
                          $ident,
                          '" . escpush($conexion, $nombre) . "',
                          'abierto',
                          NOW(),
                          NOW(),
                          $temp,
                          $temp,
                          $temp,
                          NOW(),
                          1,
                          0,
                          'Inicio de helada detectado por temp_af <= 0'
                        )
                ";

                qpush($conexion, $sqlInsert);
                $eventoId = mysqli_insert_id($conexion);
            } else {
                $eventoId = 0;
            }

            $resumen["eventos_nuevos"]++;

            $eventosNuevos[] = array(
                "evento_id" => $eventoId,
                "identificacion" => $ident,
                "nombre" => $nombre,
                "temp" => $temp
            );
        }
    }

    /*
      3) Crear o actualizar episodio provincial de helada.

      Si hay estaciones helando:
      - si no hay episodio provincial abierto, se crea.
      - si ya hay episodio abierto, se actualiza.
    */
    $episodio = null;
    $episodioId = 0;
    $episodioNuevo = false;

    if (count($estacionesHelando) > 0) {

        $minima = null;
        $minimaNombre = "";
        $minimaIdent = null;

        foreach ($estacionesHelando as $eh) {
            if ($minima === null || $eh["temp"] < $minima) {
                $minima = $eh["temp"];
                $minimaNombre = $eh["nombre"];
                $minimaIdent = intval($eh["identificacion"]);
            }
        }

        $episodio = obtener_episodio_abierto($conexion);

        if ($episodio) {
            $episodioId = intval($episodio["id"]);

            if (!$dryRun) {
                $sqlUpdEpisodio = "
                    UPDATE app_helada_episodios
                    SET fecha_ultimo_evento = NOW(),
                        estaciones_max = GREATEST(estaciones_max, " . count($estacionesHelando) . "),
                        temp_min = CASE
                            WHEN temp_min IS NULL OR " . floatval($minima) . " < temp_min
                            THEN " . floatval($minima) . "
                            ELSE temp_min
                        END,
                        estacion_temp_min = CASE
                            WHEN temp_min IS NULL OR " . floatval($minima) . " < temp_min
                            THEN " . intval($minimaIdent) . "
                            ELSE estacion_temp_min
                        END,
                        nombre_temp_min = CASE
                            WHEN temp_min IS NULL OR " . floatval($minima) . " < temp_min
                            THEN '" . escpush($conexion, $minimaNombre) . "'
                            ELSE nombre_temp_min
                        END
                    WHERE id = $episodioId
                ";

                qpush($conexion, $sqlUpdEpisodio);
            }

        } else {
            $episodioNuevo = true;

            if (!$dryRun) {
                $sqlInsEpisodio = "
                    INSERT INTO app_helada_episodios
                        (
                          estado,
                          fecha_inicio,
                          fecha_ultimo_evento,
                          estaciones_inicio,
                          estaciones_max,
                          temp_min,
                          estacion_temp_min,
                          nombre_temp_min,
                          descripcion
                        )
                    VALUES
                        (
                          'abierto',
                          NOW(),
                          NOW(),
                          " . count($estacionesHelando) . ",
                          " . count($estacionesHelando) . ",
                          " . floatval($minima) . ",
                          " . intval($minimaIdent) . ",
                          '" . escpush($conexion, $minimaNombre) . "',
                          'Episodio provincial de helada iniciado automáticamente'
                        )
                ";

                qpush($conexion, $sqlInsEpisodio);
                $episodioId = mysqli_insert_id($conexion);
            } else {
                $episodioId = 0;
            }

            $resumen["episodio_nuevo"] = 1;
        }

        $resumen["episodio_id"] = $episodioId;
    }

    /*
      4) Enviar aviso provincial.

      Reglas:
      - Si el episodio provincial es nuevo: enviar aviso inmediato.
      - Si el episodio ya existía: enviar resumen solo si hay eventos nuevos
        y pasó al menos 60 minutos desde el último resumen/notificación inicial.
    */
    $debeEnviarAvisoProvincial = false;
    $esResumenProvincial = false;

    if (count($eventosNuevos) > 0 && count($estacionesHelando) > 0) {

        if ($episodioNuevo) {
            $debeEnviarAvisoProvincial = true;
            $esResumenProvincial = false;
        } else {
            $sqlCheckResumen = "
                SELECT
                    id,
                    fecha_notificacion_inicio,
                    fecha_ultimo_resumen
                FROM app_helada_episodios
                WHERE id = " . intval($episodioId) . "
                LIMIT 1
            ";

            $rsCheck = qpush($conexion, $sqlCheckResumen);
            $rowCheck = mysqli_fetch_assoc($rsCheck);

            $puedeResumen = false;

            if ($rowCheck) {
                $fechaBase = null;

                if (!empty($rowCheck["fecha_ultimo_resumen"])) {
                    $fechaBase = $rowCheck["fecha_ultimo_resumen"];
                } elseif (!empty($rowCheck["fecha_notificacion_inicio"])) {
                    $fechaBase = $rowCheck["fecha_notificacion_inicio"];
                }

                if ($fechaBase === null) {
                    $puedeResumen = true;
                } else {
                    $sqlDiff = "
                        SELECT TIMESTAMPDIFF(MINUTE, '" . escpush($conexion, $fechaBase) . "', NOW()) AS mins
                    ";

                    $rsDiff = qpush($conexion, $sqlDiff);
                    $rowDiff = mysqli_fetch_assoc($rsDiff);
                    $mins = intval($rowDiff["mins"]);

                    if ($mins >= 60) {
                        $puedeResumen = true;
                    }
                }
            }

            if ($puedeResumen) {
                $debeEnviarAvisoProvincial = true;
                $esResumenProvincial = true;
            }
        }
    }

    if ($debeEnviarAvisoProvincial) {

        $minima = null;
        $minimaNombre = "";

        foreach ($estacionesHelando as $eh) {
            if ($minima === null || $eh["temp"] < $minima) {
                $minima = $eh["temp"];
                $minimaNombre = $eh["nombre"];
            }
        }

        $primero = $eventosNuevos[0];

        if (!$esResumenProvincial) {
            if (count($eventosNuevos) === 1) {
                $titulo = "Heladas en inicio";
                $mensaje = "Comenzó a helar en " .
                    $primero["nombre"] . ": " .
                    fmt_temp_push($primero["temp"]) . " °C.";
            } else {
                $titulo = "Heladas en inicio";
                $mensaje = count($eventosNuevos) .
                    " estaciones comenzaron a helar. Mínima: " .
                    fmt_temp_push($minima) . " °C en " .
                    $minimaNombre . ".";
            }

            $tipoLog = "helada_inicio_provincia";
            $resumen["aviso_inicio_provincial"] = 1;

        } else {
            $titulo = "Heladas en expansión";
            $mensaje = "Hay " . count($estacionesHelando) .
                " estaciones con temperatura <= 0 °C. Mínima: " .
                fmt_temp_push($minima) . " °C en " .
                $minimaNombre . ".";

            $tipoLog = "helada_resumen_provincia";
            $resumen["aviso_resumen_provincial"] = 1;
        }

        /*
          Usuarios públicos con alcance provincial.
          Se respeta cooldown individual.
        */
        $filtroDispositivo = "";

        if ($soloDispositivoId > 0) {
            $filtroDispositivo = " AND d.id = " . intval($soloDispositivoId) . " ";
        }

        $sqlTokens = "
            SELECT
                d.id,
                d.token,
                d.ultimo_envio_helada,
                p.cooldown_heladas_min
            FROM app_push_dispositivos d
            JOIN app_push_preferencias p ON p.dispositivo_id = d.id
            WHERE d.activo = 1
              AND p.heladas_activo = 1
              AND p.heladas_alcance = 'provincia'
              $filtroDispositivo
              AND (
                    d.ultimo_envio_helada IS NULL
                    OR d.ultimo_envio_helada <= DATE_SUB(NOW(), INTERVAL p.cooldown_heladas_min MINUTE)
                  )
        ";

        $rt = qpush($conexion, $sqlTokens);

        while ($d = mysqli_fetch_assoc($rt)) {
            $resumen["tokens_candidatos"]++;

            $dispId = intval($d["id"]);
            $token = $d["token"];

            $data = array(
                "tipo" => $esResumenProvincial ? "helada_resumen" : "helada_inicio",
                "alcance" => "provincia",
                "pantalla" => "heladas",
                "episodio_id" => strval($episodioId),
                "estaciones_nuevas" => strval(count($eventosNuevos)),
                "estaciones_helando" => strval(count($estacionesHelando)),
                "minima" => strval($minima),
                "minima_nombre" => $minimaNombre
            );

            if ($dryRun) {
                $resumen["notificaciones_enviadas"]++;
                continue;
            }

            $fcm = fcm_send_to_token($token, $titulo, $mensaje, $data);

            $resultado = $fcm["ok"] ? "ok" : "error";
            $detalle = escpush(
                $conexion,
                substr($fcm["response"] . " " . $fcm["error"], 0, 4000)
            );

            $sqlLog = "
                INSERT INTO app_push_log
                    (
                      dispositivo_id,
                      evento_id,
                      tipo,
                      identificacion,
                      token,
                      titulo,
                      mensaje,
                      enviado_en,
                      resultado,
                      detalle
                    )
                VALUES
                    (
                      $dispId,
                      " . intval($episodioId) . ",
                      '" . escpush($conexion, $tipoLog) . "',
                      NULL,
                      '" . escpush($conexion, $token) . "',
                      '" . escpush($conexion, $titulo) . "',
                      '" . escpush($conexion, $mensaje) . "',
                      NOW(),
                      '$resultado',
                      '$detalle'
                    )
            ";

            qpush($conexion, $sqlLog);

            if ($fcm["ok"]) {
                qpush(
                    $conexion,
                    "UPDATE app_push_dispositivos
                     SET ultimo_envio_helada = NOW()
                     WHERE id = $dispId"
                );

                $resumen["notificaciones_enviadas"]++;
            } else {
                $resumen["notificaciones_fallidas"]++;
            }
        }

        /*
          Actualizamos el episodio provincial después del intento de aviso.
        */
        if (!$dryRun && $episodioId > 0) {
            if ($esResumenProvincial) {
                qpush(
                    $conexion,
                    "
                    UPDATE app_helada_episodios
                    SET fecha_ultimo_resumen = NOW(),
                        resumenes_enviados = resumenes_enviados + 1
                    WHERE id = " . intval($episodioId)
                );
            } else {
                qpush(
                    $conexion,
                    "
                    UPDATE app_helada_episodios
                    SET notificado_inicio = 1,
                        fecha_notificacion_inicio = NOW()
                    WHERE id = " . intval($episodioId)
                );
            }
        }

        /*
          Marcamos los eventos nuevos como notificados.
        */
        if (!$dryRun) {
            foreach ($eventosNuevos as $n) {
                if (intval($n["evento_id"]) <= 0) {
                    continue;
                }

                qpush(
                    $conexion,
                    "
                    UPDATE app_helada_eventos
                    SET notificado_inicio = 1,
                        fecha_notificacion_inicio = NOW()
                    WHERE id = " . intval($n["evento_id"])
                );
            }
        }
    }

    /*
      5) Si no hay estaciones helando, cerrar episodio provincial abierto.
      No se envía push de cierre.
    */
    if (count($estacionesHelando) === 0) {
        $episodioAbierto = obtener_episodio_abierto($conexion);

        if ($episodioAbierto) {
            $episodioIdCerrar = intval($episodioAbierto["id"]);

            if (!$dryRun) {
                qpush(
                    $conexion,
                    "
                    UPDATE app_helada_episodios
                    SET estado = 'cerrado',
                        fecha_fin = NOW(),
                        fecha_ultimo_evento = NOW()
                    WHERE id = $episodioIdCerrar
                    "
                );
            }

            $resumen["episodio_id"] = $episodioIdCerrar;
            $resumen["episodio_cerrado"] = 1;
        }
    }

    echo json_encode(array(
        "ok" => true,
        "resumen" => $resumen,
        "eventos_nuevos" => $eventosNuevos,
        "estaciones_helando" => $estacionesHelando
    ), JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);

    echo json_encode(array(
        "ok" => false,
        "error" => $e->getMessage(),
        "resumen" => $resumen,
        "eventos_nuevos" => $eventosNuevos,
        "estaciones_helando" => $estacionesHelando
    ), JSON_UNESCAPED_UNICODE);
}

mysqli_close($conexion);
