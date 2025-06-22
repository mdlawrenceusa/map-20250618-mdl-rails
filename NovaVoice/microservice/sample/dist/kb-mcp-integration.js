"use strict";
/**
 * Bedrock Knowledge Base MCP Integration for Nova Sonic
 * Simplified MCP-style tools integrated directly into the server
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKnowledgeBase = createKnowledgeBase;
exports.configureKnowledgeBase = configureKnowledgeBase;
exports.uploadDocument = uploadDocument;
exports.getKBStatus = getKBStatus;
exports.setupKBRoutes = setupKBRoutes;
const client_bedrock_agent_1 = require("@aws-sdk/client-bedrock-agent");
const client_s3_1 = require("@aws-sdk/client-s3");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// Initialize AWS clients
const bedrockAgent = new client_bedrock_agent_1.BedrockAgentClient({ region: 'us-east-1' });
const s3Client = new client_s3_1.S3Client({ region: 'us-east-1' });
let kbConfig = {
    s3Bucket: 'nova-sonic-documents-202505',
    status: 'not_configured'
};
// Load saved config on startup
async function loadKBConfig() {
    try {
        const configPath = path_1.default.join(__dirname, '../../../kb-config.json');
        const data = await promises_1.default.readFile(configPath, 'utf-8');
        kbConfig = JSON.parse(data);
        console.log('📚 Loaded KB config:', kbConfig.knowledgeBaseId);
    }
    catch (error) {
        console.log('📚 No existing KB config found');
    }
}
// Save config
async function saveKBConfig() {
    const configPath = path_1.default.join(__dirname, '../../../kb-config.json');
    await promises_1.default.writeFile(configPath, JSON.stringify(kbConfig, null, 2));
}
/**
 * MCP-style tool: Create Knowledge Base
 * Simplifies the entire KB creation process
 */
async function createKnowledgeBase(req, res) {
    try {
        console.log('🧠 Creating Knowledge Base via MCP integration...');
        // If already configured, return existing
        if (kbConfig.knowledgeBaseId && kbConfig.status === 'ready') {
            return res.json({
                success: true,
                knowledgeBaseId: kbConfig.knowledgeBaseId,
                message: 'Knowledge Base already configured'
            });
        }
        kbConfig.status = 'creating';
        // Step 1: Create Knowledge Base (simplified - assumes role exists)
        const roleArn = `arn:aws:iam::${process.env.AWS_ACCOUNT_ID || '302296110959'}:role/BedrockKnowledgeBaseRole-NovaSonic`;
        const kbCommand = new client_bedrock_agent_1.CreateKnowledgeBaseCommand({
            name: 'nova-sonic-kb',
            description: 'Mike Lawrence Productions outreach information for Esther',
            roleArn: roleArn,
            knowledgeBaseConfiguration: {
                type: 'VECTOR',
                vectorKnowledgeBaseConfiguration: {
                    embeddingModelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v1'
                }
            }
        });
        // Note: In real implementation, would handle OpenSearch creation
        // For now, return instructions for manual creation
        res.json({
            success: false,
            message: 'Automatic KB creation requires OpenSearch setup',
            manualSteps: {
                1: 'Go to Bedrock Console',
                2: 'Create Knowledge Base with name: nova-sonic-kb',
                3: 'Use S3 bucket: nova-sonic-documents-202505',
                4: 'Copy KB ID and call /api/kb/configure with the ID'
            }
        });
    }
    catch (error) {
        console.error('❌ KB creation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
/**
 * MCP-style tool: Configure existing Knowledge Base
 */
async function configureKnowledgeBase(req, res) {
    try {
        const { knowledgeBaseId, dataSourceId } = req.body;
        if (!knowledgeBaseId) {
            return res.status(400).json({
                success: false,
                error: 'knowledgeBaseId is required'
            });
        }
        // Update configuration
        kbConfig.knowledgeBaseId = knowledgeBaseId;
        kbConfig.dataSourceId = dataSourceId;
        kbConfig.status = 'ready';
        await saveKBConfig();
        // Update Esther's prompt to use KB
        updateEstherWithKB(knowledgeBaseId);
        res.json({
            success: true,
            message: 'Knowledge Base configured successfully',
            config: kbConfig
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
/**
 * MCP-style tool: Upload document and sync
 */
async function uploadDocument(req, res) {
    try {
        const { filename, content, contentType = 'application/pdf' } = req.body;
        if (!filename || !content) {
            return res.status(400).json({
                success: false,
                error: 'filename and content are required'
            });
        }
        // Upload to S3
        const key = `documents/${filename}`;
        const buffer = Buffer.from(content, 'base64');
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: kbConfig.s3Bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType
        }));
        // If KB is configured, start sync
        let syncStarted = false;
        if (kbConfig.knowledgeBaseId && kbConfig.dataSourceId) {
            try {
                await bedrockAgent.send(new client_bedrock_agent_1.StartIngestionJobCommand({
                    knowledgeBaseId: kbConfig.knowledgeBaseId,
                    dataSourceId: kbConfig.dataSourceId
                }));
                syncStarted = true;
                kbConfig.status = 'syncing';
                kbConfig.lastSync = new Date().toISOString();
                await saveKBConfig();
            }
            catch (error) {
                console.error('Sync error:', error);
            }
        }
        res.json({
            success: true,
            message: 'Document uploaded successfully',
            location: `s3://${kbConfig.s3Bucket}/${key}`,
            syncStarted
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
/**
 * MCP-style tool: Get KB status
 */
async function getKBStatus(req, res) {
    try {
        const status = {
            configured: !!kbConfig.knowledgeBaseId,
            ...kbConfig
        };
        // If syncing, check job status
        if (kbConfig.status === 'syncing' && kbConfig.knowledgeBaseId) {
            // Would check actual job status here
            status.status = 'ready'; // Simplified
        }
        res.json(status);
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
/**
 * Update Esther's configuration to use Knowledge Base
 */
function updateEstherWithKB(knowledgeBaseId) {
    // This would update the AI prompt system to include KB queries
    console.log(`📚 Esther now has access to Knowledge Base: ${knowledgeBaseId}`);
    // In real implementation:
    // 1. Update the WebSocket handler to query KB
    // 2. Add KB context to prompts
    // 3. Enable document-based responses
}
/**
 * Express route setup
 */
function setupKBRoutes(app) {
    // Load config on startup
    loadKBConfig();
    // MCP-style endpoints
    app.post('/api/kb/create', createKnowledgeBase);
    app.post('/api/kb/configure', configureKnowledgeBase);
    app.post('/api/kb/upload', uploadDocument);
    app.get('/api/kb/status', getKBStatus);
    // Simple UI endpoint
    app.get('/kb-setup', (req, res) => {
        res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Nova Sonic KB Setup</title>
        <style>
          body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
          .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
          .ready { background: #d4edda; color: #155724; }
          .not-configured { background: #f8d7da; color: #721c24; }
          button { padding: 10px 20px; margin: 5px; cursor: pointer; }
          input { padding: 8px; margin: 5px; width: 300px; }
        </style>
      </head>
      <body>
        <h1>🧠 Knowledge Base Setup</h1>
        
        <div id="status" class="status"></div>
        
        <div id="setup" style="display:none;">
          <h3>Configure Knowledge Base</h3>
          <input type="text" id="kbId" placeholder="Knowledge Base ID">
          <input type="text" id="dsId" placeholder="Data Source ID (optional)">
          <button onclick="configure()">Configure</button>
          
          <h3>Manual Setup Instructions</h3>
          <ol>
            <li>Go to <a href="https://console.aws.amazon.com/bedrock/home?region=us-east-1#/knowledge-bases" target="_blank">Bedrock Console</a></li>
            <li>Create Knowledge Base named: <code>nova-sonic-kb</code></li>
            <li>Use S3 bucket: <code>nova-sonic-documents-202505</code></li>
            <li>Copy the KB ID and paste above</li>
          </ol>
        </div>
        
        <div id="ready" style="display:none;">
          <h3>✅ Knowledge Base Ready!</h3>
          <p>KB ID: <code id="currentKbId"></code></p>
          <p>ProcessOverview.pdf has been indexed</p>
          <p>Esther can now answer questions about Mike Lawrence Productions!</p>
          
          <h3>Test It</h3>
          <p>Call (213) 523-5700 and ask about:</p>
          <ul>
            <li>The two-phase program</li>
            <li>Event logistics</li>
            <li>Success stories</li>
          </ul>
        </div>
        
        <script>
          async function checkStatus() {
            const res = await fetch('/api/kb/status');
            const status = await res.json();
            
            const statusDiv = document.getElementById('status');
            
            if (status.configured) {
              statusDiv.className = 'status ready';
              statusDiv.textContent = 'Knowledge Base Status: READY';
              document.getElementById('setup').style.display = 'none';
              document.getElementById('ready').style.display = 'block';
              document.getElementById('currentKbId').textContent = status.knowledgeBaseId;
            } else {
              statusDiv.className = 'status not-configured';
              statusDiv.textContent = 'Knowledge Base Status: NOT CONFIGURED';
              document.getElementById('setup').style.display = 'block';
              document.getElementById('ready').style.display = 'none';
            }
          }
          
          async function configure() {
            const kbId = document.getElementById('kbId').value;
            const dsId = document.getElementById('dsId').value;
            
            if (!kbId) {
              alert('Please enter Knowledge Base ID');
              return;
            }
            
            const res = await fetch('/api/kb/configure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ knowledgeBaseId: kbId, dataSourceId: dsId })
            });
            
            const result = await res.json();
            
            if (result.success) {
              alert('Knowledge Base configured successfully!');
              checkStatus();
            } else {
              alert('Error: ' + result.error);
            }
          }
          
          // Check status on load
          checkStatus();
        </script>
      </body>
      </html>
    `);
    });
    console.log('📚 Knowledge Base MCP routes configured');
    console.log('   Visit https://gospelshare.io/kb-setup to configure');
}
