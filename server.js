const express = require('express');
const jobRoutes = require('./src/routes/jobRoutes');
const userRoutes = require('./src/routes/userRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Зберігання користувачів у пам'яті (тимчасово, для демонстрації)
const users = [];

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Додаємо для коректної обробки URL-encoded параметрів

// Ендпоінт для реєстрації
app.post('/api/auth/register', (req, res) => {
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
        password, // У реальному проєкті пароль потрібно хешувати
        profile: { name, location, experienceLevel, category, employmentType, interests: interests || [] }
    };
    users.push(user);
    console.log('Registered user:', user);
    res.json({ message: 'User registered successfully', user: { email, profile: user.profile } });
});

// Ендпоінт для логіну
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(user => user.email === email && user.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ message: 'Login successful', user: { email, profile: user.profile } });
});

// Ендпоінт для оновлення профілю
app.post('/api/auth/update-profile', (req, res) => {
    const { email, profile } = req.body;
    const user = users.find(user => user.email === email);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    user.profile = profile;
    res.json({ message: 'Profile updated', user: { email, profile: user.profile } });
});

// Підключаємо маршрути
app.use('/api/jobs', jobRoutes);
app.use('/api/auth', userRoutes);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});