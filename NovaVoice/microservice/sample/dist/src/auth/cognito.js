"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoAuth = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwk_to_pem_1 = __importDefault(require("jwk-to-pem"));
const axios_1 = __importDefault(require("axios"));
class CognitoAuth {
    constructor(config) {
        this.jwks = null;
        this.jwksUrl = "";
        this.config = config;
        this.client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({ region: config.region });
        if (config.userPoolId) {
            this.jwksUrl = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`;
        }
    }
    async createUserPool() {
        try {
            const userPoolName = "nova-outbound-dashboard";
            const command = new client_cognito_identity_provider_1.CreateUserPoolCommand({
                PoolName: userPoolName,
                AutoVerifiedAttributes: ["email"],
                MfaConfiguration: "OFF",
                Policies: {
                    PasswordPolicy: {
                        MinimumLength: 8,
                        RequireUppercase: true,
                        RequireLowercase: true,
                        RequireNumbers: true,
                        RequireSymbols: false,
                    },
                },
                AdminCreateUserConfig: {
                    AllowAdminCreateUserOnly: true,
                },
                Schema: [
                    {
                        Name: "email",
                        AttributeDataType: "String",
                        Required: true,
                        Mutable: true,
                    },
                    {
                        Name: "name",
                        AttributeDataType: "String",
                        Required: true,
                        Mutable: true,
                    },
                ],
            });
            const response = await this.client.send(command);
            console.log("✅ User Pool created:", response.UserPool?.Id);
            return response.UserPool;
        }
        catch (error) {
            console.error("Error creating user pool:", error);
            throw error;
        }
    }
    async createAppClient(userPoolId) {
        try {
            const command = new client_cognito_identity_provider_1.CreateUserPoolClientCommand({
                UserPoolId: userPoolId,
                ClientName: "nova-outbound-dashboard-client",
                GenerateSecret: true,
                ExplicitAuthFlows: [
                    "ADMIN_NO_SRP_AUTH",
                    "ALLOW_REFRESH_TOKEN_AUTH",
                ],
                ReadAttributes: ["email", "name"],
                WriteAttributes: ["email", "name"],
            });
            const response = await this.client.send(command);
            console.log("✅ App Client created:", response.UserPoolClient?.ClientId);
            return response.UserPoolClient;
        }
        catch (error) {
            console.error("Error creating app client:", error);
            throw error;
        }
    }
    async createAdminUser(userPoolId, email, password, name) {
        try {
            // Create user
            const createCommand = new client_cognito_identity_provider_1.AdminCreateUserCommand({
                UserPoolId: userPoolId,
                Username: email,
                UserAttributes: [
                    { Name: "email", Value: email },
                    { Name: "name", Value: name },
                    { Name: "email_verified", Value: "true" },
                ],
                TemporaryPassword: password,
                MessageAction: "SUPPRESS",
            });
            await this.client.send(createCommand);
            console.log("✅ Admin user created:", email);
            // Set permanent password
            const setPasswordCommand = new client_cognito_identity_provider_1.AdminSetUserPasswordCommand({
                UserPoolId: userPoolId,
                Username: email,
                Password: password,
                Permanent: true,
            });
            await this.client.send(setPasswordCommand);
            console.log("✅ Password set for user:", email);
            return true;
        }
        catch (error) {
            console.error("Error creating admin user:", error);
            throw error;
        }
    }
    async authenticate(username, password) {
        if (!this.config.userPoolId || !this.config.clientId || !this.config.clientSecret) {
            throw new Error("Cognito not configured");
        }
        try {
            const command = new client_cognito_identity_provider_1.AdminInitiateAuthCommand({
                UserPoolId: this.config.userPoolId,
                ClientId: this.config.clientId,
                AuthFlow: "ADMIN_NO_SRP_AUTH",
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password,
                    SECRET_HASH: this.calculateSecretHash(username),
                },
            });
            const response = await this.client.send(command);
            return response.AuthenticationResult;
        }
        catch (error) {
            console.error("Authentication error:", error);
            throw error;
        }
    }
    calculateSecretHash(username) {
        const crypto = require("crypto");
        const message = username + this.config.clientId;
        const hmac = crypto.createHmac("sha256", this.config.clientSecret);
        hmac.update(message);
        return hmac.digest("base64");
    }
    async loadJWKS() {
        if (!this.jwks && this.jwksUrl) {
            try {
                const response = await axios_1.default.get(this.jwksUrl);
                this.jwks = response.data;
            }
            catch (error) {
                console.error("Error loading JWKS:", error);
                throw error;
            }
        }
    }
    async verifyToken(token) {
        await this.loadJWKS();
        const decoded = jsonwebtoken_1.default.decode(token, { complete: true });
        if (!decoded) {
            throw new Error("Invalid token");
        }
        const kid = decoded.header.kid;
        const jwk = this.jwks.keys.find((key) => key.kid === kid);
        if (!jwk) {
            throw new Error("Key not found");
        }
        const pem = (0, jwk_to_pem_1.default)(jwk);
        return jsonwebtoken_1.default.verify(token, pem, { algorithms: ["RS256"] });
    }
    // Middleware that excludes webhook routes
    authMiddleware() {
        return async (req, res, next) => {
            // Skip authentication for webhook routes
            if (req.path.startsWith("/webhook") ||
                req.path.startsWith("/webhooks") ||
                req.path.startsWith("/outbound/answer") ||
                req.path.startsWith("/outbound/events") ||
                req.path.startsWith("/outbound/ai-answer") ||
                req.path === "/health" ||
                req.path === "/login" ||
                req.path === "/auth/login" ||
                req.path === "/auth/logout" ||
                req.path.startsWith("/socket")) {
                return next();
            }
            // Skip auth for static assets
            if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
                return next();
            }
            const token = req.headers.authorization?.replace("Bearer ", "") ||
                req.cookies?.authToken;
            if (!token) {
                // For API endpoints, return 401
                if (req.path.startsWith("/api") || req.path.startsWith("/call") || req.path.startsWith("/configure")) {
                    return res.status(401).json({ error: "Unauthorized" });
                }
                // For web pages, redirect to login
                return res.redirect("/login");
            }
            try {
                const decoded = await this.verifyToken(token);
                req.user = decoded;
                next();
            }
            catch (error) {
                console.error("Token verification failed:", error);
                if (req.path.startsWith("/api") || req.path.startsWith("/call") || req.path.startsWith("/configure")) {
                    return res.status(401).json({ error: "Invalid token" });
                }
                return res.redirect("/login");
            }
        };
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (this.config.userPoolId) {
            this.jwksUrl = `https://cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}/.well-known/jwks.json`;
            this.jwks = null; // Reset JWKS cache
        }
    }
}
exports.CognitoAuth = CognitoAuth;
