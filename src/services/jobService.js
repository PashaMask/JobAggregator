const axios = require('axios');
const xml2js = require('xml2js');
const cities = require('cities.json');

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
            locationLower.includes(loc.jsearch.toLowerCase())
        );
        if (foundCountry) {
            country = foundCountry.fullName;
        }
    }

    return { location, country: country || 'Unknown' };
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
    if (filters.employmentType) {
        if (filters.employmentType === 'full_time') url += `&full_time=1`;
        if (filters.employmentType === 'part_time') url += `&part_time=1`;
        if (filters.employmentType === 'contract') url += `&contract=1`;
        if (filters.employmentType === 'temporary') url += `&temporary=1`;
    }

    console.log('Adzuna URL:', url);

    try {
        const response = await axios.get(url);
        let jobs = response.data.results || [];

        console.log('Adzuna raw jobs:', jobs.length);

        // Нормалізація локацій
        jobs = jobs.map(job => {
            const { location, country } = normalizeLocation(job.location?.display_name, job.location?.area?.[0]);
            return { ...job, normalizedLocation: location, normalizedCountry: country };
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

        // Фільтрація за рівнем досвіду (Adzuna не підтримує прямий запит, тому фільтруємо на стороні клієнта)
        if (filters.experienceLevel) {
            const experience = parseInt(filters.experienceLevel);
            jobs = jobs.filter(job => {
                const level = job.experience_level?.toLowerCase() || 'unknown';
                if (experience <= 2) return level === 'entry';
                if (experience <= 5) return level === 'associate';
                return level === 'mid-senior' || level === 'senior';
            });
        }

        const mappedJobs = jobs.map(job => ({
            Id: job.id,
            Title: job.title,
            Company: job.company.display_name,
            Location: job.normalizedLocation,
            Country: job.normalizedCountry,
            Description: job.description,
            Salary: job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : 'Not specified',
            DatePosted: job.created,
            Source: 'Adzuna',
            Category: job.category?.label || 'Unknown',
            EmploymentType: job.contract_type || 'Unknown',
            ExperienceLevel: job.experience_level || 'Unknown',
        }));

        console.log('Adzuna returned jobs:', mappedJobs.length);
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
        url += `&location=${jsearchLocation}`;
    }
    if (filters.employmentType) {
        const jsearchEmploymentType = filters.employmentType.toUpperCase(); // JSearch очікує значення типу "FULLTIME", "PARTTIME", "CONTRACTOR"
        url += `&employment_types=${jsearchEmploymentType}`;
    }
    if (filters.experienceLevel) {
        let jsearchExperienceLevel;
        const experience = parseInt(filters.experienceLevel);
        if (experience <= 2) jsearchExperienceLevel = 'ENTRY_LEVEL';
        else if (experience <= 5) jsearchExperienceLevel = 'MID_LEVEL';
        else jsearchExperienceLevel = 'SENIOR_LEVEL';
        url += `&experience=${jsearchExperienceLevel}`;
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

        // Нормалізація локацій
        jobs = jobs.map(job => {
            const locationStr = job.job_city ? `${job.job_city}, ${job.job_country}` : job.job_country || 'Unknown';
            const { location, country } = normalizeLocation(locationStr, job.job_country);
            return { ...job, normalizedLocation: location, normalizedCountry: country };
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
            jobs = jobs.filter(job => job.job_category?.toLowerCase().includes(filters.category.toLowerCase()));
        }

        const mappedJobs = jobs.map(job => ({
            Id: job.job_id,
            Title: job.job_title,
            Company: job.employer_name,
            Location: job.normalizedLocation,
            Country: job.normalizedCountry,
            Description: job.job_description,
            Salary: job.job_salary ? `$${job.job_salary}` : 'Not specified',
            DatePosted: job.job_posted_at_datetime_utc,
            Source: 'JSearch',
            Category: job.job_category || 'Unknown',
            EmploymentType: job.job_employment_type || 'Unknown',
            ExperienceLevel: job.job_required_experience || 'Unknown',
        }));

        console.log('JSearch returned jobs:', mappedJobs.length);
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
    if (filters.employmentType) url += `&job_types=${encodeURIComponent(filters.employmentType.replace('_', '-'))}`;

    console.log('Jobicy URL:', url);

    try {
        const response = await axios.get(url);
        const xml = response.data;

        const result = await xml2js.parseStringPromise(xml);
        let items = result.rss.channel[0].item || [];

        console.log('Jobicy raw jobs:', items.length);

        // Нормалізація локацій
        items = items.map(item => {
            const locationStr = item['job:location']?.[0] || 'Remote';
            const { location, country } = normalizeLocation(locationStr, null);
            return { ...item, normalizedLocation: location, normalizedCountry: country };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.fullName?.toLowerCase();
            items = items.filter(item => {
                const location = item.normalizedLocation?.toLowerCase() || 'remote';
                const country = item.normalizedCountry?.toLowerCase() || 'unknown';
                return country === expectedLocation || location.includes(expectedLocation) || location === 'remote';
            });
        }

        // Фільтрація за рівнем досвіду (Jobicy не підтримує прямий запит, тому фільтруємо на стороні клієнта)
        if (filters.experienceLevel) {
            const experience = parseInt(filters.experienceLevel);
            items = items.filter(item => {
                const level = item['job:experience']?.[0]?.toLowerCase() || 'unknown';
                if (experience <= 2) return level === 'entry';
                if (experience <= 5) return level === 'mid';
                return level === 'senior';
            });
        }

        const mappedJobs = items.map(item => ({
            Id: item.guid?.[0] || 'unknown',
            Title: item.title?.[0] || 'No title',
            Company: item['itunes:author']?.[0] || 'Unknown',
            Location: item.normalizedLocation,
            Country: item.normalizedCountry,
            Description: item.description?.[0] || 'No description',
            Salary: 'Not specified',
            DatePosted: item.pubDate?.[0] || 'Unknown',
            Source: 'Jobicy',
            Category: item.category?.[0] || 'Unknown',
            EmploymentType: item['job:type']?.[0] || 'Unknown',
            ExperienceLevel: item['job:experience']?.[0] || 'Unknown',
        }));

        console.log('Jobicy returned jobs:', mappedJobs.length);
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
    if (filters.employmentType) {
        const arbeitnowEmploymentType = filters.employmentType.replace('_', ' '); // Arbeitnow очікує значення типу "full time", "part time"
        url += `&job_types=${encodeURIComponent(arbeitnowEmploymentType)}`;
    }

    console.log('Arbeitnow URL:', url);

    try {
        const response = await axios.get(url);
        let jobs = response.data.data || [];

        console.log('Arbeitnow raw jobs:', jobs.length);

        // Нормалізація локацій
        jobs = jobs.map(job => {
            const { location, country } = normalizeLocation(job.location, null);
            return { ...job, normalizedLocation: location, normalizedCountry: country };
        });

        // Фільтрація за категорією
        if (filters.category) {
            jobs = jobs.filter(job => job.tags.some(tag => tag.toLowerCase().includes(filters.category.toLowerCase())));
        }

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.arbeitnow?.toLowerCase();
            jobs = jobs.filter(job => {
                const location = job.normalizedLocation?.toLowerCase() || '';
                const country = job.normalizedCountry?.toLowerCase() || '';
                return country === expectedLocation || location.includes(expectedLocation);
            });
        }

        // Фільтрація за рівнем досвіду (Arbeitnow не підтримує прямий запит, тому фільтруємо на стороні клієнта)
        if (filters.experienceLevel) {
            const experience = parseInt(filters.experienceLevel);
            jobs = jobs.filter(job => {
                const level = job.job_types.find(type => ['entry', 'associate', 'mid-senior'].includes(type.toLowerCase()))?.toLowerCase();
                if (!level) return true;
                if (experience <= 2) return level === 'entry';
                if (experience <= 5) return level === 'associate';
                return level === 'mid-senior';
            });
        }

        const mappedJobs = jobs.map(job => ({
            Id: job.slug,
            Title: job.title,
            Company: job.company_name,
            Location: job.normalizedLocation,
            Country: job.normalizedCountry,
            Description: job.description,
            Salary: 'Not specified',
            DatePosted: new Date(job.created_at * 1000).toISOString(),
            Source: 'Arbeitnow',
            Category: job.tags[0] || 'Unknown',
            EmploymentType: job.job_types.find(type => ['full time', 'part time', 'contract', 'internship'].includes(type.toLowerCase())) || 'Unknown',
            ExperienceLevel: job.job_types.find(type => ['entry', 'associate', 'mid-senior'].includes(type.toLowerCase())) || 'Unknown',
        }));

        console.log('Arbeitnow returned jobs:', mappedJobs.length);
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

    if (filters.employmentType) {
        url += `&remote=${filters.employmentType === 'remote' ? 'true' : 'false'}`;
    }

    if (filters.experienceLevel) {
        let findWorkExperienceLevel;
        const experience = parseInt(filters.experienceLevel);
        if (experience <= 2) findWorkExperienceLevel = 'entry';
        else if (experience <= 5) findWorkExperienceLevel = 'mid';
        else findWorkExperienceLevel = 'senior';
        url += `&experience=${findWorkExperienceLevel}`;
    }

    console.log('FindWork URL:', url);

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Token ${apiKey}`
            }
        });
        let jobs = response.data.results || [];

        console.log('FindWork raw jobs:', jobs.length);

        // Нормалізація локацій
        jobs = jobs.map(job => {
            const locationStr = job.location || (job.remote ? 'Remote' : 'Unknown');
            const { location, country } = normalizeLocation(locationStr, null);
            return { ...job, normalizedLocation: location, normalizedCountry: country };
        });

        // Фільтрація за локацією
        if (filters.location) {
            const expectedLocation = locationMap[filters.location]?.fullName?.toLowerCase();
            jobs = jobs.filter(job => {
                const location = job.normalizedLocation?.toLowerCase() || '';
                const country = job.normalizedCountry?.toLowerCase() || '';
                return country === expectedLocation || location.includes(expectedLocation) || (job.remote && location === 'remote');
            });
        }

        // Фільтрація за типом зайнятості (додаткова, якщо API не обробив коректно)
        if (filters.employmentType && filters.employmentType !== 'remote') {
            jobs = jobs.filter(job => {
                const employmentType = job.employment_type?.toLowerCase() || 'unknown';
                return employmentType.includes(filters.employmentType.toLowerCase());
            });
        }

        // Фільтрація за рівнем досвіду (додаткова, якщо API не обробив коректно)
        if (filters.experienceLevel) {
            const experience = parseInt(filters.experienceLevel);
            jobs = jobs.filter(job => {
                const level = job.experience_level?.toLowerCase() || 'unknown';
                if (experience <= 2) return level === 'entry';
                if (experience <= 5) return level === 'mid';
                return level === 'senior';
            });
        }

        const mappedJobs = jobs.map(job => ({
            Id: job.id.toString(),
            Title: job.role,
            Company: job.company_name,
            Location: job.normalizedLocation,
            Country: job.normalizedCountry,
            Description: job.description || 'No description',
            Salary: job.salary || 'Not specified',
            DatePosted: job.date_posted,
            Source: 'FindWork',
            Category: job.category || 'Unknown',
            EmploymentType: job.employment_type || (job.remote ? 'remote' : 'Unknown'),
            ExperienceLevel: job.experience_level || 'Unknown',
        }));

        console.log('FindWork returned jobs:', mappedJobs.length);
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

    const interleavedJobs = [];
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

    const finalJobs = interleavedJobs.filter(job => job != null).slice(0, limit);
    console.log('Final jobs returned:', finalJobs.length);
    console.log('Sources in final jobs:', [...new Set(finalJobs.map(job => job.Source))]);
    return finalJobs;
}

// Функція для рекомендацій на основі профілю користувача
async function getRecommendations(userProfile, start, limit) {
    const query = userProfile.interests?.join(' ') || 'developer';
    const filters = {
        category: userProfile.category,
        location: userProfile.location,
        employmentType: userProfile.employmentType,
        experienceLevel: userProfile.experienceLevel,
        source: 'All'
    };
    return searchJobs(query, start, limit, filters);
}

module.exports = { searchJobs, getRecommendations };