export { Subject } from 'rxjs';
export { BedrockRuntimeClientConfig } from '@aws-sdk/client-bedrock-runtime';
export { NodeHttp2HandlerOptions } from '@smithy/node-http-handler';
export { Provider } from '@aws-sdk/types';

export interface InferenceConfig {
  readonly maxTokens: number;
  readonly topP: number;
  readonly temperature: number;
}

export type ContentType = "AUDIO" | "TEXT" | "TOOL";
export type AudioType = "SPEECH";
export type AudioMediaType = "audio/lpcm";
export type TextMediaType = "text/plain" | "application/json";

export interface AudioConfiguration {
  readonly audioType: AudioType;
  readonly mediaType: AudioMediaType;
  readonly sampleRateHertz: number;
  readonly sampleSizeBits: number;
  readonly channelCount: number;
  readonly encoding: string;
  readonly voiceId?: string;
}

export interface TextConfiguration {
  readonly mediaType: TextMediaType;
}

export interface ToolConfiguration {
  readonly toolUseId: string;
  readonly type: "TEXT";
  readonly textInputConfiguration: {
    readonly mediaType: "text/plain";
  };
}

interface WebhookResponse {
  action: string;
  text?: string;
  from?: string;
  endpoint?: Array<{
    type: string;
    uri: string;
    "content-type": string;
  }>;
}

export interface SessionEventData {
  [key: string]: any;
}

export interface Session {
  getSessionId: () => string;
  onEvent: (event: string, callback: (data: SessionEventData) => void) => void;
  setupPromptStart: () => Promise<void>;
  setupSystemPrompt: (
    textConfig?: { mediaType: string },
    systemPromptContent?: string
  ) => Promise<void>;
  setupStartAudio: () => Promise<void>;
  streamAudio: (buffer: Buffer) => Promise<void>;
  endAudioContent: () => Promise<void>;
  endPrompt: () => Promise<void>;
  close: () => Promise<void>;
}

export interface ActiveSession {
  sessionId: string;
  session: Session;
}

export interface Result {
  content: string;
  location: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface OutputData {
  query: string;
  results: Result[];
  result_count: number;
}

export interface SessionData {
  queue: Array<any>;
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  responseSubject: Subject<any>;
  toolUseContent: any;
  toolUseId: string;
  toolName: string;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
}

export interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig?:
    | NodeHttp2HandlerOptions
    | Provider<NodeHttp2HandlerOptions | void>;
  clientConfig: Partial<BedrockRuntimeClientConfig>;
  inferenceConfig?: InferenceConfig;
}

