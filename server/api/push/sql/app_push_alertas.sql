-- Alertas a medida de la app móvil (push-alertas.php y verificar-alertas-push.php).
-- Base: estaciones (la misma de app_push_dispositivos). Se ejecuta una vez.

CREATE TABLE IF NOT EXISTS app_push_alertas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispositivo_id INT NOT NULL,
  identificacion INT NOT NULL,              -- estación (estaciones.Identificacion)
  variable VARCHAR(20) NOT NULL,            -- temp_bajo, temp_sobre, lluvia_dia, rafaga, helada_pronostico
  umbral DECIMAL(6,1) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado DATETIME NOT NULL,
  ultimo_envio DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_dispositivo (dispositivo_id),
  KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
