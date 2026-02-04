import { CredentialsMethod, OpenFgaClient } from "@openfga/sdk";
import { env } from "../config/env";

export const fgaClient = new OpenFgaClient({
  apiUrl: env.FGA_API_URL,
  storeId: env.FGA_STORE_ID,
  authorizationModelId: env.FGA_MODEL_ID,
  credentials: {
    method: CredentialsMethod.ClientCredentials,
    config: {
      apiTokenIssuer: env.FGA_TOKEN_ISSUER,
      apiAudience: env.FGA_API_AUD,
      clientId: env.FGA_CLIENT_ID,
      clientSecret: env.FGA_CLIENT_SECRET,
    },
  },
});
