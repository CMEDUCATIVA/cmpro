import { Injectable } from '@angular/core';
import { renderStreamMessage } from '@hotwired/turbo';
import { ToastService } from 'core-app/shared/components/toaster/toast.service';

@Injectable({ providedIn: 'root' })
export class TurboRequestsService {
  constructor(
    private toast:ToastService,
  ) {

  }

  public request(url:string, init:RequestInit = {}, suppressErrorToast = false):Promise<{
    html:string,
    headers:Headers
  }> {
    const defaultHeaders = {
      'X-Authentication-Scheme': 'Session',
    };

    init.headers = {
      ...defaultHeaders,
      ...init.headers,
    };

    return fetch(url, init)
      .then((response) => {
        return response.text().then((html) => ({
          html,
          headers: response.headers,
          response,
        }));
      })
      .then((result) => {
        const contentType = result.response.headers.get('Content-Type') || '';
        const isTurboStream = contentType.includes('text/vnd.turbo-stream.html');

        // only render the stream message if we are in a turbo stream response
        if (isTurboStream) {
          renderStreamMessage(result.html);
        }

        if (!result.response.ok) {
          throw new Error(result.response.statusText);
        } else {
          // enable further processing of the html and headers in the calling function
          return { html: result.html, headers: result.headers };
        }
      })
      .catch((error) => {
        // this should only catch errors happening in the client side parsing in the above .then() calls
        if (!suppressErrorToast) {
          this.toast.addError(error as string);
        } else {
          console.error(error);
        }
        throw error;
      });
  }

  public submitForm(
    form:HTMLFormElement,
    params:URLSearchParams|null = null,
    url = form.action,
  ):Promise<{ html:string, headers:Headers }> {
    const formData = new FormData(form);
    const requestParams = params ? `?${params.toString()}` : '';
    return this.request(
      `${url}${requestParams}`,
      {
        method: form.method,
        body: formData,
        headers: {
          'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement).content,
        },
      },
      true,
    );
  }

  public requestStream(url:string):Promise<{ html:string, headers:Headers }> {
    return this.request(url, {
      method: 'GET',
      headers: {
        Accept: 'text/vnd.turbo-stream.html',
      },
      credentials: 'same-origin',
    });
  }
}
