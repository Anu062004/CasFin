module.exports = {
  apps: [
    {
      name: "casfin-keeper",
      cwd: __dirname,
      script: "npm",
      args: "run keeper:start",
      interpreter: "none",
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      max_restarts: 20,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
