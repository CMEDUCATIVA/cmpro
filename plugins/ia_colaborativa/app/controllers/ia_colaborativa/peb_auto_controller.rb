class IaColaborativa::PebAutoController < ActionController::API
  before_action :set_project_id

  def show
    plans = IaColaborativa::PebAutomation.where(project_id: @project_id).order(:created_at)
    render json: {
      success: true,
      plans: plans.map { |plan| serialize_plan(plan) }
    }, status: :ok
  end

  def create
    attrs = plan_params

    plan = if attrs[:id].present?
             IaColaborativa::PebAutomation.where(project_id: @project_id).find_by(id: attrs[:id])
           end

    if attrs[:id].present? && plan.nil?
      return render json: {
        success: false,
        error: 'Plan no encontrado'
      }, status: :not_found
    end

    if ActiveModel::Type::Boolean.new.cast(params[:_delete]) || ActiveModel::Type::Boolean.new.cast(attrs.delete(:_delete))
      if plan&.destroy
        return render json: { success: true }, status: :ok
      else
        return render json: { success: false, error: 'Plan no encontrado' }, status: :not_found
      end
    end

    plan ||= IaColaborativa::PebAutomation.new(project_id: @project_id)

    plan.plan_title = attrs[:plan_title].presence || default_title
    plan.payload = attrs[:payload].presence || {}

    plan.save!

    render json: {
      success: true,
      plan: serialize_plan(plan)
    }, status: :ok
  rescue StandardError => e
    Rails.logger.error "[IA PEB AUTO] #{e.class}: #{e.message}"
    Rails.logger.error e.backtrace.first(5).join("\n")

    render json: {
      success: false,
      error: e.message
    }, status: :unprocessable_entity
  end

  private

  def plan_params
    payload = params.require(:plan).permit(:id, :plan_title, payload: {})
    payload[:payload] ||= {}
    payload
  end

  def set_project_id
    raw_id = params[:project_id].presence ||
             params.dig(:plan, :project_id).presence

    @project_id = raw_id.to_i if raw_id.present?
    @project_id = 0 if @project_id.nil? || @project_id.negative?
  end

  def serialize_plan(plan)
    return nil unless plan

    {
      id: plan.id,
      project_id: plan.project_id,
      plan_title: plan.plan_title,
      payload: plan.payload || {}
    }
  end

  def default_title
    'Plan de Ejecucion BIM'
  end
end
