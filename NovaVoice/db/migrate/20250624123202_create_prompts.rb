class CreatePrompts < ActiveRecord::Migration[8.0]
  def change
    create_table :prompts do |t|
      t.string :name, null: false
      t.text :content, null: false
      t.integer :version, default: 1, null: false
      t.boolean :is_active, default: false, null: false
      t.string :prompt_type, null: false
      t.text :metadata
      t.references :lead, null: true, foreign_key: true
      t.string :campaign_id

      t.timestamps
    end

    add_index :prompts, [:prompt_type, :is_active]
    add_index :prompts, [:campaign_id, :is_active]
    add_index :prompts, [:lead_id, :is_active]
    add_index :prompts, [:name, :version], unique: true
  end
end
