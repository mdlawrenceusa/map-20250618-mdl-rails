"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protectEndpoints = exports.requireAdmin = exports.authenticate = exports.cognitoAuth = void 0;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const axios_1 = __importDefault(require("axios"));
// Load configuration
const cognito_config_json_1 = __importDefault(require("../../../../cognito-config.json"));
class CognitoAuthMiddleware {
    constructor() {
        // Middleware to protect routes
        this.authenticate = async (req, res, next) => {
            try {
                // Skip authentication for webhook endpoints and WebSocket
                const path = req.path.toLowerCase();
                if (path.startsWith('/webhooks/') || path.includes('/ws') || path.includes('socket')) {
                    return next();
                }
                // Extract token from Authorization header
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'No token provided' });
                }
                const token = authHeader.substring(7);
                // Verify the token
                const payload = await this.verifier.verify(token);
                // Add user information to request
                req.user = {
                    sub: payload.sub,
                    email: payload.email || payload['cognito:username'],
                    groups: payload['cognito:groups'] || [],
                    ...payload,
                };
                next();
            }
            catch (error) {
                console.error('Authentication error:', error);
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
        };
        // Middleware to check if user is in admin group
        this.requireAdmin = (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            if (!req.user.groups || !req.user.groups.includes('Admins')) {
                return res.status(403).json({ error: 'Admin access required' });
            }
            next();
        };
        // Middleware for specific endpoints
        this.protectEndpoints = (protectedPaths) => {
            return (req, res, next) => {
                const path = req.path.toLowerCase();
                // Check if current path needs protection
                const needsProtection = protectedPaths.some(protectedPath => path.startsWith(protectedPath.toLowerCase()));
                if (needsProtection) {
                    return this.authenticate(req, res, next);
                }
                next();
            };
        };
        // Initialize JWT verifier
        this.verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
            userPoolId: cognito_config_json_1.default.userPoolId,
            tokenUse: 'access',
            clientId: cognito_config_json_1.default.userPoolWebClientId,
        });
        // Initialize Cognito client
        this.cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
            region: cognito_config_json_1.default.region,
        });
        // Fetch JWKS
        this.initializeJWKS();
    }
    async initializeJWKS() {
        try {
            const jwksUrl = `https://cognito-idp.${cognito_config_json_1.default.region}.amazonaws.com/${cognito_config_json_1.default.userPoolId}/.well-known/jwks.json`;
            const response = await axios_1.default.get(jwksUrl);
            this.jwks = response.data;
        }
        catch (error) {
            console.error('Failed to fetch JWKS:', error);
        }
    }
    // OAuth callback handler
    async handleOAuthCallback(code) {
        try {
            const tokenEndpoint = cognito_config_json_1.default.oauth.tokenEndpoint;
            const clientId = cognito_config_json_1.default.userPoolWebClientId;
            const clientSecret = cognito_config_json_1.default.userPoolWebClientSecret;
            const redirectUri = cognito_config_json_1.default.oauth.redirectUri;
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code: code,
                redirect_uri: redirectUri,
            });
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const response = await axios_1.default.post(tokenEndpoint, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`,
                },
            });
            return response.data;
        }
        catch (error) {
            console.error('OAuth callback error:', error);
            throw error;
        }
    }
    // Refresh token
    async refreshToken(refreshToken) {
        try {
            const tokenEndpoint = cognito_config_json_1.default.oauth.tokenEndpoint;
            const clientId = cognito_config_json_1.default.userPoolWebClientId;
            const clientSecret = cognito_config_json_1.default.userPoolWebClientSecret;
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: clientId,
                refresh_token: refreshToken,
            });
            const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            const response = await axios_1.default.post(tokenEndpoint, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`,
                },
            });
            return response.data;
        }
        catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }
    // Get user info
    async getUserInfo(accessToken) {
        try {
            const command = new client_cognito_identity_provider_1.GetUserCommand({
                AccessToken: accessToken,
            });
            const response = await this.cognitoClient.send(command);
            const userInfo = {
                username: response.Username,
            };
            // Extract attributes
            response.UserAttributes?.forEach(attr => {
                userInfo[attr.Name] = attr.Value;
            });
            return userInfo;
        }
        catch (error) {
            console.error('Get user info error:', error);
            throw error;
        }
    }
    // Login URL generator
    getLoginUrl(state) {
        const authEndpoint = cognito_config_json_1.default.oauth.authorizationEndpoint;
        const clientId = cognito_config_json_1.default.userPoolWebClientId;
        const redirectUri = cognito_config_json_1.default.oauth.redirectUri;
        const scope = cognito_config_json_1.default.oauth.scope.join(' ');
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scope,
        });
        if (state) {
            params.append('state', state);
        }
        return `${authEndpoint}?${params.toString()}`;
    }
    // Logout URL generator
    getLogoutUrl(redirectUri) {
        const domain = cognito_config_json_1.default.oauth.domain;
        const clientId = cognito_config_json_1.default.userPoolWebClientId;
        const logoutUri = redirectUri || cognito_config_json_1.default.oauth.redirectUri;
        return `https://${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    }
}
// Export singleton instance
exports.cognitoAuth = new CognitoAuthMiddleware();
// Export middleware functions
exports.authenticate = exports.cognitoAuth.authenticate;
exports.requireAdmin = exports.cognitoAuth.requireAdmin;
exports.protectEndpoints = exports.cognitoAuth.protectEndpoints;
