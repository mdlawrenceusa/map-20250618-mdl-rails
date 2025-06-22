"use strict";
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = exports.registeredTools = void 0;
var Tool_1 = require("./Tool");
var xmldom_1 = require("xmldom");
var functions = {
    check_messages: function (toolUseContent, messagesList) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, {
                    content: "The following messages are for the assistant to pass on to the user: [".concat(messagesList.toString(), "]")
                }];
        });
    }); },
    check_connection: function (toolUseContent, messagesList) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            setTimeout(function () {
                messagesList.push("I've reviewed your connection status and detected that in the last 24 hours there were some problems registering your equipment on the network. This could have affected your service quality. To better understand what happened, I'm going to check if any specific outages were recorded that could have impacted your connection. Before we continue, can I verify that you're still there?");
                console.log(messagesList);
            }, 3000);
            return [2 /*return*/, {
                    content: "I'm reviewing your connection status now, including anything that may have affected it.",
                }];
        });
    }); },
    check_for_outage: function (toolUseContent, messagesList) { return __awaiter(void 0, void 0, void 0, function () {
        var affectsAllUserDevices;
        return __generator(this, function (_a) {
            affectsAllUserDevices = JSON.parse(toolUseContent.content).affectsAllUserDevices;
            if (affectsAllUserDevices) {
                return [2 /*return*/, {
                        content: "I confirmed that there's a massive outage in your area that's affecting your internet service. You can manage your service continuity pack through the MiPersonal app or website, as long as you meet the requirements. We'll notify you when service is restored. Do you want a copy of all the information I just said to be sent to you via SMS?",
                    }];
            }
            else {
                functions.check_connection(toolUseContent, messagesList);
                return [2 /*return*/, {
                        content: "I checked, and I couldn't find any evidence of an outage in your area. I'm going to check if your connection had any issues in the past 24 hours. Please wait a moment",
                    }];
            }
            return [2 /*return*/];
        });
    }); },
    get_weather: function (toolUseContent, messagesList) { return __awaiter(void 0, void 0, void 0, function () {
        var _a, latitude, longitude, url, response, weatherData, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = JSON.parse(toolUseContent.content), latitude = _a.latitude, longitude = _a.longitude;
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    url = "https://api.open-meteo.com/v1/forecast?latitude=".concat(latitude, "&longitude=").concat(longitude, "&current_weather=true");
                    return [4 /*yield*/, fetch(url, {
                            headers: {
                                "User-Agent": "MyApp/1.0",
                                Accept: "application/json",
                            },
                        })];
                case 2:
                    response = _b.sent();
                    return [4 /*yield*/, response.json()];
                case 3:
                    weatherData = _b.sent();
                    console.log("weatherData:", weatherData);
                    return [2 /*return*/, {
                            weather_data: weatherData,
                        }];
                case 4:
                    error_1 = _b.sent();
                    console.error("Error fetching weather data: ".concat(error_1));
                    throw error_1;
                case 5: return [2 /*return*/];
            }
        });
    }); },
};
function parseToolsFromXML(xmlString, functions) {
    var _a;
    if (functions === void 0) { functions = {}; }
    var parser = new xmldom_1.DOMParser();
    var doc = parser.parseFromString(xmlString, "text/xml");
    var tools = doc.getElementsByTagName("tool");
    var toolClasses = [];
    var _loop_1 = function (i) {
        var tool = tools[i];
        var id = tool.getAttribute("id");
        var functionName = tool.getAttribute("function");
        var description = tool.getAttribute("description");
        var properties = tool.getElementsByTagName("property");
        var schema = {
            type: "object",
            properties: {},
            required: [],
        };
        for (var j = 0; j < properties.length; j++) {
            var prop = properties[j];
            var name_1 = prop.getAttribute("name");
            var type = prop.getAttribute("type");
            var required = prop.getAttribute("required") === "true";
            var desc = prop.getAttribute("description");
            schema.properties[name_1] = {
                type: type,
                description: desc,
            };
            if (required) {
                schema.required.push(name_1);
            }
        }
        ;
        var toolClass = (_a = /** @class */ (function (_super) {
                __extends(class_1, _super);
                function class_1() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                class_1.execute = function (toolUseContent, messagesList) {
                    return __awaiter(this, void 0, void 0, function () {
                        var func;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    func = functions[functionName];
                                    if (!func) return [3 /*break*/, 2];
                                    return [4 /*yield*/, func(toolUseContent, messagesList)];
                                case 1: return [2 /*return*/, _b.sent()];
                                case 2: return [2 /*return*/, {}];
                            }
                        });
                    });
                };
                return class_1;
            }(Tool_1.Tool)),
            __setFunctionName(_a, "toolClass"),
            _a.id = id,
            _a.schema = schema,
            _a.toolSpec = {
                toolSpec: {
                    name: id,
                    description: description,
                    inputSchema: {
                        json: JSON.stringify(schema),
                    },
                },
            },
            _a);
        Object.defineProperty(toolClass, "name", { value: id });
        toolClasses.push(toolClass);
    };
    for (var i = 0; i < tools.length; i++) {
        _loop_1(i);
    }
    ;
    return toolClasses;
}
exports.registeredTools = parseToolsFromXML("\n<tool id=\"check_messages\" function=\"check_messages\" description=\"Use this tool to check if there's a connection issue in the user's area. Do not assume how many devices are affected without asking.\"/>\n<tool id=\"check_connection\" function=\"check_connection\" description=\"Use this tool to check if there's a connection issue in the user's area. Do not assume how many devices are affected without asking.\"/>\n<tool id=\"check_for_outage\" function=\"check_for_outage\" description=\"Use this tool to check if there's an outage in the user's area. Do not assume how many devices are affected without asking.\">\n  <property name=\"affectsAllUserDevices\" type=\"boolean\" required=\"true\" description=\"Whether the outage affects all user devices\" />\n</tool>\n<tool id=\"get_weather\" function=\"get_weather\" description=\"Get the current weather for a given location, based on its WGS84 coordinates.\">\n  <property name=\"latitude\" type=\"string\" required=\"true\" description=\"Geographical WGS84 latitude of the location.\" />\n  <property name=\"longitude\" type=\"string\" required=\"true\" description=\"Geographical WGS84 longitude of the location.\" />\n</tool>\n", functions);
var ToolRegistry = /** @class */ (function () {
    function ToolRegistry() {
        this.tools = new Map();
        this.messagesList = [];
        this.registerXMLTools();
        // Add startup scripts here.
    }
    ToolRegistry.prototype.getToolSpecs = function () {
        return exports.registeredTools.map(function (ToolClass) { return ToolClass.toolSpec; });
    };
    ToolRegistry.prototype.registerXMLTools = function () {
        var _this = this;
        exports.registeredTools.forEach(function (ToolClass) {
            _this.tools.set(ToolClass.id, ToolClass.execute.bind(ToolClass));
        });
    };
    ToolRegistry.prototype.execute = function (toolName, content) {
        return __awaiter(this, void 0, void 0, function () {
            var handler;
            return __generator(this, function (_a) {
                handler = this.tools.get(toolName);
                if (!handler) {
                    throw new Error("Tool ".concat(toolName, " not supported"));
                }
                return [2 /*return*/, handler(content, this.messagesList)];
            });
        });
    };
    return ToolRegistry;
}());
exports.ToolRegistry = ToolRegistry;
exports.default = exports.registeredTools;
