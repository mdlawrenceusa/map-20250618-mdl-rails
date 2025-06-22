import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { cognitoAuth, protectEndpoints } from './middleware/cognitoAuth';

// Import existing server components
import { handleVonageWebhook } from './telephony/vonage';
import { makeOutboundCall } from './telephony/outbound';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply Cognito authentication to protected endpoints
// This will protect /outbound/dashboard and /api/* but NOT /webhooks/* or WebSocket
app.use(protectEndpoints([
  '/outbound/dashboard',
  '/api/'
]));

// Public endpoints (no authentication required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Webhook endpoints (no authentication required - these are called by Vonage)
app.post('/webhooks/answer', handleVonageWebhook);
app.post('/webhooks/events', (req, res) => {
  console.log('Vonage event:', req.body);
  res.sendStatus(200);
});

// Authentication endpoints
app.get('/auth/login', (req, res) => {
  const loginUrl = cognitoAuth.getLoginUrl(req.query.state as string);
  res.redirect(loginUrl);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    const tokens = await cognitoAuth.handleOAuthCallback(code as string);
    
    // In production, you'd typically set these as secure HTTP-only cookies
    // or return them to a frontend application
    res.json({
      message: 'Authentication successful',
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch (error) {
    console.error('Authentication callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/auth/logout', (req, res) => {
  const logoutUrl = cognitoAuth.getLogoutUrl();
  res.redirect(logoutUrl);
});

app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token provided' });
    }

    const tokens = await cognitoAuth.refreshToken(refreshToken);
    res.json({
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      expiresIn: tokens.expires_in,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// Protected API endpoints (require authentication)
app.get('/api/user/profile', async (req: any, res) => {
  try {
    // req.user is populated by the authentication middleware
    const userInfo = await cognitoAuth.getUserInfo(req.headers.authorization?.substring(7) || '');
    res.json(userInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Protected outbound call endpoints
app.post('/api/outbound/call', async (req: any, res) => {
  try {
    const { to, message } = req.body;
    
    // Log who is making the call
    console.log(`User ${req.user.email} initiating call to ${to}`);
    
    const result = await makeOutboundCall(to, message);
    res.json(result);
  } catch (error) {
    console.error('Outbound call error:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// Protected dashboard endpoint
app.get('/outbound/dashboard', cognitoAuth.requireAdmin, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Nova Sonic Outbound Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        .logout { float: right; background: #dc3545; color: white; border: none; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Nova Sonic Outbound Dashboard</h1>
        <button class="logout" onclick="window.location.href='/auth/logout'">Logout</button>
      </div>
      
      <div class="section">
        <h2>Admin Dashboard</h2>
        <p>Welcome! You have admin access to this dashboard.</p>
        
        <h3>Make Outbound Call</h3>
        <form id="callForm">
          <label>Phone Number: <input type="tel" id="phoneNumber" required></label><br>
          <label>Message: <textarea id="message" required></textarea></label><br>
          <button type="submit">Make Call</button>
        </form>
      </div>
      
      <script>
        // Store token in memory (in production, use secure storage)
        const token = new URLSearchParams(window.location.search).get('token') || 
                     localStorage.getItem('accessToken');
        
        if (token) {
          localStorage.setItem('accessToken', token);
        }
        
        document.getElementById('callForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const phoneNumber = document.getElementById('phoneNumber').value;
          const message = document.getElementById('message').value;
          
          try {
            const response = await fetch('/api/outbound/call', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
              },
              body: JSON.stringify({ to: phoneNumber, message })
            });
            
            if (response.ok) {
              alert('Call initiated successfully!');
            } else {
              throw new Error('Call failed');
            }
          } catch (error) {
            alert('Error: ' + error.message);
          }
        });
      </script>
    </body>
    </html>
  `);
});

// WebSocket connection (no authentication for Vonage compatibility)
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Nova Sonic server with Cognito authentication running on port ${PORT}`);
  console.log(`Protected endpoints: /outbound/dashboard, /api/*`);
  console.log(`Public endpoints: /webhooks/*, WebSocket connections`);
});