# Flujo detallado: creación de contacto (CRM y WhatsApp)

Fecha: 2026-02-28

Este documento describe **cómo se crea y actualiza un contacto** en:
1) el **módulo Contactos (CRM)** y
2) el **módulo WhatsApp**,
mostrando cómo ambos están vinculados mediante el modelo `WhatsappContactProfile`.

---

**1) Módulo Contactos (CRM)**

**1.1 Entrada UI**

Archivo: `app/views/contactos/_create_panel.html.erb`

- El formulario principal de creación se construye con:
  - `form_with url: whatsapp_plugin_project_contactos_create_path(@project)`
- Los campos base (nombre, email, teléfono, etc.) se renderizan aquí.
- Los campos personalizados se renderizan vía:
  - `app/views/contactos/_field_input.html.erb`

**1.2 Envío**

Ruta:
- `POST /projects/:project_id/contactos`  
  → `ContactosController#create`

Archivo: `app/controllers/contactos_controller.rb`

**create**
- Crea el objeto con `WhatsappContactProfile.new(contact_params)`
- Asigna `contact.project = @project`
- Guarda con `contact.save`
- Si éxito:
  - `WhatsappContactTag.ensure_for_project(@project, contact.tags)`
  - redirige a la ficha del contacto
- Si error:
  - redirige con `alert`

**contact_params**
- Permite:
  - Campos base: `first_name`, `last_name`, `email`, `phone`, etc.
  - `tags` y `custom_fields`
- Si viene `tags_text`, lo convierte a `tags` (array)

**Resultado CRM**
- Se crea un `WhatsappContactProfile` vinculado al proyecto.
- Las etiquetas se sincronizan en `WhatsappContactTag`.

---

**2) Módulo WhatsApp**

En WhatsApp el contacto se **crea/actualiza** por `chat_id`.

**2.1 Entrada UI**

Archivo: `app/views/whatsapp/index.html.erb`

- Panel: “Formulario de tarjeta”
- Inputs:
  - `#wa-edit-first-name`
  - `#wa-edit-last-name`
  - `#wa-edit-email`
  - `#wa-edit-phone`
  - `#wa-edit-tags`
  - `custom_fields`

**2.2 Apertura del panel**

Archivo: `app/assets/javascripts/openproject-whatsapp.js`

- `bindChatEditPanel()`
  - Click en `.wa-chat-edit`
  - Llama a `openChatEditPanel(chatId, chatTitle, externalId)`
  - Carga datos con:
    - `GET .../whatsapp/contacts/profile?chat_id=...`

**2.3 Guardado**

Archivo: `app/assets/javascripts/openproject-whatsapp.js`

- Click en `.wa-chat-edit-save`
  - Construye `payload` con:
    - campos base
    - `tags`
    - `custom_fields` (`collectCustomFieldValues()`)
  - Envía:
    - `POST .../whatsapp/contacts/profile`
  - Actualiza UI:
    - Título, teléfono, email, etiquetas en la tarjeta
  - Cierra panel

**Resultado WhatsApp**
- Si no existe contacto para ese `chat_id`, se crea.
- Si ya existe, se actualiza.

---

**3) Vinculación entre CRM y WhatsApp**

**Modelo común**
- `WhatsappContactProfile`

**Vínculo por:**
- `project_id`
- `chat_id`
- `external_id` / `phone` / `email`

En CRM:
- `ContactosController#create` crea/actualiza contactos manualmente.

En WhatsApp:
- `WhatsappController#contact_profile` / `upsert_contact_profile`
  - Crea/actualiza contacto ligado a chat.

**Efecto**
- Lo que se guarda en WhatsApp aparece en CRM.
- Lo que se guarda en CRM aparece en WhatsApp.

---

**4) Campos personalizados**

Modelo:
- `WhatsappContactField`

Valores:
- `WhatsappContactProfile.custom_fields` (JSON)

Visibilidad:
- `visible_in_chat_card`

En WhatsApp:
- Solo se muestran los fields con `visible_in_chat_card = true`

En CRM:
- Siempre se muestran los activos (`active = true`)

---

**5) Tags**

Modelo:
- `WhatsappContactTag`

Flujo:
- CRM:
  - `ensure_for_project` al crear/actualizar contacto
- WhatsApp:
  - se guardan vía `tags` y se reflejan en la tarjeta del chat

---

**Archivos clave**

- `app/controllers/contactos_controller.rb`
- `app/views/contactos/_create_panel.html.erb`
- `app/views/contactos/_field_input.html.erb`
- `app/views/whatsapp/index.html.erb`
- `app/assets/javascripts/openproject-whatsapp.js`

---

**6) WhatsApp: Crear paquete de trabajo (Work Package) y vínculo con Chat Card**

**6.1 UI**

Archivo: `app/views/whatsapp/index.html.erb`

- El panel “Formulario de tarjeta” incluye:
  - `<%= render "whatsapp_relaciones" %>`
- Los endpoints de WP se inyectan en `.wa-shell`:
  - `data-wa-wp-types-url`
  - `data-wa-wp-create-url`
  - `data-wa-wp-related-url`
  - `data-wa-wp-delete-url`
  - `data-wa-wp-unlink-url`

**6.2 JS (cliente)**

Archivo: `app/assets/javascripts/whatsapp_relaciones.js`

- `getChatId()`:
  - lee `input[name='chat_id']`
  - ese valor se setea cuando se abre el editor (chat card activo)

- `bindCreate()`:
  - click en `[data-wa-wp-create]`
  - valida `chat_id`, `type_id` y `subject`
  - llama `createWorkPackage(chatId, typeId, subject)`

- `createWorkPackage()`:
  - `POST data-wa-wp-create-url`
  - `body: { chat_id, type_id, subject }`
  - si OK, limpia subject y recarga relacionados con `loadRelated(chatId)`

- `loadRelated(chatId)`:
  - `GET data-wa-wp-related-url?chat_id=...`
  - renderiza la lista en `data-wa-wp-related-list`

**6.3 Backend (controlador)**

Archivo: `app/controllers/whatsapp_controller.rb`

- `create_related_work_package`:
  1. Busca chat:
     - `WhatsappChat.find_by!(id: params[:chat_id], project: @project)`
  2. Valida permisos (`add_work_packages`)
  3. Crea el WP con `WorkPackages::CreateService`
  4. Crea relación:
     ```ruby
     WhatsappWorkPackageRelation.create!(
       project: @project,
       chat: chat,
       contact_profile: profile,
       work_package: work_package,
       created_by: User.current
     )
     ```

- `related_work_packages`:
  - filtra por `chat_id` y/o `contact_profile_id`
  - devuelve lista de WPs ligados al chat

- `unlink_related_work_package`:
  - elimina la relación sin borrar el WP

- `destroy_related_work_package`:
  - elimina relación y borra el WP

**6.4 Vínculo con Chat Card**

El vínculo existe porque:
1. El editor **setea `chat_id`** en un input hidden.
2. `createWorkPackage()` **envía ese `chat_id`** al backend.
3. El backend crea `WhatsappWorkPackageRelation` con `chat_id`.
4. Al abrir el editor, `loadRelated(chatId)` usa ese id para mostrar los WPs relacionados.

