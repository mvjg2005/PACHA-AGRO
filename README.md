# AgroBolivia 🌱

**Plataforma inteligente de asistencia agroclimática y comunicación comunitaria para agricultores de Bolivia.**

> *Tu campo, tu comunidad, mejores decisiones.*

Prototipo funcional para hackatón universitaria. Integra los tracks **Comunicación** (comunidades, reuniones, avisos, reportes y WhatsApp) y **Educación** (lecciones breves para interpretar el clima y reducir riesgos).

| Inicio | Asistente de siembra | Resultado explicable | Clima (demostración) |
|---|---|---|---|
| ![](docs/img/inicio.png) | ![](docs/img/asistente-siembra.png) | ![](docs/img/resultado-siembra.png) | ![](docs/img/clima-demo.png) |

## Qué funciona hoy

| Función | Estado |
|---|---|
| Página principal con navegación que se adapta a móvil, tableta y escritorio | ✅ |
| Selección de departamento → municipio → cultivo (9 departamentos, 32 municipios) | ✅ |
| Clima: pronóstico **Open-Meteo**, historial y climatología **NASA POWER**, riesgo de helada, tormentas | ✅ datos reales (con caché y respaldo) |
| Recomendación de siembra con factor decisivo, acción principal y fuentes | ✅ **Quinua en el Altiplano** (Oruro, Potosí, La Paz) · 🧪 Papa y Maíz en modo *demostración* · ⚪ Haba y Cebada sin reglas |
| Registro e inicio de sesión de agricultores (celular + clave) | ✅ |
| Comunidades con aprobación del administrador; solicitudes de unión aprobadas por el representante | ✅ |
| Reuniones, confirmación de asistencia, avisos, reportes de helada/granizo, historial | ✅ |
| Panel de administración: comunidades, permisos, usuarios, reportes | ✅ |
| Asistente de WhatsApp | 🧪 **SIMULADOR** (no conectado). Arquitectura y webhook oficial listos para credenciales |
| Módulo educativo "Aprendamos sobre nuestro campo" (7 lecciones con preguntas y fuentes) | ✅ español · quechua/aimara pendientes de revisión lingüística |
| Avisos regionales segmentados (nacional, departamento, municipio o cultivo), publicados por administradores o editores, con vigencia y etiqueta *no oficial* | ✅ |
| Cultivos de interés en el perfil (filtran los avisos que recibe cada persona) | ✅ |
| Biblioteca filtrable por cultivo, tipo y departamento (8 guías con nota de fuente) | ✅ |
| Cobertura nacional (mapa de municipios y qué hay en cada departamento), privacidad y términos | ✅ |
| Adaptador para fuente meteorológica oficial con contrato normalizado | ✅ listo; se activa con `OFFICIAL_WEATHER_URL` |
| Avisos oficiales SENAMHI | ❌ no integrados (ver [docs/FUENTES_DATOS.md](docs/FUENTES_DATOS.md)); se enlaza al sitio oficial |

Nada se presenta como algo que no es: los datos **simulados**, las **observaciones comunitarias**, los **datos ingresados por el agricultor** y los **pronósticos** llevan etiquetas distintas en la interfaz y en la API.

## Ejecutar (5 minutos)

Requisitos: Python 3.11+ y Node.js 18+ para la aplicación. Para ejecutar la suite Playwright se requiere Node.js 22+.

### Windows PowerShell

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
# Genere una clave y copie el valor en SECRET_KEY dentro de backend/.env:
py -c "import secrets; print(secrets.token_urlsafe(48))"
# Edite backend/.env y establezca ADMIN_PASSWORD.
cd ..\frontend
npm ci
npm run build
cd ..\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

### Linux / macOS

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Copie el secreto generado a SECRET_KEY y establezca ADMIN_PASSWORD en backend/.env.
cd ../frontend && npm ci && npm run build
cd ../backend && .venv/bin/uvicorn app.main:app --port 8000
```

Abra <http://localhost:8000>. Documentación interactiva de la API: <http://localhost:8000/docs>.

Para desarrollar con recarga en caliente, deje el backend corriendo y en otra terminal:

```bash
cd frontend && npm run dev
```

(Vite en <http://localhost:5173> redirige `/api` al backend.)

Use `SEED_DEMO=false` para el funcionamiento normal y en producción. El archivo de ejemplo ya trae ese valor. Para ver las siguientes cuentas ficticias, cambie temporalmente a `SEED_DEMO=true` y utilice una base local desechable; no habilite los datos demo en producción.

### Cuentas ficticias para pruebas locales (`SEED_DEMO=true`)

| Rol | Celular | Clave |
|---|---|---|
| Representante (Comunidad Demo Challapata) | 70000001 | demo1234 |
| Agricultora | 70000002 | demo1234 |
| Administrador | el de `ADMIN_PHONE` | el de `ADMIN_PASSWORD` |

### Guion de demostración para el jurado (≈4 min)
1. **Inicio → Consultar condiciones de siembra** Oruro → Challapata → Quinua → Pandela → Sí, húmedo → Depende de la lluvia. Resultado en 7 toques, con el *porqué* de cada criterio y su fuente.
2. **Clima**: pronóstico real, riesgo de helada, historial NASA POWER, enlace a SENAMHI. Si el pronóstico no responde, se muestra el estado y se puede reintentar.
3. **Comunidad** (representante 70000001): convocar reunión → "Recordar" (genera recordatorios *simulados* solo para quienes aceptaron WhatsApp).
4. **WhatsApp** (agricultora 70000002): "¿Cuándo es la reunión de mi comunidad?" → "SI" → la asistencia se registra. "Quiero avisar que cayó granizo en mi zona." → queda como *observación comunitaria*.
5. **Aprender**: lección "¿Qué es una helada?" con pregunta.

## Desplegar

Use `SEED_DEMO=false` en producción. En **Sembrar → Comparar condiciones** puede evaluar dos niveles de humedad para quinua en el municipio seleccionado.

- **Render (recomendado):** *New + → Blueprint* → elegir este repositorio. `render.yaml` crea el servicio (Docker) y la base PostgreSQL; solo pide `ADMIN_PHONE` y `ADMIN_PASSWORD`.
- **Vercel (alternativa):** ya configurado con `vercel.json` y `api/index.py`; requiere conectar PostgreSQL (Neon).

Guía paso a paso de ambos: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Pruebas

```bash
cd backend && .venv/bin/python -m pytest
```

```bash
cd frontend && npm test
```

```bash
cd e2e
npm install
npx playwright install chromium
npm test -- http://localhost:8000
```

Para las pruebas E2E, arranque el backend con `SEED_DEMO=true`, `DATABASE_URL` apuntando a una base local desechable, una `SECRET_KEY` aleatoria de al menos 32 caracteres y las credenciales del administrador que usará el runner.

Los resultados **98/98** backend, **7/7** frontend y **25/25** E2E corresponden a la ejecución registrada en `main` antes de esta auditoría. Esta rama añade pruebas de regresión que deben validarse en su pull request; no se consideran aprobadas hasta que CI termine. GitHub Actions ejecuta backend, frontend, compilación y E2E en los pull requests. Detalle en [docs/PRUEBAS.md](docs/PRUEBAS.md).

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — arquitectura, justificación tecnológica, mapa de navegación, pantallas, seguridad.
- [docs/ALGORITMO.md](docs/ALGORITMO.md) — motor de recomendación, criterios, pesos y umbrales experimentales.
- [docs/FUENTES_DATOS.md](docs/FUENTES_DATOS.md) — evaluación de SENAMHI, NASA POWER y Open-Meteo.
- [docs/WHATSAPP.md](docs/WHATSAPP.md) — integración oficial, consentimiento, plantillas, costos y pasos para conectar.
- [docs/PRUEBAS.md](docs/PRUEBAS.md) — casos de prueba y resultados.
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — despliegue en Render (recomendado) o Vercel.
- [docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md) — qué falta para usarlo con agricultores reales.
- [docs/LIMITACIONES.md](docs/LIMITACIONES.md) — lo que el prototipo **no** hace todavía.

## Uso real

Además de las funciones, AgroBolivia incluye lo necesario para operar fuera de una demo: clima con caché persistente y último dato disponible, ubicación por GPS, modo sin conexión, recuperación de clave sin SMS, eliminación de cuenta, modo producción que no arranca con configuración insegura y chequeo de salud. Lo que todavía depende del equipo (base de datos duradera, validación agronómica, WhatsApp de Meta, responsable de datos, piloto) está en **[docs/PUESTA_EN_MARCHA.md](docs/PUESTA_EN_MARCHA.md)**.

## Créditos

Varias funciones se adaptaron del proyecto hermano **PACHAAGRO** ([Z0M3I/PACHAAGRO](https://github.com/Z0M3I/PACHAAGRO), licencia MIT, © 2026 Z0M3I): segmentación de avisos por alcance, cultivos de interés, biblioteca y sus guías, contrato de fuente meteorológica oficial, comandos y plantillas de WhatsApp, registro de estados de entrega, páginas de privacidad y términos, cobertura nacional, manifiesto web y CI. Se reescribieron para React + FastAPI; no se copió código de Next.js ni de Supabase.

## Aviso

Prototipo académico. Las orientaciones de siembra usan reglas y umbrales **experimentales, no validados agronómicamente**. No reemplazan a un técnico agrícola ni los avisos oficiales del SENAMHI. No se realizaron pruebas con usuarios reales ni existen métricas de impacto.
