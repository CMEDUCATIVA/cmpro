module Documentos
  class Config < ApplicationRecord
    self.table_name = 'documentos_configs'

    def self.current
      first || new
    end
  end
end
