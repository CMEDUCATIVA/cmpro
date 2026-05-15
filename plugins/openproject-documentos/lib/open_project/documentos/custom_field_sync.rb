module OpenProject
  module Documentos
    class CustomFieldSync
      FIELD_MAP = {
        "proyecto" => "Proyecto / Código de Inversión",
        "creador" => "Creador / Autor",
        "volumen_sistema" => "Volumen/Sistema",
        "nivel_localizacion" => "Nivel o Localización",
        "tipo" => "Tipo / Tipo de documento",
        "disciplina" => "Disciplina",
        "numero" => "Número",
        "descripcion" => "Descripción",
        "estado" => "Estado / Código de estado",
        "revision" => "Revisión"
      }.freeze

      def self.sync_for_key(key)
        label = FIELD_MAP[key.to_s]
        return unless label

        items = ::Documentos::NomenclaturaItem.where(key:).order(:id)
        custom_field = ::WorkPackageCustomField.find_or_initialize_by(name: label)
        if custom_field.persisted? && custom_field.field_format.present? && custom_field.field_format != "list"
          return
        end
        if custom_field.persisted? && custom_field.field_format.blank?
          custom_field.destroy!
          custom_field = ::WorkPackageCustomField.new(name: label, field_format: "list")
        end
        custom_field.field_format = "list" if custom_field.new_record?

        if items.empty?
          custom_field.destroy if custom_field.persisted?
          return
        end

        field_config = ::Documentos::NomenclaturaField.for_key(key)
        custom_field.is_for_all = field_config.is_for_all
        custom_field.is_filter = field_config.is_filter
        custom_field.searchable = field_config.is_searchable

        custom_field.possible_values = items.map(&:value)
        custom_field.save!
      end
    end
  end
end
