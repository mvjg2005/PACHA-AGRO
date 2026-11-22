# Puesta en marcha con agricultores reales

Esta guía separa lo que **ya está resuelto en el código** de lo que **solo el equipo puede hacer** (cuentas, convenios, validaciones). Sin los puntos de la segunda parte, AgroBolivia funciona, pero no debería presentarse como un servicio para decisiones reales.

## 1. Ya resuelto en el código

| Necesidad real | Cómo se resolvió |
|---|---|
| El pronóstico gratuito se agota en la nube (IP compartida) | Caché persistente en la base de datos (1 h pronóstico, 6 h historial, 30 días climatología), compartida entre reinicios y despliegues. Si el proveedor falla, se muestra el **último pronóstico obtenido** (hasta 12 h) con su hora y aviso visible. Admite clave del plan pagado de Open-Meteo (`OPEN_METEO_API_KEY`). |
| Solo hay 32 municipios cargados | «📍 Usar mi ubicación (GPS)»: el clima se pide para el punto exacto; el calendario usa el municipio registrado más cercano y avisa si está a más de 60 km. Las coordenadas no se guardan en el servidor. |
| Mala señal en el campo | Modo sin conexión (*service worker*): la app abre sin internet y muestra el último clima, avisos y biblioteca guardados, con la fecha. No guarda respuestas personales. |
| Claves olvidadas sin SMS | El administrador verifica a la persona en su comunidad y le da una **clave temporal** (se muestra una sola vez); la persona debe cambiarla para usar la app (se exige también en el servidor). |
| Derechos sobre los datos | Cambiar clave y **eliminar la cuenta** desde Mi cuenta (borra nombre, número, ubicación, cultivos, mensajes y membresías). |
| Configuración insegura por descuido | Con `ENVIRONMENT=production` el servidor **no arranca** si `SECRET_KEY` es débil, si CORS es `*`, si usa SQLite o si WhatsApp está activado sin todas sus credenciales. Cabecera HSTS. `/api/health` revisa la base de datos (503 si falla). |
| WhatsApp real olvida conversaciones al reiniciar | El estado de cada conversación se guarda en la base de datos (expira a los 30 min). |

## 2. Solo el equipo puede hacerlo (en orden recomendado)

1. **Base de datos duradera.** La PostgreSQL gratuita de Render vence después de un tiempo. Use un plan pagado de Render o una base gratuita que no venza (p. ej. Neon) y configure `DATABASE_URL`. Active copias de seguridad.
2. **Validación agronómica.** Que un ingeniero agrónomo (PROINPA, INIAF, universidad) revise `backend/app/data/crops.json` (umbrales y calendarios) y la biblioteca. Hasta entonces, la app dice «Orientación experimental».
3. **Responsable de los datos personales.** Defina quién responde por los datos y un contacto real, y agréguelo a la página de Privacidad (`frontend/src/pages/Legal.tsx`).
4. **WhatsApp Business.** Cuenta de Meta Business, número verificado, plantillas `recordatorio_reunion` y `aviso_regional` aprobadas, y las variables de `docs/WHATSAPP.md`. Revise las tarifas vigentes para Bolivia.
5. **Licencia del clima.** Open-Meteo gratuito es para uso no comercial. Si AgroBolivia cobra o lo opera una empresa, contrate el plan y configure `OPEN_METEO_API_KEY`.
6. **Directorio de técnicos.** En Administración → Técnicos, registre ingenieros agrónomos reales (INIAF, gobernaciones, universidades, ONG) con su consentimiento escrito. Sin registros, la Asesoría solo muestra sitios recomendados.
7. **Fuente oficial.** Gestione un convenio con SENAMHI; el adaptador (`OFFICIAL_WEATHER_URL`) ya está listo.
7. **Más municipios.** Agregue municipios con coordenadas verificadas en `backend/app/data/locations.json` (no requiere cambiar código).
8. **Piloto con consentimiento.** Pruebe con una comunidad, con consentimiento informado, antes de abrirlo al público. Recién entonces se podrán medir resultados reales.

## 3. Variables para producción (Render)

`render.yaml` ya define `ENVIRONMENT=production`, `SEED_DEMO=false`, `SECRET_KEY` generada y `DATABASE_URL`. Agregue en el panel:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ADMIN_PHONE`, `ADMIN_PASSWORD` | Sí | Primera cuenta de administrador (clave de 10+ caracteres) |
| `OPEN_METEO_API_KEY` | Recomendada | Más consultas y uso comercial |
| `ANTHROPIC_API_KEY` | Recomendada | Activa la IA de Asesoría, Pacha IA y la revisión de plantas por foto (sin ella: modo básico) |
| `XAI_API_KEY` | Opcional | Grok (xAI) para Pacha IA si no hay clave de Anthropic (`XAI_MODEL`, por defecto `grok-4`) |
| `GROQ_API_KEY` | Opcional | Groq (groq.com, claves `gsk_…`, con plan gratuito) para Pacha IA (`GROQ_MODEL`, por defecto `llama-3.3-70b-versatile`) |
| `GEMINI_API_KEY` | Opcional | Alternativa para Pacha IA si no hay clave de Anthropic (`GEMINI_MODEL`, por defecto `gemini-3.8-flash`) |
| `WHATSAPP_*` | Para WhatsApp real | Ver `docs/WHATSAPP.md` |
| `OFFICIAL_WEATHER_URL`, `OFFICIAL_WEATHER_KEY` | Si hay convenio | Fuente oficial de clima |

Después de desplegar, abra `/api/health`: debe decir `"status":"ok"` y `"database":true`.
