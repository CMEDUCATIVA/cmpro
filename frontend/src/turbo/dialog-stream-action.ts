import { StreamActions, StreamElement } from '@hotwired/turbo';

export function registerDialogStreamAction() {
  StreamActions.closeDialog = function closeDialogStreamAction(this:StreamElement) {
    const dialog = document.querySelector(this.target) as HTMLDialogElement;
    const additionalData = JSON.parse(this.getAttribute('additional') || '{}') as unknown;

    // dispatching with submitted: true to indicate that the behavior of a successful submission should
    // be triggered (i.e. reloading the ui)
    document.dispatchEvent(new CustomEvent('dialog:close', { detail: { dialog, submitted: true, additional: additionalData } }));
    dialog.close('close-event-already-dispatched');
  };

  StreamActions.dialog = function dialogStreamAction(this:StreamElement) {
    const content = this.templateElement.content;
    const dialog = content.querySelector('dialog') as HTMLDialogElement;

    document.body.append(content);

    // Auto-show the modal
    dialog.showModal();

    // Remove the element on close
    dialog.addEventListener('close', () => {
      if (dialog.parentElement?.tagName === 'DIALOG-HELPER') {
        dialog.parentElement.remove();
      } else {
        dialog.remove();
      }

      if (dialog.returnValue !== 'close-event-already-dispatched') {
        document.dispatchEvent(new CustomEvent('dialog:close', { detail: { dialog, submitted: false } }));
      }
    });

    // Hack to fix the width calculation of nested elements
    // such as the CKEditor toolbar.
    setTimeout(() => {
      const width = dialog.offsetWidth;
      dialog.style.width = `${width + 1}px`;
    }, 250);
  };
}
