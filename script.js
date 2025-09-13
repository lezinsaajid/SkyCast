// ===== GLOBAL VARIABLES =====
let currentWeatherData = null;
let currentUnit = 'celsius';
let favorites = JSON.parse(localStorage.getItem('weatherFavorites') || '[]');
let weatherMap = null;
let hourlyChart = null;
let isVoiceSearchActive = false;
let lastForecastData = null; // global at the top


// Weather API configuration (using OpenWeatherMap)
const API_KEY = '42e2b3616288a7f9f6c432fa42d11f7c'; // In a real app, this would be your actual API key
const API_BASE = 'https://api.openweathermap.org/data/2.5';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    loadTheme();
    loadSettings();
    setupEventListeners();
    loadFavorites();

    // Try to get user's location on load
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                getWeatherByCoords(latitude, longitude);
            },
            error => {
                console.log('Geolocation error:', error);
                // Load demo data for New York
                loadDemoWeather();
            }
        );
    } else {
        loadDemoWeather();
    }
});

function initializeApp() {
    // Initialize weather animations
    createWeatherAnimations();

    // Set up service worker for offline functionality
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('data:text/javascript;base64,c2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgZXZlbnQgPT4gewogIGV2ZW50LndhaXRVbnRpbChzZWxmLnNraXBXYWl0aW5nKCkpOwp9KTsKCnNlbGYuYWRkRXZlbnRMaXN0ZW5lcignYWN0aXZhdGUnLCBldmVudCA9PiB7CiAgZXZlbnQud2FpdFVudGlsKHNlbGYuY2xpZW50cy5jbGFpbSgpKTsKfSk7');
    }
}

function setupEventListeners() {
    // Search functionality
    document.getElementById('city-search').addEventListener('input', handleSearchInput);
    document.getElementById('city-search').addEventListener('keypress', handleSearchKeypress);

    // Location and voice search
    document.getElementById('location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('voice-search').addEventListener('click', startVoiceSearch);

    // Unit conversion
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.addEventListener('click', handleUnitChange);
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Settings
    document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('add-favorite').addEventListener('click', addCurrentCityToFavorites);
    document.getElementById('clear-cache').addEventListener('click', clearCache);

    // Auto-update weather data
    setInterval(updateCurrentWeather, 10 * 60 * 1000); // Update every 10 minutes
}

// ===== WEATHER DATA FUNCTIONS =====
function loadDemoWeather() {
    showLoading();
    getWeatherByCity("New York").finally(() => hideLoading());
}


// ===== FORECAST FETCH & DISPLAY (BULLETPROOF) =====

async function fetchAndDisplayForecast(lat, lon) {
    try {
        const forecastRes = await fetch(
            `${API_BASE}/onecall?lat=${lat}&lon=${lon}&exclude=minutely,current,alerts&appid=${API_KEY}&units=metric`
        );
        if (!forecastRes.ok) throw new Error("Forecast data fetch failed");

        const forecastData = await forecastRes.json();

        // Store globally and cache locally
        lastForecastData = forecastData;
        localStorage.setItem('cachedForecastData', JSON.stringify(forecastData));

        // Update hourly chart if data exists
        if (forecastData.hourly && forecastData.hourly.length) {
            updateHourlyChart(forecastData.hourly);
            document.getElementById('hourly-forecast').classList.remove('hidden');
        } else {
            document.getElementById('hourly-forecast').classList.add('hidden');
        }

        // Update weekly forecast if data exists
        if (forecastData.daily && forecastData.daily.length) {
            updateWeeklyForecast(forecastData.daily);
            document.getElementById('weekly-forecast').classList.remove('hidden');
        } else {
            document.getElementById('weekly-forecast').classList.add('hidden');
        }

    } catch (err) {
        console.error("Forecast fetch error:", err);
        showNotification("Unable to load forecast data ❌", "error");

        // Try to load cached forecast if available
        const cached = JSON.parse(localStorage.getItem('cachedForecastData') || 'null');
        if (cached) {
            lastForecastData = cached;

            if (cached.hourly && cached.hourly.length) updateHourlyChart(cached.hourly);
            if (cached.daily && cached.daily.length) updateWeeklyForecast(cached.daily);
        }
    }
}

// ===== UPDATED getWeatherByCity =====
async function getWeatherByCity(cityName) {
    showLoading();

    try {
        const response = await fetch(
            `${API_BASE}/weather?q=${cityName}&appid=${API_KEY}&units=metric`
        );
        if (!response.ok) throw new Error("City not found");

        const data = await response.json();
        displayCurrentWeather(data);

        // Fetch forecast using coordinates
        const { lat, lon } = data.coord;
        await fetchAndDisplayForecast(lat, lon);

        hideLoading();
        showNotification(`Weather loaded for ${cityName}! 🌍`, 'success');
    } catch (error) {
        hideLoading();
        showNotification("Error loading weather data ❌", "error");
        console.error("Weather API error:", error);
    }
}

// ===== UPDATED getWeatherByCoords =====
async function getWeatherByCoords(lat, lon) {
    showLoading();

    try {
        const response = await fetch(
            `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );
        if (!response.ok) throw new Error("Location not found");

        const data = await response.json();
        displayCurrentWeather(data);
        initializeMap(lat, lon);

        // Fetch forecast using coordinates
        await fetchAndDisplayForecast(lat, lon);

        hideLoading();
        showNotification("Weather loaded for your location! 📍", "success");
    } catch (error) {
        hideLoading();
        showNotification("Error loading location weather ❌", "error");
        console.error("Location weather error:", error);
    }
}

function displayCurrentWeather(data) {
    currentWeatherData = data;

    // Update main weather info
    const cityNameEl = document.getElementById('city-name');
    const descEl = document.getElementById('weather-description');
    const tempEl = document.getElementById('temperature');
    const feelsEl = document.getElementById('feels-like');

    cityNameEl.textContent = data.name;
    descEl.textContent = data.weather[0].description;
    tempEl.textContent = `${Math.round(convertTemperature(data.main.temp))}°`;
    feelsEl.textContent = `${Math.round(convertTemperature(data.main.feels_like))}°`;

    // Weather details
    document.getElementById('wind-speed').textContent = `${data.wind.speed} km/h`;
    document.getElementById('humidity').textContent = `${data.main.humidity}%`;
    document.getElementById('visibility').textContent = `${(data.visibility / 1000).toFixed(1)} km`;
    document.getElementById('pressure').textContent = `${data.main.pressure} hPa`;

    // Icon & background
    updateWeatherIcon(data.weather[0].main, data.weather[0].icon);
    updateWeatherBackground(data.weather[0].main);

    // Additional info
    updateAdditionalInfo(data);

    // Last updated
    document.getElementById('last-updated').textContent = 'Just now';

    // Hide sections until forecast is ready
    document.getElementById('hourly-forecast').classList.add('hidden');
    document.getElementById('weekly-forecast').classList.add('hidden');
    document.getElementById('current-weather').classList.remove('hidden');
    document.getElementById('additional-info').classList.remove('hidden');
    document.getElementById('weather-map-section').classList.remove('hidden');

    // Cache current weather
    localStorage.setItem('cachedWeatherData', JSON.stringify(data));
    localStorage.setItem('cachedWeatherTime', Date.now().toString());

    // If forecast is already loaded, unhide sections
    if (lastForecastData) {
        if (lastForecastData.hourly && lastForecastData.hourly.length) {
            document.getElementById('hourly-forecast').classList.remove('hidden');
        }
        if (lastForecastData.daily && lastForecastData.daily.length) {
            document.getElementById('weekly-forecast').classList.remove('hidden');
        }
    }
}


function updateWeatherIcon(weatherMain, iconCode) {
    const iconMap = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️',
        'Haze': '🌫️'
    };

    const icon = iconMap[weatherMain] || '🌤️';
    document.getElementById('weather-icon').textContent = icon;
}

function updateWeatherBackground(weatherMain) {
    const body = document.body;
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour > 20;

    // Remove existing weather classes
    body.classList.remove('weather-sunny', 'weather-cloudy', 'weather-rainy', 'weather-snowy', 'weather-night');

    if (isNight) {
        body.classList.add('weather-night');
    } else {
        switch (weatherMain) {
            case 'Clear':
                body.classList.add('weather-sunny');
                break;
            case 'Clouds':
                body.classList.add('weather-cloudy');
                break;
            case 'Rain':
            case 'Drizzle':
            case 'Thunderstorm':
                body.classList.add('weather-rainy');
                break;
            case 'Snow':
                body.classList.add('weather-snowy');
                break;
            default:
                body.classList.add('weather-sunny');
        }
    }

    // Update weather animations
    updateWeatherAnimations(weatherMain);
}

function updateAdditionalInfo(data) {
    // Mock additional data
    document.getElementById('uv-index').textContent = '6';
    document.getElementById('uv-level').textContent = 'High';

    document.getElementById('air-quality').textContent = '42';
    document.getElementById('air-quality-desc').textContent = 'Good';

    // Sunrise/Sunset
    const sunrise = new Date(data.sys.sunrise * 1000);
    const sunset = new Date(data.sys.sunset * 1000);
    document.getElementById('sunrise').textContent = sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('sunset').textContent = sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Moon phase
    document.getElementById('moon-phase').textContent = 'Waxing Crescent';
    document.getElementById('moon-icon').textContent = '🌒';
}

// ===== HOURLY FORECAST =====
function updateHourlyChart(hourlyData) {
    const ctx = document.getElementById('hourly-chart').getContext('2d');

    const hours = [];
    const temperatures = [];

    hourlyData.forEach(item => {
        const time = new Date(item.dt * 1000);
        hours.push(time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        temperatures.push(Math.round(convertTemperature(item.temp)));
    });

    if (hourlyChart) hourlyChart.destroy();

    hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                label: `Temperature (°${getUnitSymbol()})`,
                data: temperatures,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#ffffff' } } },
            scales: {
                x: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });

    // Unhide after chart is ready
    document.getElementById('hourly-forecast').classList.remove('hidden');
}


// ===== WEEKLY FORECAST =====
function updateWeeklyForecast(dailyData) {
    const container = document.getElementById('forecast-container');

    container.innerHTML = dailyData.map((dayData, index) => {
        const date = new Date(dayData.dt * 1000);
        const day = index === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' });
        const high = Math.round(convertTemperature(dayData.temp.max));
        const low = Math.round(convertTemperature(dayData.temp.min));
        const weatherMain = dayData.weather[0].main;
        const icon = getWeatherIcon(weatherMain);

        return `
            <div class="glass rounded-xl p-4 flex items-center justify-between weather-card slide-in" style="animation-delay: ${index * 0.1}s;">
                <div class="flex items-center space-x-4">
                    <div class="text-3xl">${icon}</div>
                    <div>
                        <div class="font-semibold" style="color: var(--text-white);">${day}</div>
                        <div class="text-sm" style="color: rgba(255, 255, 255, 0.8);">${dayData.weather[0].description}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="font-bold" style="color: var(--text-white);">${high}°</div>
                    <div class="text-sm" style="color: rgba(255, 255, 255, 0.6);">${low}°</div>
                </div>
            </div>
        `;
    }).join('');
}


// ===== SEARCH FUNCTIONALITY =====
function handleSearchInput(e) {
    const query = e.target.value.trim();
    if (query.length > 2) {
        showSearchSuggestions(query);
    } else {
        hideSearchSuggestions();
    }
}

function handleSearchKeypress(e) {
    if (e.key === 'Enter') {
        const city = e.target.value.trim();
        if (city) {
            getWeatherByCity(city);
            hideSearchSuggestions();
        }
    }
}

function showSearchSuggestions(query) {
    // Mock city suggestions
    const mockCities = [
        'New York, NY, USA',
        'London, UK',
        'Tokyo, Japan',
        'Paris, France',
        'Sydney, Australia',
        'Toronto, Canada',
        'Berlin, Germany',
        'Mumbai, India'
    ].filter(city => city.toLowerCase().includes(query.toLowerCase()));

    const container = document.getElementById('search-suggestions');

    if (mockCities.length > 0) {
        container.innerHTML = mockCities.map(city => `
                    <div class="p-3 hover:bg-opacity-20 cursor-pointer transition-all" 
                         style="color: var(--text-white); hover:background-color: var(--primary-blue);"
                         onclick="selectCity('${city}')">
                        📍 ${city}
                    </div>
                `).join('');
        container.classList.remove('hidden');
    } else {
        hideSearchSuggestions();
    }
}

function hideSearchSuggestions() {
    document.getElementById('search-suggestions').classList.add('hidden');
}

function selectCity(city) {
    document.getElementById('city-search').value = city;
    getWeatherByCity(city.split(',')[0]);
    hideSearchSuggestions();
}

// ===== VOICE SEARCH =====
function startVoiceSearch() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification('Voice search not supported in this browser. 🎤❌', 'error');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    const voiceBtn = document.getElementById('voice-search');
    voiceBtn.classList.add('voice-active');
    isVoiceSearchActive = true;

    recognition.onstart = () => {
        showNotification('Listening... Speak the city name! 🎤', 'info');
    };

    recognition.onresult = (event) => {
        const city = event.results[0][0].transcript;
        document.getElementById('city-search').value = city;
        getWeatherByCity(city);
        showNotification(`Searching for weather in ${city}... 🔍`, 'success');
    };

    recognition.onerror = (event) => {
        showNotification('Voice search error. Please try again. 🎤❌', 'error');
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('voice-active');
        isVoiceSearchActive = false;
    };

    recognition.start();
}

// ===== LOCATION FUNCTIONS =====
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showNotification('Geolocation not supported in this browser. 📍❌', 'error');
        return;
    }

    showNotification('Getting your location... 📍', 'info');

    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            getWeatherByCoords(latitude, longitude);
        },
        error => {
            let message = 'Location access denied. ';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    message += 'Please allow location access. 📍❌';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message += 'Location unavailable. 📍❌';
                    break;
                case error.TIMEOUT:
                    message += 'Location request timed out. 📍❌';
                    break;
            }
            showNotification(message, 'error');
        }
    );
}

// ===== UNIT CONVERSION =====
// ===== UPDATED handleUnitChange =====
function handleUnitChange(e) {
    const unit = e.target.id.split('-')[1];
    currentUnit = unit === 'c' ? 'celsius' : unit === 'f' ? 'fahrenheit' : 'kelvin';

    // Update active button UI
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.style.backgroundColor = 'transparent';
        btn.style.color = 'var(--text-white)';
    });
    e.target.style.backgroundColor = 'var(--primary-blue)';
    e.target.style.color = 'var(--text-white)';

    // Update displayed temperatures (current + forecast)
    if (currentWeatherData) displayCurrentWeather(currentWeatherData);
    if (lastForecastData) {
        if (lastForecastData.hourly) updateHourlyChart(lastForecastData.hourly);
        if (lastForecastData.daily) updateWeeklyForecast(lastForecastData.daily);
    }

    showNotification(`Temperature unit changed to ${currentUnit}! 🌡️`, 'info');
}

function convertTemperature(celsius) {
    switch (currentUnit) {
        case 'fahrenheit':
            return (celsius * 9 / 5) + 32;
        case 'kelvin':
            return celsius + 273.15;
        default:
            return celsius;
    }
}

function getUnitSymbol() {
    switch (currentUnit) {
        case 'fahrenheit': return 'F';
        case 'kelvin': return 'K';
        default: return 'C';
    }
}

// ===== FAVORITES MANAGEMENT =====
function addCurrentCityToFavorites() {
    if (!currentWeatherData) {
        showNotification('No current weather data to save. 📍❌', 'error');
        return;
    }

    const city = {
        name: currentWeatherData.name,
        lat: currentWeatherData.coord.lat,
        lon: currentWeatherData.coord.lon,
        temp: currentWeatherData.main.temp,
        weather: currentWeatherData.weather[0].main,
        icon: currentWeatherData.weather[0].icon
    };

    // Check if city already exists
    if (favorites.some(fav => fav.name === city.name)) {
        showNotification('City already in favorites! ⭐', 'warning');
        return;
    }

    favorites.push(city);
    localStorage.setItem('weatherFavorites', JSON.stringify(favorites));
    loadFavorites();
    showNotification(`${city.name} added to favorites! ⭐`, 'success');
}

function loadFavorites() {
    const container = document.getElementById('favorites-container');

    if (favorites.length === 0) {
        container.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <div class="text-4xl mb-4">⭐</div>
                        <p style="color: rgba(255, 255, 255, 0.8);">No favorite cities yet. Add your current city to get started!</p>
                    </div>
                `;
        return;
    }

    container.innerHTML = favorites.map((city, index) => `
                <div class="glass rounded-xl p-4 weather-card slide-in" style="animation-delay: ${index * 0.1}s;">
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-semibold" style="color: var(--text-white);">${city.name}</h4>
                        <button onclick="removeFavorite(${index})" class="text-red-400 hover:text-red-300">
                            🗑️
                        </button>
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center space-x-2">
                            <span class="text-2xl">${getWeatherIcon(city.weather)}</span>
                            <span class="text-xl font-bold" style="color: var(--text-white);">
                                ${Math.round(convertTemperature(city.temp))}°
                            </span>
                        </div>
                        <button onclick="loadFavoriteCity('${city.name}')" 
                                class="px-3 py-1 rounded-lg text-sm btn-hover" 
                                style="background-color: var(--primary-blue); color: var(--text-white);">
                            View
                        </button>
                    </div>
                </div>
            `).join('');
}

function removeFavorite(index) {
    if (confirm('Remove this city from favorites?')) {
        favorites.splice(index, 1);
        localStorage.setItem('weatherFavorites', JSON.stringify(favorites));
        loadFavorites();
        showNotification('City removed from favorites! 🗑️', 'info');
    }
}

function loadFavoriteCity(cityName) {
    getWeatherByCity(cityName);
    document.getElementById('city-search').value = cityName;
}

function getWeatherIcon(weatherMain) {
    const iconMap = {
        'Clear': '☀️',
        'Clouds': '☁️',
        'Rain': '🌧️',
        'Drizzle': '🌦️',
        'Thunderstorm': '⛈️',
        'Snow': '❄️',
        'Mist': '🌫️',
        'Fog': '🌫️',
        'Haze': '🌫️'
    };
    return iconMap[weatherMain] || '🌤️';
}

// ===== WEATHER MAP =====
function initializeMap(lat, lon) {
    if (weatherMap) {
        weatherMap.remove();
    }

    weatherMap = L.map('weather-map').setView([lat, lon], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(weatherMap);

    // Add weather marker
    L.marker([lat, lon])
        .addTo(weatherMap)
        .bindPopup(`<b>${currentWeatherData.name}</b><br>${currentWeatherData.weather[0].description}`)
        .openPopup();
}

// ===== WEATHER ANIMATIONS =====
function createWeatherAnimations() {
    const animationContainer = document.getElementById('weather-animation');
    animationContainer.innerHTML = ''; // Clear existing animations
}

function updateWeatherAnimations(weatherMain) {
    const container = document.getElementById('weather-animation');
    container.innerHTML = '';

    switch (weatherMain) {
        case 'Rain':
        case 'Drizzle':
            createRainAnimation(container);
            break;
        case 'Snow':
            createSnowAnimation(container);
            break;
        case 'Clouds':
            createCloudAnimation(container);
            break;
    }
}

function createRainAnimation(container) {
    for (let i = 0; i < 50; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.animationDelay = Math.random() * 2 + 's';
        drop.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
        container.appendChild(drop);
    }
}

function createSnowAnimation(container) {
    for (let i = 0; i < 30; i++) {
        const flake = document.createElement('div');
        flake.className = 'snow-flake';
        flake.textContent = '❄';
        flake.style.left = Math.random() * 100 + '%';
        flake.style.animationDelay = Math.random() * 3 + 's';
        flake.style.animationDuration = (Math.random() * 2 + 2) + 's';
        container.appendChild(flake);
    }
}

function createCloudAnimation(container) {
    for (let i = 0; i < 3; i++) {
        const cloud = document.createElement('div');
        cloud.className = 'cloud-float';
        cloud.textContent = '☁️';
        cloud.style.top = Math.random() * 30 + '%';
        cloud.style.animationDelay = Math.random() * 10 + 's';
        container.appendChild(cloud);
    }
}

// ===== THEME MANAGEMENT =====
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('weatherTheme', newTheme);

    const themeIcon = document.getElementById('theme-icon');
    themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';

    showNotification(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode activated! ${newTheme === 'dark' ? '🌙' : '☀️'}`, 'info');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('weatherTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const themeIcon = document.getElementById('theme-icon');
    themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

// ===== SETTINGS MANAGEMENT =====
function openSettingsModal() {
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function loadSettings() {
    const autoLocation = localStorage.getItem('autoLocation') === 'true';
    const notifications = localStorage.getItem('weatherNotifications') === 'true';
    const updateInterval = localStorage.getItem('updateInterval') || '10';

    document.getElementById('auto-location').checked = autoLocation;
    document.getElementById('weather-notifications').checked = notifications;
    document.getElementById('update-interval').value = updateInterval;
}

function clearCache() {
    localStorage.removeItem('cachedWeatherData');
    localStorage.removeItem('cachedWeatherTime');
    showNotification('Cache cleared successfully! 🗑️', 'success');
}

// ===== UTILITY FUNCTIONS =====
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function updateCurrentWeather() {
    if (currentWeatherData) {
        // In a real app, this would refresh the weather data
        const timeDiff = Date.now() - parseInt(localStorage.getItem('cachedWeatherTime') || '0');
        const minutes = Math.floor(timeDiff / 60000);
        document.getElementById('last-updated').textContent = minutes > 0 ? `${minutes}m ago` : 'Just now';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg fade-in glass';

    const colors = {
        success: 'border-l-4 border-green-500',
        error: 'border-l-4 border-red-500',
        warning: 'border-l-4 border-yellow-500',
        info: 'border-l-4 border-blue-500'
    };

    notification.classList.add(colors[type]);
    notification.style.color = 'var(--text-white)';
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Welcome message
setTimeout(() => {
    showNotification('Welcome to SkyCast! 🌤️ Search for any city or use your location!', 'info');
}, 2000);