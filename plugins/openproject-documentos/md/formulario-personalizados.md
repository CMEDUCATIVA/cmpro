# Formulario de campos personalizados (OpenProject)

Este documento describe como funcionan los campos personalizados y sus opciones en OpenProject, con foco en lo que se necesita para construir o entender el formulario de administracion.

## Componentes principales

- CustomField: modelo base del campo personalizado (validaciones, formatos, valores posibles, defaults).
- CustomOption: opcion de lista para campos tipo list.
- CustomValue: valor concreto de un campo en un objeto (work package, proyecto, etc.), con validaciones por formato.
- CustomFieldFormat: registro de formatos disponibles y sus reglas (multi valor, estrategia de validacion, limites, etc.).

## Formatos disponibles

Registrados en el initializer de formatos. Los mas comunes son:
- string, text, link
- int, float, date, bool
- list (con opciones)
- user, version (listas dinamicas)
- hierarchy, weighted_item_list (listas jerarquicas)
- calculated_value (solo proyectos, feature enterprise)

Cada formato define:
- label (etiqueta de UI)
- edit_as (p.ej. user y version se editan como list)
- si permite multi valor
- estrategia de validacion y parseo (CustomValue::*Strategy)

## Opciones de lista (CustomOption)

- Solo aplica para campo formato list.
- Se guardan como registros separados con position.
- Se exige al menos una opcion (no se puede borrar la ultima opcion).
- El valor guardado en CustomValue es el id de CustomOption.
- En el formulario, las opciones se muestran con [value, id].

## Valores posibles por formato

CustomField.possible_values decide que mostrar segun field_format:
- list: custom_options
- user: usuarios visibles segun proyecto/visibilidad
- version: versiones compartidas o visibles
- hierarchy, weighted_item_list: items del arbol de jerarquia
- otros: possible_values (atributo directo o texto multilinea)

## Default y multi valor

- Para list: default_value usa las opciones marcadas con default_value.
- Para multi valor: el default puede ser una lista de ids.
- Para otros formatos: default_value se castea segun el formato.
- multi_value solo se permite si el formato lo declara.

## Validaciones importantes

En CustomField:
- name unico por tipo
- field_format valido (solo formatos disponibles o deshabilitados si el registro ya existe)
- min_length, max_length
- regexp valido

En CustomValue:
- required (si el campo es obligatorio)
- regex (si el campo tiene regexp)
- tipo y conversion segun estrategia
- longitud minima y maxima

## Estrategias por formato

Cada formato tiene una estrategia que define parseo, validacion y tipo:
- list usa CustomValue::ListStrategy y valida inclusion de CustomOption.
- user/version usan estrategias basadas en ARObject.
- date/int/float/bool/text/string tienen estrategias especificas.
- calculated_value tiene estrategia especial y puede registrar errores.

## Notas para el formulario de administracion

- Si field_format = list, mostrar editor de opciones (ordenables) y default(s).
- Si field_format permite multi valor, habilitar el checkbox de multi_value.
- Si field_format = user o version, el selector usa listas dinamicas por proyecto.
- Si el formato no permite multi valor, ocultar o desactivar esa opcion.
- Regexp, min_length y max_length solo aplican a formatos de texto.

## Archivos clave

- app/models/custom_field.rb
- app/models/custom_option.rb
- app/models/custom_value.rb
- app/models/custom_value/list_strategy.rb
- lib/open_project/custom_field_format.rb
- config/initializers/custom_field_format.rb
