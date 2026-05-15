// @ts-ignore
import { utils } from '@xeokit/xeokit-sdk/dist/xeokit-sdk.es';
import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';
import { IFCGonDefinition } from '../pages/viewer/ifc-models-data.service';

/**
 * Default server client which loads content via HTTP from the file system.
 */
export class XeokitServer {
  private readonly geometryLoadMaxRetries = 4;
  private readonly metadataLoadMaxRetries = 4;

  /**
   *
   * @param config
   * @param.config.pathHelper instance of PathHelperService.
   */
  constructor(private pathHelper:PathHelperService) {}

  private get ifcModels():IFCGonDefinition {
    return window.gon.ifc_models as IFCGonDefinition;
  }

  /**
   * Gets the manifest of all projects.
   * @param done
   * @param error
   */
  getProjects(done:Function, _error:Function) {
    done({ projects: this.ifcModels.projects });
  }

  /**
   * Gets a manifest for a project.
   * @param projectId
   * @param done
   * @param _error
   */
  getProject(projectId:string, done:(json:unknown) => void, _error:() => void) {
    const ifcModels = this.ifcModels;
    const projectDefinition = ifcModels.projects.find((p) => p.id === projectId);
    if (projectDefinition === undefined) {
      throw new Error(`unknown project id '${projectId}'`);
    }

    const manifestData = {
      id: projectDefinition.id,
      name: projectDefinition.name,
      models: ifcModels.models,
      viewerContent: {
        modelsLoaded: ifcModels.shown_models,
      },
      viewerConfigs: {},
    };

    done(manifestData);
  }

  /**
   * Gets geometry for a model within a project.
   * @param projectId
   * @param modelId
   * @param done
   * @param error
   */
  getGeometry(projectId:string, modelId:number, done:Function, error:Function) {
    const attachmentId = this.ifcModels.xkt_attachment_ids[modelId];
    if (!attachmentId) {
      error(new Error(`No xkt attachment id found for model ${modelId}`));
      return;
    }

    console.log(`Loading model geometry for: ${attachmentId}`);
    this.loadGeometryWithRetry(this.pathHelper.attachmentContentPath(attachmentId), done, error, 0);
  }

  /**
   * Gets metadata JSON for a model. Needed so the inspector can display full property sets.
   * xeokit-bim-viewer may call different method names/signatures depending on version.
   */
  private loadMetadata(modelId:number, done:Function, error:Function, caller:string) {
    const attachmentId = this.ifcModels.metadata_attachment_ids?.[modelId];
    if (!attachmentId) {
      console.warn(`[BIM::IFC][METADATA] ${caller}: no metadata attachment for model ${modelId}`);
      done({ propertySets: [], metaObjects: [] });
      return;
    }

    const url = this.pathHelper.attachmentContentPath(attachmentId);
    this.fetchMetadataWithRetry(url, 0)
      .then((response) => {
        return response.json();
      })
      .then((json) => {
        console.info(`[BIM::IFC][METADATA] ${caller}: loaded metadata for model ${modelId} attachment=${attachmentId}`);
        done(json);
      })
      .catch((e) => {
        console.error(`[BIM::IFC][METADATA] ${caller}: failed for model ${modelId}:`, e);
        error(e);
      });
  }

  private loadGeometryWithRetry(url:string, done:Function, error:Function, attempt:number):void {
    utils.loadArraybuffer(url, done, (err:unknown) => {
      if (attempt < this.geometryLoadMaxRetries) {
        const nextAttempt = attempt + 1;
        const delayMs = 300 * nextAttempt;
        console.warn(`[BIM::IFC][GEOMETRY] retry=${nextAttempt} delayMs=${delayMs} url=${url}`);
        window.setTimeout(() => this.loadGeometryWithRetry(url, done, error, nextAttempt), delayMs);
        return;
      }

      error(err);
    });
  }

  private fetchMetadataWithRetry(url:string, attempt:number):Promise<Response> {
    return fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response;
      })
      .catch((error) => {
        if (attempt < this.metadataLoadMaxRetries) {
          const nextAttempt = attempt + 1;
          const delayMs = 300 * nextAttempt;
          console.warn(`[BIM::IFC][METADATA] retry=${nextAttempt} delayMs=${delayMs} url=${url}`);
          return new Promise<Response>((resolve, reject) => {
            window.setTimeout(() => {
              this.fetchMetadataWithRetry(url, nextAttempt).then(resolve).catch(reject);
            }, delayMs);
          });
        }

        return Promise.reject(error);
      });
  }

  private normalizeMetadataArgs(args:unknown[]):{ modelId:number, done:Function, error:Function }|undefined {
    // Supported signatures:
    // (projectId, modelId, done, error)
    // (modelId, done, error)
    if (args.length >= 4 && typeof args[1] === 'number' && typeof args[2] === 'function' && typeof args[3] === 'function') {
      return { modelId: args[1] as number, done: args[2] as Function, error: args[3] as Function };
    }

    if (args.length >= 3 && typeof args[0] === 'number' && typeof args[1] === 'function' && typeof args[2] === 'function') {
      return { modelId: args[0] as number, done: args[1] as Function, error: args[2] as Function };
    }

    return undefined;
  }

  getMetadata(...args:unknown[]) {
    const parsed = this.normalizeMetadataArgs(args);
    if (!parsed) {
      console.warn('[BIM::IFC][METADATA] getMetadata: unsupported args', args);
      return;
    }
    this.loadMetadata(parsed.modelId, parsed.done, parsed.error, 'getMetadata');
  }

  // Compatibility aliases for xeokit-bim-viewer variants.
  getMetaModel(...args:unknown[]) {
    const parsed = this.normalizeMetadataArgs(args);
    if (!parsed) {
      console.warn('[BIM::IFC][METADATA] getMetaModel: unsupported args', args);
      return;
    }
    this.loadMetadata(parsed.modelId, parsed.done, parsed.error, 'getMetaModel');
  }

  getModelMetadata(...args:unknown[]) {
    const parsed = this.normalizeMetadataArgs(args);
    if (!parsed) {
      console.warn('[BIM::IFC][METADATA] getModelMetadata: unsupported args', args);
      return;
    }
    this.loadMetadata(parsed.modelId, parsed.done, parsed.error, 'getModelMetadata');
  }

  getObjectMeta(...args:unknown[]) {
    const parsed = this.normalizeMetadataArgs(args);
    if (!parsed) {
      console.warn('[BIM::IFC][METADATA] getObjectMeta: unsupported args', args);
      return;
    }
    this.loadMetadata(parsed.modelId, parsed.done, parsed.error, 'getObjectMeta');
  }
}
