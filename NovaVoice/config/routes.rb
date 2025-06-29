Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  
  # Health check for CloudFront routing (production)
  get "app/up" => "rails/health#show"
  
  # Authentication routes (no auth required)
  resource :session, only: [:new, :create, :destroy]
  get '/login' => 'sessions#new'
  get '/logout' => 'sessions#destroy'
  
  # Redirect /app to /app/ to handle missing trailing slash
  get "app", to: redirect("/app/")
  
  # Production routes under /app prefix for CloudFront
  scope "/app" do
    # Authentication routes (no auth required)
    resource :session, only: [:new, :create, :destroy]
    get '/login' => 'sessions#new'
    get '/logout' => 'sessions#destroy'
    resources :campaigns do
      member do
        patch :launch
        patch :pause
        patch :resume
      end
    end
    
    resources :leads
    get "home/index"
    root "home#index", as: :app_root
    
    # Call management
    resources :calls, only: [:create, :show]
    
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
        
        # Calling schedule management
        namespace :calling_schedule do
          get :status
          get :queue
          post :schedule
          get :analytics
          post :process, action: :process_queue
          post :reschedule_failed
          get :windows
          put :restrictions, action: :update_restrictions
        end
      end
    end
    
    # Admin routes
    namespace :admin do
      namespace :calling_schedule do
        get :index
        get :queue
        get :analytics
        post :schedule_calls
        post :process_queue
        post :reschedule_failed
      end
      
      # Aurora DSQL Sync Management
      resources :sync, only: [:index] do
        collection do
          get :preview
          post :sync_to_production
          post :copy_from_production
          get :history
          get :status
        end
      end
    end
  end

  # Development routes (no prefix) - keep existing structure
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
      
      # Calling schedule management
      namespace :calling_schedule do
        get :status
        get :queue
        post :schedule
        get :analytics
        post :process, action: :process_queue
        post :reschedule_failed
        get :windows
        put :restrictions, action: :update_restrictions
      end
    end
  end
  
  # Admin routes
  namespace :admin do
    namespace :calling_schedule do
      get :index
      get :queue
      get :analytics
      post :schedule_calls
      post :process_queue
      post :reschedule_failed
    end
    
    # Aurora DSQL Sync Management
    resources :sync, only: [:index] do
      collection do
        get :preview
        post :sync_to_production
        post :copy_from_production
        get :history
        get :status
      end
    end
  end
  
  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
end
