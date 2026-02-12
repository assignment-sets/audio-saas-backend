// src/middleware/auth0.middleware.ts ~annotator~
import { auth } from "express-oauth2-jwt-bearer";
import { env } from "../config/env";

export const jwtCheck = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: env.AUTH0_TOKEN_SIGNING_ALGO,
});
