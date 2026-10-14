'use strict';

const express = require('express');
const db = require('../storage/db');

const router = express.Router();

// GET /api/memory — list all memory records
router.get('/', (req, res) => {
  const records = db.getAllMemory();
  res.json({ memory: records, count: records.length });
});

// GET /api/memory/:id — get a specific memory record
router.get('/:id', (req, res) => {
  const record = db.getMemoryById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Memory record not found.' });
  res.json({ memory: record });
});

// DELETE /api/memory/:id — delete a memory record
router.delete('/:id', (req, res) => {
  const deleted = db.deleteMemory(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Memory record not found.' });
  res.json({ message: 'Memory record deleted.', id: req.params.id });
});

module.exports = router;
