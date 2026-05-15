# Instalacion nativa desde GitHub

Esta ruta es para un servidor normal Ubuntu/Debian con `systemd`, PostgreSQL local y Nginx como proxy opcional.

Versiones de referencia de esta instalacion:

- OpenProject base: `16.1.1`
- PostgreSQL actual: `13.21`

El instalador usa PostgreSQL major `13` para mantener compatibilidad con tu base actual. OpenProject muestra una advertencia porque desde OpenProject 16.0 PostgreSQL 16 sera requerido en futuras versiones; para esta distribucion personalizada mantenemos PostgreSQL 13 mientras sigas sobre OpenProject 16.1.1.

## Instalacion automatizada

```bash
curl -fsSL https://raw.githubusercontent.com/USUARIO/REPO/main/deploy/native/install.sh -o install-openproject-custom.sh
chmod +x install-openproject-custom.sh
sudo ./install-openproject-custom.sh https://github.com/USUARIO/REPO.git /opt/openproject-custom
```

El instalador:

- pregunta dominio, HTTPS externo, IP de escucha y puerto interno;
- instala dependencias del sistema;
- descarga Node.js;
- clona tu repositorio;
- crea `/etc/openproject-custom/openproject.env`;
- crea usuario y base de datos PostgreSQL;
- instala gems y paquetes npm;
- ejecuta migraciones;
- compila assets;
- crea servicios `systemd`.

Servicios:

```bash
sudo systemctl status openproject-custom-web
sudo systemctl status openproject-custom-worker
```

Logs:

```bash
sudo journalctl -u openproject-custom-web -f
sudo journalctl -u openproject-custom-worker -f
```

El instalador tambien crea un wrapper compatible con los comandos habituales:

```bash
sudo openproject run rake db:migrate
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo openproject logs --tail --lines=200
sudo openproject restart
sudo openproject status
```

## Configuracion

Durante la instalacion se preguntan estos valores:

- dominio, por ejemplo `campus.vinfrancis.es`;
- si usara HTTPS externo desde Nginx Proxy Manager;
- IP interna donde escuchara Puma, normalmente `0.0.0.0`;
- puerto interno, normalmente `8080`.

Tambien puedes ejecutar sin preguntas usando variables:

```bash
sudo OPENPROJECT_HOST_NAME=campus.vinfrancis.es \
  OPENPROJECT_HTTPS=true \
  HOST=0.0.0.0 \
  PORT=8080 \
  ./install-openproject-custom.sh https://github.com/USUARIO/REPO.git /opt/openproject-custom
```

El instalador deja un administrador inicial:

- usuario: `admin`
- contrasena: `admin`

Puedes cambiarlo durante la instalacion con:

```bash
sudo OPENPROJECT_ADMIN_LOGIN=admin \
  OPENPROJECT_ADMIN_PASSWORD='otra-contrasena' \
  OPENPROJECT_ADMIN_MAIL=admin@example.com \
  ./install-openproject-custom.sh https://github.com/USUARIO/REPO.git /opt/openproject-custom
```

Edita:

```bash
sudo nano /etc/openproject-custom/openproject.env
```

Cambia al menos:

- `OPENPROJECT_HOST__NAME`
- `OPENPROJECT_HTTPS`
- claves de IA si usas `ia_colaborativa`
- SMTP si necesitas correo

Luego:

```bash
sudo systemctl restart openproject-custom-web openproject-custom-worker
```

## Nginx

Usa `deploy/native/nginx.conf.example` como base y cambia `server_name`.

## Actualizar desde GitHub

```bash
cd /opt/openproject-custom
sudo ./deploy/native/update.sh /opt/openproject-custom
```
