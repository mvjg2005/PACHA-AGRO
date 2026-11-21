# AgroBolivia

**Plataforma inteligente de asistencia agroclimática y comunicación comunitaria para agricultores de Bolivia.**

> *Tu campo, tu comunidad, mejores decisiones.*

Prototipo funcional para hackatón universitaria. Integra los tracks **Comunicación** (comunidades, reuniones, avisos, reportes y WhatsApp) y **Educación** (lecciones breves para interpretar el clima y reducir riesgos).

Portada en escritorio (tipografías Newsreader y Public Sans, íconos de línea propios, sin emoticones; cada bloque muestra datos reales con su fuente):

![Portada en escritorio](docs/img/inicio-escritorio.png)

| Inicio | Asistente de siembra | Resultado explicable | Clima |
|---|---|---|---|
| ![](docs/img/inicio.png) | ![](docs/img/asistente-siembra.png) | ![](docs/img/resultado-siembra.png) | ![](docs/img/clima.png) |

## Lo nuevo: «Señas que se miden»

Las comunidades andinas anticipan el año con **señas** (bioindicadores): las Pléyades (*Qutu*) en la madrugada de San Juan, el nido del *leque leque*, el aullido del zorro, la floración de la t'ola. Las apps agrícolas las ignoran y los programas tradicionales las anotan en papel. **PACHA-AGRO las registra y, al terminar cada temporada, mide si acertaron** con la lluvia y las heladas medidas por satélite en ese mismo municipio. No conocemos otra herramienta que lo haga de forma abierta y comunitaria.

- **Dos saberes lado a lado.** Lo que anuncian las señas de la comunidad (votos por año seco, normal o lluvioso) junto a lo que realmente pasó, medido con NASA POWER.
- **Medición rigurosa.** La temporada se ubica por **terciles** frente a todas las temporadas desde 2001, el método usual de los pronósticos estacionales. Por construcción, adivinar al azar acierta 1 de cada 3 veces, y cada seña se compara contra esa vara. Con datos reales, Challapata da: 2015–16 (El Niño) **seca**, 2023–24 **normal**, 2024–25 **lluviosa** y 2025–26 **seca**.
- **Respaldo científico donde existe.** La visibilidad de las Pléyades en junio se relaciona con El Niño (Orlove, Chiang y Cane, *Nature* 403, 2000). Para las demás señas, la plataforma no opina: mide.
- **Pachagrama digital.** El calendario vivo de la campaña semana a semana: lluvia, promedio desde 2001, heladas, reportes de la comunidad y señas registradas. Está inspirado en el Pachagrama en papel de los *Yapuchiris* del Altiplano.
- **Evidencia que crece cada año.** Cada registro nuevo mejora la tabla de aciertos de su departamento. El saber local se vuelve un dato que la comunidad puede defender ante técnicos, municipios y financiadores.

![Señas que se miden: saber local frente a datos satelitales en Challapata, campaña 2024–2025](docs/img/senas.png)

### Cómo responde a los criterios del jurado
| Criterio | Qué aporta PACHA-AGRO |
|---|---|
| **Innovación (40)** | Mide el acierto de los bioindicadores andinos con datos satelitales, con la vara del azar. Se suman la revisión de plantas por foto con IA y la asesoría con técnicos reales. |
| **Viabilidad técnica (30)** | Todo funciona con datos reales y gratuitos (Open-Meteo y NASA POWER), con caché y respaldo. Base de datos PostgreSQL. 121 pruebas de backend, 12 de frontend y 33 en navegador de celular. Desplegable en Render con un archivo. |
| **Impacto (30)** | Productoras y productores del Altiplano, valles y llanos: decidir cuándo sembrar, revisar plantas, hacer cuentas, organizarse en comunidad y valorar su propio saber. Funciona en celulares sencillos, con poca señal, lectura en voz alta y sin registrarse para lo esencial. |

## Qué funciona hoy

| Función | Estado |
|---|---|
| Página principal con navegación que se adapta a móvil, tableta y escritorio | Sí |
| Selección de departamento → municipio → cultivo (9 departamentos, 32 municipios) | Sí |
| Clima: pronóstico **Open-Meteo**, historial y climatología **NASA POWER**, riesgo de helada, tormentas | Sí: datos reales (con caché y respaldo) |
| Recomendación de siembra con factor decisivo, acción principal y fuentes | Sí: **Quinua en el Altiplano** (Oruro, Potosí, La Paz) · Papa y Maíz en modo *demostración* · Haba y Cebada sin reglas |
| Registro e inicio de sesión de agricultores (celular + clave) | Sí |
| Comunidades con aprobación del administrador; solicitudes de unión aprobadas por el representante | Sí |
| Reuniones, confirmación de asistencia, avisos, reportes de helada/granizo, historial | Sí |
| Panel de administración: comunidades, permisos, usuarios, reportes | Sí |
| Asistente de WhatsApp | **SIMULADOR** (no conectado). Arquitectura y webhook oficial listos para credenciales |
| Módulo educativo "Aprendamos sobre nuestro campo" (7 lecciones con preguntas y fuentes) | Sí: español · quechua/aimara pendientes de revisión lingüística |
| Avisos regionales segmentados (nacional, departamento, municipio o cultivo), publicados por administradores o editores, con vigencia y etiqueta *no oficial* | Sí |
| Cultivos de interés en el perfil (filtran los avisos que recibe cada persona) | Sí |
| Biblioteca filtrable por cultivo, tipo y departamento (8 guías con nota de fuente) | Sí |
| Cobertura nacional (mapa de municipios y qué hay en cada departamento), privacidad y términos | Sí |
| **Mi campo** (inspirado en apps como Plantix y FieldMargin): revisar una planta con una **foto** (posibles causas, qué verificar, primeras medidas sin químicos y técnicos de la zona), **calculadoras** (ganancia, rendimiento requerido, precio sin pérdida, presupuesto de insumos, mezcla según la etiqueta; con quintales y arrobas), **condiciones para fumigar** hora por hora, **fichas de cultivo con lectura en voz alta** y **parcelas con cuaderno de campo** (superficie medida caminando con GPS, gastos, cosecha, ventas, balance y rendimiento) | Sí. La revisión por foto usa IA con `ANTHROPIC_API_KEY`; sin ella ofrece una guía por síntomas. La foto no se guarda. Nunca se indican productos ni dosis |
| Bienvenida en la primera visita (cultivos, perfil y ubicación) | Sí; se puede saltar |
| **Señas que se miden** y **Pachagrama digital**: registro de bioindicadores andinos, comparación con lluvia y heladas medidas por satélite (terciles desde 2001), tabla de aciertos frente al azar por departamento | Sí, con datos reales de NASA POWER. Los registros de ejemplo solo aparecen con `SEED_DEMO=true` y están marcados |
| **Asesoría con IA**: responde preguntas del campo y recomienda técnicos/ingenieros agrónomos (WhatsApp, llamada, correo) y sitios especializados (SENAMHI, INIAF, FAO Ecocrop, PlantwisePlus, EOSDA, OneSoil, Windy, Meteoblue…) | Sí: con `ANTHROPIC_API_KEY` usa IA; sin ella, respuesta automática básica. Los contactos los elige el servidor del directorio (solo técnicos con consentimiento, cargados por el administrador); la IA nunca inventa teléfonos ni enlaces |
| Adaptador para fuente meteorológica oficial con contrato normalizado | Sí: listo; se activa con `OFFICIAL_WEATHER_URL` |
| Avisos oficiales SENAMHI | No: no integrados (ver [docs/FUENTES_DATOS.md](docs/FUENTES_DATOS.md)); se enlaza al sitio oficial |

Nada se presenta como algo que no es: los datos **simulados**, las **observaciones comunitarias**, los **datos ingresados por el agricultor** y los **pronósticos** llevan etiquetas distintas en la interfaz y en la API.

## Ejecutar (5 minutos)

Requisitos: Python 3.11+, Node.js 18+ y npm. Para la suite E2E también se instala Chromium mediante Playwright.

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && cp .env.example .env
```

Edite `backend/.env` (al menos `SECRET_KEY` y `ADMIN_PASSWORD`). Luego compile el frontend:

```bash
cd frontend && npm install && npm run build
```

Y arranque todo en un solo proceso (la API sirve también la web compilada):

```bash
cd backend && .venv/bin/uvicorn app.main:app --port 8000
```

Abra <http://localhost:8000>. Documentación interactiva de la API: <http://localhost:8000/docs>.

Para desarrollar con recarga en caliente, deje el backend corriendo y en otra terminal:

```bash
cd frontend && npm run dev
```

(Vite en <http://localhost:5173> redirige `/api` al backend.)

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
6. **Señas** (Challapata, campaña 2015–2016 y luego 2024–2025): lo que anunciaron las señas frente a lo que midió el satélite, el Pachagrama de la campaña y la tabla «¿Las señas aciertan?» con la marca del azar.
7. **Mi campo**: foto de una planta, calculadora de ganancia en quintales y cuaderno de una parcela.

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
# Desde la raíz del repositorio: instala Playwright (una sola vez)
npm install
npx playwright install chromium
node e2e/run.cjs http://localhost:8000
```

Resultados actuales: **121/121** backend, **12/12** unitarias frontend, **33/33** extremo a extremo (también contra PostgreSQL actualizado desde la versión anterior). GitHub Actions ejecuta backend, frontend y build en cada push a `main` (`.github/workflows/ci.yml`). Detalle en [docs/PRUEBAS.md](docs/PRUEBAS.md).

## Auditoría y presentación

- [docs/AUDITORIA_ABSTRACTHON.md](docs/AUDITORIA_ABSTRACTHON.md) — evaluación frente a los 3 criterios de Abstracthon, hallazgos, MVP recomendado, guion de 4 minutos y próximos pasos.

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
