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
exports.Tool = exports.DefaultToolSchema = void 0;
exports.parseToolsFromXML = parseToolsFromXML;
exports.DefaultToolSchema = {
    type: "object",
    properties: {},
    required: [],
};
var Tool = /** @class */ (function () {
    function Tool() {
    }
    Tool.execute = function (toolUseContent, messagesList) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {}];
            });
        });
    };
    return Tool;
}());
exports.Tool = Tool;
function parseToolsFromXML(xmlString, functions) {
    if (functions === void 0) { functions = {}; }
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlString, 'text/xml');
    var tools = doc.querySelectorAll('tool');
    var toolClasses = [];
    tools.forEach(function (tool) {
        var _a;
        var id = tool.getAttribute('id');
        var functionName = tool.getAttribute('function');
        var description = tool.getAttribute('description');
        var properties = tool.querySelectorAll('property');
        var schema = {
            type: "object",
            properties: {},
            required: []
        };
        properties.forEach(function (prop) {
            var name = prop.getAttribute('name');
            var type = prop.getAttribute('type');
            var required = prop.getAttribute('required') === 'true';
            var desc = prop.getAttribute('description');
            schema.properties[name] = {
                type: type,
                description: desc
            };
            if (required) {
                schema.required.push(name);
            }
        });
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
            }(Tool)),
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
        Object.defineProperty(toolClass, 'name', { value: "".concat(id, "Tool") });
        toolClasses.push(toolClass);
    });
    return toolClasses;
}
