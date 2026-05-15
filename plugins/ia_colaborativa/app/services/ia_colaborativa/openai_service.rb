require 'net/http'
require 'json'

# ============================================================================
# ⚠️ DEPRECADO - OpenaiService v1.4.0
# ============================================================================
# 
# Este archivo está DEPRECADO desde la versión 1.5.0
# 
# Los agentes ahora están en archivos separados:
# - SaraDocsAgent   → app/services/ia_colaborativa/sara_docs_agent.rb
# - SaraObraAgent   → app/services/ia_colaborativa/sara_obra_agent.rb
# - BaseAgent       → app/services/ia_colaborativa/base_agent.rb
# 
# Este archivo se mantiene SOLO para compatibilidad con código legacy.
# Los métodos aquí redirigen a los nuevos agentes.
# 
# ⚠️ NO AGREGAR NUEVAS FUNCIONALIDADES AQUÍ.
# ⚠️ USAR LOS NUEVOS AGENTES DIRECTAMENTE.
# 
# ============================================================================

module IaColaborativa
  class OpenaiService
    class << self
      
      # ============================================================================
      # MÉTODOS DE COMPATIBILIDAD (Redirigen a nuevos agentes)
      # ============================================================================
      
      # Método para SaraIA (Documentación)
      def chat_docs(message)
        Rails.logger.warn "⚠️ OpenaiService.chat_docs está deprecado. Usar SaraDocsAgent.chat"
        SaraDocsAgent.chat(message)
      end
      
      # Método para SaraIA Obra (CDE)
      def chat_cde(message)
        Rails.logger.warn "⚠️ OpenaiService.chat_cde está deprecado. Usar SaraObraAgent.chat"
        SaraObraAgent.chat(message)
      end
      
      # Método genérico (deprecado, usa SaraDocsAgent por defecto)
      def chat(message)
        Rails.logger.warn "⚠️ OpenaiService.chat está deprecado. Usar SaraDocsAgent.chat o SaraObraAgent.chat"
        SaraDocsAgent.chat(message)
      end
    end
  end
end
