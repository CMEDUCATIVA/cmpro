# wa-chat-card.md

Este documento describe **toda la funcionalidad** de `wa-chat-card` (tarjetas de chat) en el modulo WhatsApp: estructura, render, eventos, fetch, realtime, polling y botones.

## 1) Ubicacion y archivos clave
- Vista (HTML + CSS): `app/views/whatsapp/index.html.erb`
- Logica frontend: `app/assets/javascripts/openproject-whatsapp.js`
- Backend (chats y mensajes): `app/controllers/whatsapp_controller.rb`
- Backend (macros/flows): `app/controllers/email_email_controller.rb`

## 2) Estructura HTML de la tarjeta
En la lista lateral de chats (`.wa-chat-list`) cada tarjeta se renderiza como:

- Contenedor: `.wa-chat-card` (div)
  - Atributos: `data-chat-id`, `data-chat-external-id`
- Link interno: `.wa-chat-link` (a)
  - Atributos: `data-whatsapp-chat-link`, `data-chat-id`, `data-chat-external-id`
  - Contenido:
    - Acciones: editar, IA, favorito, eliminar, hora
    - Titulo
    - Telefono, email
    - Preview del ultimo mensaje + badge de no leidos
- Panel IA (dentro de la tarjeta): `.wa-ia-panel`
  - Header con titulo y boton cerrar
  - Body con selector de macros y boton de disparo
  - Se abre/cierra con clase `.is-open`
  - Por defecto esta oculto (`display: none`) y solo se muestra al abrir

El panel IA **no esta dentro del link** para evitar navegacion y permitir clicks sin refrescar.

## 3) Render inicial (server-side)
`WhatsappController#index` arma `@chats` y renderiza la lista con datos:
- `title`, `preview`, `time_label`
- `phone`, `email`
- `unread_count`
- `favorite`

Se marca como activa con clase `is-active` si `@active_chat` coincide con el chat.

## 4) Render dinamico (client-side)
### 4.1 Render de lista
Funcion: `renderChatList(chats)`
- Limpia `.wa-chat-list` y la reconstruye.
- Para cada chat llama `buildChatCardNode(chat)`.
- Evita re-render si la firma del listado no cambia (`waRenderKey`).

### 4.2 Construccion de tarjeta
Funcion: `buildChatCardNode(chat)`
- Crea `.wa-chat-card` (div)
- Crea `.wa-chat-link` (a) con `href` a `?chat_id=...`
- Inserta acciones, metadata y preview.
- Llama `ensureIaPanel(card)` para agregar/actualizar el panel IA.

### 4.3 Actualizacion de tarjeta
Funcion: `updateChatCard(chat, options)`
- Busca la tarjeta por `data-chat-id`.
- Actualiza titulo, preview, hora, telefono, email, unread badge.
- Si `moveToTop` es true, mueve la tarjeta al inicio.
- Siempre llama `ensureIaPanel(card)` al final.

## 5) Click y fetch (sin refresh)
### 5.1 Interceptar click
Funcion: `bindChatLinks()`
- Captura clicks en `.wa-chat-link`.
- Si el click viene de botones internos (editar, IA, favorito, eliminar, macros), **se ignora** para no navegar.
- En click valido: previene navegacion y hace `fetch` JSON.

### 5.2 Fetch del chat activo
`requestJson(link.href)` devuelve:
- `chat` (datos de cabecera)
- `messages` (listado)
- `has_more`, `oldest_id`, `load_url`

Luego:
- `updateChatCard(payload.chat)`
- `updateHeader(payload.chat)`
- `updateMessages(payload.messages, ...)`
- `setActiveChat(payload.chat.id)`
- `markChatRead(payload.chat.id)`

**Resultado:** cambio de chat sin refrescar pagina.

## 6) Estado activo y estilos
### 6.1 Clase activa
`setActiveChat(chatId)` pone `is-active` en la tarjeta correcta.

### 6.2 Estilos
En `app/views/whatsapp/index.html.erb`:
- `.wa-chat-card` (base)
- `.wa-chat-card:hover` (hover)
- `.wa-chat-card.is-active` (borde/gradiente verde)
- `.wa-unread-badge` (no leidos)
- `.wa-chat-link` (link interno, sin decoracion)
- `.wa-ia-panel` y controles de macros (solo dentro del panel)

## 7) Botones de la tarjeta
### 7.1 Editar
- Selector: `.wa-chat-edit`
- Handlers: `bindChatEditPanel()`
- Abre panel de edicion con datos del chat.

### 7.2 IA (Automatizacion e IA)
- Selector: `[data-wa-chat-ia="true"]`
- Handler: `bindIaPanel()`
- Abre panel tipo cortina dentro de la tarjeta (`.wa-ia-panel`).
- Cierre: boton con `data-wa-ia-close` o click fuera del panel.

### 7.3 Favorito
- Selector: `.wa-chat-favorite`
- Handler: `bindFavoriteToggle()`
- Endpoint: `POST /projects/:project_id/whatsapp/chats/:id/favorite`

### 7.4 Eliminar
- Selector: `.wa-chat-delete`
- Handler: `bindDeletedChatSync()` / confirmaciones
- Endpoint: `DELETE /projects/:project_id/whatsapp/messages?chat_id=...`

### 7.5 Macros (automations)
- Selector: `<select data-wa-ia-macro-select>`
- Boton: `<button data-wa-ia-macro-run>`
- Handler: `bindIaPanel()` (maneja disparo dentro del panel)
- Lista de macros:
  - Preferencia: `data-wa-macros-list-url` (flow_list)
  - Fallback: opciones renderizadas desde `@macro_flows`
- Ejecutar macro:
  - `POST /projects/:id/email/flows/run?flow_id=...&macro_node_id=...&chat_id=...`

## 8) Realtime (ActionCable)
- Canal: `WhatsappChannel`
- En `setupRealtime()`, suscribe a `{ channel: "WhatsappChannel", project_id: ... }`
- Al recibir:
  - `updateChatCard(data.chat)`
  - `applyMessageToCard(...)`
  - `fetchChatCard(...)` para refrescar datos
  - Si el chat es el activo, agrega el mensaje al body

**Si ActionCable se conecta, se desactiva polling.**

## 9) Polling
### 9.1 Mensajes del chat activo
`startChatPolling()` cada 5s (si no hay ActionCable):
- Solo si hay `chat_id` activo
- GET `?chat_id=...` y agrega mensajes nuevos

### 9.2 Lista de chats
`startChatListPolling()` cada 5s:
- GET `/whatsapp/chats/search` (segun filtro)
- Re-render de lista con `renderChatList()`
- Mantiene scroll y re-aplica `setActiveChat()` si hay chat activo

## 10) Endpoints usados por wa-chat-card
- `GET /projects/:id/whatsapp?chat_id=...` (HTML o JSON)
- `GET /projects/:id/whatsapp/chats/search` (lista de chats)
- `POST /projects/:id/whatsapp/chats/:id/favorite`
- `POST /projects/:id/whatsapp/chats/:id/read`
- `DELETE /projects/:id/whatsapp/messages?chat_id=...`
- `POST /projects/:id/email/flows/run` (macro)
- `GET /projects/:id/email/flows/list?macros_only=1` (macros)

## 11) Notas importantes
- El panel IA **no debe estar dentro del link** para evitar refresh.
- El select y el boton de disparo del panel IA **no cambian de chat** porque se bloquea el click en `bindChatLinks()`.
- Si no hay `chat_id` en la URL, no se marca tarjeta activa en `bindAll()`.
- El panel IA se mantiene oculto por CSS hasta abrirse (`display: none`); evita que se “asome” fuera de la tarjeta.

---

Si necesitas anexar diagramas o incluir ejemplos de payload, dime y los agrego.
