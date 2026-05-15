# DocumentaciÃ³n del directorio `costs`

Este Ã¡rbol corresponde al mÃ³dulo oficial de **Cost & Time tracking** de OpenProject. Extiende el nÃºcleo con:

- Un motor Rails (`lib/costs/engine.rb`) que registra el mÃ³dulo de proyecto `:costs`, crea permisos dedicados (tiempos, costos, tarifas) y aÃ±ade menÃºs administrativos y personales.
- Modelos y servicios para `TimeEntry`, `CostEntry`, tipos de costo, tarifas y actividades; todos usan contratos/servicios (`app/contracts`, `app/services`) y parches (`lib/costs/patches`) alineados con la arquitectura de OpenProject.
- Interfaz moderna basada en componentes (`app/components` + vistas ERB/Turbo) y un plugin Angular (`frontend/module`) que aÃ±ade columnas de costos y acciones de menÃº contextual.
- API REST (carpetas `lib/api/v3` y `doc/apiv3.apib`) y migraciones (`db/migrate`) que habilitan nuevos endpoints y campos.

## 1. Hooks y puntos de integraciÃ³n

- **Registro del plugin**: `lib/costs/engine.rb` usa `OpenProject::Plugins::ActsAsOpEngine` para dar de alta el plugin, definir `project_module :costs`, permisos (`view_time_entries`, `log_costs`, `view_cost_rates`, etc.), y aÃ±adir pestaÃ±as como `:admin_costs`, `:my_time_tracking` y el tab `rates` en la pÃ¡gina de usuario.
- **Ajustes globables**: `initializer "costs.settings"` define `Settings.costs_currency`, `costs_currency_format`, y flags para rastrear hora de inicio/fin.
- **Parches**: el engine aplica `patches %i[Project User PermittedParams WorkPackage]`, `patch_with_namespace :BasicData, :SettingSeeder` y `:ActiveSupport, :NumberHelper` para extender modelos, parÃ¡metros y helpers.
- **Type & Queries**: en `config.to_prepare` se registran atributos `costs_by_type`, `labor_costs`, etc. dentro del `Type` builder y se agrega `Costs::QueryCurrencySelect` al registro de consultas para mostrar sumatorias monetarias en Work Packages.
- **API V3**: `add_api_path` y `add_api_endpoint` enganchan rutas JSON (`/api/v3/cost_entries`, `/cost_types`, `/time_entries`). AdemÃ¡s, `extend_api_response` inserta propiedades `laborCosts`, `materialCosts`, `costsByType` y enlaces `logCosts/showCosts` en los representers de WorkPackage.
- **Front-end Angular**: `frontend/module/main.ts` registra `CostsByTypeDisplayField` y `CurrencyDisplayField` y aÃ±ade acciones â€œLog costsâ€ en menÃºs contextuales; escucha mediante el SDK `OpenProjectPluginContext`.
- **Turbo/Turbo Streams**: `TimeEntriesController` y los componentes `TimeEntries::*` encapsulan formularios en modales y actualizaciones en vivo (`dialog.turbo_stream.erb`, `OpTurbo::ComponentStream`).
- **FullCalendar**: `lib/full_calendar/time_entry_event.rb` define eventos para el calendario de la pÃ¡gina â€œMi control de tiempoâ€.
- **Seeders y Settings**: `app/seeders/common.yml` garantiza que los roles por defecto obtengan permisos mÃ­nimos del mÃ³dulo `costs`.

## 2. CatÃ¡logo de archivos/directorios

### RaÃ­z
| Ruta | DescripciÃ³n |
| --- | --- |
| `costs.gemspec` | metadata de la gema (nombre, autor, licencia GPLv3, recursos incluidos). |

### app/components
`_index.sass` exporta estilos comunes para los componentes.

#### cost_settings
| Archivo | DescripciÃ³n |
| --- | --- |
| `show_page_header_component.rb` | encabezado reutilizable para la secciÃ³n Admin â†’ Costos con breadcrumb y tabs â€œTime/Costsâ€. |
| `show_page_header_component.html.erb` | maqueta del header (usa clases Primer/OP). |

#### my/time_tracking
| Archivo | DescripciÃ³n |
| --- | --- |
| `calendar_component.{html.erb,rb,sass}` | Componente que dibuja el calendario mensual/semanal con los eventos de tiempo (usa FullCalendar via data attrs). |
| `header_component.{html.erb,rb}` | Barra superior con navegaciÃ³n entre modos (dÃ­a/semana/mes) y fecha actual. |
| `list_component.{html.erb,rb,sass}` | Vista tabular de entradas agrupadas por dÃ­a o semana; calcula colapsado/etiquetas como â€œHoy/Ayerâ€. |
| `list_stats_component.rb` | Resumen (horas totales, dÃ­as trabajados) mostrado junto al listado. |
| `list_wrapper_component.rb` | Wrapper que coordina toolbar + vista actual para render parcial vÃ­a Turbo. |
| `mode_switcher_component.rb` | Toggle UI que conmuta entre lista/calendario. |
| `stop_timer_component.rb` | BotÃ³n que detecta entradas `ongoing` y ofrece detenerlas. |
| `sub_header_component.{html.erb,rb}` | Etiquetas secundarias (filtros, dÃ­a seleccionado). |
| `time_entries_list_component.rb` | Renderiza la tabla de entradas de tiempo, delegando filas a `time_entry_row.rb`. |
| `time_entry_row.rb` | LÃ³gica de cada fila: muestra WP, proyecto, horas y acciones (editar/borrar). |

#### time_entries
| Archivo | DescripciÃ³n |
| --- | --- |
| `activity_form.rb` | SecciÃ³n del formulario para elegir actividad (`assignable_activities`). |
| `comments_form.rb` | Inputs de comentarios con contador y validaciones. |
| `custom_fields_form.rb` | Render dinÃ¡mico de CFs configurados para TimeEntry. |
| `days_and_hours_form.rb` | Gestiona `hours`, `spent_on`, `start_time` y toggles de seguimiento â€œdesde/hastaâ€. |
| `entity_form.rb` | Selector de work package o reuniÃ³n; carga opciones disponibles. |
| `entry_dialog_component.{html.erb,rb,sass}` | Modal completo (`#time-entry-dialog`) con form, toolbar y botones; verifica si el usuario puede borrar. |
| `time_entry_form_component.{html.erb,rb}` | Form principal, configura action/method segÃºn create/update y emite data attributes para `refresh_form`. |
| `user_form.rb` | Dropdown de usuarios cuando se loguea en nombre de otro, mostrando permisos y warnings. |
| `time_entry_form_component.html.erb` | Layout con slots para los subformularios anteriores. |

### app/contracts/time_entries
| Archivo | DescripciÃ³n |
| --- | --- |
| `base_contract.rb` | Contrato comÃºn: lÃ­mites de horas, validaciÃ³n de entidad/proyecto, actividades activas, CFs y unicidad de timers. |
| `create_contract.rb` | Reglas para crear (diferencia entre log_own/log_time). |
| `update_contract.rb` | Valida permisos de ediciÃ³n, tratamiento especial para entradas `ongoing`. |
| `delete_contract.rb` | Usa `DeleteContract` para permitir borrar segÃºn permisos y si la entrada es propia/ongoing. |

### app/controllers
| Archivo | DescripciÃ³n |
| --- | --- |
| `costlog_controller.rb` | CRUD de `CostEntry` (new/edit/create/update/destroy) con validaciones de permisos y parsing de importes. |
| `hourly_rates_controller.rb` | Administra tarifas por usuario/proyecto; muestra, edita y actualiza `HourlyRate` y `DefaultHourlyRate`. |
| `time_entries_controller.rb` | Controlador Turbo para el modal de tiempos (`dialog`, `create/update/destroy`, `refresh_form`, `user_tz_caption`). |

Subcarpetas:
- **admin/**: `costs_settings_controller.rb` (hereda de `SettingsController`), `cost_types_controller.rb` (gestiÃ³n y tasas de tipos de costo), `time_settings_controller.rb` (valida flags allow/enforce), `settings/time_entry_activities_controller.rb` (enumeraciÃ³n global).
- **my/**: `time_tracking_controller.rb` (dashboard, refresh Turbo) y `timer_controller.rb` (widget flotante con queries de ongoing).
- **projects/settings**: `time_entry_activities_controller.rb` habilita/deshabilita actividades por proyecto.

### app/helpers
| Archivo | DescripciÃ³n |
| --- | --- |
| `costlog_helper.rb` | Colecciones para selects (tipos de costo, usuarios) y utilidades de progress bars. |
| `cost_types_helper.rb` | Incluye `CostlogHelper` para vistas admin de tipos. |
| `hourly_rates_helper.rb` | Calcula la tarifa vigente en una cadena de proyectos para tabla de miembros. |
| `costs/number_helper.rb` | ConversiÃ³n locale-aware de strings numÃ©ricos â†’ BigDecimal, helpers de currency sin unidad. |

### app/models
Principales entidades:
- `cost_entry.rb`: registro material vinculado a WP; incluye `Entry::Costs`, validaciones y permisos `editable_by?/creatable_by?`.
- `time_entry.rb`: horas de trabajo (WorkPackage/Meeting) con soporte `ongoing`, `start_time`, custom fields, scopes y `Entry::Costs`.
- Tarifas: `rate.rb` (base), `hourly_rate.rb`, `default_hourly_rate.rb`, `cost_rate.rb`.
- CatÃ¡logos: `cost_type.rb`, `time_entry_activity.rb`, `time_entry_activities_project.rb`, `time_entry_custom_field.rb`.
- Auxiliares: `cost_rate`, `cost_scopes.rb`, `cost_entry/cost_entry_scopes.rb`, `time_entry_activities/scopes/active_in_project.rb`, `time_entries/scopes/{of_user_and_day,ongoing,ongoing_for_user_other_than}.rb`, `work_package/{abstract_costs,labor_costs,material_costs}.rb`, `work_packages/scopes/allowed_to_log_time.rb`, `projects/scopes/{activated_time_activity,visible_with_activated_time_activity}.rb`.
- Mixins `Entry::{Costs,DeprecatedAssociation,SplashedDates}` y `Costs::DeletedUserFallback`.
- `activities/time_entry_activity_provider.rb`: expone `time_entries` como proveedor de actividades recientes (joins, enlaces a cost reports).
- `journal/time_entry_journal.rb`: tabla STI para journaling.
- `queries/time_entries.rb`, `queries/time_entries/time_entry_query.rb`: registran filtros y orden por defecto; las clases en `queries/time_entries/filters/*.rb` implementan filtros por usuario, proyecto, actividad, fechas, estado `ongoing`, etc.; `orders/default_order.rb` ordena por `spent_on` + `updated_at`.

### app/seeders
| Archivo | DescripciÃ³n |
| --- | --- |
| `common.yml` | Ajusta permisos por defecto (miembro, editor, commenter) al activar el mÃ³dulo `costs`. |

### app/services/time_entries
| Archivo | DescripciÃ³n |
| --- | --- |
| `create_service.rb` | Usa `BaseServices::Create`; captura `RecordNotUnique` para timers duplicados y emite `OpenProject::Events::TIME_ENTRY_CREATED`. |
| `update_service.rb` | Subclase de `BaseServices::Update`. |
| `delete_service.rb` | Alias de `BaseServices::Delete`. |
| `set_attributes_service.rb` | Normaliza params, establece project/user/timezone, fija `start_time` para `ongoing`, rellena `logged_by` y CFs. |

### app/views
- **admin/costs_settings/show.html.erb**: pantalla de settings (usa componente header).  
- **admin/cost_types/** (`index`, `edit`, `_list*.erb`, `_rate.erb`): gestiÃ³n completa de tipos, incluyendo eliminados y tarifas.  
- **admin/settings/time_entry_activities/**: CRUD de actividades globales (index/edit/new/reassign).  
- **admin/time_settings/show.html.erb**: flags â€œAllow/Enforce start-end timesâ€ y texto de ayuda.  
- **costlog/edit.html.erb**: formulario de CostEntry (usuario, WP, unidades, comentario, costos).  
- **hourly_rates/** (`show`, `edit`, `_list`, `_list_default`, `_list_project`, `_rate`): tablas de tarifas por usuario/proyecto.  
- **my/time_tracking/index.html.erb**: monta componentes `Header`, `SubHeader`, `ModeSwitcher`, `List/Calendar`.  
- **my/timer/show.html.erb` y `_menu.html.erb`**: widget simple que lista la entrada en curso.  
- **projects/settings/time_entry_activities/** (`show`, `_activities`): toggles por actividad en el proyecto.  
- **time_entries/dialog.turbo_stream.erb**: actualiza contenido del modal via Turbo Streams.  
- **users/_rates.html.erb**: tab de usuario que consume `HourlyRate` para admins.

### config
| Archivo | DescripciÃ³n |
| --- | --- |
| `routes.rb` | Define rutas para time_entries (incl. `/dialog`, `/refresh_form`), cost entries, hourly rates, admin cost/time settings y My Time Tracking (rutas con constraints). |
| `locales/en.yml`, `js-en.yml` | Traducciones y strings JS para UI (permisos, botones, mensajes). |
| `locales/crowdin/*.yml` | Paquetes multilenguaje generados (af, ar, es, zh, etc.) tanto para Ruby como para JS; contienen las mismas llaves que `en.yml/js-en.yml`. |

### db
| Archivo | DescripciÃ³n |
| --- | --- |
| `migrate/1009015_aggregated_costs_migrations.rb` | MigraciÃ³n â€œsquashedâ€ que incorpora la historia de esquemas (tablas-definiciÃ³n en `db/migrate/tables/*`). |
| `migrate/20250219103939_make_time_entry_comment_text_field.rb` | Convierte comments en `text`. |
| `migrate/20250416*_add_entity_to_{time,cost}_entry.rb` | AÃ±ade columnas polimÃ³rficas `entity_type/id` y migra datos desde `work_package_id`. |
| `migrate/20250709090813_add_entity_index_for_costs.rb` | Ãndices concurrentes en `entity_type/entity_id`. |
| `migrate/tables/*.rb` | Definen columnas y constraints base para `cost_entries`, `cost_types`, `rates`, `time_entries`, `time_entry_activities_projects`, `time_entry_journals`. |

### doc
| Archivo | DescripciÃ³n |
| --- | --- |
| `apiv3.apib` | Blueprint API que describe endpoints y payloads para cost/time entries y tipos de costo. |

### frontend/module
| Archivo | DescripciÃ³n |
| --- | --- |
| `main.ts` | Punto de entrada Angular que registra display fields y hooks de menÃº contextual â€œLog costsâ€. |
| `wp-display/costs-by-type-display-field.module.ts` | DisplayField que carga `costsByType` vÃ­a API, renderiza enlaces o texto segÃºn permisos. |
| `wp-display/currency-display-field.module.ts` | DisplayField para valores monetarios; considera placeholders cuando no hay valor. |

### lib
| Archivo | DescripciÃ³n |
| --- | --- |
| `costs.rb` | Arranque del engine. |
| `costs/engine.rb` | Registro completo del plugin: permisos, menÃºs, settings, activity provider, parches, `Type`/`Query` hooks, API endpoints. |
| `costs/attributes_helper.rb` | Calcula costos laborales/materiales para un WorkPackage respetando visibilidad del usuario. |
| `costs/deleted_user_fallback.rb` | Devuelve `DeletedUser.first` si el user asociado ya no existe. |
| `costs/patches.rb` + `patches/*.rb` | Extensiones a `Project` (mÃ©todo `costs_enabled?`), `User` (gestiÃ³n de rates), `PermittedParams`, `Members` table (columna rate), `SettingSeeder`, `WorkPackage` (scope `allowed_to_log_time`), `ActiveSupport::NumberHelper` (formato de currency), etc. |
| `costs/query_currency_select.rb` | Select custom para consultas de WorkPackage que formatea columnas monetarias y define sumatorias SQL. |
| `api/v3/cost_entries/*` | APIs y representers: `CostEntriesAPI`, `CostEntriesByWorkPackageAPI`, representers individuales (`cost_entry_representer.rb`), colecciones, resumidos por tipo, y `entity_representer_factory`. |
| `api/v3/cost_types/*` | Endpoint y representer para tipos de costo. |
| `api/v3/time_entries/*` | Endpoints CRUD, helpers de WP disponibles, formularios (`create_form_api`, `update_form_api`), representers (entidad, colecciÃ³n, payload), esquemas (`schemas/*`). |
| `api/v3/costs_api_user_permission_check.rb` | MÃ³dulo que aÃ±ade chequeos de permisos al representar WorkPackages. |
| `full_calendar/time_entry_event.rb` | Adapta `TimeEntry` a eventos de calendario (cÃ¡lculo de `starts_at/ends_at`, payload extra). |

### spec
Estructura de pruebas:
- `spec/components/my/time_tracking/*` valida renderizado de componentes (lista, stats, calendar).
- `spec/contracts/time_entries/*` cubre contratos (create/update/delete).
- `spec/controllers/*` (admin, costlog, my) aseguran rutas y permisos.
- `spec/factories` y `spec/support` proveen helpers/matchers, `plugin_spec_helper.rb`.
- `spec/features` y `spec/requests/routing` ejercitan UI y API.  
En conjunto cubren formularios, permisos, servicios, filtros y API V3.

## 3. Observaciones y arquitectura operativa

- **Flujo principal**: usuarios acceden al menÃº â€œMy Time Trackingâ€ o al modal desde WP. `TimeEntriesController` renderiza `EntryDialogComponent`, que carga subcomponentes y llama a `TimeEntries::Create/UpdateService`. Estos servicios usan contratos para validar permisos y `TimeEntry` actualiza costos en `before_save`.
- **Cost entries**: `CostlogController` usa CRUD tradicional; `CostEntry` hereda mixins que recalculan costos con `CostRate`. Permisos se basan en `:log_costs`, `:view_cost_rates`, etc., definidos en el engine.
- **Tarifas**: `HourlyRate`, `DefaultHourlyRate` y `CostRate` almacenan historial y recalculan entradas afectadas a travÃ©s de callbacks (`rate_created/rate_updated`).
- **InternacionalizaciÃ³n**: se proveen traducciones para >40 idiomas; `js-en.yml` y equivalentes en `crowdin` cubren strings para `I18n.t` en Angular/Stimulus.
- **API/Front**: los endpoints V3 permiten integraciones externas para listar/crear time entries y consultar costos agregados; el mÃ³dulo Angular habilita columnas de costos en tablas WP y aÃ±ade acciones â€œLog costsâ€ sin recargar la pÃ¡gina.
- **Persistencia**: migraciones recientes aÃ±adieron `entity_type/entity_id` para desvincularse de `work_package_id` rÃ­gido, soportando entes como Meetings.

### Apuntes CSP/seguridad (plugin `ia_colaborativa`)
- `ia_colaborativa/app/views/ia_colaborativa/hooks/_floating_button.html.erb:1-10` carga los assets `chat.js` y `ckeditor/ai_button.js` con `nonce: content_security_policy_script_nonce` y `data-turbo-track='reload'`, garantizando que la CSP del core permita los scripts del chat flotante y del botón IA dentro de CKEditor.
- La documentación (`ia_colaborativa/avanceckeditor.md:5-33` y `ia_colaborativa/logicaCKEditor.md:21-26`) detalla el motivo: Turbo elimina `<script>` sin nonce y CKEditor crea la toolbar después de `DOMContentLoaded`. La solución fue centralizar la inyección en ese hook, registrar los assets en `lib/open_project/ia_colaborativa/engine.rb` y utilizar `MutationObserver` dentro de `app/assets/javascripts/ia_colaborativa/ckeditor/ai_button.js` para enganchar el botón una vez que el DOM lo permite.
- Estas pautas son reutilizables para el módulo de costos: cualquier script o botón adicional debe incluirse desde un hook del layout con `javascript_include_tag ... nonce: content_security_policy_script_nonce` y esperar al contenedor objetivo (con `MutationObserver` o reintentos) para no violar la CSP ni chocar con Turbo.

## 4. Posibles mejoras / notas

1. **README ausente**: el gemspec incluye README.md, pero el archivo no existe en este árbol; conviene añadir un README.md breve o ajustar el gemspec.
2. **Locales crowdin**: si no se requieren todos los idiomas en despliegues específicos, puede filtrarse durante build para reducir peso.
3. **Seguridad del iframe**: actualmente se aceptan iframes directos pegados por el usuario. Considerar sanitizar entradas o limitar dominios confiables antes de insertar HTML.

Con esta referencia se cubre cada carpeta y archivo funcional del directorio costs, así como los hooks clave que conectan el módulo con OpenProject.
