class CreateCampaigns < ActiveRecord::Migration[8.0]
  def change
    create_table :campaigns do |t|
      t.string :name
      t.text :description
      t.string :status
      t.integer :batch_size
      t.integer :call_spacing_seconds
      t.text :prompt_override
      t.string :created_by

      t.timestamps
    end
  end
end
