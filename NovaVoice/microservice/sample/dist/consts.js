"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultAudioOutputConfiguration = exports.DefaultSystemPrompt = exports.DefaultTextConfiguration = exports.DefaultAudioInputConfiguration = exports.DefaultInferenceConfiguration = void 0;
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
exports.DefaultSystemPrompt = "You are a friend. The user and you will engage in a spoken " +
    "dialog exchanging the transcripts of a natural real-time conversation. Keep your responses short, " +
    "generally two or three sentences for chatty scenarios.";
exports.DefaultAudioOutputConfiguration = __assign(__assign({}, exports.DefaultAudioInputConfiguration), { sampleRateHertz: 16000, voiceId: "tiffany" });
