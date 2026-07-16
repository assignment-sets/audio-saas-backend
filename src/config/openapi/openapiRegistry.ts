import './zodSetup';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export const registry = new OpenAPIRegistry();

// Register Bearer Auth
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Auth0 JWT Bearer Token',
});

// Register API Key Auth
registry.registerComponent('securitySchemes', 'apiKeyHeader', {
  type: 'apiKey',
  in: 'header',
  name: 'x-api-key',
  description: 'Custom hashed API Key header',
});
