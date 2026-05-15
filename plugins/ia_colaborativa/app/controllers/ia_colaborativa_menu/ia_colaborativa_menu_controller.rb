class IaColaborativaMenu::IaColaborativaMenuController < ApplicationController
  before_action :find_project_by_project_id
  before_action :authorize

  def index
    render :index
  end
end
