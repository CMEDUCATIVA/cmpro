# Botones automatizados (Work Packages & KPIs)

Este documento resume el ciclo de funcionamiento de los botones automatizados del chat, con foco en el botón **Indicadores (KPIs)**: qué hace en frontend, qué espera del backend y qué entrega al usuario.

## Ciclo de funcionamiento
- **Contexto previo**: el usuario debe tener seleccionado un proyecto (`window.selectedProject`) en la UI del chat.
- **Acción**: al hacer clic en “Indicadores (KPIs)”, el frontend valida que exista `project_id`.
- **Llamada**: el frontend realiza `POST /ia_colaborativa/kpi_report` con `project_id` y `project_name` (opcional).
- **Backend**:
- Consulta MCP para obtener el proyecto (`get_project`) y todos los work packages del proyecto (`list_work_packages project_id: <id>, status: nil, full_retrieval`).
  - Llena el template HTML `cronograma_real_vs_planificado.html` sustituyendo **todas** las apariciones de `__DATA_JSON__` con `{ project_name, project_id, generated_at, items: [...] }`.
  - Devuelve `{ success: true, html: <string> }` en JSON.
- **Entrega**: el frontend crea un `Blob` con el HTML y dispara la descarga `indicadores_kpi_<project_id>.html`.

## Frontend
- Archivo: `app/assets/javascripts/ia_colaborativa/chat.js`
- Componente: `renderWorkPackageIntentButtons` añade cuatro botones para intent `work_packages`: Planificación y Avance, Costos, Involucrados, Indicadores (KPIs).
- Lógica KPI:
  - Verifica `window.selectedProject.id`; si falta, alerta y no continúa.
  - `fetch('/ia_colaborativa/kpi_report', body: { project_id, project_name })`.
  - Si `success && html`, descarga el reporte como HTML (listo para abrir/imprimir). Si falla, muestra `alert`.
- Nota: para otros botones se mantiene el flujo previo (forces intent y reenvía el submit).

## Backend
- Ruta: `POST /ia_colaborativa/kpi_report` (`config/routes.rb`).
- Controlador: `app/controllers/ia_colaborativa/chat_controller.rb`
  - Construye `project_payload` y consulta MCP (`McpService.get_project`, `McpService.list_work_packages`).
  - Ubica el template con `kpi_template_path` (primero `OpenProject::IaColaborativa::Engine.root/app/assets/templates/cronograma_real_vs_planificado.html`, luego fallback a `Rails.root/app/assets/templates/...`).
  - Mapea cada WP a `{ id, subject, status, overallCosts, createdAt, startDate, dueDate, updatedAt }` tolerando snake/camel case.
  - Sustituye todas las apariciones de `__DATA_JSON__` (con `gsub`) y registra evento `kpi_report` en `DebugService`.
- Requisitos: el archivo `cronograma_real_vs_planificado.html` debe estar presente en el plugin (o en el fallback).

## Template
- Archivo: `app/assets/templates/cronograma_real_vs_planificado.html`
- Espera reemplazo de `__DATA_JSON__` con el payload de KPIs.
- Incluye gráficos (Chart.js) y tablas para estados, aging, costos y línea de tiempo.

## Consideraciones
- Si no hay `project_id`, el frontend detiene la acción.
- Si el template no existe en ninguna ruta, el backend devuelve error y el frontend muestra `alert`.
- Orden: la plantilla muestra los ítems en el orden recibido del MCP (no se ordenan en frontend); para ordenar por `id` o fechas, ajustar `filterItems()` en el HTML.
