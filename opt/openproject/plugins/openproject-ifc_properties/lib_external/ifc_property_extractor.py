#!/usr/bin/env python3
"""
IFC Property Extractor for OpenProject
Extracts properties and quantities from IFC files using IfcOpenShell
"""

import ifcopenshell
import json
import sys
import os
from typing import Dict, Any, Optional, List

class IfcPropertyExtractor:
    """Extractor principal de propiedades IFC"""
    
    def __init__(self, ifc_file_path: str):
        self.ifc_file_path = ifc_file_path
        self.model = None
        
    def load_model(self) -> bool:
        """Cargar modelo IFC"""
        try:
            if not os.path.exists(self.ifc_file_path):
                self._log_error(f"Archivo no encontrado: {self.ifc_file_path}")
                return False
                
            self.model = ifcopenshell.open(self.ifc_file_path)
            return True
            
        except Exception as e:
            self._log_error(f"Error cargando modelo: {str(e)}")
            return False
    
    def extract_all_properties(self) -> Dict[str, Any]:
        """Extraer todas las propiedades del modelo"""
        if not self.model:
            return {"success": False, "error": "Modelo no cargado"}
            
        try:
            elements_data = {}
            building_elements = self._get_building_elements()
            
            for element in building_elements:
                element_data = self._extract_element_data(element)
                if element_data:
                    elements_data[element.GlobalId] = element_data
            
            return {
                "success": True,
                "file_info": {
                    "schema": self.model.schema,
                    "total_elements": len(list(self.model)),
                    "processed_elements": len(elements_data)
                },
                "elements": elements_data
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _get_building_elements(self) -> List:
        """Obtener elementos de construcción relevantes"""
        element_types = [
            'IfcWall', 'IfcSlab', 'IfcBeam', 'IfcColumn', 
            'IfcDoor', 'IfcWindow', 'IfcRoof', 'IfcStair'
        ]
        
        elements = []
        for element_type in element_types:
            try:
                type_elements = self.model.by_type(element_type)
                elements.extend(type_elements)
            except:
                continue
                
        return elements

    def _extract_element_data(self, element) -> Optional[Dict[str, Any]]:
        """Extraer datos de un elemento específico"""
        try:
            element_data = {
                'type': element.is_a(),
                'name': getattr(element, 'Name', None),
                'quantities': {},
                'properties': {}
            }
            
            # Extraer propiedades definidas
            if hasattr(element, 'IsDefinedBy'):
                for definition in element.IsDefinedBy:
                    if hasattr(definition, 'RelatingPropertyDefinition'):
                        self._process_property_definition(
                            definition.RelatingPropertyDefinition, 
                            element_data
                        )
            
            return element_data if (element_data['quantities'] or element_data['properties']) else None
            
        except Exception as e:
            self._log_error(f"Error procesando elemento: {str(e)}")
            return None

    def _process_property_definition(self, prop_def, element_data):
        """Procesar definiciones de propiedades"""
        try:
            if prop_def.is_a('IfcElementQuantity'):
                if hasattr(prop_def, 'Quantities'):
                    for quantity in prop_def.Quantities:
                        qty_data = self._extract_quantity_value(quantity)
                        if qty_data:
                            element_data['quantities'][quantity.Name] = qty_data
            
            elif prop_def.is_a('IfcPropertySet'):
                if hasattr(prop_def, 'HasProperties'):
                    for prop in prop_def.HasProperties:
                        if prop.is_a('IfcPropertySingleValue'):
                            prop_data = self._extract_property_value(prop)
                            if prop_data:
                                element_data['properties'][prop.Name] = prop_data
                                
        except Exception as e:
            self._log_error(f"Error procesando definición: {str(e)}")

    def _extract_quantity_value(self, quantity) -> Optional[Dict[str, Any]]:
        """Extraer valor de cantidad"""
        try:
            qty_value = None
            qty_unit = None
            
            if quantity.is_a('IfcQuantityLength'):
                qty_value = quantity.LengthValue
                qty_unit = 'Length'
            elif quantity.is_a('IfcQuantityArea'):
                qty_value = quantity.AreaValue
                qty_unit = 'Area'
            elif quantity.is_a('IfcQuantityVolume'):
                qty_value = quantity.VolumeValue
                qty_unit = 'Volume'
            elif quantity.is_a('IfcQuantityCount'):
                qty_value = quantity.CountValue
                qty_unit = 'Count'
            elif quantity.is_a('IfcQuantityWeight'):
                qty_value = quantity.WeightValue
                qty_unit = 'Weight'
            
            return {'value': float(qty_value), 'unit': qty_unit} if qty_value is not None else None
            
        except:
            return None

    def _extract_property_value(self, prop) -> Optional[Dict[str, Any]]:
        """Extraer valor de propiedad"""
        try:
            if hasattr(prop, 'NominalValue') and prop.NominalValue:
                value = prop.NominalValue.wrappedValue
                return {
                    'value': value,
                    'type': prop.NominalValue.is_a()
                }
        except:
            pass
        return None

    def _log_error(self, message: str):
        """Log errores a stderr"""
        print(message, file=sys.stderr)

def main():
    """Función principal"""
    if len(sys.argv) != 2:
        print("Uso: python3 ifc_property_extractor.py <archivo_ifc>")
        sys.exit(1)
    
    ifc_file = sys.argv[1]
    
    try:
        extractor = IfcPropertyExtractor(ifc_file)
        
        if not extractor.load_model():
            sys.exit(1)
        
        result = extractor.extract_all_properties()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
