module.exports = {
  apps: [
    {
      name: "contact-backend",
      script: "./server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "256M",
      kill_timeout: 12000,
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};