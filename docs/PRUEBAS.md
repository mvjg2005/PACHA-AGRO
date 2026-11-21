# Pruebas y validación

Los resultados numéricos de la tabla son los registrados antes de esta auditoría (21-11-2026); no describen una nueva ejecución de esta rama. El backend usa fixtures. La suite de navegador usa el servidor local y consulta las fuentes meteorológicas disponibles. Playwright ahora está declarado en e2e/package.json (Node.js 22+). Ejecución local: iniciar la API con SEED_DEMO=true y base SQLite desechable; luego ejecutar cd e2e, npm install, npx playwright install chromium y npm test -- http://localhost:8000. GitHub Actions ahora incluye E2E en los pull requests con base temporal.

| Suite | Comando | Resultado |
|---|---|---|
| Backend (pytest) | `cd backend && .venv/bin/python -m pytest` | **85/85** aprobadas |
| Frontend unitarias (vitest) | `cd frontend && npm test` | **7/7** aprobadas |
| Extremo a extremo (Playwright, Chromium, móvil, tableta y escritorio) | `cd e2e && npm install && npx playwright install chromium && npm test -- http://localhost:8000` | **19/19** registradas antes de esta auditoría; repetir tras los cambios |
| Tipos TypeScript + compilación | `cd frontend && npm run build` | Sin errores |

## Casos de prueba por área

| Área | Caso | Resultado esperado | Prueba |
|---|---|---|---|
| Navegación | Los accesos a siembra y clima se ven sin desplazarse en 360×740 | Visibles sobre la barra inferior | e2e #1 |
| Navegación | Sin desplazamiento horizontal en 10 pantallas a 320 px | `scrollWidth ≤ 320` | e2e #12 |
| Recomendación | Consulta completa sin registro | 7 toques hasta el resultado, con semáforo y fuentes | e2e #2 |
| Comparador | Consulta real en 360, 768 y 1440 px | Resultados apilados en móvil y en columnas en pantallas amplias | e2e #13 |
| Recomendación | La acción principal aparece antes de los criterios | Sí | e2e #2 |
| Compartir | Mensaje con cultivo, municipio, resultado, «Orientación experimental» y, si aplica, «Caso simulado»; vista previa = mensaje enviado | Ambos modos verificados | `share.test.ts` (ambos modos), e2e (modo real) |
| Avisos regionales | Segmentación por alcance (9 casos), validación de jerarquía, vigencia, retiro, filtros públicos y «mis avisos» | Correctos | `test_ported` |
| Avisos regionales | Agricultor no publica; la API no otorga admin; editor publica y notifica solo a quien corresponde (simulado) | 403 / 422 / correcto | `test_ported`, e2e |
| Cultivos de interés | Guardar, quitar duplicados, rechazar cultivos inexistentes; avisos por cultivo aparecen | Sí | `test_ported`, e2e |
| Biblioteca | 8 recursos con fuente; filtros por cultivo/tipo/departamento; 404 | Sí | `test_ported`, e2e |
| Fuente oficial | Se prefiere si está configurada (con token); formato inválido → Open-Meteo; sin configurar no se llama | Sí (simulado) | `test_ported` |
| WhatsApp | Estados enviado/entregado/leído/fallido sin retroceder; plantillas con BAJA; AVISOS/GUIAS; confirma municipio | Sí | `test_ported` |
| Migración | Base vieja recibe columnas nuevas sin perder datos, idempotente; avisos DEMO se agregan a bases existentes | SQLite y PostgreSQL 16 | `test_ported`, manual |
| Cobertura / legales | Estado por departamento solo con reglas y calendario; mapa; privacidad y términos | Sí | e2e |
| Recomendación | Factor decisivo: rojo > amarillo, crítico antes que no crítico, sin datos no crítico no decide; acción principal por factor; explicación de confianza | Sí | `test_engine` (10 casos) |
| Recomendación | Heladas −4 °C / −1 °C / sin helada | 🔴 / 🟡 / 🟢 con explicación que cita la temperatura | `test_engine` |
| Recomendación | Suelo seco y secano / seco con riego | 🔴 / 🟡 | `test_engine` |
| Recomendación | "No sé" la humedad → usa modelo; sin modelo → ⚪ | Etiqueta "estimación" / insuficiente | `test_engine` |
| Recomendación | Fuera de calendario; ventana que cruza el año (maíz nov–ene) | 🔴; 🟡 en enero | `test_engine` |
| Recomendación | Haba (sin reglas); quinua en llanos | ⚪ sin criterios | `test_engine`, e2e #3 |
| Recomendación | Reporte comunitario de granizo influye | Criterio "tormenta" con `data_kind=comunidad` y texto "no es aviso oficial" | `test_api` |
| Datos faltantes | Open-Meteo con límite diario | Error en español, riesgo por climatología, confianza baja | `test_weather`, `test_engine` |
| Datos faltantes | Todas las fuentes caídas | Riesgo "desconocido", ⚪ | `test_weather` |
| Datos faltantes | Interfaz sin pronóstico | Mensaje claro y botón «Intentar de nuevo» | e2e #4 |
| Datos faltantes | Sin conexión al backend | "No hay conexión… Intente de nuevo" + botón | e2e #5 |
| Datos | Días `-999` de NASA POWER descartados; caché evita llamadas repetidas | Sí | `test_weather` |
| Registro | Nombre corto, teléfono inválido, clave corta | 422 con mensaje por campo | `test_api`, e2e #6 |
| Registro | Teléfono duplicado | 409 | `test_api` |
| Inicio de sesión | Clave incorrecta ×9 | 401 y luego 429 (límite) | `test_api` |
| Inicio de sesión | Token inválido | 401 | `test_api` |
| Seguridad | Clave no se guarda en texto plano | Hash `pbkdf2_sha256$…` | `test_api` |
| Permisos | Comunidad pendiente no aparece ni permite reuniones | 404 hasta aprobación admin | `test_api` |
| Permisos | Agricultor no accede a admin, no crea reuniones/avisos | 403 (API y UI) | `test_api`, e2e #7 |
| Permisos | Representante de otra comunidad | 403 | `test_api` |
| Permisos | No miembros / pendientes no leen reuniones, avisos, reportes, historial | 403 | `test_api` |
| Permisos | Miembro no se auto-promueve ni aprueba a otros | 403 | `test_api` |
| Reuniones | Crear, listar, confirmar y cambiar asistencia, historial | Conteos correctos | `test_api`, e2e #8 |
| Reuniones | Fecha pasada | 422 | `test_api` |
| Reuniones | Recordatorios solo a quienes aceptaron WhatsApp; canal simulador | `connected=false` | `test_api`, e2e #8 |
| Observaciones | Etiquetadas "no es aviso oficial"; solo el representante revisa; límite 5/hora | Sí | `test_api`, e2e #9 |
| WhatsApp | Estado = simulador; pide municipio; siembra; reunión → SI; reporte con confirmación; BAJA | Sí | `test_api`, e2e #10 |
| WhatsApp | Webhook sin credenciales 503; firma inválida 401; firma válida 200 | Sí | `test_api` |
| Validación | Municipio inexistente, cultivo desconocido, variedad `<script>`, valor fuera de lista | 404 / 422 | `test_api` |
| Seguridad | Encabezados `nosniff`, `X-Frame-Options` | Presentes | `test_api` |
| Seguridad | Clave JWT ausente o menor de 32 caracteres | La configuración no permite iniciar con una clave débil | `config.py` / CI |
| Persistencia | La base de datos no responde | `/api/health` devuelve 503 | `test_api` |
| WhatsApp | Meta reintenta el mismo `wamid` | El webhook procesa el mensaje una sola vez | `test_api` |
| Comunidades | Decisión repetida de una solicitud resuelta | 409 Conflict | `test_api` |
| Recomendación | Lluvia diaria faltante (`null`) | El criterio queda gris, nunca se interpreta como 0 mm | `test_engine` |
| Recomendación | Reporte de helada confirmado | Añade cautela comunitaria sin presentarse como aviso oficial | `test_engine` |
| NASA POWER | Climatología con `-999` | Se normaliza como dato ausente | `test_weather` |
| Educación | ≥7 lecciones con fuentes; quechua/aimara "pendiente"; `lang` no permitido | 422 | `test_api`, e2e #11 |
| Rendimiento | Red emulada ≈400 kbps + 400 ms latencia | Acciones de inicio visibles en **≈2.1 s** | e2e #13 |
| Rendimiento | Peso de la primera carga | ≈62 KB comprimidos (JS 56 KB + CSS 5 KB); mapa (44 KB) solo bajo demanda | `npm run build` |
| Accesibilidad | Contraste de todos los pares texto/fondo de la paleta | ≥ 4.95:1 (WCAG AA) | cálculo en revisión |

> Nota: GitHub Actions ejecuta ahora la suite E2E en pull requests con SQLite temporal y datos demo aislados. Los límites de seguridad (8 inicios de sesión cada 5 min por cuenta e IP, 5 reportes por hora) viven en memoria. Si se ejecuta la suite e2e varias veces seguidas contra el mismo servidor, las pruebas que inician sesión pueden recibir `429`: reinicie el servidor antes de cada ejecución.

## Lo que NO se ha validado

- No hubo pruebas con agricultores reales; no existen encuestas ni métricas de impacto.
- Las reglas agronómicas no fueron revisadas por un ingeniero agrónomo.
- El tiempo "menos de un minuto" se midió en número de toques (7) y no con personas.
- No se probó en dispositivos físicos de gama baja, solo emulación en Chromium.
- No se realizó una auditoría de seguridad profesional ni pruebas de carga.
