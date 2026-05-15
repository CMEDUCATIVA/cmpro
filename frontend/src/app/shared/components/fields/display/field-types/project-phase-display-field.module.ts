/*
 * -- copyright
 * OpenProject is an open source project management software.
 * Copyright (C) the OpenProject GmbH
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License version 3.
 *
 * OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
 * Copyright (C) 2006-2013 Jean-Philippe Lang
 * Copyright (C) 2010-2013 the ChiliProject Team
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * See COPYRIGHT and LICENSE files for more details.
 * ++
 */

import { opPhaseIconData, toDOMString } from '@openproject/octicons-angular';
import { DisplayField } from 'core-app/shared/components/fields/display/display-field.module';
import { ProjectPhaseResource } from 'core-app/features/hal/resources/project-phase-resource';

export class ProjectPhaseDisplayField extends DisplayField {
  public get value():string|null {
    if (this.schema && this.attribute) {
      return (this.attribute as ProjectPhaseResource).name;
    }
    return null;
  }

  public render(element:HTMLElement, displayText:string):void {
    super.render(element, displayText);

    element.prepend(this.phaseIcon());
  }

  /**
   * Creates and returns an HTML element representing the icon for a project phase.
   * The icon is wrapped in a span element with the correct css class set for coloring
   * the icon in the color defined for the definition.
   *
   * @return {HTMLElement} The HTML span element containing the project phase icon.
   * @see phaseIcon
   */
  public static phaseIconByName(phaseName?:string, addPadding = true) {
    const icon = document.createElement('span');

    if (phaseName) {
      if (addPadding) {
        icon.classList.add('mr-1');
      }

      icon.setAttribute('data-test-selector', `project-phase-icon ${phaseName}`);

      icon.innerHTML = toDOMString(
        opPhaseIconData,
        'small',
        { 'aria-hidden': 'true', class: 'octicon' },
      );

      // Use a base64 encoded string of the project phase name to access the definition's color.
      // That way the frontend does not have to load the definitions to get the color.
      // The name is guaranteed to be unique.
      // The = signs at the end of the base64 string are replaced with _ to make it a valid class name.
      // This needs to be kept in sync with the ColorsHelper#project_phase_color_css method in the backend.
      icon.classList.add(`__hl_inline_project_phase_definition_${btoa(phaseName).replace(/=/g, '_')}`);
    }

    return icon;
  }

  /**
   * @see phaseIconByName
   */
  protected phaseIcon():HTMLElement {
    const projectPhase = this.attribute as ProjectPhaseResource;

    return ProjectPhaseDisplayField.phaseIconByName(projectPhase?.name);
  }
}
