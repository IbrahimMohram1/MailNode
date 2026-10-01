require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const https = require("https");
const { buildContactEmail } = require("./emailTemplate");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

const app = express();

if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
}

const PORT = Number(process.env.PORT) || 3000;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const requiredEnvVars = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_TO"];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing env variables: ${missing.join(", ")}`);
  process.exit(1);
}

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("CORS_NOT_ALLOWED"));
    },
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "10kb" }));

const limiter = rateLimit({
  max:  50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS" },
});

const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const escapeHtml = (v) =>
  String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fetchLogoDataUri = (url) => {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const client = url.startsWith("https://") ? https : http;

    const req = client.get(url, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        resolve(null);
        return;
      }

      const chunks = [];

      res.on("data", (chunk) => chunks.push(chunk));

      res.on("end", () => {
        const buffer = Buffer.concat(chunks);

        const contentType =
          res.headers["content-type"] || "image/png";

        const base64 = buffer.toString("base64");

        resolve(`data:${contentType};base64,${base64}`);
      });
    });

    req.on("error", () => resolve(null));

    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });
  });
};


app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/contact", limiter, async (req, res) => {
  const { name, email, message, website } = req.body || {};

  // honeypot: لو اتملى يبقى بوت، نتجاهله بهدوء
  if (website) return res.json({ success: true });

  const cleanName = clean(name, 100);
  const cleanEmail = clean(email, 255).toLowerCase();
  const cleanMessage = clean(message, 2000);

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ success: false, code: "MISSING_FIELDS" });
  }
  if (cleanName.length < 2) {
    return res.status(400).json({ success: false, code: "NAME_TOO_SHORT" });
  }
  if (cleanMessage.length < 10) {
    return res.status(400).json({ success: false, code: "MESSAGE_TOO_SHORT" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ success: false, code: "INVALID_EMAIL" });
  }

  try {
    const logoDataUri  = await fetchLogoDataUri(process.env.COMPANY_LOGO_URL);

 await transporter.sendMail({
  from: `"El Wa33b" <${process.env.SMTP_USER}>`,
  to: process.env.EMAIL_TO,
  replyTo: cleanEmail,

  subject: cleanName,

  text: `الاسم: ${cleanName}
الإيميل: ${cleanEmail}

الرسالة:
${cleanMessage}`,

  html: buildContactEmail({
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
    logoDataUri,
  }),
});


    res.json({ success: true });
  } catch (error) {
    console.error("Email sending failed:", error);
    res.status(500).json({ success: false, code: "SEND_FAILED" });
  }
});

app.use((_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));

app.use((error, _req, res, _next) => {
  if (error && error.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ success: false, code: "CORS_NOT_ALLOWED" });
  }
  console.error("Unhandled error:", error);
  res.status(500).json({ success: false, code: "SERVER_ERROR" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));