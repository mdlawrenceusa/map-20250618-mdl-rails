"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileTool = void 0;
const Tool_1 = require("./Tool");
const sampleData = [
    {
        phone_number: {
            S: "5101234567",
        },
        account_number: {
            S: "0001234567",
        },
        current_bill: {
            S: "108.45",
        },
        customer_since: {
            S: "2018-09",
        },
        data_used: {
            S: "12.2",
        },
        device: {
            S: "iPhone 15",
        },
        has_international_fees: {
            S: "true",
        },
        international_roaming_fees: {
            S: "38.45",
        },
        plan: {
            S: "Start Unlimited",
        },
        plan_cost: {
            S: "70",
        },
    },
];
class UserProfileTool extends Tool_1.Tool {
    static async execute(toolUseContent, messagesList) {
        const phoneNumber = JSON.parse(toolUseContent.content);
        if (phoneNumber != "5101234567")
            return {};
        const item = sampleData[0];
        return {
            phone_number: item.phone_number.S,
            account_number: item.account_number.S,
            current_bill: item.current_bill.S,
            customer_since: item.customer_since.S,
            data_used: item.data_used.S,
            device: item.device.S,
            has_international_fees: item.has_international_fees.S === "true",
            international_roaming_fees: item.international_roaming_fees.S,
            plan: item.plan.S,
            plan_cost: item.plan_cost.S,
        };
    }
}
exports.UserProfileTool = UserProfileTool;
UserProfileTool.id = "userprofiletool";
UserProfileTool.schema = {
    type: "object",
    properties: {
        phoneNumber: {
            type: "string",
            description: "A string of the user's phone number",
        },
    },
    required: ["phoneNumber"],
};
UserProfileTool.toolSpec = {
    toolSpec: {
        name: UserProfileTool.id,
        description: "Given a phone number, fetch a user's background information and profile",
        inputSchema: {
            json: JSON.stringify(UserProfileTool.schema),
        },
    },
};
exports.default = UserProfileTool;
