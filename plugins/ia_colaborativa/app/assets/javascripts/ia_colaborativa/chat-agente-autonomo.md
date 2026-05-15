# Chat Agente Autonomo

## Objetivo

Convertir el chat actual del plugin en un chat-agente autonomo donde la interfaz separe claramente:

- conversacion con el usuario
- razonamiento operativo del agente
- ejecucion visible de tools
- pasos de investigacion, consulta, lectura y validacion
- respuesta final

La meta no es solo mostrar una respuesta con `tool_calls` al final, sino reflejar el trabajo del agente como una linea de tiempo viva, parecida al comportamiento visible de Codex en VS Code.

## Problema actual

Hoy `Sara` ya puede:

- consultar RAG remoto
- llamar tools locales
- devolver `tool_calls`
- renderizar un bloque desplegable por tool

Pero el flujo visual sigue siendo limitado:

- el usuario envia una consulta
- el backend trabaja internamente
- el frontend recibe una sola respuesta
- el chat muestra tools como un agregado del mensaje final

Eso hace que el agente se vea menos autonomo porque:

- no se distinguen bien las etapas del trabajo
- la investigacion no tiene identidad visual propia
- la UI no representa razonamiento ni progreso estructurado
- tool, busqueda, shell, analisis y respuesta viven demasiado juntos

## Principio de diseno

El chat debe dejar de tratar todo como un simple intercambio de mensajes y pasar a trabajar con eventos de ejecucion.

En vez de una secuencia:

- user message
- assistant message

debemos pasar a una secuencia como esta:

- user message
- agent status
- reasoning step
- rag retrieval step
- tool call started
- tool call finished
- report step
- assistant final message

## Idea central

Implementar una arquitectura de chat basada en eventos, donde `Sara` produzca una traza estructurada del trabajo realizado y el frontend renderice cada tipo de evento con un componente visual propio.

## Modelo propuesto

### 1. Tipos de evento del agente

Definir un modelo comun de eventos para el chat:

- `user_message`
- `assistant_message`
- `agent_status`
- `reasoning_step`
- `rag_step`
- `tool_call_started`
- `tool_call_finished`
- `tool_call_failed`
- `search_step`
- `shell_step`
- `report_step`
- `warning_step`
- `error_step`

Cada evento debe tener una estructura estable, por ejemplo:

```json
{
  "type": "tool_call_started",
  "agent": "sara_tools",
  "timestamp": "2026-04-12T04:57:23Z",
  "label": "OpenProject_ListProjects",
  "meta": {
    "tool_name": "list_projects",
    "display_name": "OpenProject_ListProjects"
  }
}
```

Y para un resultado:

```json
{
  "type": "tool_call_finished",
  "agent": "sara_tools",
  "timestamp": "2026-04-12T04:57:24Z",
  "label": "OpenProject_ListProjects",
  "meta": {
    "tool_name": "list_projects",
    "display_name": "OpenProject_ListProjects",
    "input": {
      "active_only": true
    },
    "output": {
      "success": true,
      "total": 41
    },
    "duration_ms": 842
  }
}
```

### 2. Capas del agente

Separar `Sara` en capas mas claras:

- `Conversation Layer`
  - recibe mensaje del usuario
  - mantiene hilo
  - decide cuando termina una respuesta

- `Reasoning Layer`
  - construye contexto
  - decide proximo paso
  - produce eventos de razonamiento visibles o resumidos

- `Retrieval Layer`
  - consulta RAG
  - produce eventos `rag_step`

- `Tool Execution Layer`
  - ejecuta tools
  - produce eventos de inicio, fin y error

- `Presentation Layer`
  - transforma eventos en componentes del chat

## Como se veria en el chat

### Bloques principales

El chat debe soportar bloques distintos:

- mensaje de usuario
- bloque de estado del agente
- bloque de investigacion
- bloque de tool
- bloque de advertencia/error
- mensaje final del asistente

### Ejemplo ideal de experiencia

1. Usuario:
   - `Busca el proyecto id 686`

2. Sara muestra:
   - `Analizando la solicitud`

3. Sara muestra:
   - `Consultando contexto remoto`

4. Sara muestra un bloque desplegable persistente:
   - `🛠️ Tool Call: OpenProject_GetProject`
   - badge temporal:
     - `Worked for 0.7s`

5. Cuando termina:
   - el mismo bloque queda persistente
   - muestra `Input` y `Output`

6. Al final:
   - mensaje final de Sara con la respuesta natural

## Que voy a hacer

### Fase 1. Definir contrato de eventos

Crear un contrato unico entre backend y frontend para que `Sara` no devuelva solo:

- `response`
- `tool_calls`

Sino tambien:

- `events`

Ejemplo:

```json
{
  "response": "Encontré el proyecto ARQUITECTURA...",
  "tool_calls": [],
  "events": [
    { "type": "agent_status", "label": "Analizando la solicitud" },
    { "type": "rag_step", "label": "Consultando contexto remoto" },
    { "type": "tool_call_started", "label": "OpenProject_GetProject" },
    { "type": "tool_call_finished", "label": "OpenProject_GetProject", "meta": { "duration_ms": 631 } }
  ]
}
```

### Fase 2. Instrumentar `SaraTools::Agent`

Modificar `SaraTools::Agent` para que registre eventos internos durante toda la ejecucion:

- inicio de chat
- consulta a RAG
- tool call generado por el LLM
- inicio de tool
- fin de tool
- errores
- fin de respuesta

Eso implica:

- introducir un acumulador de eventos por turno
- desacoplar logs internos de eventos para UI
- mantener ambos:
  - logs para depuracion
  - eventos para representacion visual

### Fase 3. Normalizar nombres visibles

Las tools internas deben mapearse a nombres de presentacion mas claros.

Ejemplos:

- `list_projects` -> `OpenProject_ListProjects`
- `get_project` -> `OpenProject_GetProject`
- `list_work_packages` -> `OpenProject_ListWorkPackages`
- `create_work_package` -> `OpenProject_CreateWorkPackage`

La UI no debe depender del nombre crudo interno.

### Fase 4. Convertir el chat en timeline de eventos

En `chat.js` crear un render por evento:

- `renderAgentStatusEvent`
- `renderReasoningEvent`
- `renderRagEvent`
- `renderToolStartedEvent`
- `renderToolFinishedEvent`
- `renderWarningEvent`
- `renderErrorEvent`
- `renderAssistantMessageEvent`

Esto reemplaza el enfoque actual de “un solo mensaje con extras”.

### Fase 5. Hacer visible el trabajo desde el inicio

Cuando se envia una consulta:

- el chat debe insertar inmediatamente un contenedor de ejecucion del agente
- ese contenedor se ira poblando con eventos
- no debe esperar al mensaje final para existir

Esto es clave para la sensacion de autonomia.

### Fase 6. Mantener separacion entre razonamiento y respuesta

No mostrar cadena interna cruda del modelo.

Si mostramos razonamiento, debe ser:

- resumido
- operativo
- seguro
- orientado a la accion

Ejemplos aceptables:

- `Analizando si necesito contexto del proyecto`
- `Consultando informacion del CDE`
- `Validando si existe el paquete de trabajo`

No mostrar:

- texto bruto del pensamiento interno del modelo
- prompts del sistema
- contenido sensible

### Fase 7. Preparar streaming real

Hoy la UI puede simular parte del progreso, pero el objetivo correcto es que el backend pueda emitir eventos progresivos.

Opciones:

- SSE
- polling por turno
- websocket

Recomendacion:

- empezar con SSE si la arquitectura del plugin lo permite
- si no, usar polling corto por `thread_id` o `turn_id`

### Fase 8. Diseñar identidad visual del agente

Cada tipo de evento debe verse distinto.

Propuesta visual:

- `agent_status`
  - gris claro
  - borde suave
  - texto negro

- `rag_step`
  - fondo blanco
  - icono de busqueda/contexto

- `tool_call`
  - cabecera blanca
  - borde gris
  - cuerpo claro
  - input/output desplegable

- `warning/error`
  - tonos amarillos o rojos suaves

- `assistant_message`
  - estilo actual del chat

## Estructura tecnica recomendada

### Backend

Archivos a tocar despues:

- `app/services/ia_colaborativa/sara_tools/agent.rb`
- `app/services/ia_colaborativa/sara_tools/registry.rb`
- `app/services/ia_colaborativa/sara_tools/rag_service.rb`
- `app/controllers/ia_colaborativa/chat_controller.rb`

Nuevas piezas recomendadas:

- `app/services/ia_colaborativa/sara_tools/event_collector.rb`
- `app/services/ia_colaborativa/sara_tools/event_presenter.rb`

### Frontend

Archivo principal:

- `app/assets/javascripts/ia_colaborativa/chat.js`

Posibles nuevas secciones o helpers:

- renderer de timeline
- renderer por tipo de evento
- store temporal por turno
- manejo de streaming o actualizacion incremental

## Flujo objetivo final

1. usuario envia mensaje
2. UI crea panel del turno del agente
3. backend inicia ejecucion y acumula eventos
4. eventos llegan al frontend en tiempo real o casi real
5. UI renderiza cada paso
6. tools se muestran como bloques persistentes
7. respuesta final queda separada del trabajo operativo

## Riesgos a controlar

- no mezclar logs tecnicos con UI
- no exponer razonamiento interno sensible
- no saturar al usuario con demasiados micro-eventos
- no romper agentes existentes
- no acoplar la UI solo a `Sara`; idealmente debe servir para otros agentes luego

## Criterios de exito

El trabajo estara bien hecho cuando:

- el usuario vea desde el inicio que `Sara` esta trabajando
- las tools aparezcan como pasos del agente, no como anexo final
- el chat muestre investigacion, consulta y accion como bloques separados
- la respuesta final quede limpia y entendible
- la arquitectura permita agregar nuevos tipos de evento sin rehacer todo

## Alcance de esta propuesta

Este documento describe el plan y la arquitectura.

Todavia no implementa:

- streaming real
- nueva capa de eventos
- refactor del backend
- timeline completo en frontend

Primero se usara como referencia para ejecutar la implementacion por fases.

## Patrones observados en Codex y OpenClaw

Esta propuesta toma lo mejor de ambos sistemas.

### Lo mejor de Codex

Codex destaca por:

- separar la conversacion del trabajo operativo
- mostrar estados y superficies distintas para shell, web, diff, review y tools
- usar una linea de tiempo de eventos heterogeneos
- mantener un proceso agente separado del host de UI
- permitir que el usuario vea que el agente esta investigando o ejecutando algo antes de la respuesta final

Lecciones aplicables:

- el chat no debe ser solo una lista de mensajes
- las acciones del agente deben ser entidades de primer nivel
- la interfaz debe poder renderizar tipos de evento distintos
- el usuario debe distinguir claramente:
  - lo que el agente dice
  - lo que el agente hace
  - lo que el agente encontro

### Lo mejor de OpenClaw

OpenClaw destaca por:

- modelar la ejecucion alrededor de sesiones persistentes
- tener un control plane por eventos
- mostrar acciones desde que arrancan, no solo cuando terminan
- separar `tool` y `toolResult`
- actualizar el estado visible del agente con fases como:
  - `Sending`
  - `Working`
  - `Failed`

Lecciones aplicables:

- cada turno del agente debe tener identidad operativa
- la tool debe aparecer desde el inicio
- el resultado de la tool debe persistir como bloque propio
- la sesion del agente debe permitir continuidad, reconexion y trazabilidad

### Sintesis para Sara

La combinacion recomendada para `Sara` es:

- de Codex:
  - timeline de eventos
  - separacion visual por tipo de paso
  - arquitectura de agente como runtime y no solo prompt

- de OpenClaw:
  - estado de ejecucion inmediato
  - ciclo visible de vida de la tool
  - sesion persistente del agente
  - distincion entre llamada y resultado

## Vision final de Sara

`Sara` debe evolucionar de:

- chat con respuesta final y tools anexas

a:

- runtime de agente con timeline de ejecucion visible, eventos persistentes y trazabilidad por sesion

El usuario debe percibir que:

- `Sara` entiende la solicitud
- decide una estrategia
- investiga o consulta contexto
- ejecuta tools
- valida resultados
- produce una respuesta final

Y cada una de esas fases debe verse en el chat.

## Principios rectores del nuevo chat

### 1. El chat es una linea de tiempo de eventos

No una lista de mensajes simples.

La UI debe aceptar y renderizar eventos como:

- `user_message`
- `agent_turn_started`
- `agent_status`
- `reasoning_step`
- `rag_step_started`
- `rag_step_finished`
- `tool_call_started`
- `tool_call_progress`
- `tool_call_finished`
- `tool_call_failed`
- `assistant_message`
- `turn_summary`

### 2. La conversacion no se mezcla con la ejecucion

Debe haber dos capas claramente separadas:

- capa conversacional
  - mensaje del usuario
  - respuesta final del asistente

- capa operativa
  - investigacion
  - tool calls
  - resultados
  - advertencias
  - estado del turno

### 3. Cada tool tiene ciclo de vida visible

Toda tool debe pasar por estos estados visibles:

- creada
- en ejecucion
- completada
- fallida

Y el usuario debe ver:

- nombre amigable
- tiempo transcurrido
- input
- output
- estado final

### 4. La sesion del agente es importante

El turno no debe vivir aislado.

`Sara` debe poder apoyarse en:

- `thread_id`
- `turn_id`
- `session state`
- memoria conversacional
- historial de eventos del turno

### 5. El razonamiento visible debe ser seguro

No se debe mostrar cadena interna cruda del modelo.

Si se expone razonamiento al usuario, debe ser:

- resumido
- operacional
- seguro
- comprensible

Ejemplos validos:

- `Analizando si necesito datos del proyecto`
- `Consultando contexto documental`
- `Validando permisos para crear el paquete de trabajo`

## Arquitectura objetivo

### Capa 1. Session Runtime

Nueva responsabilidad:

- mantener el estado del agente por sesion
- identificar cada turno
- conservar historial operativo del turno actual

Responsabilidades:

- `thread_id`
- `turn_id`
- `agent_id`
- estado del turno
- eventos del turno

Piezas sugeridas:

- `SaraTools::SessionRuntime`
- `SaraTools::TurnContext`

### Capa 2. Event Collector

Nueva pieza central para acumular y normalizar eventos.

Responsabilidades:

- recibir eventos internos del runtime
- asignar timestamps
- guardar orden
- convertir datos crudos a eventos estables para UI

Piezas sugeridas:

- `app/services/ia_colaborativa/sara_tools/event_collector.rb`
- `app/services/ia_colaborativa/sara_tools/event_types.rb`

### Capa 3. Reasoning Orchestrator

No debe ejecutar tools directamente.

Debe:

- interpretar la consulta
- decidir si necesita RAG
- decidir si necesita tools
- decidir si ya puede responder

Debe producir eventos como:

- `agent_status`
- `reasoning_step`

Pieza sugerida:

- `SaraTools::Orchestrator`

### Capa 4. Retrieval Layer

Responsabilidad:

- consultar el RAG remoto
- registrar inicio y fin de retrieval
- devolver contexto estructurado

Eventos:

- `rag_step_started`
- `rag_step_finished`
- `rag_step_failed`

Base:

- reutilizar `rag_service.rb`

### Capa 5. Tool Execution Layer

Responsabilidad:

- ejecutar tools locales
- registrar el ciclo de vida completo
- devolver resultado normalizado

Eventos:

- `tool_call_started`
- `tool_call_progress`
- `tool_call_finished`
- `tool_call_failed`

Base:

- reutilizar `registry.rb`

### Capa 6. Presentation Contract

`chat_controller.rb` debe dejar de devolver solo:

- `response`
- `tool_calls`

Debe devolver:

- `response`
- `tool_calls`
- `events`
- `turn_meta`

Ejemplo:

```json
{
  "response": "Encontré el proyecto ARQUITECTURA.",
  "tool_calls": [
    {
      "name": "get_project",
      "display_name": "OpenProject_GetProject",
      "arguments": { "project_id": 686 },
      "result": { "success": true, "project": { "id": 686, "name": "ARQUITECTURA" } },
      "duration_ms": 612
    }
  ],
  "events": [
    { "type": "agent_turn_started", "label": "Sara inicio el turno" },
    { "type": "agent_status", "label": "Analizando la solicitud" },
    { "type": "tool_call_started", "label": "OpenProject_GetProject" },
    { "type": "tool_call_finished", "label": "OpenProject_GetProject" }
  ],
  "turn_meta": {
    "thread_id": "745a7ebd-810e-1ed4-6eec-b08df422b7e5",
    "turn_id": "turn_0001",
    "agent": "sara_tools"
  }
}
```

## Diseño visual objetivo

### Estructura de un turno

Cada respuesta del agente debe ser un contenedor mayor llamado:

- `Agent Turn Card`

Ese contenedor incluira:

- cabecera del turno
- timeline de eventos
- bloque final de respuesta

### Componentes visuales

#### A. Turn Header

Debe mostrar:

- nombre del agente
- estado general del turno
- tiempo total del turno

Ejemplos:

- `Sara · Working`
- `Sara · Completed in 6.4s`
- `Sara · Failed`

#### B. Status Step

Bloque simple para estados intermedios:

- `Analizando la solicitud`
- `Preparando consulta al CDE`

#### C. RAG Step

Bloque especifico para retrieval:

- `Consultando contexto remoto`
- `Contexto recuperado`
- `RAG no disponible`

#### D. Tool Block

Bloque persistente desplegable.

Cabecera:

- `🛠️ Tool Call: OpenProject_CreateWorkPackage`
- badge vivo:
  - `Worked for 1.3s`
  - `Completed in 2.1s`
  - `Failed in 0.8s`

Cuerpo:

- `Input`
- `Output`
- opcionalmente:
  - `Warnings`
  - `Notes`

#### E. Assistant Final Response

Debe ir al final del turno, separado visualmente del trabajo operativo.

## Comportamiento exacto que voy a implementar

### Etapa A. Refactor del contrato backend

Voy a cambiar el backend para que `Sara` produzca un resultado enriquecido.

#### Objetivo

Pasar de:

```ruby
{ response: "...", tool_calls: [...] }
```

a:

```ruby
{
  response: "...",
  tool_calls: [...],
  events: [...],
  turn_meta: {...}
}
```

#### Archivos a tocar

- `app/services/ia_colaborativa/sara_tools/agent.rb`
- `app/services/ia_colaborativa/sara_tools/registry.rb`
- `app/services/ia_colaborativa/sara_tools/rag_service.rb`
- `app/controllers/ia_colaborativa/chat_controller.rb`

### Etapa B. Crear colector de eventos

Voy a introducir una clase dedicada para recolectar eventos.

#### Nuevo archivo propuesto

- `app/services/ia_colaborativa/sara_tools/event_collector.rb`

#### Responsabilidades

- `start_turn`
- `add_status`
- `add_reasoning`
- `start_rag`
- `finish_rag`
- `start_tool`
- `finish_tool`
- `fail_tool`
- `finish_turn`

#### Beneficio

Desacopla:

- logs de servidor
- presentacion del chat

### Etapa C. Instrumentar todo el flujo de Sara

Voy a hacer que `SaraTools::Agent` emita eventos en cada etapa:

#### Inicio

- `agent_turn_started`
- `agent_status`

#### RAG

- `rag_step_started`
- `rag_step_finished`
- `rag_step_failed`

#### LLM

- `reasoning_step`
- `agent_status`

#### Tool calling

- `tool_call_started`
- `tool_call_finished`
- `tool_call_failed`

#### Cierre

- `assistant_message`
- `turn_summary`

### Etapa D. Normalizar nombres de tools

Voy a crear una capa de nombres amigables.

Ejemplo:

- `list_projects` -> `OpenProject_ListProjects`
- `get_project` -> `OpenProject_GetProject`
- `list_work_packages` -> `OpenProject_ListWorkPackages`
- `get_work_package` -> `OpenProject_GetWorkPackage`
- `create_work_package` -> `OpenProject_CreateWorkPackage`

Esto mejora:

- UX
- consistencia visual
- trazabilidad

### Etapa E. Frontend orientado a eventos

Voy a refactorizar `chat.js` para que trabaje con un timeline de eventos.

#### Objetivo

Dejar de depender solo de:

- `addAiMessage`
- `renderToolCallsPanel`

Y pasar a:

- `createAgentTurnCard`
- `renderAgentEvent`
- `renderStatusEvent`
- `renderRagEvent`
- `renderToolStartedEvent`
- `renderToolFinishedEvent`
- `renderToolFailedEvent`
- `renderAssistantFinalMessage`

### Etapa F. Tool visible desde el primer instante

Cuando el agente detecta una tool:

- el bloque de tool debe aparecer inmediatamente
- no debe esperar a la respuesta final

Estado inicial:

- `🛠️ Tool Call: OpenProject_ListProjects`
- badge:
  - `Worked for 0.2s`

Cuando termina:

- el badge cambia a:
  - `Completed in 0.8s`

Si falla:

- cambia a:
  - `Failed in 0.8s`

### Etapa G. Persistencia del bloque

Los bloques de tools:

- no desaparecen
- quedan en el historial del turno
- conservan `Input` y `Output`

### Etapa H. Streaming progresivo real

Despues del refactor del contrato, la mejora ideal es dejar de simular progreso.

Opciones:

- `SSE`
- `WebSocket`
- `polling incremental por turn_id`

#### Recomendacion

Si OpenProject y la estructura actual lo permiten:

- implementar `SSE`

Si no:

- implementar polling corto por `turn_id`

#### Resultado esperado

El frontend ira insertando eventos conforme el backend los emite.

### Etapa I. Historial operativo del turno

Cada turno debe poder conservar:

- eventos
- tools
- duracion
- errores
- resumen final

Esto permitira a futuro:

- reabrir un turno
- auditar acciones
- analizar trazas
- exportar actividad del agente

### Etapa J. Compatibilidad gradual

No se debe romper el chat existente.

Voy a mantener compatibilidad por fases:

- agentes viejos siguen funcionando con respuesta simple
- `Sara` usa el nuevo contrato enriquecido
- el frontend soporta ambos modos mientras dura la migracion

## Plan de implementacion detallado

### Fase 1. Consolidar backend de eventos

1. Crear `EventCollector`
2. Instrumentar `SaraTools::Agent`
3. Instrumentar `RagService`
4. Instrumentar `Registry`
5. Ajustar `chat_controller.rb` para devolver `events`

Resultado esperado:

- backend ya genera timeline estructurado

### Fase 2. Refactor del frontend

1. Crear `Agent Turn Card`
2. Crear renderer por tipo de evento
3. Separar respuesta final del timeline
4. Integrar `events` con `tool_calls`
5. mejorar estilos claros y consistentes

Resultado esperado:

- el chat deja de parecer respuesta simple con anexos

### Fase 3. Progreso visible real

1. añadir identificador de turno
2. soportar actualizacion incremental
3. mostrar estados mientras el backend trabaja
4. fijar tools persistentes desde el inicio

Resultado esperado:

- `Sara` se siente activa y autonoma

### Fase 4. Sesion y trazabilidad

1. mejorar metadatos por sesion
2. guardar resumen del turno
3. preparar historial operativo reutilizable

Resultado esperado:

- base para memoria de ejecucion y auditoria

## Criterios de calidad del sistema final

### UX

- el usuario siempre sabe que esta haciendo `Sara`
- las tools no aparecen de forma tardia o confusa
- la respuesta final no se mezcla con la traza operativa

### Arquitectura

- backend desacoplado de la UI
- eventos estables y extensibles
- nuevos tipos de paso se pueden agregar sin romper el chat

### Seguridad

- no se expone chain-of-thought crudo
- solo razonamiento operacional resumido
- inputs y outputs visibles de tools controlados

### Evolucion futura

Esto dejara preparado el sistema para:

- shell steps
- web search steps
- browser steps
- report generation steps
- automation steps
- subagentes o coordinacion futura si se necesitara

## Resumen final de la direccion

La mejor combinacion entre Codex y OpenClaw para `Sara` es:

- de Codex:
  - timeline de eventos
  - separacion fuerte entre conversacion y ejecucion
  - multiples tipos de bloque en el chat

- de OpenClaw:
  - sesion persistente del agente
  - estado visible desde el inicio
  - tool y toolResult como entidades distintas
  - ciclo de vida operativo claramente visible

La implementacion va a transformar `Sara` de un chat con tools en:

- un runtime de agente visible,
- con trazabilidad,
- con pasos operativos persistentes,
- y con experiencia de autonomia real.
