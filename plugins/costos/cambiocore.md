# Cambio en Core: Exponer viewer BIM para plugin Costos

## Fecha
2026-02-20

## Objetivo
Permitir que el plugin `costos` aplique configuraciones visuales al viewer IFC (Xeokit) desde el frontend, exponiendo la instancia del viewer en `window`.

## Archivo modificado (Core)
`/opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts`

## Cambio aplicado
Agregar una línea justo después de crear el viewer:

```ts
const viewerUI = new BIMViewer(server, elements) as XeokitBimViewer;
(window as any).opXeokitViewer = viewerUI;
```

## Comando sugerido (inserción)
```bash
sudo sed -i '/const viewerUI = new BIMViewer/a\    (window as any).opXeokitViewer = viewerUI;' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

## Verificación
```bash
grep -n "opXeokitViewer" /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

## Recompilación / Reinicio
```bash
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```

## Reversión
Eliminar la línea agregada:

```bash
sudo sed -i '/opXeokitViewer/d' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

Luego recompilar/reiniciar:

```bash
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```

## Notas
- Este cambio solo expone la instancia del viewer en `window` para que el plugin pueda aplicar configuraciones.
- Si OpenProject cambia la ruta o el servicio, ajustar el path del archivo.
# Cambio en Core: Iluminación y Sombras (Xeokit)

## Fecha
2026-02-20

## Objetivo
Habilitar luces básicas y sombras en el viewer IFC (Xeokit) para poder controlar iluminación desde el plugin.

## Archivo modificado (Core)
`/opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts`

## Cambios aplicados
1) Agregar imports:
```ts
import { DirLight, AmbientLight } from '@xeokit/xeokit-sdk/dist/xeokit-sdk.es';
```

2) Agregar bloque después de crear el viewer:
```ts
const viewerUI = new BIMViewer(server, elements) as XeokitBimViewer;
(window as any).opXeokitViewer = viewerUI;

const scene = viewerUI.viewer.scene;

// Reemplazar luces por defecto
scene.clearLights();

new AmbientLight(scene, {
  id: "ambientLight",
  color: [1, 1, 1],
  intensity: 0.35,
});

new DirLight(scene, {
  id: "sunLight",
  dir: [-0.6, -1.0, -0.4],
  color: [1, 1, 1],
  intensity: 1.0,
  space: "view",
  castsShadow: true,
});

scene.on("modelLoaded", (modelId:string) => {
  const model = scene.models[modelId];
  if (model) {
    model.castsShadow = true;
    model.receivesShadow = true;
  }
});
```

## Comandos usados (sed)
```bash
sudo sed -i '/xeokit-bim-viewer.es/a import { DirLight, AmbientLight } from '\''@xeokit/xeokit-sdk/dist/xeokit-sdk.es'\'';' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

```bash
sudo sed -i '/const viewerUI = new BIMViewer/a\
    const scene = viewerUI.viewer.scene;\
\
    // Reemplazar luces por defecto\
    scene.clearLights();\
\
    new AmbientLight(scene, {\
      id: "ambientLight",\
      color: [1, 1, 1],\
      intensity: 0.35,\
    });\
\
    new DirLight(scene, {\
      id: "sunLight",\
      dir: [-0.6, -1.0, -0.4],\
      color: [1, 1, 1],\
      intensity: 1.0,\
      space: "view",\
      castsShadow: true,\
    });\
\
    scene.on("modelLoaded", (modelId:string) => {\
      const model = scene.models[modelId];\
      if (model) {\
        model.castsShadow = true;\
        model.receivesShadow = true;\
      }\
    });\
' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

## Verificación
```bash
grep -n "DirLight\\|AmbientLight" /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
grep -n "scene.clearLights" -A20 /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

## Recompilación / Reinicio
```bash
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```

## Reversión
```bash
sudo sed -i '/DirLight/d' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
sudo sed -i '/AmbientLight/d' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
sudo sed -i '/scene.clearLights/,+21d' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

Luego recompilar/reiniciar:
```bash
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```

## Notas
- Requiere `@xeokit/xeokit-sdk` (ya presente en `frontend/node_modules`).
- Si el viewer cambia de API, ajustar el bloque de luces.
## Incidencia: IFC no cargaba por sombras
Al activar sombras (`castsShadow: true` y `model.castsShadow/receivesShadow`) el viewer dejó de renderizar el IFC con error WebGL:
`FRAGMENT varying vViewNormal does not match any VERTEX varying` y `program not valid`.

### Solución aplicada (desactivar sombras)
1) Desactivar sombras en la luz:
```bash
sudo sed -i "s/castsShadow: true/castsShadow: false/" \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

2) Eliminar el bloque que forzaba sombras en modelos:
```bash
sudo sed -i '/scene.on("modelLoaded",/,/});/d' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts
```

3) Recompilar:
```bash
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```
# Comandos rápidos (sed)
```bash
# Aplicar patch de luces (sin sombras)
sudo sed -i '/xeokit-bim-viewer.es/a import { DirLight, AmbientLight } from '\''@xeokit/xeokit-sdk/dist/xeokit-sdk.es'\'';' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts

sudo sed -i '/const viewerUI = new BIMViewer/a\
    const scene = (viewerUI as any).viewer.scene;\
\
    // Reemplazar luces por defecto\
    scene.clearLights();\
\
    new AmbientLight(scene, {\
      id: "ambientLight",\
      color: [1, 1, 1],\
      intensity: 0.35,\
    });\
\
    new DirLight(scene, {\
      id: "sunLight",\
      dir: [-0.6, -1.0, -0.4],\
      color: [1, 1, 1],\
      intensity: 1.0,\
      space: "view",\
      castsShadow: false,\
    });\
' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts

# Tipado faltante
sudo sh -c 'printf "declare module '\''@xeokit/xeokit-sdk/dist/xeokit-sdk.es'\'';\n" > /opt/openproject/frontend/src/typings/xeokit-sdk.d.ts'

# Recompilar
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```
```bash
# Exponer viewer en window (plugin)
sudo sed -i '/const viewerUI = new BIMViewer/a\    (window as any).opXeokitViewer = viewerUI;' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts

# Agregar imports para luces
sudo sed -i '/xeokit-bim-viewer.es/a import { DirLight, AmbientLight } from '\''@xeokit/xeokit-sdk/dist/xeokit-sdk.es'\'';' \
  /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts

# Insertar bloque de luces (sin sombras)
sudo sed -i '/const viewerUI = new BIMViewer/a\
    const scene = (viewerUI as any).viewer.scene;\
\
    // Reemplazar luces por defecto\
    scene.clearLights();\
\
    new AmbientLight(scene, {\
      id: "ambientLight",\
      color: [1, 1, 1],\
      intensity: 0.35,\
    });\
\
    new DirLight(scene, {\
      id: "sunLight",\
      dir: [-0.6, -1.0, -0.4],\
      color: [1, 1, 1],\
      intensity: 1.0,\
      space: "view",\
      castsShadow: false,\
    });\
' /opt/openproject/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts

# Tipado faltante para xeokit-sdk
sudo sh -c 'printf "declare module '\''@xeokit/xeokit-sdk/dist/xeokit-sdk.es'\'';\n" > /opt/openproject/frontend/src/typings/xeokit-sdk.d.ts'
```
# Cambio en Core: Embed público IFC (sin login)

## Fecha
2026-02-20

## Objetivo
Permitir que los enlaces de embebido del viewer IFC funcionen sin sesión activa. Esto habilita el acceso público a los archivos `.ifc`, `.xkt` y metadata (`model_ifcopenshell.json`) solo para el viewer embebido.

## Archivos modificados (Core)
- `/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb`
- `/opt/openproject/app/models/attachment.rb`

## Cambios aplicados
1) Bypass de autorización en el viewer cuando viene `?embed=true`:
```rb
before_action :authorize, unless: :embed_request?

def embed_request?
  value = params[:embed].to_s
  value == "true" || value == "1"
end
```

2) Permitir lectura pública de adjuntos IFC/XKT/metadata para usuario anónimo:
```rb
def visible?(user = User.current)
  return true if public_ifc_attachment?(user)

  allowed_or_author?(user) do
    container.attachments_visible?(user)
  end
end

def public_ifc_attachment?(user)
  return false unless user.nil? || (user.respond_to?(:anonymous?) && user.anonymous?)
  return false unless container_type == "Bim::IfcModels::IfcModel"

  desc = description.to_s
  return true if desc == "ifc" || desc == "xkt" || desc == "ifc_meta_ifcopenshell"

  filename = file.to_s.downcase
  return false if filename.empty?

  filename.end_with?(".ifc") || filename.end_with?(".xkt") || filename.end_with?("model_ifcopenshell.json")
end
```

## Comandos sugeridos
```bash
# ifc_viewer_controller: habilitar embed sin auth
sudo python3 - <<'PY'
from pathlib import Path
path = Path("/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb")
text = path.read_text()
text = text.replace("before_action :authorize\n", "before_action :authorize, unless: :embed_request?\n")
if "def embed_request?" not in text:
    text = text.replace(
        "  private\n",
        "  private\n\n"
        "    def embed_request?\n"
        "      value = params[:embed].to_s\n"
        "      value == \"true\" || value == \"1\"\n"
        "    end\n"
    )
path.write_text(text)
PY

# attachment.rb: permitir lectura pública de IFC/XKT/metadata
sudo python3 - <<'PY'
from pathlib import Path
path = Path("/opt/openproject/app/models/attachment.rb")
text = path.read_text()
target = """  def visible?(user = User.current)
    allowed_or_author?(user) do
      container.attachments_visible?(user)
    end
  end
"""
replacement = """  def visible?(user = User.current)
    return true if public_ifc_attachment?(user)

    allowed_or_author?(user) do
      container.attachments_visible?(user)
    end
  end

  def public_ifc_attachment?(user)
    return false unless user.nil? || (user.respond_to?(:anonymous?) && user.anonymous?)
    return false unless container_type == "Bim::IfcModels::IfcModel"

    desc = description.to_s
    return true if desc == "ifc" || desc == "xkt" || desc == "ifc_meta_ifcopenshell"

    filename = file.to_s.downcase
    return false if filename.empty?

    filename.end_with?(".ifc") || filename.end_with?(".xkt") || filename.end_with?("model_ifcopenshell.json")
  end
"""
if target not in text:
    raise SystemExit("Expected Attachment#visible? block not found")
path.write_text(text.replace(target, replacement))
PY
```

## Verificación
```bash
grep -n "embed_request?" /opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb
grep -n "public_ifc_attachment" /opt/openproject/app/models/attachment.rb
```

## Recompilación / Reinicio
```bash
sudo systemctl restart openproject
```

## Reversión
Restaurar el comportamiento original eliminando el método `embed_request?`, devolviendo `before_action :authorize` sin `unless`, y quitando `public_ifc_attachment?` junto con el `return true` en `visible?`.

## Notas
- Este cambio expone únicamente adjuntos IFC/XKT/metadata del container `Bim::IfcModels::IfcModel` para usuarios anónimos.
- La URL de embebido debe incluir `?embed=true`.

# Cambio en Core: Acceso por token de publicacion IFC

## Fecha
2026-02-20

## Objetivo
Permitir acceso al viewer IFC con `share_token` sin hacer publico el proyecto, para enlaces compartidos del modelo.

## Archivo modificado (Core)
`/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb`

## Cambios aplicados
1) Bypass de autorizacion cuando el token es valido:
```rb
skip_before_action :authorize, if: :public_share_token_valid?
```

2) Validacion del token:
```rb
def public_share_token_valid?
  token = params[:share_token].to_s
  return false if token.empty?

  model = ::Bim::IfcModels::IfcModel.find_by(public_share_token: token, public_share_enabled: true)
  return false unless model
  return false unless @project && model.project_id == @project.id

  ids = []
  if params[:models]
    begin
      ids = JSON.parse(params[:models])
    rescue StandardError
      ids = []
    end
  end
  ids = Array(ids).map { |val| val.to_i }
  ids.include?(model.id)
end
```

## Verificacion
```bash
grep -n "public_share_token_valid" /opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb
```

## Nota de seguridad (adjuntos IFC)
El acceso anonimo a adjuntos IFC/XKT/metadata se limita a modelos con `public_share_enabled = true`.

Requiere que el patch en `attachment.rb` valide:
```rb
return false unless container.respond_to?(:public_share_enabled?) && container.public_share_enabled?
```

# Cambio en Core: Share público IFC sin sesión (API + Frontend)

## Fecha
2026-02-20

## Objetivo
Permitir abrir el viewer IFC desde un link público con `share_token` sin login, evitando además llamadas de BCF/WP que generan `404` (`/api/v3/queries/default` y `/api/v3/ifc_models`) durante el embed público.

## Archivos modificados (Core)
- `/opt/openproject/lib/api/root_api.rb`
- `/opt/openproject/plugins/costos/app/controllers/costos/ifc_public_controller.rb`
- `/opt/openproject/modules/bim/app/controllers/bim/ifc_models/ifc_viewer_controller.rb`
- `/opt/openproject/frontend/src/app/features/work-packages/routing/partitioned-query-space-page/partitioned-query-space-page.component.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/bcf-view.service.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/pages/viewer/ifc-viewer-page.component.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/list/bcf-list.component.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.ts`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/left/bcf-split-left.component.html`
- `/opt/openproject/frontend/src/app/features/bim/ifc_models/bcf/split/right/bcf-split-right.component.html`
- `/opt/openproject/plugins/costos/app/assets/javascripts/costos/ifc.js`

## Cambios aplicados (resumen)
1) **API:** bypass autenticación cuando existe `share_token` válido (param/cookie/referer) en `lib/api/root_api.rb` y logs `[IFC_PUBLIC][API]`.
2) **Cookie:** seteo de `ifc_share_token` en `Costos::IfcPublicController#show`.
3) **Frontend:** desactivar carga de queries/BCF en modo share:
   - Evitar `ngOnInit` de particionado y `BCF list` en modo share.
   - Forzar vista `viewer` en `BcfViewService`.
   - Ocultar toolbar BCF en `IFCViewerPageComponent`.
   - En split templates, ocultar `<op-bcf-list>` si hay `share_token`.
4) **JS plugin:** evitar llamadas a `/api/v3/ifc_models` cuando hay `share_token`.

## Señal de modo público (frontend)
Se detecta con:
```ts
const params = new URLSearchParams(window.location.search || '');
params.has('share_token')
```

## Verificación
```bash
sudo bash /opt/openproject/plugins/costos/scripts/verify_core_patch.sh
```

## Recompilación / Reinicio
```bash
sudo openproject run rake assets:clobber
sudo openproject run rake assets:precompile
sudo systemctl restart openproject
```

## Notas
- Si se recompila y falla con error de plantilla `isIfcPublicShare`, verificar que los métodos existan en:
  - `bcf-split-left.component.ts`
  - `bcf-split-right.component.ts`
- La solución definitiva es usar el `apply_core_patch.sh` actualizado en todos los servidores.
