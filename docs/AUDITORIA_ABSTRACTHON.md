# Auditoría de PACHA-AGRO frente a los criterios del jurado

**Fecha de revisión:** 22 de noviembre de 2026
**Base revisada:** `main` (`3d1fea1`)
**Demo pública:** <https://agrobolivia.onrender.com>
**Alcance:** README, código, documentación, CI y despliegue público.
**Naturaleza:** autoevaluación argumentada. No es una nota oficial ni una predicción del jurado.

> Esta auditoría separa lo que el proyecto **demuestra** de lo que todavía **promete**. Las cifras de pruebas provienen de GitHub Actions; la suite E2E se revisó por su runner y no se certifica aquí una ejecución completa en un entorno limpio.

## 1. Veredicto ejecutivo

PACHA-AGRO ya no es solo una app de clima. Tiene un diferenciador claro —medir el acierto de las señas andinas contra datos satelitales— y lo conecta con decisiones concretas: siembra, riesgo de helada para el ganado, forraje, organización comunitaria y herramientas para el campo.

La mejor presentación no es recorrer todos los módulos. Es contar un ciclo:

1. Una familia criadora de ovejas en Huayñacagua enfrenta un invierno con pasto seco y riesgo de nevadas.
2. La app avisa qué noches son peligrosas y une ese riesgo con las señas de la comunidad.
3. La persona registra una seña o una pérdida; al cerrar la campaña, la plataforma compara esa lectura con lluvia y heladas medidas por satélite.
4. El Pachagrama y los reportes convierten esa evidencia en algo que la comunidad puede revisar y defender.

Ese es el aporte que conviene defender. La IA, las calculadoras y las parcelas amplían el producto, pero no sustituyen ese núcleo.

## 2. Evaluación orientativa

La rúbrica asigna **40 puntos a Innovación, 30 a Viabilidad técnica y 30 a Impacto**.

| Criterio | Rango orientativo | Fortaleza principal | Límite principal |
|---|---:|---|---|
| **Innovación (40)** | **35–38** | Señas andinas medidas con terciles y comparadas contra el azar; Pachagrama; alerta temprana de año seco y noches peligrosas para el ganado. | La muestra de señas todavía es pequeña y no permite afirmar capacidad predictiva. |
| **Viabilidad técnica (30)** | **25–28** | App desplegada, clima con respaldo, caché, roles, comunidades, pruebas y documentación. | WhatsApp sigue en simulador; reglas agronómicas completas solo para quinua; deuda de migraciones y límites distribuidos. |
| **Impacto (30)** | **21–25** | Problema real y documentado en Huayñacagua; herramientas para poca señal, SMS/radio y organización comunitaria. | No hay piloto, métricas de uso ni evaluación antes/después con agricultores. |
| **Total orientativo (100)** | **81–91** | Producto amplio, desplegado y con un diferenciador identificable. | La validación en campo y la evidencia de impacto son lo que más falta. |

## 3. Innovación — 40 puntos

### Lo que sí es original

- **Medir el saber local, no solo exhibirlo.** La app registra señas y las compara con lluvia y heladas satelitales por municipio y campaña.
- **Terciles y referencia al azar.** Una temporada se ubica frente a todas las temporadas desde 2001; por construcción, adivinar al azar acierta 1 de cada 3 veces. Eso evita presentar una coincidencia aislada como prueba.
- **Pachagrama digital.** Reúne semana a semana lluvia, promedio histórico, heladas, reportes y señas.
- **Conexión con un problema concreto.** La sección Ganado usa las señas como alerta temprana de año seco y el pronóstico para avisar noches peligrosas.
- **Herramientas para el contexto rural.** Modo sin conexión, boletín SMS/radio, lectura en voz alta y calculadoras con quintales y arrobas.

### Lo que no conviene exagerar

- No afirmar que las señas “predicen” el clima. La app **mide correspondencia**, no causalidad.
- No afirmar que la precisión ya está demostrada: faltan más campañas y registros.
- La IA por foto y el chat son complementos útiles, no el diferenciador central.
- “Hasta donde sabemos” es más defendible que “no existe otra herramienta”.

### Cómo defenderlo

Mostrar una campaña cerrada, la lectura de una seña, el resultado por terciles y la marca del azar. Luego abrir el Pachagrama y explicar qué puede y qué no puede concluirse con la muestra actual.

## 4. Viabilidad técnica — 30 puntos

### Fortalezas observadas

- **Stack coherente:** FastAPI + React/TypeScript, SQLite en desarrollo y PostgreSQL en producción.
- **Demo pública:** <https://agrobolivia.onrender.com>.
- **Clima con respaldo:** Open-Meteo como fuente principal y MET Norway cuando se agota el límite por IP; NASA POWER para historial y climatología.
- **Caché persistente** y último dato disponible con su hora.
- **Cuentas, roles, comunidades, aprobaciones, avisos y reportes** con controles de acceso.
- **CI:** GitHub Actions reporta **164 pruebas de backend** y **18 de frontend**; el runner E2E tiene **36 casos**.
- **Documentación operativa:** despliegue, fuentes, algoritmo, pruebas, límites y puesta en marcha.

### Deuda técnica y riesgos

- **WhatsApp sigue siendo simulador.** El webhook está preparado, pero no hay integración real con Meta.
- **Reglas agronómicas completas solo para quinua en el Altiplano.** Papa y maíz son demostración; haba y cebada no tienen reglas.
- **Sin validación por agrónomos.** Los umbrales y calendarios son experimentales.
- **Sin migraciones Alembic.** Se usa `create_all` y ajustes manuales de columnas.
- **Límites de intentos en memoria.** No se comparten entre procesos ni resisten reinicios.
- **E2E no está en CI.** Los 36 casos se ejecutan aparte; conviene automatizarlos.
- **MET Norway tiene resolución gruesa en los Andes.** El respaldo mantiene la app en pie, pero puede diferir de Open-Meteo y de la parcela.
- **Dependencia de servicios gratuitos.** Open-Meteo puede limitar por IP; conviene una clave pagada o un proveedor propio para uso real.

### Cómo defenderlo

Mostrar la demo funcionando, el aviso de respaldo cuando Open-Meteo falla, la API `/api/health`, una ejecución de pruebas y el despliegue en Render. Decir con claridad qué es simulador y qué está conectado de verdad.

## 5. Impacto — 30 puntos

### Problema y público

- **Problema real:** pérdida de ganado y gastos de forraje en inviernos secos; decisiones de siembra con clima variable; información dispersa y poca conectividad.
- **Público:** productoras, productores y familias criadoras del Altiplano, valles y llanos de Bolivia.
- **Beneficio potencial:** decidir cuándo sembrar, proteger crías, calcular forraje, organizarse en comunidad y conservar el saber local como evidencia.

### Evidencia que ya existe

- Caso documentado de Huayñacagua y de comunidades vecinas con pérdidas por nevadas.
- Serie satelital de inviernos en Challapata y detección de días compatibles con nevada.
- Señas registradas y tabla de aciertos por departamento.
- Herramientas pensadas para poca señal: modo sin conexión, SMS/radio y lectura en voz alta.
- Consulta de siembra y clima sin necesidad de registrarse.

### Lo que falta para demostrar impacto

- Un piloto consentido con una comunidad.
- Métricas antes/después: tiempo para decidir, comprensión de la recomendación, uso de forraje, pérdidas evitadas.
- Entrevistas y observación de tareas reales.
- Revisión lingüística de quechua y aimara.
- Validación agronómica y veterinaria de las recomendaciones.

Sin esas mediciones, el impacto es **potencial y bien argumentado**, no un resultado comprobado.

## 6. Riesgos que pueden bajar la nota

| Riesgo | Cómo mitigarlo en la presentación |
|---|---|
| Presentar muchos módulos y perder el hilo | Elegir un caso: Ganado + Señas, o Siembra + Clima. |
| Confundir simulador con integración real | Decir “WhatsApp simulador” y “SENAMHI no integrado” sin que pregunten. |
| Afirmar precisión predictiva de las señas | Explicar terciles, azar y tamaño de muestra. |
| Prometer impacto sin datos | Hablar de hipótesis, piloto y métricas pendientes. |
| Fallo de Open-Meteo en vivo | Mostrar el respaldo MET Norway y la fuente/licencia. |
| Fallo de internet | Usar la semana guardada y la hora de actualización. |
| Preguntas sobre IA | Aclarar que es opcional, que Groq tiene plan gratuito y que sin clave responde el motor local. |

## 7. Prioridades antes de presentar

1. **Elegir un solo hilo narrativo** y ensayarlo en 4 minutos.
2. **Grabar un video de respaldo de 60–90 segundos** con el flujo principal.
3. **Probar en un celular real** y en modo sin conexión.
4. **Verificar la demo** la mañana del evento: `/api/health`, clima, Señas y Ganado.
5. **Tener a mano los números reales:** 164 backend, 18 frontend, 36 casos E2E.
6. **No mostrar datos personales** ni contactos ficticios como si fueran reales.
7. **Preparar una frase honesta sobre límites:** reglas experimentales, sin piloto, WhatsApp simulado y SENAMHI sin integración.

## 8. Conclusión

PACHA-AGRO tiene una innovación defendible y una implementación amplia. Su mejor oportunidad no es agregar otra pantalla: es demostrar el ciclo **decisión → observación → medición → aprendizaje** y sostenerlo con evidencia.

Para el jurado, la presentación más fuerte es la que muestra menos módulos y más profundidad: un problema real, una decisión concreta, una seña medida contra el satélite y una comunidad que puede usar esa evidencia. La honestidad sobre lo que falta —piloto, validación agronómica, WhatsApp real y métricas— aumenta la credibilidad en lugar de reducirla.
