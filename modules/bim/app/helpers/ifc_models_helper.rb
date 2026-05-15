module IfcModelsHelper
  def provision_gon_for_ifc_model(all_models, shown_models)
    all_converted_models = converted_ifc_models(all_models)
    shown_model_ids = gon_ifc_shown_models(all_converted_models, shown_models)
    shown_converted_models = all_converted_models.select { |model| shown_model_ids.include?(model.id) }
    render_source_models = shown_converted_models.presence || all_converted_models
    metadata_ids = gon_ifc_model_metadata_attachment_ids(all_converted_models)
    xkt_ids = gon_ifc_model_xkt_attachment_ids(all_converted_models)
    default_ids = all_converted_models.select(&:is_default).map(&:id)

    Rails.logger.info(
      "[BIM::IFC][GON] project=#{@project&.identifier} " \
      "converted=#{all_converted_models.size} " \
      "defaults=#{default_ids.inspect} " \
      "shown_param=#{Array(shown_models).inspect} " \
      "shown=#{shown_model_ids.inspect} " \
      "render_source=#{render_source_models.map(&:id).inspect} " \
      "xkt_ids=#{xkt_ids.inspect} " \
      "metadata_ids=#{metadata_ids.inspect}"
    )

    gon.ifc_models = {
      models: gon_ifc_model_models(all_converted_models),
      shown_models: shown_model_ids,
      projects: [{ id: @project.identifier, name: @project.name }],
      xkt_attachment_ids: xkt_ids,
      metadata_attachment_ids: metadata_ids,
      permissions: {
        manage_ifc_models: User.current.allowed_in_project?(:manage_ifc_models, @project),
        manage_bcf: User.current.allowed_in_project?(:manage_bcf, @project)
      }
    }
  end

  def converted_ifc_models(ifc_models)
    ifc_models.select(&:converted?)
  end

  def gon_ifc_model_models(all_models)
    all_converted_models = converted_ifc_models(all_models)

    all_converted_models.map do |ifc_model|
      {
        id: ifc_model.id,
        name: ifc_model.title,
        default: ifc_model.is_default
      }
    end
  end

  def gon_ifc_shown_models(all_models, shown_models)
    explicit_ids = Array(shown_models).filter_map do |id|
      value = id.to_i
      value if value.positive?
    end

    if explicit_ids.any?
      selected_ids = converted_ifc_models(all_models)
        .select { |model| explicit_ids.include?(model.id) }
        .map(&:id)

      return selected_ids if selected_ids.any?
    end

    # Avoid mixing multiple revisions by default: if many defaults exist,
    # prefer the newest one only.
    default_id = all_models.select(&:is_default).last&.id
    return [default_id] if default_id

    # Last fallback: avoid empty viewer when defaults are inconsistent in DB.
    Array(all_models.last&.id).compact
  end

  def gon_ifc_model_xkt_attachment_ids(models)
    models.map { |model| [model.id, model.xkt_attachment.id] }.to_h
  end

  def gon_ifc_model_metadata_attachment_ids(models)
    models
      .map { |model| [model.id, model.metadata_attachment&.id] }
      .to_h
  end
end
