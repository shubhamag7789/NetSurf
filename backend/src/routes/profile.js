'use strict';

const express = require('express');
const db = require('../storage/db');

const router = express.Router();

// GET /api/profile — fetch current user profile and saved searches
router.get('/', (req, res) => {
  try {
    const profile = db.getUserProfile();
    const savedSearches = db.getSavedSearches();
    res.json({ profile, savedSearches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile', details: err.message });
  }
});

// POST /api/profile — update profile preferences
router.post('/', (req, res) => {
  try {
    const updated = db.updateUserProfile(req.body);
    res.json({ message: 'Profile updated successfully', profile: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user profile', details: err.message });
  }
});

// POST /api/profile/saved-searches — add a saved search
router.post('/saved-searches', (req, res) => {
  try {
    const { query, intent, criteria } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required.' });
    }
    const saved = db.addSavedSearch(query, intent || 'general', criteria || {});
    res.status(201).json({ message: 'Search saved successfully', savedSearch: saved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save search', details: err.message });
  }
});

// DELETE /api/profile/saved-searches/:id — delete a saved search
router.delete('/saved-searches/:id', (req, res) => {
  try {
    const removed = db.deleteSavedSearch(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Saved search not found.' });
    }
    res.json({ message: 'Saved search deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete saved search', details: err.message });
  }
});

module.exports = router;
