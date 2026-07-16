import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './openapiRegistry';

export const getOpenApiDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'AudioSaaS API Docs',
      description:
        'Programmatically generated REST API documentation using active Zod validation schemas.',
    },
    servers: [{ url: 'http://localhost:5000' }],
  });
};
