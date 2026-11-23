# Guía de despliegue de TAP-WAR

TAP-WAR soporta dos modos de despliegue sin costo de infraestructura adicional, manteniendo Supabase Auth/Postgres/Storage en su servicio gestionado:

1. **Principal en Ubuntu Server (`mcserver`) con Docker Compose + Tailscale Funnel** (HTTPS/WSS públicos en `https://mcserver.tailda19bf.ts.net`, sin IP pública ni apertura de puertos en el router).
2. **Respaldo en Render Free Blueprint (`render.yaml`)** o **Cloudflare Named Tunnel** (si se adquiere un dominio propio).

---

## 1. Despliegue principal en Ubuntu Server + Docker Compose

En este modo, el contenedor único `tap-war` compila el cliente web (`apps/web/dist`) y lo sirve desde Colyseus en el mismo origen (`127.0.0.1:2567`), evitando problemas de CORS y simplificando la configuración de OAuth.

### Preparar variables de entorno

Copia `.env.example` a `.env` en la raíz del repositorio (ignorado en Git) y completa tus valores:

```bash
cp .env.example .env
```

Variables principales en `.env`:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: clave pública `sb_publishable_...` de Supabase.
- `VITE_GAME_SERVER_URL`: dejar vacío para que el cliente use automáticamente `window.location.origin`.
- `VITE_GITHUB_AUTH_ENABLED`: `false` o `true`.
- `CORS_ORIGINS`: origen público permitido (por ejemplo `https://mcserver.tailda19bf.ts.net`).
- `TRUST_PROXY`: `true` cuando el tráfico entra por Tailscale Funnel, Cloudflare Tunnel o proxy inverso TLS.

### Operación con Docker Compose

```bash
# Construir e iniciar en segundo plano
docker compose up -d --build

# Comprobar estado y healthcheck
docker compose ps

# Ver registros en vivo
docker compose logs -f tap-war

# Detener el servicio
docker compose down
```

El contenedor escucha exclusivamente en `127.0.0.1:2567` para que todo acceso externo pase cifrado por HTTPS/WSS.

---

## 2. Exposición con Tailscale (equipo y público)

### Solo equipo (Tailscale Serve, sin salir a Internet)

```bash
tailscale serve --bg --https=443 2567
tailscale serve status
```

### Público en Internet (Tailscale Funnel)

1. En la consola de administración de Tailscale (**Access Controls / ACLs**), habilita el atributo `funnel` para el nodo `mcserver` (o el grupo `autogroup:member`).
2. Si deseas operar `tailscale funnel` sin `sudo`, asigna tu usuario Linux como operador una sola vez:

```bash
sudo tailscale set --operator=$USER
```

3. Activa el túnel HTTPS público hacia el puerto local `2567`:

```bash
tailscale funnel --bg --https=443 2567
tailscale funnel status
```

La aplicación quedará disponible públicamente en `https://mcserver.tailda19bf.ts.net` (y sus WebSockets en `wss://mcserver.tailda19bf.ts.net`), manteniendo `http://127.0.0.1:2567/health` como verificación interna.

---

## 3. Alternativa A: Cloudflare Named Tunnel (con dominio propio)

Si en algún momento Tailscale Funnel presenta limitaciones de ancho de banda o prefieres un dominio propio (`.com`, `.dev`, etc.) gestionado en Cloudflare DNS:

1. No es necesario modificar código ni reconstruir la imagen Docker si el contenedor ya corre en `127.0.0.1:2567`.
2. Instala `cloudflared` en el servidor, autentica y crea un túnel apuntando el hostname elegido (ej. `https://tapwar.tudominio.com`) a `http://127.0.0.1:2567` (con WebSockets habilitados en Cloudflare Dashboard → **Network**).
3. Actualiza `CORS_ORIGINS=https://tapwar.tudominio.com` en `.env`, ejecuta `docker compose up -d` y actualiza los orígenes/retornos en Supabase y Google OAuth.

---

## 4. Alternativa B: Render Free Blueprint (`render.yaml`)

El archivo [`render.yaml`](../render.yaml) define dos servicios en el plan gratuito de Render:

- **`tap-war-server`** (*Web Service · Docker · Free*): ejecuta `apps/game-server` usando [`Dockerfile.game-server`](../Dockerfile.game-server). Se suspende tras 15 minutos sin tráfico (~1 minuto de arranque en frío); cuando el usuario abre el lobby web, el cliente realiza un ping previo a `/health` para despertarlo antes de entrar a la arena.
- **`tap-war-web`** (*Static Site*): compila `apps/web`, reescribe `/* -> /index.html` para `/auth/callback` y aplica cabeceras de seguridad.

### Pasos en Render

1. En Render Dashboard selecciona **New → Blueprint** y conecta el repositorio `EMSiiU/TAP-WAR`.
2. Render creará `tap-war-server` y `tap-war-web` y pedirá las variables con `sync: false`:
   - En `tap-war-server`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y, tras conocer la URL del frontend, `CORS_ORIGINS` (ej. `https://tap-war-web.onrender.com`).
   - En `tap-war-web`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_GAME_SERVER_URL` apuntando a la URL HTTPS de `tap-war-server` (ej. `https://tap-war-server.onrender.com`).
3. Si actualizas `VITE_*` en `tap-war-web`, lanza un nuevo deploy del sitio estático para regenerar el bundle con la nueva URL.

---

## 5. Checklist obligatorio de Supabase Auth y Google OAuth

Cada dominio público desde el que se acceda (`https://mcserver.tailda19bf.ts.net`, `https://tap-war-web.onrender.com`, etc.) debe registrarse para que el login y PKCE funcionen correctamente:

### En Supabase Dashboard → Authentication → URL Configuration

- **Site URL**: URL principal de producción (ej. `https://mcserver.tailda19bf.ts.net`).
- **Redirect URLs** (conservar también las de desarrollo local):
  - `http://localhost:5174/auth/callback`
  - `http://localhost:5174/auth/reset-password`
  - `https://mcserver.tailda19bf.ts.net/auth/callback`
  - `https://mcserver.tailda19bf.ts.net/auth/reset-password`
  - *(Si usas Render)* `https://tap-war-web.onrender.com/auth/callback` y `https://tap-war-web.onrender.com/auth/reset-password`

### En Google Cloud → Google Auth Platform → OAuth Client ID

- **Authorized JavaScript origins**:
  - `http://localhost:5174`
  - `https://mcserver.tailda19bf.ts.net`
  - *(Si usas Render)* `https://tap-war-web.onrender.com`
- **Authorized redirect URIs**: mantener el callback HTTPS de Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`).
- **Audiencia / Testing**: mientras la app OAuth esté en modo *Testing*, solo las cuentas añadidas en *Test users* podrán entrar con Google. Para usuarios externos sin límite de lista, publica la app o usa registro por correo/contraseña.
