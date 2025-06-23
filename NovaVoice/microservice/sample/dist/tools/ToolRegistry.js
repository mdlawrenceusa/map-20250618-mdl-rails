"use strict";
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = exports.registeredTools = void 0;
const Tool_1 = require("./Tool");
const xmldom_1 = require("xmldom");
const functions = {
    check_messages: async (toolUseContent, messagesList) => {
        return {
            content: `The following messages are for the assistant to pass on to the user: [${messagesList.toString()}]`
        };
    },
    check_connection: async (toolUseContent, messagesList) => {
        setTimeout(() => {
            messagesList.push("I've reviewed your connection status and detected that in the last 24 hours there were some problems registering your equipment on the network. This could have affected your service quality. To better understand what happened, I'm going to check if any specific outages were recorded that could have impacted your connection. Before we continue, can I verify that you're still there?");
            console.log(messagesList);
        }, 3000);
        return {
            content: "I'm reviewing your connection status now, including anything that may have affected it.",
        };
    },
    check_for_outage: async (toolUseContent, messagesList) => {
        const { affectsAllUserDevices } = JSON.parse(toolUseContent.content);
        if (affectsAllUserDevices) {
            return {
                content: "I confirmed that there's a massive outage in your area that's affecting your internet service. You can manage your service continuity pack through the MiPersonal app or website, as long as you meet the requirements. We'll notify you when service is restored. Do you want a copy of all the information I just said to be sent to you via SMS?",
            };
        }
        else {
            functions.check_connection(toolUseContent, messagesList);
            return {
                content: "I checked, and I couldn't find any evidence of an outage in your area. I'm going to check if your connection had any issues in the past 24 hours. Please wait a moment",
            };
        }
    },
    get_weather: async (toolUseContent, messagesList) => {
        const { latitude, longitude } = JSON.parse(toolUseContent.content);
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "MyApp/1.0",
                    Accept: "application/json",
                },
            });
            const weatherData = await response.json();
            console.log("weatherData:", weatherData);
            return {
                weather_data: weatherData,
            };
        }
        catch (error) {
            console.error(`Error fetching weather data: ${error}`);
            throw error;
        }
    },
};
function parseToolsFromXML(xmlString, functions = {}) {
    var _a;
    const parser = new xmldom_1.DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const tools = doc.getElementsByTagName("tool");
    const toolClasses = [];
    for (let i = 0; i < tools.length; i++) {
        const tool = tools[i];
        const id = tool.getAttribute("id");
        const functionName = tool.getAttribute("function");
        const description = tool.getAttribute("description");
        const properties = tool.getElementsByTagName("property");
        const schema = {
            type: "object",
            properties: {},
            required: [],
        };
        for (let j = 0; j < properties.length; j++) {
            const prop = properties[j];
            const name = prop.getAttribute("name");
            const type = prop.getAttribute("type");
            const required = prop.getAttribute("required") === "true";
            const desc = prop.getAttribute("description");
            schema.properties[name] = {
                type: type,
                description: desc,
            };
            if (required) {
                schema.required.push(name);
            }
        }
        ;
        const toolClass = (_a = class extends Tool_1.Tool {
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
        Object.defineProperty(toolClass, "name", { value: id });
        toolClasses.push(toolClass);
    }
    ;
    return toolClasses;
}
exports.registeredTools = parseToolsFromXML(`
<tool id="check_messages" function="check_messages" description="Use this tool to check if there's a connection issue in the user's area. Do not assume how many devices are affected without asking."/>
<tool id="check_connection" function="check_connection" description="Use this tool to check if there's a connection issue in the user's area. Do not assume how many devices are affected without asking."/>
<tool id="check_for_outage" function="check_for_outage" description="Use this tool to check if there's an outage in the user's area. Do not assume how many devices are affected without asking.">
  <property name="affectsAllUserDevices" type="boolean" required="true" description="Whether the outage affects all user devices" />
</tool>
<tool id="get_weather" function="get_weather" description="Get the current weather for a given location, based on its WGS84 coordinates.">
  <property name="latitude" type="string" required="true" description="Geographical WGS84 latitude of the location." />
  <property name="longitude" type="string" required="true" description="Geographical WGS84 longitude of the location." />
</tool>
`, functions);
class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.messagesList = [];
        this.registerXMLTools();
        // Add startup scripts here.
    }
    getToolSpecs() {
        return exports.registeredTools.map(ToolClass => ToolClass.toolSpec);
    }
    registerXMLTools() {
        exports.registeredTools.forEach((ToolClass) => {
            this.tools.set(ToolClass.id, ToolClass.execute.bind(ToolClass));
        });
    }
    async execute(toolName, content) {
        const handler = this.tools.get(toolName);
        if (!handler) {
            throw new Error(`Tool ${toolName} not supported`);
        }
        return handler(content, this.messagesList);
    }
}
exports.ToolRegistry = ToolRegistry;
exports.default = exports.registeredTools;
