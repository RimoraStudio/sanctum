import type { SanctumClient } from "./client.js";

export interface UniversalAuthTokens {
  accessToken: string;
  expiresIn: number;
  accessTokenMaxTTL: number;
  tokenType: "Bearer";
}

export interface UniversalAuthLoginInput {
  clientId: string;
  clientSecret: string;
  organizationSlug?: string;
}

export interface AuthApi {
  universalAuthLogin(input: UniversalAuthLoginInput): Promise<UniversalAuthTokens>;
  renewAccessToken(): Promise<{ token: string }>;
}

export const createAuth = (client: SanctumClient): AuthApi => ({
  universalAuthLogin: async (input) => {
    const tokens = await client.post<UniversalAuthTokens>("/api/v1/auth/universal-auth/login", input);
    client.setToken(tokens.accessToken);
    return tokens;
  },
  renewAccessToken: () => client.post<{ token: string }>("/api/v1/auth/token")
});
