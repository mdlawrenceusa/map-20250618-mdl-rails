"use strict";
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
class Tool {
    static async execute(toolUseContent, messagesList) {
        return {};
    }
}
exports.Tool = Tool;
function parseToolsFromXML(xmlString, functions = {}) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const tools = doc.querySelectorAll('tool');
    const toolClasses = [];
    tools.forEach(tool => {
        var _a;
        const id = tool.getAttribute('id');
        const functionName = tool.getAttribute('function');
        const description = tool.getAttribute('description');
        const properties = tool.querySelectorAll('property');
        const schema = {
            type: "object",
            properties: {},
            required: []
        };
        properties.forEach(prop => {
            const name = prop.getAttribute('name');
            const type = prop.getAttribute('type');
            const required = prop.getAttribute('required') === 'true';
            const desc = prop.getAttribute('description');
            schema.properties[name] = {
                type: type,
                description: desc
            };
            if (required) {
                schema.required.push(name);
            }
        });
        const toolClass = (_a = class extends Tool {
                static async execute(toolUseContent, messagesList) {
                    const func = functions[functionName];
                    if (func) {
                        return await func(toolUseContent, messagesList);
                    }
                    return {};
                }
            },
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
        Object.defineProperty(toolClass, 'name', { value: `${id}Tool` });
        toolClasses.push(toolClass);
    });
    return toolClasses;
}
