class WhatsappChannel < ActionCable::Channel::Base
  def subscribed
    project_id = params[:project_id].to_i
    project = Project.find_by(id: project_id)
    unless project && User.current.allowed_to?(:view_whatsapp, project)
      reject
      return
    end

    stream_for "project:#{project.id}"
  end
end
