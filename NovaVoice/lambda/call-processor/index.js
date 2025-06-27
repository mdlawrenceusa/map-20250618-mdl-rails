const AWS = require('aws-sdk');

// Initialize AWS clients
const eventBridge = new AWS.EventBridge();

// Environment variables
const MICROSERVICE_URL = process.env.MICROSERVICE_URL || 'https://gospelshare.io';
const RAILS_API_URL = process.env.RAILS_API_URL || 'http://localhost:8080';

/**
 * Lambda function to process EventBridge call events
 */
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        for (const record of event.Records || [event]) {
            await processCallEvent(record);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Events processed successfully',
                processedCount: event.Records?.length || 1
            })
        };
    } catch (error) {
        console.error('Error processing events:', error);
        throw error;
    }
};

async function processCallEvent(eventRecord) {
    const detail = eventRecord.detail || eventRecord;
    const detailType = eventRecord['detail-type'] || eventRecord.detailType;
    
    console.log(`Processing event type: ${detailType}`);
    
    switch (detailType) {
        case 'SingleCallRequested':
            return await processSingleCall(detail);
            
        case 'CampaignCallScheduled':
            return await processCampaignCall(detail);
            
        case 'CampaignStatusChanged':
            return await processCampaignStatus(detail);
            
        default:
            console.log(`Unknown event type: ${detailType}`);
    }
}

async function processSingleCall(detail) {
    const { phoneNumber, leadId, campaignId } = detail;
    
    console.log(`Processing single call to ${phoneNumber}`);
    
    try {
        // Make the call via microservice
        const callResult = await makeCall(phoneNumber, leadId, campaignId);
        
        console.log(`Call initiated successfully:`, callResult);
        
        // Optionally publish success event
        await publishCallResult('initiated', {
            phoneNumber,
            leadId,
            campaignId,
            callId: callResult.callId
        });
        
        return callResult;
    } catch (error) {
        console.error(`Failed to make call to ${phoneNumber}:`, error);
        
        // Publish failure event
        await publishCallResult('failed', {
            phoneNumber,
            leadId,
            campaignId,
            error: error.message
        });
        
        throw error;
    }
}

async function processCampaignCall(detail) {
    const { 
        campaignCallId, 
        phoneNumber, 
        scheduledFor, 
        leadId, 
        campaignId 
    } = detail;
    
    console.log(`Processing campaign call ${campaignCallId} to ${phoneNumber}`);
    
    // Check if we should delay this call
    const scheduledTime = new Date(scheduledFor);
    const now = new Date();
    
    if (scheduledTime > now) {
        const delayMs = scheduledTime.getTime() - now.getTime();
        console.log(`Call scheduled for future, delaying ${delayMs}ms`);
        
        // Re-schedule the event for later
        await scheduleDelayedCall(detail, delayMs);
        return { status: 'delayed', delayMs };
    }
    
    try {
        // Make the call
        const callResult = await makeCall(phoneNumber, leadId, campaignId);
        
        console.log(`Campaign call initiated:`, callResult);
        
        // Update Rails campaign_call record
        await updateCampaignCall(campaignCallId, 'initiated', callResult.callId);
        
        // Publish success event
        await publishCallResult('initiated', {
            campaignCallId,
            phoneNumber,
            leadId,
            campaignId,
            callId: callResult.callId
        });
        
        return callResult;
    } catch (error) {
        console.error(`Failed to make campaign call:`, error);
        
        // Update Rails campaign_call record with failure
        await updateCampaignCall(campaignCallId, 'failed', null, error.message);
        
        // Publish failure event
        await publishCallResult('failed', {
            campaignCallId,
            phoneNumber,
            leadId,
            campaignId,
            error: error.message
        });
        
        throw error;
    }
}

async function processCampaignStatus(detail) {
    const { campaignId, status, metadata } = detail;
    
    console.log(`Campaign ${campaignId} status changed to: ${status}`);
    
    // Handle different campaign status changes
    switch (status) {
        case 'launched':
            console.log(`Campaign launched with ${metadata.totalCalls} calls`);
            break;
        case 'paused':
            console.log(`Campaign paused`);
            break;
        case 'resumed':
            console.log(`Campaign resumed`);
            break;
        case 'completed':
            console.log(`Campaign completed`);
            break;
    }
    
    return { status: 'processed' };
}

async function makeCall(phoneNumber, leadId = null, campaignId = null) {
    const axios = require('axios');
    
    const callData = {
        to: phoneNumber
    };
    
    // Add metadata if available
    if (leadId || campaignId) {
        callData.metadata = { leadId, campaignId };
    }
    
    console.log(`Making call to ${MICROSERVICE_URL}/call/ai with:`, callData);
    
    const response = await axios.post(`${MICROSERVICE_URL}/call/ai`, callData, {
        headers: {
            'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
    });
    
    if (!response.data.success) {
        throw new Error(`Call failed: ${response.data.error || 'Unknown error'}`);
    }
    
    return response.data;
}

async function updateCampaignCall(campaignCallId, status, callUuid = null, errorMessage = null) {
    // This would call the Rails API to update the campaign_call record
    // For now, we'll just log it
    console.log(`Updating campaign call ${campaignCallId}: status=${status}, callUuid=${callUuid}, error=${errorMessage}`);
    
    // TODO: Implement Rails API call
    // const axios = require('axios');
    // await axios.patch(`${RAILS_API_URL}/api/v1/campaign_calls/${campaignCallId}`, {
    //     status,
    //     call_uuid: callUuid,
    //     error_message: errorMessage
    // });
}

async function scheduleDelayedCall(detail, delayMs) {
    // For delays longer than 15 minutes, use EventBridge scheduled rules
    // For shorter delays, we could use SQS with delay or Step Functions
    
    if (delayMs > 15 * 60 * 1000) { // > 15 minutes
        console.log(`Delay too long (${delayMs}ms), using EventBridge scheduled rule`);
        // TODO: Create EventBridge scheduled rule
    } else {
        console.log(`Re-queueing event with delay: ${delayMs}ms`);
        // TODO: Use SQS with delay or Step Functions
    }
}

async function publishCallResult(resultType, metadata) {
    const event = {
        Source: 'nova-voice.lambda',
        DetailType: 'CallResultProcessed',
        Detail: JSON.stringify({
            resultType,
            timestamp: new Date().toISOString(),
            ...metadata
        })
    };
    
    try {
        await eventBridge.putEvents({
            Entries: [event]
        }).promise();
        
        console.log(`Published call result event: ${resultType}`);
    } catch (error) {
        console.error('Failed to publish call result event:', error);
        // Don't throw - this is non-critical
    }
}