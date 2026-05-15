# Lógica para integrar CKEditor mediante un plugin de OpenProject

Esta guía resume los pasos necesarios para extender CKEditor en OpenProject desde un plugin Ruby, sin modificar el core. Sigue el flujo para preparar el plugin, enlazar el frontend Angular y registrar tus mejoras en el bundle de CKEditor.

## 1. Prerrequisitos

- Entorno de desarrollo del core configurado (ver `docs/development/create-openproject-plugin/README.md`).
- Node/NPM disponibles para el frontend (`npm run serve`).
- Conocimiento básico de Rails engines y Angular.

## 2. Flujo general

1. Generar o clonar el plugin (por ejemplo, basándose en `openproject-proto_plugin`).
2. Registrar el plugin en `Gemfile.plugins` dentro del bloque `:opf_plugins`.
3. Ejecutar `bundle install` y `./bin/setup_dev` para crear los symlinks del frontend bajo `frontend/src/app/features/plugins/linked/<tu-plugin>`.
4. Implementar la lógica Ruby (menus, hooks, seeds) desde `lib/open_project/<tu_plugin>/engine.rb`.
5. Añadir los componentes/servicios Angular necesarios en el directorio linkeado del frontend.
6. Extender CKEditor:
   - Si basta con lógica Angular, usa los servicios existentes (`CKEditorSetupService`, `OpCkeditorComponent`) para inyectar tu funcionalidad.
   - Si necesitas un plugin CKEditor puro, modifica el bundle `frontend/src/vendor/ckeditor/ckeditor.js` (recompilado desde `opf/commonmark-ckeditor-build`) y copia la versión nueva al core.
   - Para extensiones ligeras (como el botón IA), puedes inyectar JS/CSS desde tu plugin. Carga los assets a través de un hook (por ejemplo, `_floating_button.html.erb`) usando `javascript_include_tag ... nonce: content_security_policy_script_nonce` y asegúrate de que tu script reintente la búsqueda del toolbar hasta que CKEditor termine de inicializar.
7. Verificar la instalación en `/admin/plugins` y probar en un formulario real (por ejemplo, edición de un work package).

## 3. Preparar el plugin Ruby

```bash
bundle exec rails generate open_project:plugin openproject-ckeditor_ext ../plugins/
cd ../plugins/openproject-ckeditor_ext
```

Actualiza el `*.gemspec` y cualquier metadata necesaria. Después, añade en `Gemfile.plugins`:

```ruby
group :opf_plugins do
  gem 'openproject-ckeditor_ext', path: '../plugins/openproject-ckeditor_ext'
end
```

Desde la raíz del core:

```bash
bundle install
./bin/setup_dev
```

`setup_dev` se encargará de:

- Registrar el plugin en bundler.
- Crear el symlink `frontend/src/app/features/plugins/linked/openproject-ckeditor_ext`.
- Copiar (si existe) `frontend/module/*` del plugin al core.

## 4. Integración frontend

Dentro de `frontend/src/app/features/plugins/linked/openproject-ckeditor_ext` (symlink al plugin), crea tu módulo Angular (`module/main.ts`) y cualquier servicio/componente.

Puntos clave:

- `core-app/` es un alias definido en `tsconfig.base.json`, úsalo para importar servicios del core.
- El servicio `CKEditorSetupService` (`frontend/src/app/shared/components/editor/components/ckeditor/ckeditor-setup.service.ts`) es la puerta para personalizar la configuración del editor: `createConfig`, `createContext` y `createWatchdog`.
- El componente `OpCkeditorComponent` (`frontend/src/app/shared/components/editor/components/ckeditor/op-ckeditor.component.ts`) expone eventos (`contentChanged`, `saveRequested`, etc.) y la instancia `watchdog`. Tus componentes pueden suscribirse o envolver estos eventos.
- `CkeditorAugmentedTextareaComponent` (`frontend/src/app/shared/components/editor/components/ckeditor-augmented-textarea/ckeditor-augmented-textarea.component.ts`) construye el `ICKEditorContext`. Si necesitas parámetros adicionales, crea un servicio/Directive en tu plugin que actualice el contexto antes de inicializar el editor.

## 5. Extender el bundle de CKEditor

OpenProject empaqueta un build específico en `frontend/src/vendor/ckeditor/ckeditor.js`. Ese archivo proviene del repo https://github.com/opf/commonmark-ckeditor-build.

Para añadir plugins CKEditor nativos:

1. Clona el repo `commonmark-ckeditor-build`.
2. Registra tu plugin dentro de `packages/ckeditor/src/op-config-customizer.js` y las configuraciones necesarias (schema, toolbar, conversiones, etc.).
3. Ejecuta el build (por ejemplo `yarn build` o `yarn build:production` según el README del repo).
4. Copia el nuevo `build/ckeditor.js` y las traducciones necesarias a `frontend/src/vendor/ckeditor/`.
5. Ejecuta `npm run serve` en el core para validar que el bundle carga.

Si el plugin necesita comunicación con el backend, expón los datos mediante `window.OpenProject.pluginContext` o añade endpoints Rails desde tu engine.

## 6. Hooks y servicios útiles del core

- `OpenProject::Menu` y `OpenProject::Static::Homescreen` para añadir UI en Rails (`lib/open_project/<tu_plugin>/engine.rb`).
- `OpenProject::Notifications` si necesitas reaccionar a eventos (ver el README de `openproject-proto_plugin` para ejemplos).
- `window.OpenProject.pluginContext` (definido en el bootstrap Angular) puede transportar flags hacia CKEditor mediante `CKEditorSetupService#createContext`.

## 7. Flujo de prueba recomendado

1. `bundle exec rails server` (core).
2. `npm run serve` (core frontend).
3. Asegúrate de que el plugin aparece en `/admin/plugins`.
4. Abre un formulario con CKEditor (ej: descripción de Work Package) y verifica:
   - Que las modificaciones del bundle (botones, atributos) existen.
   - Que los servicios Angular de tu plugin se ejecutan (usar `console.log` o notificaciones).
5. Añade specs o tests manuales según corresponda.

## 8. Prompt sugerido para estudiar y documentar la lógica

Puedes reutilizar el siguiente prompt para repasar o delegar los pasos anteriores:

```
Objetivo: Extender CKEditor mediante un plugin Ruby en OpenProject.

1. Lee logicaCKEditor.md y resume el flujo completo (plugin Ruby + bundle CKEditor).
2. Verifica la existencia de los archivos clave:
   - docs/development/create-openproject-plugin/README.md
   - frontend/src/app/shared/components/editor/components/ckeditor/ckeditor-setup.service.ts
   - frontend/src/app/shared/components/editor/components/ckeditor/op-ckeditor.component.ts
   - frontend/src/vendor/ckeditor/ckeditor.js
3. Genera o clona el plugin indicado y regístralo en Gemfile.plugins.
4. Ejecuta bundle install y ./bin/setup_dev; confirma que aparece el symlink en frontend/src/app/features/plugins/linked.
5. Define qué parte del build (bundle CKEditor vs. integración Angular) requiere cambios y describe exactamente dónde aplicar cada mejora.
6. Documenta cualquier ajuste adicional directamente en logicaCKEditor.md para mantener la guía actualizada.
```

Con esta guía tienes un punto centralizado para preparar, extender y verificar cualquier mejora a CKEditor desde un plugin Ruby.
