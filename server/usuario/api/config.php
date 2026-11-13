<?php
/*
 * Configuración de la API de usuarios (/services/usuarios). Es el único archivo que hay que ajustar al servidor.
 * No contiene credenciales: la conexión la hace conecta_mysql.php, igual que /services/.
 */

// Instalado en public_html/services/usuarios/.
// Conexión con el usuario de MySQL con escritura (agromet_usuarios, en 192.168.0.84).
// conecta_usuarios.php existe sólo en el servidor (tiene la contraseña); ver conecta_usuarios.ejemplo.php.
// Igual que conecta_mysql.php de /services/ (sólo lectura): recibe $db y define $conexion.
const RUTA_CONECTA_MYSQL = __DIR__ . '/conecta_usuarios.php';

// Base donde están las tablas de usuario (ver ../sql/01_tablas_usuario.sql)
const DB_USUARIOS = 'usuarios';

// Base y tabla de estaciones, para validar los identificadores que llegan.
const DB_ESTACIONES = 'estaciones';
const TABLA_ESTACIONES = 'estaciones';

// Proyecto de Firebase (es público: figura en environment.ts del frontend)
const FIREBASE_PROJECT_ID = 'agromet-web';

// Límites por usuario
const MAX_FAVORITAS = 8;
const MAX_CONSULTAS = 30;
const MAX_ALERTAS = 20;

// Herramientas válidas para consultas guardadas (las mismas de src/app/shared/enlace-consulta.ts)
const HERRAMIENTAS = [
    'datos-localidad', 'tiempo-real', 'campania-lluvias', 'aplicar', 'comparar-anios',
    'comparar-localidades', 'horas-frio', 'suma-termica', 'enfermedades', 'fenologia', 'rinde-soja',
    'balance-hidrico', 'resumen-diario', 'peligro-incendios',
];
