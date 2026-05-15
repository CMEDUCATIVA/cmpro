```
  ___   ____   ____ _______ _____ _____ _____ _     ___  ___  ___ 
 / _ \ / ___| / ___|__  /_ _|_   _| ____|_   _| |   / _ \|_ _|/ _ \
| | | | |     \___ \ / / | |  | | |  _|   | | | |  | | | || || | | |
| |_| | |___   ___) / /_ | |  | | | |___  | | | |__| |_| || || |_| |
 \___/ \____| |____/____|___| |_| |_____| |_| |_____\___/|___|\___/
                COST_TYPES · COSTOS VIVO
```
# OBJETIVO 1 – COST_TYPES (Costos vivo)

## Arquitectura general
```
┌────────────────────────────┐     patch      ┌──────────────────────────────────────────┐
│ Admin::CostTypesController │◄───────────────│ Costos::Patches::CostTypesController     │
│ (núcleo OpenProject)       │                │ • sort / search / filter / paginación    │
└──────────────┬─────────────┘                │ • page_size en sesión / cálculo offset   │
               │renderiza vistas/partials     └──────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Vistas del plugin                                                                  │
│ • index.html.erb (PageHeader + filtros + selector de filas)                         │
│ • _list / _list_deleted: columnas Precio, Precio de venta, Precio estudio           │
│ • _rate y formularios: inputs triples + validaciones                               │
│ • _precio_de_venta / _precio_estudio: muestran `sale_rate` / `study_rate` vigentes  │
└────────────────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Assets                                                                              │
│ • costos/main.css       → estilos del buscador, tabla y pager                       │
│ • costos/cost_types.js  → normaliza inputs de venta/estudio, replica subform y crea │
│                           inputs nativos de fecha al añadir filas                   │
│ • costos/embed.js       → controla filtros y selector de `per_page`                 │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Backend
- `CostTypesControllerPatch` redefine `index` con ordenamiento, búsqueda insensible a mayúsculas, filtros por fecha, página actual, límites `10/25/50/100/all` y almacenamiento de la preferencia en `session[:cost_types_per_page]`.
- `CostTypePatch` procesa `new_rate_attributes=` / `existing_rate_attributes=` y normaliza `rate`, `sale_rate` y `study_rate` usando `BigDecimal`, preservando el índice del historial y descartando filas vacías.
- `PermittedParamsPatch` inserta los campos de venta/estudio dentro de la estructura permitida, respetando arrays y hashes profundos.
- `CostRatePatch` exige que `sale_rate` y `study_rate` estén presentes y sean numéricos en cada registro.
- `OpenProject::Costos::Engine` carga todos los parches en `config.to_prepare`, añade la ruta de vistas custom y registra `assets %w(costos/main.css ... )`.

## Frontend
- `index.html.erb` mantiene la experiencia nativa con componentes Primer y añade buscador inline, selector de fecha, paginación numérica y mensaje “limited results”.
- `_list` y `_list_deleted` usan traducciones nuevas:
  - “Nombre de la unidad” → **UNIDADES**.
  - “Nombre de la unidad pluralizado” → **CÓDIGO**.
  - “Tasa actual” → **Precio**.
  - “Ajustar tasa actual” → **Ajustar precio actual**.
- `_rate.html.erb` muestra tres columnas (Precio, Precio de venta y Precio estudio) con placeholders localizados y controles de moneda.
- `_precio_de_venta` y `_precio_estudio` toman el registro devuelto por `cost_type.rate_at(@fixed_date)` y formatean `sale_rate`/`study_rate` con `to_currency_with_empty`.
- `costos/cost_types.js` normaliza únicamente los inputs de venta/estudio (`1.000,50 → 1000.50`) sin tocar el campo Precio, recrea la lógica `subform#addRow/deleteRow` del core para que Turbo siga funcionando aun sin Stimulus y reemplaza cada nueva fila con un `<input type="date">` nativo antes de sincronizar nombres/IDs.

## Resultados
1. `/admin/cost_types` conserva los filtros originales y suma buscador + selector de filas con paginación real.
2. Los historiales almacenan tres montos (Precio, Precio de venta, Precio estudio) permitiendo formatos localizados.
3. Las etiquetas **UNIDADES**, **CÓDIGO** y **Ajustar precio actual** son coherentes en tabla y formulario gracias a las nuevas traducciones.
4. Todo se ejecuta dentro del engine del plugin respetando la CSP y los ciclos `rake assets:*`.

---

```
  ___  ____  ____ _____ _____ _____ _____ ____  _   _ ____  _____ ____  
 / _ \|  _ \| __ )_   _| ____| ____|_   _|  _ \| | | |  _ \| ____|  _ \ 
| | | | |_) |  _ \ | | |  _| |  _|   | | | |_) | |_| | | | |  _| | | | |
| |_| |  _ <| |_) || | | |___| |___  | | |  _ <|  _  | |_| | |___| |_| |
 \___/|_| \_\____/ |_| |_____|_____| |_| |_| \_\_| |_|____/|_____|____/ 
                COST_ENTRIES · SELECTOR INTELIGENTE
```
# OBJETIVO 2 – COST_ENTRIES (selector inteligente)

## Arquitectura
```
┌──────────────────────────────────────────────┐
│ Hook view_layouts_base                       │
│ • Carga costos/entries.css + entries.js      │
│ • Define placeholder traducido               │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ Formulario costlog (núcleo OpenProject)       │
│ • Mantiene <select id="cost_entry_cost_type_id">│
└──────────────────────────────────────────────┘
                │ observado por JS
                ▼
┌──────────────────────────────────────────────┐
│ assets/javascripts/costos/entries.js          │
│ • Espera la aparición del <select>            │
│ • Crea combobox + dropdown de 10 coincidencias│
│ • Sincroniza selección ↔ select y dispara change│
└──────────────────────────────────────────────┘
```

## Flujo
1. El hook se ejecuta solo en `costlog#new/edit` y adjunta los assets necesarios.
2. `entries.js` clona las opciones, genera un input de búsqueda, escucha teclado/scroll y actualiza el `<select>` original para que el backend reciba el `cost_type_id`.
3. El dropdown se posiciona dinámicamente y se cierra al perder foco; todos los textos provienen de `config/locales`.

## Resultado
- El usuario escribe y encuentra rápidamente el tipo de costo sin romper el backend del costlog.
- El comportamiento se limita al frontend; no existe modificación en los controladores del núcleo.

---

```
 ____  ____   ____  _____ ___  ___  ____   __        ___     _____ _____ _____ ____  
|  _ \|  _ \ / ___|| ____/ _ \|_ _|/ _ \   \ \      / / |   | ____|_   _| ____|  _ \ 
| |_) | | | |\___ \|  _|| | | || || | | |   \ \ /\ / /| |   |  _|   | | |  _| | | | |
|  __/| |_| | ___) | |__| |_| || || |_| |    \ V  V / | |___| |___  | | | |___| |_| |
|_|    \___/ |____/|_____\___/|___|\___/      \_/\_/  |_____|_____| |_| |_____|____/ 
            PRECIO DE VENTA · PRECIO ESTUDIO
```
# OBJETIVO 3 – COLUMNAS **PRECIO DE VENTA** Y **PRECIO ESTUDIO**

## Arquitectura
```
┌───────────────────────┐          ┌──────────────────────────────┐
│ Migraciones           │          │ Modelos / parches            │
│ • +sale_rate a rates  │          │ • CostTypePatch              │
│ • +study_rate a rates │          │ • CostRatePatch              │
└─────────────┬─────────┘          │ • PermittedParamsPatch       │
              │                    └────────┬─────────────────────┘
              │ datos iniciales             │
              ▼                    ┌────────▼─────────────────────┐
                            Vistas/JS                               │
                            • _rate / _precio_de_*                │
                            • costos/cost_types.js                │
                            └─────────────────────────────────────┘
```

## Backend
- `20251117010000_add_sale_rate_to_rates.rb` agrega `sale_rate` (decimal 15,4) y copia el valor de `rate` en los registros existentes.
- `20251117011000_add_study_rate_to_rates.rb` agrega `study_rate` y lo inicializa con `sale_rate` o `rate`.
- `CostTypePatch` interpreta `rate/sale_rate/study_rate` en cada fila, convierte cadenas localizadas y descarta plantillas vacías.
- `CostRatePatch` valida que `sale_rate` y `study_rate` existan y sean numéricos.
- `PermittedParamsPatch` copia únicamente los campos de venta/estudio del request crudo al árbol permitido.

## Frontend
- `_rate` añade inputs etiquetados para “Precio de venta” y “Precio estudio” junto al precio base.
- `_precio_de_venta` y `_precio_estudio` usan la misma tasa vigente que “Precio” (`cost_type.rate_at(@fixed_date)`) y formatean los montos con `to_currency_with_empty`.
- `costos/cost_types.js` estandariza los valores ingresados en venta/estudio sin tocar el campo `rate`, engancha un listener global para emular a Stimulus (`subform#addRow/deleteRow`) y, al duplicar la fila plantilla, convierte la celda de fecha en un input HTML5 que evita dependencias con componentes Angular.

## Resultado
1. Cada historial de `CostRate` almacena tres montos consistentes.
2. La captura acepta números con coma o punto, evita duplicados y mantiene los registros anteriores gracias a las migraciones.
3. La tabla principal permite consultar rápidamente Precio, Precio de venta y Precio estudio.

---

```
  ____   ___  ____  ____  ___  _   _      _     ____  _   _ ____  _     ____  ____  _____
 / ___| / _ \|  _ \|  _ \|_ _| \ | |    / \   / ___|| | | |  _ \| |   |  _ \|  _ \| ____|
 \___ \| | | | |_) | |_) || |  |  \| |  / _ \  \___ \| | | | |_) | |   | |_) | |_) |  _|
  ___) | |_| |  _ <|  _ < | |  | |\  | / ___ \  ___) | |_| |  __/| |___|  __/|  _ <| |___
 |____/ \___/|_| \_\_| \_\___| |_| \_|/_/   \_\|____/ \___/|_|   |_____|_|   |_| \_\_____|
                       PERSONALIZAR COSTOS Y PRESUPUESTOS
```
# OBJETIVO 4 – PERSONALIZAR COSTOS / PRESUPUESTOS

## Diagnóstico del core
- La pestaña “Costos” de cada work package se arma con el mixin `WorkPackages::Costs` (`openproject-dev/app/models/work_packages/costs.rb`): agrega la relación con `budget` y define los atributos `material_costs`, `labor_costs`, `overall_costs`, `spent_units` y `budget_subject`.
- `material_costs` delega a `WorkPackage::MaterialCosts` (suma de `CostEntry` con el valor `COALESCE(overridden_costs, costs)`), `labor_costs` usa `WorkPackage::LaborCosts` (valorando `TimeEntry`), y `overall_costs = labor_costs + material_costs`.
- Esos labels que vemos (“Unidades usadas”, “Costos unitarios”, “Costos de mano de obra”, “Costos totales”, “Presupuesto”) **no son custom fields configurables**: provienen de `activerecord.attributes.work_package` en `modules/costs/config/locales/en.yml` y se calculan al vuelo.

## Estrategia para el custom field / formulario propio
1. **Separar bases**  
   - Reutilizar `material_costs` y `labor_costs` como subtotales naturales (materiales vs. mano de obra).  
   - Mostrar ambos en la vista del tab para que el usuario entienda de dónde sale el total.

2. **Añadir inputs personalizados**  
   - Definir campos propios (por ejemplo, “Markup materiales (%)”, “Markup mano de obra (%)”, “Presupuesto adicional”) que se almacenen en custom fields de work package o en una tabla auxiliar (p.ej. `work_package_cost_settings`).  
   - Al renderizar el tab, leer esos valores y aplicar fórmulas como:
     ```
     mat_markup = material_costs * (porcentaje_materiales / 100.0)
     labor_markup = labor_costs * (porcentaje_mano_obra / 100.0)
     total_ajustado = material_costs + mat_markup + labor_costs + labor_markup
     ```

3. **Vista personalizada del tab**  
   - Copiar y sobrescribir la partial que pinta la sección de costos (en el módulo `costs`). Así podremos insertar filas como:
     - Costos materiales
     - Recargo materiales (X %)
     - Costos mano de obra
     - Recargo mano de obra (Y %)
     - Total ajustado
   - Incluir en la misma sección los controles para editar los porcentajes o el presupuesto personalizado.

4. **Permisos y sincronización**  
   - Respetar los permisos de `:log_costs`, `:view_cost_rates` al mostrar/editar los nuevos campos.
   - Si almacenamos los valores en custom fields estándar, aprovechar los formularios de Administración → Campos personalizados para gestionarlos. Si usamos una tabla propia, añadir las migraciones y contratos necesarios.

## Próximos pasos
- Definir exactamente qué datos debe capturar el nuevo bloque (porcentajes, presupuestos, notas, etc.).
- Crear los custom fields o modelos auxiliares para persistirlos.
- Sobrescribir la vista del tab y ajustar un helper que combine los subtotales del core con los nuevos porcentajes antes de renderizar el total personalizado.

---


```
  _____ ____  _____ ____   ____  _   _ ___ ___  _   _ ____  _      _ _   _ _____ ___ ____   ___  _     _ 
 |_   _/ ___|| ____|  _ \ / ___|| | | |_ _/ _ \| | | |  _ \| |    | | | | |_   _|_ _|  _ \ / _ \| |   | |
   | | \___ \|  _| | |_) | |    | |_| || | | | | |_| | |_) | |    | | |_| | | |  | || |_) | | | | |   | |
   | |  ___) | |___|  _ <| |___ |  _  || | |_| |  _  |  __/| |___ | |  _  | | |  | ||  __/| |_| | |___|_|
   |_| |____/|_____|_| \_\____||_| |_|___\___/|_| |_|_|   |_____||_|_| |_| |_| |___|_|    \___/|_____(_)
                  CUSTOM FIELD COSTOS PERSONALIZADO
```
# OBJETIVO 5 – CUSTOM FIELD COSTOS PERSONALIZADO


## Resumen del estado actual
- El plugin **Costos** extiende la administración de tipos de costo con filtros avanzados, nuevas columnas monetarias y etiquetas personalizadas.
- Cost Entries ahora cuenta con una búsqueda amable sin modificar el backend.
- Todas las traducciones (UNIDADES, CÓDIGO, Precio, Precio de venta, Precio estudio, Ajustar precio actual) se sincronizaron con el núcleo.
- El plan del Objetivo 6 describe cómo sobrescribir la pestaña de costos y añadir un custom field/formulario propio para porcentajes y presupuestos personalizados.
- El engine `OpenProject::Costos::Engine` centraliza los parches y los assets, por lo que basta con `rake assets:clobber && rake assets:precompile` para desplegar.***
```
 __        ___     ____  _   _ ____  ____  _   _ _____ ___  ____  ____  
 \ \      / / \\   / ___|| | | / ___||  _ \\| | | |_   _/ _ \\|  _ \\|  _ \\ 
  \\ \\ /\\ / / _ \\  \\___ \\| | | \\___ \\| |_) | |_| | | || | | | |_) | |_) |
   \\ V  V / ___ \\  ___) | |_| |___) |  __/|  _  | | || |_| |  __/|  __/ 
    \\_/\\_/_/   \\_\\|____/ \\___/|____/|_|   |_| |_| |_| \\___/|_|   |_|    
      
```
# OBJETIVO 6 – PANEL DE COSTOS PERSONALIZADOS

## Arquitectura actual
```
+----------------------------------------+        +-----------------------------------------+
| Modulo nativo WorkPackages::Costs      |        | Plugin Costos                           |
| - material_costs                       |        | - costos/costs_by_type.js               |
| - labor_costs                          |        | - costos/main.css                       |
+----------------+-----------------------+        +----------------+------------------------+
                 | agrega subtotales                         | inyecta bloque "Costos personalizado"
                 v                                            v
+----------------+-----------------------+
| Vista del tab Costos original          |
| modules/costs/.../_costs.html.erb      |
+----------------+-----------------------+
                 |
                 v
+----------------+-----------------------+
| Seccion nueva: div.costos-used-units-group|
| + section.costos-used-units-fullwidth   |
|   + table.costos-used-units-table       |
+----------------------------------------+
```

## Archivos involucrados
- `app/assets/javascripts/costos/costs_by_type.js`: crea el wrapper `costos-used-units-group`, inserta el `<section>` con encabezado, descripcion y tabla, y garantiza ancho completo.
- `app/assets/stylesheets/costos/main.css`: estilos definitivos del bloque (tipografias, espaciados, tabla) y reglas para romper la rejilla de dos columnas.
- `modules/costs/app/models/work_packages/costs.rb` (core) es la referencia de los subtotales existentes con los que se alinea el bloque.

## Backend
- No se agregaron tablas ni modelos; la seccion es de presentacion y hoy muestra `PLACEHOLDER_ROWS` hasta enlazar los calculos reales.
- El custom field `costsByType` permanece intacto; el bloque nuevo es independiente y puede convivir o reemplazarlo.

## Frontend
- El bloque "Costos personalizado" se inserta al final del panel del work package, ocupando todo el ancho igual que la descripcion CKEditor.
- La tabla ya tiene las columnas definitivas (Codigo, Unidades usadas, Cantidades, Precio, Importe) y esta lista para poblarse con datos reales.
- Estilos inline temporales + `main.css` evitan que el layout vuelva a mitad de ancho incluso con caches antiguas.

## Resultado
- La pestaña de costos ahora muestra un panel adicional con informacion personalizada sin alterar la vista original del core.
- El bloque queda preparado para conectarse a los calculos de Cost Entries/Budget cuando definamos los datos reales.

```
 ______ _   _  ____ _   _ _   _ _   _ ___ _   _ _   _  ____ ___ _   _  ____  ____
|  ____| \ | |/ __ \ | | | \ | | \ | |_ _| \ | | \ | |/ __ \_ _| \ | |/ __ \|  _ \
| |__  |  \| | |  | | | | |  \| |  \| || ||  \| |  \| | |  | | ||  \| | |  | | | |
|  __| | . ` | |  | | | | | . ` | . ` || || . ` | . ` | |  | | || . ` | |  | | | |
| |____| |\  | |__| | |_| | |\  | |\  || || |\  | |\  | |__| | || |\  | |__| | |_| |
|______|_| \_|\____/ \___/|_| \_|_| \_|___|_| \_|_| \_|\____/___|_| \_|\____/|____/
               OBJETIVO 7 – FUNCIONAMIENTO COSTOS (LOGICA CORE)
```
# OBJETIVO 7 - FUNCIONAMIENTO COSTOS

## Flujo lógico completo
1. **Registro de CostEntries**  
   - El usuario abre `costlog#new` o `costlog#edit`. El controlador (`CostlogController` del módulo oficial) valida permisos `:log_costs`, prepara collections (tipos de costo, usuarios permitidos) y construye un `CostEntry` asociado a un Work Package/Proyecto.
   - Al enviar el formulario, se invocan servicios core (`CostEntries::CreateService` / `UpdateService`) que aplican contratos (`CostEntries::CreateContract`, etc.), normalizan cantidades, unidades y moneda y ejecutan `CostEntry#save`.
   - Durante `save`, los mixins `Entry::Costs` recalculan `costs`, `overridden_costs`, `units`, y disparan callbacks que refrescan `WorkPackage#material_costs` y el `Budget` asociado.

2. **Persistencia y agregaciones**  
   - Cada `CostEntry` queda ligado a `cost_type_id`, `units`, `costs` y (tras migraciones recientes) a `entity_type/id`.  
   - Tras confirmar la transacción, los servicios invocan `SummarizedCostEntry`/`CostObject` helpers para actualizar las tablas agregadas usadas por reportes (cost reports, budgets) y se publican eventos (`OpenProject::Events::COST_ENTRY_CREATED`) para notificar a módulos externos.

3. **Exposición en API y atributos HAL**  
   - El módulo `costs` extiende el representer de `WorkPackage` (`extend_api_response` en `lib/costs/engine.rb`) para añadir propiedades HAL `laborCosts`, `materialCosts`, `overallCosts`, `costsByType` y enlaces `logCosts`, `showCosts`.  
   - `costsByType` proviene de `Api::V3::CostEntries::CostEntriesByWorkPackageAPI`, que agrega los `CostEntry` agrupados por `CostType` (SQL `GROUP BY cost_type_id`) y devuelve `units`, `netCosts`, `overriddenCosts` y metadatos de navegación (enlaces a reportes).

4. **Renderizado en la vista “Unidades usadas”**  
   - En la UI de Work Packages, el display field `costsByType` (Angular DisplayField `wp-display/costs-by-type-display-field.module.ts`) toma la propiedad HAL y genera `<a>`s con el texto `"#{units} #{cost_type.name}"`.  
   - Cada enlace apunta a `/projects/:project_id/cost_reports?...&unit=<cost_type_id>`, permitiendo a los usuarios saltar al reporte filtrado del tipo de costo específico.  
   - Este campo es de solo lectura (`class="inline-edit--display-field costsByType -read-only"`); se regenera automáticamente cuando se crea/edita un `CostEntry` o al recalcular el Work Package.

## Dependencias clave
- **Permisos**: `:log_costs`, `:view_costs`, `:view_cost_rates`, `:view_own_cost_entries` controlan quién puede crear o visualizar los agregados.
- **Modelos**: `CostEntry`, `CostType`, `CostRate`, `WorkPackage`, `Budget`. Los scopes `CostEntry.of_user`, `CostEntry.visible`, etc. limitan las consultas.
- **Servicios/Contratos**: `CostEntries::Create/Update/DeleteService`, contratos correspondientes, más `SetAttributesService` que aplica TZ, `logged_by`, `overridden_costs`.
- **API/Representers**: `Api::V3::CostEntries::*`, `CostEntriesByWorkPackageRepresenter`, `CostTypesRepresenter`, y las extensiones del representer de `WorkPackage`.
- **UI**: display field Angular + partial Rails de atributos (`wp-attribute-group--attribute`) donde se incrustan los enlaces renderizados.

## Resultado esperado
- Registrar un costo unitario desde `costlog` actualiza inmediatamente los totales (`labor_costs`, `material_costs`) y la lista de “Unidades usadas” sin pasos extra.
- Los enlaces generados son consistentes con los reportes y respetan filtros/permiso del usuario.
- La tabla personalizada del Objetivo 6 puede reutilizar `costsByType` como fuente confiable para mostrar cantidades y códigos sin duplicar lógica.

```
 _______  _        _______  _        _______  _______           _______  _        _______  _        _______         _______
(  ____ \( (    /|(  ____ \( (    /|(  ___  )(  ____ \|\     /|(  ____ \( (    /|(  ____ \( \      (  ____ \       (  __   )
| (    \/|  \  ( || (    \/|  \  ( || (   ) || (    \/| )   ( || (    \/|  \  ( || (    \/| (      | (    \/       | (  )  |
| (__    |   \ | || (__    |   \ | || |   | || (__    | (___) || |      |   \ | || (__    | |      | (__           | | /   |
|  __)   | (\ \) ||  __)   | (\ \) || |   | ||  __)   |  ___  || | ____ | (\ \) ||  __)   | |      |  __)          | (/ /) |
| (      | | \   || (      | | \   || |   | || (      | (   ) || | \_  )| | \   || (      | |      | (             |   / | |
| )      | )  \  || (____/\| )  \  || (___) || )      | )   ( || (___) || )  \  || (____/\| (____/\| (____/\ _ _ _ |  (__) |
|/       |/    )_)(_______/|/    )_)(_______)|/       |/     \|(_______)|/    )_)(_______/(_______/(_______/(_____)|_______)
                 OBJETIVO 8 - TABLA CON UNIDADES USADAS
```
# OBJETIVO 8 - TABLA CON UNIDADES USADAS

## Arquitectura (flujo en texto)
```
CostlogController + Servicios CostEntries (core)
        |
        v
CostEntry + CostType + Summaries (DB y eventos)
        |
        v
Representer WorkPackage (API v3) -> propiedad HAL costsByType
        |
        v
DisplayField core (inline-edit--display-field costsByType)
        |
        v
costos/costs_by_type.js (plugin) --> extrae enlaces y genera filas
        |
        v
Tabla personalizada (Codigo | Unidades usadas | Cantidades | Precio | Importe)
```

## Backend reutilizado
- **Core OpenProject**: no se añadió lógica propia; se consume el atributo HAL `costsByType` que ya expone el representer de `WorkPackage` y que se alimenta de `CostEntries::Create/UpdateService`, `Entry::Costs` y las agregaciones SQL del módulo `costs`.
- **Datos disponibles**: cada enlace trae `href` con `unit=<id_del_cost_type>` y texto `"#{cantidad} #{nombre_del_cost_type}"`, lo que permite derivar código y cantidad sin recalcular.

## Frontend
- **Script**: `app/assets/javascripts/costos/costs_by_type.js` busca el display field `.inline-edit--display-field.costsByType`, recorre sus `<a>` y arma un array (`code`, `description`, `quantity`). Si no hay enlaces, cae al texto plano; si tampoco hay datos, usa las filas placeholder.
- **Render**: el script reemplaza la tabla del Objetivo 6 con estos datos reales, preservando “Precio/Importe” como `-` hasta que existan cálculos monetarios. Incluye `MutationObserver` para re-renderizar al cambiar el DOM sin bucles infinitos.
- **Estilos**: se mantienen las clases de `app/assets/stylesheets/costos/main.css`, que obligan a que el bloque abarque todo el ancho y controlan la alineación de columnas.

## Resultado
- Tras registrar costos unitarios, la tabla personalizada muestra exactamente las mismas “Unidades usadas” que el display field nativo, pero formateadas en filas con columnas (Código, Descripción, Cantidades).  
- No se duplicó lógica de negocio: el backend sigue siendo el core, y el frontend sólo transforma la salida existente para integrarla en el panel personalizado.
