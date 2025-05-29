const axios = require('axios');
const xml2js = require('xml2js');
const cities = require('cities.json');
const stripHtml = require('strip-html');

// Зіставлення кодів країн із повними назвами для різних API
const locationMap = {
    'us': { fullName: 'United States', adzuna: 'us', jsearch: 'US', jobicy: 'usa', arbeitnow: 'United States', findwork: 'United States' },
    'gb': { fullName: 'United Kingdom', adzuna: 'gb', jsearch: 'GB', jobicy: 'uk', arbeitnow: 'United Kingdom', findwork: 'United Kingdom' },
    'za': { fullName: 'South Africa', adzuna: 'za', jsearch: 'ZA', jobicy: 'south-africa', arbeitnow: 'South Africa', findwork: 'South Africa' },
    'ca': { fullName: 'Canada', adzuna: 'ca', jsearch: 'CA', jobicy: 'canada', arbeitnow: 'Canada', findwork: 'Canada' },
    'sg': { fullName: 'Singapore', adzuna: 'sg', jsearch: 'SG', jobicy: 'singapore', arbeitnow: 'Singapore', findwork: 'Singapore' },
    'in': { fullName: 'India', adzuna: 'in', jsearch: 'IN', jobicy: 'india', arbeitnow: 'India', findwork: 'India' },
    'au': { fullName: 'Australia', adzuna: 'au', jsearch: 'AU', jobicy: 'australia', arbeitnow: 'Australia', findwork: 'Australia' },
    'de': { fullName: 'Germany', adzuna: 'de', jsearch: 'DE', jobicy: 'germany', arbeitnow: 'Germany', findwork: 'Germany' },
    'fr': { fullName: 'France', adzuna: 'fr', jsearch: 'FR', jobicy: 'france', arbeitnow: 'France', findwork: 'France' },
    'nl': { fullName: 'Netherlands', adzuna: 'nl', jsearch: 'NL', jobicy: 'netherlands', arbeitnow: 'Netherlands', findwork: 'Netherlands' },
    'it': { fullName: 'Italy', adzuna: 'it', jsearch: 'IT', jobicy: 'italy', arbeitnow: 'Italy', findwork: 'Italy' },
    'es': { fullName: 'Spain', adzuna: 'es', jsearch: 'ES', jobicy: 'spain', arbeitnow: 'Spain', findwork: 'Spain' },
    'be': { fullName: 'Belgium', adzuna: 'be', jsearch: 'BE', jobicy: 'belgium', arbeitnow: 'Belgium', findwork: 'Belgium' },
    'at': { fullName: 'Austria', adzuna: 'at', jsearch: 'AT', jobicy: 'austria', arbeitnow: 'Austria', findwork: 'Austria' },
};

// Простий кеш для запитів
const cache = new Map();

// Функція для визначення країни за містом із використанням cities.json
function inferCountryFromCity(location) {
    if (!location) return null;
    const normalizedLocation = location.toLowerCase().split(',')[0].trim();
    const city = cities.find(c => c.name.toLowerCase() === normalizedLocation);
    if (city) {
        const countryCode = city.country.toLowerCase();
        return locationMap[countryCode]?.fullName || null;
    }
    return null;
}

// Функція для нормалізації локації вакансії
function normalizeLocation(jobLocation, jobCountry) {
    let country = jobCountry;
    let location = jobLocation || 'Unknown';

    if (!country && location !== 'Unknown') {
        country = inferCountryFromCity(location);
    }

    if (!country) {
        const locationLower = location.toLowerCase();
        const foundCountry = Object.values(locationMap).find(loc =>
            locationLower.includes(loc.fullName.toLowerCase()) ||
            locationLower.includes(loc.adzuna.toLowerCase()) ||
            locationLower.includes(loc.jsearch.toLowerCase()) ||
            locationLower.includes(loc.jobicy.toLowerCase()) ||
            locationLower.includes(loc.arbeitnow.toLowerCase()) ||
            locationLower.includes(loc.findwork.toLowerCase())
        );
        if (foundCountry) {
            country = foundCountry.fullName;
        }
    }

    return { location, country: country || 'Unknown' };
}

// Функція для нормалізації зарплати
function normalizeSalary(salary) {
    if (!salary || salary === 'Not specified') return { display: 'Not specified', value: 0 };

    // Видаляємо символи валюти та пробіли
    const cleanedSalary = salary.replace(/[^0-9-]/g, '');
    if (!cleanedSalary) return { display: salary, value: 0 };

    // Якщо це діапазон (наприклад, "20000-30000")
    if (cleanedSalary.includes('-')) {
        const [min, max] = cleanedSalary.split('-').map(val => parseInt(val) || 0);
        return { display: `$${min} - $${max}`, value: min };
    }

    // Якщо це одне значення
    const value = parseInt(cleanedSalary) || 0;
    return { display: `$${value}`, value };
}

// Функція для пошуку вакансій через Adzuna
async function searchAdzuna(query, start, limit, filters) {
    console.log('Calling searchAdzuna with query:', query);
    console.log('Adzuna filters:', filters);
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
        throw new Error('Adzuna app_id or app_key is missing');
    }

    const categoryMap = {
        'it': 'it-jobs',
        'education': 'teaching-jobs',
        'healthcare': 'healthcare-nursing-jobs',
        'finance': 'accounting-finance-jobs',
        'other': 'unknown'
    };
    const adzunaCategory = filters.category ? categoryMap[filters.category.toLowerCase()] : null;

    let url = `https://api.adzuna.com/v1/api/jobs/gb/search/${Math.floor(start / limit) + 1}?app_id=${appId}&app_key=${appKey}&results_per_page=${limit}`;
    if (query) url += `&what=${encodeURIComponent(query)}`;
    if (adzunaCategory) url += `&category=${adzunaCategory}`;
    if (filters.location) {
        const adzunaLocation = locationMap[filters.location]?.adzuna || 'gb';
        url = url.replace('jobs/gb', `jobs/${encodeURIComponent(adzunaLocation)}`);
    }
    // Перевірка параметра remote: Adzuna може не підтримувати прямий параметр, тому додаємо ключове слово "remote" до запиту
    if (filters.remote !== undefined) {
        if (filters.remote) {
            url += `&what=${encodeURIComponent('remote')}`; // Додаємо "remote" до пошуку
        } else {
            // Для "On-site Only" можна спробувати виключити "remote", але це залежить від API
            url += `&what=-${encodeURIComponent('remote')}`; // Виключаємо "remote" із результатів
        }
    }

    const cacheKey = `adzuna:${url}`;
    if (cache.has(cacheKey)) {
        console.log('Returning cached Adzuna jobs');
        return cache.get(cacheKey);
    }

    console.log('Adzuna URL:', url);

    try {
        const response = await axios.get(url);
        let jobs = response.data.results || [];

        console.log('Adzuna raw jobs:', jobs.length);

        // Нормалізація локацій та визначення isRemote
        jobs = jobs.map(job => {
            const { location, country } = normalizeLocation(job.location?.display_name, job.location?.area?.[0]);
            const isRemote = job.location?.display_name?.toLowerCase().includes('remote') ||
                job.description?.toLowerCase().includes('remote') ||
                (filters.remote === true); // Додаємо перевірку description
            console.log(`Job ${job.id}: Location=${job.location?.display_name}, isRemote=${isRemote}`); // Логування для налагодження
            return { ...job, normalizedLocation: location, normalizedCountry: country, isRemote };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.fullName?.toLowerCase();
            jobs = jobs.filter(job => {
                const location = job.normalizedLocation?.toLowerCase() || '';
                const country = job.normalizedCountry?.toLowerCase() || '';
                return country === expectedLocation || location.includes(expectedLocation);
            });
        }

        // Додаткова фільтрація за remote (якщо API не фільтрує коректно)
        if (filters.remote === true) {
            jobs = jobs.filter(job => job.isRemote);
        } else if (filters.remote === false) {
            jobs = jobs.filter(job => !job.isRemote);
        }

        const mappedJobs = jobs.map(job => {
            const salaryInfo = normalizeSalary(job.salary_min ? `${job.salary_min}-${job.salary_max}` : 'Not specified');
            return {
                Id: job.id,
                Title: job.title,
                Company: job.company.display_name,
                Location: job.normalizedLocation,
                Country: job.normalizedCountry,
                Description: job.description,
                Salary: salaryInfo.display,
                SalaryValue: salaryInfo.value,
                DatePosted: job.created,
                Source: 'Adzuna',
                Category: job.category?.label || 'Unknown',
                JobUrl: job.redirect_url || 'Not available',
                isRemote: job.isRemote || false
            };
        });

        console.log('Adzuna returned jobs:', mappedJobs.length);
        cache.set(cacheKey, mappedJobs);
        return mappedJobs;
    } catch (error) {
        console.error('Adzuna error:', error.message);
        return [];
    }
}

// Функція для пошуку вакансій через JSearch
async function searchJSearch(query, start, limit, filters) {
    console.log('Calling searchJSearch with query:', query);
    console.log('JSearch filters:', filters);
    let url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query || 'developer')}&page=${Math.floor(start / limit) + 1}&num_pages=1`;
    if (filters.location) {
        const jsearchLocation = locationMap[filters.location]?.jsearch || filters.location;
        url += `&location=${encodeURIComponent(jsearchLocation)}`;
    }
    if (filters.category) {
        url += `&category=${encodeURIComponent(filters.category.toLowerCase())}`;
    }
    if (filters.remote !== undefined) {
        url += `&remote_jobs_only=${filters.remote}`; // JSearch: true для віддаленої, false для невіддаленої
    }

    const cacheKey = `jsearch:${url}`;
    if (cache.has(cacheKey)) {
        console.log('Returning cached JSearch jobs');
        return cache.get(cacheKey);
    }

    console.log('JSearch URL:', url);

    try {
        const response = await axios.get(url, {
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
            },
        });
        let jobs = response.data.data || [];

        console.log('JSearch raw jobs:', jobs.length);

        // Нормалізація локацій та визначення isRemote
        jobs = jobs.map(job => {
            const locationStr = job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || 'Unknown';
            const { location, country } = normalizeLocation(locationStr, job.job_country);
            const isRemote = job.job_is_remote || filters.remote === true;
            return { ...job, normalizedLocation: location, normalizedCountry: country, isRemote };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedCountryCode = locationMap[filters.location]?.jsearch?.toLowerCase();
            const expectedCountryName = locationMap[filters.location]?.fullName?.toLowerCase();
            jobs = jobs.filter(job => {
                const country = job.normalizedCountry?.toLowerCase() || '';
                const countryCode = job.job_country?.toLowerCase() || '';
                return countryCode === expectedCountryCode || country === expectedCountryName;
            });
        }

        // Фільтрація за категорією
        if (filters.category) {
            jobs = jobs.filter(job => job.job_employment_type?.toLowerCase().includes(filters.category.toLowerCase()) ||
                job.job_title?.toLowerCase().includes(filters.category.toLowerCase()));
        }

        const mappedJobs = jobs.map(job => {
            const salaryInfo = normalizeSalary(job.job_salary ? `${job.job_salary}` : 'Not specified');
            return {
                Id: job.job_id,
                Title: job.job_title,
                Company: job.employer_name,
                Location: job.normalizedLocation,
                Country: job.normalizedCountry,
                Description: job.job_description,
                Salary: salaryInfo.display,
                SalaryValue: salaryInfo.value,
                DatePosted: job.job_posted_at_datetime_utc,
                Source: 'JSearch',
                Category: job.job_employment_type || job.job_title || 'Unknown',
                JobUrl: job.job_apply_link || 'Not available',
                isRemote: job.isRemote || false
            };
        });

        console.log('JSearch returned jobs:', mappedJobs.length);
        cache.set(cacheKey, mappedJobs);
        return mappedJobs;
    } catch (error) {
        console.error('JSearch error:', error.message);
        return [];
    }
}

// Функція для пошуку вакансій через Jobicy
async function searchJobicy(query, start, limit, filters) {
    console.log('Calling searchJobicy with query:', query);
    console.log('Jobicy filters:', filters);
    const categoryMap = {
        'it': 'dev',
        'education': 'supporting',
        'healthcare': 'supporting',
        'finance': 'accounting-finance',
        'other': null
    };
    const jobicyCategory = filters.category ? categoryMap[filters.category.toLowerCase()] : null;

    let url = `https://jobicy.com/?feed=job_feed`;
    if (query) url += `&search_keywords=${encodeURIComponent(query)}`;
    if (filters.location) {
        const jobicyRegion = locationMap[filters.location]?.jobicy || filters.location;
        url += `&search_region=${encodeURIComponent(jobicyRegion)}`;
    }
    if (jobicyCategory) url += `&job_categories=${encodeURIComponent(jobicyCategory)}`;

    const cacheKey = `jobicy:${url}`;
    if (cache.has(cacheKey)) {
        console.log('Returning cached Jobicy jobs');
        return cache.get(cacheKey);
    }

    console.log('Jobicy URL:', url);

    try {
        const response = await axios.get(url);
        const xml = response.data;

        const result = await xml2js.parseStringPromise(xml);
        let items = result.rss.channel[0].item || [];

        console.log('Jobicy raw jobs:', items.length);

        // Нормалізація локацій та визначення isRemote
        items = items.map(item => {
            const locationStr = item['job:location']?.[0] || 'Remote';
            const { location, country } = normalizeLocation(locationStr, null);
            const isRemote = locationStr.toLowerCase().includes('remote') || true; // Jobicy — усі вакансії віддалені
            return { ...item, normalizedLocation: location, normalizedCountry: country, isRemote };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.fullName?.toLowerCase();
            const expectedJobicyCode = locationMap[filters.location]?.jobicy?.toLowerCase();
            items = items.filter(item => {
                const location = item.normalizedLocation?.toLowerCase() || 'remote';
                const country = item.normalizedCountry?.toLowerCase() || 'unknown';
                return country === expectedLocation || location.includes(expectedLocation) ||
                    location.includes(expectedJobicyCode) || location === 'remote';
            });
        }

        // Фільтрація за категорією
        if (filters.category) {
            const expectedCategory = categoryMap[filters.category.toLowerCase()];
            items = items.filter(item => item.category?.[0]?.toLowerCase().includes(expectedCategory));
        }

        // Фільтрація за remote (тільки якщо remote === false, оскільки Jobicy — усі віддалені)
        if (filters.remote === false) {
            items = items.filter(item => !item.isRemote);
        }

        const mappedJobs = items.map(item => {
            const salaryInfo = normalizeSalary('Not specified'); // Jobicy не надає зарплату
            return {
                Id: item.guid?.[0] || 'unknown',
                Title: item.title?.[0] || 'No title',
                Company: item['itunes:author']?.[0] || 'Unknown',
                Location: item.normalizedLocation,
                Country: item.normalizedCountry,
                Description: item.description?.[0] || 'No description',
                Salary: salaryInfo.display,
                SalaryValue: salaryInfo.value,
                DatePosted: item.pubDate?.[0] || 'Unknown',
                Source: 'Jobicy',
                Category: item.category?.[0] || 'Unknown',
                JobUrl: item.link?.[0] || 'Not available',
                isRemote: item.isRemote || false
            };
        });

        console.log('Jobicy returned jobs:', mappedJobs.length);
        cache.set(cacheKey, mappedJobs);
        return mappedJobs;
    } catch (error) {
        console.error('Jobicy error:', error.message);
        return [];
    }
}

// Функція для пошуку вакансій через Arbeitnow
async function searchArbeitnow(query, start, limit, filters) {
    console.log('Calling searchArbeitnow with query:', query);
    console.log('Arbeitnow filters:', filters);
    const page = Math.floor(start / limit) + 1;
    let url = `https://arbeitnow.com/api/job-board-api?page=${page}&per_page=${limit}`;
    if (query) url += `&search=${encodeURIComponent(query)}`;
    if (filters.location) {
        const arbeitnowLocation = locationMap[filters.location]?.arbeitnow || filters.location;
        url += `&location=${encodeURIComponent(arbeitnowLocation)}`;
    }
    if (filters.remote !== undefined) {
        url += `&remote=${filters.remote}`;
    }

    const cacheKey = `arbeitnow:${url}`;
    cache.clear(); // Очищаємо кеш для тестування
    // if (cache.has(cacheKey)) {
    //     console.log('Returning cached Arbeitnow jobs');
    //     return cache.get(cacheKey);
    // }

    console.log('Arbeitnow URL:', url);

    try {
        const response = await axios.get(url);
        let jobs = response.data.data || [];

        console.log('Arbeitnow raw jobs:', jobs.length);

        // Нормалізація локацій та визначення isRemote
        jobs = jobs.map(job => {
            const { location, country } = normalizeLocation(job.location, null);
            const isRemote = job.remote || filters.remote === true;
            return { ...job, normalizedLocation: location, normalizedCountry: country, isRemote };
        });

        // Фільтрація за категорією
        if (filters.category) {
            jobs = jobs.filter(job => job.tags.some(tag => tag.toLowerCase().includes(filters.category.toLowerCase())));
        }

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.arbeitnow?.toLowerCase();
            const expectedCountryName = locationMap[filters.location]?.fullName?.toLowerCase();
            jobs = jobs.filter(job => {
                const location = job.normalizedLocation?.toLowerCase() || '';
                const country = job.normalizedCountry?.toLowerCase() || '';
                return country === expectedCountryName || location.includes(expectedLocation);
            });
        }

        const mappedJobs = jobs.map(job => {
            const salaryInfo = normalizeSalary('Not specified'); // Arbeitnow не надає зарплату
            const descriptionSource = job.description || '';
            console.log('Arbeitnow job description:', job.description);
            // Використовуємо регулярний вираз для видалення HTML-тегів
            const cleanDescription = descriptionSource
                .replace(/<[^>]+>/g, '') // Видаляємо HTML-теги
                .replace(/<!--[\s\S]*?-->/g, '') // Видаляємо HTML-коментарі
                .trim() || 'No description';
            console.log('Arbeitnow cleaned description:', cleanDescription);
            return {
                Id: job.slug,
                Title: job.title,
                Company: job.company_name,
                Location: job.normalizedLocation,
                Country: job.normalizedCountry,
                Description: cleanDescription,
                Salary: salaryInfo.display,
                SalaryValue: salaryInfo.value,
                DatePosted: new Date(job.created_at * 1000).toISOString(),
                Source: 'Arbeitnow',
                Category: job.tags[0] || 'Unknown',
                JobUrl: job.url || 'Not available',
                isRemote: job.isRemote || false
            };
        });

        console.log('Arbeitnow returned jobs:', mappedJobs.length);
        cache.set(cacheKey, mappedJobs);
        return mappedJobs;
    } catch (error) {
        console.error('Arbeitnow error:', error.message);
        return [];
    }
}

// Функція для пошуку вакансій через FindWork
async function searchFindWork(query, start, limit, filters) {
    console.log('Calling searchFindWork with query:', query);
    console.log('FindWork filters:', filters);
    const apiKey = process.env.FINDWORK_API_KEY;
    if (!apiKey) {
        throw new Error('FindWork API key is missing');
    }

    const page = Math.floor(start / limit) + 1;
    let url = `https://findwork.dev/api/jobs/?page=${page}`;

    let searchQuery = query || '';
    if (filters.category) {
        const categoryMap = {
            'it': 'developer',
            'education': 'education',
            'healthcare': 'healthcare',
            'finance': 'finance',
            'other': ''
        };
        const findWorkCategory = categoryMap[filters.category.toLowerCase()] || '';
        searchQuery = searchQuery ? `${searchQuery} ${findWorkCategory}` : findWorkCategory;
    }
    if (searchQuery) url += `&search=${encodeURIComponent(searchQuery.trim())}&sort_by=relevance`;

    if (filters.location) {
        const findWorkLocation = locationMap[filters.location]?.findwork || locationMap[filters.location]?.fullName || filters.location;
        url += `&location=${encodeURIComponent(findWorkLocation)}`;
    }
    if (filters.remote !== undefined) {
        url += `&remote=${filters.remote}`;
    }

    const cacheKey = `findwork:${url}`;
    cache.clear(); // Очищаємо кеш для тестування
    // if (cache.has(cacheKey)) {
    //     console.log('Returning cached FindWork jobs');
    //     return cache.get(cacheKey);
    // }

    console.log('FindWork URL:', url);

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Token ${apiKey}`
            }
        });
        let jobs = response.data.results || [];

        console.log('FindWork raw jobs:', jobs.length);
        if (jobs.length > 0) {
            console.log('Sample FindWork job data:', JSON.stringify(jobs.slice(0, 2), null, 2));
        }

        // Нормалізація локацій та визначення isRemote
        jobs = jobs.map(job => {
            const locationStr = job.location || (job.remote ? 'Remote' : 'Unknown');
            const { location, country } = normalizeLocation(locationStr, null);
            const isRemote = job.remote || filters.remote === true;
            return { ...job, normalizedLocation: location, normalizedCountry: country, isRemote };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.fullName?.toLowerCase();
            const expectedFindWorkCode = locationMap[filters.location]?.findwork?.toLowerCase();
            jobs = jobs.filter(job => {
                const location = job.normalizedLocation?.toLowerCase() || '';
                const country = job.normalizedCountry?.toLowerCase() || '';
                return country === expectedLocation || location.includes(expectedFindWorkCode) || (job.remote && location === 'remote');
            });
        }

        const mappedJobs = jobs.map(job => {
            const salaryInfo = normalizeSalary(job.salary || 'Not specified');
            const descriptionSource = job.description || job.text || '';
            console.log('FindWork job description/text:', { description: job.description, text: job.text });
            // Використовуємо регулярний вираз для видалення HTML-тегів
            const cleanDescription = descriptionSource
                .replace(/<[^>]+>/g, '') // Видаляємо HTML-теги
                .replace(/<!--[\s\S]*?-->/g, '') // Видаляємо HTML-коментарі
                .trim() || 'No description';
            console.log('FindWork cleaned description:', cleanDescription);
            return {
                Id: job.id.toString(),
                Title: job.role,
                Company: job.company_name,
                Location: job.normalizedLocation,
                Country: job.normalizedCountry,
                Description: cleanDescription,
                Salary: salaryInfo.display,
                SalaryValue: salaryInfo.value,
                DatePosted: job.date_posted,
                Source: 'FindWork',
                Category: job.category || 'Unknown',
                JobUrl: job.url || 'Not available',
                isRemote: job.isRemote || false
            };
        });

        console.log('FindWork returned jobs:', mappedJobs.length);
        cache.set(cacheKey, mappedJobs);
        return mappedJobs;
    } catch (error) {
        console.error('FindWork error:', error.message);
        return [];
    }
}

// Основна функція для пошуку вакансій
async function searchJobs(query, start, limit, filters) {
    console.log('Filters received in searchJobs:', filters);

    const sources = filters.source ? filters.source.split(',').map(s => s.trim()) : null;
    const allSources = ['Adzuna', 'JSearch', 'Jobicy', 'Arbeitnow', 'FindWork'];
    const selectedSources = sources && !sources.includes('All') ? sources : allSources;

    const { salaryMin, salaryMax, remote } = filters;

    console.log('Sources parsed:', sources);
    console.log('Selected sources:', selectedSources);

    let adzunaJobs = [];
    let jsearchJobs = [];
    let jobicyJobs = [];
    let arbeitnowJobs = [];
    let findWorkJobs = [];

    if (selectedSources.includes('Adzuna')) {
        adzunaJobs = await searchAdzuna(query, 0, limit * 2, filters).catch(err => {
            console.error('Adzuna error:', err.message);
            return [];
        });
    } else {
        console.log('Skipping Adzuna: not in selected sources');
    }

    if (selectedSources.includes('JSearch')) {
        jsearchJobs = await searchJSearch(query, 0, limit * 2, filters).catch(err => {
            console.error('JSearch error:', err.message);
            return [];
        });
    } else {
        console.log('Skipping JSearch: not in selected sources');
    }

    if (selectedSources.includes('Jobicy')) {
        jobicyJobs = await searchJobicy(query, 0, limit * 2, filters).catch(err => {
            console.error('Jobicy error:', err.message);
            return [];
        });
    } else {
        console.log('Skipping Jobicy: not in selected sources');
    }

    if (selectedSources.includes('Arbeitnow')) {
        arbeitnowJobs = await searchArbeitnow(query, 0, limit * 2, filters).catch(err => {
            console.error('Arbeitnow error:', err.message);
            return [];
        });
    } else {
        console.log('Skipping Arbeitnow: not in selected sources');
    }

    if (selectedSources.includes('FindWork')) {
        findWorkJobs = await searchFindWork(query, 0, limit * 2, filters).catch(err => {
            console.error('FindWork error:', err.message);
            return [];
        });
    } else {
        console.log('Skipping FindWork: not in selected sources');
    }

    const jobLists = [
        { source: 'Adzuna', jobs: adzunaJobs },
        { source: 'JSearch', jobs: jsearchJobs },
        { source: 'Jobicy', jobs: jobicyJobs },
        { source: 'Arbeitnow', jobs: arbeitnowJobs },
        { source: 'FindWork', jobs: findWorkJobs }
    ].filter(list => selectedSources.includes(list.source) && list.jobs.length > 0);

    console.log('Job lists after filtering:', jobLists.map(list => ({ source: list.source, jobCount: list.jobs.length })));

    let interleavedJobs = [];
    let indices = jobLists.map(() => 0);
    while (interleavedJobs.length < (start + limit)) {
        let addedThisRound = false;
        for (let i = 0; i < jobLists.length; i++) {
            const list = jobLists[i];
            const index = indices[i];
            if (index < list.jobs.length) {
                if (interleavedJobs.length >= start) {
                    interleavedJobs.push(list.jobs[index]);
                } else {
                    interleavedJobs.push(null);
                }
                indices[i]++;
                addedThisRound = true;
            }
        }
        if (!addedThisRound) break;
    }

    let finalJobs = interleavedJobs.filter(job => job != null);

    // Фільтрація за зарплатою
    if (salaryMin || salaryMax) {
        const min = salaryMin ? parseInt(salaryMin) : 0;
        const max = salaryMax ? parseInt(salaryMax) : Infinity;
        finalJobs = finalJobs.filter(job => {
            const salaryValue = job.SalaryValue || 0;
            return salaryValue >= min && salaryValue <= max;
        });
    }

    // Фільтрація за remote (додаткова перевірка на рівні результатів)
    if (remote === true) {
        finalJobs = finalJobs.filter(job => job.isRemote);
    } else if (remote === false) {
        finalJobs = finalJobs.filter(job => !job.isRemote);
    }

    finalJobs = finalJobs.slice(0, limit);
    console.log('Final jobs returned:', finalJobs.length);
    console.log('Sources in final jobs:', [...new Set(finalJobs.map(job => job.Source))]);
    return finalJobs;
}

// Функція для рекомендацій на основі профілю користувача
async function getRecommendations(userProfile, start, limit, salaryMin, salaryMax) {
    const query = userProfile.interests?.join(' ') || 'developer';
    const filters = {
        category: userProfile.category,
        location: userProfile.location,
        source: 'All',
        salaryMin,
        salaryMax,
        remote: undefined // Рекомендації не фільтрують за remote за замовчуванням
    };
    const recommendedJobs = await searchJobs(query, start, limit, filters);

    // Сортуємо вакансії за релевантністю (кількість збігів із інтересами)
    const interests = userProfile.interests || [];
    return recommendedJobs.sort((a, b) => {
        const aMatches = interests.filter(interest =>
            a.Title.toLowerCase().includes(interest.toLowerCase()) ||
            a.Description.toLowerCase().includes(interest.toLowerCase())
        ).length;
        const bMatches = interests.filter(interest =>
            b.Title.toLowerCase().includes(interest.toLowerCase()) ||
            b.Description.toLowerCase().includes(interest.toLowerCase())
        ).length;
        return bMatches - aMatches;
    });
}

module.exports = { searchJobs, getRecommendations };