require "application_system_test_case"

class LeadsTest < ApplicationSystemTestCase
  setup do
    @lead = leads(:one)
  end

  test "visiting the index" do
    visit leads_url
    assert_selector "h1", text: "Leads"
  end

  test "should create lead" do
    visit leads_url
    click_on "New lead"

    fill_in "Company", with: @lead.company
    fill_in "Created date", with: @lead.created_date
    fill_in "Email", with: @lead.email
    fill_in "Lead source", with: @lead.lead_source
    fill_in "Lead status", with: @lead.lead_status
    fill_in "Name", with: @lead.name
    fill_in "Owner alias", with: @lead.owner_alias
    fill_in "Phone", with: @lead.phone
    fill_in "State province", with: @lead.state_province
    check "Unread by owner" if @lead.unread_by_owner
    fill_in "Website", with: @lead.website
    click_on "Create Lead"

    assert_text "Lead was successfully created"
    click_on "Back"
  end

  test "should update Lead" do
    visit lead_url(@lead)
    click_on "Edit this lead", match: :first

    fill_in "Company", with: @lead.company
    fill_in "Created date", with: @lead.created_date.to_s
    fill_in "Email", with: @lead.email
    fill_in "Lead source", with: @lead.lead_source
    fill_in "Lead status", with: @lead.lead_status
    fill_in "Name", with: @lead.name
    fill_in "Owner alias", with: @lead.owner_alias
    fill_in "Phone", with: @lead.phone
    fill_in "State province", with: @lead.state_province
    check "Unread by owner" if @lead.unread_by_owner
    fill_in "Website", with: @lead.website
    click_on "Update Lead"

    assert_text "Lead was successfully updated"
    click_on "Back"
  end

  test "should destroy Lead" do
    visit lead_url(@lead)
    accept_confirm { click_on "Destroy this lead", match: :first }

    assert_text "Lead was successfully destroyed"
  end
end
