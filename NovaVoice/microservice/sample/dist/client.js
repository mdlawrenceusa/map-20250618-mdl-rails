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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovaSonicBidirectionalStreamClient = exports.StreamSession = void 0;
var client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
var node_http_handler_1 = require("@smithy/node-http-handler");
var node_crypto_1 = require("node:crypto");
var rxjs_1 = require("rxjs");
var operators_1 = require("rxjs/operators");
var rxjs_2 = require("rxjs");
var consts_1 = require("./consts");
var ToolRegistry_1 = require("./tools/ToolRegistry");
var StreamSession = /** @class */ (function () {
    function StreamSession(sessionId, client) {
        this.sessionId = sessionId;
        this.client = client;
        this.audioBufferQueue = [];
        this.maxQueueSize = 200; // Maximum number of audio chunks to queue
        this.isProcessingAudio = false;
        this.isActive = true;
    }
    StreamSession.prototype.onEvent = function (eventType, handler) {
        this.client.registerEventHandler(this.sessionId, eventType, handler);
        return this; // For chaining
    };
    StreamSession.prototype.setupPromptStart = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.client.setupPromptStartEvent(this.sessionId);
                return [2 /*return*/];
            });
        });
    };
    StreamSession.prototype.setupSystemPrompt = function () {
        return __awaiter(this, arguments, void 0, function (textConfig, systemPromptContent) {
            if (textConfig === void 0) { textConfig = consts_1.DefaultTextConfiguration; }
            if (systemPromptContent === void 0) { systemPromptContent = consts_1.DefaultSystemPrompt; }
            return __generator(this, function (_a) {
                this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
                return [2 /*return*/];
            });
        });
    };
    StreamSession.prototype.setupStartAudio = function () {
        return __awaiter(this, arguments, void 0, function (audioConfig) {
            if (audioConfig === void 0) { audioConfig = consts_1.DefaultAudioInputConfiguration; }
            return __generator(this, function (_a) {
                this.client.setupStartAudioEvent(this.sessionId, audioConfig);
                return [2 /*return*/];
            });
        });
    };
    StreamSession.prototype.streamAudio = function (audioData) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.audioBufferQueue.length >= this.maxQueueSize) {
                    this.audioBufferQueue.shift();
                    console.log("Audio queue full, dropping oldest chunk");
                }
                this.audioBufferQueue.push(audioData);
                this.processAudioQueue();
                return [2 /*return*/];
            });
        });
    };
    StreamSession.prototype.processAudioQueue = function () {
        return __awaiter(this, void 0, void 0, function () {
            var processedChunks, maxChunksPerBatch, audioChunk;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isProcessingAudio ||
                            this.audioBufferQueue.length === 0 ||
                            !this.isActive)
                            return [2 /*return*/];
                        this.isProcessingAudio = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 6, 7]);
                        processedChunks = 0;
                        maxChunksPerBatch = 5;
                        _a.label = 2;
                    case 2:
                        if (!(this.audioBufferQueue.length > 0 &&
                            processedChunks < maxChunksPerBatch &&
                            this.isActive)) return [3 /*break*/, 5];
                        audioChunk = this.audioBufferQueue.shift();
                        if (!audioChunk) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.client.streamAudioChunk(this.sessionId, audioChunk)];
                    case 3:
                        _a.sent();
                        processedChunks++;
                        _a.label = 4;
                    case 4: return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        this.isProcessingAudio = false;
                        if (this.audioBufferQueue.length > 0 && this.isActive) {
                            setTimeout(function () { return _this.processAudioQueue(); }, 0);
                        }
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    StreamSession.prototype.getSessionId = function () {
        return this.sessionId;
    };
    StreamSession.prototype.endAudioContent = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isActive)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.client.sendContentEnd(this.sessionId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    StreamSession.prototype.endPrompt = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isActive)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.client.sendPromptEnd(this.sessionId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    StreamSession.prototype.close = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isActive)
                            return [2 /*return*/];
                        this.isActive = false;
                        this.audioBufferQueue = [];
                        return [4 /*yield*/, this.client.sendSessionEnd(this.sessionId)];
                    case 1:
                        _a.sent();
                        console.log("Session ".concat(this.sessionId, " close completed"));
                        return [2 /*return*/];
                }
            });
        });
    };
    return StreamSession;
}());
exports.StreamSession = StreamSession;
var NovaSonicBidirectionalStreamClient = /** @class */ (function () {
    function NovaSonicBidirectionalStreamClient(config) {
        var _a;
        this.activeSessions = new Map();
        this.sessionLastActivity = new Map();
        this.sessionCleanupInProgress = new Set();
        this.toolRegistry = new ToolRegistry_1.ToolRegistry();
        var nodeHttp2Handler = new node_http_handler_1.NodeHttp2Handler(__assign({ requestTimeout: 300000, sessionTimeout: 300000, disableConcurrentStreams: false, maxConcurrentStreams: 20 }, config.requestHandlerConfig));
        if (!config.clientConfig.credentials) {
            throw new Error("No credentials provided");
        }
        this.bedrockRuntimeClient = new client_bedrock_runtime_1.BedrockRuntimeClient(__assign(__assign({}, config.clientConfig), { credentials: config.clientConfig.credentials, region: config.clientConfig.region || "us-east-1", requestHandler: nodeHttp2Handler }));
        this.inferenceConfig = (_a = config.inferenceConfig) !== null && _a !== void 0 ? _a : {
            maxTokens: 1024,
            topP: 0.9,
            temperature: 0.7,
        };
    }
    NovaSonicBidirectionalStreamClient.prototype.isSessionActive = function (sessionId) {
        var session = this.activeSessions.get(sessionId);
        return !!session && session.isActive;
    };
    NovaSonicBidirectionalStreamClient.prototype.getActiveSessions = function () {
        return Array.from(this.activeSessions.keys());
    };
    NovaSonicBidirectionalStreamClient.prototype.getLastActivityTime = function (sessionId) {
        return this.sessionLastActivity.get(sessionId) || 0;
    };
    NovaSonicBidirectionalStreamClient.prototype.updateSessionActivity = function (sessionId) {
        this.sessionLastActivity.set(sessionId, Date.now());
    };
    NovaSonicBidirectionalStreamClient.prototype.isCleanupInProgress = function (sessionId) {
        return this.sessionCleanupInProgress.has(sessionId);
    };
    NovaSonicBidirectionalStreamClient.prototype.createStreamSession = function (sessionId, config) {
        var _a;
        if (sessionId === void 0) { sessionId = (0, node_crypto_1.randomUUID)(); }
        if (this.activeSessions.has(sessionId)) {
            throw new Error("Stream session with ID ".concat(sessionId, " already exists"));
        }
        var session = {
            queue: [],
            queueSignal: new rxjs_1.Subject(),
            closeSignal: new rxjs_1.Subject(),
            responseSubject: new rxjs_1.Subject(),
            toolUseContent: null,
            toolUseId: "",
            toolName: "",
            responseHandlers: new Map(),
            promptName: (0, node_crypto_1.randomUUID)(),
            inferenceConfig: (_a = config === null || config === void 0 ? void 0 : config.inferenceConfig) !== null && _a !== void 0 ? _a : this.inferenceConfig,
            isActive: true,
            isPromptStartSent: false,
            isAudioContentStartSent: false,
            audioContentId: (0, node_crypto_1.randomUUID)(),
        };
        this.activeSessions.set(sessionId, session);
        return new StreamSession(sessionId, this);
    };
    NovaSonicBidirectionalStreamClient.prototype.initiateSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var session, asyncIterable, response, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        session = this.activeSessions.get(sessionId);
                        if (!session) {
                            throw new Error("Stream session ".concat(sessionId, " not found"));
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        this.setupSessionStartEvent(sessionId);
                        asyncIterable = this.createSessionAsyncIterable(sessionId);
                        console.log("Starting bidirectional stream for session ".concat(sessionId, "..."));
                        return [4 /*yield*/, this.bedrockRuntimeClient.send(new client_bedrock_runtime_1.InvokeModelWithBidirectionalStreamCommand({
                                modelId: "amazon.nova-sonic-v1:0",
                                body: asyncIterable,
                            }))];
                    case 2:
                        response = _a.sent();
                        console.log("Stream established for session ".concat(sessionId, ", processing responses..."));
                        return [4 /*yield*/, this.processResponseStream(sessionId, response)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        console.error("Error in session ".concat(sessionId, ": "), error_1);
                        this.dispatchEventForSession(sessionId, "error", {
                            source: "bidirectionalStream",
                            error: error_1,
                        });
                        if (session.isActive)
                            this.closeSession(sessionId);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.dispatchEventForSession = function (sessionId, eventType, data) {
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        var handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            }
            catch (e) {
                console.error("Error in ".concat(eventType, " handler for session ").concat(sessionId, ": "), e);
            }
        }
        var anyHandler = session.responseHandlers.get("any");
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data: data });
            }
            catch (e) {
                console.error("Error in 'any' handler for session ".concat(sessionId, ": "), e);
            }
        }
    };
    NovaSonicBidirectionalStreamClient.prototype.createSessionAsyncIterable = function (sessionId) {
        var _a, _b;
        var _this = this;
        if (!this.isSessionActive(sessionId)) {
            console.log("Cannot create async iterable: Session ".concat(sessionId, " not active"));
            return _a = {},
                _a[Symbol.asyncIterator] = function () { return ({
                    next: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, ({ value: undefined, done: true })];
                    }); }); },
                }); },
                _a;
        }
        var session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error("Cannot create async iterable: Session ".concat(sessionId, " not found"));
        }
        var eventCount = 0;
        return _b = {},
            _b[Symbol.asyncIterator] = function () {
                console.log("AsyncIterable iterator requested for session ".concat(sessionId));
                return {
                    next: function () { return __awaiter(_this, void 0, void 0, function () {
                        var error_2, nextEvent, error_3;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 5, , 6]);
                                    if (!session.isActive || !this.activeSessions.has(sessionId)) {
                                        console.log("Iterator closing for session ".concat(sessionId, ", done = true"));
                                        return [2 /*return*/, { value: undefined, done: true }];
                                    }
                                    if (!(session.queue.length === 0)) return [3 /*break*/, 4];
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, Promise.race([
                                            (0, rxjs_2.firstValueFrom)(session.queueSignal.pipe((0, operators_1.take)(1))),
                                            (0, rxjs_2.firstValueFrom)(session.closeSignal.pipe((0, operators_1.take)(1))).then(function () {
                                                throw new Error("Stream closed");
                                            }),
                                        ])];
                                case 2:
                                    _a.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    error_2 = _a.sent();
                                    if (error_2 instanceof Error) {
                                        if (error_2.message === "Stream closed" ||
                                            !session.isActive) {
                                            if (this.activeSessions.has(sessionId)) {
                                                console.log("Session ${ sessionId } closed during wait");
                                            }
                                            return [2 /*return*/, { value: undefined, done: true }];
                                        }
                                    }
                                    else {
                                        console.error("Error on event close", error_2);
                                    }
                                    return [3 /*break*/, 4];
                                case 4:
                                    if (session.queue.length === 0 || !session.isActive) {
                                        console.log("Queue empty or session inactive: ".concat(sessionId, " "));
                                        return [2 /*return*/, { value: undefined, done: true }];
                                    }
                                    nextEvent = session.queue.shift();
                                    eventCount++;
                                    return [2 /*return*/, {
                                            value: {
                                                chunk: {
                                                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent)),
                                                },
                                            },
                                            done: false,
                                        }];
                                case 5:
                                    error_3 = _a.sent();
                                    console.error("Error in session ".concat(sessionId, " iterator: "), error_3);
                                    session.isActive = false;
                                    return [2 /*return*/, { value: undefined, done: true }];
                                case 6: return [2 /*return*/];
                            }
                        });
                    }); },
                    return: function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            console.log("Iterator return () called for session ".concat(sessionId));
                            session.isActive = false;
                            return [2 /*return*/, { value: undefined, done: true }];
                        });
                    }); },
                    throw: function (error) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            console.log("Iterator throw () called for session ".concat(sessionId, " with error: "), error);
                            session.isActive = false;
                            throw error;
                        });
                    }); },
                };
            },
            _b;
    };
    NovaSonicBidirectionalStreamClient.prototype.processToolUse = function (toolName, toolUseContent) {
        return __awaiter(this, void 0, void 0, function () {
            var tool, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tool = toolName.toLowerCase();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.toolRegistry.execute(tool, toolUseContent)];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_4 = _a.sent();
                        console.error("Error executing tool ".concat(tool, ":"), error_4);
                        throw error_4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.processResponseStream = function (sessionId, response) {
        return __awaiter(this, void 0, void 0, function () {
            var session, _a, _b, _c, event_1, textResponse, jsonResponse, toolResult, eventKeys, e_1, e_2, e_3_1, error_5;
            var _d, e_3, _e, _f;
            var _g, _h, _j, _k, _l, _m, _o, _p, _q;
            return __generator(this, function (_r) {
                switch (_r.label) {
                    case 0:
                        session = this.activeSessions.get(sessionId);
                        if (!session)
                            return [2 /*return*/];
                        _r.label = 1;
                    case 1:
                        _r.trys.push([1, 28, , 29]);
                        _r.label = 2;
                    case 2:
                        _r.trys.push([2, 21, 22, 27]);
                        _a = true, _b = __asyncValues(response.body);
                        _r.label = 3;
                    case 3: return [4 /*yield*/, _b.next()];
                    case 4:
                        if (!(_c = _r.sent(), _d = _c.done, !_d)) return [3 /*break*/, 20];
                        _f = _c.value;
                        _a = false;
                        event_1 = _f;
                        if (!session.isActive) {
                            console.log("Session ".concat(sessionId, " is no longer active, stopping response processing"));
                            return [3 /*break*/, 20];
                        }
                        if (!((_g = event_1.chunk) === null || _g === void 0 ? void 0 : _g.bytes)) return [3 /*break*/, 18];
                        _r.label = 5;
                    case 5:
                        _r.trys.push([5, 16, , 17]);
                        this.updateSessionActivity(sessionId);
                        textResponse = new TextDecoder().decode(event_1.chunk.bytes);
                        _r.label = 6;
                    case 6:
                        _r.trys.push([6, 14, , 15]);
                        jsonResponse = JSON.parse(textResponse);
                        if (!((_h = jsonResponse.event) === null || _h === void 0 ? void 0 : _h.contentStart)) return [3 /*break*/, 7];
                        this.dispatchEvent(sessionId, "contentStart", jsonResponse.event.contentStart);
                        return [3 /*break*/, 13];
                    case 7:
                        if (!((_j = jsonResponse.event) === null || _j === void 0 ? void 0 : _j.textOutput)) return [3 /*break*/, 8];
                        this.dispatchEvent(sessionId, "textOutput", jsonResponse.event.textOutput);
                        return [3 /*break*/, 13];
                    case 8:
                        if (!((_k = jsonResponse.event) === null || _k === void 0 ? void 0 : _k.audioOutput)) return [3 /*break*/, 9];
                        this.dispatchEvent(sessionId, "audioOutput", jsonResponse.event.audioOutput);
                        return [3 /*break*/, 13];
                    case 9:
                        if (!((_l = jsonResponse.event) === null || _l === void 0 ? void 0 : _l.toolUse)) return [3 /*break*/, 10];
                        this.dispatchEvent(sessionId, "toolUse", jsonResponse.event.toolUse);
                        session.toolUseContent = jsonResponse.event.toolUse;
                        session.toolUseId = jsonResponse.event.toolUse.toolUseId;
                        session.toolName = jsonResponse.event.toolUse.toolName;
                        return [3 /*break*/, 13];
                    case 10:
                        if (!(((_m = jsonResponse.event) === null || _m === void 0 ? void 0 : _m.contentEnd) &&
                            ((_p = (_o = jsonResponse.event) === null || _o === void 0 ? void 0 : _o.contentEnd) === null || _p === void 0 ? void 0 : _p.type) === "TOOL")) return [3 /*break*/, 12];
                        console.log("Processing tool use for session ".concat(sessionId));
                        this.dispatchEvent(sessionId, "toolEnd", {
                            toolUseContent: session.toolUseContent,
                            toolUseId: session.toolUseId,
                            toolName: session.toolName,
                        });
                        console.log("Calling tool with content:", session.toolUseContent);
                        return [4 /*yield*/, this.processToolUse(session.toolName, session.toolUseContent)];
                    case 11:
                        toolResult = _r.sent();
                        this.sendToolResult(sessionId, session.toolUseId, toolResult);
                        this.dispatchEvent(sessionId, "toolResult", {
                            toolUseId: session.toolUseId,
                            result: toolResult,
                        });
                        return [3 /*break*/, 13];
                    case 12:
                        if ((_q = jsonResponse.event) === null || _q === void 0 ? void 0 : _q.contentEnd) {
                            this.dispatchEvent(sessionId, "contentEnd", jsonResponse.event.contentEnd);
                        }
                        else {
                            eventKeys = Object.keys(jsonResponse.event || {});
                            console.log("Event keys for session ".concat(sessionId, ": "), eventKeys);
                            console.log("Handling other events");
                            if (eventKeys.length > 0) {
                                this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
                            }
                            else if (Object.keys(jsonResponse).length > 0) {
                                this.dispatchEvent(sessionId, "unknown", jsonResponse);
                            }
                        }
                        _r.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        e_1 = _r.sent();
                        console.log("Raw text response for session ".concat(sessionId, "(parse error): "), textResponse);
                        return [3 /*break*/, 15];
                    case 15: return [3 /*break*/, 17];
                    case 16:
                        e_2 = _r.sent();
                        console.error("Error processing response chunk for session ".concat(sessionId, ": "), e_2);
                        return [3 /*break*/, 17];
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        if (event_1.modelStreamErrorException) {
                            console.error("Model stream error for session ".concat(sessionId, ": "), event_1.modelStreamErrorException);
                            this.dispatchEvent(sessionId, "error", {
                                type: "modelStreamErrorException",
                                details: event_1.modelStreamErrorException,
                            });
                        }
                        else if (event_1.internalServerException) {
                            console.error("Internal server error for session ".concat(sessionId, ": "), event_1.internalServerException);
                            this.dispatchEvent(sessionId, "error", {
                                type: "internalServerException",
                                details: event_1.internalServerException,
                            });
                        }
                        _r.label = 19;
                    case 19:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 20: return [3 /*break*/, 27];
                    case 21:
                        e_3_1 = _r.sent();
                        e_3 = { error: e_3_1 };
                        return [3 /*break*/, 27];
                    case 22:
                        _r.trys.push([22, , 25, 26]);
                        if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 24];
                        return [4 /*yield*/, _e.call(_b)];
                    case 23:
                        _r.sent();
                        _r.label = 24;
                    case 24: return [3 /*break*/, 26];
                    case 25:
                        if (e_3) throw e_3.error;
                        return [7 /*endfinally*/];
                    case 26: return [7 /*endfinally*/];
                    case 27:
                        console.log("Response stream processing complete for session ".concat(sessionId));
                        this.dispatchEvent(sessionId, "streamComplete", {
                            timestamp: new Date().toISOString(),
                        });
                        return [3 /*break*/, 29];
                    case 28:
                        error_5 = _r.sent();
                        console.error("Error processing response stream for session ".concat(sessionId, ": "), error_5);
                        this.dispatchEvent(sessionId, "error", {
                            source: "responseStream",
                            message: "Error processing response stream",
                            details: error_5 instanceof Error ? error_5.message : String(error_5),
                        });
                        return [3 /*break*/, 29];
                    case 29: return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.addEventToSessionQueue = function (sessionId, event) {
        var session = this.activeSessions.get(sessionId);
        if (!session || !session.isActive)
            return;
        this.updateSessionActivity(sessionId);
        session.queue.push(event);
        session.queueSignal.next();
    };
    NovaSonicBidirectionalStreamClient.prototype.setupSessionStartEvent = function (sessionId) {
        console.log("Setting up initial events for session ".concat(sessionId, "..."));
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        this.addEventToSessionQueue(sessionId, {
            event: {
                sessionStart: {
                    inferenceConfiguration: session.inferenceConfig,
                },
            },
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.setupPromptStartEvent = function (sessionId) {
        console.log("Setting up prompt start event for session ".concat(sessionId, "..."));
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        this.addEventToSessionQueue(sessionId, {
            event: {
                promptStart: {
                    promptName: session.promptName,
                    textOutputConfiguration: {
                        mediaType: "text/plain",
                    },
                    audioOutputConfiguration: consts_1.DefaultAudioOutputConfiguration,
                    toolUseOutputConfiguration: {
                        mediaType: "application/json",
                    },
                    toolConfiguration: {
                        tools: this.toolRegistry.getToolSpecs()
                    },
                },
            },
        });
        session.isPromptStartSent = true;
    };
    NovaSonicBidirectionalStreamClient.prototype.setupSystemPromptEvent = function (sessionId, textConfig, systemPromptContent) {
        if (textConfig === void 0) { textConfig = consts_1.DefaultTextConfiguration; }
        if (systemPromptContent === void 0) { systemPromptContent = consts_1.DefaultSystemPrompt; }
        console.log("Setting up systemPrompt events for session ".concat(sessionId, "..."));
        console.log("[PROMPT DEBUG] System prompt content length: ".concat(systemPromptContent.length, " characters"));
        console.log("[PROMPT DEBUG] System prompt preview: ".concat(systemPromptContent.substring(0, 200), "..."));
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        var textPromptID = (0, node_crypto_1.randomUUID)();
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                    type: "TEXT",
                    interactive: true,
                    role: "SYSTEM",
                    textInputConfiguration: textConfig,
                },
            },
        });
        console.log("[PROMPT DEBUG] Adding textInput event with system prompt to queue");
        this.addEventToSessionQueue(sessionId, {
            event: {
                textInput: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                    content: systemPromptContent,
                },
            },
        });
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentEnd: {
                    promptName: session.promptName,
                    contentName: textPromptID,
                },
            },
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.setupStartAudioEvent = function (sessionId, audioConfig) {
        if (audioConfig === void 0) { audioConfig = consts_1.DefaultAudioInputConfiguration; }
        console.log("Setting up startAudioContent event for session ".concat(sessionId, "..."));
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        console.log("Using audio content ID: ".concat(session.audioContentId));
        this.addEventToSessionQueue(sessionId, {
            event: {
                contentStart: {
                    promptName: session.promptName,
                    contentName: session.audioContentId,
                    type: "AUDIO",
                    interactive: true,
                    role: "USER",
                    audioInputConfiguration: audioConfig,
                },
            },
        });
        session.isAudioContentStartSent = true;
        console.log("Initial events setup complete for session ".concat(sessionId));
    };
    NovaSonicBidirectionalStreamClient.prototype.streamAudioChunk = function (sessionId, audioData) {
        return __awaiter(this, void 0, void 0, function () {
            var session, base64Data;
            return __generator(this, function (_a) {
                session = this.activeSessions.get(sessionId);
                if (!session || !session.isActive || !session.audioContentId) {
                    throw new Error("Invalid session ".concat(sessionId, " for audio streaming"));
                }
                base64Data = audioData.toString("base64");
                this.addEventToSessionQueue(sessionId, {
                    event: {
                        audioInput: {
                            promptName: session.promptName,
                            contentName: session.audioContentId,
                            content: base64Data,
                        },
                    },
                });
                return [2 /*return*/];
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.sendToolResult = function (sessionId, toolUseId, result) {
        return __awaiter(this, void 0, void 0, function () {
            var session, contentId, resultContent;
            return __generator(this, function (_a) {
                session = this.activeSessions.get(sessionId);
                console.log("inside tool result");
                if (!session || !session.isActive)
                    return [2 /*return*/];
                console.log("Sending tool result for session ".concat(sessionId, ", tool use ID: ").concat(toolUseId));
                contentId = (0, node_crypto_1.randomUUID)();
                this.addEventToSessionQueue(sessionId, {
                    event: {
                        contentStart: {
                            promptName: session.promptName,
                            contentName: contentId,
                            interactive: false,
                            type: "TOOL",
                            role: "TOOL",
                            toolResultInputConfiguration: {
                                toolUseId: toolUseId,
                                type: "TEXT",
                                textInputConfiguration: {
                                    mediaType: "text/plain",
                                },
                            },
                        },
                    },
                });
                resultContent = typeof result === "string" ? result : JSON.stringify(result);
                this.addEventToSessionQueue(sessionId, {
                    event: {
                        toolResult: {
                            promptName: session.promptName,
                            contentName: contentId,
                            content: resultContent,
                        },
                    },
                });
                this.addEventToSessionQueue(sessionId, {
                    event: {
                        contentEnd: {
                            promptName: session.promptName,
                            contentName: contentId,
                        },
                    },
                });
                console.log("Tool result sent for session ".concat(sessionId));
                return [2 /*return*/];
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.sendContentEnd = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        session = this.activeSessions.get(sessionId);
                        if (!session || !session.isAudioContentStartSent)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.addEventToSessionQueue(sessionId, {
                                event: {
                                    contentEnd: {
                                        promptName: session.promptName,
                                        contentName: session.audioContentId,
                                    },
                                },
                            })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 500); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.sendPromptEnd = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        session = this.activeSessions.get(sessionId);
                        if (!session || !session.isPromptStartSent)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.addEventToSessionQueue(sessionId, {
                                event: {
                                    promptEnd: {
                                        promptName: session.promptName,
                                    },
                                },
                            })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 300); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.sendSessionEnd = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.addEventToSessionQueue(sessionId, {
                            event: {
                                sessionEnd: {},
                            },
                        })];
                    case 1:
                        _a.sent();
                        this.closeSession(sessionId);
                        return [2 /*return*/];
                }
            });
        });
    };
    NovaSonicBidirectionalStreamClient.prototype.registerEventHandler = function (sessionId, eventType, handler) {
        var session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error("Session ".concat(sessionId, " not found"));
        }
        session.responseHandlers.set(eventType, handler);
    };
    NovaSonicBidirectionalStreamClient.prototype.dispatchEvent = function (sessionId, eventType, data) {
        var session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        var handler = session.responseHandlers.get(eventType);
        if (handler) {
            try {
                handler(data);
            }
            catch (e) {
                console.error("Error in ".concat(eventType, " handler for session ").concat(sessionId, ":"), e);
            }
        }
        // Also dispatch to "any" handlers
        var anyHandler = session.responseHandlers.get("any");
        if (anyHandler) {
            try {
                anyHandler({ type: eventType, data: data });
            }
            catch (e) {
                console.error("Error in 'any' handler for session ".concat(sessionId, ":"), e);
            }
        }
    };
    NovaSonicBidirectionalStreamClient.prototype.closeSession = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var session;
            return __generator(this, function (_a) {
                if (this.sessionCleanupInProgress.has(sessionId)) {
                    console.log("Session ".concat(sessionId, " is being cleaned up."));
                    return [2 /*return*/];
                }
                session = this.activeSessions.get(sessionId);
                if (!session)
                    return [2 /*return*/];
                console.log("Closing session ".concat(sessionId));
                this.sessionCleanupInProgress.add(sessionId);
                try {
                    session.isActive = false;
                    // If we are patient, we could wait for all this. Not really a point tho.
                    this.sendContentEnd(sessionId);
                    this.sendPromptEnd(sessionId);
                    this.sendSessionEnd(sessionId);
                    // This happens *sync* to force close the session.
                    session.closeSignal.next();
                    session.closeSignal.complete();
                    this.activeSessions.delete(sessionId);
                    this.sessionLastActivity.delete(sessionId);
                    console.log("Session ".concat(sessionId, " closed."));
                }
                finally {
                    this.sessionCleanupInProgress.delete(sessionId);
                }
                return [2 /*return*/];
            });
        });
    };
    return NovaSonicBidirectionalStreamClient;
}());
exports.NovaSonicBidirectionalStreamClient = NovaSonicBidirectionalStreamClient;
