# Arquitectura de AgroBolivia

## 1. Análisis de requisitos (resumen)

| Requisito clave | Decisión |
|---|---|
| Usuarios con poca experiencia tecnológica, celulares económicos, internet lento | Web *mobile-first*, sin instalación, ~62 KB comprimidos en la primera carga, fuentes del sistema (sin descargar tipografías), mapa cargado solo bajo demanda |
| Consultar condiciones de siembra en < 1 minuto | Asistente de 6 preguntas, una por pantalla, con botones grandes; 7 toques desde el inicio; sin registro |
| Distinguir datos reales, pronósticos, datos del agricultor, comunitarios y simulados | Cada bloque de datos lleva `source` y `kind`; la interfaz muestra etiquetas de color |
| No inventar alertas oficiales | SENAMHI se muestra como "no integrado" con enlace oficial; los reportes de agricultores son "observaciones comunitarias" |
| WhatsApp como canal principal, sin automatizaciones no autorizadas | Patrón *canal* (simulador ↔ Cloud API oficial), un solo asistente para ambos |
| Extensible a 9 departamentos y nuevos cultivos | Ubicaciones, cultivos, calendarios, pesos y umbrales en JSON; ninguno está en el código |
| Futuro machine learning | Motor de recomendación puro (sin red ni BD) que recibe una vista normalizada del clima |

## 2. Justificación tecnológica

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | **React 18 + TypeScript + Tailwind CSS 4** (Vite) | Ecosistema muy difundido; TypeScript evita errores de contrato con la API; Tailwind permite un sistema visual propio sin hojas de estilo enormes; división de código por pantalla |
| Backend | **FastAPI (Python)** | Validación automática con Pydantic, documentación OpenAPI gratis (`/docs`), y el mismo lenguaje que el análisis agroclimático |
| Base de datos | **SQLAlchemy 2** → SQLite en desarrollo, **PostgreSQL** en producción | Cero instalación para probarlo; cambiar `DATABASE_URL` basta para PostgreSQL |
| Análisis agroclimático | Python puro (reglas + multicriterio) | Explicable y auditable; base para ML con scikit-learn cuando haya datos |
| Mapas | **Leaflet + OpenStreetMap** | Libre, liviano, carga diferida |
| Mensajería | **WhatsApp Business Platform (Cloud API)** — hoy en simulador | Única vía oficial y autorizada |

Se descartó un framework de UI de componentes (MUI, etc.) para no parecer plantilla genérica y reducir peso.

## 3. Diagrama de componentes

```
┌──────────────── Navegador (celular) ────────────────┐
│ React SPA  (enrutador por hash, carga diferida)     │
│  Inicio · Sembrar · Clima · Comunidad · Aprender    │
│  WhatsApp (simulador) · Ingresar · Perfil · Admin   │
└───────────────┬─────────────────────────────────────┘
                │ JSON /api  (JWT Bearer)
┌───────────────▼──────────────── FastAPI ─────────────────────────────┐
│ routers/  auth · catalog(weather) · recommendations · communities    │
│           admin · education · whatsapp (simulate, webhook)           │
│ services/                                                            │
│   weather/  open_meteo ─┐                                            │
│             nasa_power ─┼─► service (caché TTL, riesgos) ─► WeatherView │
│             simulated ──┘                                    │        │
│   recommendation/ engine (puro) ◄── crops.json (pesos/umbrales)       │
│   whatsapp/ intents → assistant → channels (Simulator | CloudAPI)     │
│ models (SQLAlchemy) ─► SQLite / PostgreSQL                            │
└──────────────────────────────────────────────────────────────────────┘
        │ HTTPS                         │ HTTPS (solo si hay credenciales)
   Open-Meteo · NASA POWER         graph.facebook.com (WhatsApp Cloud API)
```

## 4. Mapa de navegación

```
Inicio
├── 🌱 ¿Cuándo puedo sembrar?  → P1 Departamento → P2 Municipio → P3 Cultivo
│                                 → P4 Variedad → P5 Humedad → P6 Riego → Resultado
│                                 (Resultado: semáforo, ¿por qué?, qué hacer, compartir, fuentes)
├── 🌦️ ¿Cómo estará el clima?  → Ubicación · Riesgo de helada · Ahora · 7 días ·
│                                 Tormentas · Últimos días · SENAMHI · Mapa · Fuentes
├── 👨‍🌾 Mi comunidad          → (sin cuenta) Ingresar / Crear cuenta
│                               → Mis comunidades → Buscar y unirme | Registrar comunidad
│                               → Comunidad: Reuniones · Avisos · Reportes · Historial · Solicitudes*
├── 💬 Consultar por WhatsApp  → Simulador de chat
├── 📚 Aprendamos              → Lecciones (puntos, pregunta, fuentes) | Biblioteca (filtros → recurso)
├── 📢 Avisos para el campo    → Mi zona | Todos (también desde Clima)
└── Pie del inicio            → Cobertura nacional · Privacidad · Términos
Barra inferior fija: Inicio · Sembrar · Clima · Comunidad · Aprender
Encabezado: Ingresar / Perfil (consentimiento WhatsApp, salir, Admin*)
* solo representantes / administradores
```

## 5. Diseño de pantallas y sistema visual

- **Paleta** (tokens en `frontend/src/index.css`): verde bosque `#1E4A2C`, verde brote `#DCE7D1`, crema `#FAF6EE`, tierra `#7A4E2D`, ocre `#B87A2A`, amarillo suave `#F3D98B` para advertencias, rojo teja `#A63A2B`. Todas las combinaciones texto/fondo usadas superan 4.5:1.
- **Identidad**: franja inspirada en el aguayo (bandas planas, sin degradados), ilustración de andenes, títulos con serif clásica del sistema.
- **Tipografía**: base 18 px; botones de 48–64 px de alto; un concepto por pantalla en el asistente.
- **Semáforo** siempre con emoji + palabra + color (no depende solo del color).
- **Estados**: carga con texto, errores en lenguaje simple con "Intentar de nuevo", confirmaciones verdes.
- **Accesibilidad**: enlace "Ir al contenido", `aria-live` en resultados, foco visible, `prefers-reduced-motion`.

## 6. Modelo de datos

`users` (rol global farmer/editor/admin, consentimiento WhatsApp, cultivos de interés) · `regional_notices` (alcance nacional/departamento/municipio/cultivo, vigencia) · `communities` (pendiente/aprobada) · `memberships` (rol por comunidad: member/representative; estado) · `meetings` · `attendance` · `notices` · `observations` (comunitarias, con estado de revisión) · `activity_log` · `outbound_messages` (recordatorios; `simulado` mientras no haya canal real).

## 7. Seguridad

- Claves con PBKDF2-SHA256 (240 000 iteraciones, sal aleatoria); tokens JWT firmados con `SECRET_KEY` del entorno.
- Límite de intentos de inicio de sesión, registro, chat y reportes.
- Roles globales: agricultor, **editor de contenido** (publica avisos regionales) y administrador. La API nunca otorga el rol de administrador (solo viene del entorno).
- Migración mínima idempotente (`ensure_columns`) para bases ya desplegadas; probada contra PostgreSQL creado con la versión anterior.
- Autorización en el servidor: comunidad aprobada por admin; representante asignado por admin; nadie aprueba su propia solicitud; solo miembros aprobados ven contenido.
- Validación de entradas con Pydantic (teléfono boliviano, longitudes, valores permitidos); mensajes de error en español.
- Webhook de WhatsApp con verificación de firma `X-Hub-Signature-256`.
- Encabezados `nosniff`, `X-Frame-Options: DENY`, CORS restringido por variable de entorno.
- Sin credenciales en el repositorio (`.env` ignorado; `.env.example` sin secretos). Teléfonos se muestran parcialmente (últimos 4 dígitos) a representantes.

## 8. Estructura del código

```
backend/app/
  core/ (config, security, ratelimit)  data/ (locations, crops, education/*.json)
  routers/  services/{weather,recommendation,whatsapp}  models.py schemas.py deps.py seed.py main.py
backend/tests/ (pytest + fixtures reales de NASA POWER)
frontend/src/ (components, pages, lib)
e2e/run.cjs (Playwright)
docs/
```
