const express = require('express');
const router = express.Router();
const { searchJobs, getRecommendations } = require('../services/jobService');

router.get('/search', async (req, res) => {
    try {
        const query = req.query.query || '';
        const start = parseInt(req.query.start) || 0;
        const limit = parseInt(req.query.limit) || 10;
        const salaryMin = req.query.salaryMin ? parseInt(req.query.salaryMin) : undefined;
        const salaryMax = req.query.salaryMax ? parseInt(req.query.salaryMax) : undefined;

        const filters = {
            category: req.query.category || undefined,
            location: req.query.location || undefined,
            source: req.query.source || undefined,
            salaryMin,
            salaryMax
        };

        console.log('Request query in jobRoutes /search:', req.query);
        console.log('Filters passed to searchJobs:', filters);

        const jobs = await searchJobs(query, start, limit, filters);
        res.json(jobs);
    } catch (error) {
        console.error('Error in /search:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.post('/recommendations', async (req, res) => {
    try {
        const { userProfile, start = 0, limit = 20, salaryMin, salaryMax } = req.body;

        // Валідація параметрів
        if (!userProfile) {
            return res.status(400).json({ error: 'userProfile is required' });
        }

        console.log('Recommendations request body:', req.body);

        const recommendations = await getRecommendations(
            userProfile,
            parseInt(start),
            parseInt(limit),
            salaryMin ? parseInt(salaryMin) : undefined,
            salaryMax ? parseInt(salaryMax) : undefined
        );
        res.json(recommendations);
    } catch (error) {
        console.error('Error in /recommendations:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;