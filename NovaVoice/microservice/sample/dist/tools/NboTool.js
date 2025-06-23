"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NboTool = void 0;
const Tool_1 = require("./Tool");
const sampleData = {
    phone_number: {
        S: "5101234567",
    },
    billing: {
        M: {
            promotion: {
                S: "$10 credit applied to their next billing cycle",
            },
            reason: {
                S: "Customer was overcharged on previous bill",
            },
        },
    },
    outage: {
        M: {
            promotion: {
                S: "$20 credit toward their internet bill",
            },
            reason: {
                S: "Neighborhood connectivity outage",
            },
        },
    },
    trade_in: {
        M: {
            promotion: {
                S: "Trade in iPhone 14 for iPhone 15 at no extra cost. Customer will pay $20 per month",
            },
            reason: {
                S: "Customer eligible for upgrade promotion",
            },
        },
    },
};
class NboTool extends Tool_1.Tool {
    static async execute(toolUseContent, messagesList) {
        const { phoneNumber, intentType } = JSON.parse(toolUseContent.content);
        if (phoneNumber != "5101234567")
            return {};
        const item = sampleData[intentType];
        if (!item) {
            return {
                error: `No ${intentType} offer found for phone number: ${phoneNumber}`,
            };
        }
        return {
            "Best Customer Offer": item.M.promotion.S,
            Reason: item.M.reason.S,
        };
    }
}
exports.NboTool = NboTool;
NboTool.id = "nbotool";
NboTool.schema = {
    type: "object",
    properties: {
        phoneNumber: {
            type: "string",
            description: "A string of the user's phone number",
        },
        intentType: {
            type: "string",
            description: "The user's intent. Either outage | trade_in",
        },
    },
    required: ["phoneNumber", "intentType"],
};
NboTool.toolSpec = {
    toolSpec: {
        name: NboTool.id,
        description: "Get the next best action to offer the user, for anything about outages or trade-ins",
        inputSchema: {
            json: JSON.stringify(NboTool.schema),
        },
    },
};
exports.default = NboTool;
