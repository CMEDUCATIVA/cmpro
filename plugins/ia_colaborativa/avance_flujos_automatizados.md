## Objetivo 1 â Panel Drag & Drop de AutomatizaciÃ³n

### TÃ­tulo creativo
**âWorkshop PEB en vivo: arrastra, suelta y configura tus fases al instante.â**

### Estructura del panel y archivos involucrados
```
Panel IA (hook _floating_button.html.erb) â modal/chat (chat.js/chat.css)
ââ PestaÃ±a âAutomatizaciÃ³nâ (panel #peb-auto-root)
   ââ automation.js
   â   ââ renderContainer + renderChildCreator (UI, formulario, estado)
   â   ââ saveCard / persistPlan (POST /ia_colaborativa/peb_auto)
   â   ââ configureDragDropModule/ensureDragDropModule (sincroniza drag_drop_automation)
   ââ drag_drop_automation.js (nuevo mÃ³dulo)
       ââ bindContainer (envolventes)
       ââ bindChild + bindDropZone (tarjetas hijas)
       ââ moveChild/computeDropIndex (calcula destino y reordena)
       ââ emite evento peb:auto:drag-ready para reconfigurar automation.js si se carga despuÃ©s
```

### QuÃ© se hizo en el frontend
- `automation.js` actualizÃ³ el header de cada tarjeta madre para mostrar Tipo, `type_id` y nombre en una sola fila, ademÃ¡s de controlar formularios y acciones; tambiÃ©n reorganizÃ³ cada tarjeta hija para que su primera fila muestre Tipo y `type_id` y la segunda fila el nombre del elemento. `ensureDragDropModule()`/`configureDragDropModule()` con reintentos y la escucha de `peb:auto:drag-ready` garantizan que `drag_drop_automation.js` se configure incluso si se carga despuÃ©s.
- `drag_drop_automation.js` abstrae los eventos drag de envolventes e hijos, utiliza `moveChild`/`computeDropIndex` para calcular la posiciÃ³n de inserciÃ³n y fuerza `dropEffect` a `move` para evitar el icono prohibido.
- El mÃ³dulo estÃ¡ registrado en `engine.rb` y se incluye antes de `automation.js` en `_floating_button.html.erb`, de modo que la UI siempre carga con el drag & drop listo.

### QuÃ© se hizo en el backend
- El controlador `IaColaborativa::PebAutoController` sigue exponiendo POST `/ia_colaborativa/peb_auto` para crear/actualizar/eliminar, validando `project_id` y usando `IaColaborativa::PebAutomation` para persistir en la tabla `peb_automations`.
- La normalizaciÃ³n (`normalizePlan`) mantiene `payload.containers` con `id`, `type_id`, `children`, collapso y `types` personalizados; cada respuesta incluye el plan actualizado para que `automation.js` re-renderice sin perder foco o drag & drop.
- Los cambios en el frontend directamente sincronizan con ese endpoint: `queueSaveCard`, `saveCard`, `deleteCard` y `loadCards` mantienen el Ã¡rbol de fases en memoria y en la base de datos, lo que permite que el drag & drop se vea reflejado en cada refresh.
Automatizar la creaciÃ³n de fases y tareas (work packages) en OpenProject/MCP a partir de instrucciones en lenguaje natural guiadas por SaraIA Obra.

## Flujo propuesto (sin implementar aÃºn)
1. **DetecciÃ³n del intento**  
   - En el chat, el usuario expresa algo como âQuiero hacer un plan de ejecuciÃ³n BIMâ.  
   - SaraIA Obra reconoce la intenciÃ³n gracias a un detector (puede ser un intent especÃ­fico o una pregunta directa).

2. **ConfirmaciÃ³n del proyecto**  
   - La IA solicita el nombre del proyecto.  
   - Normaliza el texto y consulta MCP (`search_projects_by_name`).  
   - Si hay mÃºltiples resultados, los lista para confirmaciÃ³n; cuando el usuario confirma, se guarda el `project_id` para el resto del flujo.

3. **Editor de automatizaciÃ³n**  
   - Se abre la pestaÃ±a âAutomatizaciÃ³nâ dentro del modal de configuraciÃ³n.  
   - AllÃ­ se carga un plan base (ejemplo PEB) en formato JSON estructurado: Fases â Tareas.  
   - El usuario puede arrastrar/soltar fases y tareas, renombrar, aÃ±adir o eliminar entradas antes de crear nada en MCP. El JSON se mantiene actualizado con cada interacciÃ³n.

4. **Asistencia de la IA**  
   - SaraIA Obra puede sugerir nombres, descripciones o ajustes basados en el PEB compartido.  
   - Es importante que la IA Ãºnicamente modifique el JSON del editor tras pedido del usuario y muestre los cambios para confirmaciÃ³n.

5. **ConfirmaciÃ³n final y creaciÃ³n**  
   - El usuario revisa el resumen final (fases y tareas, responsables, fechas, etc.).  
   - Al dar âCrear planâ, el backend:
     1. Crea las fases (actualmente se modelarÃ­an como versiones) mediante MCP.  
     2. Crea los work packages asociados usando los IDs de las fases reciÃ©n creadas.  
   - Se reporta el resultado (Ã©xitos y errores puntuales). Los logs se guardan en `DebugService` como âautomation_planâ para auditorÃ­a.

## Beneficios esperados
- Mantener al usuario en control (edita/ordena el plan antes de crearlo).
- Usar MCP sÃ³lo cuando el plan ya estÃ¡ confirmado (menos errores).
- Trazabilidad completa gracias a `DebugService` (JSON antes y despuÃ©s).

## PrÃ³ximos pasos
- Definir quÃ© endpoints de MCP se usarÃ¡n para crear versiones/fases (si no existen, extender el MCP).
- DiseÃ±ar el JSON que se editarÃ¡ en la pestaÃ±a "AutomatizaciÃ³n".
- Crear un `AutomationService` que coordine IA â ediciÃ³n â MCP.
- Integrar el detector de intenciÃ³n para disparar el flujo desde el chat principal.

---

## Objetivo 2 â DetecciÃ³n automÃ¡tica de usuario en sesiÃ³n

### TÃ­tulo creativo
**"SaraIA Obra te reconoce: saludo personalizado con tu nombre en cada conversaciÃ³n."**

### Problema a resolver
Cuando los usuarios interactuaban con SaraIA Obra, la IA no sabÃ­a quiÃ©n estaba escribiendo. Esto generaba respuestas genÃ©ricas sin personalizaciÃ³n, y en algunos casos listaba proyectos automÃ¡ticamente sin que el usuario lo solicitara.

### SoluciÃ³n implementada
Se implementÃ³ un sistema de detecciÃ³n automÃ¡tica del usuario en sesiÃ³n que extrae la informaciÃ³n del componente `<opce-principal>` de OpenProject y la envÃ­a al backend para personalizar las respuestas de la IA.

### Arquitectura del flujo

```
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â  Frontend (chat.js)                                         â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
â  â 1. Usuario escribe mensaje en SaraIA Obra           â   â
â  â 2. extractCurrentUser() busca <opce-principal>      â   â
â  â 3. Extrae data-principal (JSON)                     â   â
â  â    â { id: 4, name: "Francis Vin", href: "..." }   â   â
â  â 4. Agrega current_user al payload                   â   â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
âââââââââââââââââââââââ¬ââââââââââââââââââââââââââââââââââââââââ
                      â POST /ia_colaborativa/chat
                      â { message, agent_type: 'cde', current_user }
                      â¼
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â  Backend (chat_controller.rb)                               â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
â  â 1. Recibe current_user_data del payload             â   â
â  â 2. Extrae nombre: current_user_data['name']        â   â
â  â 3. Log: "ð¤ Usuario: Francis Vin"                  â   â
â  â 4. Pasa a SaraObraAgent.chat(message, user_data)   â   â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
âââââââââââââââââââââââ¬ââââââââââââââââââââââââââââââââââââââââ
                      â
                      â¼
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
â  SaraObraAgent (sara_obra_agent.rb)                         â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
â  â 1. Extrae user_name del hash recibido               â   â
â  â 2. Construye system_prompt(user_name)               â   â
â  â    â Si user_name existe:                           â   â
â  â      "SIEMPRE saluda con: Hola Francis Vin, ..."   â   â
â  â 3. EnvÃ­a prompt personalizado a Gemini              â   â
â  â 4. IA responde: "Hola Francis Vin, [respuesta]"    â   â
â  âââââââââââââââââââââââââââââââââââââââââââââââââââââââ   â
âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
```

### Archivos modificados

#### 1. Frontend: `chat.js`

**FunciÃ³n extractCurrentUser() (lÃ­neas 969-994)**
```javascript
window.extractCurrentUser = function () {
  try {
    const principalElement = document.querySelector('opce-principal[data-principal]');
    if (!principalElement) return null;

    const principalData = principalElement.getAttribute('data-principal');
    if (!principalData) return null;

    const principal = JSON.parse(principalData);

    return {
      id: principal.id,
      name: principal.name,
      href: principal.href
    };
  } catch (error) {
    console.error('â Error al extraer usuario en sesiÃ³n:', error);
    return null;
  }
};
```

**IntegraciÃ³n en sendIaMessage() (lÃ­neas 445-463)**
```javascript
// Extraer informaciÃ³n del usuario en sesiÃ³n
var currentUser = window.extractCurrentUser();

console.log('ð¤ Enviando mensaje al backend:');
console.log('   - Usuario en sesiÃ³n:', currentUser);

// Preparar el body del request
var requestBody = {
  message: text || 'Analiza esta imagen',
  agent_type: agentToSend
};

// Agregar usuario si existe
if (currentUser) {
  requestBody.current_user = currentUser;
}
```

#### 2. Backend: `chat_controller.rb`

**RecepciÃ³n de datos del usuario (lÃ­neas 9, 17, 31)**
```ruby
def create
  message = params[:message].to_s.strip
  agent_type = params[:agent_type].to_s.strip
  image_data = params[:image_data]
  current_user_data = params[:current_user]  # <-- NUEVO

  # Log de entrada
  Rails.logger.info "ð¤ Usuario: #{current_user_data.present? ? current_user_data['name'] : 'No detectado'}"

  # Rutear segÃºn el agente seleccionado
  ai_response = case agent_type
                when 'cde'
                  ::IaColaborativa::SaraObraAgent.chat(message, current_user_data)  # <-- NUEVO PARÃMETRO
```

#### 3. Agente IA: `sara_obra_agent.rb`

**MÃ©todo chat con usuario (lÃ­neas 75-81)**
```ruby
def chat(message, current_user_data = nil)
  start_time = Time.current
  log_info "Consultando datos del CDE"

  # Extraer nombre del usuario si estÃ¡ disponible
  user_name = current_user_data&.dig('name') || current_user_data&.dig(:name)

  # Log user query
  DebugService.log_user_query(agent_name, message)
```

**System prompt personalizado (lÃ­neas 42-76)**
```ruby
def system_prompt(user_name = nil)
  greeting = if user_name.present?
    "Hola #{user_name}, "
  else
    ""
  end

  <<~PROMPT
    Eres SaraIA Obra, la asistente de gestiÃ³n de proyectos de CMPROYECTOS.

    IMPORTANTE:
    - #{user_name.present? ? "SIEMPRE saluda al usuario con su nombre (#{user_name}) en la PRIMERA respuesta de la conversaciÃ³n" : "NO te presentes al inicio"}
    - Si es la primera interacciÃ³n, inicia con: "#{greeting}"
    - DespuÃ©s del saludo inicial, responde DIRECTAMENTE a la pregunta sin repetir saludos
    - Solo proporciona la informaciÃ³n solicitada

    Responde siempre en espaÃ±ol de forma clara y directa.
  PROMPT
end
```

**PropagaciÃ³n del nombre de usuario (lÃ­neas 107, 297, 320)**
```ruby
# En chat():
response = process_mcp_response(message, handler_result, user_name)

# En process_mcp_response():
def process_mcp_response(message, handler_result, user_name = nil)
  # ...
  sys_prompt = custom_system_prompt || system_prompt(user_name)
  result = call_openrouter_api(prompt, sys_prompt)
```

### Comportamiento resultante

**Antes:**
```
Usuario: hola
SaraIA Obra: AquÃ­ estÃ¡n los proyectos disponibles:
1. Proyecto A (ID: 123)
2. Proyecto B (ID: 456)
...
```

**DespuÃ©s:**
```
Usuario: hola
SaraIA Obra: Hola Francis Vin, Â¿en quÃ© puedo ayudarte con la gestiÃ³n de proyectos de CMPROYECTOS?

Usuario: lista los proyectos
SaraIA Obra: AquÃ­ estÃ¡n los proyectos disponibles:
1. Proyecto A (ID: 123)
2. Proyecto B (ID: 456)
...
```

### Ventajas de la implementaciÃ³n

1. **PersonalizaciÃ³n automÃ¡tica**: La IA detecta y usa el nombre del usuario sin configuraciÃ³n manual
2. **InteracciÃ³n natural**: Solo muestra informaciÃ³n cuando se solicita explÃ­citamente
3. **Trazabilidad**: Los logs registran quÃ© usuario hizo cada consulta
4. **Fallback robusto**: Si no detecta usuario, funciona normalmente sin errores
5. **Sin cambios en base de datos**: Usa datos ya existentes en OpenProject

### Logs de depuraciÃ³n

El sistema registra en cada peticiÃ³n:
```
ð¯ ChatController - Nueva consulta
   ð Mensaje: hola
   ð¤ Agent Type recibido: 'cde'
   ð¼ï¸ Imagen: No
   ð¤ Usuario: Francis Vin
ðï¸ Ruteando a: SaraObraAgent
```

### PrÃ³ximos pasos
- Implementar detecciÃ³n de saludos para evitar listar proyectos automÃ¡ticamente (Objetivo 3)
- Guardar historial de conversaciÃ³n por usuario
- Usar el `user_id` para filtrar proyectos personalizados del usuario

## **Objetivo 3**  Asegurar que SaraIA Obra detecte intenciones y use los prompts adecuados

### Arquitectura creativa del flujo
```
┌─────────────────────────┐        ┌─────────────────────────────────────┐
│         Usuario         │──►────►│ app/javascript/.../chat.js (frontend)│
│  consulta SaraIA Obra   │        │  - captura message, current_user,     │
└─────────────────────────┘        │    project_payload                   │
                                    └─────────────────────────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────────────────────┐
                                    │ app/controllers/ia_colaborativa/     │
                                    │ chat_controller.rb                   │
                                    │  - valida project_id cuando intent=WP│
                                    │  - registra usuario en sesión        │
                                    │  - invoca SaraObraAgent.chat         │
                                    └─────────────────────────────────────┘
                                               │
                                               ▼
                            ┌────────────────────────────┐          ┌────────────┐
                            │ IaColaborativa::SaraObraAgent│◄─┐      │ project_id │
                            │  - detect_intent (project /  │  └────►│  validado  │
                            │    work_packages)            │         └────────────┘
                            │  - build_user_prompt(usr +    │
                            │    MCP context)               │
                            │  - system_prompt (project     │
                            │    prompt / work_packages      │
                            │    prompt)                    │
                            └──────┬─────────────────────────┘
                                   │
                                   ▼
             ┌────────────────────────────────────────────────────────────┐
             │ app/services/ia_colaborativa/base_agent.rb (BaseAgent)        │
             │  - call_openrouter_api (OpenRouter/Gemini)                    │
             │  - formatea respuesta + loggea en DebugService                │
             └────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
             ┌────────────────────────────────────────────────────────────┐
             │ Prompt incluye instrucciones concretas:                       │
             │  • curl POST /tools/get_project?project_id={project_id}       │
             │  • curl POST /tools/list_work_packages?project_id={project_id} │
             │    &status=open&full_retrieval=true                          │
             │  • analiza campos, genera tabla, alertas y “Sugerencias”.     │
             └────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
             ┌────────────────────────────────────────────────────────────┐
             │ Respuesta LLM (Markdown + tabla + alertas + sugerencias)      │
             │  retorna a SaraObraAgent → ChatController → Frontend          │
             └────────────────────────────────────────────────────────────┘
```

### Título creativo
**"SaraIA Obra entiende qué quieres, consulta el endpoint correcto y documenta el ciclo completo."**

### Problema resuelto
Antes el chat disparaba heurísticas basadas en palabras clave y no dejaba trazabilidad clara del endpoint ejecutado. Ahora la IA decide la intención (`:project` o `:work_packages`) con un prompt dedicado y el backend solo dispara el MCP necesario, registrando qué flujo siguió cada consulta.

### Cambios clave
- **Detección de intención:** `SaraObraAgent.detect_intent` usa `intent_prompt` (`app/services/ia_colaborativa/sara_obra_agent.rb:180-203`) para devolver únicamente `project` o `work_packages` según el texto del usuario.
- **Control en el backend:** `IaColaborativa::ChatController#create` registra la intención detectada y, cuando es `:work_packages`, ejecuta `McpService.list_work_packages`; el resto del tiempo solo consulta `/tools/get_project` y mantiene el `project_payload` con los detalles necesarios (`chat_controller.rb:36-66`).
- **Prompts divididos:** `project_prompt` y `work_packages_prompt` (`sara_obra_agent.rb:19-165`) contienen las instrucciones completas de cada flujo (endpoints, extracción de datos, análisis de riesgo, alertas y sugerencias en Markdown).
- **Prompts estables:** `work_packages_prompt` ahora recibe `user_name` igual que `project_prompt`, de modo que la llamada a `assistant_instruction` ya no falla con `NameError` y el prompt completo llega al `call_openrouter_api`, garantizando respuestas válidas del modelo.
- **Contexto enriquecido:** `build_user_prompt` y `format_project_context` (`sara_obra_agent.rb:225-272`) combinan usuario, proyecto seleccionado, detalles MCP y work packages (si existen) para que la IA reciba el panorama completo sin que el usuario teclee IDs.
- **Trazabilidad y logs:** `context_summary_for_log` y los logs detallados del controlador permiten ver la intención elegida y el endpoint ejecutado; `DebugService` sigue exponiendo el estado sin afectar otros agentes.

### Flujo creativo documentado
1. Usuario pregunta "¿Qué tal va el proyecto?" ! `ChatController#create` recibe mensaje, usuario y selección, luego llama a `detect_intent`.
2. La intención vuelve `project`, se registra  Intención detectada: project  y el backend llama `/tools/get_project` si el proyecto ya está seleccionado.
3. Gemini recibe el prompt `[INTENT: project]` junto con el contexto completo, genera el análisis de riesgo, alerta por descripción faltante y agrega la sección  Sugerencias .
4. Si en cambio la intención es `work_packages`, el controlador llama `/tools/list_work_packages` y el prompt guía la IA para construir la tabla, indicar el total, analizar riesgos y terminar con tres sugerencias contextuales.

### Próximos pasos
- Ajustar la UI de debug para mostrar intención y endpoint (expandible y copiables) sin alterar la información que aportan otros agentes.
- Verificar que no queden métodos o datos ligados al antiguo sistema de keywords en `SaraObraAgent`.
- Mantener actualizados los prompts cuando cambien los requisitos de alertas, análisis o formato Markdown.

### ActualizaciÃ³n del flujo en objetivo 3
- Se reforzÃ³ el controlador para que el bloque work_packages solo se ejecute cuando project_id estÃ¡ presente. Si falta el ID, SaraIA Obra devuelve un aviso y no invoca /tools/list_work_packages.
- En McpService se obliga a incluir el project_id dentro de la query string y se documenta el ciclo work_packages_flow para dejar claro quÃ© etapas se ejecutan.
- Esta actualizaciÃ³n se suma al objetivo 3 para recordar que cada consulta por work packages debe venir del proyecto seleccionado antes de invocar el MCP.

- **Documentación del ciclo completo SaraIA Obra → MCP**
  + **Frontend** (`app/assets/javascripts/ia_colaborativa/chat.js`): `sendIaMessage` agrega el usuario detectado (`extractCurrentUser`) y la selección actual (`selectedProject`) al body antes de llamar a `/ia_colaborativa/chat`, mientras que `buildIaColabUrl` obliga a usar los endpoints internos (proyectos y debug). Los flujos `openProjectsSearchModal`, `loadUserProjects`, `searchProjects` y `selectProject` se apoyan en el nuevo `search_projects` para listar proyectos MCP y mantener el botón “Proyectos” sincronizado. El panel de debug usa `loadDebugData` y similares para consumir `/ia_colaborativa/debug`, `/debug/logs` y `/debug/conversations` y mostrar JSON limpio al usuario.
  + **Backend Rails** (`app/controllers/ia_colaborativa/chat_controller.rb`): `create` registra usuario + proyecto, valida que `project_id` exista antes de invocar `McpService.list_work_packages`, conserva `project_payload` con detalles y colecciones MCP, loggea cada etapa en `DebugService` y responde al frontend con JSON. También expone los endpoints `search_projects`, `debug`, `debug/logs` y `debug/conversations` (definidos antes de `private`) para que el panel pueda solicitarlos sin caer en páginas HTML.
  + **Agente IA** (`app/services/ia_colaborativa/sara_obra_agent.rb`): `detect_intent` consulta `intent_prompt`, `system_prompt` elige entre `project_prompt` y `work_packages_prompt` (ambos con `assistant_instruction` y ahora con `user_name`), y `build_user_prompt` agrega el contexto de usuario + proyecto (incluyendo `work_packages` si estaban en el payload). Los prompts guían al modelo a usar los endpoints correctos, analizar riesgos, emitir alertas y terminar con una sección “Sugerencias” que retoma la información MCP.
  + **BaseAgent** (`app/services/ia_colaborativa/base_agent.rb`): centraliza `call_openrouter_api`, controla headers/modelo/temperatura/tokens y registra cada intercambio en `DebugService` para conservar trazabilidad de la IA.
  + **Salida al MCP**: ambas rutas MCP se muestran como ejemplos (`GET /tools/get_project?...` y `POST /tools/list_work_packages?...`) y sus respuestas (`_embedded`, `total`, alertas, tablas) se filtran en markdown antes de llegar al chat.

Estos pasos documentan en detalle cómo se conectan los archivos del frontend y backend con los prompts y los endpoints MCP dentro del objetivo 3, asegurando trazabilidad, cumplimiento del nuevo detector de intenciones y claridad en la operación del flujo.

## Objetivo 4 – Automatizaciones CDE

### Qué resuelve
El objetivo es que SaraIA Obra identifique cuándo el usuario quiere “crear un plan de ejecución BIM o automatización” y, antes de crear cualquier elemento en MCP, presente las tarjetas madre disponibles para que el usuario elija una opción. Esto evita depender de palabras clave manuales y mantiene el control en la sesión de Automatización.

### Cambios clave
- **Frontend (`app/assets/javascripts/ia_colaborativa/chat.js` + `automation.js`)**: cuando el usuario pulsa el botón "Proyectos" se mantiene el `project_id` y el nombre seleccionado; al enviar un mensaje que la IA interpreta como automatización (`:automation`), el backend devuelve `automation_options`. El chat genera botones con cada plan y cada clic lanza `POST /ia_colaborativa/automation_flow` enviando `plan_id` y `project_id` para que el backend ejecute el plan de forma secuencial mientras el botón muestra estados de carga o error. El editor `automation.js` sigue siendo el autor del plan (envolventes, hijos), pero ahora el chat puede disparar su ejecución completa.
- **Backend (`app/controllers/ia_colaborativa/chat_controller.rb`)**: al detectar el intent `:automation`, el controlador construye `automation_options` enumerando todas las tarjetas madre (`IaColaborativa::PebAutomation`), registra el evento `automation_flow` en `DebugService` y responde con el texto que describe los tipos de proyectos disponibles. Además expone `POST /ia_colaborativa/automation_flow`, que recibe `plan_id` y `project_id`, dispara `IaColaborativa::AutomationFlowService`, recorre cada envolvente y tarjeta hija en orden y llama a `McpService.create_work_package` con los parámetros (project_id, subject, type_id) esperados por el MCP, guardando cada paso en el panel de debug.
- **Agente (`app/services/ia_colaborativa/sara_obra_agent.rb`)**: el detector amplió su prompt para pedir "project | work_packages | automation" y ahora busca la palabra `automation` en la respuesta; así la LLM decide si la intención es crear un plan sin depender de regex manual. Esa intención regula si el backend entra al ciclo de Automatización antes de consultar MCP.
- El prompt de `automation` ahora recuerda que se usa cuando el usuario quiere crear tareas o fases para proyectos completos y espera que la IA controle la pestaña de Automatización.

### Ciclo de funcionamiento
1. Usuario escribe “crear plan de ejecución BIM”.
2. SaraObraAgent detecta `:automation` gracias al prompt extendido y responde a `ChatController`.
3. `ChatController#create` llama a `automation_intent_payload`, registra el evento y devuelve la lista `automation_options` junto al texto que describe los tipos de proyectos disponibles.
4. El frontend presenta esas opciones al usuario; cuando confirme una tarjeta madre se podrá seguir con los pasos de Automatización para crear envolventes/paquetes y, más adelante, usar el `project_id` confirmado para llamar a MCP.

Esta documentación cierra el círculo del Objetivo 4, explica qué archivos gestionan el nuevo flujo y deja claro cómo se rastrea la operación con `DebugService`.

### Arquitectura artística del flujo
╔════════════════════════════════════════════════════════════════════════════╗
║ **Frontend**                                                               ║
║ - El chat renderiza `automation_options` como botones interactivos.       ║
║ - Cada botón envía `{ plan_id, project_id }` a `/ia_colaborativa/automation_flow`. ║
║ - Los botones muestran estados de carga, bloqueo y mensaje final.         ║
║ - `automation.js` mantiene la definición de la tarjeta madre (envolventes,║
║   hijos, `type_id` y orden).                                               ║
╚════════════════════════════════════════════════════════════════════════════╝
╔════════════════════════════════════════════════════════════════════════════╗
║ **Backend**                                                                ║
║ - `ChatController#create` detecta `:automation` y retorna la lista de      ║
║   planes y el prompt actualizado.                                          ║
║ - `POST /ia_colaborativa/automation_flow` coordina `AutomationFlowService`.║
║ - `AutomationFlowService` recorre las tarjetas madre y crea los work       ║
║   packages en orden (envolvente → hijos).                                  ║
║ - `McpService.create_work_package` construye la query string y evita       ║
║   errores 422/500 del MCP.                                                 ║
║ - `DebugService` registra cada etapa (`intent_detected`, `execute_plan`).  ║
╚════════════════════════════════════════════════════════════════════════════╝
╔════════════════════════════════════════════════════════════════════════════╗
║ **Agente IA**                                                              ║
║ - El prompt pide `project | work_packages | automation` y evalúa la        ║
║   respuesta del LLM para elegir la intención adecuada.                    ║
║ - Cuando la IA responde `automation`, el backend genera la lista de        ║
║   proyectos y despliega los botones.                                      ║
╚════════════════════════════════════════════════════════════════════════════╝

## Objetivo 6 - Selector de proveedor de API

### Qué resuelve
Presentar en el panel General un combo box con los proveedores de IA disponibles (Anthropic, DeepSeek, OpenAI, OpenRouter) para que el usuario elija una opción antes de que cualquier flujo automatizado intente consumir el MCP; el nuevo control elimina textos genéricos y deja los nombres listos para futuros planes.

### Cambios clave
- **Vista (`app/views/ia_colaborativa/hooks/_floating_button.html.erb` + `_proveedor_api.erb`)**: el texto de “Ajustes disponibles próximamente” se sustituye por el partial `proveedor_api` y el combo box estilizado (sin link de documentación) justo debajo del párrafo introductorio.
- **Partial `proveedor_api`**: contiene la tarjeta oscura, la instrucción de uso, el `<select>` marcado con `data-providers` y la etiqueta “Proveedor seleccionado” que mostrará el valor activo.
- **Frontend (`app/assets/javascripts/ia_colaborativa/chat.js`)**: introduce `DEFAULT_API_PROVIDERS`, `window.selectedIaApiProvider`, los helpers `getIaApiProviders`, `renderApiProviderList` y `selectIaApiProvider`, y listeners para `change` y `DOMContentLoaded`, de modo que el combo se rellena cada vez que se abre General y el valor elegido se mantiene en el estado global.
- **Sincronización**: cada vez que se abre la pestaña General o se carga el DOM, `renderApiProviderList` refresca las opciones y coloca el guardado dentro del combo, garantizando coincidencia entre UI y estado.
- **Configuración MCP**: el hook sigue inyectando `window.IA_COLAB_MCP_URL` desde `ENV['MCP_SERVER_URL']` o el fallback `http://192.168.1.55:8000`, dejando claro el punto de conexión para cuando los proveedores empiecen a disparar peticiones.

### Ciclo de funcionamiento
1. Rails renderiza el modal de configuración y ejecuta el partial `proveedor_api` justo después del texto “Aquí podrás gestionar…”.
2. `DOMContentLoaded` y el cambio de pestaña General disparan `renderApiProviderList`, que rellena el combo con todos los proveedores declarados en `data-providers`.
3. El usuario abre el combo, selecciona una opción y el listener de `change` llama a `selectIaApiProvider` para fijar el nombre y actualizar la etiqueta “Proveedor seleccionado”.
4. El valor seleccionado queda en `window.selectedIaApiProvider` para que los flujos posteriores puedan consultarlo sin volver a preguntar.

### Arquitectura artística del flujo
╭────────────────────────────────────────────────────────────────────────╮
│ **Frontend (chat.js + partial)**                                      │
│ - `renderApiProviderList` construye el combo a partir de               │
│   `DEFAULT_API_PROVIDERS` y el atributo `data-providers`.             │
│ - El listener de `change` invoca `selectIaApiProvider`, que guarda     │
│   el proveedor activo y refresca la etiqueta “Proveedor seleccionado”.│
│ - `switchIaSettingsTab` y el listener de `DOMContentLoaded` forzan     │
│   la re-renderización para mantener la UI sincronizada.               │
╰────────────────────────────────────────────────────────────────────────╯
╭────────────────────────────────────────────────────────────────────────╮
│ **Backend (vista Rails)**                                             │
│ - `_floating_button` ya no muestra texto genérico y ahora llama al     │
│   partial `proveedor_api`.                                            │
│ - `proveedor_api.erb` ofrece el combo box con instrucciones claras y   │
│   la etiqueta que indica el proveedor activo.                         │
│ - `IA_COLAB_MCP_URL` se mantiene configurable desde `ENV` o el fallback│
│   `http://192.168.1.55:8000` para dejar el endpoint listo.           │
╰────────────────────────────────────────────────────────────────────────╯
## Objetivo 7 - Configuracion General (SaraIA)

### Que se documento
- Boton superior en pestana General renombrado a "Guardar", mas compacto y alineado a la derecha.
- Bloque "Proveedor de API" con selector oscuro (Anthropic, DeepSeek, OpenAI, OpenRouter) y placeholder "Selecciona un proveedor".
- Si se elige OpenRouter se despliegan dos bloques con el mismo estilo oscuro:
  - Input "OpenRouter API Key" (42px alto, fondo #12131f, texto claro, autofill neutralizado).
  - Combo "Modelo" con opciones: openai/gpt-4o-mini, deepseek/deepseek-chat-v3.1, x-ai/grok-4.1-fast, google/gemini-2.5-flash-lite-preview-09-2025.
- Estado UI gestionado en memoria por pp/assets/javascripts/ia_colaborativa/chat.js (
enderApiProviderList, selectIaApiProvider, 	oggleOpenRouterBoxes, window.selectedIaApiProvider). Aun sin persistencia backend para la API key.

### Ubicacion de los cambios
- Vistas: pp/views/ia_colaborativa/hooks/_floating_button.html.erb (boton "Guardar" y render del partial) y pp/views/ia_colaborativa/hooks/_proveedor_api.erb (selector, input y modelo con estilo unificado).
- JS: pp/assets/javascripts/ia_colaborativa/chat.js controla la lista de proveedores, el despliegue condicional de OpenRouter y mantiene el estado seleccionado.

### Flujo resumido
1. El modal carga la pestana General y renderiza proveedor_api con selector y bloques condicionales.
2. chat.js rellena el combo desde data-providers, aplica el estado en memoria y muestra/oculta las cajas de OpenRouter.
3. El usuario selecciona proveedor/modelo o ingresa la API key (solo UI por ahora); el estado queda en window.selectedIaApiProvider para futuros flujos.

## Objetivo 8 - Ajustes adicionales de configuracion

### Bloques nuevos
- Proveedor OpenAI: bloque de clave "OpenAI API Key" y combo de modelos (gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-mini, gpt-5, gpt-5-mini, gpt-5-codex, gpt-5-nano, gpt-5-chat-latest, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o3-high, o3-low, o4-mini, o4-mini-high, o4-mini-low, o3-mini, o1, o1-preview, o1-mini, gpt-4o, gpt-4o-mini, codex-mini-latest, gpt-5-2025-08-07, gpt-5-mini-2025-08-07, gpt-5-nano-2025-08-07). Estilo oscuro y autofill neutralizado.
- Proveedor Google Gemini: bloque de clave y combo de modelos con todas las variantes gemini 1.5/2.0/2.5/3 y flash exp/preview; estilo oscuro.
- Widget "Servidor MCP del CDE": input de URL con estilo oscuro para definir el endpoint MCP (ej. https://cde.midominio.com:8000).

### Ubicacion
- Vistas: App/views/ia_colaborativa/hooks/_proveedor_api.erb contiene los bloques de OpenRouter, Google Gemini, OpenAI y MCP.
- JS:App/assets/javascripts/ia_colaborativa/chat.js maneja el despliegue condicional de bloques segun el proveedor seleccionado.

### Flujo
1. Al seleccionar proveedor, chat.js muestra/oculta los bloques correspondientes (OpenRouter, OpenAI, Google Gemini) manteniendo el estilo unificado.
2. El widget MCP permite ingresar la URL del servidor CDE (UI aun sin persistencia).

## Objetivo 9 - Tokens máximos configurables

### Qué resuelve
Permitir que el usuario defina desde la pestaña General el límite de `max_tokens` que se envía al modelo IA en cada llamada, evitando salidas truncadas o demasiado extensas según su preferencia.

### Cambios clave
- **Persistencia**: nueva migración `db/migrate/20241209000000_add_max_tokens_to_ia_provider_settings.rb` agrega la columna `max_tokens` (integer, default 1000) a la tabla `ia_provider_settings`.
- **API**: `IaColaborativa::ProviderSetting` expone `max_tokens`; `SettingsController` permite/serializa el campo; `BaseAgent` lee `provider_config[:max_tokens]` (o ENV) para enviar `max_tokens` a OpenRouter/OpenAI.
- **UI**: en `app/views/ia_colaborativa/hooks/_proveedor_api.erb` se añadió un slider "Tokens máximos por respuesta" con display numérico; `app/assets/javascripts/ia_colaborativa/chat.js` guarda/carga el valor junto con provider/base/model/api_key y habilita el botón Guardar al mover el slider.

### Ubicación de los cambios
- Migración: `db/migrate/20241209000000_add_max_tokens_to_ia_provider_settings.rb`
- Backend: `app/controllers/ia_colaborativa/settings_controller.rb`, `app/services/ia_colaborativa/base_agent.rb`
- Frontend: `app/views/ia_colaborativa/hooks/_proveedor_api.erb`, `app/assets/javascripts/ia_colaborativa/chat.js`

### Flujo resumido
1. El usuario mueve el slider de tokens en la pestaña General; el JS actualiza el valor mostrado y marca el estado como sucio.
2. Al pulsar Guardar, `chat.js` envía `max_tokens` en el payload de `/ia_colaborativa/provider_settings`; el backend persiste el valor en `ia_provider_settings`.
3. Al cargar la pestaña General, `loadProviderSettings` recupera `max_tokens` y lo refleja en el slider; `BaseAgent` usa ese valor al llamar al modelo IA.

## Objetivo 10 - Botones automáticos en respuestas de work_packages

### Qué se añadió
- Tres botones estáticos al final de la respuesta cuando la intención es `work_packages`: **Planificación y Avance**, **Costos**, **Involucrados**. Cada uno fuerza la intención correspondiente (`planning`, `costos`, `involucrados`) y dispara el envío del formulario con un texto sugerido si el input está vacío.

### Ciclo de funcionamiento
1. **Backend**: `SaraObraAgent.detect_intent` puede devolver `:work_packages`. `ChatController#create` pasa `intent` en la respuesta JSON (y opcionalmente `buttons` si vienen del backend en el futuro).
2. **Render del mensaje (frontend)**: `addAiMessage` (`app/assets/javascripts/ia_colaborativa/chat.js`) ahora devuelve el contenedor del mensaje y soporta callbacks diferidos `__onRevealCallbacks` que se ejecutan al terminar el efecto typewriter.
3. **Inserción de botones**: cuando `data.intent === 'work_packages'`, el contenedor del mensaje guarda un callback para pintar los botones al finalizar la animación. Si `data.buttons` trae contenido y existe `renderWorkPackageButtons`, se usa; de lo contrario se llama a `renderWorkPackageIntentButtons` (3 botones estáticos).
4. **Hook de visibilidad**: `revealExtras()` (ejecutado al terminar el typewriter) muestra las acciones y dispara los callbacks diferidos, asegurando que los botones aparezcan solo cuando el texto ya se mostró completo.

### Archivos tocados (frontend)
- `app/assets/javascripts/ia_colaborativa/chat.js`: encola callbacks para `work_packages` y crea `renderWorkPackageIntentButtons` con los 3 botones de demostración.
- `app/assets/javascripts/ia_colaborativa/boton_auto_chat.js` (preexistente) sigue siendo compatible si algún día se envían `data.buttons` desde el backend.

### Estado actual
- Los botones son visuales y solo registran en consola el clic; no disparan llamadas nuevas. Sirven como plantilla para enganchar acciones reales (listar, refrescar o crear paquetes) cuando se definan endpoints o flujos adicionales.
