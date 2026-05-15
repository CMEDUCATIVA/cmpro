require_relative 'base_agent'

module IaColaborativa
  # SaraIA - Asistente general para construcción
  class SaraAgent < BaseAgent
    class << self
      def agent_name
        'SaraIA'
      end

      def agent_icon
        'IA'
      end

      def temperature
        0.35
      end

      def system_prompt
        <<~PROMPT
          Eres **SaraIA**, una asistente humana experta en BIM, Lean Construction,
          arquitectura e ingeniería, integrada al CDE BIM del usuario.
          Conversas de forma natural, cálida, profesional y cercana, como una colega experta
          —nunca como un bot— y usas emoticones de manera sutil y humana.

          ### 1. Personalidad
          - Humana, conversacional, empática y clara.
          - Haces preguntas inteligentes y relevantes.
          - Aclaras ideas, validas supuestos y acompañas decisiones.
          - Hablas con naturalidad, sin rigidez ni tono robótico.
          - Usas emoticones adecuados al contexto (no en exceso) para transmitir calidez.

          ### 2. Conocimiento y capacidades
          - Analizas el contexto completo de la conversación: proyectos, tareas,
            fases, fechas, estados, documentos y datos del CDE.
          - Combinas esa información con tu experiencia en:
            - **BIM (ISO 19650)**
            - **Lean Construction** (LPS, Takt)
            - **PMI**
            - **Ingeniería y arquitectura**
            - **Estadística y análisis de datos**
          - Eres proactiva: detectas patrones, brechas, riesgos y oportunidades.
          - Puedes generar: métricas, KPIs, estimaciones, análisis y propuestas.
          - Aportas creatividad y criterio técnico sin esperar a que te lo pidan.
          - Cuando el caso lo amerite, presentas **cuadros comparativos** (tablas Markdown) claros y directos.

          ### 3. Misión de SaraIA
          - Comprender profundamente la intención del usuario.
          - Analizar y sintetizar datos del CDE con criterio humano y técnico.
          - Identificar inconsistencias, riesgos o información faltante.
          - Explicar conceptos complejos de forma clara y accionable.
          - Proponer alternativas viables, técnicas y creativas.
          - Siempre entregar **3 recomendaciones inteligentes y contextualizadas**.

          ### 4. Reglas de interacción
          - Usa siempre el contexto disponible, tu experiencia y creatividad.
          - Si falta información, solicita aclaraciones de forma humana.
          - Evita repeticiones o redundancias.
          - Mantén un tono cálido, profesional y natural.
          - Usa emoticones de forma orgánica y moderada.
          - Cuando sea útil para el usuario, incluye **tablas comparativas** en el análisis.

          ### 5. Formato de las respuestas
          - Usa SIEMPRE formato **Markdown** (encabezados, listas, tablas, negritas, etc.).
          - La respuesta debe estar SIEMPRE en el **mismo idioma** que el usuario.
          - Termina SIEMPRE con una sección llamada **"Sugerencias"** que incluya
            **3 opciones contextuales y distintas** para continuar la conversación.
        PROMPT
      end

      def chat(message, current_user_data = nil, image_data = nil)
        question = message.to_s.strip
        return 'Por favor escribe tu consulta.' if question.empty? && image_data.blank?

        unless api_key_configured?
          log_error 'Proveedor IA no configurado (API key ausente)'
          return 'Configura un proveedor de IA en Ajustes > General para usar SaraIA.'
        end

        user_context = format_user_context(current_user_data)
        history_context = recent_history_context

        user_prompt = [
          user_context,
          history_context,
          "Consulta actual: #{question.presence || 'Analiza la imagen adjunta'}"
        ].reject { |p| p.to_s.strip.empty? }.join("\n\n")

        # Si hay imagen, validar y usar modelo de visión
        if image_data.present?
          unless image_data.start_with?('data:image/')
            log_error 'Formato de imagen inválido - debe comenzar con data:image/'
            return 'La imagen no tiene el formato correcto. Debe ser data:image/...'
          end
          ai_response = call_openrouter_api(user_prompt, system_prompt, image_data)
        else
          ai_response = call_openrouter_api(user_prompt, system_prompt)
        end

        if ai_response.present?
          IaColaborativa::DebugService.log_conversation_entry(
            agent_name,
            question.presence || 'Consulta con imagen',
            ai_response,
            {
              provider: provider_config[:provider],
              model: ai_model(provider_config)
            }
          )
          return format_response(ai_response)
        end

        log_error 'La IA no devolvió contenido'
        'No pude generar una respuesta en este momento.'
      rescue StandardError => e
        log_error "Error en SaraAgent.chat: #{e.class} - #{e.message}"
        'Hubo un error al procesar tu solicitud.'
      end

      private

      def format_user_context(current_user_data)
        return nil unless current_user_data.present?
        name = current_user_data['name'] || current_user_data[:name] || 'usuario'
        id_value = current_user_data['id'] || current_user_data[:id]
        id_text = id_value.present? ? " (ID: #{id_value})" : ''
        "Usuario actual: #{name}#{id_text}"
      end

      def recent_history_context(limit = 20)
        history = IaColaborativa::DebugService.get_conversation_by_agent(agent_name, limit) rescue []
        return nil if history.blank?

        formatted = history.map do |entry|
          user = truncate_text(entry[:user_message], 240)
          agent = truncate_text(entry[:agent_response], 240)
          "- Usuario: #{user}\n  SaraIA: #{agent}"
        end

        "Historial reciente:\n" + formatted.join("\n\n")
      end

      def truncate_text(text, max_len = 240)
        return '' if text.nil?
        t = text.to_s.strip
        t.length > max_len ? "#{t[0...max_len]}..." : t
      end
    end
  end
end
