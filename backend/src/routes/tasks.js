'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { generatePlan } = require('../agent/planner');
const { executeTask, stopTask, setProgressListener, removeProgressListener } = require('../agent/executor');
const { saveSuccessfulRun } = require('../agent/memory');
const db = require('../storage/db');

const router = express.Router();

// POST /api/tasks — create and run a new task
router.post('/', async (req, res) => {
  const { userRequest } = req.body;
  if (!userRequest || typeof userRequest !== 'string' || userRequest.trim().length === 0) {
    return res.status(400).json({ error: 'userRequest is required and must be a non-empty string.' });
  }
  if (userRequest.length > 2000) {
    return res.status(400).json({ error: 'userRequest must be 2000 characters or fewer.' });
  }

  const taskId = uuidv4();
  db.createTask(taskId, userRequest.trim());

  try {
    // Generate plan
    db.updateTask(taskId, { status: 'planning' });
    const plan = await generatePlan(userRequest.trim());
    db.updateTask(taskId, { plan, status: 'planned' });

    // Return immediately with task ID and plan
    res.status(201).json({ taskId, status: 'planned', plan });

    // Execute in background (non-blocking)
    executeTask(taskId, plan)
      .then(async (result) => {
        // Auto-save to memory on success
        if (result.status === 'completed') {
          const task = db.getTask(taskId);
          await saveSuccessfulRun(task);
        }
      })
      .catch(err => {
        console.error(`[Routes] Task ${taskId} execution error:`, err);
      });

  } catch (err) {
    db.updateTask(taskId, { status: 'failed', error: err.message });
    res.status(500).json({ error: 'Failed to generate plan.', details: err.message });
  }
});

// GET /api/tasks — list all tasks
router.get('/', (req, res) => {
  const tasks = db.getAllTasks(50);
  res.json({ tasks });
});

// GET /api/tasks/:id — get a specific task
router.get('/:id', (req, res) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const logs = db.getActionLogs(req.params.id);
  res.json({ task, logs });
});

// POST /api/tasks/:id/stop — stop a running task
router.post('/:id/stop', (req, res) => {
  const task = db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  stopTask(req.params.id);
  db.updateTask(req.params.id, { status: 'stopping' });
  res.json({ message: 'Stop signal sent.', taskId: req.params.id });
});

// GET /api/tasks/:id/progress — SSE endpoint for real-time progress
router.get('/:id/progress', (req, res) => {
  const taskId = req.params.id;
  const task = db.getTask(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  });

  const write = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Send current task state immediately
  write({ type: 'current_state', data: { task } });

  setProgressListener(taskId, write);

  // Keep alive ping
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    removeProgressListener(taskId);
  });
});

module.exports = router;
