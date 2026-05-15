#!/usr/bin/env python3

import argparse
import json
import sys
from datetime import datetime

try:
    import ifcopenshell
    import ifcopenshell.util.element
except Exception as exc:
    sys.stderr.write(f"Failed to import ifcopenshell: {exc}\n")
    sys.exit(2)


def safe_attr(element, attr):
    try:
        return getattr(element, attr)
    except Exception:
        return None


def element_express_id(element):
    try:
        return str(element.id())
    except Exception:
        return None


def element_global_id(element):
    value = safe_attr(element, "GlobalId")
    return value if value else None


def get_psets_compat(element):
    try:
        return ifcopenshell.util.element.get_psets(
            element, psets_only=True, include_inherited=True
        )
    except TypeError:
        return ifcopenshell.util.element.get_psets(element, psets_only=True)


def get_qtos_compat(element):
    try:
        return ifcopenshell.util.element.get_psets(
            element, qtos_only=True, include_inherited=True
        )
    except TypeError:
        return ifcopenshell.util.element.get_psets(element, qtos_only=True)


def element_parent_id(element):
    try:
        container = ifcopenshell.util.element.get_container(element)
        if container:
            container_id = element_global_id(container)
            if container_id:
                return container_id
    except Exception:
        pass
    return None


def build_property_sets(element):
    results = {}
    element_id = element_global_id(element)
    if not element_id:
        return results

    psets = get_psets_compat(element)
    for pset_name, props in (psets or {}).items():
        if not isinstance(props, dict):
            continue
        pset_id = f"{element_id}:{pset_name}"
        properties = {}
        for prop_name, value in props.items():
            if value is None:
                continue
            properties[prop_name] = value
        results[pset_id] = {
            "id": pset_id,
            "name": pset_name,
            "type": "IfcPropertySet",
            "properties": properties,
        }

    qtos = get_qtos_compat(element)
    for qto_name, props in (qtos or {}).items():
        if not isinstance(props, dict):
            continue
        qto_id = f"{element_id}:{qto_name}"
        quantities = {}
        for prop_name, value in props.items():
            if value is None:
                continue
            quantities[prop_name] = value
        results[qto_id] = {
            "id": qto_id,
            "name": qto_name,
            "type": "IfcElementQuantity",
            "properties": quantities,
        }

    return results


def build_meta_object(element, property_set_ids):
    element_id = element_global_id(element)
    name = safe_attr(element, "Name") or safe_attr(element, "LongName") or safe_attr(element, "GlobalId") or element_id
    meta = {
        "id": element_id,
        "name": name,
        "type": element.is_a(),
    }
    express_id = element_express_id(element)
    if express_id:
        meta["expressId"] = express_id
    parent_id = element_parent_id(element)
    if parent_id:
        meta["parent"] = parent_id
    if property_set_ids:
        meta["propertySetIds"] = property_set_ids
        meta["propertySets"] = property_set_ids
    return meta


def extract_metadata(ifc_file):
    ifc = ifcopenshell.open(ifc_file)
    schema = getattr(ifc, "schema", "")
    project = None
    try:
        projects = ifc.by_type("IfcProject")
        project = projects[0] if projects else None
    except Exception:
        project = None

    project_id = element_global_id(project) if project else None
    model_id = project_id or "model"
    model_name = safe_attr(project, "Name") or safe_attr(project, "GlobalId") or model_id if project else model_id

    meta_objects = {}
    property_sets = {}

    if project_id:
        project_meta = {"id": project_id, "name": model_name, "type": project.is_a()}
        project_express_id = element_express_id(project)
        if project_express_id:
            project_meta["expressId"] = project_express_id
        meta_objects[project_id] = project_meta

    for element in ifc.by_type("IfcProduct"):
        element_id = element_global_id(element)
        if not element_id:
            continue

        element_psets = build_property_sets(element)
        property_sets.update(element_psets)
        pset_ids = list(element_psets.keys())

        meta_objects[element_id] = build_meta_object(element, pset_ids)

    metadata = {
        "id": model_id,
        "name": model_name,
        "projectId": "",
        "revisionId": "",
        "author": "",
        "createdAt": datetime.utcnow().isoformat() + "Z",
        "creatingApplication": "ifcopenshell",
        "schema": schema,
        "propertySets": property_sets,
        "metaObjects": meta_objects,
    }

    log_metadata_summary(property_sets, meta_objects)
    return metadata


def log_metadata_summary(property_sets, meta_objects):
    try:
        pset_count = len(property_sets)
        meta_count = len(meta_objects)
        pset_sample = list(property_sets.keys())[:5]
        meta_sample = list(meta_objects.keys())[:5]
        sys.stdout.write(
            f"[COSTOS][IFC] metadata summary psets={pset_count} meta_objects={meta_count} "
            f"pset_sample={pset_sample} meta_sample={meta_sample}\n"
        )
    except Exception as exc:
        sys.stdout.write(f"[COSTOS][IFC] metadata summary failed: {exc}\n")


def main():
    parser = argparse.ArgumentParser(description="Extract IFC metadata with Psets and QTOs")
    parser.add_argument("--input", required=True, help="Path to IFC file")
    parser.add_argument("--output", required=True, help="Path to metadata JSON")
    args = parser.parse_args()

    metadata = extract_metadata(args.input)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=True)


if __name__ == "__main__":
    main()
