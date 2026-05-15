# subida-nexcloud-seleccionar-ubica

Objetivo: documentar el flujo de seleccion de ubicacion y la subida de archivos a Nextcloud en OpenProject, con detalle paso a paso y los puntos exactos donde se arma el payload.

## 1) Seleccionar archivo y abrir modal de ubicacion

Entrada del flujo (boton Subir archivo):
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`
  - `triggerFileInput()` abre el explorador (`filePicker.nativeElement.click()`).
  - `onFilePickerChanged()` lee el archivo seleccionado y llama `storageFileUpload(file)`.

Modal de ubicacion:
- Template: `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.html`

Comportamiento linea por linea (funcional) al hacer click en:
`<button data-test-selector="op-files-picker-modal--confirm">Seleccionar ubicacion</button>`

1. El boton llama a `chooseLocation()` por `(click)="chooseLocation()"`.
2. `chooseLocation()` marca `this.submitted = true`.
3. `chooseLocation()` ejecuta `this.service.close()` para cerrar el modal.
4. El modal se cierra sin enviar datos por si mismo.
5. El caller espera `closingEvent` y filtra `submitted`.
6. La ubicacion seleccionada es el directorio actual cargado en `currentDirectory`.

Codigo relevante:
- `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.ts`
  - `chooseLocation()` solo marca estado y cierra el modal.
- `frontend/src/app/shared/components/storages/file-picker-base-modal/file-picker-base-modal.component.ts`
  - `currentDirectory` es el folder actual que el usuario esta viendo.
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`
  - `selectUploadLocation(...)` consume el resultado del modal.
  - `storageFileUpload(file)` encadena `selectUploadLocation(...)` -> conflictos -> upload.

Notas:
- El boton solo se habilita si `currentDirectory.permissions` incluye `writeable`.
- La ubicacion inicial depende de `projectFolderMode` y `projectFolderHref`.

## 2) Flujo de subida a Nextcloud (prepare_upload + direct upload)

### 2.1 Frontend prepara el upload (prepare_upload)
1. El frontend construye un payload con:
   - `projectId`
   - `fileName`
   - `parent` (ubicacion / folder id)
2. Hace `POST /api/v3/storages/:id/files/prepare_upload`.

Codigo:
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`
  - `uploadResourceLink(storage, fileName, location)` arma el payload:
```
payload: {
  projectId: link[0].payload.projectId,
  parent: location,
  fileName,
}
```
- `frontend/src/app/core/state/storage-files/storage-files.service.ts`
  - `uploadLink(link)` ejecuta el request HTTP del prepare_upload.

### 2.2 Backend valida y solicita upload link
1. `StorageFilesAPI#prepare_upload` lee el body.
2. `validate_upload_request` exige `{ projectId, fileName, parent }`.
3. Verifica permiso `manage_file_links` en el proyecto.
4. Llama a `Storages::UploadLinkService`.

Codigo:
- `modules/storages/lib/api/v3/storage_files/storage_files_api.rb`
- `modules/storages/app/services/storages/upload_link_service.rb`

### 2.3 Adapter Nextcloud genera token
1. El adapter hace `POST` a:
   - `index.php/apps/integration_openproject/direct-upload-token`
2. Envia `folder_id` en el body.
3. Si responde 2xx, devuelve un token.
4. Se construye el `destination`:
   - `index.php/apps/integration_openproject/direct-upload/<token>`
5. Metodo de upload = `POST`.

Codigo:
- `modules/storages/app/common/storages/adapters/providers/nextcloud/queries/upload_link_query.rb`

### 2.4 Subida directa (direct upload)
1. El frontend usa el `destination` recibido.
2. Envia el archivo en `multipart/form-data` con `POST`.
3. Nextcloud recibe el archivo y lo guarda en el folder indicado.

Punto exacto donde se arma el payload de subida:
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`
  - `uploadAndNotify(link, file, location, overwrite)`:
```
const uploadFiles = [{
  file,
  location: location ?? undefined,
  overwrite: overwrite ?? undefined,
}];
```
  - Ese `uploadFiles` se pasa a:
```
this.uploadService.upload(href, uploadFiles)
```

### 2.5 Creacion del file link en OpenProject
1. Tras la subida, OpenProject crea el link local.
2. Esto enlaza el archivo de Nextcloud al Work Package.

## Archivos clave
- `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.html`
- `frontend/src/app/shared/components/storages/location-picker-modal/location-picker-modal.component.ts`
- `frontend/src/app/shared/components/storages/file-picker-base-modal/file-picker-base-modal.component.ts`
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`
- `frontend/src/app/core/state/storage-files/storage-files.service.ts`
- `modules/storages/lib/api/v3/storage_files/storage_files_api.rb`
- `modules/storages/app/services/storages/upload_link_service.rb`
- `modules/storages/app/common/storages/adapters/providers/nextcloud/queries/upload_link_query.rb`
