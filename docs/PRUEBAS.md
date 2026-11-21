# Pruebas y validación

Última ejecución registrada en `main` el 21-11-2026. Los resultados de la tabla son una referencia histórica del commit principal anterior a esta rama de auditoría; no representan una ejecución de las modificaciones actuales. El backend usa fixtures. La suite de navegador usa el servidor local.

| Suite | Comando | Resultado |
|---|---|---|
| Backend (pytest) | `cd backend && .venv/bin/python -m pytest` | **61/61** aprobadas |
| Frontend unitarias (vitest) | `cd frontend && npm test` | **7/7** aprobadas |
| Extremo a extremo (Playwright, Chromium, móvil, tableta y escritorio) | `cd e2e && npm install && npx playwright install chromium && npm test -- http://localhost:8000` | **14/14** aprobadas (servidor recién iniciado) |
| Tipos TypeScript + compilación | `cd frontend && npm run build` | Sin errores |

## Repetir la validación E2E

Requisitos: Node.js 22 o superior. Con el backend y el frontend compilado en ejecución en `http://localhost:8000`:

```bash
cd e2e
npm install
npx playwright install chromium
npm test -- http://localhost:8000
```

La dependencia Playwright está fijada en `e2e/package.json`. Estas herramientas no forman parte de las dependencias del frontend.

## Casos de prueba por área

| Área | Caso | Resultado esperado | Prueba |
|---|---|---|---|
| Navegación | Los accesos a siembra y clima se ven sin desplazarse en 360×740 | Visibles sobre la barra inferior | e2e #1 |
| Navegación | Sin desplazamiento horizontal en 10 pantallas a 320 px | `scrollWidth ≤ 320` | e2e #12 |
| Recomendación | Consulta completa sin registro | 7 toques hasta el resultado, con semáforo y fuentes | e2e #2 |
| Comparador | Consulta real en 360, 768 y 1440 px | Resultados apilados en móvil y en columnas en pantallas amplias | e2e #13 |
| Recomendación | La acción principal aparece antes de los criterios | Sí | e2e #2 |
| Compartir | Mensaje con cultivo, municipio, resultado, «Orientación experimental» y, si aplica, «Caso simulado»; vista previa = mensaje enviado | Ambos modos verificados | `share.test.ts`, e2e |
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
| Educación | ≥7 lecciones con fuentes; quechua/aimara "pendiente"; `lang` no permitido | 422 | `test_api`, e2e #11 |
| Rendimiento | Red emulada ≈400 kbps + 400 ms latencia | Acciones de inicio visibles en **≈2.1 s** | e2e #13 |
| Rendimiento | Peso de la primera carga | ≈62 KB comprimidos (JS 56 KB + CSS 5 KB); mapa (44 KB) solo bajo demanda | `npm run build` |
| Accesibilidad | Contraste de todos los pares texto/fondo de la paleta | ≥ 4.95:1 (WCAG AA) | cálculo en revisión |

> Nota: los límites de seguridad (8 inicios de sesión cada 5 min por cuenta e IP, 5 reportes por hora) viven en memoria. Si se ejecuta la suite e2e varias veces seguidas contra el mismo servidor, las pruebas que inician sesión pueden recibir `429`: reinicie el servidor antes de cada ejecución.

## Lo que NO se ha validado

- No hubo pruebas con agricultores reales; no existen encuestas ni métricas de impacto.
- Las reglas agronómicas no fueron revisadas por un ingeniero agrónomo.
- El tiempo "menos de un minuto" se midió en número de toques (7) y no con personas.
- No se probó en dispositivos físicos de gama baja, solo emulación en Chromium.
- No se realizó una auditoría de seguridad profesional ni pruebas de carga.


## Pruebas añadidas por la auditoría

La rama incorpora regresiones para: límite de inicio de sesión por IP, configuración productiva, rechazo de nombres en blanco, fechas con offset, confirmación de asistencia ligada a una reunión, JSON malformado en el webhook, precipitación faltante, reportes comunitarios de helada y valores centinela de NASA POWER. Estas pruebas aún deben ejecutarse sobre esta rama antes de considerar validada la corrección.
