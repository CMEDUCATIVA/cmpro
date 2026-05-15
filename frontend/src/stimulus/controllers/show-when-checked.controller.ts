import { ApplicationController } from 'stimulus-use';

export default class OpShowWhenCheckedController extends ApplicationController {
  static targets = ['cause', 'effect'];

  static values = {
    reversed: Boolean,
  };

  declare reversedValue:boolean;

  declare readonly hasReversedValue:boolean;

  declare readonly effectTargets:HTMLInputElement[];

  private boundListener = this.toggleDisabled.bind(this);

  causeTargetConnected(target:HTMLElement) {
    target.addEventListener('change', this.boundListener);
  }

  causeTargetDisconnected(target:HTMLElement) {
    target.removeEventListener('change', this.boundListener);
  }

  private toggleDisabled(evt:InputEvent):void {
    const input = evt.target as HTMLInputElement;
    const targetName = input.dataset.targetName;
    const checked = input.checked;
    const hidden = (this.hasReversedValue && this.reversedValue) ? checked : !checked;

    this
      .effectTargets
      .filter((el) => targetName === el.dataset.targetName)
      .forEach((el) => {
        if (el.dataset.setVisibility === 'true') {
          el.style.setProperty('visibility', hidden ? 'hidden' : 'visible');
        } else if (el.dataset.visibilityClass) {
          el.classList.toggle(el.dataset.visibilityClass, hidden);
        } else {
          el.hidden = hidden;
        }
      });
  }
}
