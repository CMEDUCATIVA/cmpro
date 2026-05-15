# IA Colaborativa (OpenProject Plugin)

Este plugin integra un chat de IA dentro de OpenProject y provee agentes especializados para diferentes tipos de consulta (general, documentacion BIM y CDE/obra). Incluye UI embebida en el proyecto, endpoints API y servicios para conectarse con proveedores IA, LightRAG y un MCP externo.

## Modulos y UI

- **Chat embebido (modulo IA colaborativa)**: interfaz principal dentro del proyecto, con sidebar propio y estilos claros.
- **Chat flotante**: UI original inyectada por hook, activa en todo OpenProject.
- **Selector de agentes** y **selector de proyectos** (para Sara-Obra).
- **Panel de ajustes** y **debug**.

## Agentes

### 1) Sara-GPT (General)
Agente generalista con enfoque BIM/Lean/PMI. Usa el proveedor configurado (OpenRouter/OpenAI compatible) y soporta imagenes.

Archivo: `app/services/ia_colaborativa/sara_agent.rb`

### 2) Sara-Docs-GPT (Documentacion BIM)
Agente especializado en normas BIM (ISO 19650), formatos IFC/BCF y documentacion tecnica. Consulta LightRAG y soporta vision.

Archivo: `app/services/ia_colaborativa/sara_docs_agent.rb`

### 3) Sara-Obra-GPT (CDE / MCP)
Agente conectado a un MCP externo para datos en tiempo real del CDE. Usa `agent_type = 'cde'` y requiere seleccion de proyecto.

Archivo: `app/services/ia_colaborativa/sara_obra_agent.rb`

## Servicios

- **BaseAgent**: wrapper HTTP para proveedores IA (OpenRouter/OpenAI-compatible), manejo de tokens, modelo y logs.
  - Archivo: `app/services/ia_colaborativa/base_agent.rb`
- **LightRAG**: consultas y subida de documentos.
  - Archivo: `app/services/ia_colaborativa/lightrag_service.rb`
- **MCP**: integracion con servidor MCP para proyectos, work packages y usuarios.
  - Archivo: `app/services/ia_colaborativa/mcp_service.rb`

## Endpoints principales

Rutas en `config/routes.rb` (namespace `ia_colaborativa`):

- `POST /ia_colaborativa/chat` (chat principal)
- `POST /ia_colaborativa/lightrag` (consulta directa LightRAG)
- `POST /ia_colaborativa/automation_flow` (automatizaciones)
- `GET /ia_colaborativa/search_projects` (buscador de proyectos)
- Debug: `/ia_colaborativa/debug`, `/debug/logs`, `/debug/conversations`
- Settings: `/provider_settings`, `/mcp_settings`

## Configuracion

La configuracion puede venir de base de datos o variables de entorno:

- **Proveedor IA**: `OPENAI_API_BASE`, `OPENAI_API_KEY`, `OPENAI_MODEL`
- **LightRAG**: `LIGHTRAG_URL`, `LIGHTRAG_API_KEY`
- **MCP**: `MCP_SERVER_URL`, `MCP_SERVER_USERNAME`, `MCP_SERVER_PASSWORD`

## Modelos / Persistencia

- `ProviderSetting`, `McpSetting`, `LightragSetting`
- `PebAutomation` (automatizaciones)

Migraciones en `db/migrate`.

## Archivos clave

- Engine y hooks: `lib/open_project/ia_colaborativa/engine.rb`, `lib/open_project/ia_colaborativa/hooks.rb`
- Controladores: `app/controllers/ia_colaborativa/chat_controller.rb`, `settings_controller.rb`, `mcp_settings_controller.rb`
- UI principal: `app/views/ia_colaborativa/hooks/_floating_button.html.erb`
- JS/CSS: `app/assets/javascripts/ia_colaborativa/chat.js`, `app/assets/stylesheets/ia_colaborativa/chat.css`

