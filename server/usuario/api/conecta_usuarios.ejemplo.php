<?php
/*
 * Plantilla de conexión con el usuario exclusivo de la API (ver ../sql/02_usuario_mysql_api.sql).
 * En el servidor: copiar como conecta_usuarios.php en esta misma carpeta, completar la contraseña
 * y en config.php poner:  const RUTA_CONECTA_MYSQL = __DIR__ . '/conecta_usuarios.php';
 * conecta_usuarios.php NO se sube al repositorio (tiene la contraseña) y el .htaccess impide
 * pedirlo desde afuera.
 *
 * Igual que conecta_mysql.php: recibe $db (nombre de la base) y define $conexion.
 */
// MySQL está en otro servidor (el mismo host y puerto que config.ini de /services/), no en localhost
$conexion = new mysqli('192.168.0.84', 'agromet_usuarios', 'CONTRASEÑA', $db, 3306);
