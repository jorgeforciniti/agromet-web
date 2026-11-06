-- Usuario de MySQL exclusivo para la API de usuarios (/services/usuarios).
-- La API necesita escribir (INSERT, UPDATE, DELETE) en la base `usuarios` y sólo leer la tabla de
-- estaciones. El usuario `invitado` de los servicios públicos tiene sólo SELECT e INSERT, y no
-- conviene ampliarle permisos: es el que usan todos los PHP públicos.
--
-- Ejecutar como administrador (root o eeaoc) en el servidor MySQL (192.168.0.84), cambiando la
-- contraseña. No guardar la contraseña en el repositorio: va sólo en conecta_usuarios.php.
--
-- La conexión llega desde el servidor web, no desde localhost: el usuario se crea para la IP del
-- servidor web (reemplazar IP_SERVIDOR_WEB; el diagnóstico la muestra en el mensaje de error 1045
-- como 'agromet_usuarios'@'IP'). Con '%' se permite desde cualquier equipo de la red.

CREATE USER 'agromet_usuarios'@'IP_SERVIDOR_WEB' IDENTIFIED BY 'CAMBIAR_POR_UNA_CONTRASEÑA_LARGA';

GRANT SELECT, INSERT, UPDATE, DELETE ON `usuarios`.* TO 'agromet_usuarios'@'IP_SERVIDOR_WEB';
GRANT SELECT ON `estaciones`.`estaciones` TO 'agromet_usuarios'@'IP_SERVIDOR_WEB';

FLUSH PRIVILEGES;
