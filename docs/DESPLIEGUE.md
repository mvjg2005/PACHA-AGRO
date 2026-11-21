# Despliegue

Dos opciones configuradas en el repositorio. **Recomendada: Render** (servidor continuo, sin cambios de arquitectura).

| | Render (recomendado) | Vercel |
|---|---|---|
| Cómo corre el backend | Servidor normal (contenedor Docker) | Funciones *serverless* |
| Caché del clima, chat simulado, límites de intentos | Se mantienen mientras el servidor esté encendido | Se reinician con cada instancia |
| Base de datos | PostgreSQL creada por el Blueprint | PostgreSQL de Neon (Marketplace) |
| Archivos | `Dockerfile`, `render.yaml` | `vercel.json`, `api/index.py`, `requirements.txt` |

---

# Render (recomendado)

El archivo `render.yaml` (Blueprint) crea:
- **agrobolivia**: servicio web que construye el `Dockerfile` (compila el frontend y arranca FastAPI, que sirve web + API).
- **agrobolivia-db**: PostgreSQL. Su URL se pasa sola como `DATABASE_URL`.
- `SECRET_KEY` se genera automáticamente.

## Pasos

1. Asegúrese de que el código esté en la rama **`main`** (el Blueprint despliega `main`).
2. Entre a <https://render.com> e inicie sesión con GitHub.
3. **New + → Blueprint** → elija el repositorio `henryflors/PACHA-AGRO` → Render lee `render.yaml`.
4. Le pedirá los valores que no están en el archivo:
   - `ADMIN_PHONE`: su celular con prefijo, ej. `+59171234567`
   - `ADMIN_PASSWORD`: una clave segura
5. **Apply / Deploy Blueprint**. La primera construcción tarda unos minutos.
6. Abra la URL `https://agrobolivia-XXXX.onrender.com`. Verifique `…/api/health` → `{"status":"ok"}`.
7. Cada `git push` a `main` vuelve a desplegar automáticamente.

## Plan gratuito: tenga en cuenta

- El servicio **se duerme tras unos 15 minutos sin visitas**; la siguiente visita tarda ~1 minuto en despertar. **Ábralo antes de presentar.**
- La base PostgreSQL gratuita de Render **vence después de un tiempo** (según la política actual, unos 30 días). Para la hackatón alcanza; luego pase a un plan pagado o a Neon. Verifique las condiciones vigentes en render.com/pricing.
- Open-Meteo gratuito cuenta consultas por IP; si se agota, la app usa NASA POWER si hay datos históricos disponibles.

## Verificado antes de publicar

- Imagen Docker construida (288 MB) y ejecutada como Render: variable `PORT=10000`, PostgreSQL 16, usuario sin privilegios.
- Suite e2e completa contra el contenedor: **27/27**.
- Detrás del proxy, los límites de intentos cuentan por IP real del visitante (`--proxy-headers`): 10 registros permitidos por IP y hora, el 11.º bloqueado, otra IP sigue funcionando.
- No se hizo un despliegue real en Render desde el entorno de desarrollo (requiere su cuenta).

## Ejecutar la misma imagen en su computadora

```bash
docker build -t agrobolivia .
```

```bash
docker run -p 8000:8000 -e SECRET_KEY=algo-largo -e ADMIN_PASSWORD=admin12345 agrobolivia
```

Luego abra <http://localhost:8000>.

---

# Vercel (alternativa)

Arquitectura en Vercel:
- **Frontend** (`frontend/dist`) → CDN de Vercel.
- **Backend FastAPI** → una función Python (`api/index.py`) que atiende `/api/*`.
- **Base de datos** → **PostgreSQL** (recomendado: Neon, gratuito, desde el Marketplace de Vercel).

> ⚠️ Sin `DATABASE_URL` la función usa SQLite en `/tmp`: los datos se borran y **no se comparten entre instancias** (un usuario puede "desaparecer" entre una petición y otra). Úselo solo para una prueba rápida.

Configuración ya incluida en el repositorio: `vercel.json`, `api/index.py`, `requirements.txt` (raíz), `.vercelignore`.

## Pasos

1. Entre a <https://vercel.com> e inicie sesión con GitHub.
2. **Add New… → Project** → importe `henryflors/PACHA-AGRO`.
3. En la pantalla de configuración deje *Framework Preset: Other* y **no cambie** los comandos (los toma de `vercel.json`).
4. Abra **Environment Variables** y agregue:

   | Variable | Valor |
   |---|---|
   | `SECRET_KEY` | un texto largo y aleatorio (ver abajo) |
   | `ADMIN_PHONE` | su celular con prefijo, ej. `+59171234567` |
   | `ADMIN_PASSWORD` | una clave segura para el administrador |
   | `SEED_DEMO` | `false` en producción. Use `true` para pruebas con cuentas ficticias. |

   Para generar `SECRET_KEY`:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
5. Pulse **Deploy**.
6. Agregue la base de datos: en el proyecto → **Storage** → **Create Database** → **Neon (Postgres)** → conéctela al proyecto. Vercel crea la variable `DATABASE_URL` automáticamente.
   *Si su integración crea la variable con otro nombre (p. ej. `POSTGRES_URL`), agregue manualmente `DATABASE_URL` con el mismo valor.*
7. **Deployments → … → Redeploy** para que tome `DATABASE_URL`. Las tablas y los datos de demostración se crean solos en la primera petición.
8. Verifique: `https://<su-proyecto>.vercel.app/api/health` debe responder `{"status":"ok"}`.

## Rama de producción

Vercel publica en producción la rama **`main`**. Si el código está en otra rama, esa rama genera solo un despliegue de *vista previa*. Fusione la rama en `main` (Pull Request) o cambie la rama de producción en *Settings → Git*.

## Limitaciones en Vercel

- **Arranque en frío**: la primera petición tras un rato inactivo tarda unos segundos más. Abra la app antes de presentar.
- **Estado en memoria por instancia**: caché del clima, conversaciones del simulador de WhatsApp y límites de intentos se reinician cuando Vercel recicla la función. Funciona para la demo; en producción usar Redis.
- **Open-Meteo gratuito** cuenta las consultas por IP; en plataformas en la nube la IP puede ser compartida y alcanzar el límite. La app muestra entonces historial de NASA POWER si hay datos históricos disponibles.
- **WhatsApp real** necesita la URL pública HTTPS de Vercel como webhook: `https://<su-proyecto>.vercel.app/api/whatsapp/webhook` (ver `WHATSAPP.md`).

## Verificado antes de publicar

- `vercel build` (CLI 39.3.0) ejecutado localmente: compila el frontend y empaqueta la función con `backend/app/**` y el driver `psycopg`.
- Punto de entrada probado sin eventos de arranque (como en Vercel) y con SQLite en `/tmp`.
- Suite e2e completa (27/27) ejecutada contra **PostgreSQL 16**.
- La inicialización de la base de datos tolera varias instancias arrancando a la vez.
- No se pudo hacer un despliegue real desde el entorno de desarrollo (requiere su cuenta de Vercel).

Los servicios de Render existentes deben tener `SEED_DEMO=false` en **Environment**. Con este ajuste se ocultan las comunidades ficticias, se desactivan sus accesos y sus observaciones quedan fuera de las recomendaciones. Los registros se conservan en la base de datos.
