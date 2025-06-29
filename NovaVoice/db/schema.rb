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

ActiveRecord::Schema[8.0].define(version: 2025_06_29_011646) do
  create_table "calling_queues", force: :cascade do |t|
    t.integer "lead_id", null: false
    t.datetime "scheduled_call_time", null: false
    t.integer "priority", default: 1, null: false
    t.string "status", default: "pending", null: false
    t.integer "attempt_count", default: 0, null: false
    t.text "notes"
    t.datetime "last_attempt_at"
    t.text "failure_reason"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["lead_id", "status"], name: "index_calling_queues_on_lead_id_and_status"
    t.index ["lead_id"], name: "index_calling_queues_on_lead_id"
    t.index ["scheduled_call_time"], name: "index_calling_queues_on_scheduled_call_time"
    t.index ["status", "scheduled_call_time"], name: "index_calling_queues_on_status_and_scheduled_call_time"
  end

  create_table "calling_schedules", force: :cascade do |t|
    t.integer "day_of_week", null: false
    t.time "start_time", null: false
    t.time "end_time", null: false
    t.boolean "enabled", default: true, null: false
    t.string "name", null: false
    t.string "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["day_of_week", "enabled"], name: "index_calling_schedules_on_day_of_week_and_enabled"
    t.index ["enabled"], name: "index_calling_schedules_on_enabled"
  end

  create_table "campaign_calls", force: :cascade do |t|
    t.integer "campaign_id", null: false
    t.integer "lead_id", null: false
    t.string "call_uuid"
    t.string "phone_number"
    t.string "status"
    t.integer "attempt_number"
    t.datetime "scheduled_for"
    t.datetime "called_at"
    t.text "error_message"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["campaign_id"], name: "index_campaign_calls_on_campaign_id"
    t.index ["lead_id"], name: "index_campaign_calls_on_lead_id"
  end

  create_table "campaigns", force: :cascade do |t|
    t.string "name"
    t.text "description"
    t.string "status"
    t.integer "batch_size"
    t.integer "call_spacing_seconds"
    t.text "prompt_override"
    t.string "created_by"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

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
    t.boolean "calling_schedule_enabled", default: true, null: false
    t.string "time_zone", default: "EST", null: false
    t.datetime "last_call_attempt"
    t.datetime "next_available_call_time"
    t.index ["calling_schedule_enabled"], name: "index_leads_on_calling_schedule_enabled"
    t.index ["next_available_call_time"], name: "index_leads_on_next_available_call_time"
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
    t.datetime "published_at"
    t.text "published_content"
    t.string "assistant_name", default: "esther"
    t.index ["assistant_name"], name: "index_prompts_on_assistant_name"
    t.index ["campaign_id", "is_active"], name: "index_prompts_on_campaign_id_and_is_active"
    t.index ["lead_id", "is_active"], name: "index_prompts_on_lead_id_and_is_active"
    t.index ["lead_id"], name: "index_prompts_on_lead_id"
    t.index ["name", "version"], name: "index_prompts_on_name_and_version", unique: true
    t.index ["prompt_type", "is_active"], name: "index_prompts_on_prompt_type_and_is_active"
    t.index ["published_at", "is_active"], name: "index_prompts_on_published_at_and_is_active"
  end

  create_table "sync_records", force: :cascade do |t|
    t.string "resource_type"
    t.integer "resource_id"
    t.string "synced_by"
    t.datetime "synced_at"
    t.string "environment"
    t.text "sync_details"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "calling_queues", "leads"
  add_foreign_key "campaign_calls", "campaigns"
  add_foreign_key "campaign_calls", "leads"
  add_foreign_key "prompts", "leads"
end
