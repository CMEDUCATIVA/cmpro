# Botón "Mapa mental" (SaraIA Docs)

Este documento describe el flujo del botón “Mapa mental” y las capacidades del template que se descarga con la respuesta de la IA.

## Flujo de funcionamiento
- Contexto: solo para el agente SaraIA Docs (`agent_type: "docs"`).
- Disparo: tras cada respuesta de Sara Docs, el frontend agrega un botón “Mapa mental”.
- Acción: al hacer clic, el frontend envía la respuesta al backend (`POST /ia_colaborativa/mindmap_report`).
- Backend:
  - Lee el template `app/assets/templates/mapa_mental.html`.
  - Genera un JSON de nodos con el LLM (máx. 5 nodos raíz, 4 hijos c/u) via `BaseAgent.call_openrouter_api`; si falla, arma un fallback con bullets de la respuesta.
  - Reemplaza `__DATA_JSON__` en el template con `JSON.stringify({ title, nodes })`.
  - Devuelve `{ success: true, html: <string> }`.
- Entrega: el frontend crea un blob con el HTML y descarga `mapa_mental.html`.

## Frontend (chat.js)
- Archivo: `app/assets/javascripts/ia_colaborativa/chat.js`.
- Hook: en `sendIaMessage`, si el agente es `docs`, se llama a `attachMindmapButton(aiNode, data.response)`.
- `attachMindmapButton` crea el botón, llama al endpoint y descarga el HTML si `success && html`; si falla, muestra `alert`.

## Backend
- Ruta: `POST /ia_colaborativa/mindmap_report` (`config/routes.rb`).
- Controlador: `app/controllers/ia_colaborativa/chat_controller.rb`.
  - `mindmap_report`: valida `content`, localiza el template, llama a `build_mindmap_data`, sustituye `__DATA_JSON__`.
  - `build_mindmap_data`: pide JSON al LLM; fallback local con frases si no llega JSON válido.

## Template `app/assets/templates/mapa_mental.html`
- Placeholder: `__DATA_JSON__` debe ser sustituido por el JSON generado.
- Controles incluidos:
  - PDF (imprime/descarga).
  - PNG (incluye nodos, líneas y trazos de dibujo; fondo transparente).
  - Lápiz (modo dibujo).
  - Borrador de arrastre (borra trazos pasando el mouse).
  - Clear (borra todos los trazos).
  - Guardar (descarga el HTML actual, persistiendo posiciones de nodos y trazos).
- Persistencia en el HTML:
  - Posiciones de nodos en `data-positions` del `<body>`.
  - Trazos dibujados en `data-image` del canvas (`draw-layer`).
  - Al abrir el HTML guardado, se restauran posiciones y trazos.
- Visual:
  - Nodos con jerarquía de estilos (niveles 0/1/2), degradados y barra superior de acento.
  - Líneas curvas con puntos de origen/destino.
  - Layout vertical por niveles (de arriba hacia abajo), con clamp para mantener nodos dentro del lienzo.

## Configuración necesaria
- Proveedor IA configurado (API key/base URL/model) en General para que el LLM genere la estructura JSON.
- No depende de LightRAG: usa la respuesta de Sara Docs ya obtenida.

## Errores y fallback
- Si falta `content` o no se encuentra el template: `success: false` con mensaje.
- Si el LLM no devuelve JSON válido: se construye un árbol simple con frases de la respuesta (fallback local).***
