import tracer from 'dd-trace';
import { env } from '../config/env_setup/env';

// Only start dd-trace if explicitly enabled in the environment
if (env.DD_TRACE_ENABLED) {
  tracer.init({
    service: env.DD_SERVICE,
    env: env.DD_ENV,
    version: env.DD_VERSION,
    hostname: env.DD_AGENT_HOST,
    port: parseInt(env.DD_TRACE_AGENT_PORT, 10),
    logInjection: true, // Automatically injects dd.trace_id and dd.span_id into Pino logs
  });
}

export default tracer;
