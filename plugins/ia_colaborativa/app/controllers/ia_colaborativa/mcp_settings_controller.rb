class IaColaborativa::McpSettingsController < ::ApplicationController
  no_authorization_required! :show
  before_action :require_admin, except: [:show]

  def show
    setting = ::IaColaborativa::McpSetting.singleton
    is_admin = current_openproject_user&.respond_to?(:admin?) && current_openproject_user.admin?
    serialized = serialize(setting, include_secrets: is_admin)
    Rails.logger.info "[IA Settings] SHOW mcp_settings user_admin=#{is_admin} " \
                      "url=#{serialized[:url].inspect} " \
                      "search_url=#{serialized[:search_url].inspect} " \
                      "username_present=#{serialized[:username].present?} " \
                      "password_present=#{serialized[:password].present?}"
    render json: { success: true, data: serialized }, status: :ok
  rescue StandardError => e
    Rails.logger.error "[IA Settings] SHOW mcp_settings error: #{e.class} - #{e.message}"
    render json: {
      success: true,
      data: {
        url: ENV['MCP_SERVER_URL'],
        search_url: ENV['MCP_SEARCH_SERVER_URL'] || ENV['MCP_SERVER_URL'],
        username: nil,
        password: nil
      },
      warning: 'fallback_response_due_to_error'
    }, status: :ok
  end

  def create
    update
  end

  def update
    setting = ::IaColaborativa::McpSetting.singleton
    url_value = params.dig(:mcp_setting, :url) || params[:url]
    search_url_value = params.dig(:mcp_setting, :search_url) || params[:search_url]
    username_value = params.dig(:mcp_setting, :username) || params[:username]
    password_value = params.dig(:mcp_setting, :password) || params[:password]

    if setting.update(url: url_value, search_url: search_url_value, username: username_value, password: password_value)
      render json: { success: true, data: serialize(setting) }, status: :ok
    else
      render json: { success: false, errors: setting.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def serialize(setting, include_secrets: false)
    url_value =
      setting.url.presence ||
      latest_present_value(IaColaborativa::McpSetting, :url) ||
      ENV['MCP_SERVER_URL']

    search_url_value =
      setting.search_url.presence ||
      latest_present_value(IaColaborativa::McpSetting, :search_url) ||
      ENV['MCP_SEARCH_SERVER_URL'] ||
      url_value

    username_value =
      setting.username.presence ||
      latest_present_value(IaColaborativa::McpSetting, :username) ||
      ENV['MCP_SERVER_USERNAME']

    password_value =
      setting.password.presence ||
      latest_present_value(IaColaborativa::McpSetting, :password) ||
      ENV['MCP_SERVER_PASSWORD']

    {
      url: url_value,
      search_url: search_url_value,
      username: include_secrets ? username_value : (username_value.present? ? '********' : nil),
      password: include_secrets ? password_value : (password_value.present? ? '********' : nil)
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
