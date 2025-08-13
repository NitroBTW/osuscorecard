// Global variables to store current data and gradient sampling
let currentScoreData = null;
let currentMapData = null;
let gradientCanvas = null;
let gradientCtx = null;

// Debug helper: safely extract background-image url(...) value
function extractCssBackgroundUrl(backgroundImageValue) {
    if (!backgroundImageValue || backgroundImageValue === 'none') return '';
    const match = backgroundImageValue.match(/url\(['"]?([^'"]+)['"]?\)/);
    return match ? match[1] : '';
}


// Fetch an image URL and return a data URL
async function fetchImageAsDataUrl(imageUrl) {
    const bustUrl = imageUrl + (imageUrl.includes('?') ? '&' : '?') + `_dl=${Date.now()}`;
    const response = await fetch(bustUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Apply background image as data URL
async function applyBackgroundDataUrl(containerElement, sourceUrl, contextTag) {
    try {
        const imgEl = containerElement.querySelector('.background-image img.bg-img');
        if (!imgEl) {
            return;
        }
        const dataUrl = await fetchImageAsDataUrl(sourceUrl);
        imgEl.src = dataUrl;
    } catch (e) {
        console.warn(contextTag, 'failed to apply bg data URL', e);
    }
}

// Apply avatar image as data URL
async function applyAvatarDataUrl(containerElement, sourceUrl, contextTag) {
    try {
        const imgEl = containerElement.querySelector('.avatar-container img.avatar');
        if (!imgEl) {
            return;
        }
        const dataUrl = await fetchImageAsDataUrl(sourceUrl);
        imgEl.src = dataUrl;
    } catch (e) {
        console.warn(contextTag, 'failed to apply avatar data URL', e);
    }
}


// Load gradient colours on page load
async function loadGradientColours() {
    try {
        // Create new image element for loading the gradient
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        // Return a promise that resolves when gradient is loaded
        return new Promise((resolve, reject) => {
            img.onload = function() {
                // Create canvas to sample colours from gradient image
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                // Store canvas and context globally for continuous sampling
                gradientCanvas = canvas;
                gradientCtx = ctx;
                
                console.log('✓ Gradient loaded successfully');
                resolve();
            };
            
            // Handle gradient loading errors
            img.onerror = function() {
                console.error('Could not load gradient image');
                reject(new Error('Failed to load gradient'));
            };
            
            // Set the gradient image source to start loading
            img.src = 'gradient.png';
        });
    } catch (error) {
        console.error('Could not load gradient:', error);
        throw error;
    }
}

// Get colour from gradient based on star rating (0-10)
function getGradientColour(starRating) {
    // If gradient canvas is not available, use fallback colour mapping
    if (!gradientCanvas || !gradientCtx) {
        // Fallback colours mapped to star rating ranges
        const colourMap = {
            0: "#666666", 1: "#4FC3F7", 2: "#4CAF50", 3: "#FFEB3B",
            4: "#FF9800", 5: "#FF5722", 6: "#E91E63", 7: "#9C27B0",
            8: "#673AB7", 9: "#3F51B5", 10: "#000000"
        };
        const index = Math.min(Math.floor(starRating), 10);
        return colourMap[index] || "#ff6b6b";
    }
    
    // Clamp star rating to valid 0-10 range
    const clamped = Math.max(0, Math.min(10, starRating));
    
    // Calculate exact position in gradient (normalized to 0-1)
    const position = clamped / 10.0;
    
    // Get pixel coordinates from gradient position
    const x = Math.floor(position * (gradientCanvas.width - 1));
    const y = Math.floor(gradientCanvas.height / 2);
    
    try {
        // Sample pixel colour from gradient at calculated position
        const pixel = gradientCtx.getImageData(x, y, 1, 1).data;
        // Convert RGB values to hex colour string
        return `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
    } catch (error) {
        console.error('Error sampling gradient:', error);
        return "#ff6b6b";
    }
}

// Format score numbers with thousands separators
function formatScore(score) {
    return score.toLocaleString();
}

// Format accuracy as percentage with 2 decimal places
function formatAccuracy(accuracy) {
    return (accuracy * 100).toFixed(2);
}

// Generate HTML for mod icons based on mod array
function generateModIconsHtml(mods) {
    // Return empty string if no mods
    if (!mods || mods.length === 0) return '';
    
    // Map each mod to its icon HTML element
    return mods.map(mod => 
        `<div class="mod-icon" style="background-image: url('./icons/${mod.acronym}.png')"></div>`
    ).join('');
}

// Truncate text to specified length with ellipsis
function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength - 2) + '..' : text;
}

// Get proxied image URL for external images
function getProxiedImageUrl(type, originalUrl) {
    if (!originalUrl) return '';
    return `/api/proxy-image/${type}?url=${encodeURIComponent(originalUrl)}`;
}

// Fetch map data from server API
async function fetchMapData(mapId) {
    try {
        setStatus('Loading map data...', 'loading');
        
        // Make request to map API endpoint
        const response = await fetch(`/api/map/${mapId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Parse response and store map data
        const data = await response.json();
        currentMapData = data;
        currentScoreData = null; // Clear score data when loading map data
        
        // Show score override fields when map data is loaded
        const scoreOverrides = document.getElementById('scoreOverrides');
        scoreOverrides.style.display = 'block';
        
        // Show/hide PP input for loved maps
        const ppInputGroup = document.getElementById('ppInputGroup');
        if (data.beatmap.status === 'loved') {
            ppInputGroup.style.display = 'block';
        } else {
            ppInputGroup.style.display = 'none';
        }
        
        // Update scorecard with map data
        updateScorecard();
        setStatus('Map loaded successfully!', 'success');
        document.getElementById('generateBtn').disabled = false;
        
    } catch (error) {
        console.error('Error fetching map:', error);
        setStatus(`Error: ${error.message}`, 'error');
        currentMapData = null;
        // Hide scorecard and show placeholder on error
        document.getElementById('scorecard-preview').style.display = 'none';
        document.getElementById('placeholder').style.display = 'block';
        document.getElementById('scoreOverrides').style.display = 'none';
        document.getElementById('generateBtn').disabled = true;
        document.getElementById('saveBtn').disabled = true;
    }
}

// Extract and process score data based on current data type
function extractScoreData() {
    const overrides = getScoreOverrides();
    
    if (currentScoreData) {
        const data = currentScoreData;
        return {
            score: overrides.score !== '' ? parseInt(overrides.score) : (data.lazer ? data.score.score : data.score.classic_score),
            classic_score: overrides.score !== '' ? parseInt(overrides.score) : data.score.classic_score,
            c300: overrides.count300 !== '' ? parseInt(overrides.count300) : data.score.c300,
            c100: overrides.count100 !== '' ? parseInt(overrides.count100) : data.score.c100,
            c50: overrides.count50 !== '' ? parseInt(overrides.count50) : data.score.c50,
            misses: overrides.countMiss !== '' ? parseInt(overrides.countMiss) : data.score.misses,
            cEnds: overrides.countSliderEnds !== '' ? parseInt(overrides.countSliderEnds) : data.score.cEnds,
            max_combo: overrides.combo !== '' ? parseInt(overrides.combo) : data.score.max_combo,
            accuracy: overrides.accuracy !== '' ? parseFloat(overrides.accuracy) / 100 : data.score.accuracy,
            pp: overrides.pp !== '' ? parseFloat(overrides.pp) : data.score.pp,
            rank: overrides.rank !== '' ? overrides.rank : data.score.rank,
            mods: overrides.mods !== '' ? parseModsString(overrides.mods) : data.score.mods,
            leaderboard: overrides.leaderboard !== '' ? parseInt(overrides.leaderboard) : data.score.leaderboard,
            full_combo: data.score.full_combo,
            cSliders: data.score.cSliders
        };
    } else if (currentMapData) {
        // Default values for map preview
        return {
            score: overrides.score !== '' ? parseInt(overrides.score) : 0,
            c300: overrides.count300 !== '' ? parseInt(overrides.count300) : 0,
            c100: overrides.count100 !== '' ? parseInt(overrides.count100) : 0,
            c50: overrides.count50 !== '' ? parseInt(overrides.count50) : 0,
            misses: overrides.countMiss !== '' ? parseInt(overrides.countMiss) : 0,
            cEnds: overrides.countSliderEnds !== '' ? parseInt(overrides.countSliderEnds) : 0,
            cSliders: 100, // Default value for map preview
            max_combo: overrides.combo !== '' ? parseInt(overrides.combo) : 0,
            accuracy: overrides.accuracy !== '' ? parseFloat(overrides.accuracy) / 100 : 0,
            pp: overrides.pp !== '' ? parseFloat(overrides.pp) : 0,
            rank: overrides.rank !== '' ? overrides.rank : 'F',
            mods: overrides.mods !== '' ? parseModsString(overrides.mods) : [],
            leaderboard: overrides.leaderboard !== '' ? parseInt(overrides.leaderboard) : 0,
            full_combo: false
        };
    }
    return null;
}

// Extract user data with overrides applied
function extractUserData() {
    const userOverrides = getUserOverrides();
    
    if (currentScoreData) {
        const data = currentScoreData;
        return {
            username: userOverrides.username !== '' ? userOverrides.username : data.user.username,
            userRank: userOverrides.userRank !== '' ? parseInt(userOverrides.userRank) : data.user.user_rank,
            avatarUrl: userOverrides.avatarUrl !== '' ? userOverrides.avatarUrl : data.user.avatar_url,
            country: data.user.country
        };
    } else if (currentMapData) {
        // Default values for map preview
        const defaultAvatarUrl = 'https://osu.ppy.sh/images/layout/avatar-guest.png';
        return {
            username: userOverrides.username || 'Guest',
            userRank: userOverrides.userRank || 0,
            avatarUrl: userOverrides.avatarUrl || defaultAvatarUrl,
            country: 'xx'
        };
    }
    return null;
}

// Get beatmap data from current source
function getBeatmapData() {
    if (currentScoreData) return currentScoreData.beatmap;
    if (currentMapData) return currentMapData.beatmap;
    return null;
}

// Determine PP display text
function getPpDisplay(scoreData, isLoved) {
    const ppOverride = document.getElementById('ppOverride').value;
    
    if (isLoved) {
        if (ppOverride === '' || ppOverride === null) {
            return '♥';
        } else {
            return `${formatScore(Math.round(parseFloat(ppOverride)))}pp ♥`;
        }
    } else {
        return `${formatScore(Math.round(scoreData.pp))}pp`;
    }
}


// Determine background image URL
async function getBackgroundUrl() {
    const backgroundOverride = document.getElementById('backgroundOverride').value;
    
    if (backgroundOverride) {
        return getProxiedImageUrl('background', backgroundOverride);
    }
    
    const beatmap = getBeatmapData();
    if (!beatmap) return '';
    
    // Try HD version first
    const fallbackBackgroundUrl = beatmap.cover;
    const highDefBackgroundUrl = `https://assets.ppy.sh/beatmaps/${beatmap.id}/covers/raw.jpg`;
    
    try {
        const response = await fetch(highDefBackgroundUrl, { method: 'HEAD' });
        if (response.ok) {
            return getProxiedImageUrl('background', highDefBackgroundUrl);
        } else {
            console.warn('HD background not found, falling back to API cover image.');
        }
    } catch (error) {
        console.error('Error fetching HD background:', error);
    }
    
    return getProxiedImageUrl('background', fallbackBackgroundUrl);
}

// Generate hit counts HTML based on lazer/classic layout
function generateHitCountsHtml(scoreData, isLazer) {
    if (isLazer) {
        return `
            <!-- LAZER LAYOUT: 300/100/50 - Miss/Slider Ends - Combo/Accuracy -->
            <div class="hit-count-row">
                <div class="stat stat-300">
                    <span class="label">300</span>
                    <span class="value">${scoreData.c300}</span>
                </div>
                <div class="stat stat-100">
                    <span class="label">100</span>
                    <span class="value">${scoreData.c100}</span>
                </div>
                <div class="stat stat-50">
                    <span class="label">50</span>
                    <span class="value">${scoreData.c50}</span>
                </div>
            </div>
            <div class="hit-count-row">
                <div class="stat stat-miss">
                    <span class="label">Miss</span>
                    <span class="value">${scoreData.misses}</span>
                </div>
                <div class="stat stat-sliderend">
                    <span class="label">Slider Ends</span>
                    <span class="value">${scoreData.cEnds}/${scoreData.cSliders}</span>
                </div>
            </div>
            <div class="hit-count-row">
                <div class="stat stat-combo">
                    <span class="label">Combo</span>
                    <span class="value">${formatScore(scoreData.max_combo)}x</span>
                </div>
                <div class="stat stat-accuracy">
                    <span class="label">Accuracy</span>
                    <span class="value">${formatAccuracy(scoreData.accuracy)}%</span>
                </div>
            </div>
        `;
    } else {
        return `
            <!-- CLASSIC LAYOUT: 300/100 - 50/Miss - Combo/Accuracy -->
            <div class="hit-count-row">
                <div class="stat stat-300">
                    <span class="label">300</span>
                    <span class="value">${scoreData.c300}</span>
                </div>
                <div class="stat stat-100">
                    <span class="label">100</span>
                    <span class="value">${scoreData.c100}</span>
                </div>
            </div>
            <div class="hit-count-row">
                <div class="stat stat-50">
                    <span class="label">50</span>
                    <span class="value">${scoreData.c50}</span>
                </div>
                <div class="stat stat-miss">
                    <span class="label">Miss</span>
                    <span class="value">${scoreData.misses}</span>
                </div>
            </div>
            <div class="hit-count-row">
                <div class="stat stat-combo">
                    <span class="label">Combo</span>
                    <span class="value">${formatScore(scoreData.max_combo)}x</span>
                </div>
                <div class="stat stat-accuracy">
                    <span class="label">Accuracy</span>
                    <span class="value">${formatAccuracy(scoreData.accuracy)}%</span>
                </div>
            </div>
        `;
    }
}

// Unified scorecard generation function
async function generateScorecardHtml(scoreData, userData, beatmap, isLazer, ppDisplay, fullComboText, extraText, backgroundUrl, avatarUrl) {
    const starColour = getGradientColour(beatmap.star_rating);
    const srColour = beatmap.star_rating > 6.5 ? "ffe475" : "2c3b43";
    
    return `
        <div class="top-bar">
            <div class="header">
                <div class="map-info">
                    <div class="map-title">${beatmap.title}</div>
                    <div class="star-container">
                        <div class="star-rating" style="background: ${starColour}; color: #${srColour}">☆ ${beatmap.star_rating.toFixed(2)}&nbsp;</div>
                        <div class="mapper">
                            <span class="map-diff">${truncateText(beatmap.difficulty, 32)} </span>
                            <span class="mapped-by">Mapped by: </span>
                            <span class="mapper">${beatmap.creator}</span>
                        </div>
                    </div>
                </div>
                <div class="mod-icons">
                    ${generateModIconsHtml(scoreData.mods)}
                </div>
            </div>
        </div>
        <div class="middle-section">
            <div class="background-image">
                <img class="bg-img" src="" alt="" crossorigin="anonymous">
            </div>
            <div class="background-overlay"></div>
            <div class="main-content">
                <div class="left-section">
                    <div class="stats">
                        <div class="score">Score: ${formatScore(isLazer ? scoreData.score : (scoreData.classic_score || scoreData.score))}</div>
                        <div class="hit-counts">
                            ${generateHitCountsHtml(scoreData, isLazer)}
                        </div>
                    </div>
                </div>
                <div class="right-section">
                    <div class="rank-badge rank-${scoreData.rank}"></div>
                    <div class="performance">
                        <div></div>
                        <div class="full-combo">${fullComboText}</div>
                        <div></div>
                        <div class="pp">${ppDisplay}</div>
                        <div class="extra">${extraText}</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="bottom-bar">
            <div class="bottom-section">
                <div class="user-info">
                    <div class="avatar-container">
                        <img src="${avatarUrl}" alt="Avatar" class="avatar" crossorigin="anonymous">
                        <div class="flag" style="background-image: url('./flags/${userData.country.toLowerCase()}.png')"></div>
                    </div>
                    <div class="user-details">
                        <div class="username">${userData.username}</div>
                        <div class="user-rank">#${formatScore(userData.userRank)}</div>
                    </div>
                </div>
                <div class="leaderboard-details">
                    <div class="leaderboard">Leaderboard</div>
                    <div class="leaderboard-rank">#${formatScore(scoreData.leaderboard)}</div>
                </div>
            </div>
        </div>
    `;
}

// Main unified update function
async function updateScorecard() {
    const data = currentScoreData || currentMapData;
    if (!data) return;

    const extraText = document.getElementById('extraText').value.replace(/\n/g, '<br>');
    const fullComboOverride = document.getElementById('fullComboOverride').checked;
    const lazerScoringOverride = document.getElementById('lazerScoringOverride').checked;

    const scoreData = extractScoreData();
    const userData = extractUserData();
    const beatmap = getBeatmapData();
    
    if (!scoreData || !userData || !beatmap) return;

    const isLoved = beatmap.status === 'loved';
    const isLazer = currentScoreData ? lazerScoringOverride : lazerScoringOverride;
    
    const ppDisplay = getPpDisplay(scoreData, isLoved);
    const fullComboText = (fullComboOverride || (currentScoreData && scoreData.full_combo)) ? "Full Combo!" : "";
    
    const backgroundUrl = await getBackgroundUrl();
    const avatarUrl = getProxiedImageUrl('avatar', userData.avatarUrl);

    const scorecardHtml = await generateScorecardHtml(
        scoreData, userData, beatmap, isLazer, ppDisplay, 
        fullComboText, extraText, backgroundUrl, avatarUrl
    );

    // Update the preview container
    const preview = document.getElementById('scorecard-preview');
    preview.innerHTML = scorecardHtml;

    // Apply post-processing
    setTimeout(() => {
        const titleElement = preview.querySelector('.map-title');
        if (titleElement) {
            const adjustedTitle = adjustTitleSize(beatmap.title);
            titleElement.textContent = adjustedTitle;
        }
        
        adjustRightSectionSizes();
        adjustScorecardHeight(extraText, fullComboText !== "");
    }, 50);

    preview.style.display = 'flex';
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('saveBtn').disabled = false;

    // Apply data URLs for images
    const bgImgEl = preview.querySelector('.background-image img.bg-img');
    if (bgImgEl) {
        applyBackgroundDataUrl(preview, backgroundUrl, currentScoreData ? 'Score render:' : 'Map render:');
    }

    const avatarImgEl = preview.querySelector('.avatar-container img.avatar');
    if (avatarImgEl) {
        applyAvatarDataUrl(preview, avatarUrl, currentScoreData ? 'Score render:' : 'Map render:');
    }
}

// Parse mods string into array format expected by the scorecard
function parseModsString(modsString) {
    if (!modsString || modsString.trim() === '') return [];
    
    // Split by comma and clean up each mod code
    const modCodes = modsString.split(',').map(mod => mod.trim().toUpperCase());
    
    // Validate mod codes (should be 2 letters)
    const validMods = modCodes.filter(mod => /^[A-Z]{2}$/.test(mod));
    
    // Convert to format expected by generateModIconsHtml
    return validMods.map(code => ({ acronym: code }));
}

// Validate and get override values from input fields
function getScoreOverrides() {
    return {
        score: document.getElementById('scoreOverride').value,
        count300: document.getElementById('count300').value,
        count100: document.getElementById('count100').value,
        count50: document.getElementById('count50').value,
        countMiss: document.getElementById('countMiss').value,
        countSliderEnds: document.getElementById('countSliderEnds').value,
        combo: document.getElementById('comboOverride').value,
        accuracy: document.getElementById('accuracyOverride').value,
        pp: document.getElementById('ppScoreOverride').value,
        rank: document.getElementById('rankOverride').value,
        mods: document.getElementById('modsOverride').value,
        leaderboard: document.getElementById('leaderboardOverride').value
    };
}

// Get user override values
function getUserOverrides() {
    return {
        username: document.getElementById('usernameOverride').value,
        userRank: document.getElementById('userRankOverride').value,
        avatarUrl: document.getElementById('avatarUrlOverride').value
    };
}

// Set status message with appropriate styling
function setStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status-${type}`;
}

// Fetch score data from server API
async function fetchScoreData(scoreId) {
    try {
        setStatus('Loading score data...', 'loading');
        
        // Make request to score API endpoint
        const response = await fetch(`/api/score/${scoreId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Parse response and store score data
        const data = await response.json();
        currentScoreData = data;
        currentMapData = null;
        
        // Show/hide PP input for loved maps
        const ppInputGroup = document.getElementById('ppInputGroup');
        const scoreOverrides = document.getElementById('scoreOverrides');
        
        if (data.beatmap.status === 'loved') {
            ppInputGroup.style.display = 'block';
        } else {
            ppInputGroup.style.display = 'none';
        }
        
        // Show score override fields when score data is loaded
        scoreOverrides.style.display = 'block';
        populateOverrideFields(data);
        
        // Update scorecard with score data
        updateScorecard();
        setStatus('Score loaded successfully!', 'success');
        document.getElementById('generateBtn').disabled = false;
        
    } catch (error) {
        console.error('Error fetching score:', error);
        setStatus(`Error: ${error.message}`, 'error');
        currentScoreData = null;
        
        // Hide scorecard and score overrides on error
        document.getElementById('scorecard-preview').style.display = 'none';
        document.getElementById('placeholder').style.display = 'block';
        document.getElementById('scoreOverrides').style.display = 'none';
        document.getElementById('generateBtn').disabled = true;
        document.getElementById('saveBtn').disabled = true;
    }
}

// Populate override fields with current score data as placeholders
function populateOverrideFields(data) {
    // Set placeholder values to show current values
    document.getElementById('scoreOverride').placeholder = formatScore(data.lazer ? data.score.score : data.score.classic_score);
    document.getElementById('count300').placeholder = data.score.c300.toString();
    document.getElementById('count100').placeholder = data.score.c100.toString();
    document.getElementById('count50').placeholder = data.score.c50.toString();
    document.getElementById('countMiss').placeholder = data.score.misses.toString();
    document.getElementById('countSliderEnds').placeholder = data.score.cEnds.toString();
    document.getElementById('comboOverride').placeholder = data.score.max_combo.toString();
    document.getElementById('accuracyOverride').placeholder = formatAccuracy(data.score.accuracy);
    document.getElementById('ppScoreOverride').placeholder = Math.round(data.score.pp).toString();
    document.getElementById('leaderboardOverride').placeholder = data.score.leaderboard.toString();
    
    // Set mods placeholder
    const modsString = data.score.mods.map(mod => mod.acronym).join(',');
    document.getElementById('modsOverride').placeholder = modsString || 'No mods';
    
    // Set user override placeholders
    document.getElementById('usernameOverride').placeholder = data.user.username;
    document.getElementById('userRankOverride').placeholder = data.user.user_rank.toString();
    document.getElementById('avatarUrlOverride').placeholder = data.user.avatar_url;
    
    // Set lazer checkbox based on score type
    document.getElementById('lazerScoringOverride').checked = data.lazer;
    toggleSliderEndsInput(data.lazer);
}

// Add input validation for score override fields
function setupScoreValidation() {
    // Mods input validation
    const modsInput = document.getElementById('modsOverride');
    modsInput.addEventListener('input', function() {
        let value = this.value.toUpperCase();
        
        // Allow typing before validating
        this.value = value;
        
        // Visual feedback only if the field appears to be complete
        if (value === '' || /^([A-Z]{2})(,[A-Z]{2})*$/.test(value) || /^[A-Z]{1}$/.test(value) || /^[A-Z]{2},$/.test(value)) {
            this.style.borderColor = '#4CAF50';
            this.style.backgroundColor = '';
        } else if (value.length > 2 && !value.includes(',')) {
            // Only show error if they've typed more than 2 characterss without comma
            this.style.borderColor = '#f44336';
            this.style.backgroundColor = '#2c1a1dff';
        }
    });
    
    // Validation
    modsInput.addEventListener('blur', function() {
        const value = this.value.toUpperCase();
        
        // Clean up the value
        if (value !== '') {
            const parts = value.split(',');
            const validParts = parts.filter(part => part.length === 0 || /^[A-Z]{2}$/.test(part.trim()));
            const cleaned = validParts.map(part => part.trim()).filter(part => part.length === 2).join(',');
            this.value = cleaned;
        }
        
        // Final validation styling
        if (this.value === '' || /^([A-Z]{2})(,[A-Z]{2})*$/.test(this.value)) {
            this.style.borderColor = '#4CAF50';
            this.style.backgroundColor = '';
        } else {
            this.style.borderColor = '#f44336';
            this.style.backgroundColor = '#2c1a1dff';
        }
    });
    
    // Accuracy input validation (Max 100)
    const accuracyInput = document.getElementById('accuracyOverride');
    accuracyInput.addEventListener('input', function() {
        const value = parseFloat(this.value);
        if (value < 0) this.value = 0;
        if (value > 100) this.value = 100;
    });
    
    // PP input validation (non-negative)
    const ppInput = document.getElementById('ppScoreOverride');
    ppInput.addEventListener('input', function() {
        const value = parseFloat(this.value);
        if (value < 0) this.value = 0;
    });
    
    // Score input validation (non-negative, max reasonable score)
    const scoreInput = document.getElementById('scoreOverride');
    scoreInput.addEventListener('input', function() {
        const value = parseInt(this.value);
        if (value < 0) this.value = 0;
        if (value > 999999999) this.value = 999999999;
    });
    
    // Hit count validation (non-negative)
    ['count300', 'count100', 'count50', 'countMiss', 'countSliderEnds', 'comboOverride', 'leaderboardOverride', 'userRankOverride'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                const value = parseInt(this.value);
                if (value < 0) this.value = 0;
            });
        }
    });
    
    // Username validation (max length and character restrictions)
    const usernameInput = document.getElementById('usernameOverride');
    usernameInput.addEventListener('input', function() {
        // Limit username length to reasonable osu! limits
        if (this.value.length > 15) {
            this.value = this.value.substring(0, 15);
        }
    });
    
    // Avatar URL validation
    const avatarInput = document.getElementById('avatarUrlOverride');
    avatarInput.addEventListener('blur', function() {
        const value = this.value.trim();
        if (value !== '' && !value.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
            this.style.borderColor = '#f44336';
            this.style.backgroundColor = '#2c1a1dff';
        } else {
            this.style.borderColor = '#4CAF50';
            this.style.backgroundColor = '';
        }
    });
}

// Toggle slider ends input visibility
function toggleSliderEndsInput(showSliderEnds) {
    const sliderEndsCol = document.getElementById('sliderEndsCol');
    if (showSliderEnds) {
        sliderEndsCol.style.display = 'flex';
    } else {
        sliderEndsCol.style.display = 'none';
    }
}

// Enhanced text width measurement function for better accuracy
function getTextWidth(text, font) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = font;
    const metrics = context.measureText(text);
    return Math.ceil(metrics.width);
}

// Function to calculate available width for title based on mod icons
function calculateTitleSpace() {
    const scorecardWidth = 800;
    const horizontalPadding = 40;
    const modIcons = document.querySelectorAll('.mod-icon');
    const modIconsWidth = modIcons.length * 70;
    const minSpacing = modIcons.length > 0 ? 20 : 0;
    
    const availableWidth = scorecardWidth - horizontalPadding - modIconsWidth - minSpacing;
    
    return Math.max(200, availableWidth);
}

// Function to adjust title size and truncation
function adjustTitleSize(title) {
    const titleElement = document.querySelector('.map-title');
    if (!titleElement) return title;

    const availableWidth = calculateTitleSpace();
    const font = `600 35px 'Fredoka', cursive`; 
    
    // Check if title fits at normal size
    const textWidth = getTextWidth(title, font);
    
    if (textWidth <= availableWidth) {
        // Title fits, no truncation needed
        titleElement.className = 'map-title';
        return title;
    }

    // Title is too long, truncate it
    let truncatedTitle = title;
    const ellipsis = '..';
    
    // Keep truncating until it fits
    while (getTextWidth(truncatedTitle + ellipsis, font) > availableWidth && truncatedTitle.length > 5) {
        truncatedTitle = truncatedTitle.slice(0, -1);
    }
    
    titleElement.className = 'map-title';
    return truncatedTitle.length < title.length ? truncatedTitle + ellipsis : truncatedTitle;
}

// Function to adjust right section text sizes
function adjustRightSectionSizes() {
    const scorecard = document.querySelector('.scorecard');
    const leftSection = document.querySelector('.left-section');
    const rightSection = document.querySelector('.right-section');
    
    if (!scorecard || !leftSection || !rightSection) return;

    const scorecardRect = scorecard.getBoundingClientRect();
    const leftRect = leftSection.getBoundingClientRect();
    const rightRect = rightSection.getBoundingClientRect();
    
    const availableWidth = scorecardRect.width - (leftRect.width + 50);
    const ppElement = document.querySelector('.pp');
    const fullComboElement = document.querySelector('.full-combo');
    
    // Adjust PP text size
    if (ppElement) {
        const ppSizes = [
            { className: 'size-large', maxWidth: 300 },
            { className: 'size-medium', maxWidth: 250 },
            { className: 'size-small', maxWidth: 200 },
            { className: 'size-tiny', maxWidth: 150 }
        ];
        
        for (const size of ppSizes) {
            if (availableWidth >= size.maxWidth) {
                ppElement.className = `pp ${size.className}`;
                break;
            }
        }
    }
    
    // Adjust Full Combo text size
    if (fullComboElement && fullComboElement.textContent) {
        const fcSizes = [
            { className: 'size-large', maxWidth: 250 },
            { className: 'size-medium', maxWidth: 200 },
            { className: 'size-small', maxWidth: 150 }
        ];
        
        for (const size of fcSizes) {
            if (availableWidth >= size.maxWidth) {
                fullComboElement.className = `full-combo ${size.className}`;
                break;
            }
        }
    }
}

// Function to calculate required height for extra content
function calculateRequiredHeight(extraText, hasFullCombo) {
    const baseHeight = 600;
    let additionalHeight = 0;
    
    // Calculate extra height needed for multi line extra text
    if (extraText) {
        const lines = extraText.split('<br>').length;
        if (lines > 2) {
            additionalHeight += (lines - 2) * 30;
        }
    }
    
    // Calculate extra height needed if full combo text overflows
    if (hasFullCombo) {
        // Extremely simplified calculation
        const rightSection = document.querySelector('.right-section');
        if (rightSection) {
            const contentHeight = rightSection.scrollHeight;
            const containerHeight = rightSection.clientHeight;
            if (contentHeight > containerHeight) {
                additionalHeight += Math.max(0, contentHeight - containerHeight + 20);
            }
        }
    }
    
    return baseHeight + additionalHeight;
}

// Function to adjust scorecard height
function adjustScorecardHeight(extraText, hasFullCombo) {
    const scorecard = document.querySelector('.scorecard');
    if (!scorecard) return;
    
    const requiredHeight = calculateRequiredHeight(extraText, hasFullCombo);
    scorecard.style.height = `${requiredHeight}px`;
}


// Save scorecard as PNG image using html-to-image library
async function saveAsPNG() {
    const scorecard = document.getElementById('scorecard-preview');
    if (!scorecard) {
        setStatus('No scorecard to save', 'error');
        return;
    }

    try {
        setStatus('Generating PNG...', 'loading');
        // Ensure all images are loaded before capture
        await waitForImages(scorecard);

        // Ensure background element exists
        scorecard.querySelector('.background-image');

        // Use html-to-image to convert scorecard to PNG
        const dataUrl = await htmlToImage.toPng(scorecard);

        // Get timestamp and split the last 6 digits
        const timestamp = Date.now().toString().slice(-6);

        // Determine filename
        const username = currentScoreData ? currentScoreData.user.username : 'guest';
        const filename = `scorecard_${username}_${timestamp}.png`

        // Create download link and "click" download
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setStatus('PNG saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving PNG:', error);
        setStatus(`Error saving PNG: ${error.message}`, 'error');
    }
}

// Helper function to wait for all images to load before PNG generation
function waitForImages(element) {
    // Get all image elements and elements with background images
    const images = element.querySelectorAll('img');
    const backgroundElements = element.querySelectorAll('[style*="background-image"]');
    
    // Create promises for all image elements
    const imagePromises = Array.from(images).map(img => {
        // If image is already loaded, resolve immediately
        if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
        }
        
        // Otherwise wait for image to load or timeout
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                console.warn('Image load timeout:', img.src);
                resolve();
            }, 5000);
            
            img.onload = () => {
                clearTimeout(timeout);
                resolve();
            };
            
            img.onerror = () => {
                clearTimeout(timeout);
                console.warn('Image failed to load:', img.src);
                resolve();
            };
        });
    });
    
    // Create promises for background images
    const backgroundPromises = Array.from(backgroundElements).map(element => {
        const style = window.getComputedStyle(element);
        const bgImage = style.backgroundImage;
        
        // If element has a background image, wait for it to load
        if (bgImage && bgImage !== 'none') {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    resolve();
                };
                img.onerror = () => {
                    console.warn('Background image failed:', extractCssBackgroundUrl(bgImage));
                    resolve();
                };
                
                // Extract url from background-image CSS property
                const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (match) {
                    img.src = match[1];
                } else {
                    resolve();
                }
            });
        }
        
        return Promise.resolve();
    });
    
    // Return promise that resolves when all images are loaded
    return Promise.all([...imagePromises, ...backgroundPromises]);
}

// Event listeners and initialization
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Load gradient colours on page initialisation
        await loadGradientColours();
    } catch (error) {
        console.error('Failed to load gradient, using fallback colours');
    }
    
    // Setup input validation for score override fields
    setupScoreValidation();
    
    // Get references to DOM elements
    const scoreIdInput = document.getElementById('scoreId');
    const mapIdInput = document.getElementById('mapId');
    const extraTextInput = document.getElementById('extraText');
    const fullComboOverride = document.getElementById('fullComboOverride');
    const backgroundOverride = document.getElementById('backgroundOverride');
    const ppOverride = document.getElementById('ppOverride');
    const lazerScoringOverride = document.getElementById('lazerScoringOverride');
    const generateBtn = document.getElementById('generateBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    // Get score override input elements
    const scoreOverrideInputs = [
        'scoreOverride', 'count300', 'count100', 'count50', 'countMiss', 'countSliderEnds',
        'comboOverride', 'accuracyOverride', 'ppScoreOverride', 'rankOverride',
        'modsOverride', 'leaderboardOverride'
    ].map(id => document.getElementById(id));
    
    // Get user override input elements
    const userOverrideInputs = [
        'usernameOverride', 'userRankOverride', 'avatarUrlOverride'
    ].map(id => document.getElementById(id));
    
    // Debouncing variables for input handling
    let debounceTimer;
    function debounce(func, delay) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(func, delay);
    }
    
    // Score ID input handler with debouncing
    scoreIdInput.addEventListener('input', function() {
        const scoreId = this.value.trim();
        if (scoreId) {
            // Debounce score fetching to avoid excessive API calls
            debounce(() => fetchScoreData(scoreId), 500);
        }
    });
    
    // Map ID input handler with debouncing
    mapIdInput.addEventListener('input', function() {
        const mapId = this.value.trim();
        if (mapId) {
            // Debounce map fetching to avoid excessive API calls
            debounce(() => fetchMapData(mapId), 500);
        }
    });
    
    // Lazer scoring checkbox handler
    lazerScoringOverride.addEventListener('change', function() {
        toggleSliderEndsInput(this.checked);
        if (currentScoreData || currentMapData) {
            if (currentScoreData) {
                updateScorecard();
            } else if (currentMapData) {
                updateScorecard();
            }
        }
    });
    
    // Live update handlers for override inputs
    [extraTextInput, fullComboOverride, backgroundOverride, ppOverride, ...scoreOverrideInputs, ...userOverrideInputs].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                if (currentScoreData || currentMapData) {
                    // Debounce scorecard updates for smooth user experience
                    debounce(() => {
                        if (currentScoreData) {
                            updateScorecard();
                        } else if (currentMapData) {
                            updateScorecard();
                        }
                    }, 300);
                }
            });
            
            // Handle checkbox and select changes immediately without debouncing
            if (input.type === 'checkbox' || input.tagName === 'SELECT') {
                input.addEventListener('change', function() {
                    if (currentScoreData) {
                        updateScorecard();
                    } else if (currentMapData) {
                        updateScorecard();
                    }
                });
            }
        }
    });
    
    // Generate button click handler
    generateBtn.addEventListener('click', function() {
        const scoreId = scoreIdInput.value.trim();
        const mapId = mapIdInput.value.trim();
        
        // Prioritize score ID if both are provided
        if (scoreId) {
            fetchScoreData(scoreId);
        } else if (mapId) {
            fetchMapData(mapId);
        }
    });
    
    // Save button click handler
    saveBtn.addEventListener('click', saveAsPNG);
});

// Toggle dropdown functionality for overrides section
function toggleDropdown() {
    const dropdownContent = document.getElementById('dropdownContent');
    const arrow = document.getElementById('arrow');
    
    if (dropdownContent.style.display === 'none' || dropdownContent.style.display === '') {
        dropdownContent.style.display = 'block';
        arrow.textContent = '▲';
    } else {
        dropdownContent.style.display = 'none';
        arrow.textContent = '▼';
    }
}