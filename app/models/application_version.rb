class ApplicationVersion < ApplicationRecord
  include PaperTrail::VersionConcern
  self.abstract_class = true
end
