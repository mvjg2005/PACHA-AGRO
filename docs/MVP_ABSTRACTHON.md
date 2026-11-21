# MVP de PACHA-AGRO para Abstracthon

> **Documento de alcance y validación.** Describe una primera versión demostrable y un piloto inicial, no la operación agrícola a escala nacional.

**Base revisada:** rama main del repositorio mvjg2005/PACHA-AGRO, 21 de noviembre de 2026.  
**Arquitectura:** ver [ARQUITECTURA.puml](ARQUITECTURA.puml).  
**Estado:** propuesta de alcance; los objetivos y umbrales de aceptación indicados como “propuestos” todavía deben validarse con usuarios y equipo técnico.

---

## 1. Decisión de producto

PACHA-AGRO debe demostrar que ayuda a un productor rural a obtener información climática de su zona, interpretar los principales riesgos para la siembra y comunicar incidencias relevantes a su comunidad, incluso cuando la conectividad es limitada.

La propuesta de valor del MVP es:

> **Una herramienta móvil de apoyo a decisiones agrícolas que combina clima localizado, orientación de siembra explicable y observaciones comunitarias, indicando siempre la fuente, antigüedad y limitaciones de los datos.**

No se plantea como una aplicación que predice cosechas ni como sustituto de un técnico agrónomo o de las alertas oficiales.

## 2. Problema y usuarios iniciales

### Problema

Los productores de comunidades rurales pueden tener dificultades para acceder a información meteorológica localizada, interpretar el riesgo de heladas u otros eventos y compartir información de campo con su comunidad. Una página meteorológica general no conoce necesariamente las condiciones de una parcela ni lo que sus vecinos están observando.

### Usuarios

1. **Productor/a:** consulta clima, responde el asistente de siembra y reporta incidencias.
2. **Representante de comunidad:** organiza reuniones, revisa solicitudes y modera observaciones.
3. **Administrador/a:** aprueba comunidades, administra usuarios y revisa reportes.

### Alcance geográfico y agrícola

- Comenzar con un piloto real de una comunidad del Altiplano, que debe seleccionarse con un aliado local y consentimiento de sus participantes.
- Priorizar **quinua en el Altiplano** porque es el escenario que el repositorio identifica como implemented para Oruro, Potosí y La Paz.
- Para una primera prueba de campo, elegir un solo municipio y una comunidad real. La “Comunidad Demo Challapata” y las cuentas demo del repositorio son ficticias: sirven para demostración técnica, no cuentan como validación con agricultores.

## 3. Recorrido principal del MVP

El recorrido que debe funcionar de principio a fin es:

1. El productor abre la aplicación desde un teléfono.
2. Indica su ubicación mediante GPS o selecciona departamento y municipio.
3. Consulta el pronóstico, el riesgo de helada y la información meteorológica disponible.
4. Responde las seis preguntas del asistente de siembra: departamento, municipio, cultivo, variedad, humedad del suelo y riego.
5. Recibe un resultado comprensible: estado, factor decisivo, acción principal, criterios, fuente y nivel de confianza.
6. Consulta los reportes de su comunidad o registra una helada, granizada, lluvia fuerte o sequía.
7. Un representante revisa las observaciones y el sistema conserva la distinción entre reporte comunitario, pronóstico y aviso oficial.

El proyecto ya documenta como objetivo que la consulta de siembra pueda completarse en menos de un minuto y en aproximadamente siete toques desde el inicio. Debe medirse en las pruebas con productores; no se debe asumir que ya está demostrado.

## 4. Alcance funcional

| Módulo | Decisión | Estado actual y trabajo necesario |
|---|---|---|
| Clima localizado | **Dentro** | Ya existe Open-Meteo para pronóstico, NASA POWER para historial/climatología, riesgos simples, caché y fallback con datos anteriores identificados. Probar disponibilidad, frescura, errores y ubicación GPS en el entorno del piloto. |
| Asistente de siembra | **Dentro** | Ya existe un flujo de seis preguntas y un motor determinista. Concentrar la primera versión en quinua del Altiplano y validar umbrales/calendarios con un agrónomo o técnico local. |
| Reportes comunitarios | **Dentro** | Ya existen reportes de helada, granizo, lluvia fuerte, sequía y otros eventos, con revisión. Comprobar autorización, trazabilidad y que solo observaciones confirmadas influyan en el cálculo de riesgo. |
| Comunidades | **Dentro, mínimo necesario** | Mantener aprobación de comunidades, membresías y rol de representante. No añadir más niveles de roles para el MVP. |
| Reuniones y asistencia | **Dentro, mínimo necesario** | Mantener convocatoria y respuestas Sí / No / Tal vez. Enlaces virtuales, calendario y otras mejoras pueden esperar. |
| Modo sin conexión | **Dentro, lectura** | La aplicación ya conserva recursos públicos y ciertos últimos datos. Mostrar claramente fecha y estado de caché. No prometer que los reportes se envían sin señal: la cola de envíos diferidos no está implementada. |
| Educación | **Dentro, como apoyo** | Reutilizar las lecciones existentes para explicar heladas, pronóstico y limitaciones. No ampliar el catálogo antes de validar comprensión. |
| Avisos regionales | **Dentro, lectura** | Reutilizar la segmentación existente. Mantenerlos diferenciados de alertas oficiales. |
| WhatsApp | **Fuera del camino crítico** | La interfaz y el backend tienen simulador, asistente y estructura de webhook; el README lo declara no conectado. Presentarlo como simulación hasta disponer de credenciales, plantillas aprobadas y pruebas reales de Meta. |
| SENAMHI | **Fuera del camino crítico** | No hay integración real de avisos oficiales. Mantener el enlace y explicar que no hay conexión; no mostrar alertas inventadas. |
| Nuevos cultivos | **Fuera del primer piloto** | Papa y maíz están en modo demostración; haba y cebada no tienen reglas. No presentarlos como recomendaciones validadas. |
| Quechua y aimara | **Fase posterior** | Requiere traducción y revisión de hablantes nativos; no basta con traducir cadenas automáticamente. |
| Machine learning | **Fuera** | No hay todavía datos reales de siembra y resultados por parcela suficientes para entrenar y evaluar un modelo defendible. Mantener el motor de reglas explicable. |

## 5. Reglas de confianza y seguridad del producto

Estas reglas son obligatorias para el MVP:

- **Fuente visible:** distinguir pronóstico, historial/climatología, dato ingresado por el productor, observación comunitaria, simulación y aviso de la plataforma.
- **Antigüedad visible:** mostrar cuándo se obtuvo el dato. Si se presenta caché antigua, marcarla claramente; si ya no es válida, comunicar que no hay datos actuales.
- **No inventar alertas:** SENAMHI no está integrado. Una observación comunitaria nunca se debe etiquetar como alerta oficial.
- **Sin recomendación cuando faltan criterios críticos:** si el motor no tiene reglas o datos suficientes, debe devolver “Información insuficiente” y explicar por qué.
- **Alcance honesto por cultivo:** mostrar “Demostración” o “Sin reglas” donde corresponda; el resultado no debe parecer una recomendación agronómica validada.
- **Revisión de observaciones:** los reportes sin revisar o descartados no deben aumentar el riesgo utilizado por el motor. El PR #7 abierto propone limitar esa influencia a observaciones confirmadas; verificar que ese cambio se integre y pase sus pruebas antes de usarlo como garantía.
- **Privacidad y consentimiento:** no recopilar ubicación GPS de forma persistente sin necesidad; mantener consentimiento explícito para WhatsApp y probar la eliminación de cuenta.

## 6. Requisitos no funcionales

1. **Mobile-first:** probar en teléfonos Android económicos, pantallas pequeñas y uso con una mano.
2. **Conectividad limitada:** respuestas comprensibles ante timeouts, modo caché visible y reintento manual.
3. **Lenguaje claro:** una pregunta por pantalla, botones amplios, vocabulario conocido por productores.
4. **Accesibilidad:** contraste suficiente, foco visible, estados que no dependan solo del color.
5. **Seguridad:** secretos fuera del repositorio, autenticación y autorización comprobadas en servidor, limitación de intentos y entorno de producción con PostgreSQL persistente.
6. **Mantenibilidad:** conservar React/Vite, FastAPI, SQLAlchemy y el motor de reglas actual; no migrar de stack para esta entrega.

## 7. Criterios de aceptación

El MVP se considera listo para un piloto controlado cuando se cumpla todo lo siguiente:

### Clima y ubicación
- [ ] El usuario puede usar GPS o seleccionar manualmente su municipio.
- [ ] Se muestra la fuente, hora de obtención y estado del pronóstico.
- [ ] Si falla el proveedor, el sistema identifica el dato guardado como antiguo o informa que no hay datos.
- [ ] La ubicación y la escala de los datos no se presentan con más precisión de la que realmente tienen.

### Orientación de siembra
- [ ] El flujo de seis preguntas funciona en el escenario priorizado de quinua en el Altiplano.
- [ ] El resultado muestra estado, factor decisivo, acción principal, criterios, confianza y fuentes.
- [ ] Las regiones/cultivos sin reglas no reciben una recomendación falsa.
- [ ] Un agrónomo o técnico documenta la revisión de calendarios, umbrales y textos antes del piloto real.
- [ ] El usuario entiende que la salida es orientación experimental y no una garantía de rendimiento.

### Comunidad y observaciones
- [ ] Un productor autenticado puede registrar un reporte.
- [ ] Un representante autorizado puede revisarlo y confirmarlo o descartarlo.
- [ ] Los permisos impiden que personas ajenas a la comunidad vean o modifiquen información privada.
- [ ] Solo observaciones confirmadas de comunidades aprobadas y usuarios activos pueden influir en el indicador de riesgo.
- [ ] El reporte se muestra como observación comunitaria, nunca como aviso oficial.

### Modo sin conexión y calidad
- [ ] La aplicación abre con recursos estáticos cacheados y muestra la fecha de los datos públicos disponibles.
- [ ] Las operaciones que requieren servidor muestran un mensaje claro cuando no hay conexión.
- [ ] Las pruebas unitarias, de API y de extremo a extremo pasan en CI sobre la rama que se pretende desplegar.
- [ ] El entorno piloto usa una base PostgreSQL duradera con respaldo, secretos de producción y health check correcto.

## 8. Validación con productores

Antes de afirmar impacto, realizar una prueba de usabilidad con **5 a 10 productores** de la comunidad piloto, además de un representante o promotor local.

Pedir que realicen estas tareas sin instrucciones paso a paso:

1. Encontrar el pronóstico y explicar si los datos son actuales.
2. Consultar la orientación de siembra de quinua.
3. Encontrar un reporte local y registrar una incidencia de prueba.
4. Explicar con sus propias palabras qué significa la recomendación y qué no garantiza.

Registrar por participante:

- si completa la tarea sin ayuda;
- tiempo y número de pasos;
- palabras o pantallas que generan confusión;
- si diferencia pronóstico, observación y aviso oficial;
- si considera que usaría la herramienta y en qué situación.

**Objetivos iniciales propuestos (no resultados existentes):**
- al menos 80 % completa cada tarea principal sin ayuda;
- la consulta de siembra se completa en menos de 60 segundos en el escenario priorizado;
- todas las personas de la prueba distinguen un pronóstico de una observación comunitaria;
- ningún reporte no confirmado modifica el indicador de riesgo.

Esta prueba valida comprensión y usabilidad iniciales. No permite afirmar que el sistema aumenta el rendimiento, reduce pérdidas o mejora ingresos agrícolas.

## 9. Plan de trabajo por fases

### Fase 0 — Estabilizar la base
- Mantener separado el PR #7 de auditoría integral.
- Ejecutar CI en la rama de auditoría y revisar fallos antes de integrar sus cambios.
- Confirmar que el main y la rama de trabajo para el MVP están sincronizados.
- No mezclar correcciones de seguridad con nuevas funcionalidades en un solo commit.

### Fase 1 — Validar el núcleo agrícola
- Elegir comunidad y municipio piloto reales.
- Obtener revisión agronómica de quinua y del calendario de la zona.
- Documentar versión de reglas, criterios, fuentes y responsable de validación.
- Añadir o ajustar pruebas de límites, ausencia de datos y escenarios de riesgo.

### Fase 2 — Cerrar el flujo de campo
- Comprobar GPS, clima, caché y comportamiento sin conexión.
- Asegurar que los reportes confirmados, y solo ellos, alimenten el riesgo.
- Probar registro, membresías, revisión y permisos de comunidad.
- Simplificar los puntos de fricción observados en móviles reales.

### Fase 3 — Piloto y despliegue
- Configurar PostgreSQL duradero, copias de seguridad y secretos.
- Definir responsable de datos y contacto para los participantes.
- Recoger consentimiento informado.
- Ejecutar la prueba con productores, registrar incidencias y publicar resultados honestos.

### Fase 4 — Evolución después del MVP
- Integración real de WhatsApp Cloud API.
- Más cultivos y regiones tras validación.
- Más municipios con coordenadas verificadas.
- Quechua y aimara con revisión lingüística.
- Mejoras de notificaciones, calendario de reuniones y biblioteca.
- Lectura por voz y panel personalizado “Mi campo hoy”.

## 10. Mejoras anteriores: qué queda en el backlog

Estas ideas son valiosas, pero no deben retrasar el núcleo del MVP:

| Mejora | Prioridad posterior |
|---|---|
| Panel “Mi campo hoy” con resumen de clima, alertas, reuniones y contenidos | Alta, después de validar el recorrido principal |
| Preferencias de notificación por categoría (clima, reuniones, avisos, educación) | Media |
| Búsqueda por texto y categoría en biblioteca | Media |
| Reuniones híbridas/virtuales, hora de finalización y exportación a calendario | Media |
| Lectura en voz alta y accesibilidad para baja alfabetización digital | Alta, requiere prueba con usuarios |
| Quechua y aimara | Alta para expansión territorial, con validación comunitaria |
| Mensajería WhatsApp real | Depende de Meta, consentimiento, plantillas y coste operativo |
| Fuente oficial SENAMHI | Depende de convenio, API o mecanismo oficial disponible |

La portada pública ya permite acceder a varias funciones sin una cuenta. Mantener esa entrada rápida es una ventaja: no introducir registro obligatorio antes de que el productor pueda consultar información básica.

## 11. Guion de demostración para Abstracthon

1. **Problema:** explicar las dificultades para conocer el riesgo climático local y obtener orientación de siembra.
2. **Clima:** seleccionar una ubicación y mostrar el pronóstico, el riesgo de helada, fuente y actualización.
3. **Siembra:** completar el flujo de quinua y explicar el factor decisivo, la acción y las limitaciones.
4. **Comunidad:** registrar una observación y mostrar el proceso de revisión.
5. **Conectividad:** demostrar qué información permanece disponible sin internet y su antigüedad.
6. **Impacto:** presentar lo observado en la prueba de productores, sin atribuir resultados que todavía no se midieron.

## 12. Indicadores que conviene reportar al jurado

- Productores que participaron en la prueba y comunidad/municipio donde se realizó.
- Porcentaje de tareas completadas sin ayuda y tiempo mediano por tarea.
- Número de reportes creados, confirmados y descartados durante el piloto.
- Disponibilidad del servicio y comportamiento cuando falla el proveedor meteorológico.
- Número de cultivos y regiones con reglas efectivamente validadas.
- Evidencia cualitativa: comentarios de productores y cambios realizados después de escucharlos.

No presentar número de cuentas demo, contenido simulado o resultados históricos de pruebas automatizadas como evidencia de adopción o impacto real.

---

## Referencias del repositorio

- [README y estado funcional](../README.md)
- [Arquitectura existente](ARQUITECTURA.md)
- [Reglas y limitaciones del motor de siembra](ALGORITMO.md)
- [Puesta en marcha con agricultores reales](PUESTA_EN_MARCHA.md)
- [Limitaciones conocidas](LIMITACIONES.md)
- [Fuentes meteorológicas](FUENTES_DATOS.md)
- [Integración WhatsApp](WHATSAPP.md)
- [Pruebas](PRUEBAS.md)
