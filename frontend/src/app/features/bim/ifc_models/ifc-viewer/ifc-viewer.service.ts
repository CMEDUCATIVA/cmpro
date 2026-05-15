//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import { Injectable, Injector } from '@angular/core';
import { XeokitServer } from 'core-app/features/bim/ifc_models/xeokit/xeokit-server';
import { ViewerBridgeService } from 'core-app/features/bim/bcf/bcf-viewer-bridge/viewer-bridge.service';
import { BehaviorSubject, firstValueFrom, Observable, of } from 'rxjs';
import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';
import { BcfApiService } from 'core-app/features/bim/bcf/api/bcf-api.service';
import { InjectField } from 'core-app/shared/helpers/angular/inject-field.decorator';
import { ViewpointsService } from 'core-app/features/bim/bcf/helper/viewpoints.service';
import { CurrentProjectService } from 'core-app/core/current-project/current-project.service';
import { HttpClient } from '@angular/common/http';
import { IFCGonDefinition, IfcProjectDefinition } from 'core-app/features/bim/ifc_models/pages/viewer/ifc-models-data.service';
import { BIMViewer } from '@xeokit/xeokit-bim-viewer/dist/xeokit-bim-viewer.es';
import { BcfViewpointData, CreateBcfViewpointData } from 'core-app/features/bim/bcf/api/bcf-api.model';
import { HalResource } from 'core-app/features/hal/resources/hal-resource';
import idFromLink from 'core-app/features/hal/helpers/id-from-link';

export interface XeokitElements {
  canvasElement:HTMLElement;
  explorerElement:HTMLElement;
  toolbarElement:HTMLElement;
  inspectorElement:HTMLElement;
  navCubeCanvasElement:HTMLElement;
  busyModelBackdropElement:HTMLElement;
  enableEditModels?:boolean;
  keyboardEventsElement?:HTMLElement;
  enableMeasurements?:boolean;
}

/**
 * Options for saving current viewpoint in xeokit-bim-viewer.
 * See: https://xeokit.github.io/xeokit-bim-viewer/docs/class/src/BIMViewer.js~BIMViewer.html#instance-method-saveBCFViewpoint
 */
export interface BCFCreationOptions {
  spacesVisible?:boolean;
  spaceBoundariesVisible?:boolean;
  openingsVisible?:boolean;
  defaultInvisible?:boolean;
  reverseClippingPlanes?:boolean;
}

/**
 * Options for loading a viewpoint into xeokit-bim-viewer.
 * See: https://xeokit.github.io/xeokit-bim-viewer/docs/class/src/BIMViewer.js~BIMViewer.html#instance-method-loadBCFViewpoint
 */
export interface BCFLoadOptions {
  rayCast?:boolean;
  immediate?:boolean;
  duration?:number;
  updateCompositeObjects?:boolean;
  reverseClippingPlanes?:boolean;
}

interface IfcMetadataProperty {
  id:string;
  name:string;
  value:unknown;
}

interface IfcMetadataPropertySet {
  id:string;
  name:string;
  metaObjectId:string;
  properties:IfcMetadataProperty[];
}

interface IfcMetadataPayload {
  metaObjects?:Array<{
    id:string;
    name?:string;
    type?:string;
    parent?:string|null;
    propertySetIds?:string[];
  }>;
  propertySets?:IfcMetadataPropertySet[];
}

type StableScene = {
  sao?:{
    enabled?:boolean;
  };
  edgeMaterial?:{
    edges?:boolean;
    edgeAlpha?:number;
    edgeWidth?:number;
  };
  objectIds?:string[];
  setObjectsEdges?:(ids:string[], enabled:boolean) => void;
};

type ViewerConfigTarget = {
  setConfig?:(key:string, value:unknown) => unknown;
  setConfigs?:(values:Record<string, unknown>) => unknown;
  requestRender?:() => void;
  scene?:StableScene;
  viewer?:{
    scene?:StableScene;
    requestRender?:() => void;
  };
  _fastNavPlugin?:Record<string, unknown>;
  cameraControl?:unknown;
};

type SectionBoxState = {
  center:[number, number, number];
  halfSize:[number, number, number];
  active:boolean;
};

type SectionDeltaAction =
  | 'x-'
  | 'x+'
  | 'y-'
  | 'y+'
  | 'z-'
  | 'z+'
  | 'size-'
  | 'size+';

/**
 * Wrapping type from xeokit module. Can be removed after we get a real type package.
 */
type Controller = {
  on:(event:string, callback:(event:unknown) => void) => string
};

/**
 * Wrapping type from xeokit module. Can be removed after we get a real type package.
 */
type XeokitBimViewer = Controller&{
  loadProject:(projectId:string) => void,
  saveBCFViewpoint:(options:BCFCreationOptions) => unknown,
  loadBCFViewpoint:(bcfViewpoint:BcfViewpointData, options:BCFLoadOptions) => void,
  setKeyboardEnabled:(enabled:boolean) => true,
  destroy:() => void
};

@Injectable()
export class IFCViewerService extends ViewerBridgeService {
  public shouldShowViewer = true;

  public viewerVisible$ = new BehaviorSubject<boolean>(false);

  public inspectorVisible$ = new BehaviorSubject<boolean>(false);

  private xeokitViewer:XeokitBimViewer|undefined;
  private inspectorObserver:MutationObserver|undefined;
  private inspectorEnhancementScheduled = false;
  private metadataByModelId = new Map<number, IfcMetadataPayload>();
  private metadataLoadByModelId = new Map<number, Promise<IfcMetadataPayload|undefined>>();
  private lastDirectMetadataRenderKey:string|undefined;
  private selectedObjectIds:string[] = [];
  private selectedObjectAttributes = new Map<string, Map<string, string>>();
  private contextMenuClickListener:((event:MouseEvent) => void)|undefined;
  private contextMenuOpenListener:((event:MouseEvent) => void)|undefined;
  private canvasMouseDownListener:((event:MouseEvent) => void)|undefined;
  private canvasMouseMoveListener:((event:MouseEvent) => void)|undefined;
  private canvasMouseUpListener:((event:MouseEvent) => void)|undefined;
  private outsideClickListener:((event:MouseEvent) => void)|undefined;
  private inspectorElementRef:HTMLElement|undefined;
  private canvasElementRef:HTMLElement|undefined;
  private appendSelectionOnNextInspect = false;
  private lastPickedObjectId:string|undefined;
  private lastPickedAt = 0;
  private pointerDownX:number|undefined;
  private pointerDownY:number|undefined;
  private pointerDragging = false;
  private stableRenderLockTimer:number|undefined;
  private stableRenderTargets = new Set<ViewerConfigTarget>();
  private stableRenderPatchedTargets = new WeakSet<ViewerConfigTarget>();
  private toolbarMouseDownListener:((event:MouseEvent) => void)|undefined;
  private toolbarClickListener:((event:MouseEvent) => void)|undefined;
  private toolbarDebugElementRef:HTMLElement|undefined;
  private lastToolbarDebugLogAt = 0;
  private sectionToolbarMouseDownListener:((event:MouseEvent) => void)|undefined;
  private sectionToolbarClickListener:((event:MouseEvent) => void)|undefined;
  private sectionControlsRoot:HTMLElement|undefined;
  private sectionControlsHost:HTMLElement|undefined;
  private sectionButtonRef:HTMLElement|undefined;
  private sectionBoxState:SectionBoxState|undefined;
  private sectionLastToggleAt = 0;
  private nativeSectionCenterJob:number|undefined;
  private nativeSectionBaseCenter:[number, number, number]|undefined;

  @InjectField() pathHelper:PathHelperService;

  @InjectField() bcfApi:BcfApiService;

  @InjectField() viewpointsService:ViewpointsService;

  @InjectField() currentProjectService:CurrentProjectService;

  @InjectField() httpClient:HttpClient;

  constructor(readonly injector:Injector) {
    super(injector);
  }

  public newViewer(elements:XeokitElements, projects:IfcProjectDefinition[]):void {
    const server = new XeokitServer(this.pathHelper);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const viewerUI = new BIMViewer(server, elements) as XeokitBimViewer;

    viewerUI.on('modelLoaded', () => this.viewerVisible$.next(true));

    viewerUI.loadProject(projects[0].id);

    viewerUI.on('addModel', () => { // "Add" selected in Models tab's context menu
      window.location.href = this.pathHelper.ifcModelsNewPath(this.currentProjectService.identifier as string);
    });

    viewerUI.on('openInspector', () => {
      this.inspectorVisible$.next(true);
      this.scheduleInspectorEnhancement(elements.inspectorElement);
    });

    viewerUI.on('editModel', (event:{ modelId:number|string }) => { // "Edit" selected in Models tab's context menu
      window.location.href = this.pathHelper.ifcModelsEditPath(this.currentProjectService.identifier as string, event.modelId);
    });

    viewerUI.on('deleteModel', (event:{ modelId:number|string }) => { // "Delete" selected in Models tab's context menu
      // We don't have an API for IFC models yet. We need to use the normal Rails form posts for deletion.
      const formData = new FormData();
      formData.append(
        'authenticity_token',
        jQuery('meta[name=csrf-token]').attr('content') as string,
      );
      formData.append(
        '_method',
        'delete',
      );

      this.httpClient.post(
        this.pathHelper.ifcModelsDeletePath(this.currentProjectService.identifier as string, event.modelId),
        formData,
      )
        .subscribe()
        .add(() => {
          // Ensure we reload after every request.
          // We need to reload to get a fresh CSRF token for a successive
          // model deletion placed as a META element into the HTML HEAD.
          window.location.reload();
        });
    });

    this.viewer = viewerUI;
    this.startStableRenderLock(viewerUI as unknown as ViewerConfigTarget);
    this.setupInspectorEnhancements(elements.inspectorElement);
    this.setupContextMenuSelectionBridge(elements.inspectorElement, elements.canvasElement);
    this.setupToolbarDebugBridge(elements.toolbarElement);
    this.setupSectionBoxBridge(elements.toolbarElement);
    this.serverLogSelection('viewer_initialized', { project: this.currentProjectService.identifier });
  }

  public destroy():void {
    this.viewerVisible$.next(false);
    this.inspectorObserver?.disconnect();
    this.inspectorObserver = undefined;
    this.inspectorEnhancementScheduled = false;
    this.stopStableRenderLock();
    this.teardownContextMenuSelectionBridge();
    this.teardownToolbarDebugBridge();
    this.teardownSectionBoxBridge();
    this.selectedObjectIds = [];
    this.selectedObjectAttributes.clear();

    if (!this.viewer) {
      return;
    }

    this.viewer.destroy();
    this.viewer = undefined;
  }

  public get viewer():XeokitBimViewer|undefined {
    return this.xeokitViewer;
  }

  public set viewer(viewer:XeokitBimViewer|undefined) {
    this.xeokitViewer = viewer;
  }

  public setKeyboardEnabled(val:boolean):void {
    this.viewer?.setKeyboardEnabled(val);
  }

  public getViewpoint$():Observable<CreateBcfViewpointData> {
    if (!this.viewer) {
      return of();
    }

    const opts:BCFCreationOptions = { spacesVisible: true, reverseClippingPlanes: true };
    const viewpoint = this.viewer.saveBCFViewpoint(opts) as CreateBcfViewpointData;

    // project output of viewer to ensured BCF viewpoint format
    const bcfViewpoint:CreateBcfViewpointData = {
      // The backend currently rejects viewpoints with bitmaps
      bitmaps: null,
      clipping_planes: viewpoint.clipping_planes,
      index: viewpoint.index,
      guid: viewpoint.guid,
      components: {
        selection: viewpoint.components.selection,
        coloring: viewpoint.components.coloring,
        visibility: {
          default_visibility: viewpoint.components.visibility.default_visibility,
          exceptions: viewpoint.components.visibility.exceptions,
          view_setup_hints: {
            openings_visible: viewpoint.components.visibility.view_setup_hints?.openings_visible || false,
            space_boundaries_visible: viewpoint.components.visibility.view_setup_hints?.space_boundaries_visible || false,
            spaces_visible: viewpoint.components.visibility.view_setup_hints?.spaces_visible || false,
          },
        },
      },
      lines: viewpoint.lines,
      orthogonal_camera: viewpoint.orthogonal_camera,
      perspective_camera: viewpoint.perspective_camera,
      snapshot: viewpoint.snapshot,
    };

    return of(bcfViewpoint);
  }

  public showViewpoint(workPackage:WorkPackageResource, index:number):void {
    if (this.viewerVisible()) {
      const opts:BCFLoadOptions = { updateCompositeObjects: true, reverseClippingPlanes: true };
      this.viewpointsService
        .getViewPoint$(workPackage, index)
        .subscribe((viewpoint) => {
          this.viewer?.loadBCFViewpoint(viewpoint, opts);
        });
    } else {
      // FIXME: When triggering showViewpoint from anywhere outside BCF module, there is no viewer shown and we have
      //  no means of setting it from here. Hence we must make a hard transition to bcf details route of the
      //  current work package.
      window.location.href = this.pathHelper.bimDetailsPath(
        idFromLink((workPackage.project as HalResource).href),
        workPackage.id || '',
        index,
      );
    }
  }

  public viewerVisible():boolean {
    return !!this.viewer;
  }

  private setupInspectorEnhancements(inspectorElement:HTMLElement):void {
    this.inspectorObserver?.disconnect();

    this.inspectorObserver = new MutationObserver(() => {
      this.scheduleInspectorEnhancement(inspectorElement);
    });

    this.inspectorObserver.observe(inspectorElement, {
      childList: true,
      subtree: true,
    });

    this.scheduleInspectorEnhancement(inspectorElement);
  }

  private scheduleInspectorEnhancement(inspectorElement:HTMLElement):void {
    if (this.inspectorEnhancementScheduled) {
      return;
    }

    this.inspectorEnhancementScheduled = true;
    window.requestAnimationFrame(() => {
      this.inspectorEnhancementScheduled = false;
      this.enhanceInspector(inspectorElement);
    });
  }

  private enhanceInspector(inspectorElement:HTMLElement):void {
    const tabContents = Array.from(
      inspectorElement.querySelectorAll('.xeokit-propertiesTab .xeokit-tab-content'),
    ) as HTMLElement[];

    if (tabContents.length === 0) {
      return;
    }

    let enhancedTables = 0;

    for (const tabContent of tabContents) {
      const tables = Array.from(tabContent.querySelectorAll('table.xeokit-table')) as HTMLTableElement[];

      for (const table of tables) {
        if (table.dataset.opInspectorProcessed === '1') {
          continue;
        }

        table.dataset.opInspectorProcessed = '1';
        this.sortTableRowsByKey(table);
        this.wrapTableAsCollapsibleSection(table, tabContent);
        enhancedTables++;
      }
    }

    if (enhancedTables > 0) {
      this.serverLogSelection('inspector_enhanced_tables', { enhancedTables });
    }

    void this.renderDirectMetadataIntoInspector(inspectorElement);
  }

  private sortTableRowsByKey(table:HTMLTableElement):void {
    const body = table.tBodies[0] || table;
    const rows = Array.from(body.querySelectorAll('tr')) as HTMLTableRowElement[];

    if (rows.length < 2) {
      return;
    }

    rows.sort((a, b) => {
      const aKey = this.extractRowKey(a);
      const bKey = this.extractRowKey(b);
      return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
    });

    for (const row of rows) {
      body.appendChild(row);
    }
  }

  private extractRowKey(row:HTMLTableRowElement):string {
    const firstCell = row.querySelector('td:first-child');
    return firstCell?.textContent?.trim() || '';
  }

  private wrapTableAsCollapsibleSection(table:HTMLTableElement, tabContent:HTMLElement):void {
    const wrapper = document.createElement('details');
    wrapper.className = 'op-ifc-viewer--inspector-section';
    wrapper.dataset.opXeokitSection = '1';
    wrapper.open = false;

    const summary = this.buildSectionSummary(this.resolveTableLabel(table, tabContent), wrapper);
    wrapper.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'op-ifc-viewer--inspector-section-body';
    table.parentNode?.insertBefore(wrapper, table);
    body.appendChild(table);
    wrapper.appendChild(body);
  }

  private resolveTableLabel(table:HTMLTableElement, tabContent:HTMLElement):string {
    const headingFromTable = table.getAttribute('data-title');
    if (headingFromTable && headingFromTable.trim().length > 0) {
      return headingFromTable.trim();
    }

    let sibling:Element|null = table.previousElementSibling;
    while (sibling) {
      const text = sibling.textContent?.trim();
      if (text) {
        return text;
      }
      sibling = sibling.previousElementSibling;
    }

    const heading = tabContent.querySelector('h1,h2,h3,h4,h5,strong,b');
    const headingText = heading?.textContent?.trim();
    if (headingText) {
      return headingText;
    }

    return 'Property set';
  }

  private async renderDirectMetadataIntoInspector(inspectorElement:HTMLElement):Promise<void> {
    const tabContent = inspectorElement.querySelector('.xeokit-propertiesTab .xeokit-tab-content') as HTMLElement|null;
    if (!tabContent) {
      return;
    }
    this.suppressXeokitPropertiesShell(inspectorElement);
    inspectorElement.style.overflow = 'hidden';
    inspectorElement.style.minHeight = '0';
    tabContent.style.display = 'flex';
    tabContent.style.flexDirection = 'column';
    tabContent.style.flex = '1 1 auto';
    tabContent.style.minHeight = '0';
    tabContent.style.overflowY = 'auto';
    tabContent.style.overflowX = 'hidden';
    tabContent.style.padding = '0.9rem 0.5rem 0.5rem 0.5rem';
    this.disableLegacyInspectorContent(tabContent);

    const selectedObjectIds = [...this.selectedObjectIds];
    this.serverLogSelection('selection_after_update', {
      selectedObjectIds,
      selectedCount: selectedObjectIds.length,
      source: 'direct_selection_only',
    });
    if (selectedObjectIds.length === 0) {
      this.serverLogSelection('selection_empty_clear_rendered_metadata');
      this.clearDirectMetadataSections(tabContent);
      return;
    }

    const shownModelIds = this.ifcGon?.shown_models || [];
    const metadataModelIds = Object.keys(this.ifcGon?.metadata_attachment_ids || {})
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const candidateModelIds = Array.from(new Set([
      ...shownModelIds,
      ...metadataModelIds,
    ]));
    this.serverLogSelection('shown_models', {
      shownModelIds,
      candidateModelIds,
      metadataAttachmentIds: this.ifcGon?.metadata_attachment_ids,
    });
    if (candidateModelIds.length === 0) {
      this.clearDirectMetadataSections(tabContent);
      return;
    }

    const payloads = await Promise.all(
      candidateModelIds.map((modelId) => this.loadMetadataForModel(modelId)),
    );
    const metaObjectById = new Map<string, NonNullable<IfcMetadataPayload['metaObjects']>[number]>();
    for (const payload of payloads) {
      for (const metaObject of payload?.metaObjects || []) {
        metaObjectById.set(metaObject.id, metaObject);
      }
    }

    const propertySets:IfcMetadataPropertySet[] = [];
    for (const payload of payloads) {
      const sets = payload?.propertySets || [];
      for (const set of sets) {
        if (selectedObjectIds.includes(set.metaObjectId)) {
          propertySets.push(set);
        }
      }
    }
    this.serverLogSelection('metadata_aggregate', {
      totalPropertySets: propertySets.length,
      perSelectedObject: selectedObjectIds.map((id) => ({
        id,
        sets: propertySets.filter((set) => set.metaObjectId === id).length,
      })),
    });

    const renderKey = `${selectedObjectIds.join(',')}|${candidateModelIds.join(',')}|${propertySets.length}`;
    const alreadyRendered = tabContent.querySelector('[data-op-direct-metadata="1"]');
    if (this.lastDirectMetadataRenderKey === renderKey && alreadyRendered) {
      return;
    }

    this.clearDirectMetadataSections(tabContent);
    this.lastDirectMetadataRenderKey = renderKey;

    this.hideXeokitInspectorSections(tabContent);
    this.hideXeokitAttributesContainer(tabContent);
    const attributesToRender = ['id', 'name', 'class', 'ifctype', 'ownerid', 'expressid', 'applicationid', 'uuid', 'viewer id'];
    for (const objectId of selectedObjectIds) {
      const objectAttributes = this.selectedObjectAttributes.get(objectId) || new Map<string, string>();
      const metaObject = metaObjectById.get(objectId);
      const metadataAttributes = new Map<string, string>();
      metadataAttributes.set('id', objectId);
      metadataAttributes.set('uuid', objectId);
      metadataAttributes.set('viewer id', objectId);
      if (metaObject?.name) {
        metadataAttributes.set('name', metaObject.name);
      }
      if (metaObject?.type) {
        metadataAttributes.set('class', metaObject.type);
        metadataAttributes.set('ifctype', metaObject.type);
      }

      const selectedName = metadataAttributes.get('name') || objectAttributes.get('name') || objectId;

      const rootSection = document.createElement('details');
      rootSection.className = 'op-ifc-viewer--inspector-section';
      rootSection.dataset.opDirectMetadata = '1';
      rootSection.open = selectedObjectIds.length === 1;
      rootSection.style.border = '0';
      rootSection.style.borderRadius = '0';
      rootSection.style.margin = '0.3rem 0 0.2rem 0';
      rootSection.style.background = 'transparent';
      rootSection.style.display = 'flex';
      rootSection.style.flexDirection = 'column';
      rootSection.style.flex = '0 0 auto';
      rootSection.style.height = 'auto';
      rootSection.style.minHeight = 'unset';
      rootSection.style.overflow = 'visible';

      const rootSummary = this.buildSectionSummary(selectedName, rootSection);
      rootSummary.style.fontSize = '13px';
      rootSummary.style.fontWeight = '700';
      rootSummary.style.padding = '0.25rem 0.1rem';
      rootSummary.style.background = 'transparent';
      rootSummary.style.whiteSpace = 'nowrap';
      rootSummary.style.overflow = 'hidden';
      rootSummary.style.textOverflow = 'ellipsis';
      rootSection.appendChild(rootSummary);

      const rootBody = document.createElement('div');
      rootBody.dataset.opDirectMetadata = '1';
      rootBody.className = 'op-ifc-viewer--inspector-section-body';
      rootBody.style.padding = '0.15rem 0 0.35rem 0';
      rootBody.style.display = 'flex';
      rootBody.style.flexDirection = 'column';
      rootBody.style.gap = '0.45rem';
      rootBody.style.flex = '1 1 auto';
      rootBody.style.minHeight = '0';
      rootBody.style.overflow = 'visible';
      rootSection.appendChild(rootBody);
      tabContent.appendChild(rootSection);

      const attributesSection = document.createElement('details');
      attributesSection.className = 'op-ifc-viewer--inspector-section';
      attributesSection.dataset.opDirectMetadata = '1';
      attributesSection.open = true;
      attributesSection.style.margin = '0';

      const attributesSummary = this.buildSectionSummary('attributes', attributesSection);
      attributesSection.appendChild(attributesSummary);

      const attributesBody = document.createElement('div');
      attributesBody.className = 'op-ifc-viewer--inspector-section-body';
      const attributesTable = document.createElement('table');
      attributesTable.className = 'op-ifc-viewer--inspector-kv-table';
      attributesTable.style.width = '100%';
      attributesTable.style.borderCollapse = 'collapse';
      attributesTable.style.tableLayout = 'fixed';
      attributesBody.appendChild(attributesTable);
      attributesSection.appendChild(attributesBody);
      rootBody.appendChild(attributesSection);

      for (const key of attributesToRender) {
        const value = metadataAttributes.get(key) || objectAttributes.get(key);
        if (!value) {
          continue;
        }

        const row = document.createElement('tr');
        row.className = 'op-ifc-viewer--inspector-kv-row';

        const keyCell = document.createElement('td');
        keyCell.className = 'op-ifc-viewer--inspector-kv-key';
        keyCell.textContent = key;
        keyCell.title = key;
        keyCell.style.width = '37%';
        keyCell.style.padding = '0.35rem 0.4rem';
        keyCell.style.verticalAlign = 'top';
        keyCell.style.color = 'var(--fgColor-muted)';
        keyCell.style.fontSize = '11px';
        keyCell.style.fontWeight = '600';
        keyCell.style.borderBottom = '1px solid var(--borderColor-default)';
        row.appendChild(keyCell);

        const valueCell = document.createElement('td');
        valueCell.className = 'op-ifc-viewer--inspector-kv-value';
        valueCell.textContent = value;
        valueCell.title = value;
        valueCell.style.padding = '0.35rem 0.4rem';
        valueCell.style.verticalAlign = 'top';
        valueCell.style.color = 'var(--fgColor-default)';
        valueCell.style.fontSize = '11px';
        valueCell.style.borderBottom = '1px solid var(--borderColor-default)';
        valueCell.style.wordBreak = 'break-word';
        row.appendChild(valueCell);

        attributesTable.appendChild(row);
      }

      const propertiesSection = document.createElement('details');
      propertiesSection.className = 'op-ifc-viewer--inspector-section';
      propertiesSection.dataset.opDirectMetadata = '1';
      propertiesSection.open = true;
      propertiesSection.style.display = 'flex';
      propertiesSection.style.flexDirection = 'column';
      propertiesSection.style.flex = '0 0 auto';
      propertiesSection.style.minHeight = 'unset';
      propertiesSection.style.marginBottom = '0';
      propertiesSection.style.marginTop = '0';
      propertiesSection.style.overflow = 'visible';

      const propertiesSummary = this.buildSectionSummary('properties', propertiesSection);
      propertiesSection.appendChild(propertiesSummary);

      const propertiesBody = document.createElement('div');
      propertiesBody.className = 'op-ifc-viewer--inspector-section-body';
      propertiesBody.style.flex = '0 0 auto';
      propertiesBody.style.minHeight = '0';
      propertiesBody.style.height = 'auto';
      propertiesBody.style.maxHeight = 'none';
      propertiesBody.style.overflowY = 'visible';
      propertiesBody.style.overflowX = 'visible';
      propertiesBody.style.paddingRight = '0.25rem';
      propertiesBody.style.paddingTop = '0.15rem';
      propertiesSection.appendChild(propertiesBody);
      rootBody.appendChild(propertiesSection);

      const objectPropertySets = propertySets
        .filter((set) => set.metaObjectId === objectId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      objectPropertySets.forEach((propertySet, propertySetIndex) => {
      const wrapper = document.createElement('details');
      wrapper.className = 'op-ifc-viewer--inspector-section';
      wrapper.dataset.opDirectMetadata = '1';
      wrapper.open = propertySetIndex === 0;
      wrapper.style.border = '1px solid var(--borderColor-default)';
      wrapper.style.borderRadius = '4px';
      wrapper.style.margin = '0.1rem 0 0.35rem 0';
      wrapper.style.background = 'var(--body-background)';
      wrapper.style.overflow = 'hidden';

      const summary = this.buildSectionSummary(propertySet.name || 'Property set', wrapper);
      wrapper.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'op-ifc-viewer--inspector-section-body';
      body.style.padding = '0.2rem 0.35rem 0.35rem 0.35rem';

      const table = document.createElement('table');
      table.className = 'op-ifc-viewer--inspector-kv-table';
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.tableLayout = 'fixed';

      const sortedProperties = [...(propertySet.properties || [])]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      for (const property of sortedProperties) {
        const row = document.createElement('tr');
        row.className = 'op-ifc-viewer--inspector-kv-row';

        const keyCell = document.createElement('td');
        keyCell.className = 'op-ifc-viewer--inspector-kv-key';
        keyCell.textContent = property.name;
        keyCell.title = property.name;
        keyCell.style.width = '37%';
        keyCell.style.padding = '0.35rem 0.4rem';
        keyCell.style.verticalAlign = 'top';
        keyCell.style.color = 'var(--fgColor-muted)';
        keyCell.style.fontSize = '11px';
        keyCell.style.fontWeight = '600';
        keyCell.style.borderBottom = '1px solid var(--borderColor-default)';
        row.appendChild(keyCell);

        const valueCell = document.createElement('td');
        valueCell.className = 'op-ifc-viewer--inspector-kv-value';
        const value = this.stringifyMetadataValue(property.value);
        valueCell.textContent = value;
        valueCell.title = value;
        valueCell.style.padding = '0.35rem 0.4rem';
        valueCell.style.verticalAlign = 'top';
        valueCell.style.color = 'var(--fgColor-default)';
        valueCell.style.fontSize = '11px';
        valueCell.style.borderBottom = '1px solid var(--borderColor-default)';
        valueCell.style.wordBreak = 'break-word';
        row.appendChild(valueCell);

        table.appendChild(row);
      }

      body.appendChild(table);
      wrapper.appendChild(body);
        propertiesBody.appendChild(wrapper);
      });
    }

    this.serverLogSelection('rendered_sets', {
      renderedSets: propertySets.length,
      selectedCount: selectedObjectIds.length,
    });
  }

  private disableLegacyInspectorContent(tabContent:HTMLElement):void {
    const allChildren = Array.from(tabContent.children) as HTMLElement[];
    for (const child of allChildren) {
      if (child.dataset.opDirectMetadata === '1') {
        continue;
      }

      child.style.display = 'none';
      child.style.visibility = 'hidden';
      child.style.height = '0';
      child.style.minHeight = '0';
      child.style.maxHeight = '0';
      child.style.margin = '0';
      child.style.padding = '0';
      child.style.overflow = 'hidden';
      child.style.pointerEvents = 'none';
    }
  }

  private clearDirectMetadataSections(tabContent:HTMLElement):void {
    const nodes = Array.from(tabContent.querySelectorAll('[data-op-direct-metadata="1"]'));
    for (const node of nodes) {
      node.remove();
    }
  }

  private hideXeokitInspectorSections(tabContent:HTMLElement):void {
    const sections = Array.from(tabContent.querySelectorAll('[data-op-xeokit-section="1"]')) as HTMLElement[];
    for (const section of sections) {
      section.style.display = 'none';
    }
  }

  private setupContextMenuSelectionBridge(inspectorElement:HTMLElement, canvasElement:HTMLElement):void {
    this.teardownContextMenuSelectionBridge();
    this.inspectorElementRef = inspectorElement;
    this.canvasElementRef = canvasElement;

    this.contextMenuClickListener = (event:MouseEvent) => {
      const target = event.target as HTMLElement|null;
      const menuItem = target?.closest('.xeokit-context-menu-item') as HTMLElement|null;
      if (!menuItem) {
        return;
      }

      const text = (menuItem.textContent || '').trim().toLowerCase();
      this.serverLogSelection('context_menu_click', {
        text,
        shiftKey: event.shiftKey,
        appendSelectionOnNextInspect: this.appendSelectionOnNextInspect,
      });
      if (text === 'clear slices') {
        // Keep a stable center during the session to avoid jumpy recentering.
        if (this.nativeSectionCenterJob) {
          window.clearTimeout(this.nativeSectionCenterJob);
          this.nativeSectionCenterJob = undefined;
        }
        this.serverLogSection('native_center_base_preserved', {
          reason: 'clear_slices',
          center: this.nativeSectionBaseCenter,
        });
      }
      const isSelectNone = text === 'select none' || text === 'deselect all' || text === 'clear selection';
      if (isSelectNone) {
        this.selectedObjectIds = [];
        this.selectedObjectAttributes.clear();
        this.lastDirectMetadataRenderKey = undefined;
        this.syncViewerSelectionToScene();
        this.inspectorVisible$.next(false);
        this.serverLogSelection('select_none_selection_cleared');
        if (this.inspectorElementRef) {
          this.scheduleInspectorEnhancement(this.inspectorElementRef);
        }
        return;
      }

      const isSelectAction = text === 'select'
        || text === 'inspect properties'
        || text === 'inspect'
        || text === 'properties';

      if (isSelectAction) {
        this.appendSelectionOnNextInspect = this.appendSelectionOnNextInspect || !!event.shiftKey;
        this.serverLogSelection('select_or_inspect_clicked', {
          text,
          appendSelectionOnNextInspect: this.appendSelectionOnNextInspect,
          shiftKey: event.shiftKey,
        });
        this.openInspectorForCurrentSelection();

        // Let xeokit apply the selected object first, then we re-read inspector values.
        window.setTimeout(() => {
          if (this.inspectorElementRef) {
            this.scheduleInspectorEnhancement(this.inspectorElementRef);
          }
        }, 0);
      }
    };

    this.contextMenuOpenListener = (event:MouseEvent) => {
      if (event.button === 2 && event.shiftKey) {
        this.appendSelectionOnNextInspect = true;
        this.serverLogSelection('contextmenu_open_shift_right_click_append_on');
      }
    };

    this.canvasMouseDownListener = (event:MouseEvent) => {
      if (this.isNativeSectionModeActive()) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      this.pointerDownX = event.clientX;
      this.pointerDownY = event.clientY;
      this.pointerDragging = false;
    };

    this.canvasMouseMoveListener = (event:MouseEvent) => {
      if (this.isNativeSectionModeActive()) {
        return;
      }

      if (this.pointerDownX === undefined || this.pointerDownY === undefined) {
        return;
      }

      const deltaX = Math.abs(event.clientX - this.pointerDownX);
      const deltaY = Math.abs(event.clientY - this.pointerDownY);
      if (deltaX > 4 || deltaY > 4) {
        this.pointerDragging = true;
      }
    };

    this.canvasMouseUpListener = (event:MouseEvent) => {
      if (this.isNativeSectionModeActive()) {
        this.pointerDownX = undefined;
        this.pointerDownY = undefined;
        this.pointerDragging = false;
        this.serverLogSelection('canvas_bridge_bypass_section_active');
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const isDrag = this.pointerDragging;
      this.pointerDownX = undefined;
      this.pointerDownY = undefined;
      this.pointerDragging = false;

      if (isDrag) {
        this.serverLogSelection('canvas_mouseup_ignored_drag', {
          shiftKey: event.shiftKey,
        });
        return;
      }

      if (!event.shiftKey) {
        this.appendSelectionOnNextInspect = false;
      }

      const pickedObjectId = this.pickObjectIdFromCanvas(event);
      if (pickedObjectId) {
        this.applyPickedSelection(pickedObjectId, event.shiftKey);
        this.openInspectorForCurrentSelection();
      } else if (!event.shiftKey && this.selectedObjectIds.length > 0) {
        // Left click on empty canvas clears current selection (Speckle-like behavior).
        this.selectedObjectIds = [];
        this.selectedObjectAttributes.clear();
        this.lastDirectMetadataRenderKey = undefined;
        this.syncViewerSelectionToScene();
        this.inspectorVisible$.next(false);
        this.serverLogSelection('canvas_empty_click_clear_selection');
      }

      this.serverLogSelection('canvas_left_click', {
        shiftKey: event.shiftKey,
        pickedObjectId: pickedObjectId || null,
      });

      window.setTimeout(() => {
        if (this.inspectorElementRef) {
          this.scheduleInspectorEnhancement(this.inspectorElementRef);
        }
      }, 0);
    };

    this.outsideClickListener = (event:MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target as HTMLElement|null;
      const insideCanvas = !!target?.closest('[data-test-selector="op-ifc-viewer--canvas"], .xeokit-canvas, canvas');
      const insideInspector = !!target?.closest('[data-test-selector="op-ifc-viewer--inspector-container"]');
      const insideContextMenu = !!target?.closest('.xeokit-context-menu');
      const insideToolbar = !!target?.closest('.op-ifc-viewer--toolbar, .op-ifc-viewer--toolbar-container, .xeokit-toolbar, .xeokit-btn');
      if (insideCanvas || insideInspector || insideContextMenu || insideToolbar) {
        return;
      }

      if (this.selectedObjectIds.length > 0) {
        this.selectedObjectIds = [];
        this.selectedObjectAttributes.clear();
        this.lastDirectMetadataRenderKey = undefined;
        this.syncViewerSelectionToScene();
        this.inspectorVisible$.next(false);
        this.serverLogSelection('outside_click_clear_selection');
        if (this.inspectorElementRef) {
          this.scheduleInspectorEnhancement(this.inspectorElementRef);
        }
      } else if (this.inspectorVisible$.getValue()) {
        this.inspectorVisible$.next(false);
        this.serverLogSelection('outside_click_hide_empty_inspector');
      }
    };

    document.addEventListener('click', this.contextMenuClickListener, true);
    document.addEventListener('contextmenu', this.contextMenuOpenListener, true);
    this.canvasElementRef.addEventListener('mousedown', this.canvasMouseDownListener, true);
    document.addEventListener('mousemove', this.canvasMouseMoveListener, true);
    this.canvasElementRef.addEventListener('mouseup', this.canvasMouseUpListener, true);
    document.addEventListener('mouseup', this.outsideClickListener, true);
    this.serverLogSelection('selection_bridge_attached');
  }

  private isNativeSectionModeActive():boolean {
    const button = document.querySelector('.xeokit-btn.xeokit-section') as HTMLElement|null;
    return !!button?.classList.contains('active');
  }

  private applyPickedSelection(objectId:string, append:boolean):void {
    this.lastPickedObjectId = objectId;
    this.lastPickedAt = Date.now();

    const existingAttributes = this.selectedObjectAttributes.get(objectId) || new Map<string, string>();
    if (!existingAttributes.has('name')) {
      existingAttributes.set('name', objectId);
    }
    if (!existingAttributes.has('uuid')) {
      existingAttributes.set('uuid', objectId);
    }
    if (!existingAttributes.has('viewer id')) {
      existingAttributes.set('viewer id', objectId);
    }

    if (append) {
      if (!this.selectedObjectIds.includes(objectId)) {
        this.selectedObjectIds = [...this.selectedObjectIds, objectId];
      }
      this.selectedObjectAttributes.set(objectId, existingAttributes);
      this.syncViewerSelectionToScene();
      this.serverLogSelection('apply_picked_selection_append', {
        objectId,
        selectedObjectIds: this.selectedObjectIds,
      });
      return;
    }

    this.selectedObjectIds = [objectId];
    this.selectedObjectAttributes.set(objectId, existingAttributes);
    this.syncViewerSelectionToScene();
    this.serverLogSelection('apply_picked_selection_replace', {
      objectId,
      selectedObjectIds: this.selectedObjectIds,
    });
  }

  private openInspectorForCurrentSelection():void {
    this.inspectorVisible$.next(true);
    this.serverLogSelection('open_inspector_for_selection', {
      selectedObjectIds: this.selectedObjectIds,
      selectedCount: this.selectedObjectIds.length,
    });

    if (this.inspectorElementRef) {
      const tabContent = this.inspectorElementRef.querySelector('.xeokit-propertiesTab .xeokit-tab-content') as HTMLElement|null;
      if (tabContent) {
        this.hideXeokitInspectorSections(tabContent);
      }
    }
  }

  private syncViewerSelectionToScene():void {
    try {
      const rawViewer = this.viewer as unknown as {
        viewer?:{
          scene?:{
            objectIds?:string[];
            setObjectsSelected?:(ids:string[], selected:boolean) => void;
          };
        };
        scene?:{
          objectIds?:string[];
          setObjectsSelected?:(ids:string[], selected:boolean) => void;
        };
      };

      const scene = rawViewer?.viewer?.scene || rawViewer?.scene;
      if (!scene?.setObjectsSelected) {
        this.serverLogSelection('scene_setObjectsSelected_unavailable');
        return;
      }

      const allObjectIds = scene.objectIds || [];
      if (allObjectIds.length > 0) {
        scene.setObjectsSelected(allObjectIds, false);
      }

      if (this.selectedObjectIds.length > 0) {
        scene.setObjectsSelected(this.selectedObjectIds, true);
      }

      this.serverLogSelection('scene_selection_synced', {
        selectedObjectIds: this.selectedObjectIds,
      });
    } catch (error) {
      this.serverLogSelection('scene_selection_sync_failed', {
        error: (error as Error)?.message || String(error),
      });
    }
  }

  private pickObjectIdFromCanvas(event:MouseEvent):string|undefined {
    try {
      const canvasHost = this.canvasElementRef;
      if (!canvasHost) {
        return undefined;
      }

      const rawViewer = this.viewer as unknown as {
        viewer?:{ scene?:{ pick?:(params:Record<string, unknown>) => unknown } };
        scene?:{ pick?:(params:Record<string, unknown>) => unknown };
      };

      const scene = rawViewer?.viewer?.scene || rawViewer?.scene;
      if (!scene?.pick) {
        this.serverLogSelection('pick_api_unavailable');
        return undefined;
      }

      const rect = canvasHost.getBoundingClientRect();
      const canvasPos:[number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      const hit = scene.pick({ canvasPos, pickSurface: true }) as {
        id?:string;
        entityId?:string;
        object?:{ id?:string };
        entity?:{ id?:string };
      }|null|undefined;

      const pickedId = hit?.entity?.id || hit?.entityId || hit?.id || hit?.object?.id;
      return typeof pickedId === 'string' && pickedId.length > 0 ? pickedId : undefined;
    } catch (error) {
      this.serverLogSelection('pick_failed', {
        error: (error as Error)?.message || String(error),
      });
      return undefined;
    }
  }

  private teardownContextMenuSelectionBridge():void {
    if (!this.contextMenuClickListener) {
      return;
    }
    document.removeEventListener('click', this.contextMenuClickListener, true);
    if (this.contextMenuOpenListener) {
      document.removeEventListener('contextmenu', this.contextMenuOpenListener, true);
    }
    if (this.canvasMouseUpListener && this.canvasElementRef) {
      this.canvasElementRef.removeEventListener('mouseup', this.canvasMouseUpListener, true);
    }
    if (this.canvasMouseDownListener && this.canvasElementRef) {
      this.canvasElementRef.removeEventListener('mousedown', this.canvasMouseDownListener, true);
    }
    if (this.canvasMouseMoveListener) {
      document.removeEventListener('mousemove', this.canvasMouseMoveListener, true);
    }
    if (this.outsideClickListener) {
      document.removeEventListener('mouseup', this.outsideClickListener, true);
    }
    this.contextMenuClickListener = undefined;
    this.contextMenuOpenListener = undefined;
    this.canvasMouseDownListener = undefined;
    this.canvasMouseMoveListener = undefined;
    this.canvasMouseUpListener = undefined;
    this.outsideClickListener = undefined;
    this.inspectorElementRef = undefined;
    this.canvasElementRef = undefined;
  }

  private updateSelectionStateFromInspector(
    selectedObjectId:string|undefined,
    valueByKey:Map<string, string>,
  ):void {
    const pickIsRecent = this.lastPickedObjectId && (Date.now() - this.lastPickedAt) < 1200;
    if (pickIsRecent && selectedObjectId && selectedObjectId !== this.lastPickedObjectId) {
      this.serverLogSelection('ignore_stale_inspector_selection', {
        inspectorObjectId: selectedObjectId,
        lastPickedObjectId: this.lastPickedObjectId,
      });
      return;
    }

    if (!selectedObjectId) {
      this.serverLogSelection('update_selection_no_selected_object_id');
      return;
    }

    if (selectedObjectId === this.lastPickedObjectId) {
      this.lastPickedObjectId = undefined;
      this.lastPickedAt = 0;
    }

    const snapshot = new Map<string, string>(valueByKey);

    if (this.appendSelectionOnNextInspect) {
      if (!this.selectedObjectIds.includes(selectedObjectId)) {
        this.selectedObjectIds = [...this.selectedObjectIds, selectedObjectId];
      }
      this.selectedObjectAttributes.set(selectedObjectId, snapshot);
      this.appendSelectionOnNextInspect = false;
      this.serverLogSelection('append_selection', {
        selectedObjectId,
        selectedObjectIds: this.selectedObjectIds,
      });
      return;
    }

    this.selectedObjectIds = [selectedObjectId];
    this.selectedObjectAttributes.set(selectedObjectId, snapshot);
    this.serverLogSelection('replace_selection', {
      selectedObjectId,
      selectedObjectIds: this.selectedObjectIds,
    });
  }

  private refreshSelectedAttributesFromInspector(valueByKey:Map<string, string>):void {
    if (valueByKey.size === 0) {
      return;
    }

    for (const objectId of this.selectedObjectIds) {
      const current = this.selectedObjectAttributes.get(objectId) || new Map<string, string>();
      for (const [key, value] of valueByKey.entries()) {
        if (value && value.trim().length > 0) {
          current.set(key, value);
        }
      }
      this.selectedObjectAttributes.set(objectId, current);
    }
  }

  private serverLogSelection(event:string, payload:Record<string, unknown> = {}):void {
    try {
      const projectIdentifier = this.currentProjectService.identifier as string|undefined;
      if (!projectIdentifier) {
        return;
      }

      const message = `[BIM::IFC][SEL] ${event} ${JSON.stringify(payload)}`;
      const endpoint = `${this.pathHelper.projectPath(projectIdentifier)}/bcf/frontend_log`;

      this.httpClient.post(endpoint, {
        source: 'bim_ifc_selection',
        event,
        data: message,
      }).subscribe({
        next: () => {},
        error: () => {},
      });
    } catch (_e) {
      // no-op
    }
  }

  private serverLogSection(event:string, payload:Record<string, unknown> = {}):void {
    try {
      const projectIdentifier = this.currentProjectService.identifier as string|undefined;
      if (!projectIdentifier) {
        return;
      }

      const message = `[BIM::IFC][SECTION] ${event} ${JSON.stringify(payload)}`;
      const endpoint = `${this.pathHelper.projectPath(projectIdentifier)}/bcf/frontend_log`;

      this.httpClient.post(endpoint, {
        source: 'bim_ifc_section',
        event,
        data: message,
      }).subscribe({
        next: () => {},
        error: () => {},
      });
    } catch (_e) {
      // no-op
    }
  }

  private stableRenderConfig():Record<string, unknown> {
    return {
      scaleCanvasResolution: false,
      dtxEnabled: false,
    };
  }

  private startStableRenderLock(initialTarget:ViewerConfigTarget):void {
    this.stopStableRenderLock();
    this.stableRenderTargets.clear();
    this.stableRenderPatchedTargets = new WeakSet<ViewerConfigTarget>();
    this.stableRenderTargets.add(initialTarget);
    for (const target of this.findViewerConfigTargets(window as unknown as Record<string, unknown>)) {
      this.stableRenderTargets.add(target);
    }

    this.applyStableRenderLock();

    // One delayed pass catches wrappers/plugins that initialize after initial viewer boot
    this.stableRenderLockTimer = window.setTimeout(() => {
      for (const target of this.findViewerConfigTargets(window as unknown as Record<string, unknown>)) {
        this.stableRenderTargets.add(target);
      }
      this.applyStableRenderLock();
      this.stableRenderLockTimer = undefined;
    }, 1200);
  }

  private stopStableRenderLock():void {
    if (this.stableRenderLockTimer !== undefined) {
      window.clearTimeout(this.stableRenderLockTimer);
    }
    this.stableRenderLockTimer = undefined;
    this.stableRenderTargets.clear();
  }

  private setupToolbarDebugBridge(toolbarElement:HTMLElement):void {
    this.teardownToolbarDebugBridge();
    this.toolbarDebugElementRef = toolbarElement;

    const logEvent = (phase:'mousedown'|'click', event:MouseEvent) => {
      const now = Date.now();
      if ((now - this.lastToolbarDebugLogAt) < 200) {
        return;
      }
      this.lastToolbarDebugLogAt = now;

      const target = event.target as HTMLElement|null;
      const button = target?.closest('.xeokit-btn') as HTMLElement|null;
      if (!button) {
        return;
      }

      const isDisabled = button.hasAttribute('disabled')
        || button.getAttribute('aria-disabled') === 'true'
        || button.classList.contains('disabled');

      this.serverLogSelection('toolbar_button_event', {
        phase,
        tagName: button.tagName,
        className: button.className,
        title: button.getAttribute('title'),
        ariaLabel: button.getAttribute('aria-label'),
        text: button.textContent?.trim()?.slice(0, 80),
        disabled: isDisabled,
        active: button.classList.contains('active'),
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
    };

    this.toolbarMouseDownListener = (event:MouseEvent) => logEvent('mousedown', event);
    this.toolbarClickListener = (event:MouseEvent) => logEvent('click', event);
    document.addEventListener('mousedown', this.toolbarMouseDownListener, true);
    document.addEventListener('click', this.toolbarClickListener, true);
    this.serverLogSelection('toolbar_debug_bridge_attached', {
      hasToolbarElement: !!toolbarElement,
    });
  }

  private teardownToolbarDebugBridge():void {
    if (this.toolbarMouseDownListener) {
      document.removeEventListener('mousedown', this.toolbarMouseDownListener, true);
    }
    if (this.toolbarClickListener) {
      document.removeEventListener('click', this.toolbarClickListener, true);
    }
    this.toolbarMouseDownListener = undefined;
    this.toolbarClickListener = undefined;
    this.toolbarDebugElementRef = undefined;
  }

  private setupSectionBoxBridge(toolbarElement:HTMLElement):void {
    this.teardownSectionBoxBridge();
    this.sectionControlsHost = toolbarElement;

    const intercept = (event:MouseEvent):void => {
      const target = event.target as HTMLElement|null;
      const button = target?.closest('.xeokit-btn.xeokit-section') as HTMLElement|null;
      if (!button) {
        return;
      }
      const wasActive = button.classList.contains('active');

      const now = Date.now();
      if ((now - this.sectionLastToggleAt) < 250) {
        return;
      }
      this.sectionLastToggleAt = now;

      this.sectionButtonRef = button;
      this.serverLogSection('native_slice_passthrough', {
        className: button.className,
        wasActive,
      });

      // Keep native xeokit behavior and recenter only when turning ON.
      if (!wasActive) {
        this.scheduleNativeSectionCentering();
      }
    };

    this.sectionToolbarMouseDownListener = undefined;
    this.sectionToolbarClickListener = intercept;
    document.addEventListener('click', this.sectionToolbarClickListener, true);
    this.serverLogSection('bridge_attached', {
      hasToolbarElement: !!toolbarElement,
    });
  }

  private teardownSectionBoxBridge():void {
    if (this.sectionToolbarMouseDownListener) {
      document.removeEventListener('mousedown', this.sectionToolbarMouseDownListener, true);
    }
    if (this.sectionToolbarClickListener) {
      document.removeEventListener('click', this.sectionToolbarClickListener, true);
    }
    this.sectionToolbarMouseDownListener = undefined;
    this.sectionToolbarClickListener = undefined;
    this.sectionButtonRef?.classList.remove('active');
    this.sectionButtonRef = undefined;
    // Do not alter native slice state on teardown.
    this.sectionControlsRoot?.remove();
    this.sectionControlsRoot = undefined;
    this.sectionControlsHost = undefined;
    this.sectionBoxState = undefined;
  }

  private scheduleNativeSectionCentering():void {
    if (this.nativeSectionCenterJob) {
      window.clearTimeout(this.nativeSectionCenterJob);
    }
    this.nativeSectionCenterJob = window.setTimeout(() => {
      this.nativeSectionCenterJob = undefined;
      this.centerNativeSectionTool();
    }, 120);
  }

  private centerNativeSectionTool():void {
    const sectionButton = document.querySelector('.xeokit-btn.xeokit-section') as HTMLElement|null;
    if (!sectionButton?.classList.contains('active')) {
      return;
    }

    const center = this.getStableNativeSectionCenter();
    if (!center) {
      this.serverLogSection('native_center_skipped', { reason: 'scene_bounds_unavailable' });
      return;
    }

    const rawViewer = this.viewer as unknown as Record<string, unknown>;
    const sectionTool = (rawViewer?._sectionTool || (rawViewer as { viewer?:Record<string, unknown> })?.viewer?._sectionTool) as Record<string, unknown>|undefined;

    if (!sectionTool) {
      this.serverLogSection('native_center_skipped', { reason: 'section_tool_missing', center });
      return;
    }

    const pluginResult = this.applyNativeCenterViaSectionPlanesPlugin(sectionTool, center);
    if (pluginResult.applied) {
      this.serverLogSection('native_center_applied', { center, appliedBy: pluginResult.appliedBy });
      return;
    }

    const syntheticPickApplied = this.dispatchNativeSectionPickAtCenter(center);
    if (syntheticPickApplied) {
      this.serverLogSection('native_center_applied', { center, appliedBy: 'synthetic_canvas_pick_center' });
      window.setTimeout(() => this.postPickCenterExistingNativePlane(center), 140);
      return;
    }

    const result = this.applyNativeSectionCenterByReflection(sectionTool, center);
    if (result.applied) {
      this.serverLogSection('native_center_applied', { center, appliedBy: result.appliedBy });
      return;
    }

    this.serverLogSection('native_center_skipped', {
      reason: 'no_supported_method',
      center,
      syntheticPickApplied,
      pluginMethods: pluginResult.pluginMethods.slice(0, 80),
      pluginKeys: pluginResult.pluginKeys.slice(0, 60),
      availableMethods: result.availableMethods.slice(0, 80),
      availableObjects: result.availableObjects.slice(0, 40),
    });
  }

  private dispatchNativeSectionPickAtCenter(center:[number, number, number]):boolean {
    const canvas = this.canvasElementRef
      || (document.querySelector('[data-test-selector="op-ifc-viewer--canvas"] canvas, .xeokit-canvas canvas, canvas') as HTMLCanvasElement|null);
    if (!canvas) {
      return false;
    }

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }

    const clientPoint = this.projectWorldCenterToClientPoint(center, rect) || {
      x: rect.left + (rect.width / 2),
      y: rect.top + (rect.height / 2),
    };

    const init:MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
    };

    const pointerInit:PointerEventInit = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: clientPoint.x,
      clientY: clientPoint.y,
    };

    canvas.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
    canvas.dispatchEvent(new PointerEvent('pointerup', pointerInit));
    canvas.dispatchEvent(new MouseEvent('mousedown', init));
    canvas.dispatchEvent(new MouseEvent('mouseup', init));
    canvas.dispatchEvent(new MouseEvent('click', init));
    return true;
  }

  private getStableNativeSectionCenter():[number, number, number]|undefined {
    if (this.nativeSectionBaseCenter) {
      return this.nativeSectionBaseCenter;
    }

    const sceneAABB = this.getSceneAABB();
    if (!sceneAABB) {
      return undefined;
    }

    this.nativeSectionBaseCenter = [
      (sceneAABB[0] + sceneAABB[3]) / 2,
      (sceneAABB[1] + sceneAABB[4]) / 2,
      (sceneAABB[2] + sceneAABB[5]) / 2,
    ];

    this.serverLogSection('native_center_base_cached', {
      center: this.nativeSectionBaseCenter,
      sceneAABB,
    });

    return this.nativeSectionBaseCenter;
  }

  private postPickCenterExistingNativePlane(center:[number, number, number]):void {
    const sectionButton = document.querySelector('.xeokit-btn.xeokit-section') as HTMLElement|null;
    if (!sectionButton?.classList.contains('active')) {
      return;
    }

    const rawViewer = this.viewer as unknown as Record<string, unknown>;
    const sectionTool = (rawViewer?._sectionTool || (rawViewer as { viewer?:Record<string, unknown> })?.viewer?._sectionTool) as Record<string, unknown>|undefined;
    if (!sectionTool) {
      return;
    }

    const pluginResult = this.applyNativeCenterViaSectionPlanesPlugin(sectionTool, center);
    if (pluginResult.applied) {
      this.serverLogSection('native_center_post_pick_applied', { center, appliedBy: pluginResult.appliedBy });
    }
  }

  private projectWorldCenterToClientPoint(
    center:[number, number, number],
    rect:DOMRect,
  ):{ x:number, y:number }|undefined {
    const rawViewer = this.viewer as unknown as {
      viewer?:{ scene?:{ camera?:Record<string, unknown> } };
      scene?:{ camera?:Record<string, unknown> };
    };
    const camera = rawViewer?.viewer?.scene?.camera || rawViewer?.scene?.camera;
    if (!camera) {
      return undefined;
    }

    const tryProject = (fnName:string):{ x:number, y:number }|undefined => {
      const fn = camera[fnName];
      if (typeof fn !== 'function') {
        return undefined;
      }
      try {
        const projected = (fn as (...args:unknown[]) => unknown).call(camera, center);
        const asArray = this.toNumericArray(projected);
        if (!asArray || asArray.length < 2) {
          return undefined;
        }

        // Some APIs return NDC [-1,1], others return canvas pixels.
        const px = asArray[0];
        const py = asArray[1];
        if (Math.abs(px) <= 1.2 && Math.abs(py) <= 1.2) {
          return {
            x: rect.left + ((px + 1) * 0.5 * rect.width),
            y: rect.top + ((1 - (py + 1) * 0.5) * rect.height),
          };
        }

        return {
          x: rect.left + px,
          y: rect.top + py,
        };
      } catch (_e) {
        return undefined;
      }
    };

    return tryProject('projectWorldPos')
      || tryProject('projectWorldPosition')
      || undefined;
  }

  private applyNativeCenterViaSectionPlanesPlugin(
    sectionTool:Record<string, unknown>,
    center:[number, number, number],
  ):{ applied:boolean, appliedBy?:string, pluginMethods:string[], pluginKeys:string[] } {
    const plugin = sectionTool._sectionPlanesPlugin as Record<string, unknown>|undefined;
    if (!plugin || typeof plugin !== 'object') {
      return { applied: false, pluginMethods: [], pluginKeys: [] };
    }

    const pluginKeys = Object.keys(plugin);
    const pluginMethods = pluginKeys.filter((k) => typeof plugin[k] === 'function');
    const centerVec = { x: center[0], y: center[1], z: center[2] };

    // First try moving existing plane to avoid duplicating section planes.
    const planesRaw = (plugin.sectionPlanes
      || plugin._sectionPlanes
      || plugin.planes
      || plugin._planes) as unknown;
    const planes = this.extractCollectionValues(planesRaw).filter((v) => v && typeof v === 'object') as Record<string, unknown>[];
    const firstPlane = planes[0];
    if (firstPlane) {
      const orientationAppliedBy = this.normalizeNativeSectionPlaneOrientation(firstPlane);

      const moveWithMethod = (plane:Record<string, unknown>):string|undefined => {
        const methods = ['setPos', 'setPosition', 'setOrigin', 'setCenter'];
        for (const method of methods) {
          const fn = plane[method];
          if (typeof fn !== 'function') {
            continue;
          }
          try {
            (fn as (...args:unknown[]) => unknown).call(plane, center);
            return method;
          } catch (_e) {
            try {
              (fn as (...args:unknown[]) => unknown).call(plane, centerVec);
              return method;
            } catch (_e2) {
              // try next
            }
          }
        }
        return undefined;
      };

      const methodUsed = moveWithMethod(firstPlane);
      if (methodUsed) {
        const orientationAppliedBy2 = this.normalizeNativeSectionPlaneOrientation(firstPlane);
        return {
          applied: true,
          appliedBy: `_sectionPlanesPlugin.firstPlane.${methodUsed}${orientationAppliedBy2 ? `+dir:${orientationAppliedBy2}` : ''}`,
          pluginMethods,
          pluginKeys,
        };
      }

      for (const prop of ['pos', 'position', 'origin', 'center']) {
        if (!(prop in firstPlane)) {
          continue;
        }
        try {
          firstPlane[prop] = centerVec;
          const orientationAppliedBy3 = this.normalizeNativeSectionPlaneOrientation(firstPlane);
          return {
            applied: true,
            appliedBy: `_sectionPlanesPlugin.firstPlane.${prop}=vec3${orientationAppliedBy3 ? `+dir:${orientationAppliedBy3}` : ''}`,
            pluginMethods,
            pluginKeys,
          };
        } catch (_e) {
          try {
            firstPlane[prop] = center;
            const orientationAppliedBy4 = this.normalizeNativeSectionPlaneOrientation(firstPlane);
            return {
              applied: true,
              appliedBy: `_sectionPlanesPlugin.firstPlane.${prop}=array${orientationAppliedBy4 ? `+dir:${orientationAppliedBy4}` : ''}`,
              pluginMethods,
              pluginKeys,
            };
          } catch (_e2) {
            // continue
          }
        }
      }
    }

    return { applied: false, pluginMethods, pluginKeys };
  }

  private normalizeNativeSectionPlaneOrientation(plane:Record<string, unknown>):string|undefined {
    const dirArray:[number, number, number] = [0, 0, -1];
    const dirVec = { x: 0, y: 0, z: -1 };

    const applyFn = (name:string, arg:unknown):boolean => {
      const fn = plane[name];
      if (typeof fn !== 'function') {
        return false;
      }
      try {
        (fn as (...args:unknown[]) => unknown).call(plane, arg);
        return true;
      } catch (_e) {
        return false;
      }
    };

    if (
      applyFn('setDir', dirArray)
      || applyFn('setDir', dirVec)
      || applyFn('setDirection', dirArray)
      || applyFn('setDirection', dirVec)
      || applyFn('setNormal', dirArray)
      || applyFn('setNormal', dirVec)
    ) {
      return 'setDir/setDirection/setNormal';
    }

    for (const prop of ['dir', 'direction', 'normal']) {
      if (!(prop in plane)) {
        continue;
      }
      try {
        plane[prop] = dirVec;
        return `${prop}=vec3`;
      } catch (_e) {
        try {
          plane[prop] = dirArray;
          return `${prop}=array`;
        } catch (_e2) {
          // continue
        }
      }
    }

    // Some builds keep direction in nested structs.
    for (const prop of ['dir', 'direction', 'normal']) {
      const nested = plane[prop] as Record<string, unknown>|undefined;
      if (!nested || typeof nested !== 'object') {
        continue;
      }

      const nestedSetter = nested.set as ((x:number, y:number, z:number) => unknown)|undefined;
      if (typeof nestedSetter === 'function') {
        try {
          nestedSetter.call(nested, 0, 0, -1);
          return `${prop}.set(0,0,-1)`;
        } catch (_e) {
          // continue
        }
      }

      try {
        nested.x = 0;
        nested.y = 0;
        nested.z = -1;
        return `${prop}.xyz`;
      } catch (_e) {
        // continue
      }
    }

    return undefined;
  }

  private applyNativeSectionCenterByReflection(
    sectionTool:Record<string, unknown>,
    center:[number, number, number],
  ):{ applied:boolean, appliedBy?:string, availableMethods:string[], availableObjects:string[] } {
    const centerVec = { x: center[0], y: center[1], z: center[2] };
    const candidates:Array<{ owner:Record<string, unknown>, ownerName:string }> = [{ owner: sectionTool, ownerName: 'sectionTool' }];
    const availableMethods:string[] = [];
    const availableObjects:string[] = [];
    const methodRegex = /(center|origin|position|pos|plane)/i;
    const setterRegex = /^set/i;

    for (const [key, value] of Object.entries(sectionTool)) {
      if (value && typeof value === 'object') {
        candidates.push({ owner: value as Record<string, unknown>, ownerName: `sectionTool.${key}` });
        availableObjects.push(`sectionTool.${key}`);
      }
    }

    for (const { owner, ownerName } of candidates) {
      for (const [key, value] of Object.entries(owner)) {
        if (typeof value !== 'function') {
          continue;
        }

        availableMethods.push(`${ownerName}.${key}`);
        if (!setterRegex.test(key) || !methodRegex.test(key)) {
          continue;
        }

        const fn = value as (...params:unknown[]) => unknown;
        const attempts:unknown[][] = [[center], [centerVec], [center[0], center[1], center[2]]];
        for (const args of attempts) {
          try {
            fn.apply(owner, args);
            return { applied: true, appliedBy: `${ownerName}.${key}`, availableMethods, availableObjects };
          } catch (_e) {
            // try next signature
          }
        }
      }
    }

    // Property assignment fallback for tools exposing mutable center/origin/position/pos.
    const propNames = ['center', 'origin', 'position', 'pos'];
    for (const { owner, ownerName } of candidates) {
      for (const prop of propNames) {
        if (!(prop in owner)) {
          continue;
        }
        try {
          owner[prop] = centerVec;
          return { applied: true, appliedBy: `${ownerName}.${prop}=vec3`, availableMethods, availableObjects };
        } catch (_e) {
          try {
            owner[prop] = center;
            return { applied: true, appliedBy: `${ownerName}.${prop}=array`, availableMethods, availableObjects };
          } catch (_e2) {
            // continue
          }
        }
      }
    }

    return { applied: false, availableMethods, availableObjects };
  }

  private toggleSectionBoxMode():boolean {
    const currentlyActive = !!this.sectionBoxState?.active;

    if (currentlyActive) {
      this.sectionBoxState = undefined;
      this.clearSectionBoxViewpoint();
      this.sectionButtonRef?.classList.remove('active');
      this.setSectionControlsVisible(false);
      this.serverLogSection('disabled');
      return true;
    }

    const initialized = this.initializeSectionBoxFromScene();
    if (!initialized || !this.sectionBoxState) {
      this.serverLogSection('enable_failed', { reason: 'scene_bounds_unavailable' });
      return false;
    }

    this.sectionBoxState.active = true;
    this.sectionButtonRef?.classList.add('active');
    this.ensureSectionControlsPanel();
    this.setSectionControlsVisible(true);
    this.applySectionBoxViewpoint('enable');
    return true;
  }

  private initializeSectionBoxFromScene():boolean {
    const sceneAABB = this.getSceneAABB();
    if (!sceneAABB) {
      return false;
    }

    const [xmin, ymin, zmin, xmax, ymax, zmax] = sceneAABB;
    const dx = Math.max(0.001, xmax - xmin);
    const dy = Math.max(0.001, ymax - ymin);
    const dz = Math.max(0.001, zmax - zmin);

    // Inflate a bit to avoid clipping precision artifacts exactly on model bounds.
    const margin = 1.03;
    this.sectionBoxState = {
      center: [
        xmin + (dx / 2),
        ymin + (dy / 2),
        zmin + (dz / 2),
      ],
      halfSize: [
        (dx / 2) * margin,
        (dy / 2) * margin,
        (dz / 2) * margin,
      ],
      active: false,
    };

    this.serverLogSection('initialized_from_scene', {
      sceneAABB,
      center: this.sectionBoxState.center,
      halfSize: this.sectionBoxState.halfSize,
    });

    return true;
  }

  private getSceneAABB():[number, number, number, number, number, number]|undefined {
    const rawViewer = this.viewer as unknown as {
      viewer?:{
        scene?:{
          aabb?:number[];
          getAABB?:(ids?:string[]) => number[];
          visibleObjectIds?:string[];
        };
      };
      scene?:{
        aabb?:number[];
        getAABB?:(ids?:string[]) => number[];
        visibleObjectIds?:string[];
      };
    };

    const scene = rawViewer?.viewer?.scene || rawViewer?.scene;
    const directAABB = scene?.aabb;
    const parsedDirect = this.parseAABB(directAABB);
    if (parsedDirect) {
      return parsedDirect;
    }

    try {
      const getAABB = scene?.getAABB;
      if (typeof getAABB === 'function') {
        const byAll = this.parseAABB(getAABB.call(scene));
        if (byAll) {
          this.serverLogSection('scene_aabb_from_getAABB');
          return byAll;
        }

        const visibleIds = Array.isArray(scene?.visibleObjectIds) ? scene.visibleObjectIds : [];
        if (visibleIds.length > 0) {
          const byVisible = this.parseAABB(getAABB.call(scene, visibleIds));
          if (byVisible) {
            this.serverLogSection('scene_aabb_from_getAABB_visible_ids', {
              visibleCount: visibleIds.length,
            });
            return byVisible;
          }
        }
      }
    } catch (error) {
      this.serverLogSection('scene_aabb_getAABB_failed', {
        error: (error as Error)?.message || String(error),
      });
    }

    const scanned = this.scanObjectGraphForAABB(rawViewer as unknown as Record<string, unknown>);
    if (scanned) {
      this.serverLogSection('scene_aabb_from_object_scan');
      return scanned;
    }

    const fromSceneObjects = this.buildAABBFromSceneObjects(scene as unknown as Record<string, unknown>);
    if (fromSceneObjects) {
      this.serverLogSection('scene_aabb_from_scene_objects');
      return fromSceneObjects;
    }

    const heuristic = this.findAABBHeuristically(rawViewer as unknown as Record<string, unknown>);
    if (heuristic) {
      this.serverLogSection('scene_aabb_from_heuristic', {
        path: heuristic.path,
      });
      return heuristic.aabb;
    }

    try {
      const topKeys = Object.keys((rawViewer || {}) as Record<string, unknown>).slice(0, 40);
      const sceneObj = (rawViewer?.viewer?.scene || rawViewer?.scene || {}) as Record<string, unknown>;
      const sceneKeys = Object.keys(sceneObj).slice(0, 60);
      this.serverLogSection('scene_aabb_missing', {
        topKeys,
        sceneKeys,
      });
    } catch (_e) {
      this.serverLogSection('scene_aabb_missing');
    }
    return undefined;
  }

  private parseAABB(value:unknown):[number, number, number, number, number, number]|undefined {
    const asArray = this.toNumericArray(value);
    if (!asArray || asArray.length < 6) {
      return undefined;
    }

    const parsed = asArray.slice(0, 6).map((v) => Number(v));
    if (parsed.some((v) => !Number.isFinite(v))) {
      return undefined;
    }

    const [xmin, ymin, zmin, xmax, ymax, zmax] = parsed;
    if ((xmax - xmin) <= 0 || (ymax - ymin) <= 0 || (zmax - zmin) <= 0) {
      return undefined;
    }

    return parsed as [number, number, number, number, number, number];
  }

  private toNumericArray(value:unknown):number[]|undefined {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((v) => Number(v));
    }

    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>).map((v) => Number(v));
    }

    return undefined;
  }

  private scanObjectGraphForAABB(root:Record<string, unknown>):[number, number, number, number, number, number]|undefined {
    const seen = new Set<Record<string, unknown>>();
    const stack:Record<string, unknown>[] = [root];
    let visited = 0;
    const maxVisited = 2500;

    while (stack.length > 0 && visited < maxVisited) {
      const current = stack.pop();
      if (!current || seen.has(current)) {
        continue;
      }

      visited += 1;
      seen.add(current);

      const direct = this.parseAABB((current as { aabb?:unknown }).aabb);
      if (direct) {
        return direct;
      }

      for (const value of Object.values(current)) {
        if (!value) {
          continue;
        }
        if (typeof value === 'object') {
          stack.push(value as Record<string, unknown>);
        }
      }
    }

    return undefined;
  }

  private findAABBHeuristically(
    root:Record<string, unknown>,
  ):{ aabb:[number, number, number, number, number, number], path:string }|undefined {
    const seen = new Set<Record<string, unknown>>();
    const stack:Array<{ node:Record<string, unknown>, path:string }> = [{ node: root, path: 'root' }];
    let visited = 0;
    const maxVisited = 6000;
    const keyPattern = /(aabb|bounds|bbox|worldaabb|sceneaabb|min|max|center|halfsize)/i;

    while (stack.length > 0 && visited < maxVisited) {
      const current = stack.pop();
      if (!current || seen.has(current.node)) {
        continue;
      }

      visited += 1;
      seen.add(current.node);

      for (const [key, value] of Object.entries(current.node)) {
        const keyPath = `${current.path}.${key}`;

        if (Array.isArray(value) && keyPattern.test(key)) {
          const parsed = this.parseAABB(value);
          if (parsed) {
            return { aabb: parsed, path: keyPath };
          }
        }

        if (value && typeof value === 'object') {
          const obj = value as Record<string, unknown>;

          if (keyPattern.test(key)) {
            const objectAABB = this.parseAABBObject(obj);
            if (objectAABB) {
              return { aabb: objectAABB, path: keyPath };
            }
          }

          stack.push({ node: obj, path: keyPath });
        }
      }
    }

    return undefined;
  }

  private parseAABBObject(
    value:Record<string, unknown>,
  ):[number, number, number, number, number, number]|undefined {
    const min = this.toNumericArray(value.min) || this.toNumericArray(value.minimum);
    const max = this.toNumericArray(value.max) || this.toNumericArray(value.maximum);
    if (min && max && min.length >= 3 && max.length >= 3) {
      return this.parseAABB([min[0], min[1], min[2], max[0], max[1], max[2]]);
    }

    const center = this.toNumericArray(value.center);
    const halfSize = this.toNumericArray(value.halfSize) || this.toNumericArray(value.halfsize);
    if (center && halfSize && center.length >= 3 && halfSize.length >= 3) {
      return this.parseAABB([
        center[0] - halfSize[0],
        center[1] - halfSize[1],
        center[2] - halfSize[2],
        center[0] + halfSize[0],
        center[1] + halfSize[1],
        center[2] + halfSize[2],
      ]);
    }

    return undefined;
  }

  private buildAABBFromSceneObjects(
    scene:Record<string, unknown>|undefined,
  ):[number, number, number, number, number, number]|undefined {
    if (!scene) {
      return undefined;
    }

    const containers = [
      { name: 'visibleObjects', value: scene.visibleObjects },
      { name: 'objects', value: scene.objects },
      { name: 'models', value: scene.models },
      { name: 'components', value: scene.components },
    ];

    let xmin = Number.POSITIVE_INFINITY;
    let ymin = Number.POSITIVE_INFINITY;
    let zmin = Number.POSITIVE_INFINITY;
    let xmax = Number.NEGATIVE_INFINITY;
    let ymax = Number.NEGATIVE_INFINITY;
    let zmax = Number.NEGATIVE_INFINITY;
    let hits = 0;

    const diagnostics:Array<{ name:string, type:string, count:number }> = [];

    for (const container of containers) {
      const values = this.extractCollectionValues(container.value);
      diagnostics.push({
        name: container.name,
        type: this.describeCollection(container.value),
        count: values.length,
      });

      for (const obj of values) {
        if (!obj || typeof obj !== 'object') {
          continue;
        }

        const rec = obj as Record<string, unknown>;
        const aabb = this.parseAABB(rec.aabb)
          || this.parseAABB(rec.worldAABB)
          || this.parseAABB(rec.bbox);
        if (!aabb) {
          continue;
        }

        hits += 1;
        xmin = Math.min(xmin, aabb[0]);
        ymin = Math.min(ymin, aabb[1]);
        zmin = Math.min(zmin, aabb[2]);
        xmax = Math.max(xmax, aabb[3]);
        ymax = Math.max(ymax, aabb[4]);
        zmax = Math.max(zmax, aabb[5]);
      }
    }

    if (hits === 0) {
      this.serverLogSection('scene_objects_scan_empty', { diagnostics });
      return undefined;
    }

    const aggregated:[number, number, number, number, number, number] = [xmin, ymin, zmin, xmax, ymax, zmax];
    this.serverLogSection('scene_objects_scan_hit', { hits, diagnostics, aggregated });
    return this.parseAABB(aggregated);
  }

  private extractCollectionValues(source:unknown):unknown[] {
    if (!source) {
      return [];
    }

    if (Array.isArray(source)) {
      return source;
    }

    if (source instanceof Map) {
      return Array.from(source.values());
    }

    if (source instanceof Set) {
      return Array.from(source.values());
    }

    if (typeof source === 'object') {
      const asRecord = source as Record<string, unknown>;

      const valuesFn = asRecord.values;
      if (typeof valuesFn === 'function') {
        try {
          const iterator = valuesFn.call(source) as Iterable<unknown>;
          if (iterator && typeof (iterator as { [Symbol.iterator]?:unknown })[Symbol.iterator] === 'function') {
            return Array.from(iterator);
          }
        } catch (_e) {
          // ignore and continue with object values fallback
        }
      }

      const forEachFn = asRecord.forEach;
      if (typeof forEachFn === 'function') {
        try {
          const values:unknown[] = [];
          forEachFn.call(source, (value:unknown) => values.push(value));
          if (values.length > 0) {
            return values;
          }
        } catch (_e) {
          // ignore and continue with object values fallback
        }
      }

      return Object.values(asRecord);
    }

    return [];
  }

  private describeCollection(source:unknown):string {
    if (!source) {
      return 'nullish';
    }
    if (Array.isArray(source)) {
      return 'array';
    }
    if (source instanceof Map) {
      return 'map';
    }
    if (source instanceof Set) {
      return 'set';
    }
    if (typeof source === 'object') {
      const rec = source as Record<string, unknown>;
      if (typeof rec.values === 'function') {
        return 'object:values()';
      }
      if (typeof rec.forEach === 'function') {
        return 'object:forEach()';
      }
      return 'object';
    }
    return typeof source;
  }

  private updateSectionBox(action:SectionDeltaAction):void {
    if (!this.sectionBoxState?.active) {
      return;
    }

    const state = this.sectionBoxState;
    const moveStep = Math.max(
      state.halfSize[0],
      state.halfSize[1],
      state.halfSize[2],
    ) * 0.08;
    const resizeStep = Math.max(
      state.halfSize[0],
      state.halfSize[1],
      state.halfSize[2],
    ) * 0.06;

    switch (action) {
      case 'x-':
        state.center[0] -= moveStep;
        break;
      case 'x+':
        state.center[0] += moveStep;
        break;
      case 'y-':
        state.center[1] -= moveStep;
        break;
      case 'y+':
        state.center[1] += moveStep;
        break;
      case 'z-':
        state.center[2] -= moveStep;
        break;
      case 'z+':
        state.center[2] += moveStep;
        break;
      case 'size-':
        state.halfSize = state.halfSize.map((v) => Math.max(0.05, v - resizeStep)) as [number, number, number];
        break;
      case 'size+':
        state.halfSize = state.halfSize.map((v) => v + resizeStep) as [number, number, number];
        break;
      default:
        break;
    }

    this.serverLogSection('controls_delta', {
      action,
      center: state.center,
      halfSize: state.halfSize,
    });
    this.applySectionBoxViewpoint(`delta:${action}`);
  }

  private applySectionBoxViewpoint(reason:string):void {
    if (!this.viewer || !this.sectionBoxState?.active) {
      return;
    }

    try {
      const base = this.viewer.saveBCFViewpoint({
        spacesVisible: true,
        reverseClippingPlanes: true,
      }) as CreateBcfViewpointData;

      const clippingPlanes = this.buildSectionClippingPlanes(this.sectionBoxState);
      const lines = this.buildSectionBoxLines(this.sectionBoxState);
      const viewpoint:CreateBcfViewpointData = {
        ...base,
        clipping_planes: clippingPlanes,
        lines,
      };

      this.viewer.loadBCFViewpoint(viewpoint as unknown as BcfViewpointData, {
        immediate: true,
        updateCompositeObjects: true,
        reverseClippingPlanes: false,
      });

      this.serverLogSection('viewpoint_applied', {
        reason,
        clippingPlaneCount: clippingPlanes.length,
        lineCount: lines.length,
        center: this.sectionBoxState.center,
        halfSize: this.sectionBoxState.halfSize,
      });
    } catch (error) {
      this.serverLogSection('viewpoint_apply_failed', {
        reason,
        error: (error as Error)?.message || String(error),
      });
    }
  }

  private clearSectionBoxViewpoint():void {
    if (!this.viewer) {
      return;
    }

    try {
      const base = this.viewer.saveBCFViewpoint({
        spacesVisible: true,
        reverseClippingPlanes: true,
      }) as CreateBcfViewpointData;

      const viewpoint:CreateBcfViewpointData = {
        ...base,
        clipping_planes: [],
        lines: [],
      };

      this.viewer.loadBCFViewpoint(viewpoint as unknown as BcfViewpointData, {
        immediate: true,
        updateCompositeObjects: true,
        reverseClippingPlanes: false,
      });
      this.serverLogSection('viewpoint_cleared');
    } catch (error) {
      this.serverLogSection('viewpoint_clear_failed', {
        error: (error as Error)?.message || String(error),
      });
    }
  }

  private buildSectionClippingPlanes(state:SectionBoxState):NonNullable<CreateBcfViewpointData['clipping_planes']> {
    const [cx, cy, cz] = state.center;
    const [hx, hy, hz] = state.halfSize;

    return [
      { location: { x: cx - hx, y: cy, z: cz }, direction: { x: 1, y: 0, z: 0 } },
      { location: { x: cx + hx, y: cy, z: cz }, direction: { x: -1, y: 0, z: 0 } },
      { location: { x: cx, y: cy - hy, z: cz }, direction: { x: 0, y: 1, z: 0 } },
      { location: { x: cx, y: cy + hy, z: cz }, direction: { x: 0, y: -1, z: 0 } },
      { location: { x: cx, y: cy, z: cz - hz }, direction: { x: 0, y: 0, z: 1 } },
      { location: { x: cx, y: cy, z: cz + hz }, direction: { x: 0, y: 0, z: -1 } },
    ];
  }

  private buildSectionBoxLines(state:SectionBoxState):NonNullable<CreateBcfViewpointData['lines']> {
    const [cx, cy, cz] = state.center;
    const [hx, hy, hz] = state.halfSize;

    const v = [
      { x: cx - hx, y: cy - hy, z: cz - hz },
      { x: cx + hx, y: cy - hy, z: cz - hz },
      { x: cx + hx, y: cy + hy, z: cz - hz },
      { x: cx - hx, y: cy + hy, z: cz - hz },
      { x: cx - hx, y: cy - hy, z: cz + hz },
      { x: cx + hx, y: cy - hy, z: cz + hz },
      { x: cx + hx, y: cy + hy, z: cz + hz },
      { x: cx - hx, y: cy + hy, z: cz + hz },
    ];

    const edges:[number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    return edges.map(([a, b]) => ({
      start_point: v[a],
      end_point: v[b],
    }));
  }

  private ensureSectionControlsPanel():void {
    if (this.sectionControlsRoot || !this.sectionControlsHost) {
      return;
    }

    const root = document.createElement('div');
    root.className = 'op-ifc-viewer--section-controls';
    root.dataset.testSelector = 'op-ifc-viewer--section-controls';

    const title = document.createElement('div');
    title.className = 'op-ifc-viewer--section-controls-title';
    title.textContent = 'Section box';
    root.appendChild(title);

    const buttons:Array<{ label:string, action:SectionDeltaAction }> = [
      { label: 'Up', action: 'z+' },
      { label: 'Down', action: 'z-' },
      { label: 'Left', action: 'x-' },
      { label: 'Right', action: 'x+' },
      { label: 'Front', action: 'y+' },
      { label: 'Back', action: 'y-' },
      { label: 'Expand', action: 'size+' },
      { label: 'Shrink', action: 'size-' },
    ];

    const grid = document.createElement('div');
    grid.className = 'op-ifc-viewer--section-controls-grid';
    for (const { label, action } of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'xeokit-btn op-ifc-viewer--section-control-btn';
      btn.textContent = label;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.updateSectionBox(action);
      });
      grid.appendChild(btn);
    }
    root.appendChild(grid);

    this.sectionControlsHost.appendChild(root);
    this.sectionControlsRoot = root;
  }

  private setSectionControlsVisible(visible:boolean):void {
    if (!this.sectionControlsRoot) {
      return;
    }
    this.sectionControlsRoot.style.display = visible ? 'block' : 'none';
  }

  private applyStableRenderLock():void {
    for (const target of this.stableRenderTargets) {
      this.patchViewerConfigMethods(target);
      this.applyStableRenderConfig(target);
    }
  }

  private patchViewerConfigMethods(target:ViewerConfigTarget):void {
    if (this.stableRenderPatchedTargets.has(target)) {
      return;
    }

    const config = this.stableRenderConfig();

    if (typeof target.setConfig === 'function') {
      const original = target.setConfig.bind(target);
      target.setConfig = (key:string, value:unknown) => {
        const forcedValue = Object.prototype.hasOwnProperty.call(config, key) ? config[key] : value;
        return original(key, forcedValue);
      };
    }

    if (typeof target.setConfigs === 'function') {
      const original = target.setConfigs.bind(target);
      target.setConfigs = (values:Record<string, unknown>) => original({
        ...(values || {}),
        ...config,
      });
    }

    this.stableRenderPatchedTargets.add(target);
  }

  private applyStableRenderConfig(target:ViewerConfigTarget):void {
    const config = this.stableRenderConfig();

    if (typeof target.setConfigs === 'function') {
      target.setConfigs(config);
    } else if (typeof target.setConfig === 'function') {
      for (const [key, value] of Object.entries(config)) {
        target.setConfig(key, value);
      }
    }

    const fastNav = target._fastNavPlugin;
    if (fastNav) {
      this.applyFastNavStabilityFlags(fastNav);
    }

    const scene = target.scene || target.viewer?.scene;
    if (scene) {
      if (scene.sao) {
        scene.sao.enabled = false;
      }
    }

    target.requestRender?.();
    target.viewer?.requestRender?.();
  }

  private applyFastNavStabilityFlags(plugin:Record<string, unknown>):void {
    plugin.hideEdges = false;
    plugin.hideSAO = false;
    plugin.hidePBR = false;
    plugin.hideColorTexture = false;
    plugin.hideTransparentObjects = false;
    plugin.scaleCanvasResolution = false;
    plugin.delayBeforeRestoreSeconds = 0;
    plugin.delayBeforeRestore = 0;
  }

  private findViewerConfigTargets(root:Record<string, unknown>):ViewerConfigTarget[] {
    const results = new Set<ViewerConfigTarget>();
    const seen = new Set<Record<string, unknown>>();
    const stack:Record<string, unknown>[] = [root];
    let visited = 0;
    const maxVisited = 4000;

    while (stack.length > 0 && visited < maxVisited) {
      const current = stack.pop();
      if (!current || seen.has(current)) {
        continue;
      }
      visited += 1;
      seen.add(current);

      const target = current as unknown as ViewerConfigTarget;
      const hasConfigSetter = typeof target.setConfig === 'function' || typeof target.setConfigs === 'function';
      const hasScene = !!target.scene || !!target.viewer?.scene;
      if (hasConfigSetter && hasScene) {
        results.add(target);
      }

      for (const value of Object.values(current)) {
        if (value && typeof value === 'object') {
          stack.push(value as Record<string, unknown>);
        }
      }
    }

    return Array.from(results);
  }

  private hideXeokitAttributesContainer(tabContent:HTMLElement):void {
    const wrappers = Array.from(tabContent.querySelectorAll('.element-attributes')) as HTMLElement[];
    for (const wrapper of wrappers) {
      wrapper.style.display = 'none';
      wrapper.style.maxHeight = '0';
      wrapper.style.minHeight = '0';
      wrapper.style.margin = '0';
      wrapper.style.padding = '0';
      wrapper.style.overflow = 'hidden';
    }
  }

  private suppressXeokitPropertiesShell(inspectorElement:HTMLElement):void {
    const propertiesShell = inspectorElement.querySelector('.xeokit-properties') as HTMLElement|null;
    if (propertiesShell) {
      propertiesShell.style.display = 'flex';
      propertiesShell.style.flexDirection = 'column';
      propertiesShell.style.flex = '1 1 auto';
      propertiesShell.style.margin = '0';
      propertiesShell.style.padding = '0';
      propertiesShell.style.border = '0';
      propertiesShell.style.background = 'transparent';
      propertiesShell.style.boxShadow = 'none';
      propertiesShell.style.minHeight = '0';
      propertiesShell.style.overflow = 'hidden';
    }

    const propertiesTab = inspectorElement.querySelector('.xeokit-propertiesTab') as HTMLElement|null;
    if (propertiesTab) {
      propertiesTab.style.display = 'flex';
      propertiesTab.style.flexDirection = 'column';
      propertiesTab.style.flex = '1 1 auto';
      propertiesTab.style.margin = '0';
      propertiesTab.style.padding = '0';
      propertiesTab.style.border = '0';
      propertiesTab.style.background = 'transparent';
      propertiesTab.style.boxShadow = 'none';
      propertiesTab.style.minHeight = '0';
      propertiesTab.style.overflow = 'hidden';
    }
  }

  private buildSectionSummary(title:string, details:HTMLDetailsElement):HTMLElement {
    const summary = document.createElement('summary');
    summary.className = 'op-ifc-viewer--inspector-section-title';
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '600';
    summary.style.fontSize = '12px';
    summary.style.lineHeight = '1.3';
    summary.style.color = 'var(--fgColor-default)';
    summary.style.background = 'var(--bgColor-muted)';
    summary.style.padding = '0.35rem 0.5rem';
    summary.style.listStyle = 'none';
    summary.style.display = 'flex';
    summary.style.alignItems = 'center';
    summary.style.gap = '0.35rem';

    const chevron = document.createElement('span');
    const closedChevronSvg = '<svg width="16" height="16" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15.2335 5.21967C15.5263 5.51256 15.5263 5.98744 15.2335 6.28033L9.51379 12L15.2335 17.7197C15.5263 18.0126 15.5263 18.4874 15.2335 18.7803C14.9406 19.0732 14.4657 19.0732 14.1728 18.7803L7.92279 12.5303C7.6299 12.2374 7.6299 11.7626 7.92279 11.4697L14.1728 5.21967C14.4657 4.92678 14.9406 4.92678 15.2335 5.21967Z" fill="#323544"/></svg>';
    const openChevronSvg = '<svg width="16" height="16" viewBox="0 0 25 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.54779 9.09467C5.84069 8.80178 6.31556 8.80178 6.60846 9.09467L12.3281 14.8143L18.0478 9.09467C18.3407 8.80178 18.8156 8.80178 19.1085 9.09467C19.4013 9.38756 19.4013 9.86244 19.1085 10.1553L12.8585 16.4053C12.5656 16.6982 12.0907 16.6982 11.7978 16.4053L5.54779 10.1553C5.2549 9.86244 5.2549 9.38756 5.54779 9.09467Z" fill="#323544"/></svg>';
    chevron.innerHTML = details.open ? openChevronSvg : closedChevronSvg;
    chevron.style.width = '16px';
    chevron.style.height = '16px';
    chevron.style.flex = '0 0 16px';
    chevron.style.display = 'inline-flex';
    chevron.style.alignItems = 'center';
    chevron.style.justifyContent = 'center';
    summary.appendChild(chevron);

    const label = document.createElement('span');
    label.textContent = title;
    label.style.flex = '1';
    summary.appendChild(label);

    details.addEventListener('toggle', () => {
      chevron.innerHTML = details.open ? openChevronSvg : closedChevronSvg;
    });

    return summary;
  }

  private extractSelectedObjectIdFromMap(valueByKey:Map<string, string>):string|undefined {
    const selectedObjectId = valueByKey.get('uuid')
      || valueByKey.get('globalid')
      || valueByKey.get('global id')
      || valueByKey.get('viewer id')
      || undefined;

    if (!selectedObjectId) {
      this.serverLogSelection('selected_object_id_not_found', {
        keys: Array.from(valueByKey.keys()),
      });
    }

    return selectedObjectId;
  }

  private extractInspectorValues(tabContent:HTMLElement):Map<string, string> {
    const firstTable = tabContent.querySelector('table.xeokit-table') as HTMLTableElement|null;
    const valueByKey = new Map<string, string>();
    if (!firstTable) {
      return valueByKey;
    }

    const rows = Array.from(firstTable.querySelectorAll('tr'));

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) {
        continue;
      }

      const rawKey = (cells[0].textContent || '').trim();
      const key = this.normalizeInspectorKey(rawKey);
      const value = (cells[1].textContent || '').trim();
      if (key.length > 0 && value.length > 0) {
        valueByKey.set(key, value);
      }
    }

    return valueByKey;
  }

  private get ifcGon():IFCGonDefinition|undefined {
    return (window.gon?.ifc_models as IFCGonDefinition|undefined);
  }

  private async loadMetadataForModel(modelId:number):Promise<IfcMetadataPayload|undefined> {
    const cached = this.metadataByModelId.get(modelId);
    if (cached) {
      return cached;
    }

    const pending = this.metadataLoadByModelId.get(modelId);
    if (pending) {
      return pending;
    }

    const attachmentId = this.ifcGon?.metadata_attachment_ids?.[modelId];
    if (!attachmentId) {
      return undefined;
    }

    const url = this.pathHelper.attachmentContentPath(attachmentId);

    const request = firstValueFrom(this.httpClient.get<IfcMetadataPayload>(url))
      .then((payload) => {
        this.metadataByModelId.set(modelId, payload);
        this.serverLogSelection('metadata_loaded', {
          modelId,
          attachmentId,
          propertySets: payload.propertySets?.length || 0,
        });
        return payload;
      })
      .catch((error) => {
        this.serverLogSelection('metadata_load_failed', {
          modelId,
          error: (error as Error)?.message || String(error),
        });
        return undefined;
      })
      .finally(() => {
        this.metadataLoadByModelId.delete(modelId);
      });

    this.metadataLoadByModelId.set(modelId, request);
    return request;
  }

  private stringifyMetadataValue(value:unknown):string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch (_e) {
      return String(value);
    }
  }

  private normalizeInspectorKey(value:string):string {
    return value
      .toLowerCase()
      .replace(/[:\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
