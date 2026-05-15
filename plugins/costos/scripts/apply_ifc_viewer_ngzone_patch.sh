#!/usr/bin/env bash
set -euo pipefail

CORE_ROOT="${1:-/opt/openproject}"
TARGET_FILE="$CORE_ROOT/frontend/src/app/features/bim/ifc_models/ifc-viewer/ifc-viewer.service.ts"

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "[costos] No existe el archivo objetivo: $TARGET_FILE" >&2
  exit 1
fi

echo "[costos] Aplicando patch NgZone al IFC viewer: $TARGET_FILE"

python3 - "$TARGET_FILE" <<'PY'
from pathlib import Path
import sys
import re
import os

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
original = text
enable_interaction_core_perf = os.environ.get("COSTOS_IFC_CORE_PERF", "0") == "1"
print(f"[costos] interaction_core_perf={'ON' if enable_interaction_core_perf else 'OFF'}")

old_import = "import { Injectable, Injector } from '@angular/core';"
new_import = "import { Injectable, Injector, NgZone } from '@angular/core';"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    print("[costos] No se pudo localizar el import esperado de @angular/core", file=sys.stderr)
    raise SystemExit(1)

broken_ctor = """  constructor(
    readonly injector:Injector,
    readonly ngZone:NgZone,
  ) {
    super(injector);
  }
"""
broken_ctor_inline = """  constructor(readonly injector:Injector, readonly ngZone:NgZone) {
    super(injector);
  }
"""
fixed_ctor = """  constructor(readonly injector:Injector) {
    super(injector);
  }
"""
if broken_ctor in text:
    text = text.replace(broken_ctor, fixed_ctor, 1)
if broken_ctor_inline in text:
    text = text.replace(broken_ctor_inline, fixed_ctor, 1)

inject_field = "  @InjectField() ngZone:NgZone;\n"
anchor = "  @InjectField() httpClient:HttpClient;\n"
if inject_field not in text:
    if anchor in text:
        text = text.replace(anchor, anchor + "\n" + inject_field, 1)
    else:
        print("[costos] No se pudo localizar el bloque de InjectField esperado", file=sys.stderr)
        raise SystemExit(1)

if fixed_ctor not in text:
    print("[costos] No se pudo localizar el constructor esperado", file=sys.stderr)
    raise SystemExit(1)

method_start = text.find("  public newViewer(elements:XeokitElements, projects:IfcProjectDefinition[]):void {")
if method_start == -1:
    print("[costos] No se pudo localizar el metodo newViewer", file=sys.stderr)
    raise SystemExit(1)

brace_start = text.find("{", method_start)
depth = 0
method_end = -1
for idx in range(brace_start, len(text)):
    ch = text[idx]
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            method_end = idx
            break

if method_end == -1:
    print("[costos] No se pudo determinar el final del metodo newViewer", file=sys.stderr)
    raise SystemExit(1)

method_text = text[method_start:method_end + 1]

if "this.ngZone.runOutsideAngular(() => {" not in method_text:
    server_match = re.search(r"^(\s*const server = new XeokitServer\([^\n]+\);\s*)$", method_text, re.M)
    if not server_match:
        print("[costos] No se pudo localizar la inicializacion de XeokitServer", file=sys.stderr)
        raise SystemExit(1)

    server_line = server_match.group(1)
    method_text = method_text.replace(
        server_line,
        server_line + "\n\n    this.ngZone.runOutsideAngular(() => {",
        1
    )

    if "    this.viewer = viewerUI;" not in method_text:
        print("[costos] No se pudo localizar la asignacion this.viewer = viewerUI", file=sys.stderr)
        raise SystemExit(1)

    method_text = method_text.replace(
        "    this.viewer = viewerUI;",
        "      this.viewer = viewerUI;",
        1
    )
    method_text = method_text[:-2] + "\n    });\n  }"

perf_block = """    const perfState = ((window as any).__costosIfcViewerPerf ||= {
      lastLoadProjectId: null,
      lastLoadProjectAt: 0,
      lastViewpointSig: null,
      lastViewpointAt: 0,
      modelLoadStartedAt: 0,
    });

    const originalLoadProject = viewerUI.loadProject.bind(viewerUI);
    viewerUI.loadProject = ((projectId:string) => {
      const now = Date.now();
      const normalizedProjectId = String(projectId || '');
      perfState.lastLoadProjectId = normalizedProjectId;
      perfState.lastLoadProjectAt = now;
      perfState.modelLoadStartedAt = now;
      originalLoadProject(projectId);
    }) as typeof viewerUI.loadProject;

    const originalLoadBCFViewpoint = viewerUI.loadBCFViewpoint.bind(viewerUI);
    viewerUI.loadBCFViewpoint = ((bcfViewpoint:BcfViewpointData, options:BCFLoadOptions) => {
      const now = Date.now();
      let signature = '';
      try {
        signature = String((bcfViewpoint as any)?.guid || (bcfViewpoint as any)?.uuid || JSON.stringify(bcfViewpoint || {}).slice(0, 500));
      } catch (e) {
        signature = '';
      }
      if (signature && perfState.lastViewpointSig === signature && now - perfState.lastViewpointAt < 1500) {
        return;
      }
      perfState.lastViewpointSig = signature;
      perfState.lastViewpointAt = now;
      originalLoadBCFViewpoint(bcfViewpoint, options);
    }) as typeof viewerUI.loadBCFViewpoint;
"""

interaction_core_block = """    // costos_ifc_interaction_core_start
    const interactionCorePerfState = ((window as any).__costosIfcViewerInteractionCore ||= {
      lastInputType: '',
      lastInputAt: 0,
      recentInputs: [] as Array<{ at:number; type:string; tag:string|null; className:string; key:string|null }>,
      lastMethodLogAt: {} as Record<string, number>,
      frame: {
        id: 0,
        current: null as null | {
          id:number;
          startedAt:number;
          inputType:string|null;
          totalMs:number;
          phases:Record<string, number>;
          labels:Record<string, number>;
        },
        maxTotalMs: 0,
        maxInputType: null as string | null,
        maxPhases: {} as Record<string, number>,
        maxLabels: {} as Record<string, number>,
        lastSummaryAt: 0,
      },
      frameFlow: {
        lastRafGapMs: 0,
        lastTickGapMs: 0,
        lastFrameTotalMs: 0,
        maxFrameTotalMs: 0,
        maxRafGapMs: 0,
        maxTickGapMs: 0,
        slowCount: 0,
        lastSummaryAt: 0,
      },
      raf: {
        lastAt: 0,
        maxGapMs: 0,
        slowCount: 0,
        lastSummaryAt: 0,
        started: false,
      },
      tick: {
        lastAt: 0,
        slowCount: 0,
        maxGapMs: 0,
        lastSummaryAt: 0,
      },
    });

    const viewerCore = (viewerUI as any).viewer;
    const interactionCanvas = ((viewerCore || {}).canvas || {}).canvas as HTMLElement | undefined ||
      document.querySelector('.op-ifc-viewer--model-canvas') as HTMLElement | null ||
      document.querySelector('canvas') as HTMLElement | null;

    const emitInteractionPerf = (kind:string, payload:any) => {
      const detail = {
        kind,
        ...payload,
      };
      try {
        window.dispatchEvent(new CustomEvent('costos:ifc-core-interaction-perf', { detail }));
      } catch (e) {
        // ignore
      }
    };

    const summarizeInteractionTarget = (target:any) => ({
      tag: target && target.tagName ? target.tagName : null,
      className: String(target && target.className ? target.className : '').slice(0, 140),
    });

    const safeNumber = (value:any) => typeof value === 'number' && isFinite(value) ? Math.round(value * 100) / 100 : null;

    const collectTickState = () => {
      const sceneAny = scene as any;
      const viewerAny = viewerCore as any;
      const cameraControl = (viewerAny || {}).cameraControl || {};
      const camera = (viewerAny || {}).camera || (sceneAny || {}).camera || {};
      const canvasRef = ((viewerAny || {}).canvas || (sceneAny || {}).canvas || {}) as any;
      let objectCount = null;
      let visibleObjectCount = null;
      let sectionPlaneCount = null;
      let lightsCount = null;
      try {
        if (sceneAny && sceneAny.objects) {
          const objectKeys = Object.keys(sceneAny.objects);
          objectCount = objectKeys.length;
          visibleObjectCount = objectKeys.reduce((count:number, id:string) => {
            const object = sceneAny.objects[id];
            return count + (object && object.visible !== false ? 1 : 0);
          }, 0);
        }
      } catch (e) {
        // ignore
      }
      try {
        if (sceneAny && sceneAny.sectionPlanes) {
          sectionPlaneCount = Object.keys(sceneAny.sectionPlanes).length;
        }
      } catch (e) {
        // ignore
      }
      try {
        if (sceneAny && sceneAny.lights) {
          lightsCount = Object.keys(sceneAny.lights).length;
        }
      } catch (e) {
        // ignore
      }
      return {
        objectCount,
        visibleObjectCount,
        sectionPlaneCount,
        lightsCount,
        cameraControl: {
          active: !!cameraControl.active,
          pointerEnabled: cameraControl.pointerEnabled !== false,
          pivoting: !!cameraControl.pivoting,
          rotating: !!cameraControl.rotating,
          panning: !!cameraControl.panning,
          dollying: !!cameraControl.dollying,
        },
        camera: {
          eye: camera.eye ? (camera.eye as any[]).slice(0, 3).map(safeNumber) : null,
          look: camera.look ? (camera.look as any[]).slice(0, 3).map(safeNumber) : null,
          up: camera.up ? (camera.up as any[]).slice(0, 3).map(safeNumber) : null,
          projection: camera.projection || null,
        },
        canvas: {
          width: canvasRef && canvasRef.canvas ? canvasRef.canvas.width : (canvasRef && canvasRef.width) || null,
          height: canvasRef && canvasRef.canvas ? canvasRef.canvas.height : (canvasRef && canvasRef.height) || null,
          clientWidth: canvasRef && canvasRef.canvas ? canvasRef.canvas.clientWidth : null,
          clientHeight: canvasRef && canvasRef.canvas ? canvasRef.canvas.clientHeight : null,
          resolutionScale: safeNumber((canvasRef && (canvasRef.resolutionScale || canvasRef.scale || canvasRef._resolutionScale)) || null),
        },
        saoEnabled: !!(sceneAny && sceneAny.sao && sceneAny.sao.enabled),
        pbrEnabled: !!(viewerAny && viewerAny.pbrEnabled),
        edgeMaterial: !!(sceneAny && sceneAny.edgeMaterial && sceneAny.edgeMaterial.edges),
        xrayMaterial: !!(sceneAny && sceneAny.xrayMaterial && (sceneAny.xrayMaterial.fill || sceneAny.xrayMaterial.edges)),
      };
    };

    const classifyInteractionLabel = (label:string) => {
      if (label.indexOf('pick') !== -1) return 'pick';
      if (label.indexOf('camera') !== -1) return 'camera';
      if (label.indexOf('render') !== -1 || label.indexOf('renderer') !== -1) return 'render';
      if (label.indexOf('tick') !== -1 || label.indexOf('scene.') !== -1) return 'scene';
      return 'other';
    };

    const recordInteractionPhase = (label:string, durationMs:number) => {
      const frame = interactionCorePerfState.frame.current;
      const sinceInputMs = interactionCorePerfState.lastInputAt ? Date.now() - interactionCorePerfState.lastInputAt : null;
      if (!frame || sinceInputMs == null || sinceInputMs > 1500 || durationMs <= 0) return;
      const phase = classifyInteractionLabel(label);
      frame.totalMs += durationMs;
      frame.phases[phase] = (frame.phases[phase] || 0) + durationMs;
      frame.labels[label] = (frame.labels[label] || 0) + durationMs;
    };

    const finalizeInteractionFrame = () => {
      const frame = interactionCorePerfState.frame.current;
      if (!frame) return;
      interactionCorePerfState.frame.current = null;
      const roundedTotalMs = Math.round(frame.totalMs * 10) / 10;
      interactionCorePerfState.frameFlow.lastFrameTotalMs = roundedTotalMs;
      if (roundedTotalMs > interactionCorePerfState.frameFlow.maxFrameTotalMs) {
        interactionCorePerfState.frameFlow.maxFrameTotalMs = roundedTotalMs;
      }
      if (roundedTotalMs > interactionCorePerfState.frame.maxTotalMs) {
        interactionCorePerfState.frame.maxTotalMs = roundedTotalMs;
        interactionCorePerfState.frame.maxInputType = frame.inputType || null;
        interactionCorePerfState.frame.maxPhases = Object.keys(frame.phases).reduce((acc:any, key:string) => {
          acc[key] = Math.round(frame.phases[key] * 10) / 10;
          return acc;
        }, {});
        interactionCorePerfState.frame.maxLabels = Object.keys(frame.labels).reduce((acc:any, key:string) => {
          acc[key] = Math.round(frame.labels[key] * 10) / 10;
          return acc;
        }, {});
      }
      const now = Date.now();
      if (interactionCorePerfState.frame.maxTotalMs > 8 && now - interactionCorePerfState.frame.lastSummaryAt > 3000) {
        interactionCorePerfState.frame.lastSummaryAt = now;
        const topLabels = Object.keys(interactionCorePerfState.frame.maxLabels)
          .map((key) => ({ label: key, durationMs: interactionCorePerfState.frame.maxLabels[key] }))
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, 6);
        emitInteractionPerf('frame_phase_summary', {
          inputType: interactionCorePerfState.frame.maxInputType,
          totalMs: interactionCorePerfState.frame.maxTotalMs,
          phases: interactionCorePerfState.frame.maxPhases,
          topLabels,
          recentInputs: interactionCorePerfState.recentInputs.slice(-5),
        });
        interactionCorePerfState.frame.maxTotalMs = 0;
        interactionCorePerfState.frame.maxInputType = null;
        interactionCorePerfState.frame.maxPhases = {};
        interactionCorePerfState.frame.maxLabels = {};
      }
      if (roundedTotalMs > 16) {
        interactionCorePerfState.frameFlow.slowCount += 1;
      }
      if (now - interactionCorePerfState.frameFlow.lastSummaryAt > 3000 &&
          (interactionCorePerfState.frameFlow.maxFrameTotalMs > 16 ||
            interactionCorePerfState.frameFlow.maxRafGapMs > 34 ||
            interactionCorePerfState.frameFlow.maxTickGapMs > 34)) {
        interactionCorePerfState.frameFlow.lastSummaryAt = now;
        emitInteractionPerf('frame_flow_summary', {
          inputType: interactionCorePerfState.lastInputType || null,
          frameTotalMs: interactionCorePerfState.frameFlow.lastFrameTotalMs,
          rafGapMs: Math.round(interactionCorePerfState.frameFlow.lastRafGapMs * 10) / 10,
          tickGapMs: Math.round(interactionCorePerfState.frameFlow.lastTickGapMs * 10) / 10,
          maxFrameTotalMs: Math.round(interactionCorePerfState.frameFlow.maxFrameTotalMs * 10) / 10,
          maxRafGapMs: Math.round(interactionCorePerfState.frameFlow.maxRafGapMs * 10) / 10,
          maxTickGapMs: Math.round(interactionCorePerfState.frameFlow.maxTickGapMs * 10) / 10,
          sinceInputMs: interactionCorePerfState.lastInputAt ? now - interactionCorePerfState.lastInputAt : null,
          slowFrameCount: interactionCorePerfState.frameFlow.slowCount,
          recentInputs: interactionCorePerfState.recentInputs.slice(-5),
        });
        interactionCorePerfState.frameFlow.maxFrameTotalMs = 0;
        interactionCorePerfState.frameFlow.maxRafGapMs = 0;
        interactionCorePerfState.frameFlow.maxTickGapMs = 0;
        interactionCorePerfState.frameFlow.slowCount = 0;
      }
    };

    const beginInteractionFrame = (nowPerf:number) => {
      finalizeInteractionFrame();
      const sinceInputMs = interactionCorePerfState.lastInputAt ? Date.now() - interactionCorePerfState.lastInputAt : null;
      if (sinceInputMs == null || sinceInputMs > 1500) return;
      interactionCorePerfState.frame.id += 1;
      interactionCorePerfState.frame.current = {
        id: interactionCorePerfState.frame.id,
        startedAt: nowPerf,
        inputType: interactionCorePerfState.lastInputType || null,
        totalMs: 0,
        phases: {},
        labels: {},
      };
    };

    const rememberInput = (type:string, event?:Event) => {
      const keyboardEvent = event as KeyboardEvent | undefined;
      const now = Date.now();
      const target = summarizeInteractionTarget(event && event.target);
      interactionCorePerfState.lastInputType = type;
      interactionCorePerfState.lastInputAt = now;
      interactionCorePerfState.recentInputs.push({
        at: now,
        type,
        tag: target.tag,
        className: target.className,
        key: keyboardEvent && keyboardEvent.key ? String(keyboardEvent.key).slice(0, 32) : null,
      });
      if (interactionCorePerfState.recentInputs.length > 12) {
        interactionCorePerfState.recentInputs.shift();
      }
    };

    const noteSlowInteractionProcess = (label:string, durationMs:number, extra:any = {}) => {
      const now = Date.now();
      const sinceInputMs = interactionCorePerfState.lastInputAt ? now - interactionCorePerfState.lastInputAt : null;
      if (sinceInputMs == null || sinceInputMs > 1500 || durationMs < 8) return;
      const last = interactionCorePerfState.lastMethodLogAt[label] || 0;
      if (durationMs < 20 && now - last < 1500) return;
      interactionCorePerfState.lastMethodLogAt[label] = now;
      emitInteractionPerf('slow_process', {
        label,
        durationMs: Math.round(durationMs * 10) / 10,
        inputType: interactionCorePerfState.lastInputType || null,
        sinceInputMs,
        recentInputs: interactionCorePerfState.recentInputs.slice(-5),
        extra,
      });
    };

    const wrapTimedMethod = (target:any, methodName:string, label:string) => {
      if (!target || typeof target[methodName] !== 'function') return;
      const original = target[methodName];
      if ((original as any).__costosInteractionPerfWrapped) return;
      const wrapped = function (this:any, ...args:any[]) {
        const startedAt = performance.now();
        const finish = () => noteSlowInteractionProcess(label, performance.now() - startedAt, {
          argTypes: args.slice(0, 2).map((value:any) => {
            if (value == null) return value;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
            return value.constructor && value.constructor.name ? value.constructor.name : typeof value;
          }),
        });
        const result = original.apply(this, args);
        if (result && typeof (result as any).then === 'function') {
          return (result as Promise<any>).then((value:any) => {
            recordInteractionPhase(label, performance.now() - startedAt);
            finish();
            return value;
          }, (error:any) => {
            recordInteractionPhase(label, performance.now() - startedAt);
            finish();
            throw error;
          });
        }
        recordInteractionPhase(label, performance.now() - startedAt);
        finish();
        return result;
      };
      (wrapped as any).__costosInteractionPerfWrapped = true;
      target[methodName] = wrapped;
    };

    const wrapTimedPath = (root:any, pathSegments:string[], label:string) => {
      let target = root;
      for (let index = 0; index < pathSegments.length - 1; index += 1) {
        if (!target) return;
        target = target[pathSegments[index]];
      }
      if (!target) return;
      wrapTimedMethod(target, pathSegments[pathSegments.length - 1], label);
    };

    if (interactionCanvas && !(interactionCanvas as any).__costosInteractionInputHooked) {
      (interactionCanvas as any).__costosInteractionInputHooked = true;
      interactionCanvas.addEventListener('pointermove', (event:PointerEvent) => rememberInput('pointermove', event), { passive: true, capture: true });
      interactionCanvas.addEventListener('mousedown', (event:MouseEvent) => rememberInput('mousedown', event), { passive: true, capture: true });
      interactionCanvas.addEventListener('mouseup', (event:MouseEvent) => rememberInput('mouseup', event), { passive: true, capture: true });
      interactionCanvas.addEventListener('wheel', (event:WheelEvent) => rememberInput('wheel', event), { passive: true, capture: true });
    }

    if (!(document as any).__costosInteractionKeyHooked) {
      (document as any).__costosInteractionKeyHooked = true;
      document.addEventListener('keydown', (event:KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && (target.closest('.op-ifc-viewer') || target.closest('.op-ifc-viewer-container') || target.closest('.op-ifc-viewer--model-canvas'))) {
          rememberInput('keydown', event);
        }
      }, true);
    }

    wrapTimedMethod(viewerCore, 'pick', 'viewer.pick');
    wrapTimedMethod(viewerCore, 'pickSurface', 'viewer.pickSurface');
    wrapTimedMethod(viewerCore, 'pickWorldPos', 'viewer.pickWorldPos');
    wrapTimedMethod(viewerCore, 'render', 'viewer.render');
    wrapTimedMethod(scene as any, 'pick', 'scene.pick');
    wrapTimedMethod(scene as any, 'render', 'scene.render');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'pan', 'camera.pan');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'zoom', 'camera.zoom');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'orbitYaw', 'camera.orbitYaw');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'orbitPitch', 'camera.orbitPitch');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'panToPointer', 'camera.panToPointer');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'dollyToPointer', 'camera.dollyToPointer');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'update', 'cameraControl.update');
    wrapTimedMethod((viewerCore || {}).cameraControl, 'updatePivotElement', 'cameraControl.updatePivotElement');
    wrapTimedMethod((viewerCore || {}).camera, 'update', 'camera.update');
    wrapTimedMethod((viewerCore || {}).cameraFlight, 'flyTo', 'cameraFlight.flyTo');
    wrapTimedMethod((viewerCore || {}).cameraFlight, 'jumpTo', 'cameraFlight.jumpTo');
    wrapTimedMethod(viewerCore, 'renderFrame', 'viewer.renderFrame');
    wrapTimedMethod(viewerCore, 'fireTickEvents', 'viewer.fireTickEvents');
    wrapTimedMethod(scene as any, 'renderFrame', 'scene.renderFrame');
    wrapTimedMethod(scene as any, 'fireTickEvents', 'scene.fireTickEvents');
    wrapTimedMethod(scene as any, 'compile', 'scene.compile');
    wrapTimedMethod(scene as any, 'doOcclusionTest', 'scene.doOcclusionTest');
    wrapTimedMethod(scene as any, 'renderColor', 'scene.renderColor');
    wrapTimedPath(viewerCore, ['renderer', 'render'], 'viewer.renderer.render');
    wrapTimedPath(viewerCore, ['_renderer', 'render'], 'viewer._renderer.render');
    wrapTimedPath(scene as any, ['renderer', 'render'], 'scene.renderer.render');
    wrapTimedPath(scene as any, ['_renderer', 'render'], 'scene._renderer.render');
    [
      [[ 'renderer', 'draw' ], 'viewer.renderer.draw'],
      [[ '_renderer', 'draw' ], 'viewer._renderer.draw'],
      [[ 'renderer', 'drawFrame' ], 'viewer.renderer.drawFrame'],
      [[ '_renderer', 'drawFrame' ], 'viewer._renderer.drawFrame'],
      [[ 'renderer', 'renderFrame' ], 'viewer.renderer.renderFrame'],
      [[ '_renderer', 'renderFrame' ], 'viewer._renderer.renderFrame'],
      [[ 'renderer', 'renderColor' ], 'viewer.renderer.renderColor'],
      [[ '_renderer', 'renderColor' ], 'viewer._renderer.renderColor'],
      [[ 'renderer', 'renderDepth' ], 'viewer.renderer.renderDepth'],
      [[ '_renderer', 'renderDepth' ], 'viewer._renderer.renderDepth'],
      [[ 'renderer', 'renderOcclusion' ], 'viewer.renderer.renderOcclusion'],
      [[ '_renderer', 'renderOcclusion' ], 'viewer._renderer.renderOcclusion'],
      [[ 'renderer', 'pick' ], 'viewer.renderer.pick'],
      [[ '_renderer', 'pick' ], 'viewer._renderer.pick'],
      [[ 'renderer', 'pickTriangle' ], 'viewer.renderer.pickTriangle'],
      [[ '_renderer', 'pickTriangle' ], 'viewer._renderer.pickTriangle'],
      [[ 'renderer', 'pickSurface' ], 'viewer.renderer.pickSurface'],
      [[ '_renderer', 'pickSurface' ], 'viewer._renderer.pickSurface'],
      [[ 'renderer', 'occlusionTest' ], 'viewer.renderer.occlusionTest'],
      [[ '_renderer', 'occlusionTest' ], 'viewer._renderer.occlusionTest'],
      [[ 'renderer', 'compile' ], 'viewer.renderer.compile'],
      [[ '_renderer', 'compile' ], 'viewer._renderer.compile'],
      [[ 'renderer', 'buildDrawList' ], 'viewer.renderer.buildDrawList'],
      [[ '_renderer', 'buildDrawList' ], 'viewer._renderer.buildDrawList'],
      [[ 'renderer', 'sortDrawableList' ], 'viewer.renderer.sortDrawableList'],
      [[ '_renderer', 'sortDrawableList' ], 'viewer._renderer.sortDrawableList'],
      [[ 'renderer', 'cull' ], 'viewer.renderer.cull'],
      [[ '_renderer', 'cull' ], 'viewer._renderer.cull'],
      [[ 'renderer', 'update' ], 'viewer.renderer.update'],
      [[ '_renderer', 'update' ], 'viewer._renderer.update'],
    ].forEach(([pathSegments, label]) => {
      wrapTimedPath(viewerCore, pathSegments as string[], label as string);
    });
    [
      [[ 'renderer', 'draw' ], 'scene.renderer.draw'],
      [[ '_renderer', 'draw' ], 'scene._renderer.draw'],
      [[ 'renderer', 'drawFrame' ], 'scene.renderer.drawFrame'],
      [[ '_renderer', 'drawFrame' ], 'scene._renderer.drawFrame'],
      [[ 'renderer', 'renderFrame' ], 'scene.renderer.renderFrame'],
      [[ '_renderer', 'renderFrame' ], 'scene._renderer.renderFrame'],
      [[ 'renderer', 'renderColor' ], 'scene.renderer.renderColor'],
      [[ '_renderer', 'renderColor' ], 'scene._renderer.renderColor'],
      [[ 'renderer', 'renderDepth' ], 'scene.renderer.renderDepth'],
      [[ '_renderer', 'renderDepth' ], 'scene._renderer.renderDepth'],
      [[ 'renderer', 'renderOcclusion' ], 'scene.renderer.renderOcclusion'],
      [[ '_renderer', 'renderOcclusion' ], 'scene._renderer.renderOcclusion'],
      [[ 'renderer', 'pick' ], 'scene.renderer.pick'],
      [[ '_renderer', 'pick' ], 'scene._renderer.pick'],
      [[ 'renderer', 'pickTriangle' ], 'scene.renderer.pickTriangle'],
      [[ '_renderer', 'pickTriangle' ], 'scene._renderer.pickTriangle'],
      [[ 'renderer', 'pickSurface' ], 'scene.renderer.pickSurface'],
      [[ '_renderer', 'pickSurface' ], 'scene._renderer.pickSurface'],
      [[ 'renderer', 'occlusionTest' ], 'scene.renderer.occlusionTest'],
      [[ '_renderer', 'occlusionTest' ], 'scene._renderer.occlusionTest'],
      [[ 'renderer', 'compile' ], 'scene.renderer.compile'],
      [[ '_renderer', 'compile' ], 'scene._renderer.compile'],
      [[ 'renderer', 'buildDrawList' ], 'scene.renderer.buildDrawList'],
      [[ '_renderer', 'buildDrawList' ], 'scene._renderer.buildDrawList'],
      [[ 'renderer', 'sortDrawableList' ], 'scene.renderer.sortDrawableList'],
      [[ '_renderer', 'sortDrawableList' ], 'scene._renderer.sortDrawableList'],
      [[ 'renderer', 'cull' ], 'scene.renderer.cull'],
      [[ '_renderer', 'cull' ], 'scene._renderer.cull'],
      [[ 'renderer', 'update' ], 'scene.renderer.update'],
      [[ '_renderer', 'update' ], 'scene._renderer.update'],
    ].forEach(([pathSegments, label]) => {
      wrapTimedPath(scene as any, pathSegments as string[], label as string);
    });

    if (scene && typeof (scene as any).on === 'function' && !(scene as any).__costosInteractionTickHooked) {
      (scene as any).__costosInteractionTickHooked = true;
      interactionCorePerfState.tick.lastAt = performance.now();
      (scene as any).on('tick', () => {
        const nowPerf = performance.now();
        const deltaMs = interactionCorePerfState.tick.lastAt ? nowPerf - interactionCorePerfState.tick.lastAt : 0;
        interactionCorePerfState.tick.lastAt = nowPerf;
        const sinceInputMs = interactionCorePerfState.lastInputAt ? Date.now() - interactionCorePerfState.lastInputAt : null;
        if (sinceInputMs == null || sinceInputMs > 1500) return;
        interactionCorePerfState.frameFlow.lastTickGapMs = deltaMs;
        if (deltaMs > interactionCorePerfState.frameFlow.maxTickGapMs) {
          interactionCorePerfState.frameFlow.maxTickGapMs = deltaMs;
        }
        if (deltaMs > interactionCorePerfState.tick.maxGapMs) {
          interactionCorePerfState.tick.maxGapMs = Math.round(deltaMs * 10) / 10;
        }
        if (deltaMs > 45) {
          interactionCorePerfState.tick.slowCount += 1;
          const tickState = deltaMs > 50 ? collectTickState() : undefined;
          noteSlowInteractionProcess('scene.tickGap', deltaMs, tickState ? { tickState } : {});
        }
        const now = Date.now();
        if (interactionCorePerfState.tick.maxGapMs > 34 && now - interactionCorePerfState.tick.lastSummaryAt > 3000) {
          interactionCorePerfState.tick.lastSummaryAt = now;
          emitInteractionPerf('tick_summary', {
            inputType: interactionCorePerfState.lastInputType || null,
            maxGapMs: interactionCorePerfState.tick.maxGapMs,
            slowTickCount: interactionCorePerfState.tick.slowCount,
            recentInputs: interactionCorePerfState.recentInputs.slice(-5),
          });
          interactionCorePerfState.tick.maxGapMs = 0;
          interactionCorePerfState.tick.slowCount = 0;
        }
      });
    }

    if (!interactionCorePerfState.raf.started) {
      interactionCorePerfState.raf.started = true;
      interactionCorePerfState.raf.lastAt = performance.now();
      const rafLoop = (nowPerf:number) => {
        beginInteractionFrame(nowPerf);
        const deltaMs = interactionCorePerfState.raf.lastAt ? nowPerf - interactionCorePerfState.raf.lastAt : 0;
        interactionCorePerfState.raf.lastAt = nowPerf;
        const sinceInputMs = interactionCorePerfState.lastInputAt ? Date.now() - interactionCorePerfState.lastInputAt : null;
        if (sinceInputMs != null && sinceInputMs <= 1500) {
          interactionCorePerfState.frameFlow.lastRafGapMs = deltaMs;
          if (deltaMs > interactionCorePerfState.frameFlow.maxRafGapMs) {
            interactionCorePerfState.frameFlow.maxRafGapMs = deltaMs;
          }
          if (deltaMs > interactionCorePerfState.raf.maxGapMs) {
            interactionCorePerfState.raf.maxGapMs = Math.round(deltaMs * 10) / 10;
          }
          if (deltaMs > 45) {
            interactionCorePerfState.raf.slowCount += 1;
            noteSlowInteractionProcess('raf.gap', deltaMs);
          }
          const now = Date.now();
          if (interactionCorePerfState.raf.maxGapMs > 34 && now - interactionCorePerfState.raf.lastSummaryAt > 3000) {
            interactionCorePerfState.raf.lastSummaryAt = now;
            emitInteractionPerf('raf_summary', {
              inputType: interactionCorePerfState.lastInputType || null,
              maxGapMs: interactionCorePerfState.raf.maxGapMs,
              slowRafCount: interactionCorePerfState.raf.slowCount,
              recentInputs: interactionCorePerfState.recentInputs.slice(-5),
            });
            interactionCorePerfState.raf.maxGapMs = 0;
            interactionCorePerfState.raf.slowCount = 0;
          }
        }
        window.requestAnimationFrame(rafLoop);
      };
      window.requestAnimationFrame(rafLoop);
    }
    // costos_ifc_interaction_core_end
"""

if "__costosIfcViewerPerf" not in method_text:
    typed_scene_anchor = "    const scene = (viewerUI as any).viewer.scene;\n"
    plain_scene_anchor = "    const scene = viewerUI.viewer.scene;\n"
    if typed_scene_anchor in method_text:
        method_text = method_text.replace(typed_scene_anchor, typed_scene_anchor + "\n" + perf_block + "\n", 1)
    elif plain_scene_anchor in method_text:
        method_text = method_text.replace(plain_scene_anchor, plain_scene_anchor + "\n" + perf_block + "\n", 1)
    else:
        print("[costos] No se pudo localizar el scene esperado para insertar perf hooks", file=sys.stderr)
        raise SystemExit(1)

interaction_core_pattern = re.compile(
    r"\n\s*// costos_ifc_interaction_core_start.*?// costos_ifc_interaction_core_end\n",
    re.S,
)
method_text = interaction_core_pattern.sub("\n", method_text)

if "__costosIfcViewerInteractionCore" not in method_text:
    if enable_interaction_core_perf:
        model_loaded_anchor = "viewerUI.on('modelLoaded'"
        interaction_anchor = method_text.find(model_loaded_anchor)
        if interaction_anchor == -1:
            print("[costos] No se pudo localizar el hook modelLoaded para insertar interaccion core", file=sys.stderr)
            raise SystemExit(1)
        method_text = method_text[:interaction_anchor] + interaction_core_block + "\n\n    " + method_text[interaction_anchor:]

interaction_start = method_text.find("const interactionPerfState = ((window as any).__costosIfcViewerInteractionPerf ||=")
if interaction_start != -1:
    interaction_end = method_text.find("viewerUI.on('modelLoaded'", interaction_start)
    if interaction_end != -1:
        method_text = method_text[:interaction_start] + method_text[interaction_end:]

method_text = method_text.replace(
    "    const scene = (viewerUI as any).viewer.scene;\n\n    const perfState = ((window as any).__costosIfcViewerPerf ||=",
    "    const scene = viewerUI.viewer.scene;\n\n    const perfState = ((window as any).__costosIfcViewerPerf ||="
)
method_text = re.sub(
    r"\n\s*const scene = \(viewerUI as any\)\.viewer\.scene;\n(?=\s*const perfState = \(\(window as any\).__costosIfcViewerPerf \|\|=)",
    "\n",
    method_text,
    count=1,
)

interaction_cleanup_patterns = [
    r"\n\s*const interactionRoot = document\.documentElement;\n",
    r"\n\s*const interactionCanvas = \(\(\(viewerUI as any\)\.viewer \|\| \{\}\)\.canvas \|\| \{\}\)\.canvas as HTMLElement \| undefined \|\|\n\s*document\.querySelector\('\.op-ifc-viewer--model-canvas'\) as HTMLElement \| null \|\|\n\s*document\.querySelector\('canvas'\) as HTMLElement \| null;\n",
    r"\n\s*const releaseInteractionMode = \(\) => \{.*?^\s*};\n",
    r"\n\s*const activateInteractionMode = \(\) => \{.*?^\s*};\n",
    r"\n\s*if \(interactionCanvas && !\(interactionCanvas as any\).__costosIfcInteractionHooked\) \{.*?^\s*}\n",
]
for pattern in interaction_cleanup_patterns:
    method_text = re.sub(pattern, "\n", method_text, flags=re.S | re.M)

method_text = method_text.replace(
    "viewerUI.on('modelLoaded', () => this.viewerVisible$.next(true));",
    "viewerUI.on('modelLoaded', () => {\n      this.ngZone.run(() => this.viewerVisible$.next(true));\n    });"
)

method_text = method_text.replace(
    "viewerUI.on('modelLoaded', () => this.ngZone.run(() => {\n        this.viewerVisible$.next(true);\n      }));",
    "viewerUI.on('modelLoaded', () => {\n      this.ngZone.run(() => this.viewerVisible$.next(true));\n    });"
)

method_text = method_text.replace(
    "viewerUI.on('modelLoaded', () => this.ngZone.run(() => this.viewerVisible$.next(true)));",
    "viewerUI.on('modelLoaded', () => {\n      this.ngZone.run(() => this.viewerVisible$.next(true));\n    });"
)

method_text = re.sub(
    r"viewerUI\.on\('openInspector', \(\) => \{\s*this\.inspectorVisible\$\.next\(true\);\s*\}\);",
    "viewerUI.on('openInspector', () => {\n        this.ngZone.run(() => this.inspectorVisible$.next(true));\n      });",
    method_text,
    count=1,
    flags=re.S
)

delete_pattern = re.compile(
    r"viewerUI\.on\('deleteModel', \(event:\{ modelId:number\|string \}\) => \{(?P<body>.*?)\n\s*\}\);",
    re.S,
)

def wrap_delete(match):
    block = match.group(0)
    if "this.ngZone.run(() => {" in block:
        return block
    body = match.group("body").rstrip("\n")
    lines = body.splitlines()
    indented = "\n".join(("          " + line.lstrip()) if line.strip() else "" for line in lines)
    return (
        "viewerUI.on('deleteModel', (event:{ modelId:number|string }) => {\n"
        "        this.ngZone.run(() => {\n"
        f"{indented}\n"
        "        });\n"
        "      });"
    )

method_text = delete_pattern.sub(wrap_delete, method_text, count=1)

method_text = method_text.replace(
    "viewerUI.on('openInspector', () => {\n      this.inspectorVisible$.next(true);\n    });",
    "viewerUI.on('openInspector', () => {\n        this.ngZone.run(() => this.inspectorVisible$.next(true));\n      });"
)

method_text = method_text.replace(
    "viewerUI.on('openInspector', () => {\n        this.ngZone.run(() => this.inspectorVisible$.next(true));\n      });",
    "viewerUI.on('openInspector', () => {\n        this.ngZone.run(() => this.inspectorVisible$.next(true));\n      });"
)

text = text[:method_start] + method_text + text[method_end + 1:]

if text == original:
    print("[costos] Patch ya estaba normalizado.")
    raise SystemExit(0)

path.write_text(text, encoding="utf-8")
print("[costos] Patch NgZone aplicado correctamente.")
PY
