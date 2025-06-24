export interface CallRequest {
  phoneNumber: string;
  prompt?: string;
  leadId?: number;
  campaignId?: string;
  novaSonicParams?: {
    maxTokens?: number;
    topP?: number;
    temperature?: number;
  };
}

export interface InboundRequest {
  callId: string;
  from: string;
  to: string;
}

export interface CallResponse {
  phoneNumber: string;
  callStatus: string;
  callId: string;
  duration?: number;
  transcript: string;
  error?: string;
}

export interface InboundResponse {
  ncco: any[];
}

export interface ActiveCall {
  bedrock: any;
  ws: any;
  prompt: string;
  params: any;
  phoneNumber: string;
  startTime: Date;
  transcript: string[];
  leadId?: number;
  campaignId?: string;
}