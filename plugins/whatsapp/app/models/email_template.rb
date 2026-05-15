class EmailTemplate < ApplicationRecord
  belongs_to :project
  has_many :email_template_attachments, dependent: :destroy

  validates :name, presence: true
  validates :subject, presence: true
  validates :editor_mode, inclusion: { in: %w[editor html] }
  validates :open_tracking_enabled, inclusion: { in: [true, false] }
  validate :body_presence_for_mode
  validates :name, uniqueness: { scope: :project_id, case_sensitive: false }
  before_validation :normalize_body_fields

  def html_mode?
    editor_mode == "html"
  end

  def editor_mode?
    editor_mode == "editor"
  end

  private

  def body_presence_for_mode
    if html_mode?
      errors.add(:body_html, "no puede estar vacio") if body_html.to_s.strip.empty?
    else
      errors.add(:body, "no puede estar vacio") if body.to_s.strip.empty?
    end
  end

  def normalize_body_fields
    if html_mode?
      self.body = "" if body.nil?
    else
      self.body_html = nil if body_html.to_s.strip.empty?
    end
  end
end
