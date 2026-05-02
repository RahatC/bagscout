import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-clerk-auth-token"]',
      'req.headers["x-clerk-auth"]',
      "res.headers['set-cookie']",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.sessionToken",
      "*.secret",
      "*.html",
      "*.body",
      "*.emailBody",
    ],
    censor: "[Filtered]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
