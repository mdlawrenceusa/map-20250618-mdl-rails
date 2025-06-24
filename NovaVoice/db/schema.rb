# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_06_24_123202) do
  create_table "leads", force: :cascade do |t|
    t.string "name"
    t.string "company"
    t.string "phone"
    t.string "website"
    t.string "state_province"
    t.string "lead_source"
    t.string "email"
    t.string "lead_status"
    t.datetime "created_date"
    t.string "owner_alias"
    t.boolean "unread_by_owner"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "prompts", force: :cascade do |t|
    t.string "name", null: false
    t.text "content", null: false
    t.integer "version", default: 1, null: false
    t.boolean "is_active", default: false, null: false
    t.string "prompt_type", null: false
    t.text "metadata"
    t.integer "lead_id"
    t.string "campaign_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["campaign_id", "is_active"], name: "index_prompts_on_campaign_id_and_is_active"
    t.index ["lead_id", "is_active"], name: "index_prompts_on_lead_id_and_is_active"
    t.index ["lead_id"], name: "index_prompts_on_lead_id"
    t.index ["name", "version"], name: "index_prompts_on_name_and_version", unique: true
    t.index ["prompt_type", "is_active"], name: "index_prompts_on_prompt_type_and_is_active"
  end

  add_foreign_key "prompts", "leads"
end
