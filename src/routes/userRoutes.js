const express = require('express');
const router = express.Router();

const users = [];

router.post('/register', (req, res) => {
    const { username, password, name, location, category, interests } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    const existingUser = users.find(user => user.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
    }
    const user = {
        username,
        password,
        isLoggedIn: true,
        profile: {
            name: name || '',
            location: location || '',
            category: category || null,
            interests: interests || []
        },
        subscription: null
    };
    users.push(user);
    console.log('Registered user:', user);
    res.json({ message: 'User registered successfully', user: { username, profile: user.profile } });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(user => user.username === username && user.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    user.isLoggedIn = true;
    res.json({ message: 'Login successful', user: { username, profile: user.profile } });
});

router.post('/update-profile', (req, res) => {
    const { username, profile } = req.body;
    const user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.profile = profile;
    res.json({ message: 'Profile updated', user: { username, profile: user.profile } });
});

module.exports = router;