// src/lib/auth0.client.ts ~annotator~
// src/lib/auth0.client.ts

import { ManagementClient } from "auth0";
import { env } from "../config/env_setup/env";

export const management = new ManagementClient({
  domain: env.AUTH0_DOMAIN,
  clientId: env.AUTH0_CLIENT_ID,
  clientSecret: env.AUTH0_SECRET,
});
