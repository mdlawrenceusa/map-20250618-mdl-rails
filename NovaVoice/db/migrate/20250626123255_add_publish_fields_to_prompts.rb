class AddPublishFieldsToPrompts < ActiveRecord::Migration[8.0]
  def change
    add_column :prompts, :published_at, :datetime
    add_column :prompts, :published_content, :text
    add_column :prompts, :assistant_name, :string, default: 'esther'
    
    # Add indexes for performance
    add_index :prompts, [:published_at, :is_active]
    add_index :prompts, :assistant_name
  end
end
