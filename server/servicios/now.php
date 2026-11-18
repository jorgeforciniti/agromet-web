<?php
/*
 * Tiempo actual de OpenWeatherMap («Current weather») para ?lat=&lon=: estado actual (ícono y valores
 * estimados cuando la estación no los tiene). Responde el JSON de OpenWeatherMap tal cual (métrico,
 * en español). OpenWeatherMap lo renueva cada 10 minutos: se guarda 10 minutos (ver openweather.php).
 */
require __DIR__ . '/openweather.php';

owm_proxy('weather', 10);
