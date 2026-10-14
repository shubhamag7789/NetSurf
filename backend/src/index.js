'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getDb, closeDb } = require('./storage/db');
const { closeBrowser } = require('./agent/browser');
const tasksRouter = require('./routes/tasks');
const memoryRouter = require('./routes/memory');
const settingsRouter = require('./routes/settings');
const profileRouter = require('./routes/profile');

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_PORT = process.env.DEMO_SITE_PORT || 3001;

// Initialize Database
getDb();

// Middleware
app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Netsurf Agentic Browser Backend',
    version: '1.0.0',
    ai_configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()),
    demo_url: `http://localhost:${DEMO_PORT}`,
  });
});

// Routes
app.use('/api/tasks', tasksRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/profile', profileRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ── Demo Website Server ───────────────────────────────────────────────────
const demoApp = express();
demoApp.use(cors());
demoApp.use(express.json());

// Serve static demo-site directory
const demoSiteDir = path.resolve(__dirname, '../../demo-site');
demoApp.use(express.static(demoSiteDir));

// Demo site API endpoints for testing ambiguous targets & protected actions
demoApp.post('/api/checkout', (req, res) => {
  res.json({ status: 'success', message: 'Order simulated successfully.' });
});

let server;
let demoServer;

function startServers() {
  server = app.listen(PORT, () => {
    console.log(`[Netsurf API] Running on http://localhost:${PORT}`);
  });

  demoServer = demoApp.listen(DEMO_PORT, () => {
    console.log(`[Netsurf Demo Site] Running on http://localhost:${DEMO_PORT}`);
  });
}

// Graceful cleanup
async function shutdown() {
  console.log('[Netsurf] Shutting down...');
  if (server) server.close();
  if (demoServer) demoServer.close();
  await closeBrowser();
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  startServers();
}

module.exports = { app, demoApp, startServers, shutdown };
