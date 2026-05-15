import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { registerTableSorter } from 'core-app/features/reporting/reporting-page/functionality/tablesorter';

@Component({
  // Empty wrapper around legacy backlogs for CSS loading
  // that got removed in the Rails assets pipeline
  encapsulation: ViewEncapsulation.None,
  template: '',
  styleUrls: [
    './styles/reporting.sass',
  ],
  standalone: true,
})
export class ReportingPageComponent implements OnInit {
  async ngOnInit() {
    // @ts-expect-error imported JS is not typed
    await import('./functionality/reporting_engine');
    // @ts-expect-error imported JS is not typed
    await import('./functionality/reporting_engine/filters');
    // @ts-expect-error imported JS is not typed
    await import('./functionality/reporting_engine/group_bys');
    // @ts-expect-error imported JS is not typed
    await import('./functionality/reporting_engine/restore_query');
    // @ts-expect-error imported JS is not typed
    await import('./functionality/reporting_engine/controls');

    // Register table sorting functionality after reporting engine loaded
    registerTableSorter();
  }
}
