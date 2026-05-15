# API MCP OpenProject — Gestión de Work Packages

Servidor MCP: `http://192.168.1.55:8000`

Todos los endpoints expuestos a continuación emplean `POST` y esperan/retornan JSON. Si el parámetro `full_retrieval` está disponible y se fija en `true`, el servicio traerá TODOS los registros en una sola petición (sin paginación).

| Endpoint | Descripción | Parámetros clave | Respuestas |
|----------|-------------|------------------|------------|
| `/tools/list_work_packages` | Lista work packages con filtros opcionales. | `project_id` (int), `status` (string, default `open`), `offset`, `page_size`, `full_retrieval` (bool, default `true`). | `200 OK` → JSON con `_embedded.elements`. `422` → Validación. |
| `/tools/get_work_package` | Recupera información detallada de un work package. | `work_package_id` *(int, requerido)*. | `200 OK` → JSON del WP. `422` → Validación. |
| `/tools/create_work_package` | Crea un nuevo work package. | `project_id`*, `subject`*, `type_id`*, `description` (string), `priority_id`, `assignee_id`. | `200 OK` → JSON del WP creado. `422` → Validación. |
| `/tools/update_work_package` | Actualiza un work package existente. | `work_package_id`*, `subject`, `description`, `type_id`, `status_id`, `priority_id`, `assignee_id`, `percentage_done`. | `200 OK` → JSON actualizado. `422` → Validación. |
| `/tools/delete_work_package` | Elimina un work package. | `work_package_id`*. | `200 OK` → resultado de la eliminación. `422` → Validación. |
| `/tools/list_types` | Lista tipos de work packages (puede filtrarse por proyecto). | `project_id` (int). | `200 OK` → lista de tipos. |
| `/tools/list_statuses` | Lista estados de work packages. | — | `200 OK` → lista de estados. |
| `/tools/list_priorities` | Lista prioridades de work packages. | — | `200 OK` → lista de prioridades. |

## Ejemplos

### 1. Listar todos los work packages (full retrieval)
```bash
curl -X POST http://192.168.1.55:8000/tools/list_work_packages \
     -H "Content-Type: application/json" \
     -d '{"project_id":123,"status":"open","full_retrieval":true}'
```

### 2. Crear un work package
```bash
curl -X POST http://192.168.1.55:8000/tools/create_work_package \
     -H "Content-Type: application/json" \
     -d '{
           "project_id": 123,
           "subject": "Coordinación BIM",
           "type_id": 5,
           "description": "Revisión de interferencias",
           "priority_id": 3,
           "assignee_id": 42
         }'
```

### 3. Actualizar estado y porcentaje
```bash
curl -X POST http://192.168.1.55:8000/tools/update_work_package \
     -H "Content-Type: application/json" \
     -d '{
           "work_package_id": 456,
           "status_id": 7,
           "percentage_done": 80
         }'
```

### 4. Eliminar un work package
```bash
curl -X POST http://192.168.1.55:8000/tools/delete_work_package \
     -H "Content-Type: application/json" \
     -d '{"work_package_id":456}'
```

## Notas
- Siempre validar que `project_id`, `type_id`, `status_id`, `priority_id` y `assignee_id` existan en el entorno de OpenProject antes de crear/actualizar.
- Los endpoints de listado (`list_work_packages`, `list_types`, etc.) respetan los filtros que se indiquen, pero si se requiere todo el catálogo, establecer `full_retrieval: true` o no enviar parámetros (depende del endpoint).
- Los errores `422` devuelven un arreglo `detail` con `loc`, `msg` y `type`; usarlo para depurar rápidamente las validaciones fallidas.
