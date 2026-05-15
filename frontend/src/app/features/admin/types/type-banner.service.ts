import { I18nService } from 'core-app/core/i18n/i18n.service';
import { BannersService } from 'core-app/core/enterprise/banners.service';
import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ConfirmDialogService } from 'core-app/shared/components/modals/confirm-dialog/confirm-dialog.service';
import { ConfigurationService } from 'core-app/core/config/configuration.service';

@Injectable()
export class TypeBannerService extends BannersService {
  showBanners = this.showBannerFor('edit_attribute_groups');

  constructor(
    @Inject(DOCUMENT) protected documentElement:Document,
    protected confirmDialog:ConfirmDialogService,
    protected I18n:I18nService,
    protected configuration:ConfigurationService,
  ) {
    super(documentElement, configuration);
  }

  showEEOnlyHint():void {
    this.confirmDialog.confirm({
      text: {
        title: this.I18n.t('js.types.attribute_groups.upgrade_to_ee'),
        text: this.I18n.t('js.types.attribute_groups.upgrade_to_ee_text'),
        button_continue: this.I18n.t('js.types.attribute_groups.more_information'),
        button_cancel: this.I18n.t('js.types.attribute_groups.nevermind'),
      },
    }).then(() => {
      window.location.href = 'https://www.openproject.org/enterprise-edition/?utm_source=unknown&utm_medium=community-edition&utm_campaign=form-configuration';
    })
      .catch(() => {
      });
  }
}
