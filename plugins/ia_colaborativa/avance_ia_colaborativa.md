# Guia tecnica del plugin `openproject-ia_colaborativa`

Este archivo resume la arquitectura actual del plugin IA Colaborativa, los componentes que lo forman y las rutas para extenderlo sin tocar el core de OpenProject.

██████████████████████████████████████████████████████████████
█ 🎯 OBJETIVO 1 — ARQUITECTURA Y FLUJO GENERAL              █
██████████████████████████████████████████████████████████████

Arquitectura de alto nivel:
```
[Engine Rails]──assets/hooks──▶[Vistas/JS]
       │                             │
       │                             ▼
[Servicios Ruby (Agentes, MCP, Lightrag, Debug)]
       │                             │
       ▼                             ▼
[Controlador / Rutas API]──JSON──▶[Chat flotante]
```
- **Engine** (`lib/open_project/ia_colaborativa/engine.rb`) registra el plugin, define variables de entorno por defecto y expone los assets `ia_colaborativa/chat.{js,css}`.
- **Hooks** (`lib/open_project/ia_colaborativa/hooks.rb`) sólo inyecta `_floating_button.html.erb` en `view_layouts_base_body_bottom`. Ya no existe hook de sidebar.
- **Servicios/Agentes** (`app/services/ia_colaborativa/*`) encapsulan la lógica de IA, MCP, LightRAG y logging.
- **Frontend** (`app/views/ia_colaborativa/hooks/_floating_button.html.erb` + `chat.js`/`chat.css`) brinda la experiencia estilo ChatGPT.

██████████████████████████████████████████████████████████████
█ 🔁 OBJETIVO 2 — CICLO DE PETICION Y RESPUESTA             █
██████████████████████████████████████████████████████████████

Flujo de datos:
```
Usuario -> chat.js -> POST /ia_colaborativa/chat
                   -> ChatController -> Agente (Docs/Obra)
                   -> DebugService registra eventos
                   -> Respuesta JSON -> chat.js -> UI (typewriter/tablas)
```
1. El usuario escribe o adjunta imágenes; `sendIaMessage` crea el payload.
2. `ChatController#create` recibe la petición y selecciona el agente apropiado.
3. El agente consulta Lightrag/MCP, usa `BaseAgent#call_openrouter_api` y registra métricas en `DebugService`.
4. El frontend muestra indicadores de tipeo, convierte Markdown a HTML (con tablas) y vuelve a mostrar el botón enviar.

██████████████████████████████████████████████████████████████████
█ 🧩 OBJETIVO 3 — ENGINE, CONFIGURACION Y HOOKS                 █
██████████████████████████████████████████████████████████████████

Diagrama de responsabilidades:
```
engine.rb
 ├─ before_configuration (ENV por defecto)
 ├─ assets %w(chat.js chat.css)
 ├─ autoload_paths += /app/services
 └─ to_prepare -> require hooks.rb

hooks.rb
 └─ view_layouts_base_body_bottom -> render _floating_button
```
- Las variables `LIGHTRAG_URL`, `MCP_SERVER_URL`, `OPENAI_API_KEY`, etc., deben sobrescribirse en producción.
- No se utiliza ningún hook adicional para el sidebar o headers.

██████████████████████████████████████████████████████████████
█ 🧭 OBJETIVO 4 — RUTAS Y CONTROLADOR                        █
██████████████████████████████████████████████████████████████

```
/ia_colaborativa/chat              (POST) -> ChatController#create
/ia_colaborativa/debug             (GET)  -> estado DebugService
/ia_colaborativa/debug/logs        (GET)  -> logs filtrables
/ia_colaborativa/debug/conversations (GET) -> historial de conversaciones
```
- `ChatController#create` valida parámetros, enruta a SaraDocs/SaraObra y maneja excepciones devolviendo mensajes amigables.
- Los endpoints de depuración entregan snapshots que también consume el panel Debug del front.

██████████████████████████████████████████████████████████████
█ 🧠 OBJETIVO 5 — SERVICIOS, AGENTES Y HANDLERS              █
██████████████████████████████████████████████████████████████

Organigrama:
```
BaseAgent
 ├─ SaraDocsAgent ── LightragService ──> Gemini (texto e imágenes)
 ├─ SaraObraAgent ── Handlers::ProjectsHandler ──> McpService
 └─ OpenaiService (deprecated, reenvía a los agentes nuevos)

DebugService ── almacena logs y estado de salud
McpService    ── wrappers list_* y health-check MCP
LightragService ── wrappers query/insert/health para LightRAG
```
- `SaraDocsAgent` se centra en documentación BIM y puede procesar imágenes vía `ai_vision_model`.
- `SaraObraAgent` consume MCP para listar proyectos, work packages, usuarios, etc., aplicando prompts específicos.
- `Handlers::ProjectsHandler` detecta patrones de consulta (por ID, nivel, jerarquía) y arma prompts base.
- `DebugService` mantiene registros en memoria (máx. 500 logs y 100 conversaciones).

██████████████████████████████████████████████████████████████
█ 🎨 OBJETIVO 6 — FRONTEND (VISTAS, JS Y CSS)                █
██████████████████████████████████████████████████████████████

Mapa del frontend:
```
_floating_button.html.erb
 ├─ <link>/<script> chat.css/chat.js
 ├─ Botón flotante
 ├─ Ventana del chat:
 │    • Header con controles
 │    • Panel bienvenida / mensajes (#ia-chat-messages)
 │    • Footer con input y adjuntos
 └─ Modal de configuración (pestañas General / Automatización / Debug)
```
`chat.js`:
- Delegación de eventos (funciona con Turbo).
- Adjuntos (drag & drop, Ctrl+V) y preview.
- Envío con `fetch`, indicador “Sara está redactando…”, botón enviar/stop.
- `formatMarkdown` estiliza títulos, listas, código y ahora convierte tablas Markdown en `<table>` con bordes.
- Mensajes del usuario tienen un sombreado suave, sin avatars ni efectos hover.
- Panel Debug está dentro del modal y ofrece checkbox para activar/desactivar logging.

`chat.css`:
- Maneja animación del botón, layout responsivo de la ventana, estilizado del scrollbar y chips para atajos rápidos.

██████████████████████████████████████████████████████████████
█ 🚀 OBJETIVO 7 — DEPURACION Y EXTENSIONES FUTURAS          █
██████████████████████████████████████████████████████████████

Diagrama del ecosistema de depuración:
```
DebugService <-> /ia_colaborativa/debug* <-> Modal Debug (pestaña)
                          |
                 (también disponible vía curl)
```
- Usa la pestaña Debug para revisar estado de MCP/Lightrag, logs, historial y activar/desactivar el almacenamiento.
- **Automatización**: la nueva pestaña servirá para que la IA proponga fases/tareas y, una vez añadidos los métodos `create_*` en `McpService`, disparar la creación automática en OpenProject.
- Para extender agentes o handlers, crea nuevas clases en `app/services/ia_colaborativa/*` y actualiza `ChatController` + UI.
- Sobrescribe las variables de entorno del engine en tu `docker-compose` o `systemd` para producción.

Esta guía cubre todo lo necesario para identificar rutas, hooks, servicios y puntos de extensión del plugin IA Colaborativa.
