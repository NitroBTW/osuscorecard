// Import packages
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const db = new sqlite3.Database("./scorecards.db")

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// osu! API credentials
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

let accessToken = null;


// create table if not exists
db.run(
  "CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY, count INTEGER)"
);

// ensure we have a row
db.get("SELECT count FROM stats WHERE id = 1", (err, row) => {
  if (!row) {
    db.run("INSERT INTO stats (id, count) VALUES (1, 0)");
  }
});

// increment endpoint
app.post("/api/scorecards/increment", (req, res) => {
  db.run("UPDATE stats SET count = count + 1 WHERE id = 1", function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// get count endpoint
app.get("/api/scorecards/count", (req, res) => {
  db.get("SELECT count FROM stats WHERE id = 1", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: row.count });
  });
});

// Function to get access token from osu! API
async function getAccessToken() {
    try {
        // Make POST request to osu! OAuth endpoint to get access token
        const response = await axios.post('https://osu.ppy.sh/oauth/token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'public'
        });
        // Store the access token from the response
        accessToken = response.data.access_token;
        return accessToken;
    } catch (error) {
        // Log any errors and rethrow them
        console.error('Error getting access token:', error);
        throw error;
    }
}

// Function to make requests to osu! API
async function makeOsuRequest(endpoint) {
    // If we don't have a token yet, get one
    if (!accessToken) {
        await getAccessToken();
    }

    try {
        // Make GET request to osu! API with authentication headers
        const response = await axios.get(`https://osu.ppy.sh/api/v2${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-api-version': '20220705'
            }
        });
        // Return the data from the response
        return response.data;
    } catch (error) {
        // Check if the error is because of expired or invalid token
        if (error.response && error.response.status === 401) {
            // Token expired, get new one
            await getAccessToken();
            // Retry the request with the new token
            const response = await axios.get(`https://osu.ppy.sh/api/v2${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'x-api-version': '20220705'
                }
            });
            return response.data;
        }
        // If it's not a token issue, rethrow the error
        throw error;
    }
}

// API route to get map data by map ID
app.get('/api/map/:mapId', async (req, res) => {
    try {
        // Extract mapId from URL parameters (FIXED: was using mapID instead of mapId)
        const { mapId } = req.params;
        
        // Get beatmap data from osu! API using our request function
        const mapData = await makeOsuRequest(`/beatmaps/${mapId}`);
        
        // Try to get HD background image
        const beatmapSetId = mapData.beatmapset?.id;
        let coverUrl = mapData.beatmapset?.covers?.['list@2x'] || '';
        if (beatmapSetId) {
            // Construct URL for HD background image
            const rawUrl = `https://assets.ppy.sh/beatmaps/${beatmapSetId}/covers/raw.jpg`;
            try {
                // Check if HD image exists by making a HEAD request
                const headResponse = await axios.head(rawUrl, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'osu-scorecard-generator/1.0'
                    }
                });
                // If HD image exists, use it
                if (headResponse.status === 200) {
                    coverUrl = rawUrl;
                    console.log(`Using HD raw background: ${rawUrl}`);
                } else {
                    console.log(`Raw image returned status ${headResponse.status}, using fallback`);
                }
            } catch (error) {
                // If HD image check fails, use fallback
                console.log('Raw image not available, using fallback:', error.message);
            }
        }
        
        // Format the data to match the expected structure
        const formattedData = {
            beatmap: {
                id: mapData.beatmapset?.id || '',                // Beatmapset ID for background fetching
                title: mapData.beatmapset?.title || '',          // Map title
                difficulty: mapData.version || '',               // Diff name
                star_rating: mapData.difficulty_rating || 0.0,   // Star rating
                cover: coverUrl,                                 // Background image URL
                creator: mapData.beatmapset?.creator || '',      // Mapper
                status: mapData.beatmapset?.status || ''         // Map status (ranked, loved, etc.)
            }
        };
        // Send the formatted data as JSON response
        res.json(formattedData);
    } catch (error) {
        // If anything goes wrong, log the error and send error response
        console.error('Error fetching map data:', error);
        res.status(500).json({ error: 'Failed to fetch map data' });
    }
});

// API route to get score data by score ID
app.get('/api/score/:scoreId', async (req, res) => {
    try {
        // Extract scoreId from URL parameters
        const { scoreId } = req.params;
        
        // Get score data from osu! API using our request function
        const scoreData = await makeOsuRequest(`/scores/${scoreId}`);
        
        // Get user rank
        const userId = scoreData.user.id;
        const userData = await makeOsuRequest(`/users/${userId}/osu`);
        const userRank = userData.statistics?.global_rank || null;
        
        // Check if this score is lazer or classic
        const isLazer = !scoreData.legacy_score_id && scoreData.has_replay !== false;
        
        // Log detection results
        console.log('Score detection:', {
            scoreId,
            legacy_score_id: scoreData.legacy_score_id,
            has_replay: scoreData.has_replay,
            total_score: scoreData.total_score,
            classic_total_score: scoreData.classic_total_score,
            isLazer: isLazer
        });
        
        // Try to get HD background image
        const beatmapSetId = scoreData.beatmapset?.id;
        let coverUrl = scoreData.beatmapset?.covers?.['list@2x'] || '';
        if (beatmapSetId) {
            // Construct URL for HD background image
            const rawUrl = `https://assets.ppy.sh/beatmaps/${beatmapSetId}/covers/raw.jpg`;
            try {
                // Check if HD image exists by making a HEAD request
                const headResponse = await axios.head(rawUrl, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'osu-scorecard-generator/1.0'
                    }
                });
                // If HD image exists, use it
                if (headResponse.status === 200) {
                    coverUrl = rawUrl;
                    console.log(`Using HD raw background: ${rawUrl}`);
                } else {
                    console.log(`Raw image returned status ${headResponse.status}, using fallback`);
                }
            } catch (error) {
                // If HD image check fails, use fallback
                console.log('Raw image not available, using fallback:', error.message);
            }
        }
        
        // Format the data
        const formattedData = {
            lazer: isLazer,
            score: {
                // Use total_score for lazer, classic_total_score for classic
                score: scoreData.total_score || 0,
                classic_score: scoreData.classic_total_score || 0,
                mods: scoreData.mods || [],                          // Array of mods
                c300: scoreData.statistics?.great || 0,             // Count of 300s
                c100: scoreData.statistics?.ok || 0,                // Count of 100s
                c50: scoreData.statistics?.meh || 0,                // Count of 50s
                cEnds: scoreData.statistics?.slider_tail_hit || 0,  // Slider ends
                cSliders: scoreData.beatmap?.count_sliders || 0,    // Total sliders in map
                misses: scoreData.statistics?.miss || 0,            // Miss count
                rank: scoreData.rank,                               // Score rank
                accuracy: scoreData.accuracy,                       // Accuracy
                time: scoreData.ended_at,                          // When score was set
                full_combo: scoreData.is_perfect_combo || false,   // Whether its a perfect combo
                max_combo: scoreData.max_combo || 0,               // Max combo achieved
                pp: scoreData.pp || 0,                             // PP
                leaderboard: scoreData.rank_global || 0           // Global leaderboard spot
            },
            beatmap: {
                id: scoreData.beatmapset?.id || '',                // Beatmapset ID
                title: scoreData.beatmapset?.title || '',          // Map title
                difficulty: scoreData.beatmap?.version || '',      // Diff name
                star_rating: scoreData.beatmap?.difficulty_rating || 0.0, // Star rating
                cover: coverUrl,                                   // Background image URL
                creator: scoreData.beatmapset?.creator || '',      // Mapper
                status: scoreData.beatmapset?.status || ''         // Status
            },
            user: {
                avatar_url: scoreData.user?.avatar_url || '',      // User profile picture
                country: scoreData.user?.country_code || '',       // Country code
                username: scoreData.user?.username || '',          // Username
                user_rank: userRank                                // Global rank
            }
        };
        // Send the formatted data as JSON response
        res.json(formattedData);
    } catch (error) {
        // If anything goes wrong, log the error and send error response
        console.error('Error fetching score:', error);
        res.status(500).json({ error: 'Failed to fetch score data' });
    }
});

// Alternative image proxy route using query parameters
app.get('/api/proxy-image/:type', async (req, res) => {
    try {
        // Get image type and url
        const { type } = req.params;
        const { url } = req.query;
        
        // Validate that URL was provided
        if (!url) {
            return res.status(400).json({ error: 'No URL provided in query parameter' });
        }
        
        // Decode the URL
        const decodedUrl = decodeURIComponent(url);
        
        // Validate the image type
        const validTypes = ['avatar', 'background'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Invalid image type' });
        }
        
        console.log(`Proxying ${type} image: ${decodedUrl}`);
        
        // Fetch the image from the external URL
        const response = await axios.get(decodedUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'osu-scorecard-generator/1.0'
            }
        });
        
        // Set HTTP headers for the image response
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
        });
        
        // Send the image data to the client
        res.send(response.data);
    } catch (error) {
        // If image fetching fails, log error and send a transparent fallback image
        console.error('Error proxying image:', error.message);
        
        // Send a 1x1 transparent PNG as fallback
        const transparentPng = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
            0x0B, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
            0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
            0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ]);
        
        // Set headers for the fallback image
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache'
        });
        res.send(transparentPng);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});