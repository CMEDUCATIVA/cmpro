import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FieldType } from '@ngx-formly/core';
import { HalResource } from 'core-app/features/hal/resources/hal-resource';
import { I18nService } from 'core-app/core/i18n/i18n.service';

@Component({
  selector: 'op-select-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './select-input.component.html',
  styleUrls: ['./select-input.component.scss'],
})
export class SelectInputComponent extends FieldType {
  constructor(
    readonly I18n:I18nService,
  ) {
    super();
  }

  groupByFn = (item:HalResource):string|null => {
    if (!this.isVersionResource(item)) return null;
    const links = (item._links || {}) as HalResource;
    const project = links.definingProject as HalResource | undefined;

    return String(project?.title || this.I18n.t('js.project.not_available'));
  };

  private isVersionResource(item:HalResource):boolean {
    return item._type === 'Version';
  }
}
