# ActionCable funcionamiento (backend)

Este documento describe como funciona el flujo de ActionCable en el backend del
plugin WhatsApp (OpenProject).

## Componentes principales

- Canal: `app/channels/whatsapp_channel.rb`
  - Suscribe por `project_id`.
  - Recibe mensajes publicados por el controller.

- Emisores (broadcast):
  - `app/controllers/whatsapp_controller.rb`
  - Publica eventos cuando entra un webhook y cuando se crea/actualiza un
    mensaje.

## Flujo principal (webhook)

1) WAHA envia un webhook a:
   `WhatsappController#waha_webhook`.
2) El controller normaliza datos, filtra eventos no validos y decide si crea
   mensaje.
3) Si se acepta, guarda el mensaje en BD y publica en ActionCable:
   - Payload con `chat_id`, `message` y `chat`.
4) El canal ActionCable distribuye a los clientes del proyecto.

## Flujo de mensajes creados desde el plugin

1) El usuario envia un mensaje desde la UI.
2) `WhatsappController#create_message` guarda en BD y llama a WAHA.
3) WAHA responde con `waha_id` (si aplica).
4) El controller publica el evento por ActionCable.

## Debug webhook

Se publica debug por ActionCable con etiqueta `debug.webhook`:

- `filter.status_broadcast`
- `filter.group`
- `filter.missing_external_id`
- `filter.non_chat`
- `filter.non_cus`
- `filter.source_api`
- `accept`

Payload tipico:

```
{"session":"CMEDUCATIVA","event":"message.any","from":"5196...@c.us",
"external_id":"5196...@c.us","waha_id":"...","message_type":"text",
"has_media":false}
```

Estos eventos se envian por ActionCable, por lo tanto solo aparecen en la UI
cuando el frontend esta conectado a ActionCable (no en polling).

## Canales Redis

ActionCable usa Redis como backend pub/sub. En Redis se publican eventos con
canales como:

- `open_project_production:whatsapp:project:<ID>`

Estos mensajes se consumen por los procesos ActionCable y se envian a los
clientes WebSocket suscritos.

## Lineas involucradas (referencia rapida)

- Suscripcion ActionCable:
  - `app/channels/whatsapp_channel.rb:1-11`
    - `stream_for "project:<ID>"` en `app/channels/whatsapp_channel.rb:10`

- Webhook (filtros y aceptacion):
  - `app/controllers/whatsapp_controller.rb:777` inicia `waha_webhook`.
  - `filter.status_broadcast`: `app/controllers/whatsapp_controller.rb:815-833`
  - `filter.group`: `app/controllers/whatsapp_controller.rb:834-848`
  - `filter.missing_external_id`: `app/controllers/whatsapp_controller.rb:902-910`
  - `filter.non_chat`: `app/controllers/whatsapp_controller.rb:916-925`
  - `filter.non_cus`: `app/controllers/whatsapp_controller.rb:931-940`
  - `filter.source_api`: `app/controllers/whatsapp_controller.rb:946-954`
  - `accept` (debug): `app/controllers/whatsapp_controller.rb:1027-1042`

- Broadcast de mensaje:
  - Payload: `app/controllers/whatsapp_controller.rb:1250-1263`
  - Envio ActionCable: `app/controllers/whatsapp_controller.rb:1265`
  - Serializacion: `app/controllers/whatsapp_controller.rb:1699`

- Broadcast debug webhook:
  - `app/controllers/whatsapp_controller.rb:1738-1745`

- Frontend ActionCable:
  - Conexion `createConsumer`: `app/assets/javascripts/openproject-whatsapp.js:4239-4266`
  - `connected/disconnected`: `app/assets/javascripts/openproject-whatsapp.js:4270-4282`
  - Mensaje desde ActionCable: `app/assets/javascripts/openproject-whatsapp.js:4354-4355`
  - Mensaje desde polling: `app/assets/javascripts/openproject-whatsapp.js:4417-4418`
  - Log de modo: `app/assets/javascripts/openproject-whatsapp.js:4559`

- Debug UI (toggles):
  - `app/views/whatsapp/_debug.html.erb:1-27`
