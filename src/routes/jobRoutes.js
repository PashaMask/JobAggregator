const express = require('express');
const router = express.Router();
const { searchJobs, getRecommendations } = require('../services/jobService');

router.get('/search', async (req, res) => {
    try {
        const query = req.query.query || '';
        const start = parseInt(req.query.start) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const filters = {
            category: req.query.category || undefined,
            location: req.query.location || undefined,
            source: req.query.source || undefined
        };

        console.log('Request query in jobRoutes:', req.query);
        console.log('Filters passed to searchJobs:', filters);

        const jobs = await searchJobs(query, start, limit, filters);
        res.json(jobs);
    } catch (error) {
        console.error('Error in /search:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/recommendations', async (req, res) => {
    try {
        const userProfile = req.body.userProfile || {};
        const start = req.body.start || 0;
        const limit = req.body.limit || 10;

        console.log('Recommendations request body:', req.body);

        const jobs = await getRecommendations(userProfile, start, limit);
        res.json(jobs);
    } catch (error) {
        console.error('Error in /recommendations:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;