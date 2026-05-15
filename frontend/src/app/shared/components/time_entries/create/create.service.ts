import {
  Injectable,
  Injector,
} from '@angular/core';
import { OpModalService } from 'core-app/shared/components/modal/modal.service';
import { HalResourceService } from 'core-app/features/hal/services/hal-resource.service';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { FormResource } from 'core-app/features/hal/resources/form-resource';
import { ResourceChangeset } from 'core-app/shared/components/fields/changeset/resource-changeset';
import { HalResourceEditingService } from 'core-app/shared/components/fields/edit/services/hal-resource-editing.service';
import { Moment } from 'moment';
import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { ApiV3Service } from 'core-app/core/apiv3/api-v3.service';
import { SchemaCacheService } from 'core-app/core/schemas/schema-cache.service';
import { TimeEntryResource } from 'core-app/features/hal/resources/time-entry-resource';
import { HalResource } from 'core-app/features/hal/resources/hal-resource';
import { Observable, of } from 'rxjs';

@Injectable()
export class TimeEntryCreateService {
  constructor(
    readonly opModalService:OpModalService,
    readonly injector:Injector,
    readonly halResource:HalResourceService,
    readonly apiV3Service:ApiV3Service,
    readonly schemaCache:SchemaCacheService,
    protected halEditing:HalResourceEditingService,
    readonly i18n:I18nService,
  ) {
  }

  public createNewTimeEntry(date:Moment, wp:WorkPackageResource, ongoing:boolean):Observable<ResourceChangeset> {
    const resource:FormResource = this.halResource.createHalResourceOfType(
      'Form',
      {
        payload: {
          spentOn: date.format('YYYY-MM-DD'),
          hours: null,
          ongoing,
          _links: {
            workPackage: {
              href: wp.href,
            },
          },
        },
      },
    );

    return of(this.fromCreateForm(resource));
  }

  public fromCreateForm(form:FormResource):ResourceChangeset {
    const entry = this.initializeNewResource(form);

    return this.halEditing.edit<TimeEntryResource, ResourceChangeset<TimeEntryResource>>(entry, form);
  }

  private initializeNewResource(form:FormResource):TimeEntryResource {
    const entry = this.halResource.createHalResourceOfType<TimeEntryResource>(
      'TimeEntry',
      (form.payload as HalResource).$plain(),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    entry.$links.schema = { href: 'new' };

    entry._type = 'TimeEntry';
    entry.id = 'new';
    entry.hours = 'PT1H';

    // Use POST /work_packages for saving link
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,no-multi-assign
    entry.updateImmediately = entry.$links.updateImmediately = (payload:Record<string, unknown>) => this
      .apiV3Service
      .time_entries
      .post(payload)
      .toPromise();

    entry.state.putValue(entry);

    return entry;
  }
}
