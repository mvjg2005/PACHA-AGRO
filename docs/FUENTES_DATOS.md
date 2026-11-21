# Fuentes de datos meteorológicos — evaluación

Verificado durante el desarrollo el 21-11-2026 desde el entorno de desarrollo.

| Fuente | Qué aporta | Acceso | Cobertura / resolución | Limitaciones | Uso en AgroBolivia |
|---|---|---|---|---|---|
| **Open-Meteo** (`api.open-meteo.com`) | Pronóstico 7 días: Tmín/Tmáx, lluvia, probabilidad, código de tiempo, humedad del suelo por modelo | Sin clave. Gratis para uso **no comercial** (~10 000 llamadas/día), licencia de datos CC BY 4.0. Uso comercial requiere plan pagado | Global, combina modelos (≈ 1–25 km según modelo) | El límite diario se aplica por IP: **durante el desarrollo la IP compartida devolvió "Daily API request limit exceeded"**, lo que sirvió para probar el respaldo. No pronostica granizo de forma fiable en Bolivia | Pronóstico principal. Caché 1 h por ubicación; errores en caché 5 min para no saturar |
| **MET Norway** (`api.met.no/weatherapi/locationforecast/2.0`) | Pronóstico de respaldo: Tmín/Tmáx, lluvia, viento y humedad por horas | Sin clave, gratuito para uso no comercial. Requiere identificar la app con un `User-Agent` propio; datos © MET Norway, CC BY 4.0 | Global, modelo europeo/global (~9 km en Europa; resolución menor en Sudamérica) | No entrega probabilidad de lluvia ni humedad del suelo; puede variar frente a los modelos de Open-Meteo | **Respaldo automático de Open-Meteo.** Si Open-Meteo falla o alcanza su límite por IP (frecuente en Render), la app usa MET Norway y lo indica en la pantalla de Clima. Caché 1 h |
| **NASA POWER** (`power.larc.nasa.gov`) | Días recientes (Tmín, Tmáx, lluvia, humedad superficial GWETTOP) y climatología mensual (días con helada, lluvia) | Sin clave, gratuito. Citar a NASA POWER | Global, reanálisis MERRA-2/GEOS ≈ 0.5° (~50 km) | Retraso de varios días (`-999` en días aún no publicados; comprobado). Celda grande: valores pueden diferir mucho de la parcela, sobre todo en terreno montañoso | Historial reciente, respaldo de riesgo de helada (climatología) y humedad cuando falta el pronóstico. Caché 6 h / 30 días |
| **SENAMHI Bolivia** (`senamhi.gob.bo`) | Avisos y alertas oficiales, estaciones nacionales | No se encontró una API pública documentada; los avisos se publican en el sitio y canales oficiales | Nacional, oficial | Requiere convenio o acceso a datos abiertos para integrar | **No integrado.** La app lo dice explícitamente y enlaza al sitio oficial. Nunca se generan "alertas oficiales" |

## Reglas que sigue el sistema

1. Cada bloque devuelto por `/api/weather` incluye `source`, `kind` (`pronostico`, `estimacion`, `climatologia`, `simulado`) y `fetched_at`.
2. Si Open-Meteo falla → se intenta MET Norway como respaldo. Si también falla, se muestra el error en español, se usa la climatología solo para un riesgo de helada *histórico* y la recomendación queda con confianza baja (máximo 🟡).
3. Si todas las fuentes fallan → riesgo "desconocido" y recomendación ⚪.
4. El modo **simulado** se activa solo cuando el usuario lo pide; nunca se mezcla con datos reales y se muestra con banda "DEMOSTRACIÓN".
5. Las coordenadas son aproximadas al centro urbano del municipio.

## Pruebas reproducibles

`backend/tests/fixtures/` contiene respuestas **reales** de NASA POWER para Oruro descargadas el 21-11-2026 y una respuesta de Open-Meteo con el **formato documentado** y valores sintéticos (porque la API estaba limitada ese día). Las pruebas no dependen de la red.

## Adaptador para una fuente oficial (contrato normalizado)

Adaptado de PACHAAGRO (`backend/app/services/weather/official.py`). No se inventa ningún endpoint: si una institución (por ejemplo, SENAMHI mediante un convenio) habilita un servicio, basta con que responda este contrato y configurar `OFFICIAL_WEATHER_URL` y, si aplica, `OFFICIAL_WEATHER_KEY` (se envía como `Authorization: Bearer`).

```
GET {OFFICIAL_WEATHER_URL}?lat=-17.97&lon=-67.11
{ "source": {"name": "...", "url": "https://...", "official": true},
  "updated_at": "2026-11-21T08:00:00-04:00",
  "current": {"temperature_c": 6.4, "weather_code": 2},
  "daily": [{"date": "2026-11-21", "temp_min_c": -1.2, "temp_max_c": 18.0,
             "precipitation_mm": 0.0, "precipitation_probability": 10, "weather_code": 2}] }
```

Orden: fuente oficial (si está configurada) → Open-Meteo → MET Norway → historial NASA POWER. Si la fuente oficial o Open-Meteo fallan, el error queda en `forecast.extra.fallback_from` y la pantalla de Clima indica que se está mostrando el pronóstico de respaldo. La pantalla muestra «Pronóstico de fuente oficial» solo cuando `official: true`. Probado con respuestas simuladas y con la API real de MET Norway; no se probó con un servicio oficial real.
