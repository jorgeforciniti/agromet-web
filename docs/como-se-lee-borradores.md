# «¿Cómo se lee?»: borradores para revisión de la Sección

Textos agregados en noviembre de 2026 (G1 del informe de mejoras). Son borradores escritos a partir de lo que
calcula el código: la Sección los revisa y corrige. Cada vista tiene un bloque plegable «¿Cómo se lee?» bajo el
título o la descripción. Las dudas están al final de cada vista y también como comentario
`<!-- Pregunta para la Sección -->` en el HTML, junto al bloque.

Ya lo tenían de antes: Horas de frío y Sumas térmicas. Los de Condiciones para enfermedades y Meteorología
por estadíos fenológicos se ampliaron (ver el final).

**Actualización:** la Sección respondió las preguntas de las partes 1 a 4 y 6. Lo que se cambió y lo que
queda abierto está en la parte 7; las preguntas de las partes 1 a 4 y 6 quedan como registro. El Colmenar
(parte 5) se revisa más adelante.

---

## 1. Mapas (`/mapas`)

### Lluvias diarias — `map-rain`
- Cada punto es una estación automática habilitada de la red EEAOC, con la lluvia total registrada en el período elegido. Al tocar un punto se ven la lluvia total, la lluvia máxima y las horas con lluvia (los registros con lluvia por la duración de cada registro).
- Los colores no tienen cortes fijos: en cada consulta se reparten las estaciones con lluvia en clases según sus valores, del amarillo verdoso (menos lluvia) al azul oscuro (más lluvia). Por eso un mismo color puede indicar cantidades distintas en dos consultas; los límites de cada clase están en la leyenda. En gris, las estaciones con 0 mm.
- La última clase no tiene tope, para que un valor anómalo de una estación no estire la escala. El mapa muestra sólo los puntos de las estaciones: no estima la lluvia entre ellas.

Preguntas:
- ¿Qué es «Lluvia máxima» en el popup: el máximo de un registro, de una hora o de un día?
- ¿Cómo se define «rocío»? En el código es la clase entre 0 mm y el menor valor del mapa, y también una estación con lluvia total mayor que 0 sin registros con lluvia.
- En la vista «Hoy», ¿el período es desde las 0 h o las últimas 24 h?
- ¿Cómo devuelve `datos-alerta.php` una estación sin datos? Hoy cae en el gris de respaldo y se vería igual que 0 mm.

### Lluvias mensuales por campaña — `map-rain-monthly`
- Cada punto es una estación de la red pluviométrica de la EEAOC, con la lluvia acumulada entre el mes de inicio y el mes de fin elegidos (si el mes de fin es anterior al de inicio, corresponde al año siguiente). Los datos son totales mensuales.
- El color compara esa lluvia con la normal de los mismos meses (la suma de las normales mensuales del punto): los tonos rojo, naranja y amarillo indican menos lluvia que la normal, y los celestes y azul, igual o más; los cortes están en la leyenda. El número junto a cada punto es la lluvia del período en mm; al tocarlo se ven la normal y el desvío, y «Ver ficha» abre la serie histórica.
- Un punto con algún mes sin dato en el período, o sin normal, no se muestra, para no comparar un acumulado incompleto con la normal completa.

Preguntas:
- Si el período incluye el mes en curso, ¿`datos-campania.php` devuelve un acumulado parcial o el mes sin dato (-999,9)? Hoy un mes sin dato oculta el punto.
- ¿Los puntos son sólo pluviómetros o también estaciones automáticas cargadas en la red pluviométrica?

### Lluvia de los últimos 30, 60 y 90 días — `mapa-lluvia-acumulada`
- Cada punto es un pluviómetro de la red EEAOC con la lluvia acumulada en el período elegido. El color indica qué porcentaje de la normal de esas mismas fechas llovió: rojo, naranja y amarillo, menos que la normal; celeste y azul, igual o más. La normal de cada mes se reparte en partes iguales entre sus días, para que cubra exactamente las mismas fechas.
- Si a un pluviómetro le falta el dato de alguno de los meses completos del período, no se muestra en ese período. Al tocar un punto se ven la normal, el desvío, los otros dos períodos y «Ver ficha», con la serie histórica del pluviómetro.
- Si hay una estación automática a menos de 2 km, el popup muestra lo que midió en las mismas fechas. El borde punteado aparece cuando el pluviómetro suma al menos 10 mm y la automática midió menos del 70 % de ese valor.

Preguntas:
- ¿Es correcto repartir la normal mensual en partes iguales por día para comparar períodos que no son meses completos?
- ¿El dato del mes en curso (`datos-campania-mes-en-curso.php`) es provisorio y puede corregirse?
- La vista ya tenía al pie una nota que repite parte de este texto. ¿Se deja, se quita o se pasa todo al bloque?

### Temperaturas — `map-temperature`
- Cada punto es una estación de la red EEAOC con el valor de la variable elegida en el período: la temperatura mínima o máxima absoluta (el valor extremo del período) o una de las medias (mínima media, media o máxima media).
- El color sigue una escala fija, igual en todas las consultas, de −5 °C (azul) a 35 °C (rojo oscuro); los valores fuera de ese rango toman el color del extremo. Al tocar un punto se ven el valor y cuántos días del período tienen datos («Registros: X de N días»).
- Las estaciones sin dato de la variable no se muestran, y en las absolutas se descartan los valores fuera del rango de −25 a 50 °C. Una estación con pocos días con datos puede no representar todo el período. El mapa no estima valores entre estaciones.

Preguntas:
- ¿Cómo calcula `datos-temperatura.php` las medias: promedio de las mínimas o máximas diarias, o de todos los registros?
- ¿Con cuántos días faltantes una estación deja de ser representativa?
- El filtro de −25 a 50 °C sólo se aplica a las absolutas. ¿Hace falta uno para las medias?
- ¿Se muestran todas las estaciones o sólo las habilitadas? El cliente no filtra por `habilitada`.

### Heladas — `map-frost`
- Cada punto es una estación de la red EEAOC que registró al menos un día con helada en el período elegido. El color indica la temperatura mínima absoluta del período: amarillo, de 0 a −2 °C; naranja, de −2 a −4 °C; rojo, de −4 a −6 °C; bordó, menos de −6 °C.
- Al tocar un punto se ven las horas por debajo de 0, −2 y −4 °C y cuántos días del período tienen datos. La pestaña «Datos» resume lo mismo en una tabla, con la cantidad de días con helada.
- Las estaciones sin heladas en el período y las que no tienen datos no aparecen en el mapa: un lugar sin punto no significa necesariamente que no haya helado.

Preguntas:
- ¿Qué umbral y qué sensor (altura, abrigo) definen un día con helada en `datos-heladas.php`?
- ¿Las horas bajo 0, −2 y −4 °C se calculan como registros por la duración de cada registro?
- FPH y FUH, ¿son la fecha de la primera y de la última helada del período? Si es así, conviene explicarlo.

### Ficha de lluvia de una estación — `estacion-lluvia-dialog` (se abre con «Ver ficha»)
- Totales mensuales de la red pluviométrica de la EEAOC. «Por mes» muestra cada mes de la campaña consultada (barras; en naranja, el mes elegido; en celeste claro, el mes en curso, que es un acumulado parcial) frente a la normal (línea punteada), la mediana histórica y dos bandas: entre el 25 y el 75 % de los años y entre el mínimo y el máximo registrados.
- «Serie del mes» muestra el mismo mes en cada año de la serie, con sus estadísticas. «Por campaña» compara el total de 12 meses de cada campaña que empieza en el mismo mes; las campañas con algún mes sin dato quedan en gris y no entran en la comparación.
- Las estadísticas usan todos los años con dato de la serie, sin el mes en curso ni los posteriores; la normal corresponde al período indicado arriba, por eso la mediana y la normal pueden diferir. «Superó a X de N años» cuenta los años con menos lluvia que el valor consultado.

Pregunta:
- Las estadísticas (mediana, bandas, promedio) usan toda la serie y la normal usa el período de referencia. ¿Se prefiere calcularlas sobre el mismo período?

---

## 2. Datos y estadísticas (`/datos`)

### Datos en tiempo real — `datos-online`
- El mapa y la tabla muestran el último dato recibido de cada estación de la red de la EEAOC. Al elegir una estación, el gráfico muestra la variable seleccionada registro por registro (cada 15 o 30 minutos, según la estación), desde ayer hasta el último dato de hoy.
- En el mapa, el relleno indica el estado de comunicación: pleno si el último dato es de la última hora, tenue si hace más de 1 hora que no llegan datos y hueco con borde punteado si la estación no envió datos hoy. Al acercar el mapa, cada estación muestra el valor de la variable elegida.
- En el gráfico de temperatura, las líneas de 0 °C y −2 °C marcan los umbrales de helada. Los registros que no llegaron se ven como franjas grises y se informan debajo del gráfico.
- Las lecturas fuera del rango físico posible (por ejemplo, temperaturas menores a −25 °C o mayores a 55 °C) se toman como error del sensor y no se muestran. Son datos provisorios, sujetos a modificación.

Preguntas:
- La lluvia del día (tabla y mapa), ¿se acumula desde las 0 h o desde las 9 h? En el gráfico, ¿la barra de lluvia es la de cada registro o la acumulada?
- El aviso de faltantes dice siempre «registros de 15 minutos», aunque el código calcula el intervalo real. ¿Hay estaciones de 30 minutos y conviene ajustarlo?

### Datos meteorológicos por localidad — `weather-dashboard`
- Resume los datos de la estación elegida entre las dos fechas indicadas: extremos y medias de temperatura y humedad, horas por encima o por debajo de distintos umbrales, lluvia y viento y, si la estación tiene los sensores, radiación solar, evapotranspiración y humedad de hoja.
- En Gráficos, cada punto es un valor diario. La línea punteada del mismo color es la normal de la estación, cuando la tiene; la lluvia normal se muestra como promedio diario (la normal del mes dividida por sus días).
- Los días sin registro quedan como huecos con una franja gris y se enumeran debajo del gráfico. Los totales y conteos se calculan con los registros disponibles, así que con datos faltantes pueden quedar por debajo del valor real. La tabla muestra como máximo los últimos 31 días del período.

Preguntas (el resumen lo calcula el servidor):
- ¿Qué criterio usa para «Días con heladas» (¿mínima ≤ 0 °C?) y para «Días de lluvia» (¿qué umbral en mm?)? ¿Cómo cuenta las horas?
- ¿Con qué método se calcula la evapotranspiración? ¿Qué umbral define las horas de humedad de hoja? ¿El día pluviométrico va de 9 a 9 h?
- ¿Qué período de referencia tienen las normales que se grafican?

### Lluvias por campaña — `rain-campaign-dialog`
- Cada fila es una estación y cada columna, un mes de la campaña de 12 meses que empieza en el mes y año elegidos. Los valores son la lluvia mensual en milímetros.
- El color compara la lluvia de cada mes con su normal, el promedio de la estación para ese mes en el período de referencia (ambos aparecen al pasar el mouse sobre el valor). Las clases van desde un tercio o menos de lo normal hasta el doble o más, como indica la referencia.
- El mes en curso tiene un color propio porque su dato es parcial: es la lluvia acumulada hasta la fecha de la columna «Último registro». Mientras la campaña no termina, no se muestra el total.
- Un «—» indica que falta el dato de ese mes; en ese caso tampoco se calcula el total de la campaña. No se listan las estaciones sin ningún dato en la campaña.
- Al hacer clic en un valor mensual o en el total se abre la ficha de la estación, con su serie histórica.

Preguntas:
- **Los cortes de color del código no coinciden con la referencia.** El código usa < 33 %, < 66 %, < 99 %, ≤ 150 %, ≤ 200 % y > 200 %; la referencia dice ≤ 33, 34-66, 67-99, 100-149, 150-199 y ≥ 200 %. Un mes al 99,5 % o al 150 % cae en otra clase. ¿Cuáles son los cortes correctos?
- ¿De qué estaciones sale la tabla: sólo automáticas o también pluviómetros?
- ¿El valor mensual cuenta como dato si faltan algunos días del mes?
- Con una normal de 0 mm, cualquier lluvia queda en «≥ 200 %». ¿Está bien así?

### Condiciones para aplicación de agroquímicos — `conditions-to-apply`
- Evalúa, para cada registro del día elegido, si las condiciones medidas en la estación permitían aplicar con el método, la prioridad y el cultivo indicados. Cada botón «i» explica un criterio en detalle.
- El semáforo combina dos puntajes de riesgo, deriva y eficacia (más alto es peor), ponderados según la prioridad, y nunca es mejor que el peor criterio individual: viento medio, diferencia entre ráfaga y viento medio, ΔT, lluvia, inversión probable, Kp y, con dron o avión, satélites. Cualquier lluvia registrada pone la fila en rojo.
- La inversión no se mide: se estima como probable de noche (antes de las 7 o después de las 19 h) con viento menor a 5 km/h y humedad de 85 % o más. El producto y el tamaño de gota no cambian el semáforo: sólo agregan razones y recomendaciones al seleccionar una fila.
- El mapa muestra sólo las estaciones con datos de las últimas 2 horas, evaluadas con su último dato.

Preguntas:
- **El mapa y la tabla evalúan distinto.** El mapa usa la ráfaga como viento medio y no considera lluvia ni ráfagas; la tabla sí. ¿Es intencional?
- **Un dato faltante cuenta como 0.** Sin temperatura o humedad se evalúa con 0; sin viento medio, 0 km/h y rojo por viento bajo. ¿La fila debería quedar sin evaluar?
- El Kp es el último publicado por NOAA, también al consultar fechas pasadas. ¿Se aclara o se corrige?
- La noche para estimar inversión es fija todo el año (antes de las 7 o después de las 19 h). ¿Se aclara o se corrige?
- ¿Validan los umbrales de viento, ráfaga y ΔT por método (`spray-advisor.service.ts`, tabla `RULES`)?
- La columna dice «AT (°C)». ¿Debería decir «ΔT (°C)»?

### Comparar períodos entre años — `comparison-by-year`
- Se grafica la variable elegida en el período seleccionado y en las mismas fechas del año de comparación, para la misma estación: cada día se compara con el mismo día del otro año.
- En formato decádico (1–10, 11–20 y 21 a fin de mes) o mensual, la lluvia, la evapotranspiración y las horas de hoja mojada se suman; el resto se promedia. La humedad relativa es el promedio de la máxima y la mínima de cada día.
- La línea gris punteada es la normal mensual de la estación, cuando la tiene; en formato diario, la lluvia normal es la del mes repartida en partes iguales entre sus días. El resumen sobre el gráfico da la máxima, la mínima, el total o el promedio y la comparación con la normal (en % para las variables que se suman). En temperatura mínima se marcan 0 °C, −2 °C y 22 °C; en máxima, 35 °C.
- Los días sin dato quedan como hueco con una franja gris. Una década o un mes con días faltantes se calcula con los días que tienen dato y se ve más claro (barras) o con punto hueco (líneas): una suma incompleta puede quedar por debajo del valor real.

Preguntas:
- ¿De qué período (años) y de qué fuente son las normales de cada estación (`normales.php`)?
- (Del código) El 29 de febrero del período base queda sin dato si el año de comparación no es bisiesto.

### Comparar períodos entre localidades — `comparison-by-location`
- Se grafica la variable elegida para dos estaciones en las mismas fechas: la estación base y la de comparación, cada una con su color.
- (Segundo párrafo igual al de «entre años».)
- Las líneas punteadas son la normal mensual de cada estación, del color de su serie, cuando la estación la tiene; en formato diario, la lluvia normal es la del mes repartida en partes iguales entre sus días. El resumen sobre el gráfico da la máxima, la mínima, el total o el promedio y la comparación con la normal de la propia estación (en % para las variables que se suman). En temperatura mínima se marcan 0 °C, −2 °C y 22 °C; en máxima, 35 °C.
- (Cuarto párrafo igual al de «entre años».)

Preguntas:
- ¿De qué período y fuente son las normales? ¿Conviene advertir que dos estaciones pueden tener normales de períodos distintos?

### Estimador de rindes de soja — `soy-yield-dialog`
- Las vainas se cuentan en un metro lineal de surco, separadas según cuántas semillas tienen. Las semillas por metro son `V1 + 2·V2 + 3·V3 + 4·V4`.
- **Rinde base** (kg/ha) = semillas por metro × 19.200 × peso de mil semillas (g) / 1.000.000. El factor 19.200 es fijo en el modelo.
- **Corrección por humedad:** con más de 13,5 % se descuenta del rinde base `(humedad − 13,6) × 1,15 + 0,685` %; con menos, se suma `(13,4 − humedad) × 1,15 + 0,685` %. Con 13,5 % no hay corrección.
- El resultado vale para los metros contados: no considera pérdidas de cosecha ni variaciones dentro del lote.

Preguntas:
1. ¿Cuál es el origen del modelo (autor, año, publicación)? Se podría citar.
2. El factor 19.200 equivale a surcos a unos 0,52 m. ¿Es así? ¿Debería poder elegirse el distanciamiento?
3. La corrección por humedad salta de 0 (a 13,5 %) a 0,685 % (a 13,4 o 13,6 %). ¿Sale de la tabla de mermas comercial? ¿Es correcto sumar rinde con el mismo factor cuando el grano está más seco?
4. ¿El peso de mil semillas se carga a la humedad del grano o ya corregido? ¿El conteo es de un metro o el promedio de varios?

### Balance hidrológico seriado decádico — `water-balance-dialog`
- Es el balance hidrológico seriado de Pascale y Damario (1977). Para cada década (1–10, 11–20 y 21 a fin de mes) se suman la lluvia (P) y la EP de la estación. Si la lluvia cubre la EP, el sobrante se suma al almacenaje hasta la capacidad máxima de retención (CMR, 300 mm); lo que la supera es excedente. Si no la cubre, el almacenaje baja en forma exponencial: `Alm = Alm anterior × e^(−(EP − P) / CMR)`.
- La EP real es la lluvia más el agua que cede el suelo. En «Situación hídrica», las barras hacia abajo son déficit (EP real menor que la EP) y las barras hacia arriba, excedente. La EP relativa es EP real / EP en %: 100 % indica que no hubo déficit.
- Sin un almacenaje conocido, el cálculo arranca con 100 mm unas 18 décadas (seis meses) antes del período, para que ese valor inicial pese poco. Si se indica el almacenaje al inicio, arranca con ese valor en la primera década.
- Una década con días sin dato se calcula con los días que hay y se muestra más clara. Una década sin lluvia o sin EP corta el balance: desde ahí sólo se muestran lluvia y EP. La CMR es la misma para todos los sitios y no considera el tipo de suelo ni el cultivo.

- *(cita)* Pascale, A. J. y Damario, E. A. (1977). El balance hidrológico seriado y su utilización en estudios agroclimáticos. Revista de la Facultad de Agronomía de La Plata, 53(1-2): 15-34. Buenos Aires.

Preguntas:
1. ¿Con qué ecuación calcula cada estación la EP? ¿Es la ETo de Penman-Monteith FAO-56?
2. ¿De dónde sale la CMR de 300 mm, igual para todos los sitios?

---

## 3. Estado actual (`/estado-actual`)

### Alertas y avisos — `alert`
- Las alertas son las que publica el Servicio Meteorológico Nacional (SMN) para dos zonas: Provincia de Tucumán y Valles Calchaquíes. Sólo se muestran los niveles amarillo, naranja y rojo; hay una tarjeta por fenómeno y nivel, con el color de ese nivel.
- La grilla indica en qué día y en qué momento (madrugada, mañana, tarde o noche) rige la alerta en cada zona: las casillas coloreadas tienen alerta. «Qué hacer» abre las recomendaciones del SMN para ese nivel. La franja de temperaturas extremas también es del SMN y aparece desde el nivel amarillo.
- Los avisos de la red de estaciones EEAOC no son alertas del SMN: surgen de lo que midieron las estaciones. «Lluvia registrada» aparece cuando alguna estación registró lluvia. «Helada registrada» aparece cuando la mínima más baja de la red es de 0 °C o menos; el color indica si fue leve (entre 0 y −2 °C), moderada (entre −2 y −4 °C) o severa (−4 °C o menos). Cada botón abre el mapa con el detalle por estación.
- La hora de actualización es la del último informe del SMN. Ante cualquier diferencia, vale la publicación oficial en smn.gob.ar.

Preguntas:
- ¿En qué período cuentan «Lluvia registrada» y «Helada registrada» (desde las 0 h, últimas 24 h)?
- ¿Qué criterio de lluvia se quiere? Hoy el aviso aparece si alguna estación tiene más de un registro con lluvia.
- ¿Conviene aclarar que no se muestran las alertas de corto plazo del SMN (sólo se consulta `tipo=1`)?

### Diálogo de alertas — `alert-dialog`
- Las alertas son las que publica el Servicio Meteorológico Nacional (SMN) para la Provincia de Tucumán y los Valles Calchaquíes, agrupadas por región.
- Cada fila indica la fecha y el momento del día (madrugada, mañana, tarde o noche) en que rige la alerta. Al abrirla se ve el nivel en la escala del SMN (3 = amarilla, 4 = naranja, 5 = roja) y la descripción del SMN. Sólo se incluyen los niveles amarillo, naranja y rojo.
- Ante cualquier diferencia, vale la publicación oficial en smn.gob.ar.

Pregunta:
- Este diálogo hoy no se abre desde ninguna parte (la llamada está comentada en `alert.component.ts`). ¿Se va a volver a usar o se da de baja?

### Datos actuales — `weather-forecast` (modo `realtime`)
- Muestra el último registro de la estación automática de la EEAOC elegida: temperatura del aire, lluvia acumulada del día, humedad relativa y viento (dirección y velocidad media, en km/h).
- «Última actualización» es la hora de ese registro y cuánto hace que llegó: en verde si es de la última hora, en naranja si está atrasado más de 1 hora y en gris si no hay datos de hoy. En esos dos últimos casos los valores no reflejan las condiciones actuales.
- Las lecturas de temperatura, lluvia o viento fuera de rango físico (errores del sensor) no se muestran. El ícono del cielo junto al nombre no lo mide la estación: viene de OpenWeatherMap; la salida y la puesta del sol, de sunrise-sunset.org.
- Los datos se cargan al abrir la página; para verlos actualizados hay que recargarla.

Preguntas:
- ¿Desde qué hora se acumula la lluvia del día (0 h, 9 h)?
- ¿La velocidad del viento es el promedio de qué intervalo?
- ¿Todas las estaciones transmiten cada 15 o 30 minutos?

### Pronóstico — `weather-forecast` (modo `forecast`)
- Es el pronóstico de OpenWeatherMap, un proveedor externo, calculado para la ubicación de la estación elegida. No lo elabora la EEAOC ni lo mide la estación.
- Cada día muestra la máxima y la mínima pronosticadas, una barra que ubica ese rango dentro del de toda la semana y la mayor probabilidad de lluvia del día. Al elegir un día se ve el detalle cada 3 horas: cielo, temperatura, probabilidad de lluvia (no la cantidad) y viento en km/h.
- El gráfico muestra la temperatura pronosticada del día elegido, con referencias en 0 °C (helada) y −2 °C. El sombreado azul marca la noche, el tono cálido el alba y el ocaso, y el arco punteado el recorrido del sol (horarios de sunrise-sunset.org).
- Si en las próximas 48 h alguna mínima pronosticada es de 3 °C o menos aparece «Posible helada» (puede helar a nivel del suelo); con 0 °C o menos, «Helada pronosticada». Es temperatura del aire en abrigo según el pronóstico, y puede diferir de lo que registren las estaciones.

Preguntas:
- ¿Cada cuánto se renueva el pronóstico en el servidor (`forecast.php`)?
- ¿Qué modelo usa OpenWeatherMap para esta zona y conviene nombrarlo?

### Visor de imágenes satelitales — `leaflet-goes-viewer`
- Las capas Precipitación, Nubosidad, Temperatura de la superficie y Vientos son mapas de OpenWeatherMap, un proveedor externo; no son mediciones de la EEAOC. Incendios muestra los focos de calor que detecta el sensor VIIRS del satélite NOAA-21, publicados por NASA FIRMS.
- Cada capa tiene su referencia de colores abajo a la derecha: precipitación en mm, temperatura en °C y viento en m/s. La nubosidad se ve en grises. Las capas se dibujan con más contraste para que se distingan sobre el mapa base, así que los tonos pueden no coincidir exactamente con la referencia.
- En Incendios, cada punto es un foco detectado en el día (fecha UTC). El color y el tamaño dependen de la temperatura de brillo: verde hasta 45 °C, amarillo de 45 a 65 °C, naranja de 65 a 85 °C y rojo por encima de 85 °C. Las detecciones de confianza baja no se muestran.
- Los marcadores rojos son las estaciones EEAOC (en azul, la seleccionada): se atenúan si el último dato tiene más de 1 hora y pasan a gris si no hay datos de hoy. La fecha bajo el mapa es la del día de consulta, no la hora exacta de la imagen.

Preguntas:
- **Ninguna capa es GOES.** ¿Se mantiene el título «Visor de Imágenes Satelitales»?
- ¿Cada cuánto se actualizan las capas de OpenWeatherMap? ¿Son análisis o pronóstico?
- La referencia de viento está en m/s y el resto del sitio usa km/h. ¿Se unifica?
- ¿Conviene aclarar que un foco de calor no siempre es un incendio?

---

## 4. Red de estaciones (`/estaciones`)
- La lista y el mapa muestran las estaciones automáticas habilitadas de la red EEAOC con su último dato: temperatura del aire (°C), humedad relativa (%), lluvia de hoy (mm) y hora de la última medición. Si el último dato no es de hoy, en lugar de la hora figura la fecha (día/mes).
- Marcadores del mapa: rojo, estación al día (dato de la última hora); rojo atenuado, atrasada (más de 1 h sin datos); gris, sin datos hoy. En azul, la estación seleccionada, y en dorado, las favoritas. La referencia «Último dato» del mapa repite estos estados.
- Al ordenar por temperatura, humedad o lluvia, las estaciones que no reportaron hoy quedan al final: su último valor es viejo y no se compara con los actuales. Las lecturas fuera de rango físico (errores del sensor) se muestran como «—».
- «Reportando hoy» cuenta las estaciones con al menos un dato del día. Los datos se cargan al abrir la página; para actualizarlos hay que recargarla.

Preguntas:
- ¿Desde qué hora se acumula la «lluvia de hoy» (0 h, 9 h)?
- ¿Las zonas 3 y 4 son las dos «Valles Intermontanos»? En `ZONA_LABELS` figuran así.

---

## 5. El Colmenar (`/estadisticas-historicas`)

Los textos no repiten el glosario de la «?» de cada término; remiten a él.

### Resumen
- Las tarjetas resumen el año elegido en El Colmenar. La precipitación es la suma de los meses completos; las temperaturas máxima y mínima y la amplitud térmica son el promedio de las medias mensuales validadas. Si el año no tiene los 12 meses, la etiqueta indica qué meses se usaron y la comparación con la normal 1991–2020 se hace con esos mismos meses.
- Las temperaturas absolutas son el valor más alto y el más bajo registrados en el año, incluidos los días de meses incompletos; mientras el año esté en curso o incompleto son provisorias. La completitud indica los días con registro y los meses completos de cada variable.
- En «Días con temperaturas extremas», cada tarjeta cuenta los días que igualaron o superaron el umbral. El color y los símbolos ▲/▼ ubican ese conteo frente a 1991–2020 y sólo aparecen con el año completo para la variable; si no, se compara la suma de los meses completos con su normal. Cada «?» explica el término.

Preguntas: ¿qué criterio usa el servicio para validar un mes (cuántos días faltantes admite)? Las medias anuales son el promedio simple de las mensuales, sin ponderar por días: ¿es correcto?

### Precipitaciones
- Cada barra es la lluvia de un mes. Los meses completos se colorean según su clasificación percentilar, de naranja (más seco) a azul (más lluvioso); la franja de debajo repite la clase con los símbolos ▼/●/▲. La barra rayada es el acumulado de los días informados de un mes incompleto: no se clasifica ni se suma al total. La línea punteada es la normal mensual 1991–2020.
- La tabla agrega, para cada mes, la diferencia con la normal, el acumulado del año y los cortes de percentiles del mismo mes en 1991–2020. El acumulado se interrumpe en el primer mes incompleto. Un mes «A verificar» tiene días pendientes de control, que no se toman como secos.
- La tabla de récords compara cada mes completo con el mayor valor de ese mes en los años anteriores de la serie. Cada «?» explica el término.

Preguntas: ¿qué criterio usa `clasificacion_lluvias.php` para dar un mes por completo? ¿Con cuántos años de 1991–2020 se calculan los percentiles? Un valor justo en un corte (p. ej. P40), ¿en qué clase queda?

### Temperaturas
- La línea muestra, mes a mes, la media de la temperatura máxima, de la mínima o de la amplitud térmica (según el botón elegido) frente a la normal 1991–2020, en línea punteada gris. Sólo se unen los meses validados; un mes incompleto aparece como rombo hueco con la media de los días registrados, como referencia.
- Las barras de anomalía muestran la diferencia de cada mes completo con su normal: rojo, más cálido, y azul, más frío. En la amplitud, violeta indica más diferencia entre máxima y mínima que lo normal, y verde, menos.
- La tabla reúne los tres indicadores, los extremos absolutos de cada mes y los días con dato válido de máxima y de mínima. Entre paréntesis, la media parcial de un mes incompleto, sin anomalía.

Pregunta: ¿cuántos días faltantes admite `mensuales.php` para validar la media mensual?

### Extremos térmicos
- Las tarjetas cuentan los días del año en que la temperatura máxima igualó o superó 30 y 35 °C, y la mínima, 20 y 22 °C. Con el año completo para la variable, el conteo se clasifica frente a 1991–2020: la regla de colores, de azul (menos días) a rojo (más días), marca los cortes P10 a P90 en días y la marca negra indica dónde cae el año.
- Con el año incompleto no hay clasificación anual: se comparan sólo los meses completos con la normal de esos mismos meses.
- El gráfico mensual muestra el indicador elegido con los botones: barras llenas en los meses completos, rayadas en el conteo parcial de un mes incompleto y la normal mensual en línea punteada. La anomalía va en rojo (más días que lo normal) o azul (menos). Cada «?» explica el término.

Preguntas: ¿cómo cuenta `extremos_termicos.php` un día sin dato? ¿Con cuántos años completos se calculan los percentiles y las normales en días?

### Extremos hídricos
- Para cada año del período elegido se toma la mayor lluvia caída en 1 día, o en 2 a 5 días consecutivos según el botón. Con esos máximos anuales se ajusta una distribución de Gumbel que estima la lluvia esperable para 2, 5, 10, 25, 50 y 100 años de retorno, con su intervalo de confianza del 80 %. Sólo entran los años con lluvia válida todos los días, y se necesitan al menos 5.
- En la curva, cada punto es un máximo anual ubicado según su frecuencia empírica; la línea es el ajuste y la banda, el intervalo. La tarjeta del año elegido muestra su máximo y el período de retorno que le asigna ese ajuste; con el año incompleto es provisorio.
- La tabla por mes repite el ajuste con los máximos (o los totales) de cada mes; los eventos de varios días se asignan al mes de su día central. Debajo, un gráfico cuenta en qué mes cayó la máxima diaria de cada año y otro relaciona la lluvia de octubre a marzo con la suma de las máximas diarias de esos meses. Cada «?» explica el término.

Preguntas: ¿es correcto tomar como válido el día con `estado_pp` 0, 1 o 2? ¿Alcanza un mínimo de 5 años completos para el ajuste?

### Días con lluvia
- Cada día se asigna a una clase según la lluvia registrada. Las barras apiladas muestran cuántos días de cada clase tuvo cada mes, y la línea punteada, el promedio de días con lluvia (0,1 mm o más) del mismo mes en 1991–2020. Un mes incompleto se ve con colores atenuados y cuenta sólo los días con dato.
- La normal de cada clase se calcula con los registros diarios de El Colmenar: es el promedio de días de esa clase en los meses de 1991–2020 con dato todos los días. Las tarjetas y el gráfico por clase suman sólo los meses completos del año y los comparan con la normal de esos mismos meses. La «?» explica las clases y la traza.

Pregunta: esta normal sale de los registros diarios; la de «Evolución → Días con lluvia» sale de `mensuales.php`. ¿Deben coincidir?

### Episodios cálidos
- Los episodios los detecta el servicio de El Colmenar con el criterio indicado arriba, y cada uno se asigna al año en que empieza. El gráfico cuenta los episodios de cada año del rango consultado (hasta 20 años por consulta); un año sin barra no tiene episodios registrados.
- La tabla anual resume, para los años con al menos un episodio, la cantidad, los días en episodios y la duración máxima y media. En el detalle, cada fila es un episodio, con sus excedentes de Tmax y de Tmin. La «?» explica el criterio de episodio cálido y el excedente.

Preguntas: un año sin datos se grafica igual que un año sin episodios; ¿cómo trata `episodios.php` los días sin dato? «Intensidad Tmax/Tmin acum.», ¿es la suma de los excedentes? «Mayor excedente», ¿es el del día más extremo?

### Evolución térmica e hídrica
- Cada punto o barra es un año: el valor del mes elegido o, en «Anual», el promedio de los 12 meses (temperaturas) o su suma (precipitación y días con lluvia). El valor anual sólo se calcula con los 12 meses validados; los años sin valor válido quedan como hueco y se listan debajo de las franjas.
- La línea punteada gris es la normal 1991–2020 y la negra, la tendencia lineal por mínimos cuadrados con los años válidos (al menos 5), expresada por década. Es indicativa: no incluye prueba de significancia. La normal de días con lluvia se calcula con los meses completos de 1991–2020 de la serie de El Colmenar.
- Las franjas pintan cada año según su anomalía. El color llega al tono más intenso a partir de 2,5 desvíos estándar de las anomalías del período mostrado, por lo que la escala cambia con el período y la variable.

Preguntas: el valor anual de temperatura es el promedio simple de las 12 medias; ¿es correcto? ¿Conviene informar la significancia de la tendencia?

### Comparar años
- El gráfico superpone, mes a mes, el año elegido en la página (A) y el año de comparación (B), con la normal 1991–2020 en línea punteada. Sólo se grafican los meses completos de cada año; los incompletos figuran en la tabla con su valor parcial entre paréntesis.
- La diferencia es A menos B y sólo se calcula si el mes está completo en los dos años. Si alguno no tiene los 12 meses, el pie de la tabla suma (o promedia, en temperaturas) sólo los meses comparables, junto con la normal de esos mismos meses; el total o promedio anual aparece sólo con el año completo.

Pregunta: para los días con temperaturas extremas, la normal mensual sale de `normales_1991_2020` de `extremos_termicos.php`. ¿Es la frecuencia media de días por mes en 1991–2020?

---

## 6. Textos ampliados (`/datos`)

### Meteorología por estadíos fenológicos — `phenology-weather-dialog`
- Cada etapa va de un hito al siguiente: empieza el día del hito y termina el día anterior al hito que sigue. Al cambiar la fecha de referencia (siembra o emergencia), las demás se sugieren con la duración típica del cultivo y se pueden corregir a mano.
- Para cada etapa se suman la lluvia, la ETo y las horas de hoja mojada de la estación, y se promedian la radiación solar y las temperaturas máxima y mínima. También se cuentan los días con máxima de 35 °C o más y con mínima de 0 °C o menos.
- La demanda hídrica es la ETo de cada día multiplicada por el Kc de la etapa; los Kc propuestos son valores de referencia y se pueden cambiar. Sin «Aplicar Kc», la demanda es la ETo. El balance simple es lluvia menos demanda: no considera el agua del suelo, el escurrimiento ni la lluvia que no infiltra (para eso está el balance hidrológico seriado).
- En el gráfico por etapa, las líneas punteadas son la lluvia y la demanda normales de la estación en las mismas fechas. Los días sin datos se marcan en gris y los totales afectados llevan «≥». Si la estación tiene normales, «Completar con la normal» llena la lluvia y la ETo que faltan con la normal diaria de ese mes; esos tramos se dibujan punteados.

Preguntas:
1. ¿De dónde salen los Kc por defecto (soja 0,35 / 0,75 / 1,12 / 1,2 / 0,75; maíz 0,35 / 0,6 / 1,15 / 0,7; caña 0,35 / 0,55 / 0,75 / 1,1 / 0,65) y las duraciones de los hitos sugeridos (soja: R1 a 45 días de la siembra, R5 a 80, R6 a 95, cosecha a 135; maíz: período crítico a 55, madurez a 120, cosecha a 150; caña: brotación a 30 días de la emergencia, macollaje a 60, gran crecimiento a 120, maduración a 240, cosecha a 320)? Se podrían citar.
2. ¿Con qué ecuación calcula la estación la ETo?
3. Un día con ET 0 y radiación 0 se toma como falla del sensor. ¿Es correcto?

### Condiciones para enfermedades — `disease-conditions-dialog`
- *(primer párrafo: el resumen de la enfermedad elegida, que ya existía en el código)*
- Cada fila es un día calendario (de 0 a 24 h) de la estación elegida. Las horas se cuentan con los registros de ese día: cada registro que cumple la condición suma 15 minutos. «Hs mojado» son las horas con la hoja mojada: el sensor de humedad foliar informa de 0 (seca) a 15 (mojada) y se toma como mojada desde 10, criterio del proveedor de las estaciones. «Temp. mojado» es la temperatura media durante esas horas.
- La calificación aplica a esos valores los criterios de la enfermedad, aportados por la **Sección Fitopatología de la EEAOC**, que se ven al tocar la «i» junto a su nombre. El color de cada fila va del verde (bajo o no apto) al amarillo, el naranja, el rojo y el bordó (muy alto o condición positiva), y las tarjetas de arriba cuentan los días del período en cada clase.
- Indica si el tiempo fue favorable para la enfermedad, no si hubo infección: no tiene en cuenta la presencia del patógeno, la variedad ni el estado del cultivo. Las enfermedades que dependen del mojado de hoja sólo se habilitan en estaciones con ese sensor. Los días sin registros no aparecen en la tabla y, si faltan registros, las horas pueden quedar por debajo de las reales.

Respondido por la Sección:
- Los criterios de cada enfermedad los aporta la Sección Fitopatología de la EEAOC.
- La hoja se toma como mojada con `hum_hoja >= 10` (criterio de Mercobras, proveedor de las estaciones; confirmado por la Sección). El código mezclaba `> 10`, `>= 10` y `> 9` según la regla; ahora todas usan `>= 10`.
- Sobre bibliografía del umbral: el sensor es el Davis 6420 (escala 0 = seca a 15 = mojada). Davis indica que el umbral lo elige el usuario y no recomienda un valor; no se encontró un trabajo que valide un corte sobre esa escala. El Climate Office de Carolina del Norte (NC State) reportó que fijar el umbral fue difícil y trabajó con lecturas crudas, no con la escala 0–15.

Pregunta pendiente:
- Un día sin registros no aparece en la tabla y un dato faltante dentro del día se toma como 0. ¿Conviene marcar los días incompletos?

---

## 7. Respuestas de la Sección: qué se hizo y qué queda

### Hecho en el sitio

- **Lluvias diarias:** botón «De 9 a 9 h» y estaciones con registros incompletos marcadas, con
  `lluvia-periodo.php` (instalado y probado: usa el índice `Fecha`, hasta 31 días, corta a los 15 s).
  «Hoy» es desde las 0 h y se dice en pantalla. Menos de 0,3 mm es una clase fija,
  «lluvia < 0,3 mm o rocío». Estación sin datos: punto hueco, distinto de 0 mm. En «Hoy», estación que no
  transmite hace más de 1 h: punto pálido (total posiblemente incompleto).
- **Lluvias mensuales:** sólo meses completos (hasta el mes pasado). Pluviómetros y automáticas validados.
- **Lluvia acumulada:** normal mensual repartida por días y mes en curso provisorio, dentro del «¿Cómo se lee?»
  (se quitó la nota al pie).
- **Cortes de % de la normal unificados** en Lluvias por campaña, Lluvias mensuales y Lluvia acumulada:
  < 33, 33 a < 66, 66 a < 100, 100 a < 150, 150 a < 200 y ≥ 200 %. Con normal 0 la celda queda sin color.
- **Temperaturas:** `datos-temperatura.php` (instalado) descarta los valores diarios fuera de −25 a 50 °C antes de
  promediar y el mapa marca incompletas según los días válidos de cada variable; filtro de −25 a 50 °C también en las medias; estaciones con días faltantes con borde
  punteado; se muestran todas las que tienen datos.
- **Heladas:** 1,5 m en abrigo (OMM), 0,25 h por registro, FPH y FUH explicadas.
- **Ficha de lluvia:** se explica que la normal usa el período de referencia y las estadísticas, la serie.
- **Datos en tiempo real:** lluvia desde las 0 h; el aviso de faltantes usa el intervalo real de la estación.
- **Datos por localidad:** heladas (mínima ≤ 0 °C), día pluviométrico de 9 a 9 h, ETo de Davis.
- **ETo** (en todas las vistas que la usan): la calcula la consola Davis Vantage Pro2 con la ecuación de
  Penman modificada que implementa CIMIS (Pruitt y Doorenbos, 1977), cada hora; el diario es la suma.
- **Normales:** `normales.php` devuelve el período de referencia si la tabla lo tiene, y el sitio lo muestra
  debajo de los gráficos (Datos por localidad y las dos comparaciones). Comparar localidades advierte que los
  períodos pueden ser distintos.
- **Condiciones para aplicar:** mapa y tabla con la misma evaluación, con la **ráfaga** como referencia de
  viento; dato faltante o fuera de rango → «Sin evaluar»; Kp del intervalo de 3 h de cada fila (NOAA, última
  semana; para fechas anteriores se usa el último y se avisa); noche según salida y puesta del sol de cada
  estación; columna «ΔT (°C)». Se corrigió además un error por el que la inversión nunca se calculaba en la tabla.
- **Umbrales de aplicación (aprobados por la Sección):** ΔT 2–8 verde, 8–10 y 1–2 amarillo, más de 10 o
  menos de 1 rojo (guía GRDC «Delta T»). Viento: piso de calma con el viento medio (< 3 km/h rojo) y techo
  con la ráfaga. Techos de ráfaga (verde / amarillo, rojo por encima): terrestre 20 / 25 km/h, avión 20 / 25,
  dron 16 / 20, manual y airblast 15 / 20. Amarillo por calma: viento medio 3–5 km/h en terrestre y dron,
  3–4 en avión. La inversión probable se estima con viento medio < 5 km/h, de noche y HR ≥ 85 %. Los techos
  de ráfaga son propuestas propias derivadas de las guías (que hablan de viento medio, y la ráfaga suele
  ser 1,5 a 2 veces mayor); se ajustan con la experiencia. Queda documentar a qué altura mide el viento cada
  estación (2 o 10 m).
- **Estimador de soja:** «Metodología aportada por la Sección Granos de la EEAOC».
- **Estado actual:** avisos de 0 a 24 h; «Lluvia registrada» sólo con algún registro > 0,3 mm. Se dio de baja
  `alert-dialog`. Visor renombrado «Visor de capas meteorológicas», viento en km/h, aclaración sobre focos de
  calor.
- **Red de estaciones:** lluvia de hoy desde las 0 h; zona 4 = «Valles de Altura» (también en Inicio y en la
  ficha de estación).
- **Fenología:** se agregó **Cítricos** (brotación → cuaje 60 d → crecimiento del fruto 120 d → maduración
  195 d → cosecha 240 d; Kc 0,70 / 0,68 / 0,65 / 0,68 / 0,70 de FAO-56, cuadro 12, cítricos sin cobertura,
  70 % de copa).
- **Kc de soja, maíz y caña:** ahora son los de FAO-56 (cuadro 12), y el texto lo dice. Cada etapa toma el
  valor inicial, medio o final; las de transición, el promedio entre los dos. Soja 0,40 / 0,78 / 1,15 / 1,15 /
  0,83; maíz 0,30 / 0,75 / 1,20 / 0,35; caña 0,40 / 0,40 / 0,83 / 1,25 / 1,00.
- **Hoja mojada:** confirmado `hum_hoja >= 10` en todas las reglas de Enfermedades.
- **Enfermedades:** días incompletos marcados (menos del 90 % de los registros esperados) y días sin registros
  como fila «Sin datos».

### Abierto con la Sección

- **«Lluvia máxima» del mapa de lluvias diarias:** se respondió «de un día». `datos-alerta.php` (en el repo,
  sin instalar) ahora devuelve también la máxima de un día de 0 a 24 h y su fecha; en períodos de más de un
  día el popup la muestra junto a la «Lluvia máxima en un registro». Falta revisar el `EXPLAIN` e instalarlo.
- **Horas de lluvia:** `registrosLluvia` cuenta sólo los registros > 0,3 mm, así que las horas quedan por
  debajo de las reales (los registros de 0,25 mm no suman).
- **«Días de lluvia» de Datos por localidad:** la consulta citada cuenta registros; ¿el resumen cuenta días con
  algún registro > 0,3 mm o días con lluvia diaria > 0,3 mm?
- **Heladas:** se supuso helada = 0 °C o menos; confirmar.
- **Duraciones de los hitos sugeridos** de soja, maíz y caña: sin fuente; ¿valores locales u otra referencia?
- **Cítricos:** validar etapas, fechas y Kc con la Sección Fruticultura/Citrus; ¿separar limón de naranja?
- **Estimador de soja:** factor 19.200, corrección por humedad, peso de mil semillas y conteo → Sección Granos.
- **CMR de 300 mm** del balance → Sección Suelos.

### Pendiente en el servidor (PHP que no están en el repositorio)

- `datos-alerta.php` (ahora en el repo): devuelve la lluvia máxima diaria. Falta revisar el `EXPLAIN` e instalarlo.
- `normales.php` (sí está en el repo): la tabla `normales` no tiene columnas de período. Hay que agregar
  `periodo_desde` y `periodo_hasta` y cargarlas por estación (ver `server/servicios/LEEME.md`); después,
  comprobar que la versión instalada devuelve `periodo`.
- Alertas de corto plazo del SMN: `smn-alerta-area.php` ignoraba `tipo` por un error (leía una variable
  inexistente y comparaba con `=`). Corregido en el repo (`server/servicios/pronosticos/`); falta instalarlo,
  ver la respuesta de `tipo=2` y sumar esos avisos a las tarjetas de Estado actual. Usa la API de prueba del SMN
  (`api-test.smn.gob.ar`).
- Kp histórico: `kp-gfz.php` (en el repo) es el proxy de GFZ, que no permite CORS. El sitio lo usa para fechas
  de más de una semana; si no está instalado, sigue con NOAA. Falta instalarlo y probarlo.
