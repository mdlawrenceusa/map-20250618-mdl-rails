module ApplicationHelper
  def cable_url
    # Determine protocol based on current request
    protocol = request.ssl? ? 'wss' : 'ws'
    
    # Build the cable URL
    "#{protocol}://#{request.host_with_port}/cable"
  end
  
  def sync_type_color(type)
    colors = {
      'prompt' => 'w3-blue',
      'campaign' => 'w3-green',
      'lead' => 'w3-orange',
      'call_transcript' => 'w3-purple',
      'analytics' => 'w3-indigo'
    }
    colors[type] || 'w3-grey'
  end
end
