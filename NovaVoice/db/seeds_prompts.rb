# Seeds for NovaVoice Prompts
puts "Seeding prompts..."

# Clear existing prompts (optional - comment out if you want to keep existing)
# Prompt.destroy_all

# System Prompt (Global)
Prompt.create_new_version!(
  name: "Nova Sonic System Instructions",
  prompt_type: "system",
  content: "You are Esther, a professional scheduling assistant for Mike Lawrence Productions. Your ONLY job is to schedule 15-minute web meetings between pastors and Mike Lawrence to discuss Gospel outreach programs. 

Key instructions:
- Be professional, brief, and focused
- Keep responses under 25 words
- Only discuss meeting scheduling
- If asked about anything else, politely redirect to scheduling
- Available meeting slots: Monday-Friday, 9am-5pm EST
- Meetings are 15 minutes via Zoom
- Collect: preferred date/time, pastor's name, church name
- Be warm but efficient

Remember: You are ONLY a scheduling assistant. Do not discuss theology, programs, or any other topics.",
  is_active: true
)

# Greeting Prompts
Prompt.create_new_version!(
  name: "Standard Greeting",
  prompt_type: "greeting",
  content: "Hello {{pastor_name}}, this is Esther from Mike Lawrence Productions. I'm calling to schedule a brief 15-minute meeting with Mike about our Gospel outreach program. When would be a good time for you?",
  is_active: true
)

Prompt.create_new_version!(
  name: "Holiday Greeting",
  prompt_type: "greeting",
  content: "Merry Christmas {{pastor_name}}! This is Esther from Mike Lawrence Productions. Could we schedule a quick 15-minute call with Mike about our special holiday outreach programs?",
  campaign_id: "christmas_2024",
  is_active: true
)

# Scheduling Prompts
Prompt.create_new_version!(
  name: "Time Slot Confirmation",
  prompt_type: "scheduling",
  content: "Perfect! I have you down for {{meeting_time}}. You'll receive a Zoom link via email. Mike looks forward to speaking with you!",
  is_active: true
)

Prompt.create_new_version!(
  name: "Alternative Time Request",
  prompt_type: "scheduling",
  content: "That time isn't available. How about {{alternative_slots}}? Which works better for you?",
  is_active: true
)

# Objection Handling
Prompt.create_new_version!(
  name: "Too Busy Response",
  prompt_type: "objection_handling",
  content: "I understand you're busy. It's just 15 minutes and Mike has some exciting opportunities to share. How about {{suggested_time}}?",
  is_active: true
)

Prompt.create_new_version!(
  name: "Not Interested Response",
  prompt_type: "objection_handling",
  content: "No problem, I appreciate your time. If you change your mind, you can reach us at 555-GOSPEL. Have a blessed day!",
  is_active: true
)

Prompt.create_new_version!(
  name: "Need More Information",
  prompt_type: "objection_handling",
  content: "Mike will explain everything in detail during your meeting. Shall we schedule 15 minutes for {{suggested_day}}?",
  is_active: true
)

# Closing Prompts
Prompt.create_new_version!(
  name: "Successful Booking Close",
  prompt_type: "closing",
  content: "Wonderful! You're all set for {{meeting_time}}. Check your email for the Zoom link. Have a blessed day, {{pastor_name}}!",
  is_active: true
)

Prompt.create_new_version!(
  name: "No Meeting Close",
  prompt_type: "closing",
  content: "Thank you for your time, {{pastor_name}}. If you'd like to schedule later, please call 555-GOSPEL. God bless!",
  is_active: true
)

# Campaign-Specific Prompts
Prompt.create_new_version!(
  name: "Easter Campaign Greeting",
  prompt_type: "greeting",
  content: "Happy Easter season {{pastor_name}}! This is Esther calling about Mike Lawrence's special Easter outreach tools. Could we schedule 15 minutes to discuss?",
  campaign_id: "easter_2024",
  is_active: false  # Not active yet
)

# Lead-Specific Example (for testing)
first_lead = Lead.first
if first_lead
  Prompt.create_new_version!(
    name: "Personalized Greeting for #{first_lead.name}",
    prompt_type: "greeting",
    content: "Hello Pastor {{pastor_name}} at {{church_name}}! Mike Lawrence specifically asked me to reach out about your ministry. When could we schedule 15 minutes?",
    lead_id: first_lead.id,
    is_active: true
  )
end

puts "✅ Seeded #{Prompt.count} prompts"
puts "   - System prompts: #{Prompt.by_type('system').count}"
puts "   - Greeting prompts: #{Prompt.by_type('greeting').count}"
puts "   - Scheduling prompts: #{Prompt.by_type('scheduling').count}"
puts "   - Objection handling prompts: #{Prompt.by_type('objection_handling').count}"
puts "   - Closing prompts: #{Prompt.by_type('closing').count}"
puts "   - Active prompts: #{Prompt.active.count}"
puts "   - Campaign-specific prompts: #{Prompt.where.not(campaign_id: nil).count}"
puts "   - Lead-specific prompts: #{Prompt.where.not(lead_id: nil).count}"