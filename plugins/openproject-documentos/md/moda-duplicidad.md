# moda-duplicidad

Objetivo: documentar el modal de duplicidad (upload conflict), su estructura y el flujo completo de uso, incluyendo el punto exacto donde se arma el payload del upload.

## 1) Estructura del modal de duplicidad

Template:
- `frontend/src/app/shared/components/storages/upload-conflict-modal/upload-conflict-modal.component.html`

Estructura HTML:
- Contenedor:
  - `<div class="spot-modal">`
- Header:
  - `.spot-modal--header`
  - `#spotModalTitle` (titulo)
- Body:
  - `.spot-modal--body.spot-container`
  - texto: "archivo ya existe" con el nombre del archivo
- Action bar:
  - `.spot-action-bar`
  - Botones:
    - Cancelar
    - Mantener ambos
    - Reemplazar

Componente:
- `frontend/src/app/shared/components/storages/upload-conflict-modal/upload-conflict-modal.component.ts`

## 2) Flujo de duplicidad (paso a paso)

Entrada principal:
- `StorageComponent#storageFileUpload(file)`
  - `frontend/src/app/shared/components/storages/storage/storage.component.ts`

Pasos:
1) `storageFileUpload(file)` llama:
   - `selectUploadLocation(storage)` (elige carpeta)
   - `resolveUploadConflicts(file, files, location)` (detecta duplicado)
2) `resolveUploadConflicts(...)` compara:
   - `storageFiles.find((f) => f.name === file.name)`
3) Si NO hay conflicto:
   - retorna `{ file, location, overwrite: null }`.
4) Si hay conflicto:
   - abre el modal `UploadConflictModalComponent` con `{ fileName: file.name }`.
   - espera `closingEvent`.
   - filtra `overwrite !== null`.
   - retorna `{ file, location, overwrite }`.

## 3) Comportamiento del modal (linea por linea funcional)

En el componente:
- `overwrite` inicia en `null`.
- `close(false)`:
  - `overwrite = false`
  - `service.close()`
- `close(true)`:
  - `overwrite = true`
  - `service.close()`

En el template:
- `Cancelar` -> `(click)="closeMe()"`
- `Mantener ambos` -> `(click)="close(false)"`
- `Reemplazar` -> `(click)="close(true)"`

## 4) Punto exacto donde se arma el payload de upload

El payload se arma dentro de `uploadAndNotify(...)`:
- Archivo: `frontend/src/app/shared/components/storages/storage/storage.component.ts`
- Funcion: `uploadAndNotify(link, file, location, overwrite)`

Linea funcional exacta:
```
const uploadFiles:IUploadFile[] = [{
  file,
  location: location ?? undefined,
  overwrite: overwrite ?? undefined
}];
```

Ese `uploadFiles` se pasa a:
```
this.uploadService.upload<IStorageFileUploadResponse>(href, uploadFiles)
```

De ahi sale el request real al `destination` del upload link.

## 5) Flujo completo: conflicto -> upload -> file link

1) Detecta duplicado -> abre modal.
2) Usuario decide overwrite (true/false).
3) Se prepara upload link (prepare_upload).
4) Se arma payload con `overwrite`.
5) Se sube a Nextcloud usando el upload link.
6) Se crea el file_link en OpenProject.

Archivos clave:
- `frontend/src/app/shared/components/storages/upload-conflict-modal/upload-conflict-modal.component.ts`
- `frontend/src/app/shared/components/storages/upload-conflict-modal/upload-conflict-modal.component.html`
- `frontend/src/app/shared/components/storages/storage/storage.component.ts`

