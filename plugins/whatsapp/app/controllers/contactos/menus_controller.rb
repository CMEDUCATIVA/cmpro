module Contactos
  class MenusController < ApplicationController
    before_action :find_project_by_project_id
    before_action :authorize

    def show
      @sidebar_menu_items = Contactos::Menu.new(project: @project, params:).menu_items
      render layout: nil
    end
  end
end
