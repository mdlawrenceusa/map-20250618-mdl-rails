Rails.application.routes.draw do
  resources :campaigns do
    member do
      patch :launch
      patch :pause
      patch :resume
    end
  end
  
  resources :leads
  get "home/index"
  root "home#index"
  
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Call management
  resources :calls, only: [:create, :show]
  
  # Vonage webhooks - matching your dashboard configuration
  # IMPORTANT: Answer webhooks use GET, events use POST!
  get '/outbound/webhooks/answer', to: 'vonage_webhooks#outbound_answer'
  post '/outbound/webhooks/events', to: 'vonage_webhooks#outbound_events'
  get '/webhooks/answer', to: 'vonage_webhooks#inbound_answer'
  post '/webhooks/events', to: 'vonage_webhooks#inbound_events'
  
  # API routes
  namespace :api do
    namespace :v1 do
      resources :prompts, only: [:index, :show, :create, :update] do
        collection do
          get :current
          post :render, action: :render_prompt
          post :clear_cache
          get :admin
          get :publish_status
          post :publish
          get :s3_status
        end
        member do
          patch :activate
          patch :deactivate
          post :duplicate
        end
      end
      
      # Published prompt viewing by assistant name
      get 'prompts/:assistant_name/published', to: 'prompts#show_published'
      
      # DynamoDB transcript viewing
      resources :transcripts, only: [:index, :show] do
        collection do
          get :search
          get :stats
        end
      end
    end
  end
  
  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
end
