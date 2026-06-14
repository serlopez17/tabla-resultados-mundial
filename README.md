# Quiniela Mundial 2026

App web sencilla para llevar la tabla de puntos de una quiniela.

## Correr local

```bash
ADMIN_USER=admin ADMIN_PASSWORD="tu-clave" SESSION_SECRET="un-secreto-largo" npm start
```

Abre `http://localhost:3000`.

## Desplegar sencillo con persistencia

La app guarda los puntos en un archivo JSON. Para que no se pierdan en produccion, configura una carpeta persistente con `DATA_DIR`.

Opcion simple recomendada: Render.

1. Sube este proyecto a GitHub.
2. En Render crea un `Web Service` conectado al repo.
3. Usa estos valores:
   - Build Command: dejar vacio o `npm install`
   - Start Command: `npm start`
4. Agrega variables de entorno:
   - `ADMIN_USER`: usuario admin
   - `ADMIN_PASSWORD`: clave admin
   - `SESSION_SECRET`: texto largo aleatorio
   - `DATA_DIR`: `/var/data`
5. En Render agrega un `Disk` persistente montado en `/var/data`.

Con eso la app queda publicada en internet y los puntos quedan persistidos aunque se reinicie el servidor.
