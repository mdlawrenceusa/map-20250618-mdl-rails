module ApplicationHelper
    
def cable_url
    # Determine protocol based on current request
    protocol = request.ssl? ? 'wss' : 'ws'
    
    # Build the cable URL
    "#{protocol}://#{request.host_with_port}/cable"
  end
end
