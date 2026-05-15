class WhatsappContactTag < ApplicationRecord
  belongs_to :project

  PRIMARY_COLORS = [
    "#1e88e5",
    "#e53935",
    "#fdd835",
    "#43a047",
    "#fb8c00",
    "#8e24aa",
    "#111111",
    "#ffffff",
    "#9e9e9e",
    "#ec407a"
  ].freeze

  validates :name, presence: true, uniqueness: { scope: :project_id, case_sensitive: false }
  validates :color, presence: true, inclusion: { in: PRIMARY_COLORS }

  before_validation :normalize_name

  def self.color_for_name(name)
    key = name.to_s.downcase
    return PRIMARY_COLORS.first if key.empty?
    index = key.bytes.sum % PRIMARY_COLORS.length
    PRIMARY_COLORS[index]
  end

  def self.ensure_for_project(project, names)
    list = Array(names).map { |item| item.to_s.strip }.reject(&:blank?)
    return [] if project.nil? || list.empty?

    existing = where(project: project)
               .where("LOWER(name) IN (?)", list.map(&:downcase))
               .index_by { |tag| tag.name.to_s.downcase }

    created = []
    list.each do |name|
      key = name.downcase
      next if existing[key]
      created << create!(project: project, name: name, color: color_for_name(name))
    end
    existing.values + created
  end

  def self.map_for_project(project)
    where(project: project).order(:name).map do |tag|
      { id: tag.id, name: tag.name, color: tag.color }
    end
  end

  private

  def normalize_name
    self.name = name.to_s.strip
  end
end
