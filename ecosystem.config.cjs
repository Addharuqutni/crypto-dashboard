const path = require('path');

const pythonAgentUrl = process.env.PYTHON_AGENT_URL || 'http://127.0.0.1:8000';
const pythonAgentTimeoutMs = process.env.PYTHON_AGENT_TIMEOUT_MS || '20000';

const sharedNodeEnv = {
  NODE_ENV: 'production',
  PYTHON_AGENT_URL: pythonAgentUrl,
  PYTHON_AGENT_TIMEOUT_MS: pythonAgentTimeoutMs,
};

module.exports = {
  apps: [
    {
      name: 'crypto-dashboard-web',
      cwd: __dirname,
      script: 'scripts/start-prod.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        ...sharedNodeEnv,
        NODE_OPTIONS: '--max-old-space-size=512',
        PORT: process.env.PORT || '3000',
        HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
        DISABLE_SCREENER_SCHEDULER: '1',
        SCREENER_STORAGE_MODE: 'file',
        SCREENER_STORAGE_BACKEND: 'file',
        SCREENER_REQUIRE_DATABASE: '0',
        SCREENER_FILE_MODE_STRICT: '1',
      },
      max_memory_restart: '768M',
      time: true,
      out_file: './logs/pm2-web-out.log',
      error_file: './logs/pm2-web-error.log',
      merge_logs: true,
    },
    {
      name: 'crypto-dashboard-python-screener',
      cwd: path.join(__dirname, 'agent'),
      script: path.join(__dirname, 'scripts/python-agent/worker.sh'),
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        MARKET_DATA_MODE: 'dashboard',
        DASHBOARD_HOST: '127.0.0.1',
        DASHBOARD_PORT: '8000',
      },
      max_memory_restart: '512M',
      time: true,
      out_file: path.join(__dirname, 'logs/pm2-python-screener-out.log'),
      error_file: path.join(__dirname, 'logs/pm2-python-screener-error.log'),
      merge_logs: true,
    },
    {
      name: 'crypto-dashboard-worker',
      cwd: __dirname,
      script: 'scripts/worker/start.ts',
      interpreter: 'node_modules/.bin/tsx',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        ...sharedNodeEnv,
        NODE_OPTIONS: '--max-old-space-size=256',
      },
      max_memory_restart: '400M',
      time: true,
      out_file: './logs/pm2-worker-out.log',
      error_file: './logs/pm2-worker-error.log',
      merge_logs: true,
    },
    {
      // Python Action Call FastAPI — sole signal source for web/screener/worker.
      // Not the TS AI agent (scripts/agent/start.ts).
      name: 'crypto-dashboard-python-agent',
      cwd: path.join(__dirname, 'agent'),
      script: path.join(__dirname, 'scripts/python-agent/start.sh'),
      interpreter: 'bash',
      args: '',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        MARKET_DATA_MODE: 'dashboard',
        DASHBOARD_HOST: '127.0.0.1',
        DASHBOARD_PORT: '8000',
      },
      max_memory_restart: '512M',
      time: true,
      out_file: path.join(__dirname, 'logs/pm2-python-agent-out.log'),
      error_file: path.join(__dirname, 'logs/pm2-python-agent-error.log'),
      merge_logs: true,
    },
  ],
};
