#!/usr/bin/env python3
import json
import sys
from datetime import datetime

import ifcopenshell
import ifcopenshell.util.element


def _iso_or_none(value):
  if not value:
    return None
  if isinstance(value, datetime):
    return value.isoformat()
  return str(value)


def _safe_str(value):
  if value is None:
    return ""
  return str(value)


def _global_id(entity):
  return getattr(entity, "GlobalId", None) or f"ifc-{entity.id()}"


def _parent_global_id(entity):
  try:
    decomposes = getattr(entity, "Decomposes", None) or []
    if decomposes:
      parent = getattr(decomposes[0], "RelatingObject", None)
      if parent:
        return _global_id(parent)
  except Exception:
    pass

  try:
    contained = getattr(entity, "ContainedInStructure", None) or []
    if contained:
      parent = getattr(contained[0], "RelatingStructure", None)
      if parent:
        return _global_id(parent)
  except Exception:
    pass

  return None


def _normalize_prop_value(value):
  if isinstance(value, (str, int, float, bool)) or value is None:
    return value
  if isinstance(value, (list, tuple)):
    return [_normalize_prop_value(v) for v in value]
  if isinstance(value, dict):
    return {str(k): _normalize_prop_value(v) for k, v in value.items()}
  return str(value)


def _extract(file_path):
  model = ifcopenshell.open(file_path)
  project = model.by_type("IfcProject")
  project_entity = project[0] if project else None

  app = None
  try:
    app = model.by_type("IfcApplication")
    app = app[0] if app else None
  except Exception:
    app = None

  owner_history = getattr(project_entity, "OwnerHistory", None) if project_entity else None
  author = None
  if owner_history and getattr(owner_history, "OwningUser", None):
    person = getattr(owner_history.OwningUser, "ThePerson", None)
    if person:
      author = " ".join(
        [p for p in [getattr(person, "GivenName", None), getattr(person, "FamilyName", None)] if p]
      )

  meta = {
    "id": _safe_str(getattr(project_entity, "Name", None) if project_entity else None),
    "projectId": _global_id(project_entity) if project_entity else None,
    "extractor": "ifcopenshell",
    "author": author,
    "createdAt": _iso_or_none(getattr(owner_history, "CreationDate", None)),
    "schema": _safe_str(model.schema),
    "creatingApplication": _safe_str(getattr(app, "ApplicationFullName", None)),
    "metaObjects": [],
    "propertySets": [],
  }

  property_sets_by_id = {}
  all_entities = model.by_type("IfcObjectDefinition")
  for entity in all_entities:
    entity_id = _global_id(entity)
    parent_id = _parent_global_id(entity)

    entity_entry = {
      "id": entity_id,
      "name": _safe_str(getattr(entity, "Name", None)),
      "type": entity.is_a(),
      "parent": parent_id,
      "propertySetIds": [],
    }

    psets = ifcopenshell.util.element.get_psets(entity, psets_only=False, qtos_only=False, should_inherit=True)
    for pset_name, pset_values in psets.items():
      if not isinstance(pset_values, dict):
        continue

      pset_id = f"{entity_id}:{pset_name}"
      properties = []
      for prop_name, prop_value in pset_values.items():
        if prop_name == "id":
          continue
        properties.append(
          {
            "id": f"{pset_id}:{prop_name}",
            "name": str(prop_name),
            "value": _normalize_prop_value(prop_value),
          }
        )

      pset_entry = {
        "id": pset_id,
        "name": str(pset_name),
        "type": "IfcPropertySet",
        "metaObjectId": entity_id,
        "properties": properties,
      }
      property_sets_by_id[pset_id] = pset_entry
      entity_entry["propertySetIds"].append(pset_id)

    meta["metaObjects"].append(entity_entry)

  meta["propertySets"] = list(property_sets_by_id.values())
  return meta


def main():
  if len(sys.argv) != 3:
    print("Usage: extract_ifc_metadata.py <input.ifc> <output.json>", file=sys.stderr)
    sys.exit(2)

  input_ifc = sys.argv[1]
  output_json = sys.argv[2]

  try:
    metadata = _extract(input_ifc)
    with open(output_json, "w", encoding="utf-8") as fh:
      json.dump(metadata, fh, ensure_ascii=False)
  except Exception as exc:
    print(f"Failed to extract IFC metadata: {exc}", file=sys.stderr)
    sys.exit(1)

  sys.exit(0)


if __name__ == "__main__":
  main()
