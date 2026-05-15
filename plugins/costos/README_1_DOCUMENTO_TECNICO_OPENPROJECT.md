# DOCUMENTO TÉCNICO COMPLETO DE OPENPROJECT

**Versión**: 8.0.4
**Fecha de Análisis**: 10 de Noviembre de 2025
**Proyecto**: OpenProject Development Environment

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura General](#arquitectura-general)
3. [Stack Tecnológico Completo](#stack-tecnológico-completo)
4. [Estructura de Directorios](#estructura-de-directorios)
5. [Puntos de Entrada de la Aplicación](#puntos-de-entrada)
6. [Modelos y Base de Datos](#modelos-y-base-de-datos)
7. [Sistema de Rutas y API](#sistema-de-rutas-y-api)
8. [Arquitectura Frontend](#arquitectura-frontend)
9. [Servicios y Lógica de Negocio](#servicios-y-lógica-de-negocio)
10. [Sistema de Background Jobs](#sistema-de-background-jobs)
11. [Sistema de Módulos (28 Módulos)](#sistema-de-módulos)
12. [Mapa Completo de Rutas por Módulo](#mapa-completo-de-rutas)
13. [Interconexiones Entre Módulos](#interconexiones-entre-módulos)
14. [Sistema de Permisos](#sistema-de-permisos)
15. [Sistema de Eventos](#sistema-de-eventos)
16. [**Sistema de Hooks para Plugins** ⭐](#sistema-de-hooks)
17. [Testing](#testing)
18. [Build y Deployment](#build-y-deployment)
19. [Flujos de Trabajo Principales](#flujos-de-trabajo)

---

## 1. RESUMEN EJECUTIVO

OpenProject es una **plataforma empresarial de gestión de proyectos de código abierto** construida con arquitectura moderna full-stack.

### Características Principales:
- ✅ **Backend robusto**: Ruby on Rails 8.0.4 con patrón de servicios
- ✅ **Frontend moderno**: Angular 20.3+ con Hotwire Turbo
- ✅ **Base de datos**: PostgreSQL 17 con características avanzadas
- ✅ **API completa**: RESTful API v3 con formato HAL+JSON
- ✅ **28 módulos**: Arquitectura modular extensible
- ✅ **Enterprise-ready**: OAuth, SAML, LDAP, 2FA, SCIM
- ✅ **Integraciones**: GitHub, GitLab, Nextcloud, OneDrive

### Propósito:
Gestión integral de proyectos con soporte para metodologías ágiles, tradicionales, BIM, control de costos, planificación de recursos y colaboración en tiempo real.

---

## 2. ARQUITECTURA GENERAL

### Patrón Arquitectónico
```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTE                               │
│  (Navegador Web: Chrome, Firefox, Safari, Edge)             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Angular    │  │    Turbo     │  │   Stimulus   │      │
│  │   SPA 20.3   │  │   Hotwire    │  │  Controllers │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE APLICACIÓN                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Ruby on Rails 8.0.4 (MVC)                 │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │   │
│  │  │Controllers │  │   Views    │  │   Models   │    │   │
│  │  └────────────┘  └────────────┘  └────────────┘    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API REST v3 (Grape)                     │   │
│  │           Formato: HAL+JSON                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE LÓGICA DE NEGOCIO                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Services   │  │  Contracts   │  │   Policies   │      │
│  │  (CRUD ops)  │  │ (Validación) │  │(Autorización)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         PostgreSQL 17 (Base de Datos Principal)      │   │
│  │  • ActiveRecord ORM                                  │   │
│  │  • 95+ modelos                                       │   │
│  │  • Temporal data (tstzrange)                         │   │
│  │  • Full-text search                                  │   │
│  │  • JSONB para datos flexibles                        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    SERVICIOS AUXILIARES                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   GoodJob    │  │  Memcached   │  │   AWS S3     │      │
│  │ (Background  │  │   (Cache)    │  │ (Archivos)   │      │
│  │    Jobs)     │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Características Arquitectónicas:
- **Monolito modular**: Aplicación monolítica con módulos independientes
- **Service-Oriented**: Lógica de negocio en servicios reutilizables
- **API-First**: Diseño API primero, UI consume API
- **Progressive Enhancement**: HTML base + enriquecimiento JavaScript
- **Event-Driven**: Comunicación entre módulos mediante eventos

---

## 3. STACK TECNOLÓGICO COMPLETO

### Backend Stack

#### Core Framework
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Ruby | 3.4.7 | Lenguaje de programación |
| Rails | 8.0.4 | Framework web |
| Puma | Latest | Servidor web |
| Rack | 3.x | Interface servidor web |
| Bundler | Latest | Gestión de dependencias |

#### Base de Datos
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| PostgreSQL | 17 | Base de datos principal |
| ActiveRecord | 8.0.4 | ORM |
| PaperTrail | Latest | Auditoría de cambios |
| PgSearch | Latest | Búsqueda full-text |

#### API & Serialización
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Grape | 2.4.0 | Framework API REST |
| Roar | 1.2.0 | Representaciones HAL+JSON |
| Oj | Latest | Parser JSON rápido |
| ActiveModel::Serializer | Latest | Serialización |

#### Autenticación & Seguridad
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Doorkeeper | 5.8.0 | Servidor OAuth 2.0 |
| Warden | Latest | Autenticación Rack |
| OmniAuth | Custom fork | Autenticación externa |
| BCrypt | Latest | Hash de contraseñas |
| Rack::Attack | Latest | Rate limiting |
| ROTP | Latest | TOTP (2FA) |
| ruby-saml | Latest | SAML authentication |
| Scimitar | Latest | SCIM provisioning |

#### Background Jobs
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| GoodJob | 3.99.1 | Queue de trabajos |
| ActiveJob | 8.0.4 | Interface de jobs |
| Ice Cube | Latest | Eventos recurrentes |

#### File Storage
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| CarrierWave | Latest | Upload de archivos |
| MiniMagick | Latest | Procesamiento de imágenes |
| AWS SDK S3 | Latest | Almacenamiento cloud |
| Fog | Latest | Abstracción cloud storage |

#### Validation & Business Logic
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| dry-validation | Latest | Validación de contratos |
| dry-monads | Latest | Programación funcional |
| dry-container | Latest | Inyección de dependencias |

#### Markdown & Formats
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| CommonMarker | Latest | Parser Markdown |
| Prawn | Latest | Generación PDF |
| RubyZip | Latest | Archivos ZIP |
| Spreadsheet | Latest | Excel antiguo |

#### Monitoring & Observability
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| AppSignal | Latest | APM |
| OpenTelemetry | Latest | Observabilidad |
| Yabeda | Latest | Métricas |
| Lograge | Latest | Logs estructurados |

### Frontend Stack

#### Core Framework
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Angular | 20.3.10 | Framework SPA |
| TypeScript | 5.7.x | Lenguaje tipado |
| RxJS | 7.8 | Programación reactiva |
| Zone.js | 0.15 | Change detection |

#### Build Tools
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Angular CLI | 20.3.9 | Herramienta de build |
| esbuild | Latest | Bundler rápido |
| Sass | Latest | Preprocesador CSS |
| PostCSS | Latest | Transformación CSS |
| Autoprefixer | Latest | Prefijos CSS |

#### UI Components & Styling
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Primer CSS | Latest | Sistema de diseño GitHub |
| FullCalendar | 6.x | Calendario |
| Chart.js | Latest | Gráficas |
| Flatpickr | Latest | Date picker |
| Dragula | Latest | Drag & drop |

#### Rich Text & Editing
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| BlockNote | Latest | Editor de texto rico |
| CKEditor | Latest | Editor WYSIWYG |
| Turndown | Latest | HTML a Markdown |

#### State Management
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Akita | @datorama/akita | Entity stores |
| Reactivestates | @openproject | State personalizado |

#### Routing
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| UI-Router | @uirouter/angular | Routing SPA |

#### Progressive Enhancement
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Turbo | 8.0 | Hotwire Turbo |
| Stimulus | 3.2 | Controladores JS |

#### 3D & BIM
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| xeokit-sdk | Latest | Visualización 3D BIM |

#### Utilities
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Lodash | Latest | Utilidades JS |
| Moment.js | Latest | Manejo de fechas |
| URIjs | Latest | Manipulación URLs |
| UUID | Latest | Generación UUIDs |

### Testing Stack

#### Backend Testing
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| RSpec | Latest | Framework de testing |
| FactoryBot | Latest | Datos de prueba |
| Capybara | Latest | Testing de integración |
| Selenium | Latest | Automatización navegador |
| Cuprite | Latest | Headless Chrome |
| WebMock | Latest | Mock HTTP |
| VCR | Latest | Grabación HTTP |
| Timecop | Latest | Manipulación tiempo |
| Shoulda Matchers | Latest | Matchers RSpec |
| DatabaseCleaner | Latest | Limpieza DB tests |

#### Frontend Testing
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Karma | Latest | Test runner |
| Jasmine | Latest | Framework tests |
| jasmine-spec-reporter | Latest | Reportes |
| karma-coverage | Latest | Cobertura de código |

### DevOps & Deployment

#### Containerización
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Docker | Latest | Contenedores |
| Docker Compose | Latest | Orquestación local |

#### CI/CD
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| GitHub Actions | Latest | CI/CD pipeline |
| Packager.io | Latest | Empaquetado DEB/RPM |

#### Caching
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Memcached | Latest | Cache distribuido |
| Dalli | Latest | Cliente Memcached |
| Redis | Optional | Cache alternativo |

---

## 4. ESTRUCTURA DE DIRECTORIOS

```
C:\Users\Administrador\Downloads\PROYECTO MEJORA\openproject-dev\openproject-dev\
│
├── app/                                    # Código principal de la aplicación
│   ├── assets/                             # Assets legacy (imágenes, fonts)
│   │   ├── fonts/                          # Fuentes personalizadas
│   │   ├── images/                         # Imágenes estáticas
│   │   └── stylesheets/                    # CSS/SCSS legacy
│   │
│   ├── components/                         # ViewComponent (Ruby)
│   │   ├── admin/                          # Componentes admin
│   │   ├── projects/                       # Componentes de proyectos
│   │   ├── work_packages/                  # Componentes de WP
│   │   └── ...                             # Más componentes
│   │
│   ├── constants/                          # Constantes de aplicación
│   │
│   ├── contracts/                          # Contratos de validación
│   │   ├── base_contract.rb                # Contrato base
│   │   ├── work_packages/                  # Contratos WP
│   │   ├── projects/                       # Contratos proyectos
│   │   └── ...                             # Más contratos
│   │
│   ├── controllers/                        # Controladores Rails
│   │   ├── application_controller.rb       # Controlador base
│   │   ├── work_packages_controller.rb     # WP controller
│   │   ├── projects_controller.rb          # Projects controller
│   │   ├── api/                            # (Algunos endpoints API legacy)
│   │   └── ...                             # 150+ controladores
│   │
│   ├── forms/                              # Form Objects
│   │   └── ...                             # Formularios desacoplados
│   │
│   ├── helpers/                            # View Helpers
│   │   ├── application_helper.rb           # Helper base
│   │   ├── work_packages_helper.rb         # WP helpers
│   │   └── ...                             # 50+ helpers
│   │
│   ├── mailers/                            # Email mailers
│   │   ├── user_mailer.rb                  # Emails de usuario
│   │   ├── digest_mailer.rb                # Emails digest
│   │   └── ...                             # Más mailers
│   │
│   ├── menus/                              # Definiciones de menús
│   │   ├── menu_manager.rb                 # Gestor de menús
│   │   └── ...                             # Configuración de menús
│   │
│   ├── models/                             # ActiveRecord Models
│   │   ├── application_record.rb           # Modelo base
│   │   ├── work_package.rb                 # Modelo WorkPackage ⭐
│   │   ├── project.rb                      # Modelo Project ⭐
│   │   ├── user.rb                         # Modelo User ⭐
│   │   ├── type.rb                         # Tipos de WP
│   │   ├── status.rb                       # Estados
│   │   ├── journal.rb                      # Historial de cambios
│   │   ├── custom_field.rb                 # Campos personalizados
│   │   ├── attachment.rb                   # Archivos adjuntos
│   │   └── ...                             # 95+ modelos
│   │
│   ├── policies/                           # Políticas de autorización
│   │   ├── base_policy.rb                  # Política base
│   │   └── ...                             # Políticas por modelo
│   │
│   ├── seeders/                            # Seeders de base de datos
│   │   ├── basic_data_seeder.rb            # Datos básicos
│   │   ├── demo_data_seeder.rb             # Datos demo
│   │   └── ...                             # Más seeders
│   │
│   ├── services/                           # Servicios de negocio ⭐
│   │   ├── base_services/                  # Servicios base
│   │   │   ├── create.rb                   # Servicio crear genérico
│   │   │   ├── update.rb                   # Servicio actualizar
│   │   │   ├── delete.rb                   # Servicio eliminar
│   │   │   └── set_attributes.rb           # Setear atributos
│   │   │
│   │   ├── work_packages/                  # Servicios de WP
│   │   │   ├── create_service.rb
│   │   │   ├── update_service.rb
│   │   │   ├── delete_service.rb
│   │   │   ├── copy_service.rb
│   │   │   ├── set_schedule_service.rb     # Scheduling
│   │   │   └── ...                         # 30+ servicios WP
│   │   │
│   │   ├── projects/                       # Servicios de proyectos
│   │   ├── members/                        # Servicios de miembros
│   │   ├── users/                          # Servicios de usuarios
│   │   └── ...                             # 200+ servicios
│   │
│   ├── uploaders/                          # CarrierWave uploaders
│   │   ├── attachment_uploader.rb          # Uploader de adjuntos
│   │   └── ...                             # Más uploaders
│   │
│   ├── validators/                         # Validadores personalizados
│   │   └── ...                             # Validadores custom
│   │
│   ├── views/                              # Vistas ERB/HTML
│   │   ├── layouts/                        # Layouts principales
│   │   │   ├── application.html.erb        # Layout principal
│   │   │   └── ...                         # Más layouts
│   │   ├── work_packages/                  # Vistas WP
│   │   ├── projects/                       # Vistas proyectos
│   │   └── ...                             # 300+ vistas
│   │
│   └── workers/                            # Background workers ⭐
│       ├── application_job.rb              # Job base
│       ├── copy_project_job.rb             # Copiar proyecto async
│       ├── backup_job.rb                   # Backups
│       └── ...                             # 50+ workers
│
├── config/                                 # Configuración Rails
│   ├── application.rb                      # Configuración principal
│   ├── boot.rb                             # Inicialización
│   ├── database.yml.example                # Config DB
│   ├── configuration.yml.example           # Config OpenProject
│   ├── routes.rb                           # Rutas (37,176 líneas!)
│   │
│   ├── environments/                       # Configuración por entorno
│   │   ├── development.rb                  # Desarrollo
│   │   ├── production.rb                   # Producción
│   │   └── test.rb                         # Testing
│   │
│   ├── initializers/                       # Inicializadores
│   │   ├── permissions.rb                  # Sistema de permisos ⭐
│   │   ├── menus.rb                        # Menús de aplicación
│   │   ├── doorkeeper.rb                   # OAuth 2.0
│   │   ├── content_security_policy.rb      # CSP headers
│   │   ├── custom_field_format.rb          # Formatos custom fields
│   │   ├── cronjobs.rb                     # Cron jobs ⭐
│   │   ├── opentelemetry.rb                # Observabilidad
│   │   └── ...                             # 100+ inicializadores
│   │
│   └── locales/                            # Traducciones i18n
│       ├── en.yml                          # Inglés
│       ├── es.yml                          # Español
│       ├── de.yml                          # Alemán
│       └── ...                             # 30+ idiomas
│
├── db/                                     # Base de datos
│   ├── migrate/                            # Migraciones
│   │   └── *.rb                            # 700+ migraciones
│   ├── seeds.rb                            # Seeds principales
│   └── structure.sql                       # Schema SQL
│
├── docker/                                 # Configuración Docker
│   ├── dev/                                # Entorno desarrollo
│   ├── prod/                               # Entorno producción
│   └── ci/                                 # CI/CD
│
├── frontend/                               # Aplicación Angular ⭐
│   ├── src/
│   │   ├── app/                            # Módulos Angular
│   │   │   ├── app.module.ts               # Módulo raíz
│   │   │   ├── core/                       # Servicios core
│   │   │   │   ├── setup/                  # Inicialización
│   │   │   │   ├── state/                  # Estado global
│   │   │   │   └── errors/                 # Manejo errores
│   │   │   │
│   │   │   ├── features/                   # Features/Módulos
│   │   │   │   ├── work-packages/          # WP feature
│   │   │   │   ├── boards/                 # Boards
│   │   │   │   ├── calendar/               # Calendar
│   │   │   │   ├── team-planner/           # Team planner
│   │   │   │   └── ...                     # Más features
│   │   │   │
│   │   │   ├── shared/                     # Compartido
│   │   │   │   ├── components/             # Componentes shared
│   │   │   │   └── services/               # Servicios shared
│   │   │   │
│   │   │   └── spot/                       # Sistema de diseño Spot
│   │   │
│   │   ├── assets/                         # Assets frontend
│   │   ├── global_styles/                  # Estilos globales SCSS
│   │   ├── stimulus/                       # Stimulus controllers
│   │   ├── turbo/                          # Turbo config
│   │   └── main.ts                         # Entry point ⭐
│   │
│   ├── angular.json                        # Config Angular CLI
│   ├── package.json                        # Dependencias npm
│   ├── tsconfig.json                       # Config TypeScript
│   └── karma.conf.js                       # Config testing
│
├── lib/                                    # Librerías extendidas
│   ├── api/                                # API Implementation ⭐
│   │   ├── root.rb                         # API Root mount
│   │   └── v3/                             # API v3
│   │       ├── work_packages/              # WP endpoints
│   │       ├── projects/                   # Projects endpoints
│   │       ├── users/                      # Users endpoints
│   │       ├── queries/                    # Queries endpoints
│   │       └── ...                         # 50+ recursos API
│   │
│   ├── open_project/                       # Core de OpenProject
│   │   ├── authentication/                 # Autenticación
│   │   ├── plugins/                        # Sistema de plugins
│   │   ├── access_control.rb               # Control de acceso
│   │   └── ...                             # Core modules
│   │
│   └── tasks/                              # Rake tasks
│       ├── backup.rake                     # Tareas backup
│       └── ...                             # Más tasks
│
├── modules/                                # Módulos/Plugins ⭐⭐⭐
│   ├── auth_plugins/                       # Auth framework
│   ├── auth_saml/                          # SAML auth
│   ├── avatars/                            # Avatares
│   ├── backlogs/                           # Agile/Scrum
│   ├── bim/                                # BIM/BCF
│   ├── boards/                             # Kanban boards
│   ├── budgets/                            # Presupuestos
│   ├── calendar/                           # Calendario
│   ├── costs/                              # Costos
│   ├── documents/                          # Documentos
│   ├── gantt/                              # Gantt
│   ├── github_integration/                 # GitHub
│   ├── gitlab_integration/                 # GitLab
│   ├── grids/                              # Sistema grids
│   ├── job_status/                         # Estado jobs
│   ├── ldap_groups/                        # LDAP sync
│   ├── meeting/                            # Reuniones
│   ├── my_page/                            # Dashboard usuario
│   ├── openid_connect/                     # OpenID Connect
│   ├── overviews/                          # Overview proyectos
│   ├── recaptcha/                          # reCAPTCHA
│   ├── reporting/                          # Reportes
│   ├── storages/                           # Nextcloud/OneDrive
│   ├── team_planner/                       # Planificación equipos
│   ├── two_factor_authentication/          # 2FA
│   ├── webhooks/                           # Webhooks
│   └── xls_export/                         # Export Excel
│   │
│   └── [ESTRUCTURA DE CADA MÓDULO]
│       ├── app/
│       │   ├── controllers/                # Controladores módulo
│       │   ├── models/                     # Modelos módulo
│       │   ├── services/                   # Servicios módulo
│       │   └── views/                      # Vistas módulo
│       ├── config/
│       │   └── routes.rb                   # Rutas módulo
│       ├── db/
│       │   └── migrate/                    # Migraciones módulo
│       ├── frontend/                       # Frontend módulo
│       ├── lib/
│       │   ├── openproject-[module]/
│       │   │   └── engine.rb               # Rails Engine ⭐
│       │   └── open_project/
│       │       └── [module]/
│       │           └── patches/            # Monkey patches
│       └── spec/                           # Tests módulo
│
├── packaging/                              # Scripts deployment
│   ├── scripts/
│   │   ├── web                             # Script web server
│   │   ├── worker                          # Script worker
│   │   ├── backup                          # Script backup
│   │   └── check                           # Health check
│   └── ...                                 # Config empaquetado
│
├── public/                                 # Archivos estáticos
│   ├── assets/                             # Assets compilados
│   │   └── frontend/                       # Frontend build
│   ├── 404.html                            # Páginas error
│   └── robots.txt                          # SEO
│
├── spec/                                   # Tests RSpec ⭐
│   ├── controllers/                        # Tests controllers
│   ├── models/                             # Tests models
│   ├── services/                           # Tests services
│   ├── features/                           # Tests integración
│   ├── requests/                           # Tests requests
│   ├── factories/                          # FactoryBot factories
│   ├── support/                            # Test helpers
│   └── ...                                 # 10,000+ specs
│
├── .dockerignore                           # Docker ignore
├── .gitignore                              # Git ignore
├── .pkgr.yml                               # Packager.io config
├── .ruby-version                           # Versión Ruby
├── docker-compose.yml                      # Docker Compose
├── Gemfile                                 # Dependencias Ruby
├── Gemfile.lock                            # Lockfile gems
├── Gemfile.modules                         # Gems de módulos
├── package.json                            # Dependencias npm (root)
├── Procfile                                # Procfile producción
├── Procfile.dev                            # Procfile desarrollo
├── Rakefile                                # Rake tasks
└── README.md                               # Documentación
```

---

## 5. PUNTOS DE ENTRADA DE LA APLICACIÓN

### Modo Desarrollo

#### Procfile.dev
```bash
# Archivo: Procfile.dev

web: bundle exec rails server
worker: bundle exec good_job start
frontend: npm run serve
```

**Comandos**:
```bash
# Iniciar todos los servicios
$ overmind start -f Procfile.dev

# O individualmente:
$ bundle exec rails server     # Backend en puerto 3000
$ bundle exec good_job start   # Worker de background jobs
$ npm run serve                # Frontend Angular en puerto 4200
```

### Modo Producción

#### Procfile
```bash
# Archivo: Procfile

web: ./packaging/scripts/web
worker: ./packaging/scripts/worker
backup: ./packaging/scripts/backup
check: ./packaging/scripts/check
```

### Entry Points Específicos

#### Backend Entry Point
```ruby
# Archivo: config.ru
require_relative "config/environment"
run OpenProject::Application
```

#### Application Bootstrap
```ruby
# Archivo: config/application.rb
module OpenProject
  class Application < Rails::Application
    # Configuración de la aplicación
  end
end
```

#### Frontend Entry Point
```typescript
// Archivo: frontend/src/main.ts
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err));
```

---

## 6. MODELOS Y BASE DE DATOS

### Base de Datos: PostgreSQL 17

#### Características Especiales:
- **Advisory Locks**: Para concurrencia
- **Temporal Data**: Columnas `tstzrange` para rangos de tiempo
- **Full-Text Search**: Búsqueda de texto completo
- **JSONB**: Datos flexibles en JSON
- **Arrays**: Columnas tipo array
- **Partial Indexes**: Índices parciales para optimización

### Modelos Principales (95+ modelos)

#### 1. WorkPackage ⭐ (Modelo Central)
```ruby
# Archivo: app/models/work_package.rb

class WorkPackage < ApplicationRecord
  # Asociaciones principales
  belongs_to :project
  belongs_to :type
  belongs_to :status
  belongs_to :priority
  belongs_to :author, class_name: 'User'
  belongs_to :assigned_to, class_name: 'Principal'
  belongs_to :responsible, class_name: 'Principal'
  belongs_to :version
  belongs_to :category

  has_many :time_entries
  has_many :relations_from, class_name: 'Relation', foreign_key: 'from_id'
  has_many :relations_to, class_name: 'Relation', foreign_key: 'to_id'
  has_many :journals
  has_many :attachments, as: :container
  has_many :watchers, as: :watchable

  # Extensiones de módulos
  has_many :cost_entries           # Desde módulo costs
  has_one :bcf_issue              # Desde módulo bim
  has_many :file_links            # Desde módulo storages
  has_many :github_pull_requests  # Desde módulo github_integration
  has_many :gitlab_merge_requests # Desde módulo gitlab_integration

  # Campos principales
  # - subject (string)
  # - description (text)
  # - start_date (date)
  # - due_date (date)
  # - estimated_hours (float)
  # - done_ratio (integer)
  # - position (integer)
  # - created_at (datetime)
  # - updated_at (datetime)
  # - lock_version (integer) - Optimistic locking

  # Métodos de scheduling
  # - set_schedule
  # - reschedule_after(date)
  # - follows, precedes relations
end
```

**Tabla**: `work_packages`
**Registros Típicos**: 10,000 - 1,000,000+
**Uso**: Tareas, bugs, features, epics, user stories

#### 2. Project
```ruby
# Archivo: app/models/project.rb

class Project < ApplicationRecord
  # Jerarquía
  acts_as_nested_set
  belongs_to :parent, class_name: 'Project'
  has_many :children, class_name: 'Project', foreign_key: 'parent_id'

  # Work packages
  has_many :work_packages

  # Membresía
  has_many :members
  has_many :users, through: :members
  has_many :member_principals, class_name: 'Member'

  # Módulos habilitados
  has_many :enabled_modules

  # Tipos de workspace
  # - project
  # - program
  # - portfolio

  # Visibilidad
  # - public
  # - private (solo miembros)

  # Estados
  # - active
  # - archived
  # - scheduled_for_deletion
end
```

**Tabla**: `projects`
**Uso**: Contenedor principal de work packages y recursos

#### 3. User/Principal
```ruby
# Archivo: app/models/user.rb

class User < Principal
  # Autenticación
  has_many :sessions
  has_many :oauth_applications
  has_many :oauth_access_grants
  has_many :oauth_access_tokens

  # Membresía en proyectos
  has_many :members
  has_many :projects, through: :members

  # Work packages
  has_many :assigned_work_packages, class_name: 'WorkPackage', foreign_key: 'assigned_to_id'
  has_many :responsible_work_packages, class_name: 'WorkPackage', foreign_key: 'responsible_id'

  # Notificaciones
  has_many :notifications

  # Tipos de usuario
  # - User (usuario normal)
  # - Group (grupo de usuarios)
  # - PlaceholderUser (usuario placeholder)
  # - DeletedUser (usuario eliminado)
end
```

**Tabla**: `users` (hereda de `principals`)
**Patrón**: Single Table Inheritance (STI)

#### 4. Type (Tipo de Work Package)
```ruby
# Archivo: app/models/type.rb

class Type < ApplicationRecord
  has_many :work_packages
  has_many :workflows
  has_and_belongs_to_many :custom_fields
  has_and_belongs_to_many :projects

  # Tipos comunes:
  # - Task
  # - Bug
  # - Feature
  # - Epic
  # - User Story
  # - Phase
  # - Milestone
end
```

#### 5. Status (Estado de Work Package)
```ruby
# Archivo: app/models/status.rb

class Status < ApplicationRecord
  has_many :work_packages
  has_many :workflows

  # Propiedades
  # - is_closed (boolean)
  # - is_default (boolean)
  # - color (string)
  # - position (integer)

  # Estados comunes:
  # - New
  # - In Progress
  # - On Hold
  # - Resolved
  # - Closed
  # - Rejected
end
```

#### 6. Journal (Historial de Cambios)
```ruby
# Archivo: app/models/journal.rb

class Journal < ApplicationRecord
  belongs_to :journable, polymorphic: true
  belongs_to :user
  has_many :journal_data, class_name: 'Journal::BaseJournal'

  # Tracking completo de cambios
  # - Qué cambió
  # - Quién lo cambió
  # - Cuándo cambió
  # - Valores anteriores y nuevos

  # Usado por PaperTrail
end
```

#### 7. CustomField (Campos Personalizados)
```ruby
# Archivo: app/models/custom_field.rb

class CustomField < ApplicationRecord
  has_many :custom_values
  has_and_belongs_to_many :types
  has_and_belongs_to_many :projects

  # Formatos soportados:
  # - string
  # - text
  # - int
  # - float
  # - date
  # - bool
  # - list (single select)
  # - list (multi select)
  # - user
  # - version
  # - link
  # - attachment
end
```

#### 8. Attachment (Archivos Adjuntos)
```ruby
# Archivo: app/models/attachment.rb

class Attachment < ApplicationRecord
  belongs_to :container, polymorphic: true
  belongs_to :author, class_name: 'User'

  # Almacenamiento vía CarrierWave
  mount_uploader :file, AttachmentUploader

  # Propiedades
  # - filename
  # - content_type
  # - filesize
  # - digest (SHA256)
  # - downloads (contador)
end
```

### Tabla de Modelos Completa

| Modelo | Tabla | Propósito |
|--------|-------|-----------|
| WorkPackage | work_packages | Tareas/Issues central |
| Project | projects | Proyectos y portfolios |
| User | users/principals | Usuarios del sistema |
| Group | principals | Grupos de usuarios |
| PlaceholderUser | principals | Usuarios placeholder |
| Type | types | Tipos de work packages |
| Status | statuses | Estados de WP |
| Priority | priorities | Prioridades |
| Version | versions | Versiones/Sprints |
| Category | categories | Categorías de WP |
| Role | roles | Roles y permisos |
| Member | members | Membresía en proyectos |
| TimeEntry | time_entries | Entradas de tiempo |
| Journal | journals | Historial de cambios |
| CustomField | custom_fields | Campos personalizados |
| CustomValue | custom_values | Valores de campos custom |
| Attachment | attachments | Archivos adjuntos |
| Query | queries | Consultas guardadas |
| Watcher | watchers | Observadores de entidades |
| Notification | notifications | Notificaciones de usuarios |
| WikiPage | wiki_pages | Páginas wiki |
| Forum | forums | Foros de discusión |
| Message | messages | Mensajes en foros |
| News | news | Noticias del proyecto |
| Comment | comments | Comentarios |
| Relation | relations | Relaciones entre WP |
| Workflow | workflows | Flujos de trabajo |
| EnabledModule | enabled_modules | Módulos habilitados |
| OAuthApplication | oauth_applications | Apps OAuth |
| OAuthAccessToken | oauth_access_tokens | Tokens OAuth |
| Setting | settings | Configuración sistema |

---

## 7. SISTEMA DE RUTAS Y API

### Archivo Principal de Rutas

**Archivo**: `config/routes.rb`
**Tamaño**: 37,176 líneas
**Formato**: Ruby DSL

### Estructura de Rutas

#### Rutas Principales
```ruby
# Root
root to: 'homescreen#index'

# Work Packages - Recurso principal
resources :work_packages do
  # Rutas anidadas
  resources :relations
  resources :watchers
  resources :activities

  # Custom actions
  member do
    get :copy
    post :duplicate
    get :tab
  end

  collection do
    get :report
    match :bulk_edit, via: [:get, :post]
    post :bulk_update
  end
end

# Projects
resources :projects do
  # Módulos de proyecto
  resources :work_packages
  resources :members
  resources :versions
  resources :categories
  resources :news
  resources :forums
  resources :wiki

  # Settings
  get :settings, to: 'projects#settings'
  get 'settings/:tab', to: 'projects#settings'
end

# Users
resources :users do
  member do
    get :edit_layout
    post :order_blocks
    get :deletion_info
  end
end

# Admin
namespace :admin do
  resources :users
  resources :groups
  resources :roles
  resources :types
  resources :statuses
  resources :workflows
  resources :custom_fields
  resources :enumerations
  resources :settings
end

# Authentication
get '/login', to: 'account#login'
post '/login', to: 'account#login'
get '/logout', to: 'account#logout'
get '/auth/:provider/callback', to: 'auth#callback'

# API v3 (mounted desde lib/api)
scope '/api' do
  mount API::Root => '/'
end
```

### API REST v3

**Framework**: Grape
**Formato**: HAL+JSON (Hypertext Application Language)
**Versionado**: URL-based (/api/v3)
**Autenticación**: OAuth 2.0, API Key, Session

#### Estructura API
```
/api/v3/
├── Root
│   ├── _links
│   └── _embedded
│
├── work_packages/
│   ├── GET /api/v3/work_packages
│   ├── POST /api/v3/work_packages
│   ├── GET /api/v3/work_packages/:id
│   ├── PATCH /api/v3/work_packages/:id
│   ├── DELETE /api/v3/work_packages/:id
│   ├── GET /api/v3/work_packages/:id/activities
│   ├── GET /api/v3/work_packages/:id/relations
│   ├── POST /api/v3/work_packages/:id/relations
│   ├── GET /api/v3/work_packages/:id/watchers
│   ├── POST /api/v3/work_packages/:id/watchers
│   ├── GET /api/v3/work_packages/:id/available_assignees
│   └── ...
│
├── projects/
│   ├── GET /api/v3/projects
│   ├── POST /api/v3/projects
│   ├── GET /api/v3/projects/:id
│   ├── PATCH /api/v3/projects/:id
│   ├── DELETE /api/v3/projects/:id
│   ├── GET /api/v3/projects/:id/work_packages
│   ├── GET /api/v3/projects/:id/members
│   └── ...
│
├── users/
│   ├── GET /api/v3/users
│   ├── POST /api/v3/users
│   ├── GET /api/v3/users/:id
│   ├── PATCH /api/v3/users/:id
│   ├── DELETE /api/v3/users/:id
│   └── ...
│
├── queries/
│   ├── GET /api/v3/queries
│   ├── POST /api/v3/queries
│   ├── GET /api/v3/queries/:id
│   └── ...
│
├── time_entries/
│   ├── GET /api/v3/time_entries
│   ├── POST /api/v3/time_entries
│   ├── GET /api/v3/time_entries/:id
│   └── ...
│
└── [50+ recursos más]
```

#### Ejemplo de Respuesta HAL+JSON
```json
{
  "_type": "WorkPackage",
  "_links": {
    "self": { "href": "/api/v3/work_packages/1" },
    "project": { "href": "/api/v3/projects/1", "title": "Project Name" },
    "type": { "href": "/api/v3/types/1", "title": "Task" },
    "status": { "href": "/api/v3/statuses/1", "title": "New" },
    "author": { "href": "/api/v3/users/1", "title": "John Doe" },
    "assignee": { "href": "/api/v3/users/2", "title": "Jane Smith" },
    "update": { "href": "/api/v3/work_packages/1", "method": "PATCH" },
    "delete": { "href": "/api/v3/work_packages/1", "method": "DELETE" }
  },
  "id": 1,
  "subject": "Fix login bug",
  "description": {
    "format": "markdown",
    "raw": "# Description\n\nUsers cannot login...",
    "html": "<h1>Description</h1>..."
  },
  "startDate": "2025-01-15",
  "dueDate": "2025-01-20",
  "estimatedTime": "PT8H",
  "percentageDone": 50,
  "createdAt": "2025-01-10T10:30:00Z",
  "updatedAt": "2025-01-11T15:45:00Z"
}
```

---

## 8. ARQUITECTURA FRONTEND

### Framework: Angular 20.3+

#### Módulos Principales

**Archivo**: `frontend/src/app/app.module.ts`

```typescript
@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    UIRouterModule.forRoot({ ... }),

    // Feature modules
    WorkPackagesModule,
    BoardsModule,
    CalendarModule,
    TeamPlannerModule,
    GanttModule,
    // ... más módulos
  ],
  providers: [
    // Services
    ApiV3Service,
    PathHelperService,
    HalResourceService,
    // ... más servicios
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Patrón de Arquitectura Frontend

```
┌─────────────────────────────────────────┐
│          CAPA DE PRESENTACIÓN            │
│  ┌────────────────────────────────────┐  │
│  │   Angular Components               │  │
│  │   - Smart Components (containers)  │  │
│  │   - Dumb Components (presentational)│ │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓↑
┌─────────────────────────────────────────┐
│          CAPA DE ESTADO                  │
│  ┌────────────────────────────────────┐  │
│  │   Akita Entity Stores              │  │
│  │   - WorkPackageStore               │  │
│  │   - ProjectStore                   │  │
│  │   - UserStore                      │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓↑
┌─────────────────────────────────────────┐
│          CAPA DE SERVICIOS               │
│  ┌────────────────────────────────────┐  │
│  │   API Services                     │  │
│  │   - ApiV3Service                   │  │
│  │   - HalResourceService             │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓↑
┌─────────────────────────────────────────┐
│          BACKEND API                     │
│           /api/v3/*                      │
└─────────────────────────────────────────┘
```

### Routing: UI-Router

```typescript
// Estado de ejemplo
const workPackagesState = {
  name: 'work-packages',
  url: '/work_packages',
  component: WorkPackagesIndexComponent,
  data: {
    baseRoute: true
  }
};

const workPackageShowState = {
  name: 'work-packages.show',
  url: '/{workPackageId:int}',
  component: WorkPackageDetailsComponent,
  resolve: {
    workPackage: (workPackageId, apiV3Service) => {
      return apiV3Service.work_packages.id(workPackageId).get();
    }
  }
};
```

### State Management: Akita

```typescript
// Entity Store
export interface WorkPackageState extends EntityState<WorkPackage> {
  ui: {
    selectedId: ID | null;
    filters: QueryFilters;
  };
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'work-packages' })
export class WorkPackageStore extends EntityStore<WorkPackageState> {
  constructor() {
    super({ ui: { selectedId: null, filters: {} } });
  }
}

// Query
@Injectable({ providedIn: 'root' })
export class WorkPackageQuery extends QueryEntity<WorkPackageState> {
  selectSelected$ = this.select(state => state.ui.selectedId);

  constructor(protected store: WorkPackageStore) {
    super(store);
  }
}
```

### Hotwire Turbo Integration

```typescript
// Turbo controller example (Stimulus)
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["output"];

  connect() {
    console.log("Turbo controller connected");
  }

  refresh() {
    // Turbo Stream updates
    this.outputTarget.innerHTML = "Updated via Turbo";
  }
}
```

---

## 9. SERVICIOS Y LÓGICA DE NEGOCIO

### Patrón de Servicios

OpenProject usa un patrón de servicios robusto basado en:
1. **Separation of Concerns**: Lógica fuera de modelos
2. **Contracts**: Validación separada
3. **Result Objects**: Retorno de éxito/error estructurado

### Estructura de Servicio Base

```ruby
# Archivo: app/services/base_services/create.rb

module BaseServices
  class Create < BaseService
    def perform(params = {})
      in_transaction do
        # 1. Instanciar modelo
        instance = model.new

        # 2. Setear atributos via contrato
        set_result = set_attributes(instance, params)
        return set_result unless set_result.success?

        # 3. Ejecutar callbacks before_perform
        before_perform(params)

        # 4. Validar via contrato
        contract = instantiate_contract(instance, current_user)
        validate_result = contract.validate
        return validate_result unless validate_result.success?

        # 5. Persistir
        instance.save!

        # 6. Ejecutar callbacks after_perform
        after_perform(instance)

        # 7. Retornar resultado exitoso
        ServiceResult.success(result: instance)
      end
    rescue ActiveRecord::RecordInvalid => e
      ServiceResult.failure(errors: e.record.errors)
    end

    protected

    def before_perform(params); end
    def after_perform(instance); end
  end
end
```

### Servicios de Work Package

#### CreateService
```ruby
# Archivo: app/services/work_packages/create_service.rb

module WorkPackages
  class CreateService < BaseServices::Create
    include Attachments::CreateAttachments

    def perform(params = {})
      result = super

      if result.success?
        # Crear relaciones
        create_relations(result.result, params)

        # Enviar notificaciones
        send_notifications(result.result)

        # Registrar en journal
        create_journal(result.result)
      end

      result
    end

    private

    def send_notifications(work_package)
      OpenProject::Notifications.send(
        OpenProject::Events::WORK_PACKAGE_CREATED,
        work_package: work_package
      )
    end
  end
end
```

#### UpdateService
```ruby
# Archivo: app/services/work_packages/update_service.rb

module WorkPackages
  class UpdateService < BaseServices::Update
    def perform(params = {})
      # Capturar cambios
      changes_before = work_package.changes

      result = super

      if result.success?
        # Actualizar schedule si fechas cambiaron
        reschedule_if_needed(result.result, changes_before)

        # Notificar watchers
        notify_watchers(result.result)
      end

      result
    end

    private

    def reschedule_if_needed(work_package, changes)
      if changes.key?('start_date') || changes.key?('due_date')
        ScheduleDependencyService.new(work_package).call
      end
    end
  end
end
```

### Contratos (Contracts)

```ruby
# Archivo: app/contracts/work_packages/create_contract.rb

module WorkPackages
  class CreateContract < BaseContract
    validate :user_allowed_to_create
    validate :subject_present
    validate :project_present
    validate :type_present
    validate :dates_valid

    private

    def user_allowed_to_create
      unless user.allowed_in_project?(:add_work_packages, model.project)
        errors.add(:base, :error_unauthorized)
      end
    end

    def subject_present
      if model.subject.blank?
        errors.add(:subject, :blank)
      end
    end

    def dates_valid
      if model.start_date && model.due_date
        if model.start_date > model.due_date
          errors.add(:due_date, :greater_than_start_date)
        end
      end
    end
  end
end
```

### Service Result Pattern

```ruby
# Archivo: app/services/service_result.rb

class ServiceResult
  attr_reader :result, :errors, :success

  def self.success(result:, **other)
    new(success: true, result: result, **other)
  end

  def self.failure(errors:, **other)
    new(success: false, errors: errors, **other)
  end

  def initialize(success:, result: nil, errors: [], **other)
    @success = success
    @result = result
    @errors = errors
    @other = other
  end

  def success?
    @success
  end

  def failure?
    !@success
  end
end
```

### Servicios por Categoría

#### Work Packages
- CreateService
- UpdateService
- DeleteService
- CopyService
- BulkUpdateService
- SetAttributesService
- SetScheduleService
- ScheduleDependencyService

#### Projects
- CreateService
- UpdateService
- DeleteService
- CopyService
- ArchiveService
- UnarchiveService
- ScheduleDeletionService

#### Members
- CreateService
- UpdateService
- DeleteService
- AddRoleService
- RemoveRoleService

#### Users
- CreateService
- UpdateService
- DeleteService
- RegisterService
- InviteService

---

## 10. SISTEMA DE BACKGROUND JOBS

### Framework: GoodJob

**Características**:
- ✅ Backend PostgreSQL (no requiere Redis)
- ✅ Ejecución externa en workers
- ✅ Prioridades
- ✅ Cron jobs integrados
- ✅ Dashboard web
- ✅ Retry automático

### Configuración

```ruby
# Archivo: config/application.rb

config.active_job.queue_adapter = :good_job
config.good_job.execution_mode = :external
config.good_job.enable_cron = true
config.good_job.preserve_job_records = true
config.good_job.cleanup_preserved_jobs_before_seconds_ago = 7.days
config.good_job.smaller_number_is_higher_priority = true
```

### Job Base

```ruby
# Archivo: app/workers/application_job.rb

class ApplicationJob < ActiveJob::Base
  include GoodJob::ActiveJobExtensions::Concurrency
  include GoodJob::ActiveJobExtensions::Batches

  retry_on StandardError, wait: :exponentially_longer, attempts: 5

  queue_as :default

  good_job_control_concurrency_with(
    total_limit: 1,
    key: -> { self.class.name }
  )
end
```

### Jobs Principales

#### CopyProjectJob
```ruby
# Archivo: app/workers/copy_project_job.rb

class CopyProjectJob < ApplicationJob
  queue_as :high_priority

  def perform(source_project_id, target_project_id, user_id, send_mails: false)
    source = Project.find(source_project_id)
    target = Project.find(target_project_id)
    user = User.find(user_id)

    result = Projects::CopyService
      .new(source: source, user: user)
      .call(target, send_notifications: send_mails)

    if result.success?
      UserMailer.copy_project_succeeded(user, source, target).deliver_later
    else
      UserMailer.copy_project_failed(user, source, target).deliver_later
    end
  end
end
```

#### BackupJob
```ruby
# Archivo: app/workers/backup_job.rb

class BackupJob < ApplicationJob
  queue_as :low_priority

  good_job_control_concurrency_with(
    total_limit: 1,
    key: 'backup'
  )

  def perform(include_attachments: true)
    backup_path = Rails.root.join('tmp', 'backups')
    timestamp = Time.now.strftime('%Y%m%d_%H%M%S')

    # Database backup
    db_backup = "#{backup_path}/db_#{timestamp}.sql"
    system("pg_dump #{database_url} > #{db_backup}")

    # Attachments backup
    if include_attachments
      attachments_backup = "#{backup_path}/attachments_#{timestamp}.tar.gz"
      system("tar -czf #{attachments_backup} #{attachments_path}")
    end

    # Upload to S3
    upload_to_s3(db_backup)
    upload_to_s3(attachments_backup) if include_attachments

    # Cleanup old backups
    cleanup_old_backups
  end
end
```

### Cron Jobs

```ruby
# Archivo: config/initializers/cronjobs.rb

Rails.application.config.good_job.cron = {
  # Cleanup old sessions - Cada hora
  cleanup_sessions: {
    cron: '0 * * * *',
    class: 'Sessions::CleanupJob'
  },

  # Send digest notifications - Diario a las 8am
  daily_digest: {
    cron: '0 8 * * *',
    class: 'Notifications::DigestJob'
  },

  # Scheduled backups - Diario a las 2am
  backup: {
    cron: '0 2 * * *',
    class: 'BackupJob'
  },

  # Repository fetch - Cada 15 minutos
  repository_fetch: {
    cron: '*/15 * * * *',
    class: 'Repository::FetchChangesetsJob'
  },

  # LDAP sync - Cada 6 horas
  ldap_sync: {
    cron: '0 */6 * * *',
    class: 'LdapGroups::SynchronizeJob'
  }
}
```

### Jobs por Módulo

#### Storages
- `ManageStorageIntegrationsJob` - Cada hora
- `CleanupUncontaineredFileLinksJob` - Diario 22:06
- `AutomaticallyManagedStorageSyncJob` - Debounced

#### GitHub Integration
- `ClearOldPullRequestsJob` - Diario 1:25
- `CheckDeployStatusJob` - Cada 30 minutos

#### GitLab Integration
- `ClearOldMergeRequestsJob` - Diario 1:25

#### Webhooks
- `CleanupWebhookLogsJob` - Semanal domingo 5:28

---

## 11. SISTEMA DE MÓDULOS (28 MÓDULOS)

### Arquitectura de Módulos

Cada módulo es un **Rails Engine** que se registra usando `ActsAsOpEngine`.

### Patrón de Engine

```ruby
# Archivo: modules/[module]/lib/openproject-[module]/engine.rb

module OpenProject::ModuleName
  class Engine < ::Rails::Engine
    engine_name :openproject_module_name

    include OpenProject::Plugins::ActsAsOpEngine

    register 'openproject-module_name',
             author_url: 'https://www.openproject.org',
             bundled: true,
             settings: {
               default: {
                 'setting_key' => 'default_value'
               }
             } do
      # Registro de menús
      menu :project_menu,
           :module_item,
           { controller: '/module', action: 'index' },
           param: :project_id,
           caption: :label_module,
           icon: 'icon-class'

      # Registro de permisos
      project_module :module_name do
        permission :view_items, {
          module: [:index, :show]
        }
        permission :manage_items, {
          module: [:new, :create, :edit, :update, :destroy]
        }, require: :member
      end

      # Extensiones de API
      add_api_endpoint 'API::V3::Root' do
        mount ::API::V3::Module::ModuleAPI
      end
    end

    # Patches
    patches %i[WorkPackage Project User]

    # Assets
    assets %w(module/module.css module/module.js)

    # Initializers
    initializer 'module.precompile_assets' do |app|
      app.config.assets.precompile += %w(module/module.js)
    end

    # Configuración de rutas
    config.before_configuration do |app|
      app.config.paths['config/routes.rb'].unshift(
        File.join(config.root, 'config', 'routes.rb')
      )
    end

    # Migraciones
    initializer 'module.append_migrations' do |app|
      app.config.paths['db/migrate'] << config.paths['db/migrate'].expanded.first
    end
  end
end
```

### Listado Completo de Módulos

| # | Módulo | Propósito | Dependencias |
|---|--------|-----------|--------------|
| 1 | **auth_plugins** | Framework de autenticación | - |
| 2 | **auth_saml** | Autenticación SAML | auth_plugins |
| 3 | **openid_connect** | OpenID Connect auth | auth_plugins |
| 4 | **two_factor_authentication** | 2FA (TOTP, SMS, WebAuthn) | - |
| 5 | **recaptcha** | Protección anti-bots | - |
| 6 | **backlogs** | Agile/Scrum | work_package_tracking |
| 7 | **boards** | Kanban boards | work_package_tracking |
| 8 | **calendar** | Vista calendario | work_package_tracking |
| 9 | **gantt** | Diagramas Gantt | work_package_tracking |
| 10 | **team_planner** | Planificación recursos | work_package_tracking |
| 11 | **costs** | Tracking de costos y tiempo | - |
| 12 | **budgets** | Gestión de presupuestos | costs |
| 13 | **reporting** | Reportes de costos | costs |
| 14 | **meeting** | Gestión de reuniones | - |
| 15 | **documents** | Gestión de documentos | - |
| 16 | **storages** | Nextcloud/OneDrive | work_package_tracking |
| 17 | **github_integration** | GitHub PRs/Issues | work_package_tracking |
| 18 | **gitlab_integration** | GitLab MRs/Issues | work_package_tracking |
| 19 | **webhooks** | Webhooks salientes | - |
| 20 | **bim** | BCF/BIM support | work_package_tracking |
| 21 | **avatars** | Gestión de avatares | - |
| 22 | **ldap_groups** | Sincronización LDAP | - |
| 23 | **job_status** | Estado de jobs | - |
| 24 | **xls_export** | Exportación Excel | - |
| 25 | **grids** | Sistema de grillas | - |
| 26 | **my_page** | Dashboard usuario | grids |
| 27 | **overviews** | Overview proyectos | grids |
| 28 | **webhooks** | Sistema webhooks | - |

---

## 12. MAPA COMPLETO DE RUTAS POR MÓDULO

### auth_saml
```ruby
# Archivo: modules/auth_saml/config/routes.rb

OpenProject::Application.routes.draw do
  scope 'auth' do
    get 'saml', to: 'auth_saml#index'
    post 'saml/callback', to: 'auth_saml#callback'
    match 'saml/metadata', to: 'auth_saml#metadata', via: [:get, :post]
  end

  namespace :admin do
    namespace :settings do
      resource :saml_settings, only: [:show, :update]
    end
  end
end
```

**Rutas**:
- `GET /auth/saml` - Iniciar autenticación SAML
- `POST /auth/saml/callback` - Callback SAML
- `GET /auth/saml/metadata` - Metadata SP
- `GET /admin/settings/saml_settings` - Configuración admin

### backlogs
```ruby
# modules/backlogs/config/routes.rb

OpenProject::Application.routes.draw do
  scope 'projects/:project_id', as: 'project' do
    resources :backlogs, only: [:index]

    resources :sprints, controller: 'backlogs/sprints' do
      member do
        get :taskboard
        get :burndown
      end

      resources :stories, controller: 'backlogs/stories'
      resources :tasks, controller: 'backlogs/tasks'
    end

    resource :backlog_settings, only: [:show, :update]
  end

  namespace :admin do
    resource :backlog_settings, only: [:show, :update]
  end
end
```

**Rutas**:
- `GET /projects/:id/backlogs` - Master backlog
- `GET /projects/:id/sprints` - Lista sprints
- `GET /projects/:id/sprints/:id/taskboard` - Taskboard
- `GET /projects/:id/sprints/:id/burndown` - Burndown chart
- `GET /admin/backlog_settings` - Configuración global

### bim
```ruby
# modules/bim/config/routes.rb

OpenProject::Application.routes.draw do
  # BCF API v2.1
  scope 'api' do
    mount ::Bim::Bcf::API::Root => '/bcf'
  end

  scope 'projects/:project_id' do
    # IFC Models
    resources :ifc_models, controller: 'bim/ifc_models' do
      member do
        get :download
        post :process
      end
    end

    # BCF Issues
    get 'bcf', to: 'bim/bcf#index'
    resources :bcf_issues, controller: 'bim/bcf/issues' do
      resources :viewpoints, controller: 'bim/bcf/viewpoints'
      resources :comments, controller: 'bim/bcf/comments'
    end
  end
end
```

**Rutas**:
- `POST /api/bcf` - BCF API v2.1
- `GET /projects/:id/bcf` - Frontend BCF
- `GET /projects/:id/ifc_models` - Modelos IFC
- `GET /projects/:id/bcf_issues` - Issues BCF

### boards
```ruby
# modules/boards/config/routes.rb

OpenProject::Application.routes.draw do
  resources :boards, only: [:index, :show]

  scope 'projects/:project_id' do
    resources :boards, controller: 'boards/boards', except: [:index] do
      member do
        post :add_list
        delete :remove_list
        post :move_list
      end
    end
  end
end
```

**Rutas**:
- `GET /boards` - Boards globales
- `GET /projects/:id/boards` - Boards del proyecto
- `GET /projects/:id/boards/:id` - Board específico

### budgets
```ruby
# modules/budgets/config/routes.rb

OpenProject::Application.routes.draw do
  resources :budgets, only: [:index]

  scope 'projects/:project_id' do
    resources :budgets do
      member do
        get :copy
      end
    end
  end

  scope 'api/v3' do
    resources :budgets, controller: 'api/v3/budgets/budgets'
  end
end
```

**Rutas**:
- `GET /budgets` - Budgets globales
- `GET /projects/:id/budgets` - Budgets del proyecto
- `GET /api/v3/budgets` - API budgets

### calendar
```ruby
# modules/calendar/config/routes.rb

OpenProject::Application.routes.draw do
  get 'calendar/calendars', to: 'calendar/calendars#index'

  scope 'projects/:project_id' do
    get 'calendar', to: 'calendar/calendars#show'
  end
end
```

**Rutas**:
- `GET /calendar/calendars` - Calendarios
- `GET /projects/:id/calendar` - Calendar del proyecto

### costs
```ruby
# modules/costs/config/routes.rb

OpenProject::Application.routes.draw do
  resources :time_entries, controller: 'timelog'
  resources :cost_entries

  scope 'my' do
    get 'time-tracking', to: 'my/time_tracking#index'
  end

  namespace :admin do
    resources :cost_types
    resource :costs_settings, only: [:show, :update]
  end

  scope 'api/v3' do
    resources :time_entries, controller: 'api/v3/time_entries/time_entries'
    resources :cost_entries, controller: 'api/v3/cost_entries/cost_entries'
    resources :cost_types, controller: 'api/v3/cost_types/cost_types'
  end
end
```

**Rutas**:
- `GET /time_entries` - Entradas de tiempo
- `GET /cost_entries` - Entradas de costos
- `GET /my/time-tracking` - Time tracking personal
- `GET /admin/cost_types` - Tipos de costo
- `GET /api/v3/time_entries` - API time entries

### github_integration
```ruby
# modules/github_integration/config/routes.rb

OpenProject::Application.routes.draw do
  post 'api/webhooks/github', to: 'github_integration/webhooks#handle'

  namespace :admin do
    resources :deploy_targets, controller: 'github_integration/deploy_targets'
  end

  scope 'api/v3/work_packages/:work_package_id' do
    resources :github_pull_requests,
              controller: 'api/v3/github_integration/github_pull_requests',
              only: [:index, :show]
  end
end
```

**Rutas**:
- `POST /api/webhooks/github` - Webhook GitHub
- `GET /admin/deploy_targets` - Deploy targets
- `GET /api/v3/work_packages/:id/github_pull_requests` - PRs de WP

### gitlab_integration
```ruby
# modules/gitlab_integration/config/routes.rb

OpenProject::Application.routes.draw do
  post 'api/webhooks/gitlab', to: 'gitlab_integration/webhooks#handle'

  scope 'api/v3/work_packages/:work_package_id' do
    resources :gitlab_merge_requests,
              controller: 'api/v3/gitlab_integration/gitlab_merge_requests',
              only: [:index, :show]

    resources :gitlab_issues,
              controller: 'api/v3/gitlab_integration/gitlab_issues',
              only: [:index, :show]
  end
end
```

**Rutas**:
- `POST /api/webhooks/gitlab` - Webhook GitLab
- `GET /api/v3/work_packages/:id/gitlab_merge_requests` - MRs
- `GET /api/v3/work_packages/:id/gitlab_issues` - Issues

### meeting
```ruby
# modules/meeting/config/routes.rb

OpenProject::Application.routes.draw do
  resources :meetings, only: [:index]
  resources :recurring_meetings, only: [:index, :show]

  scope 'projects/:project_id' do
    resources :meetings do
      resources :agenda_items, controller: 'meeting/agenda_items' do
        resources :sections, controller: 'meeting/sections'
      end

      resources :participants, controller: 'meeting/participants'

      member do
        get :copy
        post :notify
      end
    end
  end

  scope 'api/v3' do
    resources :meetings, controller: 'api/v3/meetings/meetings'
    resources :meeting_contents, controller: 'api/v3/meetings/meeting_contents'
  end
end
```

**Rutas**:
- `GET /meetings` - Reuniones globales
- `GET /recurring_meetings` - Reuniones recurrentes
- `GET /projects/:id/meetings` - Reuniones del proyecto
- `GET /api/v3/meetings` - API meetings

### storages
```ruby
# modules/storages/config/routes.rb

OpenProject::Application.routes.draw do
  namespace :admin do
    namespace :settings do
      resources :storages do
        member do
          get :oauth_callback
          post :test_connection
        end
      end
    end
  end

  scope 'projects/:project_id/settings' do
    resources :project_storages,
              controller: 'storages/project_storages'
  end

  scope 'api/v3' do
    resources :storages, controller: 'api/v3/storages/storages' do
      member do
        get :files
        get 'files/*path', action: :files, format: false
      end
    end

    resources :project_storages,
              controller: 'api/v3/project_storages/project_storages'

    scope 'work_packages/:work_package_id' do
      resources :file_links,
                controller: 'api/v3/file_links/file_links'
    end
  end
end
```

**Rutas**:
- `GET /admin/settings/storages` - Admin storages
- `GET /projects/:id/settings/project_storages` - Project storages
- `GET /api/v3/storages` - API storages
- `GET /api/v3/storages/:id/files` - Browse files
- `GET /api/v3/work_packages/:id/file_links` - File links

### team_planner
```ruby
# modules/team_planner/config/routes.rb

OpenProject::Application.routes.draw do
  resources :team_planners, only: [:index]

  scope 'projects/:project_id' do
    get 'team_planner', to: 'team_planner/team_planner#show'
  end
end
```

**Rutas**:
- `GET /team_planners` - Team planners globales
- `GET /projects/:id/team_planner` - Team planner del proyecto

### webhooks
```ruby
# modules/webhooks/config/routes.rb

OpenProject::Application.routes.draw do
  namespace :admin do
    resources :webhooks do
      member do
        post :test
      end

      resources :webhook_logs, only: [:index, :show]
    end
  end
end
```

**Rutas**:
- `GET /admin/webhooks` - Gestión de webhooks
- `POST /admin/webhooks/:id/test` - Test webhook

---

## 13. INTERCONEXIONES ENTRE MÓDULOS

### WorkPackage como Hub Central

```
                    ┌─────────────────┐
                    │  WorkPackage    │
                    │   (Core Model)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌───���▼────┐         ┌─────▼─────┐       ┌─────▼─────┐
   │Backlogs │         │   Costs   │       │    BIM    │
   │         │         │           │       │           │
   │story_   │         │labor_     │       │bcf_issue  │
   │points   │         │costs      │       │           │
   └─────────┘         └───────────┘       └───────────┘
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐       ┌─────▼─────┐
   │Calendar │         │  Budgets  │       │ Storages  │
   │         │         │           │       │           │
   │due_date │         │budget     │       │file_links │
   └─────────┘         └───────────┘       └───────────┘
        │                    │                    │
   ┌────▼────┐         ┌─────▼─────┐       ┌─────▼─────┐
   │  Gantt  │         │  GitHub   │       │  GitLab   │
   │         │         │           │       │           │
   │schedule │         │pull_      │       │merge_     │
   │         │         │requests   │       │requests   │
   └─────────┘         └───────────┘       └───────────┘
```

### Extensiones de WorkPackage por Módulo

```ruby
# WorkPackage model (core)
class WorkPackage < ApplicationRecord
  # Core attributes
  # - subject
  # - description
  # - start_date
  # - due_date
  # - estimated_hours

  # Backlogs module extensions
  has_one :story_points  # Custom field
  attr_accessor :position
  attr_accessor :remaining_hours

  def story?
    # Lógica desde backlogs
  end

  # Costs module extensions
  has_many :cost_entries

  def labor_costs
    # Calculado desde costs
  end

  def material_costs
    # Calculado desde costs
  end

  def overall_costs
    labor_costs + material_costs
  end

  # BIM module extensions
  has_one :bcf_issue

  def bcf_issue?
    bcf_issue.present?
  end

  # Storages module extensions
  has_many :file_links

  # GitHub integration
  has_many :github_pull_requests

  # GitLab integration
  has_many :gitlab_merge_requests
  has_many :gitlab_issues

  # Budgets module
  belongs_to :budget, optional: true

  # Meeting module
  has_many :meeting_agenda_items
end
```

### Sistema de Eventos (Pub/Sub)

```ruby
# Eventos publicados
OpenProject::Events::WORK_PACKAGE_CREATED
OpenProject::Events::WORK_PACKAGE_UPDATED
OpenProject::Events::WORK_PACKAGE_DELETED
OpenProject::Events::PROJECT_CREATED
OpenProject::Events::PROJECT_UPDATED
OpenProject::Events::MEMBER_CREATED
OpenProject::Events::MEMBER_UPDATED

# Storages module escucha
OpenProject::Notifications.subscribe(
  OpenProject::Events::MEMBER_CREATED
) do |payload|
  project = payload[:member].project
  project.project_storages.each do |project_storage|
    Storages::AutomaticallyManagedStorageSyncJob
      .debounce(project_storage.storage)
  end
end

# GitHub integration escucha
OpenProject::Notifications.subscribe(
  'github.pull_request'
) do |payload|
  GithubIntegration::NotificationHandler
    .pull_request(payload)
end

# Webhooks module escucha TODO
OpenProject::Webhooks::EventResources::RESOURCES.each do |resource|
  OpenProject::Notifications.subscribe(
    "#{resource}.created"
  ) do |payload|
    Webhooks::Outgoing::Deliver.call(
      event: "#{resource}.created",
      payload: payload
    )
  end
end
```

### Sistema de Patching

```ruby
# Módulo Backlogs extiende WorkPackage
# Archivo: modules/backlogs/lib/open_project/backlogs/patches/work_package_patch.rb

module OpenProject::Backlogs::Patches::WorkPackagePatch
  def self.included(base)
    base.class_eval do
      # Añadir validaciones
      validates :story_points, numericality: {
        greater_than_or_equal_to: 0,
        allow_nil: true
      }

      # Añadir scopes
      scope :stories, -> { where(type: Story.types) }
      scope :tasks, -> { where(type: Task.types) }

      # Añadir métodos
      def story?
        Story.types.include?(type)
      end

      def task?
        Task.types.include?(type)
      end
    end
  end
end

# Registro del patch
WorkPackage.include(OpenProject::Backlogs::Patches::WorkPackagePatch)
```

### API Extensions

```ruby
# Módulo Costs extiende API de WorkPackage
# Archivo: modules/costs/lib/open_project/costs/engine.rb

extend_api_response(:v3, :work_packages, :work_package) do
  property :labor_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  property :material_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  property :overall_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  link :log_costs do
    {
      href: api_v3_paths.cost_entries_by_work_package(represented.id),
      title: "Log costs"
    } if represented.costs_enabled?
  end
end
```

---

## 14. SISTEMA DE PERMISOS

### Arquitectura de Permisos

OpenProject usa un sistema de permisos basado en:
1. **Roles**: Colecciones de permisos
2. **Members**: Asignación de roles a usuarios en proyectos
3. **Permissions**: Acciones específicas

### Definición de Permisos

```ruby
# Archivo: config/initializers/permissions.rb

# Core permissions
OpenProject::AccessControl.map do |map|
  map.project_module :work_package_tracking do
    map.permission :view_work_packages,
                   { work_packages: [:index, :show] },
                   permissible_on: :work_package

    map.permission :add_work_packages,
                   { work_packages: [:new, :create] }

    map.permission :edit_work_packages,
                   { work_packages: [:edit, :update] },
                   permissible_on: :work_package,
                   require: :member

    map.permission :delete_work_packages,
                   { work_packages: [:destroy] },
                   permissible_on: :work_package,
                   require: :member

    map.permission :manage_subtasks,
                   {}

    map.permission :add_work_package_notes,
                   { work_packages: [:update] },
                   permissible_on: :work_package

    map.permission :edit_own_work_package_notes,
                   { journals: [:edit, :update] },
                   require: :loggedin
  end

  map.project_module :time_tracking do
    map.permission :view_time_entries,
                   { timelog: [:index, :show] }

    map.permission :log_time,
                   { timelog: [:new, :create] },
                   require: :loggedin

    map.permission :edit_time_entries,
                   { timelog: [:edit, :update, :destroy] },
                   require: :member

    map.permission :edit_own_time_entries,
                   { timelog: [:edit, :update, :destroy] },
                   require: :loggedin
  end

  # Global permissions (no project-specific)
  map.permission :add_project,
                 { projects: [:new, :create] },
                 require: :loggedin

  map.permission :edit_project,
                 { projects: [:edit, :update] },
                 require: :member

  map.permission :delete_project,
                 { projects: [:destroy] },
                 require: :member
end
```

### Permisos por Módulo

#### BIM Module
```ruby
# modules/bim/lib/openproject-bim/engine.rb

project_module :bim, dependencies: :work_package_tracking do
  permission :view_ifc_models,
             { 'bim/ifc_models': [:index, :show] }

  permission :manage_ifc_models,
             { 'bim/ifc_models': [:new, :create, :edit, :update, :destroy] },
             require: :member

  permission :view_linked_issues,
             { 'bim/bcf/issues': [:index, :show] }

  permission :manage_bcf,
             { 'bim/bcf/issues': [:new, :create, :edit, :update] },
             require: :member

  permission :delete_bcf,
             { 'bim/bcf/issues': [:destroy] },
             require: :member
end
```

#### Storages Module
```ruby
# modules/storages/lib/openproject-storages/engine.rb

# Global permissions
project_module nil do
  permission :manage_storages_in_project,
             { 'storages/project_storages': [:index, :new, :create, :edit, :update, :destroy] },
             require: :member

  permission :read_files,
             { 'storages/files': [:index, :show] }

  permission :write_files,
             { 'storages/files': [:create, :update] },
             require: :member

  permission :create_files,
             { 'storages/files': [:new, :create] },
             require: :member

  permission :delete_files,
             { 'storages/files': [:destroy] },
             require: :member

  permission :share_files,
             { 'storages/files': [:share] },
             require: :member
end

# Work package permissions
project_module :work_package_tracking do
  permission :view_file_links,
             { 'file_links': [:index, :show] }

  permission :manage_file_links,
             { 'file_links': [:new, :create, :edit, :update, :destroy] },
             require: :member
end
```

### Chequeo de Permisos

```ruby
# En controladores
class WorkPackagesController < ApplicationController
  before_action :authorize, only: [:create, :update, :destroy]

  def create
    # authorize automáticamente chequea :add_work_packages
  end

  private

  def authorize
    deny_access unless User.current.allowed_in_project?(
      params[:action].to_sym,
      @project
    )
  end
end

# En vistas
<% if User.current.allowed_in_project?(:edit_work_packages, @project) %>
  <%= link_to 'Edit', edit_work_package_path(@work_package) %>
<% end %>

# En servicios
class WorkPackages::UpdateService
  def perform
    unless user.allowed_in_project?(:edit_work_packages, work_package.project)
      return ServiceResult.failure(errors: ['Unauthorized'])
    end

    # ...
  end
end

# En API
module API::V3::WorkPackages
  class WorkPackageRepresenter < ::API::V3::WorkPackages::WorkPackageRepresenterBase
    link :update do
      {
        href: api_v3_paths.work_package(represented.id),
        method: :patch
      } if current_user_allowed_to(:edit_work_packages, context: represented.project)
    end
  end
end
```

---

## 15. SISTEMA DE EVENTOS

### OpenProject::Notifications

Sistema de pub/sub para comunicación entre módulos.

```ruby
# Publicar evento
OpenProject::Notifications.send(
  OpenProject::Events::WORK_PACKAGE_CREATED,
  work_package: work_package,
  user: current_user
)

# Suscribirse a evento
OpenProject::Notifications.subscribe(
  OpenProject::Events::WORK_PACKAGE_CREATED
) do |payload|
  work_package = payload[:work_package]
  user = payload[:user]

  # Lógica del suscriptor
  NotificationService.new(work_package, user).call
end
```

### Eventos del Core

```ruby
# Work Packages
OpenProject::Events::WORK_PACKAGE_CREATED
OpenProject::Events::WORK_PACKAGE_UPDATED
OpenProject::Events::WORK_PACKAGE_DELETED
OpenProject::Events::WORK_PACKAGE_COPIED

# Projects
OpenProject::Events::PROJECT_CREATED
OpenProject::Events::PROJECT_UPDATED
OpenProject::Events::PROJECT_ARCHIVED
OpenProject::Events::PROJECT_DELETED

# Members
OpenProject::Events::MEMBER_CREATED
OpenProject::Events::MEMBER_UPDATED
OpenProject::Events::MEMBER_DESTROYED

# Users
OpenProject::Events::USER_CREATED
OpenProject::Events::USER_UPDATED
OpenProject::Events::USER_INVITED
```

### Eventos de Módulos

#### GitHub Integration
```ruby
# modules/github_integration/lib/openproject-github_integration/notification_handler.rb

OpenProject::Notifications.subscribe('github.pull_request') do |payload|
  GithubIntegration::NotificationHandler.pull_request(payload)
end

OpenProject::Notifications.subscribe('github.check_run') do |payload|
  GithubIntegration::NotificationHandler.check_run(payload)
end

OpenProject::Notifications.subscribe('github.push') do |payload|
  GithubIntegration::NotificationHandler.push(payload)
end
```

#### Webhooks Module
```ruby
# modules/webhooks/lib/openproject-webhooks/engine.rb

initializer 'webhooks.subscribe_to_notifications' do
  OpenProject::Webhooks::EventResources.subscribe!
end

# Suscripciones dinámicas para todos los recursos
RESOURCES = %w[
  work_package
  project
  user
  time_entry
  meeting
].freeze

RESOURCES.each do |resource|
  %w[created updated].each do |action|
    OpenProject::Notifications.subscribe("#{resource}.#{action}") do |payload|
      Webhooks::Outgoing::Deliver.call(
        event: "#{resource}.#{action}",
        payload: payload
      )
    end
  end
end
```

---

## 16. SISTEMA DE HOOKS PARA PLUGINS ⭐

El sistema de hooks de OpenProject permite a los módulos/plugins extender la funcionalidad del core sin modificar directamente el código base.

### Arquitectura del Sistema de Hooks

#### Archivos Core del Sistema de Hooks
```
lib/open_project/
├── hook.rb                           # Sistema base de hooks
├── hooks.rb                          # Inicialización de hooks
└── plugins/
    └── acts_as_op_engine.rb         # Funcionalidad principal de plugins

app/helpers/
└── hook_helper.rb                    # Helper para llamar hooks en vistas
```

#### Componentes Principales

**OpenProject::Hook Module**:
- `OpenProject::Hook.add_listener(klass)` - Registra un listener
- `OpenProject::Hook.listeners` - Retorna todos los listeners
- `OpenProject::Hook.call_hook(hook, context)` - Llama un hook específico

**Clases Base de Hooks**:

```ruby
# Hook Listener Base
class MyHook < OpenProject::Hook::Listener
  include Singleton  # REQUERIDO!

  def my_custom_hook(context = {})
    # Lógica del hook
  end
end

# View Listener (para hooks de vistas)
class MyViewHook < OpenProject::Hook::ViewListener
  # Incluye helpers: ERB::Util, TagHelper, FormHelper, UrlHelper, etc.

  # Método simple para renderizar parciales
  render_on :view_hook_name, partial: "path/to/partial"

  # O implementar manualmente
  def view_hook_name(context)
    # context incluye: :hook_caller, :controller, :project, :request
    context[:hook_caller].render(partial: "my_partial", locals: context)
  end
end
```

---

### 1. VIEW HOOKS (Hooks de Vista)

#### Hooks de Layout Principal

| Hook | Ubicación | Contexto | Uso |
|------|-----------|----------|-----|
| `:view_layouts_base_html_head` | `<head>` tag | project, request, controller | Agregar CSS, JS, meta tags |
| `:view_layouts_base_html_meta` | Meta tags | project, request | Meta tags personalizados |
| `:view_layouts_base_top_menu` | Top menu | project | Extender menú superior |
| `:view_layouts_base_main_menu` | Main menu | project | Extender menú principal |
| `:view_layouts_base_sidebar` | Sidebar | project | Agregar a sidebar |
| `:view_layouts_base_body_bottom` | Antes de `</body>` | request | Scripts al final |

#### Hooks de Account/Usuario

| Hook | Ubicación | Uso |
|------|-----------|-----|
| `:view_account_login_auth_provider` | Login page | Agregar proveedores de autenticación |
| `:view_users_form` | User edit form | Extender formulario de usuario |
| `:view_placeholder_users_form` | Placeholder user form | Extender formulario placeholder |
| `:view_my_account` | My account page | Extender página de cuenta |
| `:view_my_settings` | My settings | Extender configuración personal |
| `:view_access_tokens_table` | Access tokens | Extender tabla de tokens |

#### Hooks de Work Package

| Hook | Ubicación | Uso |
|------|-----------|-----|
| `:view_work_packages_sidebar_issues_bottom` | WP sidebar issues | Agregar a sidebar de issues |
| `:view_work_packages_sidebar_planning_bottom` | WP sidebar planning | Agregar a planificación |
| `:view_work_packages_index_bottom` | WP index bottom | Extender índice WP |
| `:view_work_packages_move_bottom` | WP move dialog | Extender diálogo mover |
| `:view_work_packages_bulk_edit_details_bottom` | Bulk edit | Extender edición masiva |
| `:view_work_package_overview_attributes` | WP overview | Agregar atributos |

#### Hooks de Admin

| Hook | Ubicación | Uso |
|------|-----------|-----|
| `:view_admin_info_top` | Admin info top | Top de página admin |
| `:view_admin_info_bottom` | Admin info bottom | Bottom de página admin |
| `:view_settings_general_form` | General settings | Extender configuración general |
| `:homescreen_administration_links` | Homescreen admin | Links de administración |

#### Ejemplo de Uso - View Hooks

```ruby
# modules/my_module/lib/open_project/my_module/hooks.rb
module OpenProject::MyModule
  class Hooks < OpenProject::Hook::ViewListener
    # Método 1: Render simple de partial
    render_on :view_account_login_auth_provider,
              partial: "hooks/my_module/login_provider"

    # Método 2: Lógica personalizada
    def view_my_settings(context = {})
      user = context[:user]

      context[:controller].send(
        :render_to_string,
        partial: "my_module/settings",
        locals: {
          user: user,
          my_data: fetch_user_data(user)
        }
      )
    end

    # Método 3: Renderizado condicional
    def view_layouts_base_html_head(context = {})
      return unless User.current.logged?

      javascript_include_tag("my_module/custom.js")
    end
  end
end
```

---

### 2. CONTROLLER HOOKS (Hooks de Controlador)

#### Hooks Disponibles

| Hook | Contexto | Cuándo se Llama |
|------|----------|-----------------|
| `:controller_work_packages_move_before_save` | `params`, `work_package`, `target_project`, `copy` | Antes de mover WP |
| `:controller_work_packages_bulk_edit_before_save` | `params`, `work_package` | Antes de edición masiva |
| `:controller_account_success_authentication_after` | `user` | Después de autenticación exitosa |
| `:controller_wiki_edit_after_save` | `params`, `page` | Después de guardar wiki |
| `:controller_custom_fields_new_after_save` | `custom_field` | Después de crear custom field |
| `:controller_messages_new_after_save` | `params`, `message` | Después de crear mensaje |
| `:application_controller_before_action` | `controller` | Antes de cualquier acción |

#### Ejemplo - Controller Hook

```ruby
# modules/budgets/lib/budgets/hooks/work_package_hook.rb
module Budgets::Hooks
  class WorkPackageHook < OpenProject::Hook::ViewListener
    def controller_work_packages_move_before_save(context = {})
      budget_id = context[:params][:budget_id]
      work_package = context[:work_package]
      target_project = context[:target_project]

      case budget_id
      when "" # Sin cambio
        work_package.budget_id = nil unless work_package.project == target_project
      when "none"
        work_package.budget_id = nil
      else
        work_package.budget_id = budget_id
      end
    end
  end
end
```

---

### 3. SERVICE HOOKS (Hooks de Servicios)

#### Hooks Disponibles

| Hook | Contexto | Uso |
|------|----------|-----|
| `:service_update_user_before_save` | `params`, `permitted_params`, `user` | Antes de guardar usuario |

#### Ejemplo - Service Hook

```ruby
# modules/backlogs/lib/open_project/backlogs/hooks/user_settings_hook.rb
class OpenProject::Backlogs::Hooks::UserSettingsHook < OpenProject::Hook::ViewListener
  def service_update_user_before_save(context = {})
    params = context[:params]
    user = context[:user]

    backlogs_params = params.delete(:backlogs)
    return unless backlogs_params

    versions_default_fold_state = backlogs_params[:versions_default_fold_state] || "open"
    user.backlogs_preference(:versions_default_fold_state, versions_default_fold_state)
  end
end
```

---

### 4. MODEL HOOKS (Hooks de Modelo)

#### Hooks Disponibles

| Hook | Contexto | Cuándo |
|------|----------|--------|
| `:work_package_after_create` | `work_package` | Después de crear WP |
| `:work_package_after_update` | `work_package` | Después de actualizar WP |
| `:user_logged_in` | `user`, `session` | Después de login |
| `:omniauth_user_authorized` | `auth_hash`, `controller` | Después de OAuth |

#### Integración en Modelos

```ruby
# En WorkPackage model
module WorkPackage::Hooks
  extend ActiveSupport::Concern

  included do
    after_commit :call_after_create_hook, on: :create
    after_commit :call_after_update_hook, on: :update
  end

  def call_after_create_hook
    OpenProject::Hook.call_hook(
      :work_package_after_create,
      { work_package: self }
    )
  end
end
```

---

### 5. PLUGIN REGISTRATION HOOKS (ActsAsOpEngine)

#### Estructura de Engine

```ruby
# modules/my_module/lib/open_project/my_module/engine.rb
module OpenProject::MyModule
  class Engine < ::Rails::Engine
    engine_name :openproject_my_module

    include OpenProject::Plugins::ActsAsOpEngine

    register "openproject-my_module",
             author_url: "https://example.com",
             bundled: true,
             settings: {
               default: { 'option' => 'value' }
             } do
      # Bloque de configuración del plugin
    end
  end
end
```

#### Hooks de Configuración Disponibles

**1. before_configuration**
```ruby
config.before_configuration do |app|
  # Ejecuta ANTES de la configuración de Rails
  # Usado para prepend routes
  app.config.paths["config/routes.rb"].unshift(
    File.join(config.root, "config", "routes.rb")
  )
end
```

**2. Initializers**
```ruby
initializer "my_module.custom_setup" do |app|
  # Inicialización personalizada
  # Ejecuta durante el boot de Rails
end

# Initializers automáticos disponibles:
# - "#{engine_name}.remove_duplicate_routes"
# - "#{engine_name}.register_test_paths"
# - "#{engine_name}.i18n_load_paths"
# - "#{engine_name}.register_factories"
# - "#{engine_name}.append_migrations"
# - "#{engine_name}.precompile_assets"
# - "#{engine_name}.register_plugin"
```

**3. config.to_prepare**
```ruby
config.to_prepare do
  # Código que necesita recargarse en desarrollo
  # Ejecuta antes de cada request en dev, una vez en prod

  # Ejemplo: Registrar filtros de query
  ::Queries::Register.register(::Query) do
    filter MyCustomFilter
  end
end
```

**4. config.after_initialize**
```ruby
config.after_initialize do
  # Ejecuta UNA VEZ después de inicializar Rails

  # Ejemplo: Suscribirse a eventos
  OpenProject::Notifications.subscribe(event_name) do |payload|
    # Manejar evento
  end
end
```

---

### 6. PATCHING SYSTEM (Sistema de Parches)

#### Métodos de Patching en ActsAsOpEngine

**1. patches - Patching Simple**
```ruby
# En engine.rb
patches %i[WorkPackage User Project PermittedParams]

# Busca patches en:
# lib/open_project/my_module/patches/work_package_patch.rb
# lib/open_project/my_module/patches/user_patch.rb
# etc.
```

**Estructura de Patch**:
```ruby
# modules/my_module/lib/open_project/my_module/patches/work_package_patch.rb
module OpenProject::MyModule::Patches::WorkPackagePatch
  extend ActiveSupport::Concern

  included do
    prepend InstanceMethods
    extend ClassMethods

    # Agregar validaciones
    validates :my_field,
              presence: true,
              if: -> { my_module_enabled? }

    # Agregar callbacks
    after_save :my_callback
  end

  module ClassMethods
    def my_class_method
      # Métodos de clase
    end
  end

  module InstanceMethods
    # Extender métodos existentes
    def existing_method
      result = super  # Llamar al método original
      # Agregar lógica adicional
      result.merge(custom: data)
    end

    # Nuevos métodos
    def my_new_method
      # ...
    end
  end
end

# Auto-incluido por el mecanismo de patches
WorkPackage.include OpenProject::MyModule::Patches::WorkPackagePatch
```

**2. patch_with_namespace - Patching con Namespace**
```ruby
# En engine.rb
patch_with_namespace :BasicData, :SettingSeeder
patch_with_namespace :WorkPackages, :UpdateService
patch_with_namespace :API, :V3, :WorkPackages, :WorkPackageRepresenter

# Busca en:
# lib/open_project/my_module/patches/basic_data/setting_seeder_patch.rb
# lib/open_project/my_module/patches/work_packages/update_service_patch.rb
# lib/open_project/my_module/patches/api/v3/work_packages/work_package_representer_patch.rb
```

**Ejemplo - Backlogs WP Patch**:
```ruby
# modules/backlogs/lib/open_project/backlogs/patches/work_package_patch.rb
module OpenProject::Backlogs::Patches::WorkPackagePatch
  extend ActiveSupport::Concern

  included do
    prepend InstanceMethods

    # Registrar campos para journal
    register_journal_formatted_fields(
      "story_points",
      "position",
      formatter_key: :decimal
    )

    # Validaciones
    validates_numericality_of :story_points,
                              only_integer: true,
                              allow_nil: true,
                              greater_than_or_equal_to: 0,
                              if: -> { backlogs_enabled? }
  end

  module InstanceMethods
    def is_story?
      backlogs_enabled? && Story.types.include?(type_id)
    end

    def is_task?
      backlogs_enabled? && Task.types.include?(type_id)
    end

    def backlogs_enabled?
      !!project&.module_enabled?("backlogs")
    end
  end
end
```

**3. Patching Manual con to_prepare**
```ruby
config.to_prepare do
  # Verificar si ya fue aplicado
  next if MyClass.included_modules.include?(MyPatch)

  # Aplicar patch
  MyClass.prepend(MyPatch)
  # o
  MyClass.include(MyPatch)
end
```

---

### 7. API EXTENSION HOOKS

#### Métodos de Extensión de API

**1. add_api_path - Definir Paths API**
```ruby
add_api_path :my_resource do |id|
  "#{root}/my_resources/#{id}"
end

add_api_path :my_resources do
  "#{root}/my_resources"
end
```

**2. add_api_endpoint - Montar Endpoints API**
```ruby
# Montar en root de API
add_api_endpoint "API::V3::Root" do
  mount ::API::V3::MyResources::MyResourcesAPI
end

# Montar en endpoint existente
add_api_endpoint "API::V3::WorkPackages::WorkPackagesAPI", :id do
  mount ::API::V3::MyResources::MyResourcesByWorkPackageAPI
end
```

**3. extend_api_response - Extender Representers API**
```ruby
extend_api_response(:v3, :work_packages, :work_package) do
  include Redmine::I18n

  # Agregar links
  link :myCustomLink,
       cache_if: -> {
         current_user.allowed_in_project?(:my_permission, represented.project)
       } do
    next unless represented.my_module_enabled?

    {
      href: my_custom_path(represented),
      type: "text/html",
      title: "Custom action"
    }
  end

  # Agregar propiedades
  property :my_custom_field,
           exec_context: :decorator,
           if: ->(*) { my_custom_field_visible? },
           render_nil: true

  # Agregar recursos embebidos
  resource :myCustomResource,
           link: ->(*) {
             { href: api_v3_paths.my_custom_resource(represented.id) }
           },
           getter: ->(*) {
             MyCustomRepresenter.new(represented, current_user:)
           }
end
```

**Ejemplo - Costs Module API Extension**:
```ruby
# modules/costs/lib/open_project/costs/engine.rb
extend_api_response(:v3, :work_packages, :work_package) do
  # Propiedades de costos
  property :labor_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  property :material_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  property :overall_costs,
           exec_context: :decorator,
           if: ->(*) { represented.costs_enabled? }

  # Link para log costs
  link :log_costs do
    {
      href: api_v3_paths.cost_entries_by_work_package(represented.id),
      title: "Log costs"
    } if represented.costs_enabled?
  end
end
```

**4. add_api_attribute - Agregar Atributos Escribibles**
```ruby
add_api_attribute on: :work_package,
                  ar_name: :story_points,
                  writable_for: %i[create update],
                  writable: true do
  # Bloque de validación opcional
end
```

**5. add_api_representer_cache_key - Cache Key**
```ruby
add_api_representer_cache_key(:v3, :work_packages, :work_package) do
  [my_module_enabled?, custom_cache_key]
end
```

---

### 8. MENU HOOKS

#### Ubicaciones de Menú Disponibles

- `:top_menu` - Menú superior
- `:global_menu` - Menú global/principal
- `:project_menu` - Menú específico de proyecto
- `:admin_menu` - Menú de administración
- `:account_menu` - Menú de cuenta de usuario
- `:application_menu` - Menú de aplicación
- `:work_package_split_view` - Tabs de work package

#### Registro de Menú

```ruby
# En bloque de registro del plugin
menu :project_menu,
     :my_module,
     { controller: "/my_module", action: "index" },
     caption: :label_my_module,
     after: :work_packages,
     icon: "my-icon",
     if: ->(project) { project.module_enabled?(:my_module) }

menu :admin_menu,
     :my_admin_section,
     { controller: "/admin/my_settings", action: :show },
     if: Proc.new { User.current.admin? },
     caption: :label_my_settings,
     parent: :admin,
     icon: "settings"
```

#### Opciones de Menú

- **caption** - Etiqueta del menú (clave I18n o string)
- **after/before** - Posición relativa
- **icon** - Clase de icono
- **if** - Condición para visibilidad (Proc)
- **parent** - Ítem padre (para submenús)
- **badge** - Badge dinámico (ej: contador)
- **skip_permissions_check** - Saltar validación de permisos

#### Menú Avanzado - Con Badge

```ruby
# Badge con contador dinámico
menu :work_package_split_view,
     :meetings,
     { tab: :meetings },
     badge: ->(work_package:, **) {
       Meeting.visible
              .where(id: work_package.meetings.select(:id))
              .count
     },
     icon: "meetings"
```

#### Menú con Partial Personalizado

```ruby
menu :project_menu,
     :my_module_query_select,
     { controller: "/my_module", action: "index" },
     parent: :my_module,
     partial: "my_module/menus/menu"
```

#### Configuración Dinámica de Menú

```ruby
configure_menu :project_menu do |menu, project|
  # Agregar ítems dinámicamente
  project.my_resources.each do |resource|
    menu.push(
      :"my_resource_#{resource.id}",
      { controller: "/my_resources", action: "show", id: resource.id },
      caption: resource.name,
      parent: :my_module
    )
  end
end
```

---

### 9. EVENT NOTIFICATION HOOKS

#### Sistema OpenProject::Notifications

Sistema pub/sub para comunicación entre módulos.

#### Eventos del Core Disponibles

**Work Packages**:
- `OpenProject::Events::WORK_PACKAGE_CREATED`
- `OpenProject::Events::WORK_PACKAGE_UPDATED`
- `OpenProject::Events::WORK_PACKAGE_DELETED`
- `OpenProject::Events::WORK_PACKAGE_COPIED`

**Projects**:
- `OpenProject::Events::PROJECT_CREATED`
- `OpenProject::Events::PROJECT_UPDATED`
- `OpenProject::Events::PROJECT_RENAMED`
- `OpenProject::Events::PROJECT_ARCHIVED`
- `OpenProject::Events::PROJECT_UNARCHIVED`

**Members**:
- `OpenProject::Events::MEMBER_CREATED`
- `OpenProject::Events::MEMBER_UPDATED`
- `OpenProject::Events::MEMBER_DESTROYED`

**Users**:
- `OpenProject::Events::USER_CREATED`
- `OpenProject::Events::USER_UPDATED`
- `OpenProject::Events::USER_INVITED`

**Roles**:
- `OpenProject::Events::ROLE_UPDATED`
- `OpenProject::Events::ROLE_DESTROYED`

**OAuth**:
- `OpenProject::Events::OAUTH_CLIENT_TOKEN_CREATED`
- `OpenProject::Events::REMOTE_IDENTITY_CREATED`

#### Suscribirse a Eventos

```ruby
config.after_initialize do
  # Suscribirse a evento
  OpenProject::Notifications.subscribe(
    OpenProject::Events::MEMBER_CREATED
  ) do |payload|
    member = payload[:member]
    project = member.project

    # Lógica personalizada
    MyModule::SyncService.call(project)
  end
end
```

#### Ejemplo - Storages Module

```ruby
# modules/storages/lib/openproject-storages/engine.rb
config.after_initialize do
  # Sincronizar storage cuando se crea un miembro
  OpenProject::Notifications.subscribe(
    OpenProject::Events::MEMBER_CREATED
  ) do |payload|
    project = payload[:member].project

    project.project_storages.each do |project_storage|
      Storages::AutomaticallyManagedStorageSyncJob
        .debounce(project_storage.storage)
    end
  end

  # Sincronizar cuando se actualiza el proyecto
  OpenProject::Notifications.subscribe(
    OpenProject::Events::PROJECT_UPDATED
  ) do |payload|
    project = payload[:project]

    project.project_storages.each do |ps|
      Storages::AutomaticallyManagedStorageSyncJob
        .debounce(ps.storage)
    end
  end
end
```

#### Ejemplo - GitHub Integration

```ruby
# modules/github_integration/lib/openproject-github_integration/engine.rb
config.after_initialize do
  OpenProject::Notifications.subscribe('github.pull_request') do |payload|
    GithubIntegration::NotificationHandler.pull_request(payload)
  end

  OpenProject::Notifications.subscribe('github.check_run') do |payload|
    GithubIntegration::NotificationHandler.check_run(payload)
  end

  OpenProject::Notifications.subscribe('github.push') do |payload|
    GithubIntegration::NotificationHandler.push(payload)
  end
end
```

#### Publicar Eventos Personalizados

```ruby
# En tu servicio/controlador
OpenProject::Notifications.send(
  "my_module.custom_event",
  {
    resource: @resource,
    user: User.current,
    action: :created
  }
)

# Otros módulos pueden suscribirse
OpenProject::Notifications.subscribe("my_module.custom_event") do |payload|
  # Manejar evento
end
```

---

### 10. MÉTODOS ADICIONALES DE ENGINE

#### Permisos

```ruby
# En bloque de registro
project_module :my_module do
  permission :view_my_resources,
             { my_resources: [:index, :show] },
             permissible_on: :project,
             public: false

  permission :edit_my_resources,
             { my_resources: [:edit, :update, :destroy] },
             permissible_on: :project,
             require: :member,
             dependencies: [:view_my_resources]
end
```

#### Activity Provider

```ruby
activity_provider :my_resources,
                  class_name: "Activities::MyResourceActivityProvider",
                  default: false
```

#### Assets

```ruby
assets %w[my_module.js my_module.css]
```

#### Parámetros Permitidos

```ruby
additional_permitted_attributes work_package: [:custom_field, :my_attribute]
```

#### Tab Entry

```ruby
add_tab_entry :user,
              name: "my_tab",
              partial: "users/my_tab",
              path: ->(params) {
                edit_user_path(params[:user], tab: :my_tab)
              },
              only_if: ->(*) { User.current.admin? },
              label: :label_my_tab
```

#### Cron Jobs

```ruby
add_cron_jobs do
  {
    MyCleanupJob: {
      cron: "0 2 * * *",  # Cada día a las 2 AM
      class: ::MyCleanupJob.name
    },
    MyHourlyJob: {
      cron: "0 * * * *",  # Cada hora
      class: ::MyHourlyJob.name
    }
  }
end
```

#### Referencias Principales (para manejo de borrado)

```ruby
replace_principal_references "Meeting" => %i[author_id],
                             "MeetingParticipant" => :user_id
```

---

### 11. MEJORES PRÁCTICAS

#### Para Implementación de Hooks

**1. Siempre usar Singleton**
```ruby
class MyHook < OpenProject::Hook::Listener
  include Singleton  # REQUERIDO!
end
```

**2. Verificar que el hook existe antes de llamar**
```ruby
def call_my_hook
  return if OpenProject::Hook.hook_listeners(:my_hook).empty?
  call_hook(:my_hook, context)
end
```

**3. Proporcionar contexto significativo**
```ruby
call_hook(:my_hook, {
  resource: @resource,
  user: User.current,
  project: @project,
  params: params
})
```

**4. Usar render_on para parciales simples**
```ruby
render_on :view_my_hook, partial: "hooks/my_partial"
```

**5. Manejo de errores en hooks**
```ruby
def my_hook(context)
  # El sistema de hooks captura StandardError automáticamente
  # pero loguea fallos importantes
rescue => e
  Rails.logger.error "My hook failed: #{e.message}"
end
```

#### Para Patching

**1. Usar prepend para override de métodos**
```ruby
module InstanceMethods
  def my_method
    # Llamar al original
    result = super
    # Extender comportamiento
    result.merge(custom: data)
  end
end
```

**2. Verificar si el módulo está habilitado**
```ruby
validates :field, presence: true, if: -> { my_module_enabled? }

def my_module_enabled?
  project&.module_enabled?(:my_module)
end
```

**3. Patching condicional**
```ruby
config.to_prepare do
  next if MyClass.included_modules.include?(MyPatch)
  MyClass.prepend(MyPatch)
end
```

#### Para Extensiones de API

**1. Cachear respuestas apropiadamente**
```ruby
link :myLink,
     cache_if: -> {
       current_user.allowed_in_project?(:permission, represented.project)
     } do
  # Cálculo costoso de link
end
```

**2. Usar patrones de representer adecuados**
```ruby
resource :myResource,
         link: ->(*) { { href: api_v3_paths.my_resource(represented.id) } },
         getter: ->(*) { MyRepresenter.new(represented, current_user:) },
         skip_render: ->(*) { !my_resource_available? }
```

---

### 12. ESTRUCTURA RECOMENDADA DE MÓDULO

```
modules/my_module/
├── app/
│   ├── controllers/
│   │   └── my_module/
│   │       └── my_resources_controller.rb
│   ├── models/
│   │   └── my_module/
│   │       └── my_resource.rb
│   ├── views/
│   │   └── my_module/
│   │       └── my_resources/
│   ├── services/
│   │   └── my_module/
│   └── components/
│       └── my_module/
├── config/
│   ├── routes.rb
│   └── locales/
│       ├── en.yml
│       └── es.yml
├── db/
│   └── migrate/
├── lib/
│   ├── open_project/
│   │   └── my_module/
│   │       ├── engine.rb              # ⭐ Engine principal
│   │       ├── hooks.rb               # ⭐ Hooks del módulo
│   │       └── patches/               # ⭐ Patches
│   │           ├── work_package_patch.rb
│   │           ├── project_patch.rb
│   │           └── api/
│   │               └── v3/
│   │                   └── work_packages/
│   │                       └── work_package_representer_patch.rb
│   └── my_module.rb
├── frontend/                          # Frontend opcional
│   └── src/
├── spec/
│   ├── models/
│   ├── services/
│   ├── features/
│   └── factories/
└── README.md
```

---

### 13. TABLA DE REFERENCIA RÁPIDA DE HOOKS

| Tipo de Hook | Nombre | Contexto | Uso Común |
|--------------|--------|----------|-----------|
| **View** | `:view_layouts_base_html_head` | project, request, controller | Agregar CSS/JS |
| **View** | `:view_work_packages_index_bottom` | project, query | Extender índice WP |
| **View** | `:view_my_account` | user, form | Extender cuenta usuario |
| **Controller** | `:controller_work_packages_move_before_save` | params, work_package, target_project | Mover WP |
| **Service** | `:service_update_user_before_save` | params, user | Actualizar usuario |
| **Model** | `:work_package_after_create` | work_package | Post-creación WP |
| **Model** | `:user_logged_in` | user, session | Post-login |
| **Event** | `MEMBER_CREATED` | member | Sincronización |
| **Event** | `PROJECT_UPDATED` | project | Actualización proyecto |

---

## 17. TESTING

### RSpec

**Framework**: RSpec 3.x
**Cobertura**: 80%+
**Tests**: 10,000+ specs

### Estructura de Tests

```
spec/
├── controllers/          # Controller specs
├── models/              # Model specs
├── services/            # Service specs
├── contracts/           # Contract specs
├── workers/             # Worker specs
├── policies/            # Policy specs
├── features/            # Feature/Integration tests
├── requests/            # Request specs (API)
├── routing/             # Routing specs
├── lib/                 # Library specs
├── components/          # Component specs
├── support/             # Test helpers
│   ├── shared_examples/  # Shared examples
│   └── helpers/          # Helper methods
└── factories/           # FactoryBot factories
```

### Ejemplo de Test de Modelo

```ruby
# spec/models/work_package_spec.rb

require 'spec_helper'

RSpec.describe WorkPackage, type: :model do
  describe 'associations' do
    it { is_expected.to belong_to(:project) }
    it { is_expected.to belong_to(:type) }
    it { is_expected.to belong_to(:status) }
    it { is_expected.to have_many(:time_entries) }
    it { is_expected.to have_many(:relations_from) }
  end

  describe 'validations' do
    it { is_expected.to validate_presence_of(:subject) }
    it { is_expected.to validate_presence_of(:project) }
    it { is_expected.to validate_presence_of(:type) }

    context 'when dates are set' do
      it 'validates start_date is before due_date' do
        wp = build(:work_package,
                   start_date: Date.today,
                   due_date: Date.yesterday)
        expect(wp).not_to be_valid
        expect(wp.errors[:due_date]).to be_present
      end
    end
  end

  describe '#overall_costs' do
    let(:work_package) { create(:work_package) }

    before do
      create(:time_entry, work_package: work_package, hours: 5)
      create(:cost_entry, work_package: work_package, costs: 100)
    end

    it 'calculates total costs' do
      expect(work_package.overall_costs).to eq(100 + (5 * 50)) # 5h * 50/h
    end
  end
end
```

### Ejemplo de Test de Servicio

```ruby
# spec/services/work_packages/create_service_spec.rb

require 'spec_helper'

RSpec.describe WorkPackages::CreateService, type: :service do
  let(:user) { create(:user) }
  let(:project) { create(:project) }
  let(:type) { create(:type) }
  let(:status) { create(:status) }

  let(:service) { described_class.new(user: user) }

  let(:params) do
    {
      project: project,
      type: type,
      status: status,
      subject: 'New work package',
      description: 'Description',
      start_date: Date.today,
      due_date: Date.today + 7.days
    }
  end

  before do
    create(:member, project: project, user: user,
           roles: [create(:role, permissions: [:add_work_packages])])
  end

  describe '#call' do
    it 'creates a work package' do
      expect { service.call(params) }
        .to change(WorkPackage, :count).by(1)
    end

    it 'returns success' do
      result = service.call(params)
      expect(result).to be_success
    end

    it 'sets attributes correctly' do
      result = service.call(params)
      wp = result.result

      expect(wp.subject).to eq('New work package')
      expect(wp.project).to eq(project)
      expect(wp.type).to eq(type)
    end

    it 'sends notification event' do
      expect(OpenProject::Notifications)
        .to receive(:send)
        .with(OpenProject::Events::WORK_PACKAGE_CREATED, anything)

      service.call(params)
    end

    context 'without permission' do
      before do
        Member.destroy_all
      end

      it 'returns failure' do
        result = service.call(params)
        expect(result).to be_failure
      end

      it 'does not create work package' do
        expect { service.call(params) }
          .not_to change(WorkPackage, :count)
      end
    end
  end
end
```

### Ejemplo de Feature Test

```ruby
# spec/features/work_packages/create_spec.rb

require 'spec_helper'

RSpec.describe 'Create work package', type: :feature, js: true do
  let(:user) { create(:admin) }
  let(:project) { create(:project) }
  let(:type) { create(:type) }

  before do
    login_as(user)
    visit project_work_packages_path(project)
  end

  it 'creates a new work package' do
    click_link 'Create'

    fill_in 'Subject', with: 'New task'
    select type.name, from: 'Type'
    fill_in 'Description', with: 'Task description'

    click_button 'Create'

    expect(page).to have_text('Successful creation')
    expect(page).to have_text('New task')
  end
end
```

### FactoryBot Factories

```ruby
# spec/factories/work_package_factory.rb

FactoryBot.define do
  factory :work_package do
    association :project
    association :type
    association :status
    association :priority
    association :author, factory: :user

    subject { "Work package #{SecureRandom.hex(4)}" }
    description { "Description for #{subject}" }
    start_date { Date.today }
    due_date { Date.today + 7.days }
    estimated_hours { 8.0 }

    trait :with_assignee do
      association :assigned_to, factory: :user
    end

    trait :closed do
      association :status, factory: :closed_status
    end

    trait :high_priority do
      association :priority, factory: :priority_high
    end
  end
end

# Uso:
work_package = create(:work_package)
work_package = create(:work_package, :with_assignee, :high_priority)
```

---

## 17. BUILD Y DEPLOYMENT

### Docker Compose (Desarrollo)

```yaml
# docker-compose.yml

version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: docker/dev/Dockerfile
    command: bundle exec rails server -b 0.0.0.0
    volumes:
      - .:/app
      - bundle:/usr/local/bundle
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/openproject_dev
      RAILS_ENV: development
      MEMCACHE_SERVERS: cache:11211
    depends_on:
      - db
      - cache

  worker:
    build:
      context: .
      dockerfile: docker/dev/Dockerfile
    command: bundle exec good_job start
    volumes:
      - .:/app
      - bundle:/usr/local/bundle
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/openproject_dev
      RAILS_ENV: development
    depends_on:
      - db

  frontend:
    build:
      context: .
      dockerfile: docker/dev/Dockerfile.frontend
    command: npm run serve
    volumes:
      - ./frontend:/app/frontend
      - node_modules:/app/frontend/node_modules
    ports:
      - "4200:4200"

  db:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: openproject_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  cache:
    image: memcached:latest
    ports:
      - "11211:11211"

volumes:
  postgres_data:
  bundle:
  node_modules:
```

### Procfile (Producción)

```bash
# Procfile

web: ./packaging/scripts/web
worker: ./packaging/scripts/worker
backup: ./packaging/scripts/backup
check: ./packaging/scripts/check
```

### Scripts de Deployment

```bash
# packaging/scripts/web

#!/bin/bash
set -e

# Precompile assets
bundle exec rails assets:precompile

# Run migrations
bundle exec rails db:migrate

# Start Puma
bundle exec puma -C config/puma.rb
```

```bash
# packaging/scripts/worker

#!/bin/bash
set -e

# Start GoodJob worker
bundle exec good_job start
```

### Build Frontend

```bash
# Build production
npm run build

# Build development
npm run serve

# Run tests
npm run test
```

**Output**: `public/assets/frontend/`

---

## 18. FLUJOS DE TRABAJO PRINCIPALES

### Flujo: Crear Work Package

```
Usuario → Frontend (Angular)
  ↓
  POST /api/v3/work_packages
  ↓
API::V3::WorkPackages::CreateEndpoint
  ↓
WorkPackages::CreateService
  ↓
  ├─→ SetAttributesService (setear atributos)
  ├─→ CreateContract (validar)
  ├─→ WorkPackage.save! (persistir)
  ├─→ Journal.create (auditoría)
  └─→ OpenProject::Notifications.send (evento)
      ↓
      ├─→ NotificationService (notificar watchers)
      ├─→ Webhooks::Deliver (webhooks)
      └─→ [Otros suscriptores]
  ↓
ServiceResult.success(result: work_package)
  ↓
Representer (HAL+JSON)
  ↓
Response → Frontend
  ↓
UI Update (Akita store)
```

### Flujo: Autenticación OAuth

```
Usuario → Click "Login with OAuth"
  ↓
GET /auth/:provider
  ↓
OmniAuth Middleware
  ↓
Redirect → Provider (GitHub, Google, etc.)
  ↓
Usuario autoriza
  ↓
Redirect → /auth/:provider/callback
  ↓
AuthController#callback
  ↓
  ├─→ Buscar/Crear usuario
  ├─→ Sesión.create
  └─→ Redirect a aplicación
```

### Flujo: Background Job

```
Usuario → Acción (ej: Copiar Proyecto)
  ↓
CopyProjectJob.perform_later(project_id, user_id)
  ↓
ActiveJob → GoodJob
  ↓
Enqueue en PostgreSQL (good_jobs table)
  ↓
Worker Process (good_job start)
  ↓
Dequeue job
  ↓
CopyProjectJob#perform
  ↓
  ├─→ Projects::CopyService
  ├─→ Copiar work packages
  ├─→ Copiar membresía
  ├─→ Copiar configuración
  └─→ Enviar email de completación
  ↓
Job completado
```

### Flujo: Webhook Entrante (GitHub)

```
GitHub → POST /api/webhooks/github
  ↓
GithubIntegration::WebhooksController#handle
  ↓
Verificar firma HMAC
  ↓
Parse payload
  ↓
OpenProject::Notifications.send('github.pull_request', payload)
  ↓
GithubIntegration::NotificationHandler.pull_request
  ↓
  ├─→ Buscar work packages mencionados
  ├─→ Crear/Actualizar GithubPullRequest
  ├─→ Añadir comentario a WP
  └─→ Notificar usuarios
```

---

## CONCLUSIÓN

Este documento técnico proporciona una visión completa de la arquitectura, tecnologías, módulos y flujos de OpenProject.

**OpenProject** es una plataforma empresarial robusta con:
- ✅ Arquitectura modular escalable (28 módulos)
- ✅ API REST completa (HAL+JSON)
- ✅ Frontend moderno (Angular + Hotwire)
- ✅ Sistema de permisos granular
- ✅ Integraciones extensas
- ✅ Testing comprehensivo
- ✅ Deployment flexible

**Contacto**:
Documentación: https://docs.openproject.org
Repositorio: https://github.com/opf/openproject
Comunidad: https://community.openproject.org

---

**Fin del Documento Técnico**
