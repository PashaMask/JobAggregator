const express = require('express');
const router = express.Router();

// Зберігання користувачів у пам'яті
const users = [];

router.post('/register', (req, res) => {
    const { email, password, name, location, experienceLevel, category, employmentType, interests } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
    }
    const user = {
        email,
        password,
        profile: { name, location, experienceLevel, category, employmentType, interests: interests || [] }
    };
    users.push(user);
    console.log('Registered user:', user);
    res.json({ message: 'User registered successfully', user: { email, profile: user.profile } });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(user => user.email === email && user.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ message: 'Login successful', user: { email, profile: user.profile } });
});

router.post('/update-profile', (req, res) => {
    const { email, profile } = req.body;
    const user = users.find(user => user.email === email);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.profile = profile;
    res.json({ message: 'Profile updated', user: { email, profile: user.profile } });
});

module.exports = router;