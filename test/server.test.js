const assert = require("node:assert/strict");
const test = require("node:test");
const { createApp, loadConfig } = require("../server");

const validEnv = {
  NODE_ENV: "test",
  CORS_ORIGIN: "https://site.example",
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "sender@example.test",
  SMTP_PASS: "test-password",
  EMAIL_TO: "recipient@example.test",
};

const silentLogger = {
  warn() {},
  error() {},
};

const withServer = async (t, handlers = {}) => {
  const transporter = {
    async verify() {},
    async sendMail(message) {
      handlers.sendMail?.(message);
    },
  };
  const server = createApp({
    config: loadConfig(validEnv),
    logger: silentLogger,
    transporter,
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return { url: `http://127.0.0.1:${server.address().port}`, transporter };
};

test("requires SMTP settings and an explicit CORS origin", () => {
  assert.throws(() => loadConfig({}), /CORS_ORIGIN, SMTP_HOST/);
  assert.throws(() => loadConfig({ ...validEnv, CORS_ORIGIN: "*" }), /wildcard/);
  assert.throws(() => loadConfig({ ...validEnv, PORT: "not-a-port" }), /PORT must be an integer/);
});

test("health reports SMTP readiness", async (t) => {
  const { url } = await withServer(t);
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, dependencies: { smtp: "ok" } });
});

test("contact form validates fields and sends a message", async (t) => {
  let delivered;
  const { url } = await withServer(t, { sendMail: (message) => { delivered = message; } });
  const badResponse = await fetch(`${url}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "A", email: "invalid", message: "short" }),
  });
  assert.equal(badResponse.status, 400);

  const response = await fetch(`${url}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.example" },
    body: JSON.stringify({ name: "Ada", email: "ada@example.test", message: "Hello from the contact form." }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(delivered.replyTo, "ada@example.test");
});

test("rejects requests from unconfigured browser origins", async (t) => {
  const { url } = await withServer(t);
  const response = await fetch(`${url}/api/contact`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://other.example" },
    body: JSON.stringify({ name: "Ada", email: "ada@example.test", message: "Hello from the contact form." }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { success: false, code: "CORS_NOT_ALLOWED" });
});