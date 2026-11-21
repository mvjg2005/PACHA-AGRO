# WhatsApp en AgroBolivia

## Estado actual: SIMULADOR

WhatsApp **no está conectado**. `GET /api/whatsapp/status` devuelve `connected: false` y la interfaz lo dice en cada pantalla relevante. Los recordatorios quedan guardados con estado `simulado` y se pueden ver en el simulador del usuario destinatario.

## Arquitectura

```
Simulador web  ─┐                              ┌─ SimulatorChannel (por defecto, no envía nada)
                ├─► assistant.handle(texto) ───┤
Webhook Meta  ──┘   intents (reglas en español) └─ CloudAPIChannel (si WHATSAPP_ENABLED=true + credenciales)
```

- `services/whatsapp/intents.py`: detección de intención por palabras clave (siembra, helada/clima, reunión, reporte, SI/NO, BAJA/ALTA, menú numérico 1-4).
- `services/whatsapp/assistant.py`: respuestas breves, siempre con fuente; pide el municipio si no lo conoce; confirma antes de registrar un reporte.
- `routers/whatsapp.py`: `/simulate`, `/inbox`, `/status`, y el webhook oficial `GET/POST /webhook` con verificación de token y de firma `X-Hub-Signature-256`.

## Conversaciones soportadas

| Usuario escribe | Respuesta |
|---|---|
| "¿Cuándo puedo sembrar papa en mi comunidad?" | Semáforo + 4 criterios principales (supone secano y humedad desconocida, y lo dice) |
| "¿Hay riesgo de helada mañana?" | Mín/máx/lluvia de mañana + nivel de riesgo + fuente |
| "¿Cuándo es la reunión de mi comunidad?" | Próxima reunión; pide SI/NO |
| "SI" / "NO" | Registra asistencia (canal `whatsapp_sim`) |
| "Quiero avisar que cayó granizo en mi zona." | Pide confirmación → crea *observación comunitaria* (requiere cuenta y membresía aprobada) |
| "BAJA" / "ALTA" | Revoca / otorga consentimiento |
| "AVISOS" (o 5) | Avisos regionales vigentes para su zona y cultivos, marcados como no oficiales |
| "GUIAS" / "GUIAS de quinua" (o 6) | Guías de la biblioteca, filtradas por cultivo |
| "CULTIVOS" | Sus cultivos de interés |
| "CLIMA Challapata" o solo "Challapata" | Guarda el municipio y responde el clima |

## Plantillas y estados de entrega (adaptado de PACHAAGRO)

- Contratos de plantilla en `backend/app/services/whatsapp/templates.py` y en `GET /api/whatsapp/templates`: `recordatorio_reunion` y `aviso_regional` (categoría *utilidad*, español). Todas terminan con «Responda BAJA…». Los nombres se pueden cambiar con `WHATSAPP_TEMPLATE_MEETING` y `WHATSAPP_TEMPLATE_NOTICE`.
- Al enviar por la Cloud API se guarda el id de mensaje de Meta. El webhook procesa `statuses` y actualiza el historial: `simulado → enviado → entregado → leído` (nunca retrocede) o `fallido` con el motivo. El administrador ve el historial en su panel.
- Los avisos regionales se notifican solo a personas con consentimiento cuyo municipio o cultivos coinciden con el alcance del aviso.

## Cumplimiento de la plataforma oficial (para la conexión real)

- **Solo WhatsApp Business Platform (Cloud API de Meta).** No se usan bibliotecas que automatizan WhatsApp Web ni números personales.
- **Consentimiento (opt-in)** explícito al registrarse o en el perfil, con fecha; baja con "BAJA". Los recordatorios solo se generan para quienes aceptaron.
- **Plantillas**: los mensajes iniciados por AgroBolivia (recordatorios, avisos) deben usar plantillas aprobadas por Meta (categoría *utilidad*). Plantilla prevista: `recordatorio_reunion` con parámetros {título, comunidad, fecha, lugar}.
- **Ventana de 24 h**: las respuestas libres del asistente solo se envían dentro de las 24 h posteriores al último mensaje del usuario.
- **Costos**: Meta cobra por mensajes de plantilla según categoría y país; las respuestas dentro de la ventana de atención no tienen costo de plantilla. **Las tarifas cambian: verificar la tabla vigente para Bolivia antes de lanzar.**
- **Datos personales**: se guarda solo el teléfono y lo necesario; los representantes ven los últimos 4 dígitos; no se registran conversaciones del simulador en la base de datos.

## Cómo conectar (cuando existan credenciales)

1. Crear una app en Meta for Developers, agregar el producto WhatsApp y registrar un número de empresa.
2. Crear y obtener aprobación de la plantilla `recordatorio_reunion` en español.
3. Configurar en `backend/.env`: `WHATSAPP_ENABLED=true`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
4. Exponer el backend por HTTPS y registrar `https://<dominio>/api/whatsapp/webhook` como webhook (campo `messages`).
5. Probar con números de prueba antes de abrirlo a comunidades.

El estado de conversación ya se guarda en la base de datos (expira a los 30 minutos). Pendiente para producción: cola de envíos con reintentos y registro de la ventana de 24 h por usuario.
