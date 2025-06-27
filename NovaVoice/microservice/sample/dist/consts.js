"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultAudioOutputConfiguration = exports.DefaultTextConfiguration = exports.DefaultAudioInputConfiguration = exports.DefaultInferenceConfiguration = void 0;
exports.DefaultInferenceConfiguration = {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7,
};
exports.DefaultAudioInputConfiguration = {
    audioType: "SPEECH",
    encoding: "base64",
    mediaType: "audio/lpcm",
    sampleRateHertz: 16000,
    sampleSizeBits: 16,
    channelCount: 1,
};
exports.DefaultTextConfiguration = {
    mediaType: "text/plain",
};
// DefaultSystemPrompt removed - now loaded dynamically from S3 via PromptService
exports.DefaultAudioOutputConfiguration = {
    ...exports.DefaultAudioInputConfiguration,
    sampleRateHertz: 16000, // TODO: You may need to adjust this for your voice to sound normal
    voiceId: "tiffany",
};
