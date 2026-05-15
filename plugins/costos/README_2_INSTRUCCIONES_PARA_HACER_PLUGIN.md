# INSTRUCCIONES PARA HACER UN PLUGIN DE OPENPROJECT

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Prerrequisitos](#prerrequisitos)
3. [Estructura Básica](#estructura-básica)
4. [Configuración del Plugin](#configuración-del-plugin)
5. [Modelos de Datos](#modelos-de-datos)
6. [Controladores](#controladores)
7. [Vistas](#vistas)
8. [Frontend Angular](#frontend-angular)
9. [Sistema de Permisos](#sistema-de-permisos)
10. [Menús y Navegación](#menús-y-navegación)
11. [Hooks del Sistema](#hooks-del-sistema)
12. [Assets y Estilos](#assets-y-estilos)
13. [Internacionalización](#internacionalización)
14. [Testing Automatizado](#testing-automatizado)
15. [Buenas Prácticas](#buenas-prácticas)
16. [Integración con Core](#integración-con-core)
17. [Despliegue y Distribución](#despliegue-y-distribución)
18. [Solución de Problemas Comunes](#solución-de-problemas-comunes)

---

## Introducción

Este documento proporciona instrucciones completas y detalladas para desarrollar plugins para OpenProject, siguiendo las mejores prácticas y patrones establecidos. Un plugin bien desarrollado debe integrarse perfectamente con el ecosistema de OpenProject manteniendo compatibilidad, escalabilidad y mantenibilidad.

### ¿Qué es un Plugin de OpenProject?

Un plugin es una extensión modular que añade funcionalidades específicas al sistema principal de OpenProject. Los plugins pueden:

- Añadir nuevos modelos de datos y tablas a la base de datos
- Extender la interfaz de usuario con componentes personalizados
- Integrarse con el sistema de permisos y autorización
- Proporcionar nuevas APIs y endpoints REST
- Modificar el comportamiento existente mediante hooks
- Agregar menús, paneles y elementos de navegación

---

## Prerrequisitos

### Entorno de Desarrollo

1. **OpenProject Core Funcional**:
   ```bash
   git clone https://github.com/opf/openproject.git
   cd openproject
   git checkout dev
   ./bin/setup_dev
   ```

2. **Ruby y Rails**:
   - Ruby >= 2.7
   - Rails >= 6.0
   - Bundler para gestión de dependencias

3. **Node.js y Angular** (para frontend):
   - Node.js >= 14
   - npm >= 6
   - Angular CLI >= 13

4. **Base de Datos**:
   - PostgreSQL >= 10 (recomendado)
   - MySQL >= 8 (alternativa)

### Conocimientos Requeridos

- **Ruby on Rails**: MVC, ActiveRecord, migraciones
- **Angular**: Componentes, servicios, módulos
- **JavaScript**: ES6+, TypeScript
- **HTML/ERB**: Templates y vistas
- **CSS/SCSS**: Estilos y responsive design
- **Git**: Control de versiones

---

## Estructura Básica

### Directorios Obligatorios

```
nombre_plugin/
├── app/                          # Backend Ruby on Rails
│   ├── controllers/               # Controladores MVC
│   ├── models/                   # Modelos ActiveRecord
│   ├── views/                    # Vistas ERB
│   │   └── hooks/              # Vistas para hooks
│   └── assets/                   # Assets estáticos
├── config/                       # Configuración
│   └── locales/                  # Traducciones
├── db/migrate/                   # Migraciones DB
├── lib/                          # Lógica principal
│   └── open_project/nombre_plugin/
│       ├── engine.rb              # Motor del plugin
│       ├── hooks.rb              # Hooks del sistema
│       └── version.rb            # Versión
├── frontend/                      # Frontend Angular
│   └── module/                  # Módulos Angular
├── spec/                         # Tests automatizados
├── Gemfile                       # Dependencias Ruby
├── README.md                      # Documentación
└── nombre_plugin.gemspec          # Especificación del gem
```

### Archivos Esenciales

1. **engine.rb**: Corazón del plugin, registra todo
2. **.gemspec**: Metadatos y dependencias
3. **Gemfile**: Dependencias de desarrollo
4. **version.rb**: Control de versiones
5. **routes.rb**: Definición de rutas (opcional)

---

## Configuración del Plugin

### Engine.rb - El Corazón del Plugin

```ruby
# lib/open_project/nombre_plugin/engine.rb
require 'active_support/dependencies'
require 'open_project/plugins'

module OpenProject::NombrePlugin
  class Engine < ::Rails::Engine
    engine_name :openproject_nombre_plugin
    
    include OpenProject::Plugins::ActsAsOpEngine
    
    register(
      'openproject-nombre_plugin',
      :author_url => 'https://tu-sitio-web.com',
      :requires_openproject => '>= 13.0.0',
      :name => 'Nombre Descriptivo',
      :description => 'Descripción detallada del plugin'
    ) do
      
      # Módulos de proyecto y permisos
      project_module :nombre_modulo do
        permission :view_recurso,
                   { controlador: %i[index show] },
                   permissible_on: [:project]
        
        permission :manage_recurso,
                   { controlador: %i[new create edit destroy] },
                   permissible_on: [:project]
      end
      
      # Menús del proyecto
      menu :project_menu,
           :nombre_recurso,
           { controller: '/recurso', action: 'index' },
           after: :overview,
           caption: "Nombre Recurso",
           icon: :icono_apropiado
    end
    
    # Configuración posterior al inicialización
    config.to_prepare do
      require_dependency 'open_project/nombre_plugin/hooks'
    end
    
    # Assets estáticos
    assets %w(icono.png estilo.css)
  end
end
```

### Gemspec - Metadatos del Plugin

```ruby
# nombre_plugin.gemspec
$:.push File.expand_path("../lib", __FILE__)

require 'open_project/nombre_plugin/version'

Gem::Specification.new do |s|
  s.name        = "openproject-nombre_plugin"
  s.version     = OpenProject::NombrePlugin::VERSION
  s.authors     = "Tu Nombre"
  s.email       = "tu-email@dominio.com"
  s.homepage    = "https://tu-sitio-web.com"
  s.summary     = "Resumen corto del plugin"
  s.description = "Descripción detallada del plugin"
  s.license     = "GPLv3" # o "MIT"
  
  s.files = Dir["{app,config,db,lib}/**/*"] + %w(CHANGELOG.md README.md)
  
  # Dependencias
  s.add_dependency 'rails', '>= 6.0'
  s.add_dependency 'otra_gema', '~> 1.0'
end
```

---

## Modelos de Datos

### Creación de Modelos

```ruby
# app/models/recurso.rb
class Recurso < ApplicationRecord
  # Validaciones básicas
  validates :nombre, presence: true, length: { minimum: 3 }
  validates :descripcion, presence: true
  
  # Relaciones con otros modelos
  belongs_to :project
  belongs_to :author, class_name: 'User'
  has_many :comentarios, dependent: :destroy
  
  # Scopes para consultas comunes
  scope :recientes, -> { order(created_at: :desc) }
  scope :del_proyecto, ->(project) { where(project: project) }
  
  # Métodos de instancia
  def to_s
    nombre
  end
  
  def autor_nombre
    author&.name || 'Anónimo'
  end
end
```

### Migraciones de Base de Datos

```ruby
# db/migrate/20251110_create_recursos.rb
class CreateRecursos < ActiveRecord::Migration[6.0]
  def change
    create_table :recursos do |t|
      t.references :project, null: false, foreign_key: true, index: true
      t.references :author, null: false, foreign_key: true, index: true
      
      t.string :nombre, null: false, limit: 255
      t.text :descripcion
      t.string :tipo, default: 'general'
      t.decimal :valor, precision: 10, scale: 2
      
      t.timestamps null: false
    end
    
    # Índices para rendimiento
    add_index :recursos, [:project_id, :tipo]
    add_index :recursos, [:author_id, :created_at]
  end
end
```

---

## Controladores

### Estructura Básica

```ruby
# app/controllers/recursos_controller.rb
class RecursosController < ApplicationController
  # Filtros comunes
  before_action :find_project_by_project_id
  before_action :authorize
  before_action :find_recurso, only: [:show, :edit, :update, :destroy]
  
  # Acción principal - listado
  def index
    @recursos = policy_scope(Recurso)
                  .del_proyecto(@project)
                  .includes(:author)
                  .recientes
                  
    render layout: true
  end
  
  # Acción de detalle
  def show
    # @recurso ya cargado por before_action
  end
  
  # Acción de nuevo
  def new
    @recurso = Recurso.new(author: User.current)
    render action: 'form'
  end
  
  # Acción de creación
  def create
    @recurso = Recurso.new(recurso_params)
    @recurso.author = User.current
    @recurso.project = @project
    
    if @recurso.save
      flash[:notice] = 'Recurso creado exitosamente'
      redirect_to project_recurso_path(@project, @recurso)
    else
      flash[:error] = 'Error al crear recurso'
      render action: 'form'
    end
  end
  
  # Acción de edición
  def edit
    render action: 'form'
  end
  
  # Acción de actualización
  def update
    if @recurso.update(recurso_params)
      flash[:notice] = 'Recurso actualizado'
      redirect_to project_recurso_path(@project, @recurso)
    else
      flash[:error] = 'Error al actualizar recurso'
      render action: 'form'
    end
  end
  
  # Acción de eliminación
  def destroy
    if @recurso.destroy
      flash[:notice] = 'Recurso eliminado'
    else
      flash[:error] = 'Error al eliminar recurso'
    end
    redirect_to project_recursos_path(@project)
  end
  
  private
  
  # Métodos auxiliares
  def find_recurso
    @recurso = policy_scope(Recurso).find(params[:id])
  end
  
  def recurso_params
    params.require(:recurso)
          .permit(:nombre, :descripcion, :tipo, :valor)
  end
end
```

### Autorización y Permisos

```ruby
# app/policies/recurso_policy.rb
class RecursoPolicy < ApplicationPolicy
  def index?
    user_allowed_in_project?(:view_recurso)
  end
  
  def show?
    record.project == project && user_allowed_in_project?(:view_recurso)
  end
  
  def create?
    user_allowed_in_project?(:manage_recurso)
  end
  
  def update?
    record.project == project && user_allowed_in_project?(:manage_recurso)
  end
  
  def destroy?
    record.project == project && user_allowed_in_project?(:manage_recurso)
  end
  
  private
  
  def user_allowed_in_project?(permission)
    user.allowed_to?(permission, project)
  end
end
```

---

## Vistas

### Vistas ERB Principales

```erb
<!-- app/views/recursos/index.html.erb -->
<% html_title t(:label_recursos) %>

<%= toolbar(title: t(:label_recursos)) do %>
  <% if current_user.allowed_in_project?(:manage_recurso, @project) %>
    <li class="toolbar-item">
      <%= link_to(new_project_recurso_path(@project), class: 'button -highlight') do %>
        <span class="button--text"><%= t(:label_recurso_new) %></span>
      <% end %>
    </li>
  <% end %>
<% end %>

<% if @recursos.empty? %>
  <%= no_results_box(
        message: t(:label_no_recursos),
        icon: 'icon-bug'
      ) %>
<% else %>
  <table class="generic-table--container">
    <thead>
      <tr>
        <th><%= Recurso.human_attribute_name(:nombre) %></th>
        <th><%= Recurso.human_attribute_name(:tipo) %></th>
        <th><%= Recurso.human_attribute_name(:author) %></th>
        <th><%= Recurso.human_attribute_name(:created_at) %></th>
        <th class="actions"></th>
      </tr>
    </thead>
    <tbody>
      <% @recursos.each do |recurso| %>
        <tr>
          <td><%= recurso.nombre %></td>
          <td><%= recurso.tipo.humanize %></td>
          <td><%= recurso.autor_nombre %></td>
          <td><%= format_date(recurso.created_at) %></td>
          <td class="actions">
            <% if current_user.allowed_in_project?(:manage_recurso, @project) %>
              <%= link_to(
                    op_icon('icon-edit'),
                    edit_project_recurso_path(@project, recurso),
                    title: t(:button_edit),
                    class: 'button -light'
                  ) %>
              <%= link_to(
                    op_icon('icon-delete'),
                    project_recurso_path(@project, recurso),
                    method: :delete,
                    title: t(:button_delete),
                    class: 'button -light',
                    data: { confirm: t(:text_delete_confirm) }
                  ) %>
            <% end %>
          </td>
        </tr>
      <% end %>
    </tbody>
  </table>
<% end %>
```

### Formularios

```erb
<!-- app/views/recursos/_form.html.erb -->
<%= form_with(model: [@project, @recurso], 
              local: true,
              html: { class: 'form--container' }) do |f| %>
  
  <div class="form--field">
    <%= f.label :nombre, class: 'form--label' %>
    <%= f.text_field :nombre, class: 'form--text-field' %>
    <% if @recurso.errors[:nombre].any? %>
      <span class="form--error">
        <%= @recurso.errors[:nombre].join(', ') %>
      </span>
    <% end %>
  </div>
  
  <div class="form--field">
    <%= f.label :descripcion, class: 'form--label' %>
    <%= f.text_area :descripcion, 
                   rows: 4,
                   class: 'form--text-area' %>
  </div>
  
  <div class="form--field">
    <%= f.label :tipo, class: 'form--label' %>
    <%= f.select :tipo,
                options_for_select(Recurso::TIPOS.map { |tipo| [tipo.humanize, tipo] }),
                { include_blank: true },
                class: 'form--select-field' } %>
  </div>
  
  <div class="form--field">
    <%= f.label :valor, class: 'form--label' %>
    <%= f.number_field :valor, 
                     step: 0.01,
                     class: 'form--number-field' } %>
  </div>
  
  <div class="form--actions">
    <%= f.submit t(:button_save), class: 'button -highlight' %>
    <%= link_to t(:button_cancel), 
                project_recursos_path(@project),
                class: 'button' %>
  </div>
<% end %>
```

---

## Frontend Angular

### Estructura del Módulo

```typescript
// frontend/module/main.ts
import {
  APP_INITIALIZER,
  Injector,
  NgModule,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIRouterModule } from '@uirouter/angular';
import { HookService } from 'core-app/features/plugins/hook-service';

// Importar componentes
import { RecursoComponent } from './recurso/recurso.component';
import { RecursoListComponent } from './recurso-list/recurso-list.component';
import { RECURSO_ROUTES } from './recurso.routes';

export function initializePlugin(injector: Injector) {
  return () => {
    const hookService = injector.get(HookService);
    
    // Registrar hooks de contexto
    hookService.register('workPackageSingleContextMenu', () => recursoAction);
    hookService.register('workPackageTableContextMenu', () => recursoAction);
  };
}

@NgModule({
  imports: [
    CommonModule,
    UIRouterModule.forChild({ states: RECURSO_ROUTES }),
  ],
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initializePlugin,
      deps: [Injector],
      multi: true,
    },
  ],
  declarations: [
    RecursoComponent,
    RecursoListComponent,
  ],
})
export class PluginModule {
  constructor(injector: Injector) {
    // Registrar custom elements si es necesario
    registerCustomElement('opce-recurso', RecursoComponent, { injector });
  }
}
```

### Componente Principal

```typescript
// frontend/module/recurso/recurso.component.ts
import {
  Component,
  Input,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { I18nService } from 'core-app/core/i18n/i18n.service';

@Component({
  selector: 'op-recurso',
  templateUrl: './recurso.component.html',
  styleUrls: ['./recurso.component.sass'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecursoComponent implements OnInit {
  @Input() recursoId: number;
  @Input() modo: 'view' | 'edit' = 'view';
  
  recurso: any = null;
  cargando = true;
  
  constructor(private i18n: I18nService) {}
  
  ngOnInit(): void {
    this.cargarRecurso();
  }
  
  private cargarRecurso(): void {
    // Lógica para cargar datos desde API
    this.cargando = false;
  }
  
  get titulo(): string {
    return this.i18n.t(`js.recurso.${this.modo}_title`);
  }
  
  guardar(): void {
    // Lógica para guardar cambios
  }
  
  cancelar(): void {
    // Lógica para cancelar edición
  }
}
```

### Template del Componente

```html
<!-- frontend/module/recurso/recurso.component.html -->
<div class="recurso-container" *ngIf="!cargando">
  <div class="recurso-header">
    <h2>{{ titulo }}</h2>
    <div class="recurso-actions" *ngIf="modo === 'view'">
      <button class="button -light" (click)="editar()">
        {{ 'js.button_edit' | translate }}
      </button>
      <button class="button -danger" (click)="eliminar()">
        {{ 'js.button_delete' | translate }}
      </button>
    </div>
  </div>
  
  <div class="recurso-content">
    <div class="recurso-field">
      <label>{{ 'js.recurso.name' | translate }}:</label>
      <span>{{ recurso?.nombre }}</span>
    </div>
    
    <div class="recurso-field">
      <label>{{ 'js.recurso.descripcion' | translate }}:</label>
      <p>{{ recurso?.descripcion }}</p>
    </div>
    
    <div class="recurso-field">
      <label>{{ 'js.recurso.tipo' | translate }}:</label>
      <span>{{ recurso?.tipo | translate }}</span>
    </div>
  </div>
  
  <div class="recurso-actions" *ngIf="modo === 'edit'">
    <button class="button -highlight" (click)="guardar()">
      {{ 'js.button_save' | translate }}
    </button>
    <button class="button" (click)="cancelar()">
      {{ 'js.button_cancel' | translate }}
    </button>
  </div>
</div>

<div class="loading-container" *ngIf="cargando">
  <op-loading-indicator></op-loading-indicator>
</div>
```

---

## Sistema de Permisos

### Definición en Engine.rb

```ruby
register "openproject-nombre_plugin" do
  project_module :recursos_module do
    permission :view_recursos,
               {
                 recursos: %i[index show],
                 angular_recursos: %i[show]
               },
               permissible_on: [:project],
               dependencies: [:view_work_packages]
    
    permission :manage_recursos,
               {
                 recursos: %i[new create edit destroy],
                 angular_recursos: %i[create update destroy]
               },
               permissible_on: [:project],
               dependencies: [:view_recursos, :edit_work_packages]
  end
end
```

### Jerarquía de Permisos

```
manage_recursos (completo)
    ↓ requiere
view_recursos (básico)
    ↓ requiere
view_work_packages (core)
```

### Verificación en Controladores

```ruby
class RecursosController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize  # Verifica permisos automáticamente
  
  # Para acciones específicas
  before_action(only: [:new, :create]) { authorize(:manage_recursos) }
  before_action(only: [:edit, :update, :destroy]) { authorize(:manage_recursos, context: @recurso) }
  before_action(only: [:index, :show]) { authorize(:view_recursos) }
end
```

---

## Menús y Navegación

### Menús de Proyecto

```ruby
# En engine.rb
menu :project_menu,
     :recursos,
     { controller: '/recursos', action: 'index' },
     after: :overview,
     param: :project_id,
     caption: "Recursos",
     icon: :folder,
     html: { id: "recursos-menu-item" },
     if: ->(project) { project.active? }
```

### Menús Principales

```ruby
menu :top_menu,
     :recursos_globales,
     '/recursos',
     after: :projects,
     caption: "Recursos Globales",
     icon: :globe,
     if: -> { User.current.admin? }
```

### Submenús

```ruby
# Menú principal
menu :project_menu, :recursos, { ... }

# Submenú
menu :project_menu,
     :recursos_configuracion,
     { controller: '/recursos', action: 'configuracion' },
     parent: :recursos,
     caption: "Configuración",
     after: :recursos_listado
```

---

## Hooks del Sistema

### Hooks de Vista

```ruby
# lib/open_project/nombre_plugin/hooks.rb
module OpenProject
  module NombrePlugin
    class Hooks < OpenProject::Hook::ViewListener
      # Hook para agregar contenido al head
      def view_layouts_base_html_head(context = {})
        context[:controller].send(:render_to_string, {
          partial: 'nombre_plugin/hooks/custom_head',
          locals: { context: context }
        })
      end
      
      # Hook para agregar al sidebar
      def view_layouts_base_sidebar(context = {})
        return unless context[:project]
        
        context[:controller].send(:render_to_string, {
          partial: 'nombre_plugin/hooks/sidebar_content',
          locals: { project: context[:project] }
        })
      end
      
      # Hook para agregar después del contenido principal
      def view_layouts_base_content(context = {})
        content_for :content do
          yield
          
          # Contenido adicional del plugin
          context[:controller].send(:render_to_string, {
            partial: 'nombre_plugin/hooks/extra_content',
            locals: { context: context }
          })
        end
      end
    end
  end
end
```

### Hooks de Controlador

```ruby
class Hooks < OpenProject::Hook::ViewListener
  # Antes de crear recurso
  def controller_recursos_before_save(context = {})
    # Validación personalizada
    recurso = context[:recurso]
    
    unless recurso.valido_para_creacion?
      context[:controller].flash[:error] = 'Recurso no válido'
      false # Cancela la operación
    end
  end
  
  # Después de crear recurso
  def controller_recursos_after_save(context = {})
    recurso = context[:recurso]
    
    # Enviar notificación
    OpenProject::Notifications.send('recurso_creado', {
      recurso: recurso,
      usuario: User.current
    })
  end
end
```

### Hooks de Modelo

```ruby
# En el modelo
class Recurso < ApplicationRecord
  # Hook antes de guardar
  before_save :validar_datos
  
  # Hook después de guardar
  after_save :notificar_cambio
  
  # Hook antes de eliminar
  before_destroy :verificar_dependencias
  
  private
  
  def validar_datos
    # Lógica de validación personalizada
  errors.add(:base, 'Datos inválidos') unless datos_validos?
  end
  
  def notificar_cambio
    # Lógica de notificación
  end
  
  def verificar_dependencias
    # Lógica de verificación de dependencias
  end
end
```

---

## Assets y Estilos

### Registro de Assets

```ruby
# En engine.rb
assets %w(
  icono.png,
  estilo.css,
  script.js
)
```

### Estilos SCSS

```scss
// app/assets/stylesheets/nombre_plugin/main.scss
.nombre-plugin-container {
  .recurso-item {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 8px;
    
    &:hover {
      background-color: #f8f9fa;
      border-color: #007bff;
    }
    
    .recurso-titulo {
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }
    
    .recurso-descripcion {
      color: #666;
      font-size: 14px;
      line-height: 1.4;
    }
  }
  
  .boton-primario {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    
    &:hover {
      background-color: #0056b3;
    }
  }
}
```

### JavaScript Vanilla

```javascript
// app/assets/javascripts/nombre_plugin/main.js
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar componentes del plugin
  inicializarPlugin();
  
  // Agregar event listeners
  document.querySelectorAll('.recurso-item').forEach(function(item) {
    item.addEventListener('click', manejarClickRecurso);
  });
});

function inicializarPlugin() {
  console.log('Plugin inicializado');
}

function manejarClickRecurso(event) {
  // Lógica para manejar clicks en recursos
  const recursoId = event.currentTarget.dataset.recursoId;
  mostrarDetallesRecurso(recursoId);
}

function mostrarDetallesRecurso(id) {
  // Lógica para mostrar detalles
}
```

---

## Internacionalización

### Archivos de Traducción

```yaml
# config/locales/es.yml
es:
  # Nombres de modelos
  activerecord:
    models:
      recurso:
        one: "Recurso"
        other: "Recursos"
        attributes:
          nombre: "Nombre"
          descripcion: "Descripción"
          tipo: "Tipo"
          valor: "Valor"
          created_at: "Fecha de creación"
          updated_at: "Fecha de actualización"
  
  # Nombres de controladores
  controllers:
    recursos:
      title: "Recursos"
      index:
        title: "Listado de Recursos"
      show:
        title: "Detalle del Recurso"
      new:
        title: "Nuevo Recurso"
      edit:
        title: "Editar Recurso"
  
  # Etiquetas generales
  label_recursos: "Recursos"
  label_recurso_new: "Nuevo Recurso"
  label_recurso_edit: "Editar Recurso"
  button_save: "Guardar"
  button_cancel: "Cancelar"
  button_delete: "Eliminar"
  text_delete_confirm: "¿Está seguro de eliminar este recurso?"
```

```yaml
# config/locales/js-es.yml
js:
  recursos:
    title: "Recursos"
    loading: "Cargando..."
    empty: "No hay recursos"
    view_title: "Detalle del Recurso"
    edit_title: "Editar Recurso"
    button_save: "Guardar"
    button_cancel: "Cancelar"
    button_edit: "Editar"
    button_delete: "Eliminar"
```

### Uso en Vistas

```erb
<!-- Usar traducciones -->
<h1><%= t(:label_recursos) %></h1>

<%= t('activerecord.models.recurso.attributes.nombre') %>

<%= link_to t(:button_cancel), recursos_path %>
```

### Uso en Frontend

```typescript
// En componentes Angular
import { I18nService } from 'core-app/core/i18n/i18n.service';

export class RecursoComponent {
  texto = {
    titulo: this.i18n.t('js.recursos.title'),
    guardando: this.i18n.t('js.recursos.saving')
  };
}
```

---

## Testing Automatizado

### Tests de Controladores

```ruby
# spec/controllers/recursos_controller_spec.rb
require 'rails_helper'

RSpec.describe RecursosController, type: :controller do
  let(:project) { create(:project) }
  let(:user) { create(:user) }
  let(:recurso) { create(:recurso, project: project, author: user) }
  
  describe 'GET #index' do
    context 'con permisos' do
      before do
        allow(user).to receive(:allowed_to?)
                  .with(:view_recursos, project)
                  .and_return(true)
        login_as(user)
      end
      
      it 'muestra recursos del proyecto' do
        get :index, params: { project_id: project.id }
        
        expect(response).to have_http_status(:ok)
        expect(assigns(:recursos)).to include(recurso)
      end
    end
    
    context 'sin permisos' do
      before do
        allow(user).to receive(:allowed_to?)
                  .with(:view_recursos, project)
                  .and_return(false)
        login_as(user)
      end
      
      it 'redirige con error de autorización' do
        get :index, params: { project_id: project.id }
        
        expect(response).to redirect_to(home_url)
        expect(flash[:error]).to be_present
      end
    end
  end
  
  describe 'POST #create' do
    context 'con datos válidos' do
      before do
        login_as(user)
      end
      
      it 'crea nuevo recurso' do
        expect {
          post :create, params: {
            project_id: project.id,
            recurso: { nombre: 'Test', descripcion: 'Descripción de prueba' }
          }
        }.to change(Recurso, :count).by(1)
        
        expect(response).to redirect_to(project_recurso_path(project, Recurso.last))
        expect(flash[:notice]).to eq('Recurso creado exitosamente')
      end
    end
  end
end
```

### Tests de Modelos

```ruby
# spec/models/recurso_spec.rb
require 'rails_helper'

RSpec.describe Recurso, type: :model do
  let(:project) { create(:project) }
  let(:user) { create(:user) }
  
  describe 'validaciones' do
    it 'requiere nombre' do
      recurso = build(:recurso, nombre: nil)
      expect(recurso).not_to be_valid
      expect(recurso.errors[:nombre]).to include('no puede estar en blanco')
    end
    
    it 'requiere descripción' do
      recurso = build(:recurso, descripcion: nil)
      expect(recurso).not_to be_valid
      expect(recurso.errors[:descripcion]).to include('no puede estar en blanco')
    end
    
    it 'nombre debe ser único en el proyecto' do
      existente = create(:recurso, nombre: 'Duplicado', project: project)
      duplicado = build(:recurso, nombre: 'Duplicado', project: project)
      
      expect(duplicado).not_to be_valid
      expect(duplicado.errors[:nombre]).to include('ya está en uso')
    end
  end
  
  describe 'scopes' do
    it 'recientes devuelve ordenados por fecha descendente' do
      antiguo = create(:recurso, created_at: 1.day.ago, project: project)
      reciente = create(:recurso, created_at: 1.hour.ago, project: project)
      
      expect(Recurso.recientes).to eq([reciente, antiguo])
    end
  end
  
  describe 'métodos' do
    it 'to_s devuelve el nombre' do
      recurso = build(:recurso, nombre: 'Test')
      expect(recurso.to_s).to eq('Test')
    end
    
    it 'autor_nombre devuelve nombre del autor o Anónimo' do
      con_autor = build(:recurso, author: user)
      sin_autor = build(:recurso, author: nil)
      
      expect(con_autor.autor_nombre).to eq(user.name)
      expect(sin_autor.autor_nombre).to eq('Anónimo')
    end
  end
end
```

### Factories para Tests

```ruby
# spec/factories/recurso_factory.rb
FactoryBot.define do
  factory :recurso do
    nombre { "Reurso de prueba" }
    descripcion { "Descripción de recurso de prueba" }
    tipo { "general" }
    valor { 100.50 }
    
    association :project
    association :author, factory: :user
    
    trait :sin_nombre do
      nombre { nil }
    end
    
    trait :antiguo do
      created_at { 1.year.ago }
    end
  end
end
```

---

## Buenas Prácticas

### Principios de Diseño

1. **Principio de Responsabilidad Única**:
   - Cada clase debe tener una sola responsabilidad
   - Separar lógica de negocio de lógica de presentación

2. **Principio Abierto/Cerrado**:
   - Abierto para extensión mediante hooks
   - Cerrado para modificación controlada

3. **Principio de Sustitución de Liskov**:
   - Las clases deben poder reemplazarse sin afectar a otras

4. **Principio de Segregación de Interfaces**:
   - Interfaces específicas para diferentes propósitos
   - Dependencias sobre abstracciones, no implementaciones

### Convenciones de Nomenclatura

1. **Clases**: PascalCase (Ej: `RecursoController`)
2. **Métodos**: snake_case (Ej: `find_recurso`)
3. **Variables**: snake_case (Ej: `recurso_params`)
4. **Archivos**: snake_case (Ej: `recurso_spec.rb`)
5. **Constantes**: UPPER_SNAKE_CASE (Ej: `TIPOS_RECURSO`)

### Organización del Código

1. **MVC Estricto**:
   - Models: solo lógica de datos
   - Controllers: solo lógica de control
   - Views: solo lógica de presentación

2. **Servicios para Lógica Compleja**:
   - Crear servicios en `app/services/`
   - Mover lógica compleja fuera de controladores

3. **Concerns para Funcionalidad Compartida**:
   - Usar `concerns` para código compartido
   - Incluir en modelos según necesidad

### Manejo de Errores

1. **Validaciones en Modelos**:
   - Validar datos antes de guardar
   - Mensajes de error claros y específicos

2. **Rescate de Excepciones**:
   - Usar `begin/rescue` en controladores
   - Manejar errores específicos apropiadamente

3. **Logging Adecuado**:
   - Registrar eventos importantes
   - Incluir contexto suficiente para debugging

### Optimización de Rendimiento

1. **Consultas a Base de Datos**:
   - Usar `includes` para evitar N+1 queries
   - Crear índices para consultas frecuentes
   - Paginar resultados grandes

2. **Caching**:
   - Cachear resultados costosos
   - Invalidar caché apropiadamente

3. **Assets**:
   - Minificar CSS y JavaScript
   - Optimizar imágenes
   - Usar lazy loading para recursos grandes

---

## Integración con Core

### Patches a Modelos Core

```ruby
# lib/open_project/nombre_plugin/patches/work_package_patch.rb
module OpenProject::NombrePlugin::Patches::WorkPackagePatch
  def self.included(base)
    base.class_eval do
      has_many :recursos_personalizados,
               class_name: 'Recurso',
               foreign_key: :work_package_id,
               dependent: :destroy
      
      # Método helper
      def tiene_recursos_personalizados?
        recursos_personalizados.any?
      end
    end
  end
end

# En engine.rb
config.to_prepare do
  require_dependency 'open_project/nombre_plugin/patches/work_package_patch'
  WorkPackage.include OpenProject::NombrePlugin::Patches::WorkPackagePatch
end
```

### Integración con APIs Existentes

```ruby
# Usar servicios core
class RecursosController < ApplicationController
  def create
    @recurso = Recurso.new(recurso_params)
    
    # Usar servicio de notificaciones de OpenProject
    if @recurso.save
      NotificationService.new(
        recipient: @recurso.project.users,
        resource: @recurso,
        author: User.current
      ).call
      
      flash[:notice] = 'Recurso creado y notificado'
    else
      flash[:error] = 'Error al crear recurso'
    end
  end
end
```

### Eventos del Sistema

```ruby
# Suscribirse a eventos core
config.after_initialize do
  OpenProject::Notifications.subscribe('work_package_updated') do |payload|
    work_package = payload[:work_package]
    
    # Procesar cambios en work package
    if work_package.tiene_recursos_personalizados?
      sincronizar_recursos(work_package)
    end
  end
end
```

---

## Despliegue y Distribución

### Versionado Semántico

```ruby
# lib/open_project/nombre_plugin/version.rb
module OpenProject
  module NombrePlugin
    # Versión semántica: MAJOR.MINOR.PATCH
    VERSION = "1.2.3"
    
    # Métodos helper
    def self.version_info
      {
        major: VERSION.split('.')[0],
        minor: VERSION.split('.')[1],
        patch: VERSION.split('.')[2]
      }
    end
  end
end
```

### Changelog Automático

```markdown
# CHANGELOG.md
## [1.2.3] - 2024-11-10

### Added
- Funcionalidad de exportación a PDF
- Integración con módulo de notificaciones
- Mejoras en rendimiento de consultas

### Changed
- Refactorización del sistema de permisos
- Actualización de compatibilidad con OpenProject 13.0

### Fixed
- Error en validación de nombres duplicados
- Problema de memoria en listados grandes
- Inconsistencia en caché de permisos

### Deprecated
- Método antiguo de cálculo (usar nuevo_método)
- Opción de configuración obsoleta
```

### Publicación como Gem

```bash
# Construir gem
gem build nombre_plugin.gemspec

# Publicar en RubyGems
gem push nombre_plugin-1.2.3.gem

# Para desarrollo local
gem install --local ./nombre_plugin-1.2.3.gem
```

### Integración Continua

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        ruby-version: ['2.7', '3.0']
        openproject-version: ['13.0', '13.1']
    
    steps:
    - uses: actions/checkout@v2
    - name: Setup Ruby
      uses: ruby/setup-ruby@v1
      with:
        ruby-version: ${{ matrix.ruby-version }}
    
    - name: Install OpenProject
      run: |
        git clone https://github.com/opf/openproject.git
        cd openproject
        git checkout ${{ matrix.openproject-version }}
    
    - name: Install Dependencies
      run: |
        cd openproject
        bundle install
        echo "gem 'nombre_plugin', path: '../'" >> Gemfile.plugins
        bundle install
    
    - name: Run Tests
      run: |
        cd openproject
        bundle exec rspec ../plugin/spec
```

---

## Solución de Problemas Comunes

### Conflictos de Nombres

1. **Problema**: Conflictos con clases o métodos core
2. **Solución**: Usar namespaces específicos del plugin
3. **Ejemplo**:
   ```ruby
   module OpenProject
     module NombrePlugin
       class Recurso < ApplicationRecord  # No colisiona con core
       # ...
       end
     end
   end
   ```

### Problemas de Carga

1. **Problema**: Dependencias circulares en engine.rb
2. **Solución**: Usar `config.to_prepare` para cargar dependencias
3. **Ejemplo**:
   ```ruby
   config.to_prepare do
     require_dependency 'open_project/nombre_plugin/hooks'
   end
   ```

### Problemas de Assets

1. **Problema**: Assets no se cargan en producción
2. **Solución**: Precompilar assets correctamente
3. **Ejemplo**:
   ```ruby
   # En engine.rb
   assets %w(estilo.css icono.png script.js)
   
   # En producción
   RAILS_ENV=production bundle exec rails assets:precompile
   ```

### Problemas de Permisos

1. **Problema**: Permisos no se heredan correctamente
2. **Solución**: Definir dependencias explícitas
3. **Ejemplo**:
   ```ruby
   permission :manage_recursos,
              { recursos: %i[new create edit destroy] },
              dependencies: [:view_recursos, :edit_work_packages]
   ```

### Debugging

1. **Logs Estructurados**:
   ```ruby
   Rails.logger.info "Plugin: Recurso creado ##{recurso.id}")
   Rails.logger.debug "Params: #{recurso_params.inspect}")
   Rails.logger.error "Error: #{recurso.errors.full_messages}")
   ```

2. **Consola de Rails**:
   ```ruby
   # Para testing
   rails console
   
   # Recargar plugin en desarrollo
   reload!
   
   # Verificar rutas
   Rails.application.routes.routes.each { |route| puts route.path }
   ```

3. **Herramientas de Debug**:
   - `byebug` para debugging de Ruby
   - `binding.pry` para inspección en runtime
   - Browser DevTools para frontend Angular

---

## Conclusión

Este documento proporciona una guía completa para desarrollar plugins robustos y mantenibles para OpenProject. Siguiendo estas instrucciones y mejores prácticas, los desarrolladores podrán crear extensiones que se integren perfectamente con el ecosistema de OpenProject, proporcionando valor real a los usuarios manteniendo la calidad y compatibilidad a largo plazo.

### Recomendaciones Finales

1. **Empezar Simple**: Comenzar con funcionalidad básica y expandir gradualmente
2. **Testing Continuo**: Escribir tests junto con el código de producción
3. **Documentación**: Mantener documentación actualizada con cada cambio
4. **Comunidad**: Participar en la comunidad de OpenProject para aprender y contribuir
5. **Versionado**: Usar control de versiones semántico desde el inicio

Siguiendo estas guías, cualquier desarrollador podrá crear plugins exitosos que mejoren la experiencia de OpenProject para miles de usuarios.