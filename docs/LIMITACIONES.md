# Limitaciones conocidas y próximos pasos

> Varias limitaciones de la primera versión ya se resolvieron (caché persistente del clima, GPS, modo sin conexión, recuperación de clave, estado de chat en base de datos). Lo pendiente para operar con agricultores reales está en [PUESTA_EN_MARCHA.md](PUESTA_EN_MARCHA.md).

## Limitaciones

1. **WhatsApp es un simulador.** No se envía ni recibe ningún mensaje real hasta configurar la Cloud API oficial (ver WHATSAPP.md).
2. **SENAMHI no está integrado**: no se muestran alertas oficiales; solo un enlace.
3. **Reglas agronómicas experimentales**: solo quinua en el Altiplano tiene escenario completo; papa y maíz son demostración; haba y cebada no tienen reglas.
4. **Municipios**: 32 cargados. Con GPS el clima es del punto exacto, pero el calendario usa el municipio registrado más cercano.
5. **Resolución de datos**: NASA POWER (~50 km) y modelos globales no capturan microclimas de quebradas o laderas.
6. **Límite de Open-Meteo gratuito**: uso no comercial y ~10 000 llamadas/día por IP; un despliegue real necesita plan pagado, caché compartida o servidor propio.
7. **Límites de intentos en memoria**: se reinician con el servidor y no se comparten entre varios procesos (el estado del chat ya está en la base de datos).
8. **Sin migraciones de base de datos** (se usa `create_all`); para producción agregar Alembic.
9. **Recuperación de clave sin SMS**: la hace un administrador con una clave temporal tras verificar a la persona.
10. **Quechua y aimara**: estructura lista, contenido pendiente de traducción y revisión por hablantes.
11. **Modo sin conexión**: muestra lo último guardado; no permite enviar reportes sin señal (habría que guardarlos y enviarlos después).

## Próximos pasos sugeridos

- Convenio con SENAMHI para avisos oficiales y datos de estaciones.
- Validar umbrales y calendarios con técnicos de PROINPA/INIAF y productores; ampliar a papa y maíz.
- Conectar WhatsApp Cloud API con plantillas aprobadas y números de prueba.
- Ampliar la PWA: hoy cachea el pronóstico, pero no los mapas ni las respuestas con sesión iniciada.
- Sustituir la migración mínima por Alembic y el límite de peticiones en memoria por Redis; desplegar con HTTPS.
- Prueba piloto con una comunidad real, con consentimiento informado.
