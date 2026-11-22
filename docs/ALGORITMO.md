# Algoritmo de recomendación de siembra

Código: `backend/app/services/recommendation/engine.py` · Configuración: `backend/app/data/crops.json` (versión `0.1-experimental`).

> ⚠️ Pesos y umbrales **experimentales**, elegidos a partir de literatura general para el prototipo. **No** son predicciones validadas científicamente. Deben revisarse con ingenieros agrónomos y técnicos locales (p. ej. PROINPA, INIAF, SENAMHI) antes de usarse como recomendación real.

## Separación de responsabilidades

```
Fuentes (Open-Meteo, NASA POWER, simulado) → weather.service → builder.weather_view()
                                                              → WeatherView (estructura neutral)
Respuestas del agricultor ───────────────────────────────────→ Answers
Observaciones comunitarias (BD) ─────────────────────────────→ conteo en WeatherView
crops.json (pesos, umbrales, calendarios) ───────────────────→ evaluate() → resultado explicable
```

`evaluate()` no accede a red ni base de datos: es determinista y fácil de probar (16 pruebas en `tests/test_engine.py`). Un futuro modelo de ML puede implementarse como otra función que reciba la misma `WeatherView` y `Answers`, y compararse con este motor en los mismos casos.

## Escenarios por cultivo y región

| Cultivo | Región | Estado |
|---|---|---|
| Quinua | Altiplano (Oruro, Potosí, La Paz) | `implemented`: datos meteorológicos reales + reglas documentadas (pendientes de validación) |
| Papa | Altiplano (La Paz, Oruro, Potosí), valles | `demo`: reglas preliminares, se muestra aviso |
| Maíz | Llanos y valles | `demo` |
| Haba, Cebada | Altiplano y valles | `demo` |
| Cultivo fuera de su región (p. ej. quinua en llanos, maíz en el Altiplano) | — | `no_rules`: no calcula; explica que el cultivo es poco común en la zona y ofrece con un toque los cultivos que sí tienen reglas allí |

El calendario se busca primero por departamento y, si no hay, por región (Altiplano, valles o llanos). Si tampoco existe, el criterio de época queda ⚪ y el resultado es "Información insuficiente".

## Criterios

| Criterio | Crítico | Peso | Regla (quinua) | Datos usados |
|---|---|---|---|---|
| Época de siembra | Sí | 0.25 | 🟢 ventana óptima · 🟡 ventana posible · 🔴 fuera · ⚪ sin calendario | Calendario regional orientativo |
| Riesgo de helada (7 d) | Sí | 0.25 | Tmín pronosticada ≤ −2 °C 🔴 · ≤ 0 °C 🟡 · si no 🟢. Sin pronóstico → 🟡 con días de helada históricos del mes | Open-Meteo / NASA POWER climatología |
| Humedad del suelo | Sí | 0.25 | Dato del agricultor prevalece (sí/poca/no, ajustado por riego). "No sé" → estimación de modelo (Open-Meteo m³/m³: ≥0.20 🟢, ≥0.12 🟡; NASA GWETTOP: ≥0.50 🟢, ≥0.30 🟡) | Agricultor / modelo |
| Lluvia próxima (7 d) | No | 0.10 | Día ≥ 25 mm 🟡 (encostrado); con riego 🟢; ≥10 mm 🟢; ≥3 mm 🟡; menos 🔴 (🟡 si hay humedad) | Open-Meteo |
| Tormentas y granizo | No | 0.05 | Reportes comunitarios de granizo (7 d) 🟡 · códigos WMO 95/96/99 🟡 · si no 🟢 | Comunidad / Open-Meteo |
| Temperatura para germinar | No | 0.10 | Media (Tmín+Tmáx)/2 ≥ 5 °C 🟢, si no 🟡. Sin pronóstico usa últimos días | Open-Meteo / NASA POWER |

Umbrales de papa y maíz en `crops.json` (modo demostración).

## Agregación

```
valor: verde=1, amarillo=0.5, rojo=0 (los ⚪ no puntúan)
puntaje = Σ(peso·valor) / Σ(peso de criterios con dato)
si algún criterio crítico es ⚪            → ⚪ Información insuficiente
si algún criterio crítico es 🔴            → 🔴 Condiciones desfavorables
si puntaje ≥ 0.80 y ningún crítico 🟡     → 🟢 Condiciones favorables
en otro caso                              → 🟡 Se recomienda precaución
```

Confianza: **baja** sin pronóstico o con datos simulados; **media** en escenarios demo; **media-alta** en escenario implementado con pronóstico. El puntaje se muestra solo en "Detalles técnicos" y se aclara que no es una probabilidad.

## Factor decisivo, acción principal y confianza

Además de los criterios, el motor devuelve campos pensados para la primera pantalla del celular:

| Campo | Qué es | Regla |
|---|---|---|
| `key_factor` | El criterio que más pesa en el resultado | **Insuficiente:** el criterio crítico sin datos. **Rojo/amarillo:** el más desfavorable (rojo > amarillo); a igual estado gana el crítico, luego el de mayor peso, luego el orden `key_factor_priority` de `crops.json` (helada, humedad, calendario, lluvia, temperatura, tormenta). Los criterios no críticos sin datos no deciden el resultado. **Verde:** el crítico de mayor peso (todos a favor). |
| `main_action` | Una sola acción en lenguaje sencillo | Tabla fija por criterio y estado (`_ACTION` en `engine.py`), con matices: helada sin pronóstico → "vuelva a consultar"; época temprana o tardía; lluvia fuerte. Verde → "Puede preparar la siembra…". |
| `missing_data` | Criterios sin datos | Se muestran como aviso "Faltan datos". |
| `confidence_explanation` | Qué significa la confianza | Dice por qué es baja/media/media-alta y aclara que **no es la probabilidad** de una buena cosecha. |

Estos campos no cambian el semáforo: solo explican el resultado que ya calculaba el motor.

## Modo simulado

La API conserva `mode: "simulado"` (datos deterministas por municipio y fecha, sin red) para pruebas automatizadas. La interfaz ya no lo ofrece: desde el PR #4 la consulta de siembra y el clima usan solo datos reales, y si falta el pronóstico se informa y se puede reintentar.

## Lo que el algoritmo NO hace

- No da fechas ni horas exactas de siembra.
- La variedad se registra pero aún no cambia el cálculo (se informa al usuario).
- El pronóstico de temperatura es a 2 m; la helada a ras del suelo puede ser más fuerte (se advierte en pantalla y en las lecciones).
- Las estimaciones de humedad por modelo cubren celdas de decenas de km.

## Referencias consultadas para los umbrales de quinua

- Jacobsen, S.-E., Mujica, A., Jensen, C. R. (2003). *The resistance of quinoa to adverse abiotic factors.* Food Reviews International 19(1-2).
- Bois, J. F. et al. (2006). *Response of some Andean cultivars of quinoa to temperature: effects on germination, phenology, growth and freezing.* European Journal of Agronomy 25(4).
- Publicaciones técnicas de FAO y PROINPA sobre quinua en Bolivia.

Los valores numéricos son una simplificación del equipo a partir de estas fuentes y requieren validación.

## Hacia machine learning

Requisitos antes de entrenar un modelo: (1) registros reales de siembra y emergencia por parcela con fecha, cultivo, variedad y resultado; (2) series meteorológicas alineadas; (3) un conjunto de evaluación separado por campaña y zona; (4) comparar contra este motor de reglas como línea base. Hasta tener esos datos, un modelo de ML no sería defendible.
