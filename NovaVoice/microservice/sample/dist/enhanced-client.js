"use strict";
/**
 * Enhanced Nova Sonic Client with Barge-In Support
 * Extends the base client to add interruption handling
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedNovaSonicClient = exports.EnhancedStreamSession = void 0;
var client_1 = require("./client");
var barge_in_handler_1 = require("./barge-in-handler");
var node_buffer_1 = require("node:buffer");
var EnhancedStreamSession = /** @class */ (function (_super) {
    __extends(EnhancedStreamSession, _super);
    function EnhancedStreamSession(sessionId, client, bargeInManager) {
        var _this = _super.call(this, sessionId, client) || this;
        _this.bargeInManager = bargeInManager;
        _this.isInterrupted = false;
        return _this;
    }
    /**
     * Override streamAudio to add interruption detection
     */
    EnhancedStreamSession.prototype.streamAudio = function (audioData) {
        return __awaiter(this, void 0, void 0, function () {
            var handler;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        handler = this.bargeInManager.getHandler(this.getSessionId());
                        if (!handler.checkForInterruption(audioData)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.handleInterruption()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: 
                    // Continue with normal audio streaming
                    return [2 /*return*/, _super.prototype.streamAudio.call(this, audioData)];
                }
            });
        });
    };
    /**
     * Handle interruption event
     */
    EnhancedStreamSession.prototype.handleInterruption = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isInterrupted)
                            return [2 /*return*/];
                        this.isInterrupted = true;
                        console.log("\uD83D\uDEAB Handling interruption for session ".concat(this.getSessionId()));
                        // Notify callback if set
                        if (this.onInterruptCallback) {
                            this.onInterruptCallback();
                        }
                        // Send interruption event to Nova Sonic
                        return [4 /*yield*/, this.sendInterruptionSignal()];
                    case 1:
                        // Send interruption event to Nova Sonic
                        _a.sent();
                        // Clear AI output
                        this.client.clearAudioOutput(this.getSessionId());
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Send interruption signal to Nova Sonic
     */
    EnhancedStreamSession.prototype.sendInterruptionSignal = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        // Send a special event to interrupt AI generation
                        return [4 /*yield*/, this.client.sendEvent(this.getSessionId(), {
                                event: {
                                    type: 'systemPrompt',
                                    content: 'The user has interrupted. Please stop speaking immediately and listen.'
                                }
                            })];
                    case 1:
                        // Send a special event to interrupt AI generation
                        _a.sent();
                        // End current content
                        return [4 /*yield*/, this.endAudioContent()];
                    case 2:
                        // End current content
                        _a.sent();
                        // Restart audio for new user input
                        return [4 /*yield*/, this.setupStartAudio()];
                    case 3:
                        // Restart audio for new user input
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        console.error('Error sending interruption signal:', error_1);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Set callback for interruption events
     */
    EnhancedStreamSession.prototype.onInterruption = function (callback) {
        this.onInterruptCallback = callback;
    };
    /**
     * Reset interruption state
     */
    EnhancedStreamSession.prototype.resetInterruption = function () {
        this.isInterrupted = false;
        var handler = this.bargeInManager.getHandler(this.getSessionId());
        handler.reset();
    };
    return EnhancedStreamSession;
}(client_1.StreamSession));
exports.EnhancedStreamSession = EnhancedStreamSession;
var EnhancedNovaSonicClient = /** @class */ (function (_super) {
    __extends(EnhancedNovaSonicClient, _super);
    function EnhancedNovaSonicClient() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.bargeInManager = new barge_in_handler_1.BargeInSessionManager();
        _this.audioOutputBuffers = new Map();
        return _this;
    }
    /**
     * Override createStreamSession to return enhanced session
     */
    EnhancedNovaSonicClient.prototype.createStreamSession = function (sessionId) {
        var _this = this;
        var baseSession = _super.prototype.createStreamSession.call(this, sessionId);
        var enhancedSession = new EnhancedStreamSession(baseSession.getSessionId(), this, this.bargeInManager);
        // Set up event handlers for AI speaking state
        enhancedSession.onEvent('contentStart', function () {
            var handler = _this.bargeInManager.getHandler(enhancedSession.getSessionId());
            handler.setAISpeaking(true);
            console.log("\uD83C\uDFA4 AI started speaking for session ".concat(enhancedSession.getSessionId()));
        });
        enhancedSession.onEvent('contentEnd', function () {
            var handler = _this.bargeInManager.getHandler(enhancedSession.getSessionId());
            handler.setAISpeaking(false);
            console.log("\uD83D\uDD07 AI stopped speaking for session ".concat(enhancedSession.getSessionId()));
        });
        // Handle audio output to track what's being sent
        enhancedSession.onEvent('audioOutput', function (data) {
            _this.bufferAudioOutput(enhancedSession.getSessionId(), data.content);
        });
        // Set up interruption callback
        enhancedSession.onInterruption(function () {
            console.log("\uD83D\uDEAB Session ".concat(enhancedSession.getSessionId(), " interrupted by user"));
            _this.clearAudioOutput(enhancedSession.getSessionId());
        });
        return enhancedSession;
    };
    /**
     * Buffer audio output for potential clearing
     */
    EnhancedNovaSonicClient.prototype.bufferAudioOutput = function (sessionId, audioContent) {
        if (!this.audioOutputBuffers.has(sessionId)) {
            this.audioOutputBuffers.set(sessionId, []);
        }
        var buffer = node_buffer_1.Buffer.from(audioContent, 'base64');
        var buffers = this.audioOutputBuffers.get(sessionId);
        buffers.push(buffer);
        // Keep only last 10 chunks
        if (buffers.length > 10) {
            buffers.shift();
        }
    };
    /**
     * Clear audio output buffer when interrupted
     */
    EnhancedNovaSonicClient.prototype.clearAudioOutput = function (sessionId) {
        this.audioOutputBuffers.delete(sessionId);
        // Dispatch clear event to frontend
        this.dispatchEventToClients(sessionId, 'clearAudio', {
            reason: 'interruption'
        });
    };
    /**
     * Send custom event to session
     */
    EnhancedNovaSonicClient.prototype.sendEvent = function (sessionId, event) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                session = this.activeSessions.get(sessionId);
                if (!session)
                    return [2 /*return*/];
                session.queue.push(event);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Clean up session
     */
    EnhancedNovaSonicClient.prototype.closeSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.bargeInManager.removeHandler(sessionId);
                this.audioOutputBuffers.delete(sessionId);
                return [2 /*return*/, _super.prototype.closeSession.call(this, sessionId)];
            });
        });
    };
    /**
     * Dispatch event helper
     */
    EnhancedNovaSonicClient.prototype.dispatchEventToClients = function (sessionId, eventType, data) {
        var _a, _b;
        // Use internal method to dispatch events
        (_b = (_a = this).dispatchEventForSession) === null || _b === void 0 ? void 0 : _b.call(_a, sessionId, eventType, data);
    };
    return EnhancedNovaSonicClient;
}(client_1.NovaSonicBidirectionalStreamClient));
exports.EnhancedNovaSonicClient = EnhancedNovaSonicClient;
