<?php
/*
 * Plantilla de conexión para la pestaña «Red pluviométrica» de /admin (lluvias_*.php).
 * En el servidor: copiar como conecta_lluvias.php en esta misma carpeta y completar la contraseña.
 * conecta_lluvias.php NO se sube al repositorio y el .htaccess impide pedirlo desde afuera.
 *
 * Recibe $db (la base: `estaciones`) y define $conexion. El usuario es agromet_lluvias, con permisos
 * sólo sobre las tablas de la red y un tope de conexiones (ver server/admin/LEEME.md).
 */
// Con 3 s de espera como máximo: si el host no contesta, la pestaña lo avisa enseguida.
$conexion = mysqli_init();
mysqli_options($conexion, MYSQLI_OPT_CONNECT_TIMEOUT, 3);
@mysqli_real_connect($conexion, '192.168.0.84', 'agromet_lluvias', 'CONTRASEÑA', $db, 3306);
