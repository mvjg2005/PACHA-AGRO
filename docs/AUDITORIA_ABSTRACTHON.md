# Auditoría de PACHA-AGRO frente a Abstracthon

**Fecha de revisión:** 21 de noviembre de 2026  
**Rama de trabajo:** `audit/abstracthon-mvp`  
**Base revisada:** `main`  
**Alcance:** lectura del README, estructura, frontend React, API FastAPI, autenticación, módulos de clima/siembra/señas, pruebas y documentación de operación.

> Esta es una auditoría estática del repositorio. No se ejecutó el sistema ni se repitieron las suites en un entorno limpio, tampoco se auditó un despliegue público. Los resultados de pruebas que aparecen abajo son los que documenta el propio proyecto, no una certificación independiente.

## 1. Diagnóstico ejecutivo

PACHA-AGRO ya supera el tamaño de un MVP básico: tiene una plataforma completa con recomendaciones de siembra, clima, comunidades, aprendizaje, asesoría, herramientas de campo y un módulo diferencial de bioindicadores andinos.

**La mejor historia para el jurado no es enumerar todos los módulos.** Es demostrar un ciclo concreto:

1. La persona consulta condiciones de siembra para su municipio y cultivo.
2. La plataforma explica la recomendación con clima, historial, factores y fuentes.
3. La comunidad registra una seña local (por ejemplo, Qutu/Pléyades o leque leque).
4. Al terminar la campaña, el sistema compara esa lectura con lluvia y heladas estimadas por NASA POWER, mediante terciles históricos.
5. El Pachagrama reúne el calendario, los datos y las observaciones comunitarias.

Ese ciclo conecta innovación, funcionamiento técnico y utilidad comunitaria en una sola demostración.

### Evaluación orientativa según la rúbrica

La rúbrica asigna 40 puntos a Innovación, 30 a Viabilidad técnica y 30 a Impacto. El rango siguiente es una **autoevaluación argumentada**, no una nota oficial ni una predicción del jurado.

| Criterio | Rango orientativo | Evidencia observada | Qué limita una nota mayor |
|---|---:|---|---|
| **Innovación (40)** | **34–38** | Registro de señas andinas; consenso local; contraste con datos satelitales; clasificación por terciles; comparación explícita con el azar (1 de cada 3); Pachagrama de 52 semanas. | Debe explicarse con claridad qué aporta frente a una app meteorológica convencional y demostrarse el ciclo completo. La cantidad de registros todavía limita las conclusiones sobre aciertos. |
| **Viabilidad técnica (30)** | **23–26** | Frontend React/TypeScript; API FastAPI; persistencia SQLAlchemy con SQLite/PostgreSQL; caché meteorológica; modo sin conexión; controles de acceso; despliegue documentado. `docs/PRUEBAS.md` reporta 121 pruebas backend, 12 frontend y 33 E2E. | Los resultados de pruebas no se volvieron a ejecutar en esta auditoría. WhatsApp sigue en simulador, SENAMHI no está integrado, la recomendación agronómica completa se concentra en quinua del Altiplano, no hay Alembic y los límites de solicitudes están en memoria. |
| **Impacto (30)** | **17–22** | Público identificado: productoras y productores rurales de Bolivia; decisiones de siembra, clima, aprendizaje y organización; diseño para conectividad limitada y lectura sencilla. | El repositorio reconoce que no hubo piloto con agricultores, medición de comprensión, encuesta, ni métricas de impacto. Quechua y aimara aún requieren traducción y revisión comunitaria. |
| **Total orientativo (100)** | **74–86** | Producto desarrollado y diferenciador identificable. | La evidencia con usuarios reales es el principal factor que falta. |

**Lectura de la rúbrica:** innovación es la fortaleza principal; la viabilidad tiene una base técnica sólida, pero debe mostrarse sin confundir simuladores con integraciones reales; impacto es el apartado más vulnerable porque el beneficio todavía es potencial y no está medido en campo.

## 2. Correspondencia directa con los criterios del jurado

### 2.1 Innovación — 40 puntos

- **Originalidad:** el valor distintivo es convertir observaciones tradicionales en registros comparables por municipio y campaña, en vez de limitarse a publicar un catálogo de saberes.
- **Creatividad:** pone el conocimiento comunitario y la serie meteorológica en una misma vista y permite ver cuándo existe evidencia suficiente y cuándo no.
- **Diferenciación:** terciles históricos y referencia al azar ayudan a evitar presentar una coincidencia aislada como prueba de eficacia.
- **Tecnología con valor:** NASA POWER aporta la serie histórica; Open-Meteo aporta pronóstico; la aplicación organiza el registro, el cálculo y la visualización.

**Cómo defenderlo:** mostrar una seña registrada, el resultado de una campaña ya cerrada y el Pachagrama. Explicar que la plataforma no declara que una seña “predice” por sí sola: acumula datos y mide su correspondencia. No afirmar que la precisión ya está probada.

### 2.2 Viabilidad técnica — 30 puntos

- La arquitectura separa interfaz, API, datos y servicios externos.
- El sistema tiene cuentas, roles, comunidades, almacenamiento, manejo de errores, caché y modo sin conexión.
- El proyecto documenta pruebas unitarias, de API y de navegador.
- La orientación de siembra puede consultarse sin iniciar sesión; el registro comunitario requiere cuenta.

**Qué debe decirse sin exagerar:**

- WhatsApp es un simulador hasta configurar y verificar WhatsApp Business Cloud API.
- No se reciben alertas oficiales de SENAMHI desde la plataforma; se ofrece el enlace institucional.
- Las reglas agronómicas son experimentales y no sustituyen la validación de un ingeniero agrónomo.
- NASA POWER tiene resolución aproximada de decenas de kilómetros y no representa necesariamente el microclima de una parcela.
- El límite de intentos en memoria y la ausencia de migraciones Alembic son deuda técnica antes de operar a escala.

### 2.3 Impacto — 30 puntos

- **Problema relevante:** decisiones agrícolas condicionadas por clima variable, información dispersa y poca conectividad.
- **Público claro:** agricultores y comunidades del Altiplano, valles y llanos bolivianos.
- **Beneficio potencial:** reunir señales locales, clima, orientación explicable y coordinación comunitaria.
- **Impacto comunitario:** preservar observaciones y construir evidencia que la comunidad pueda revisar.

**Qué falta para demostrar impacto:** entrevistas, una prueba piloto consentida, observación de tareas reales y métricas antes/después. La intención de ayudar no equivale todavía a un resultado medido.

## 3. MVP recomendado para presentar

El MVP no necesita otra aplicación ni más módulos. **Ya existe en el repositorio.** Recomiendo recortar el alcance de la presentación y centrar la prueba en este flujo funcional:

### MVP: “Decisiones de siembra con clima y saber local”

**Usuario principal:** agricultora o agricultor de Challapata, Oruro.  
**Caso inicial:** quinua en el Altiplano.  
**Resultado principal:** entender las condiciones, conocer por qué se recomienda una acción y registrar una observación local que después pueda contrastarse con datos.

| Paso | Qué hace la persona | Qué debe demostrar PACHA-AGRO |
|---|---|---|
| 1. Elegir zona | Selecciona Oruro → Challapata → quinua. | Catálogo y flujo simples, sin obligar a crear cuenta para consultar. |
| 2. Consultar | Responde las preguntas del asistente de siembra. | Semáforo, acción principal, factores, explicación, fuente y etiqueta “Orientación experimental”. |
| 3. Revisar evidencia | Abre Clima y el historial. | Diferencia entre pronóstico, historial, caché y datos no disponibles; muestra fuentes. |
| 4. Registrar una seña | Entra con una cuenta y registra seña, lectura, fecha y municipio. | La observación se guarda y queda identificada como observación comunitaria, no como medición meteorológica. |
| 5. Medir una campaña | Consulta una campaña ya cerrada. | Resultado de lluvia/heladas por terciles, cantidad de años disponibles y comparación con la referencia de azar. |
| 6. Interpretar | Abre el Pachagrama. | Vista semanal que reúne lluvia, promedio histórico, heladas y observaciones. |

**No son parte del MVP que conviene demostrar en los cuatro minutos:** diagnóstico por fotografía con IA, todas las calculadoras, todas las pantallas administrativas y el simulador de WhatsApp. Son ampliaciones útiles, pero desvían la atención del aporte central.

### Criterios de aceptación del MVP

- [ ] Un visitante puede llegar a una recomendación de siembra sin registrarse.
- [ ] La recomendación muestra la acción antes del detalle, los factores y las fuentes.
- [ ] Se distinguen claramente datos reales, datos de demostración, observaciones comunitarias y estimaciones.
- [ ] Una consulta sin datos suficientes informa que no hay evidencia suficiente; no inventa una recomendación.
- [ ] Una campaña todavía abierta figura como pendiente, no como acierto o error.
- [ ] Los resultados de señas muestran cantidad de observaciones y advierten cuando la muestra es pequeña.
- [ ] El módulo deja claro que NASA POWER es una referencia satelital regional, no una estación instalada en la parcela.
- [ ] Las recomendaciones se presentan como experimentales hasta completar validación agronómica.

## 4. Guion sugerido para el jurado — 4 minutos

**0:00–0:35 | Problema y propuesta.** “Los agricultores combinan pronósticos, experiencia y señales de la naturaleza, pero esos saberes pocas veces quedan registrados y contrastados. PACHA-AGRO conecta esas observaciones con datos climáticos históricos.”

**0:35–1:25 | Decisión real.** Inicio → consulta de siembra → Oruro → Challapata → quinua. Mostrar la acción principal, el semáforo y la explicación. Señalar las fuentes y la etiqueta experimental.

**1:25–2:05 | Evidencia climática.** Abrir Clima y explicar qué viene de Open-Meteo y qué es historial NASA POWER. Mostrar el manejo de datos faltantes o caché si se presenta una interrupción.

**2:05–3:20 | Diferenciador.** Abrir Señas que se miden. Mostrar una campaña ya cerrada, la lectura comunitaria, la clasificación observada y la referencia de azar. Luego abrir el Pachagrama.

**3:20–4:00 | Impacto y honestidad.** Explicar a quién ayuda, qué se necesita para un piloto y qué todavía no está validado. Decir expresamente que WhatsApp es simulador y que no hay integración de alertas oficiales SENAMHI.

## 5. Evidencias que conviene preparar

| Evidencia | Para qué criterio | Preparación |
|---|---|---|
| Video de respaldo de 60–90 segundos del flujo siembra → señas → Pachagrama | Innovación y viabilidad | Grabarlo con datos visibles y etiquetas reales/DEMO. |
| Captura de una campaña cerrada y su serie histórica | Innovación | Incluir fuente, intervalo, terciles y número de años usados. |
| Registro de pruebas automatizadas | Viabilidad | Mostrar comandos y resultados de una ejecución limpia; no basta con una cifra escrita en README. |
| Validación de un profesional agrónomo | Viabilidad e impacto | Obtener revisión escrita de umbrales y calendario antes de recomendar uso real. |
| Prueba piloto con agricultores | Impacto | Registrar consentimiento, tareas completadas, dificultades y comentarios sin publicar datos personales. |
| Métricas de uso | Impacto | Medir tiempo para completar consulta, comprensión de la explicación, registros de señas y utilidad percibida. |

No presentar porcentajes de mejora, predicción o ahorro hasta obtener una medición que los respalde.

## 6. Hallazgos de auditoría y cambios aplicados

| Prioridad | Hallazgo | Acción |
|---|---|---|
| Alta | La política decía que las claves estaban “cifradas”, aunque el backend aplica hash PBKDF2-SHA256. | Corregir la explicación para que describa el mecanismo real. |
| Alta | La política no explicaba que, cuando se activa la IA, el texto de la consulta y la foto de diagnóstico se envían a Anthropic para procesarse. | Añadir aviso de tratamiento por proveedor externo y recomendación de no incluir datos personales innecesarios. |
| Media | La guía de limitaciones proponía crear una PWA con caché, aunque el repositorio ya incluye modo sin conexión. | Cambiar el pendiente por sincronización diferida de reportes cuando vuelva la conexión. |
| Alta | El cálculo de señas validaba la existencia de la fila diaria, pero no la disponibilidad del valor específico de precipitación o temperatura mínima. Algunos nulos podían contarse como ausencia de lluvia/helada. | Corregir `_metric` para validar cada variable, exigir al menos 90 % de valores válidos y estimar proporcionalmente solo los faltantes permitidos; añadir prueba de regresión. La prueba nueva aún no se ha ejecutado en este entorno. |
| Media | El runner E2E requería `playwright`, pero no existía dependencia declarada en un manifiesto de Node en la raíz. | Añadir manifiesto raíz con Playwright fijado y comando `test:e2e`; documentar instalación del navegador. |
| Media | El diferenciador y la estrategia de exposición al jurado estaban repartidos entre README y documentación técnica. | Añadir este documento y enlazarlo desde el README. |

## 7. Próximas mejoras priorizadas

### Antes de presentar
1. Ejecutar desde una instalación limpia backend, frontend y E2E; guardar evidencia de los resultados.
2. Ensayar el flujo principal en un celular y preparar video de respaldo por conectividad.
3. Evitar datos de prueba sin etiqueta. No mostrar contactos ficticios como técnicos reales.
4. Preparar una explicación de 30 segundos de terciles y azar (1/3), sin afirmar que ya existe precisión predictiva demostrada.

### Antes de un piloto real
1. Revisión de reglas y fichas por un ingeniero agrónomo y por productores locales.
2. Piloto pequeño y consentido con una comunidad; revisar lenguaje, accesibilidad y utilidad.
3. Definir responsable de datos, contacto de privacidad, retención y procedimiento de atención.
4. Incorporar migraciones de esquema con Alembic, copias de seguridad verificadas y límites distribuidos (por ejemplo, Redis) si se despliega con varias instancias.
5. Revisar almacenamiento del token de sesión, política CSP, dependencias y seguridad mediante pruebas específicas.
6. Integrar SENAMHI solo mediante un convenio o fuente oficial autorizada y conectar WhatsApp únicamente cuando la cuenta, plantillas y consentimiento estén comprobados.

## 8. Veredicto

**PACHA-AGRO tiene un diferenciador fuerte y un producto técnicamente amplio.** La oportunidad más clara para mejorar su evaluación no es agregar más pantallas: es demostrar el ciclo “decisión → observación → medición → aprendizaje” y respaldar el impacto con usuarios reales.

Para Abstracthon, presenta el MVP de Challapata con quinua, explica las limitaciones sin esconderlas y separa lo que ya está implementado de lo que depende de convenios, credenciales o validación en campo.
