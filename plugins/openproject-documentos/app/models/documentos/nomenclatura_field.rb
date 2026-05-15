module Documentos
  class NomenclaturaField < ApplicationRecord
    self.table_name = 'documentos_nomenclatura_fields'

    def self.for_key(key)
      find_or_initialize_by(key: key.to_s)
    end
  end
end
