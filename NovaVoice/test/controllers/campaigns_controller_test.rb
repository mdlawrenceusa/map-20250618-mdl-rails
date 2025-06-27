require "test_helper"

class CampaignsControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    get campaigns_index_url
    assert_response :success
  end

  test "should get show" do
    get campaigns_show_url
    assert_response :success
  end

  test "should get new" do
    get campaigns_new_url
    assert_response :success
  end

  test "should get create" do
    get campaigns_create_url
    assert_response :success
  end

  test "should get edit" do
    get campaigns_edit_url
    assert_response :success
  end

  test "should get update" do
    get campaigns_update_url
    assert_response :success
  end

  test "should get destroy" do
    get campaigns_destroy_url
    assert_response :success
  end

  test "should get launch" do
    get campaigns_launch_url
    assert_response :success
  end

  test "should get pause" do
    get campaigns_pause_url
    assert_response :success
  end

  test "should get resume" do
    get campaigns_resume_url
    assert_response :success
  end
end
