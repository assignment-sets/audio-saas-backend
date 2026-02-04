import pino from "pino";
import { env } from "./env";

const isProd = env.NODE_ENV === "production";

export const logger = pino({
  level: isProd ? "info" : "debug",

  // Pretty logs in dev, JSON in prod
  transport: !isProd
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,

  base: {
    service: "api",
  },
});
