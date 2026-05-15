# frozen_string_literal: true

#-- copyright
# OpenProject is an open source project management software.
# Copyright (C) the OpenProject GmbH
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License version 3.
#
# OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
# Copyright (C) 2006-2013 Jean-Philippe Lang
# Copyright (C) 2010-2013 the ChiliProject Team
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; either version 2
# of the License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
#
# See COPYRIGHT and LICENSE files for more details.
#++

class AddPolymorphicAuthSourceAndIntegrationToRemoteIdentities < ActiveRecord::Migration[7.1]
  def up
    remove_foreign_key :remote_identities, :oauth_clients

    rename_column :remote_identities, :oauth_client_id, :auth_source_id
    add_column :remote_identities, :auth_source_type, :string
    remove_index :remote_identities, :auth_source_id
    remove_index :remote_identities, %i[user_id auth_source_id]
    add_index :remote_identities, %i[auth_source_type auth_source_id]

    add_column :remote_identities, :integration_type, :string
    add_column :remote_identities, :integration_id, :bigint
    add_index :remote_identities, %i[integration_type integration_id]

    execute <<~SQL.squish
      UPDATE remote_identities
      SET auth_source_type = 'OAuthClient',
          integration_id = oauth_clients.integration_id,
          integration_type = oauth_clients.integration_type
      FROM oauth_clients
      WHERE remote_identities.auth_source_id = oauth_clients.id;
    SQL

    change_column_null(:remote_identities, :integration_id, false)
    change_column_null(:remote_identities, :integration_type, false)
    change_column_null(:remote_identities, :auth_source_type, false)

    add_index(:remote_identities,
              %i[user_id auth_source_type auth_source_id integration_id integration_type],
              unique: true)
  end

  def down
    remove_index(:remote_identities,
                 %i[user_id auth_source_type auth_source_id integration_id integration_type])
    rename_column :remote_identities, :auth_source_id, :oauth_client_id
    add_foreign_key :remote_identities, :oauth_clients
    add_index :remote_identities, :oauth_client_id
    add_index :remote_identities, %i[user_id oauth_client_id], unique: true
    remove_column :remote_identities, :auth_source_type

    remove_column :remote_identities, :integration_id
    remove_column :remote_identities, :integration_type
  end
end
