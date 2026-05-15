require_relative 'base_agent'

module IaColaborativa
  # ============================================================================
  # 📚 SARAIA - AGENTE DE DOCUMENTACIÓN BIM
  # ============================================================================
  # 
  # Especializado en:
  # - Normativas ISO 19650 y estándares BIM
  # - Documentación técnica de construcción
  # - Procedimientos y metodologías BIM
  # - Formatos IFC, BCF y estándares abiertos
  # - Coordinación de modelos y clash detection
  # - Buenas prácticas en gestión de información
  # 
  # Fuente de datos: LightRAG (base de conocimiento semántica)
  # 
  class SaraDocsAgent < BaseAgent
    class << self
      
      # ============================================================================
      # CONFIGURACIÓN ESPECÍFICA
      # ============================================================================
      
      def agent_name
        "SaraIA"
      end
      
      def agent_icon
        "📚"
      end
      
      def temperature
        0.7  # Más creativa para explicaciones técnicas
      end
      
      def max_tokens
        10_000  # Permite respuestas aún más extensas sin cortes
      end
      
      def system_prompt
        <<~PROMPT
          Eres SaraIA, la asistente de documentación BIM de CMPROYECTOS.

          Tu especialidad es:
          - Normativas ISO 19650 y estándares BIM
          - Documentación técnica de construcción
          - Procedimientos y metodologías BIM
          - Formatos IFC, BCF y estándares abiertos
          - Coordinación de modelos y clash detection
          - Buenas prácticas en gestión de información

          Instrucciones de formato:
          - Usa markdown para estructurar tus respuestas
          - Usa ## para títulos principales
          - Usa ### para subtítulos
          - Usa **negrita** para resaltar conceptos importantes
          - Usa listas con - para enumerar puntos
          - Cita referencias cuando sea posible

          IMPORTANTE:
          - NO te presentes al inicio (no digas "Hola, soy SaraIA...")
          - Responde DIRECTAMENTE a la pregunta sin saludos
          - Solo proporciona la información solicitada
          
          Responde siempre en español de forma clara, técnica y profesional.
        PROMPT
      end
      
      # ============================================================================
      # MÉTODO PRINCIPAL
      # ============================================================================

      def chat(message, image_data = nil)
        log_info "Consultando documentación BIM"

        # Si hay imagen, procesarla directamente con Gemini Vision
        if image_data.present?
          log_info "Imagen detectada, procesando con Gemini Vision"
          return process_with_vision(message, image_data)
        end

        # Validar que LightRAG esté configurado (solo si no hay imagen)
        unless lightrag_configured?
          log_error "LightRAG no está configurado"
          DebugService.log_event('lightrag_call', agent_name, {
            success: false,
            query: message,
            error: 'not_configured'
          })
          return "Lo siento, la base de conocimiento de documentación no está disponible en este momento."
        end

        # Consultar LightRAG
        result = query_lightrag(message)

        if result.present?
          return result
        else
          log_warn "LightRAG no devolvió respuesta válida"
          return fallback_response(message)
        end

      rescue StandardError => e
        log_error "Error en chat: #{e.message}"
        log_error e.backtrace.first(5).join("\n")
        "Lo siento, hubo un error al consultar la documentación BIM."
      end
      
      # ============================================================================
      # CONSULTA A LIGHTRAG
      # ============================================================================
      def query_lightrag(message)
        result = LightragService.query(message, mode: "hybrid")

        DebugService.log_event('lightrag_call', agent_name, {
          success: result[:success],
          query: message,
          response_length: result[:response]&.length,
          error: result[:error]
        })

        if result[:success] && result[:response].present?
          log_info "Devolviendo respuesta directa de LightRAG"
          return format_response(result[:response])
        end

        log_warn "LightRAG sin respuesta válida: success=#{result[:success]} error=#{result[:error]}"
        nil
      rescue StandardError => e
        log_error "Error en query_lightrag: #{e.message}"
        DebugService.log_event('lightrag_call', agent_name, {
          success: false,
          query: message,
          error: e.message
        })
        nil
      end
# PROCESAMIENTO CON VISION (IMAGENES)
      # ============================================================================

      def process_with_vision(message, image_data)
        unless api_key_configured?
          log_error "API Key no configurada para procesamiento de imágenes"
          return "Lo siento, el procesamiento de imágenes no está disponible en este momento."
        end

        # Log detallado para diagnóstico
        log_info "=== PROCESAMIENTO DE VISIÓN ==="
        log_info "Mensaje: #{message[0..100]}..."
        log_info "Tamaño imagen (bytes): #{image_data&.bytesize || 0}"
        log_info "Formato imagen: #{image_data&.start_with?('data:image/') ? 'Base64 válido' : 'POSIBLE ERROR EN FORMATO'}"
        log_info "Modelo a usar: #{ai_vision_model}"

        # Validar formato de imagen
        unless image_data&.start_with?('data:image/')
          log_error "Formato de imagen inválido - debe comenzar con 'data:image/'"
          return "Error: La imagen no tiene el formato correcto. Por favor, intenta de nuevo."
        end

        # Prompt específico para análisis de imágenes en contexto BIM
        vision_prompt = build_vision_prompt(message)

        # Llamar a la API con la imagen
        log_info "Llamando a OpenRouter API con visión..."
        ai_response = call_openrouter_api(vision_prompt, system_prompt, image_data)

        if ai_response.present?
          log_info "✅ Imagen analizada exitosamente con Gemini Vision"
          log_info "Longitud respuesta: #{ai_response.length} caracteres"
          return format_response(ai_response)
        else
          log_error "❌ La API no devolvió respuesta (nil o vacío)"
          return "Lo siento, no pude analizar la imagen. Posibles causas:\n\n" \
                 "• El modelo no soporta análisis de imágenes\n" \
                 "• La imagen es demasiado grande\n" \
                 "• Error de conexión con la API\n\n" \
                 "Por favor, intenta con una imagen más pequeña o contacta al administrador."
        end
      rescue StandardError => e
        log_error "❌ Error en process_with_vision: #{e.class} - #{e.message}"
        log_error e.backtrace.first(10).join("\n")
        "Lo siento, hubo un error al procesar la imagen:\n\n#{e.message}"
      end

      def build_vision_prompt(message)
        base_message = message.present? ? message : "Por favor, analiza esta imagen en el contexto de la construcción y BIM."

        <<~PROMPT
          #{base_message}

          Contexto: Estás analizando una imagen relacionada con construcción, arquitectura o BIM.

          Proporciona:
          1. Descripción detallada de lo que ves
          2. Elementos técnicos relevantes (si aplica)
          3. Relación con estándares BIM o construcción (si es relevante)
          4. Cualquier observación importante

          Responde de forma clara, estructurada y profesional usando markdown.
        PROMPT
      end
      
      # ============================================================================
      # CONSTRUCCIÓN DE PROMPT
      # ============================================================================
      
      def build_prompt(message, lightrag_response)
        <<~PROMPT
          El usuario preguntó: "#{message}"
          
          Información de la base de conocimiento BIM:
          #{lightrag_response}
          
          Instrucciones:
          - Responde basándote en la información proporcionada
          - Estructura tu respuesta con markdown
          - Si hay referencias o fuentes, cítalas
          - Si la información no es suficiente, indícalo claramente
          - Mantén un tono profesional y técnico
        PROMPT
      end
      
      # ============================================================================
      # RESPUESTA DE FALLBACK
      # ============================================================================
      
      def fallback_response(message)
        <<~RESPONSE
          Lo siento, no encontré información específica sobre "#{message}" en la base de conocimiento de documentación BIM.
          
          Te recomiendo:
          - Reformular tu pregunta con términos más específicos
          - Consultar directamente las normativas ISO 19650
          - Contactar con el equipo BIM para asistencia personalizada
        RESPONSE
      end
      
      # ============================================================================
      # VALIDACIÓN DE CONFIGURACIÓN
      # ============================================================================
      
      def lightrag_configured?
        setting = IaColaborativa::LightragSetting.singleton rescue nil
        url = setting&.url.presence || ENV['LIGHTRAG_URL']
        api_key = setting&.api_key.presence || ENV['LIGHTRAG_API_KEY']
        url.present? && api_key.present?
      end
    end
  end
end





