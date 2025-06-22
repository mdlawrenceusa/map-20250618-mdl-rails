import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand, CreateUserPoolCommand, CreateUserPoolClientCommand, DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import axios from "axios";

interface CognitoConfig {
  region: string;
  userPoolId?: string;
  clientId?: string;
  clientSecret?: string;
}

export class CognitoAuth {
  private client: CognitoIdentityProviderClient;
  private config: CognitoConfig;
  private jwks: any = null;
  private jwksUrl: string = "";

  constructor(config: CognitoConfig) {
    this.config = config;
    this.client = new CognitoIdentityProviderClient({ region: config.region });
    
    if (config.userPoolId) {
      this.jwksUrl = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}/.well-known/jwks.json`;
    }
  }

  async createUserPool() {
    try {
      const userPoolName = "nova-outbound-dashboard";
      
      const command = new CreateUserPoolCommand({
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
    } catch (error) {
      console.error("Error creating user pool:", error);
      throw error;
    }
  }

  async createAppClient(userPoolId: string) {
    try {
      const command = new CreateUserPoolClientCommand({
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
    } catch (error) {
      console.error("Error creating app client:", error);
      throw error;
    }
  }

  async createAdminUser(userPoolId: string, email: string, password: string, name: string) {
    try {
      // Create user
      const createCommand = new AdminCreateUserCommand({
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
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      });

      await this.client.send(setPasswordCommand);
      console.log("✅ Password set for user:", email);
      
      return true;
    } catch (error) {
      console.error("Error creating admin user:", error);
      throw error;
    }
  }

  async authenticate(username: string, password: string): Promise<any> {
    if (!this.config.userPoolId || !this.config.clientId || !this.config.clientSecret) {
      throw new Error("Cognito not configured");
    }

    try {
      const command = new AdminInitiateAuthCommand({
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
    } catch (error) {
      console.error("Authentication error:", error);
      throw error;
    }
  }

  private calculateSecretHash(username: string): string {
    const crypto = require("crypto");
    const message = username + this.config.clientId;
    const hmac = crypto.createHmac("sha256", this.config.clientSecret);
    hmac.update(message);
    return hmac.digest("base64");
  }

  async loadJWKS() {
    if (!this.jwks && this.jwksUrl) {
      try {
        const response = await axios.get(this.jwksUrl);
        this.jwks = response.data;
      } catch (error) {
        console.error("Error loading JWKS:", error);
        throw error;
      }
    }
  }

  async verifyToken(token: string): Promise<any> {
    await this.loadJWKS();
    
    const decoded = jwt.decode(token, { complete: true }) as any;
    if (!decoded) {
      throw new Error("Invalid token");
    }

    const kid = decoded.header.kid;
    const jwk = this.jwks.keys.find((key: any) => key.kid === kid);
    
    if (!jwk) {
      throw new Error("Key not found");
    }

    const pem = jwkToPem(jwk);
    return jwt.verify(token, pem, { algorithms: ["RS256"] });
  }

  // Middleware that excludes webhook routes
  authMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
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
        (req as any).user = decoded;
        next();
      } catch (error) {
        console.error("Token verification failed:", error);
        if (req.path.startsWith("/api") || req.path.startsWith("/call") || req.path.startsWith("/configure")) {
          return res.status(401).json({ error: "Invalid token" });
        }
        return res.redirect("/login");
      }
    };
  }

  updateConfig(config: Partial<CognitoConfig>) {
    this.config = { ...this.config, ...config };
    if (this.config.userPoolId) {
      this.jwksUrl = `https://cognito-idp.${this.config.region}.amazonaws.com/${this.config.userPoolId}/.well-known/jwks.json`;
      this.jwks = null; // Reset JWKS cache
    }
  }
}