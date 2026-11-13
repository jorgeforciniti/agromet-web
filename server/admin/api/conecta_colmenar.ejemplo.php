<?php
/*
 * Plantilla de conexión para la pestaña «El Colmenar» de /admin (colmenar_diarios.php).
 * En el servidor: copiar como conecta_colmenar.php en esta misma carpeta y completar el usuario y la
 * contraseña. conecta_colmenar.php NO se sube al repositorio y el .htaccess impide pedirlo desde
 * afuera.
 *
 * Recibe $db (la base: `colmenar`) y define $conexion. El usuario necesita sólo SELECT, INSERT y
 * UPDATE sobre colmenar.clima_diario_el_colmenar (ver server/admin/LEEME.md).
 */
// El mismo host y puerto que /api/config.ini (el que usan las APIs de El Colmenar). Con 3 s de
// espera como máximo, igual que diarios.php: si el host no contesta, la pestaña lo avisa enseguida.
$conexion = mysqli_init();
mysqli_options($conexion, MYSQLI_OPT_CONNECT_TIMEOUT, 3);
@mysqli_real_connect($conexion, 'HOST', 'USUARIO', 'CONTRASEÑA', $db, 3306);
