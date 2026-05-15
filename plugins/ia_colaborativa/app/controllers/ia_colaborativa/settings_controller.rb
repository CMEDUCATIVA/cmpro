class IaColaborativa::SettingsController < ::ApplicationController
  no_authorization_required! :show
  before_action :require_admin, except: [:show]

  def show
    setting = ::IaColaborativa::ProviderSetting.singleton
    provider_cfg = ::IaColaborativa::BaseAgent.provider_config
    is_admin = current_openproject_user&.respond_to?(:admin?) && current_openproject_user.admin?
    serialized = serialize(setting, fallback: provider_cfg, include_secrets: is_admin)
    lightrag_serialized = serialize_lightrag(include_secrets: is_admin)

    Rails.logger.info "[IA Settings] SHOW provider_settings user_admin=#{is_admin} " \
                      "provider=#{serialized[:provider].inspect} " \
                      "base_url=#{serialized[:base_url].inspect} " \
                      "model=#{serialized[:model].inspect} " \
                      "api_key_present=#{serialized[:api_key_present]} " \
                      "max_tokens=#{serialized[:max_tokens].inspect} " \
                      "lightrag_url=#{lightrag_serialized[:url].inspect} " \
                      "lightrag_api_key_present=#{lightrag_serialized[:api_key_present]}"
    render json: {
      success: true,
      data: serialized.merge(
        lightrag: lightrag_serialized
      )
    }, status: :ok
  rescue StandardError => e
    Rails.logger.error "[IA Settings] SHOW provider_settings error: #{e.class} - #{e.message}"
    render json: {
      success: true,
      data: {
        provider: nil,
        base_url: ENV['OPENAI_API_BASE'],
        model: ENV['OPENAI_MODEL'],
        api_key: nil,
        api_key_present: ENV['OPENAI_API_KEY'].present?,
        max_tokens: (ENV['IA_MAX_TOKENS'] || ENV['OPENAI_MAX_TOKENS'] || 1000).to_i,
        lightrag: {
          url: ENV['LIGHTRAG_URL'] || ENV['LIGHTRAG_API_URL'],
          api_key: nil,
          api_key_present: ENV['LIGHTRAG_API_KEY'].present?
        }
      },
      warning: 'fallback_response_due_to_error'
    }, status: :ok
  end

  def create
    update
  end

  def update
    setting = ::IaColaborativa::ProviderSetting.singleton
    attrs = params.require(:provider_setting).permit(:provider, :base_url, :api_key, :model, :max_tokens)
    lightrag_attrs = params[:lightrag_setting]&.permit(:url, :api_key)
    if lightrag_attrs && (lightrag_attrs[:api_key].blank? || lightrag_attrs[:api_key] == '********')
      lightrag_attrs = lightrag_attrs.except(:api_key)
    end

    if setting.update(attrs)
      if lightrag_attrs.present?
        IaColaborativa::LightragSetting.singleton.update(lightrag_attrs)
      end
      render json: { success: true, data: serialize(setting).merge(lightrag: serialize_lightrag) }, status: :ok
    else
      render json: { success: false, errors: setting.errors.full_messages }, status: :unprocessable_entity
    end
  rescue ActionController::ParameterMissing => e
    render json: { success: false, error: e.message }, status: :unprocessable_entity
  end

  private

  def serialize(setting, fallback: {}, include_secrets: false)
    provider_value =
      setting.provider.presence ||
      IaColaborativa::ProviderSetting.where.not(provider: [nil, '']).order(updated_at: :desc, id: :desc).pick(:provider) ||
      fallback[:provider]

    base_url_value =
      setting.base_url.presence ||
      IaColaborativa::ProviderSetting.where.not(base_url: [nil, '']).order(updated_at: :desc, id: :desc).pick(:base_url) ||
      fallback[:base_url]

    model_value =
      setting.model.presence ||
      IaColaborativa::ProviderSetting.where.not(model: [nil, '']).order(updated_at: :desc, id: :desc).pick(:model) ||
      fallback[:model]

    api_key_value =
      setting.api_key.presence ||
      IaColaborativa::ProviderSetting.where.not(api_key: [nil, '']).order(updated_at: :desc, id: :desc).pick(:api_key) ||
      fallback[:api_key]

    max_tokens_value =
      setting.max_tokens.presence ||
      IaColaborativa::ProviderSetting.where.not(max_tokens: nil).order(updated_at: :desc, id: :desc).pick(:max_tokens) ||
      fallback[:max_tokens] ||
      1000

    {
      provider: provider_value,
      base_url: base_url_value,
      model: model_value,
      api_key: include_secrets ? api_key_value : (api_key_value.present? ? '********' : nil),
      api_key_present: api_key_value.present?,
      max_tokens: max_tokens_value
    }
  end

  def serialize_lightrag(include_secrets: false)
    l = IaColaborativa::LightragSetting.singleton rescue nil
    url =
      l&.url.presence ||
      latest_present_value(IaColaborativa::LightragSetting, :url) ||
      ENV['LIGHTRAG_URL'] ||
      ENV['LIGHTRAG_API_URL']

    api_key =
      l&.api_key.presence ||
      latest_present_value(IaColaborativa::LightragSetting, :api_key) ||
      ENV['LIGHTRAG_API_KEY']

    {
      url: url,
      api_key: include_secrets ? api_key : (api_key.present? ? '********' : nil),
      api_key_present: api_key.present?
    }
  end

  def latest_present_value(model_class, column)
    return nil unless model_class.respond_to?(:table_exists?) && model_class.table_exists?

    model_class.where.not(column => [nil, '']).order(updated_at: :desc, id: :desc).pick(column)
  rescue StandardError
    nil
  end

  def current_openproject_user
    return current_user if respond_to?(:current_user, true) && current_user.present?
    return ::User.current if defined?(::User) && ::User.respond_to?(:current)

    nil
  rescue StandardError
    nil
  end
end
