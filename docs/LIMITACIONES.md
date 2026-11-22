# Limitaciones conocidas y próximos pasos

> Varias limitaciones de la primera versión ya se resolvieron: caché persistente del clima, GPS, modo sin conexión, bienvenida, recuperación de clave y estado de chat en base de datos. La guía de operación con agricultores reales está en [PUESTA_EN_MARCHA.md](PUESTA_EN_MARCHA.md).

## Limitaciones actuales

1. **WhatsApp es un simulador** mientras no se configure la Cloud API oficial, sus plantillas aprobadas y credenciales (ver [WHATSAPP.md](WHATSAPP.md)).
2. **SENAMHI no está integrado como fuente automática**: no se reciben alertas oficiales dentro de la plataforma; se enlaza al sitio institucional.
3. **Reglas agronómicas experimentales**: el escenario completo de recomendación está concentrado en quinua del Altiplano; papa y maíz son demostración; haba y cebada no tienen reglas completas.
4. **Cobertura municipal limitada**: hay 32 municipios cargados. Con GPS el clima se consulta para el punto; el calendario usa el municipio registrado más cercano y avisa si está lejos.
5. **Resolución meteorológica regional**: NASA POWER (decenas de kilómetros) y los modelos globales no capturan necesariamente el microclima de quebradas, laderas o parcelas pequeñas.
6. **Proveedor meteorológico**: el plan gratuito de Open-Meteo tiene límites y condiciones de uso. Un despliegue real debe revisar el volumen, la licencia y si hace falta un plan pagado.
7. **Límites de intentos en memoria**: no se comparten entre procesos y se reinician con el servidor; para escalar a varias instancias se necesita un limitador distribuido.
8. **Sin migraciones versionadas de esquema**: se usa `create_all` y una rutina mínima de columnas compatibles. Antes de evolucionar una base de producción debe incorporarse Alembic y probar migraciones sobre una copia.
9. **Recuperación de clave sin SMS**: un administrador verifica a la persona y le proporciona una clave temporal.
10. **Quechua y aimara**: la estructura existe, pero las traducciones y la revisión por hablantes están pendientes.
11. **Modo sin conexión**: la app puede abrir y mostrar último clima, avisos y biblioteca guardados. No permite enviar reportes sin señal ni sincronizarlos posteriormente; la cola de envío diferido sigue pendiente.
12. **Revisión de plantas por foto**: es una orientación preliminar, no un diagnóstico de laboratorio. Puede equivocarse con imágenes borrosas. No recomienda productos ni dosis. Sin `GROQ_API_KEY` ofrece guía por síntomas.
13. **Fichas de cultivo**: contienen rangos generales y no reemplazan recomendaciones por variedad validadas por INIAF u otra entidad técnica.
14. **Condiciones para fumigar**: usa criterios generales sobre viento, lluvia, temperatura y humedad a partir del pronóstico. Siempre prevalece la etiqueta del producto y la orientación técnica autorizada.
15. **Medición GPS de parcelas**: el GPS del teléfono tiene un margen de error de varios metros; en parcelas pequeñas el error relativo puede ser alto.
16. **Señas que se miden**: el contraste usa estimaciones satelitales regionales, no una estación en cada comunidad. Con pocas observaciones no se puede concluir sobre la capacidad predictiva; la interfaz debe advertirlo. El catálogo inicial requiere revisión con las comunidades y organizaciones locales.
17. **Servicios externos e IA**: según la configuración, el texto de consultas y las fotos analizadas pueden enviarse al proveedor de IA. Véase la [política de privacidad](../frontend/src/pages/Legal.tsx) y no se deben incluir datos personales innecesarios.
18. **E2E**: las pruebas Playwright requieren instalar la dependencia Node y el navegador Chromium. Se ejecutan localmente; el workflow CI actual verifica backend, pruebas unitarias frontend y build, no ejecuta la suite E2E.
17. **Ganado en riesgo**: los umbrales de noches peligrosas y el consumo de forraje son referencias generales, no recomendaciones veterinarias. El satélite (~50 km) no distingue lluvia de nieve: los «días compatibles con nevada» son precipitación con helada. Las pérdidas las reportan las familias y no se verifican.

## Próximos pasos sugeridos

- Gestionar un convenio con SENAMHI para avisos oficiales y datos de estaciones.
- Validar umbrales, calendarios y fichas con técnicos de INIAF/PROINPA y productores; ampliar los cultivos cubiertos solo después de esa revisión.
- Conectar WhatsApp Cloud API con plantillas aprobadas, números de prueba y consentimiento verificable.
- Implementar envío diferido de reportes creados sin conexión y resolver conflictos de sincronización.
- Incorporar Alembic, respaldos automáticos restaurables y límites distribuidos si se escala a varias instancias.
- Definir el responsable de datos, contacto de privacidad y política de retención antes de incorporar usuarios reales.
- Ejecutar un piloto consentido con una comunidad; medir utilidad, comprensión, accesibilidad y tareas completadas.
