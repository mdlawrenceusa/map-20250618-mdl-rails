import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import axios from 'axios';

// Load configuration
import cognitoConfig from '../../../../cognito-config.json';

interface AuthRequest extends Request {
  user?: {
    sub: string;
    email: string;
    groups?: string[];
    [key: string]: any;
  };
}

class CognitoAuthMiddleware {
  private verifier: any;
  private cognitoClient: CognitoIdentityProviderClient;
  private jwks: any;

  constructor() {
    // Initialize JWT verifier
    this.verifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId,
      tokenUse: 'access',
      clientId: cognitoConfig.userPoolWebClientId,
    });

    // Initialize Cognito client
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: cognitoConfig.region,
    });

    // Fetch JWKS
    this.initializeJWKS();
  }

  private async initializeJWKS() {
    try {
      const jwksUrl = `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}/.well-known/jwks.json`;
      const response = await axios.get(jwksUrl);
      this.jwks = response.data;
    } catch (error) {
      console.error('Failed to fetch JWKS:', error);
    }
  }

  // Middleware to protect routes
  public authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
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
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };

  // Middleware to check if user is in admin group
  public requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.user.groups || !req.user.groups.includes('Admins')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  };

  // Middleware for specific endpoints
  public protectEndpoints = (protectedPaths: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      const path = req.path.toLowerCase();
      
      // Check if current path needs protection
      const needsProtection = protectedPaths.some(protectedPath => 
        path.startsWith(protectedPath.toLowerCase())
      );

      if (needsProtection) {
        return this.authenticate(req, res, next);
      }

      next();
    };
  };

  // OAuth callback handler
  public async handleOAuthCallback(code: string): Promise<any> {
    try {
      const tokenEndpoint = cognitoConfig.oauth.tokenEndpoint;
      const clientId = cognitoConfig.userPoolWebClientId;
      const clientSecret = cognitoConfig.userPoolWebClientSecret;
      const redirectUri = cognitoConfig.oauth.redirectUri;

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code,
        redirect_uri: redirectUri,
      });

      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  // Refresh token
  public async refreshToken(refreshToken: string): Promise<any> {
    try {
      const tokenEndpoint = cognitoConfig.oauth.tokenEndpoint;
      const clientId = cognitoConfig.userPoolWebClientId;
      const clientSecret = cognitoConfig.userPoolWebClientSecret;

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      });

      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  }

  // Get user info
  public async getUserInfo(accessToken: string): Promise<any> {
    try {
      const command = new GetUserCommand({
        AccessToken: accessToken,
      });

      const response = await this.cognitoClient.send(command);
      
      const userInfo: any = {
        username: response.Username,
      };

      // Extract attributes
      response.UserAttributes?.forEach(attr => {
        userInfo[attr.Name] = attr.Value;
      });

      return userInfo;
    } catch (error) {
      console.error('Get user info error:', error);
      throw error;
    }
  }

  // Login URL generator
  public getLoginUrl(state?: string): string {
    const authEndpoint = cognitoConfig.oauth.authorizationEndpoint;
    const clientId = cognitoConfig.userPoolWebClientId;
    const redirectUri = cognitoConfig.oauth.redirectUri;
    const scope = cognitoConfig.oauth.scope.join(' ');

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
  public getLogoutUrl(redirectUri?: string): string {
    const domain = cognitoConfig.oauth.domain;
    const clientId = cognitoConfig.userPoolWebClientId;
    const logoutUri = redirectUri || cognitoConfig.oauth.redirectUri;

    return `https://${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  }
}

// Export singleton instance
export const cognitoAuth = new CognitoAuthMiddleware();

// Export middleware functions
export const authenticate = cognitoAuth.authenticate;
export const requireAdmin = cognitoAuth.requireAdmin;
export const protectEndpoints = cognitoAuth.protectEndpoints;