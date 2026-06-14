# Quiniela Mundial 2026

App web sencilla para llevar la tabla de puntos de una quiniela.

## Correr local

```bash
ADMIN_USER=admin ADMIN_PASSWORD="tu-clave" SESSION_SECRET="un-secreto-largo" npm start
```

Abre `http://localhost:3000`.

## Persistencia gratis con Supabase

La app usa Supabase si configuras `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Si no existen, usa `data/players.json` local.

### 1. Crear proyecto en Supabase

1. Entra a https://supabase.com
2. Crea un proyecto nuevo.
3. Ve a `SQL Editor`.
4. Ejecuta este SQL:

```sql
create table if not exists players (
  id text primary key,
  emoji text not null default '',
  name text not null,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table players disable row level security;
```

### 2. Variables de Supabase

En Supabase ve a `Project Settings > API` y copia:

- `Project URL` para `SUPABASE_URL`
- `service_role secret` para `SUPABASE_SERVICE_ROLE_KEY`

No compartas la `service_role secret`. Solo va como variable privada del servidor en Render.

## Publicar en Render gratis

1. En Render crea un `Web Service` conectado al repo de GitHub.
2. Configura:
   - Build Command: `npm install`
   - Start Command: `npm start`
3. Agrega estas variables de entorno:
   - `ADMIN_USER`: usuario admin
   - `ADMIN_PASSWORD`: clave admin
   - `SESSION_SECRET`: texto largo aleatorio
   - `SUPABASE_URL`: URL del proyecto Supabase
   - `SUPABASE_SERVICE_ROLE_KEY`: service role secret de Supabase
4. No agregues `DATA_DIR` en Render.
5. Dale `Deploy`.

Render te dara una URL publica. Esa es la que puedes pasarle a tus amigos.
