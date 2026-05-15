# frozen_string_literal: true

class CreateMeetingSections < ActiveRecord::Migration[7.1]
  def up
    create_table :meeting_sections do |t|
      t.integer :position
      t.string :title
      t.references :meeting, null: false, foreign_key: true

      t.timestamps
    end

    add_reference :meeting_agenda_items, :meeting_section

    create_and_assign_default_section
  end

  def down
    remove_reference :meeting_agenda_items, :meeting_section
    drop_table :meeting_sections
    # TODO: positions of agenda items are now not valid anymore as they have been scoped to sections
    # Do we need to catch this?
  end

  private

  def create_and_assign_default_section
    execute <<~SQL.squish
      INSERT INTO meeting_sections (meeting_id, title, created_at, updated_at)
      SELECT id, 'Untitled', NOW(), NOW()
      FROM meetings
      WHERE meetings.type = 'StructuredMeeting';

      UPDATE meeting_agenda_items
      SET meeting_section_id = meeting_sections.id
      FROM meeting_sections
      WHERE meeting_agenda_items.meeting_id = meeting_sections.meeting_id;
    SQL
  end
end
