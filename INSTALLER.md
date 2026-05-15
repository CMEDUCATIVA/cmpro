# Instalador de OpenProject personalizado

Esta copia está pensada para convertirse en un repositorio GitHub con tu versión personalizada de OpenProject. La instalación recomendada es con Docker Compose, construyendo una imagen propia desde este código.

Si quieres instalar en un servidor normal, sin Docker, usa la ruta nativa:

```bash
curl -fsSL https://raw.githubusercontent.com/USUARIO/REPO/main/deploy/native/install.sh -o install-openproject-custom.sh
chmod +x install-openproject-custom.sh
sudo ./install-openproject-custom.sh https://github.com/USUARIO/REPO.git /opt/openproject-custom
```

La guia especifica esta en `deploy/native/README.md`.

Versiones de referencia de esta copia:

- OpenProject `16.1.1`
- PostgreSQL `13.21`

El instalador nativo mantiene PostgreSQL major `13` para ser compatible con esta instalacion.

## Qué se sube a GitHub

Sube el código fuente y tus plugins personalizados:

- `app/`, `config/`, `db/`, `lib/`, `modules/`, `frontend/`, `public/`
- `plugins/`
- `Gemfile`, `Gemfile.lock`, `Gemfile.plugins`
- `package.json`, `package-lock.json`
- `docker/`, `deploy/`

No subas datos privados ni dependencias generadas:

- `files/`
- `log/`
- `tmp/`
- `node_modules/`
- `frontend/node_modules/`
- `vendor/bundle/`
- `deploy/.env`
- dumps de base de datos

El archivo `.gitignore` incluido ya protege esos casos.

## Antes de publicar: secretos

Esta copia puede tener secretos hardcodeados en el plugin `ia_colaborativa`. Si el repositorio sera privado y aceptas ese riesgo, puedes dejarlos tal como estan.

Archivos detectados:

- `plugins/ia_colaborativa/lib/open_project/ia_colaborativa/engine.rb`
- `plugins/ia_colaborativa/app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`

En `engine.rb`, los valores reales para `LIGHTRAG_API_KEY` y `OPENAI_API_KEY` idealmente deberian venir desde `deploy/.env`.

En `ai_button.js`, la contraseña fija del cliente idealmente deberia validarse en backend.

Si mas adelante quieres limpiar esos secretos, ejecuta:

```bash
sudo ./deploy/sanitize-secrets.sh
```

## Crear el repositorio GitHub

Desde esta carpeta:

```bash
# Si esta copia tiene una carpeta .git vacia o rota, renombrala primero:
# sudo mv .git .git.empty-backup

git init
git add .
git commit -m "Initial custom OpenProject distribution"
git branch -M main
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

Si Git avisa de archivos muy grandes, revisa que no estés intentando subir dependencias o backups.

## Instalar en un servidor nuevo

El servidor necesita Docker, Docker Compose v2 y Git.

```bash
curl -fsSL https://raw.githubusercontent.com/USUARIO/REPO/main/deploy/install.sh -o install-openproject-custom.sh
chmod +x install-openproject-custom.sh
sudo ./install-openproject-custom.sh https://github.com/USUARIO/REPO.git /opt/openproject-custom
```

Luego edita:

```bash
/opt/openproject-custom/deploy/.env
```

Cambia al menos:

- `OPENPROJECT_HOST`
- `OPENPROJECT_HTTPS`
- credenciales SMTP si vas a enviar correos

Reinicia:

```bash
cd /opt/openproject-custom
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

La app queda escuchando en el puerto `8080`.

## Backup

```bash
cd /opt/openproject-custom
./deploy/backup.sh
```

Esto genera:

- `database.sql`
- `opdata.tar.gz`
- `env.copy`

## Restaurar datos en otro servidor

Copia la carpeta de backup al servidor nuevo y ejecuta:

```bash
cd /opt/openproject-custom
./deploy/restore.sh /ruta/al/backup
```

## Plugins detectados

En esta copia existen estos plugins locales:

- `plugins/ia_colaborativa`
- `plugins/openproject-documentos`
- `plugins/whatsapp`
- `plugins/costos`

Actualmente `Gemfile.plugins` activa:

- `openproject-ia_colaborativa`
- `openproject-documentos`
- `openproject-whatsapp`

Si también quieres activar `costos`, agrega esta línea a `Gemfile.plugins`:

```ruby
gem "openproject-costos", path: "plugins/costos"
```

Después reconstruye:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```
