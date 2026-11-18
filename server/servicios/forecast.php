<?php
/*
 * Pronóstico de OpenWeatherMap («5 day / 3 hour forecast») para ?lat=&lon=: estado actual y
 * condiciones para aplicar. Responde el JSON de OpenWeatherMap tal cual (métrico, en español).
 * OpenWeatherMap lo renueva cada 3 h: se guarda 30 minutos (ver openweather.php).
 */
require __DIR__ . '/openweather.php';

owm_proxy('forecast', 30);
