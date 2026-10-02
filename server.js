require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const { buildContactEmail } = require("./emailTemplate");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const pino = require("pino");

const parseInteger = (env, name, fallback, min, max) => {
  const value = env[name] === undefined ? String(fallback) : env[name];
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
};

const loadConfig = (env) => {
  const required = ["CORS_ORIGIN", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_TO"];
  const missing = required.filter((key) => !env[key] || !env[key].trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

  const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
  for (const origin of allowedOrigins) {
    if (origin === "*") throw new Error("CORS_ORIGIN cannot contain a wildcard");
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN contains an invalid URL: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS_ORIGIN must contain exact http(s) origins, not paths or wildcards: ${origin}`);
    }
  }

  const trustProxy = parseInteger(env, "TRUST_PROXY", 1, 0, 10);
  const smtpPort = parseInteger(env, "SMTP_PORT", 465, 1, 65535);
  const smtpSecure = env.SMTP_SECURE === undefined
    ? smtpPort === 465
    : env.SMTP_SECURE.toLowerCase() === "true";
  if (env.SMTP_SECURE !== undefined && !["true", "false"].includes(env.SMTP_SECURE.toLowerCase())) {
    throw new Error("SMTP_SECURE must be true or false");
  }
  if (env.NODE_ENV && !["development", "production", "test"].includes(env.NODE_ENV)) {
    throw new Error("NODE_ENV must be development, production, or test");
  }
  const companyLogoUrl = env.COMPANY_LOGO_URL || "";
  if (companyLogoUrl) {
    let logoUrl;
    try {
      logoUrl = new URL(companyLogoUrl);
    } catch {
      throw new Error("COMPANY_LOGO_URL must be a valid HTTPS URL");
    }
    if (logoUrl.protocol !== "https:" || logoUrl.username || logoUrl.password) {
      throw new Error("COMPANY_LOGO_URL must be a valid HTTPS URL without credentials");
    }
  }
  const brandColor = env.BRAND_COLOR || "#ffffff";
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brandColor)) {
    throw new Error("BRAND_COLOR must be a 3- or 6-digit hex color");
  }

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: parseInteger(env, "PORT", 3000, 1, 65535),
    trustProxy,
    allowedOrigins,
    smtp: {
      host: env.SMTP_HOST,
      port: smtpPort,
      secure: smtpSecure,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      recipient: env.EMAIL_TO,
    },
    rateLimitMax: parseInteger(env, "RATE_LIMIT_MAX", 50, 1, 10000),
    bodyLimitKb: parseInteger(env, "BODY_LIMIT_KB", 10, 1, 1024),
    companyName: env.COMPANY_NAME || "Contact form",
    companyLogoUrl,
    brandColor,
    logLevel: env.LOG_LEVEL || (env.NODE_ENV === "production" ? "info" : "debug"),
  };
};

const createApp = ({ config, logger, transporter }) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS_NOT_ALLOWED"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }));
  app.use(express.json({ limit: `${config.bodyLimitKb}kb` }));

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: "TOO_MANY_REQUESTS" },
  });

  app.get("/health", async (_req, res) => {
    try {
      await transporter.verify();
      return res.json({ ok: true, dependencies: { smtp: "ok" } });
    } catch (error) {
      logger.warn({ err: error }, "SMTP health check failed");
      return res.status(503).json({ ok: false, dependencies: { smtp: "unavailable" } });
    }
  });

  app.post("/api/contact", limiter, async (req, res) => {
    const { name, email, message, website } = req.body || {};
    if (website) return res.json({ success: true });

    const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
    const cleanName = clean(name, 100);
    const cleanEmail = clean(email, 255).toLowerCase();
    const cleanMessage = clean(message, 2000);

    if (!cleanName || !cleanEmail || !cleanMessage) {
      return res.status(400).json({ success: false, code: "MISSING_FIELDS" });
    }
    if (cleanName.length < 2) return res.status(400).json({ success: false, code: "NAME_TOO_SHORT" });
    if (cleanMessage.length < 10) return res.status(400).json({ success: false, code: "MESSAGE_TOO_SHORT" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, code: "INVALID_EMAIL" });
    }

    try {
      await transporter.sendMail({
        from: { name: config.companyName, address: config.smtp.user },
        to: config.smtp.recipient,
        replyTo: cleanEmail,
        subject: "New contact form message",
        text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}`,
        html: buildContactEmail({
          name: cleanName,
          email: cleanEmail,
          message: cleanMessage,
          companyName: config.companyName,
          companyLogoUrl: config.companyLogoUrl,
          brandColor: config.brandColor,
        }),
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Contact email delivery failed");
      return res.status(500).json({ success: false, code: "SEND_FAILED" });
    }
  });

  app.use((_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.message === "CORS_NOT_ALLOWED") {
      return res.status(403).json({ success: false, code: "CORS_NOT_ALLOWED" });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ success: false, code: "PAYLOAD_TOO_LARGE" });
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ success: false, code: "INVALID_JSON" });
    }
    logger.error({ err: error }, "Unhandled request error");
    return res.status(500).json({ success: false, code: "SERVER_ERROR" });
  });

  return app;
};

const start = () => {
  const config = loadConfig(process.env);
  const logger = pino({ level: config.logLevel, base: { service: "contact-backend" } });
  const transporter = nodemailer.createTransport({
    pool: true,
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  const server = createApp({ config, logger, transporter }).listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, environment: config.nodeEnv }, "HTTP server listening");
  });

  let shuttingDown = false;
  const shutdown = (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Graceful shutdown started");
    const timeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      server.closeAllConnections();
      transporter.close();
      process.exit(1);
    }, 10000);
    timeout.unref();
    server.close((error) => {
      clearTimeout(timeout);
      transporter.close();
      if (error) {
        logger.error({ err: error }, "HTTP server shutdown failed");
        process.exitCode = 1;
      } else {
        logger.info("HTTP server closed");
        process.exitCode = exitCode;
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    shutdown("uncaughtException", 1);
  });
  server.on("error", (error) => {
    logger.fatal({ err: error }, "HTTP server failed");
    shutdown("serverError", 1);
  });
};

module.exports = { createApp, loadConfig };

if (require.main === module) {
  try {
    start();
  } catch (error) {
    const logger = pino({ level: "error" });
    logger.fatal({ err: error }, "Startup configuration failed");
    process.exitCode = 1;
  }
}