import tracer from 'dd-trace';

const isTraceEnabled = process.env.DD_TRACE_ENABLED === 'true';

if (isTraceEnabled) {
  tracer.init({
    service: process.env.DD_SERVICE || 'engagement-bg-svc',
    env: process.env.DD_ENV || 'development',
    version: process.env.DD_VERSION || '1.0.0',
    hostname: process.env.DD_AGENT_HOST || '127.0.0.1',
    port: parseInt(process.env.DD_TRACE_AGENT_PORT || '8126', 10),
    logInjection: true,
  });
}

export default tracer;
