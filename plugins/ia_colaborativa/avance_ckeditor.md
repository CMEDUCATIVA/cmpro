/======================================================================\
|  OBJETIVO 1 :: Botón IA en la barra de CKEditor ::                   |
\======================================================================/

Logramos la primera integración visible con CKEditor: un botón «IA» ubicado dentro de la propia toolbar. Los problemas iniciales fueron (a) Turbo eliminaba los `<script>` inyectados sin `nonce`, y (b) CKEditor crea las toolbars después del `DOMContentLoaded`, por lo que el botón nunca encontraba un contenedor. Lo resolvimos cargando los assets desde `_floating_button.html.erb` con `nonce: content_security_policy_script_nonce`, registrando los archivos en `lib/open_project/ia_colaborativa/engine.rb` y usando reintentos + `MutationObserver` (`scanExisting()` en `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`) para enganchar las toolbars tan pronto aparecen.

## Arquitectura implementada
1. **Assets dedicados**
   - **JS** (`app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`): busca `.ck.ck-toolbar`, agrega el botón al final de `.ck-toolbar__items`, marca cada toolbar con `data-ia-button` y expone los eventos `ia:ckeditor:request`/`ia:ckeditor:insert` como puntos de extensión.
   - **CSS** (`app/assets/stylesheets/ia_colaborativa/ckeditor/ai_button.css`): replica el estilo de los botones nativos (fondo blanco, hover gris) para que el botón IA no “rompa” la UX.
2. **Hook reutilizado** (`app/views/ia_colaborativa/hooks/_floating_button.html.erb`): incluye los assets del chat y del botón con `nonce`, evitando que Turbo o CSP los bloqueen.
3. **Registro en el engine** (`lib/open_project/ia_colaborativa/engine.rb`): asegura que los assets se precompilen junto con el plugin. Eliminamos el antiguo parcial `_inject_ai_button` porque ya no se necesita.
4. **Fallbacks**: `scanExisting()` reintenta con `setTimeout` cuando no encuentra toolbars y el `MutationObserver` detecta toolbars nuevas para reinsertar el botón en navegaciones Turbo.

### Diagrama ASCII (Objetivo 1)

```
+-------------------------------+        +-------------------------------+
| lib/open_project/.../engine   | -----> | Assets JS/CSS precompilados   |
+-------------------------------+        +-------------------------------+
              | registra hook
              v
+-----------------------------------------------+
| _floating_button.html.erb                      |
| - incluye scripts con nonce                   |
| - deja listo el contenedor del panel IA       |
+-----------------------------------------------+
              | MutationObserver + scanExisting
              v
+-----------------------------------------------+
| ai_button.js                                   |
| - busca .ck-toolbar                            |
| - inserta el boton IA                          |
| - emite eventos ia:ckeditor:*                  |
+-----------------------------------------------+
              | DOM final
              v
+-----------------------------------------------+
| Toolbar CKEditor (.ck-toolbar__items)          |
+-----------------------------------------------+
```

## Resultado
- El botón IA aparece siempre dentro de la toolbar y al hacer clic despliega el panel “💬 Asistente IA” con controles y estado de la consulta.
- El botón `▶` envía la consulta a `/ia_colaborativa/chat` (mock en Objetivo 1) y muestra indicadores mientras llega la respuesta.

---

/======================================================================\
|  OBJETIVO 2 :: Ventana del asistente en CKEditor ::                  |
\======================================================================/

Una vez visible el botón, construimos la ventana del asistente. El panel no se mostraba en navegaciones Turbo porque se desmontaba y no se reinsertaba; añadimos `ensurePanel()`/`ensurePanelAttached()` para reanclarlo y extendimos el `MutationObserver` para volver a montar la UI tras cada carga.

## Alcance
- **UI dentro del editor**: el panel se genera desde `_floating_button.html.erb` reutilizando los assets del chat pero con estilos específicos (`ai_button.css`). Vive fuera del iframe de CKEditor para respetar la CSP.
- **Flujo en dos etapas**: 
  - *Etapa 1*: solo el input (placeholder “Pregunta lo que quieras…”).
  - *Etapa 2*: respuesta, estado, consulta y controles (`Insertar`, `Insertar abajo`, `Intentar de nuevo`, `Detener`, `⧉ Copiar`).
- **Eventos personalizados**: `ia:ckeditor:request` al enviar y `ia:ckeditor:insert` al insertar, lo que permitió depurar fácilmente por qué la ventana no reaccionaba en ciertos proyectos (faltaba escuchar los eventos).

### Diagrama ASCII (Objetivo 2)

```
+----------------------+       +--------------------------------------+
| CKEditor toolbar     | ----> | ensurePanel()/ensurePanelAttached    |
+----------------------+       +--------------------------------------+
                                   | monta panel
                                   v
+----------------------------------------------+
| Panel asistente incrustado                   |
| - Etapa 1: input                             |
| - Etapa 2: respuesta + controles             |
| - Estilos CKEditor                           |
+----------------------------------------------+
          | eventos ia:ckeditor:*              | fetch
          v                                     v
+------------------------------+      +---------------------------+
| UI CKEditor escucha Insertar |<-----| /ia_colaborativa/chat    |
+------------------------------+      +---------------------------+
```

## Archivos clave
- `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`
- `app/assets/stylesheets/ia_colaborativa/ckeditor/ai_button.css`
- `app/views/ia_colaborativa/hooks/_floating_button.html.erb`

---

/======================================================================\
|  OBJETIVO 3 :: Integracion completa con LightRAG ::                  |
\======================================================================/

Una vez estabilizada la UI, reemplazamos el flujo provisional (SaraDocs) por una conexion directa a LightRAG y convertimos en casa el Markdown recibido. Esto nos dio control total sobre el formato y elimino latencia extra.

## Alcance
- **Endpoint dedicado**: registramos `POST /ia_colaborativa/lightrag` en `ia_colaborativa/config/routes.rb`. `IaColaborativa::ChatController#lighrag` delega en `LightragService.query` y devuelve `{ response, source_documents }` sin prompts intermedios.
- **Cliente CKEditor** (`app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`):
  - `handleSend()` genera un `requestId` y hace fetch directo al endpoint, registrando cada etapa (`request:init`, `request:start`, `request:success/error`).
  - `setLoadingState()` muestra "Sara esta redactando..." mientras llega la respuesta y mantiene el historial de la consulta.
- **Motor de maquillaje HTML** (`formatResponseText()`):
  - Limpia backticks y referencias `[1]` (`stripMarkers()`), expande numerales concatenados (`expandInlineLists()`), identifica tablas (`parseTableBlock()`), listas y parrafos.
  - Los encabezados se convierten en `<div class="op-ia-heading level-X">` y las tablas usan la clase `op-ia-table` para heredar estilos de CKEditor.
  - El efecto typing trabaja directamente con HTML (`typeHtmlFragment()`), asi el contenido aparece con formato desde el primer caracter.
- **Insercion coherente**: `insertContentIntoEditor()` sigue usando `getData()/setData()` o los eventos `op:ckeditor:*`, de modo que lo recibido de LightRAG llega como HTML valido y editable.
- **Prompt personalizable**: el modal de configuracion guarda la plantilla en `localStorage`; aunque la consulta va directa, el texto queda listo para futuras pruebas sin tocar codigo.

### Arquitectura ASCII (Objetivo 3)

```
+-----------+    input     +------------------------------+
| Usuario   | -----------> | Panel IA (ai_button.js)      |
+-----------+              | - captura prompt             |
                           | - requestId/logs             |
                           +---------------+--------------+
                                           |
                                           | POST /ia_colaborativa/lightrag
                                           v
                            +-------------------------------+
                            | ChatController#lighrag        |
                            | - delega en LightragService   |
                            +---------------+---------------+
                                            |
                                            | Markdown bruto
                                            v
+-------------------------------+           |
| formatResponseText()          |<----------+
| - stripMarkers/expandInline   |
| - listas, tablas, headings    |
| - HTML final + snippet        |
+---------------+---------------+
                |
                | typing/render + logs
                v
+-------------------------------+
| Controles IA (Insertar, etc.) |
+---------------+---------------+
                |
                | setData()/insertHtml
                v
+-------------------------------+
| Documento CKEditor            |
+-------------------------------+
```

## Archivos tocados
- `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js`
- `app/assets/stylesheets/ia_colaborativa/ckeditor/ai_button.css`
- `ia_colaborativa/config/routes.rb`
- `app/controllers/ia_colaborativa/chat_controller.rb`
- `app/services/ia_colaborativa/lightrag_service.rb`

Con esto, el boton IA envia la consulta sin intermediarios, recibe Markdown crudo de LightRAG y lo transforma en HTML rico listo para insertarse en CKEditor.

---

/======================================================================\
|  OBJETIVO 4 :: Insercion directa en CKEditor ::                      |
\======================================================================/

Una vez que las respuestas estaban listas y formateadas, el siguiente paso fue que los botones "Insertar" e "Insertar abajo" escribieran realmente en el contenido de CKEditor, sin depender de copiar y pegar.

## Alcance y arquitectura

```
   +-------------+         focus/selection         +------------------------+
   | Boton IA    | -------> resolveEditorElements ->| CKEditor editable (.ck)|
   +-----+-------+                                  +--------+---------------+
         |                                                   |
         | CustomEvent (op:ckeditor:getData/setData)         | API nativa (setData/getData)
         v                                                   v
+----------------------+   fallback cuando no hay instancia    +----------------------------+
| createCkeditorEvent  | ------------------------------------> | ckeditor-setup.service.ts   |
+----------------------+                                        +----------------------------+
```

- **Busqueda del editor activo** (`resolveEditorElements()` en `ai_button.js`): detecta el `.ck-editor__editable` enfocado o el primero disponible y encuentra su wrapper `.op-ckeditor-source-element`. Tambien aprovecha la propiedad `editable.ckeditorInstance` para usar directamente `editor.getData()/setData()` cuando existe.
- **Eventos nativos como fallback** (`op:ckeditor:getData` y `op:ckeditor:setData`): se construyen con `CustomEvent` sin burbujas (`createCkeditorEvent`) para que Zone.js/jQuery no alteren `event.detail`, replicando la misma tecnica que usa la suite de tests de OpenProject.
- **Insercion real** (`insertContentIntoEditor()`):
  - `Insertar` reemplaza el contenido via `setData()` y, si falla, reenvia el evento personalizado.
  - `Insertar abajo` lee primero el contenido con `getData()` y concatena `...<p></p>nuevo contenido` antes de escribir.
  - Ambos botones mantienen el foco del editor y siguen emitiendo `ia:ckeditor:insert` para integraciones externas.
- **Depuracion**: se agregaron `console.info/debug` para saber cuando se lanza cada accion, que modo se uso y si hubo problemas al enfocar o encontrar el editor. Asi detectamos los errores `Cannot convert undefined or null to object` y ajustamos el flujo.

## Archivos clave
- `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js` (deteccion de instancia, eventos fallback, logs y pipeline de insercion).
- `openproject-dev/frontend/src/app/shared/components/editor/components/ckeditor/ckeditor-setup.service.ts` (referencia de como el core maneja `op:ckeditor:*`).
- `openproject-dev/spec/support/components/wysiwyg/wysiwyg_editor.rb` (guia para reproducir la interaccion desde tests automatizados).

## Funcionalidad resultante
- `Insertar` reemplaza completamente el contenido del editor activo.
- `Insertar abajo` anexa el HTML de Sara despues del contenido existente.
- Si algun editor no se detecta, los logs indican exactamente en que paso fallo la resolucion.

Con este objetivo completado, la IA no solo genera contenido formateado: tambien lo inserta automaticamente en CKEditor.

---

/======================================================================\
|  OBJETIVO 5 :: Panel de configuracion y depuracion ::               |
\======================================================================/

El uso diario necesitaba ajustes sin editar codigo y una forma de rastrear cada consulta. Implementamos un modal protegido con contraseña (`Vinfrancis230189@1`) que expone dos pestañas: Prompt y Debug.

## Arquitectura

```
+-----------+     abre (tras contraseña)     +-----------------------------------+
| Boton ⚙️    | ----------------------------> | Modal Configuracion IA             |
+-----+-----+                                 |  +---------+  +---------------+  |
      | localStorage                          |  | Prompt  |  | Debug        |  |
      v                                       |  +---------+  +---------------+  |
+---------------------+                       |         ^           ^           |
| debug_button.js     |<----------------------+         |           |           |
| (buffer + eventos)  |   logDebug() eventos            |           | UI        |
+---------------------+                                  |           |          |
                                                         +-----------+----------+
```

- **Password gate**: `ensureSettingsPanel()` muestra primero el formulario de contraseña, valida contra la clave fija y guarda el resultado en `sessionStorage` para no repetirlo durante la sesion.
- **Pestaña Prompt**:
  - Textarea que modifica el template usado por `buildPrompt()`.
  - Guardado en `localStorage` (`opIaCkeditorPrompt`) y boton de restablecer para volver al valor por defecto.
- **Pestaña Debug**:
  - Boton para activar/desactivar el registro (`opIaCkeditorDebugEnabled`).
  - Botones `Refrescar` y `Limpiar` que operan sobre un textarea de solo lectura.
  - Toda la logica de buffer vive en `app/assets/javascripts/ia_colaborativa/ckeditor/debug_button.js`, separada para no saturar `ai_button.js`.
  - El contenedor de logs ahora es redimensionable en dos ejes para revisar respuestas largas sin cerrar el modal.
  - Cada entrada almacena `requestId`, `stage`, `description` y `snippet`, lo que permite rastrear captura, LightRAG, formato e insercion.
- **Canalizacion de eventos**: `ai_button.js` emite `logDebug()` con hitos como `prompt:build`, `request:init/start/success/error`, `response:render`, `response:error-display`, `insert:mode`, etc. `debug_button.js` escucha, almacena (hasta ~500 entradas) y refleja tanto en consola como en UI.

## Archivos clave
- `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js` (modal, password, integracion de pestañas, persistencia del prompt y hooks con debug).
- `app/assets/javascripts/ia_colaborativa/ckeditor/debug_button.js` (registro detallado, almacenamiento y helpers de UI).
- `app/assets/stylesheets/ia_colaborativa/ckeditor/ai_button.css` (estilos del modal, pestañas y textarea de logs).
- `app/views/ia_colaborativa/hooks/_floating_button.html.erb` (nuevos contenedores y botones).
- `lib/open_project/ia_colaborativa/engine.rb` (precompila `debug_button.js`).

## Funcionalidad resultante
- Los administradores ajustan el prompt de Sara directamente desde la UI tras validar la contraseña interna.
- El tab Debug muestra la traza completa: prompt final, ciclo HTTP, longitud de la respuesta renderizada, inserciones en CKEditor y errores JS si existen.
- Los registros incluyen identificadores (`requestId`), etapas descriptivas y fragmentos (`snippet`), por lo que ahora entendemos donde se maquilla o inserta cada respuesta.
- Los cambios persisten en `localStorage`, por lo que sobreviven a recargas mientras no se limpie el almacenamiento del navegador.

---

/======================================================================\
|  OBJETIVO 6 :: Menú ✦ Magic en la barra de CKEditor ::               |
\======================================================================/

Necesitábamos un segundo punto de entrada para nuevas automatizaciones. El objetivo fue clonar el patrón usado por el botón IA pero con un menú contextual tipo “Magic” que despliega acciones jerárquicas (Editar, Generar, Cambiar tono, etc.) dentro de la misma toolbar, manteniendo la compatibilidad con Turbo y CSP.

## Arquitectura (texto)

```
                   ┌─────────────────────────────┐
                   │ CKEditor Toolbar            │
                   │ ┌──────┐ ┌─────┐ ┌───────┐   │
                   │ │ BOLD │ │ ✦   │ │ …     │   │
                   │ └──┬───┘ └─┬───┘ └───────┘   │
                   └────┼───────┼────────────────┘
                        │ensureToolbar() / MutationObserver
                        ▼
                ┌─────────────────────┐
                │ magic_button.js     │
                │  • inserta botón    │
                │  • detecta hover    │
                │  • posiciona menú   │
                └──────────┬──────────┘
                           │
            ┌──────────────┴──────────────┐
            │ Dropdown principal          │
            │ (op-magic-dropdown)         │
            └──────────────┬──────────────┘
                           │hover
                           ▼
              ┌────────────────────────────┐
              │ Submenús dinámicos         │
              │ (.op-magic-panel__submenu) │
              └────────────────────────────┘
```

## Implementación

1. **Nuevo asset JS** – `app/assets/javascripts/ia_colaborativa/ckeditor/magic_button.js`
   - Usa el mismo guard (`window.opMagicCkeditorButtonInitialized`) y el mismo `MutationObserver` que el botón IA.
   - Localiza la toolbar activa y añade el botón ✦ inmediatamente después de “Negrita” (fallback: inicio de la barra).
   - Gestiona el panel como *dropdown* flotante: `showPanel()` se ejecuta en `mouseenter/focus`, `scheduleHide()` lo cierra al salir y `positionPanel()` reubica la ventana durante `resize/scroll`.
   - Define la estructura de menús/submenús (`MENU_OPTIONS`) con las acciones traducidas (Editar, Generar, Cambiar tono/estilo, Traducir).
   - Cada submenú se abre al pasar el cursor (`showSubmenuElement`, `hideAllSubmenus`), manteniendo una navegación simple sin clics.
   - Incluye logs (`[Magic CKEditor] Script inicializado`, `Botón insertado en toolbar`) para depurar.

2. **Estilos** – `app/assets/stylesheets/ia_colaborativa/ckeditor/ai_button.css`
   - Se reutilizó el mismo archivo para evitar más hojas. Se añadieron reglas `.op-magic-dropdown`, `.op-magic-panel__menu(-item)`, `.op-magic-panel__submenu`.
   - El menú copia la estética de CKEditor: fondo blanco, sombra sutil, bordes suaves, caret ASCII (`>`).
   - Se ajustó el ancho mínimo (230 px menú, 200 px submenús) y padding para textos largos como “Generar desde la selección”.
   - CSS deja de recortar (`overflow: visible`) para que los submenús cuelguen sobre el contenido.

3. **Hook y registro**
   - `app/views/ia_colaborativa/hooks/_floating_button.html.erb` carga `magic_button.js` con `nonce` y `defer`.
   - `lib/open_project/ia_colaborativa/engine.rb` añade el asset a la lista `assets %w(...)`, garantizando precompilación.

4. **Backend**
   - No se añadió lógica Ruby nueva, pero el hook/engine ya expone el espacio para futuros endpoints (cuando las acciones Magic necesiten servidores IA distintos).

## Resultado y comportamiento
- El botón ✦ se integra visualmente con CKEditor y responde a las navegaciones Turbo sin duplicarse.
- El menú principal se abre al pasar el mouse; las subpestañas aparecen pegadas al borde derecho y se cierran automáticamente al salir del área.
- Cada acción (por ahora) registra su selección en consola (`[Magic CKEditor] Acción seleccionada: ...`), dejando listo el punto donde conectaremos flujos específicos en próximos objetivos.

### Complementos recientes (Objetivo 6)
- **Reordenamiento de botones**: actualizamos `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js` (Objetivo 1) para colocar el boton IA inmediatamente despues de Magic y compartir el mismo MutationObserver, de modo que ambos aparecen tambien en los editores de work packages.
- **Observacion global**: `resolveEditorElements()` ahora se usa en los dos scripts para detectar contenedores recreados por Turbo/Angular y reinsetar los botones en el orden correcto.
- **Experiencia coherente**: el menu hover mantiene anchos compactos y subpestanas pegadas al borde derecho, replicando el estilo CKEditor sin mensajes extra.

Con este objetivo completado, tenemos una segunda superficie de interacción para experimentos o asistentes especializados sin tocar la UI del botón IA. El patrón es reutilizable: basta con actualizar `MENU_OPTIONS` o enlazar nuevas rutas cuando definamos los flujos.

---
