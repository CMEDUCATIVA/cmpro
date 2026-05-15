# agregar-estructura-en-el-seleccionar-de-ubicacion

Objetivo: describir la estructura del modal "seleccionar ubicacion" y donde enganchar UI extra.

## Estructura del modal (selector de ubicacion)

El modal de seleccion de ubicacion vive en el core de OpenProject (Storages) y se renderiza con esta estructura base:

- Contenedor principal:
  - `<div data-test-selector="op-files-picker-modal" class="spot-modal op-file-picker">`
- Header:
  - `.spot-modal--header`
  - `#spotModalTitle` (titulo del modal)
- Body:
  - `.spot-modal--body.spot-container.op-file-picker--modal-body`
  - Aqui se renderiza el listado de carpetas/archivos y breadcrumbs.
- Action bar (footer):
  - `.spot-action-bar`
  - Botones de "Nueva carpeta", "Cancelar" y "Elegir ubicacion"

Referencia del template en core:
- `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.html`

## Como se carga el contenido (flujo)

1) El modal se inicializa con `LocationPickerModalComponent` (Angular).
2) La lista de archivos se obtiene via `StorageFilesResourceService.files(...)`.
3) La ubicacion inicial depende de `projectFolderMode` y `projectFolderHref`.
4) El boton "Elegir ubicacion" solo se habilita si la carpeta actual tiene permiso `writeable`.

Archivos clave en core:
- `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.ts`
- `frontend/src/app/shared/components/storages/file-picker-base-modal/file-picker-base-modal.component.ts`
- `frontend/src/app/core/state/storage-files/storage-files.service.ts`

## Donde insertar UI adicional (plugin Documentos)

En este plugin, la inyeccion del UI se hace desde JS en runtime.
Para agregar un bloque extra en el modal de seleccionar ubicacion:

1) Buscar el modal por selector:
   - `.op-file-picker` o `[data-test-selector="op-files-picker-modal"]`
2) Elegir el contenedor donde insertar:
   - **Recomendado**: `.spot-action-bar` (footer)
   - **Alternativa**: `.spot-modal--body` (antes del listado)

Ejemplo (pseudo):
```
const modal = document.querySelector('.op-file-picker, [data-test-selector="op-files-picker-modal"]');
const actionBar = modal.querySelector('.spot-action-bar');
// insertar aqui el bloque extra
```

## Notas de compatibilidad

- La estructura es compartida por:
  - File picker (seleccion de archivos)
  - Location picker (seleccion de ubicacion)
- Asegura que los selectores no dependan de un solo ID si el core cambia.
- Evita duplicados: agrega un data-flag en el nodo insertado.

