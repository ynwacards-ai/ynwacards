// YNWA Cards - Soccer Stats Updater
// Fetches real-time data from API-Football and updates player cards

const CONFIG = {
    API_KEY: 'YOUR_API_KEY_HERE', // Replace with your API key from api-football.com
    LEAGUES: {
        PREMIER_LEAGUE: 39,  // Premier League ID
        LA_LIGA: 140         // La Liga ID
    },
    SEASON: 2025,           // Current season
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    TOP_PLAYERS_COUNT: 10
};

class SoccerStatsManager {
    constructor() {
        this.apiBase = 'https://v3.football.api-sports.io';
        this.cache = this.loadCache();
    }

    // Load cached data from localStorage
    loadCache() {
        try {
            const cached = localStorage.getItem('ynwa_stats_cache');
            if (cached) {
                const data = JSON.parse(cached);
                // Check if cache is still valid (less than 24 hours old)
                if (Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
                    console.log('Using cached data');
                    return data;
                }
            }
        } catch (e) {
            console.error('Error loading cache:', e);
        }
        return null;
    }

    // Save data to cache
    saveCache(data) {
        try {
            const cacheData = {
                timestamp: Date.now(),
                players: data
            };
            localStorage.setItem('ynwa_stats_cache', JSON.stringify(cacheData));
        } catch (e) {
            console.error('Error saving cache:', e);
        }
    }

    // Fetch data from API
    async fetchFromAPI(endpoint, params = {}) {
        const url = new URL(`${this.apiBase}/${endpoint}`);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': CONFIG.API_KEY,
                    'x-rapidapi-host': 'v3.football.api-sports.io'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('API Fetch Error:', error);
            throw error;
        }
    }

    // Get top scorers from a league
    async getTopScorers(leagueId) {
        try {
            const data = await this.fetchFromAPI('players/topscorers', {
                league: leagueId,
                season: CONFIG.SEASON
            });
            return data;
        } catch (error) {
            console.error(`Error fetching top scorers for league ${leagueId}:`, error);
            return [];
        }
    }

    // Get top assists from a league
    async getTopAssists(leagueId) {
        try {
            const data = await this.fetchFromAPI('players/topassists', {
                league: leagueId,
                season: CONFIG.SEASON
            });
            return data;
        } catch (error) {
            console.error(`Error fetching top assists for league ${leagueId}:`, error);
            return [];
        }
    }

    // Combine and process player data
    async getAllPlayers() {
        // If we have valid cache, use it
        if (this.cache && this.cache.players) {
            return this.cache.players;
        }

        console.log('Fetching fresh data from API...');
        
        const allPlayers = new Map();

        // Fetch data from both leagues
        for (const [leagueName, leagueId] of Object.entries(CONFIG.LEAGUES)) {
            console.log(`Fetching data for ${leagueName}...`);
            
            const [scorers, assists] = await Promise.all([
                this.getTopScorers(leagueId),
                this.getTopAssists(leagueId)
            ]);

            // Process scorers
            scorers.forEach(item => {
                const playerId = item.player.id;
                const player = item.player;
                const stats = item.statistics[0];
                
                if (!allPlayers.has(playerId)) {
                    allPlayers.set(playerId, {
                        id: playerId,
                        name: player.name,
                        photo: player.photo,
                        team: stats.team.name,
                        league: leagueName.replace('_', ' '),
                        position: stats.games.position,
                        goals: stats.goals.total || 0,
                        assists: stats.goals.assists || 0,
                        appearances: stats.games.appearences || 0,
                        rating: stats.games.rating ? parseFloat(stats.games.rating) : 0
                    });
                }
            });

            // Update with assist data
            assists.forEach(item => {
                const playerId = item.player.id;
                if (allPlayers.has(playerId)) {
                    const playerData = allPlayers.get(playerId);
                    const stats = item.statistics[0];
                    playerData.assists = stats.goals.assists || playerData.assists;
                }
            });
        }

        // Convert to array and calculate combined stats
        const playersArray = Array.from(allPlayers.values()).map(player => ({
            ...player,
            goalsAndAssists: player.goals + player.assists,
            goalsPerGame: player.appearances > 0 ? (player.goals / player.appearances).toFixed(2) : 0
        }));

        // Sort by goals + assists
        playersArray.sort((a, b) => b.goalsAndAssists - a.goalsAndAssists);

        // Take top players
        const topPlayers = playersArray.slice(0, CONFIG.TOP_PLAYERS_COUNT);

        // Cache the results
        this.saveCache(topPlayers);

        return topPlayers;
    }

    // Calculate trend (simplified version - in production you'd compare to previous period)
    calculateTrend(player) {
        // For now, we'll use goals per game as a simple indicator
        const goalsPerGame = parseFloat(player.goalsPerGame);
        if (goalsPerGame > 0.8) return { direction: 'up', percentage: 25 };
        if (goalsPerGame > 0.5) return { direction: 'up', percentage: 15 };
        if (goalsPerGame > 0.3) return { direction: 'up', percentage: 8 };
        return { direction: 'up', percentage: 5 };
    }

    // Update the website with player data
    updateWebsite(players) {
        const playerGrid = document.querySelector('.player-grid');
        if (!playerGrid) {
            console.error('Player grid not found');
            return;
        }

        // Clear existing cards
        playerGrid.innerHTML = '';

        // Create cards for each player
        players.forEach((player, index) => {
            const trend = this.calculateTrend(player);
            const card = this.createPlayerCard(player, trend, index);
            playerGrid.appendChild(card);
        });

        // Update last updated timestamp
        this.updateTimestamp();
    }

    // Create a player card element
    createPlayerCard(player, trend, index) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.style.animationDelay = `${index * 0.1}s`;

        // Determine market value estimate (simplified)
        const marketValue = this.estimateMarketValue(player);
        
        card.innerHTML = `
            <div class="player-header">
                <div class="player-name">${player.name}</div>
                <div class="player-position">${player.position} • ${player.team}</div>
            </div>
            <div class="player-stats">
                <div class="stat-row">
                    <span class="stat-name">Goals This Season</span>
                    <span class="stat-value">${player.goals} <span class="trend-badge trend-${trend.direction}">↑ ${trend.percentage}%</span></span>
                </div>
                <div class="stat-row">
                    <span class="stat-name">Assists This Season</span>
                    <span class="stat-value">${player.assists}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-name">Goals + Assists</span>
                    <span class="stat-value">${player.goalsAndAssists} <span class="trend-badge trend-up">🔥</span></span>
                </div>
                <div class="stat-row">
                    <span class="stat-name">Goals per Game</span>
                    <span class="stat-value">${player.goalsPerGame}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-name">League</span>
                    <span class="stat-value">${player.league}</span>
                </div>
            </div>
        `;

        return card;
    }

    // Estimate market value (simplified)
    estimateMarketValue(player) {
        const baseValue = 50;
        const goalValue = player.goals * 5;
        const assistValue = player.assists * 3;
        const total = baseValue + goalValue + assistValue;
        return `€${total}M`;
    }

    // Update the last updated timestamp
    updateTimestamp() {
        let timestamp = document.getElementById('last-updated');
        if (!timestamp) {
            // Create timestamp element if it doesn't exist
            timestamp = document.createElement('div');
            timestamp.id = 'last-updated';
            timestamp.style.cssText = `
                text-align: center;
                padding: 1rem;
                color: var(--text-secondary);
                font-size: 0.9rem;
                font-family: 'IBM Plex Mono', monospace;
            `;
            const playerSection = document.getElementById('players');
            if (playerSection) {
                playerSection.querySelector('.container').appendChild(timestamp);
            }
        }

        const now = new Date();
        timestamp.innerHTML = `
            <strong>Last Updated:</strong> ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}
            <br>
            <small style="opacity: 0.7;">Stats refresh daily • Data from Premier League & La Liga</small>
        `;
    }

    // Add manual refresh button
    addRefreshButton() {
        const heroContent = document.querySelector('.hero-content');
        if (!heroContent) return;

        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'manual-refresh';
        refreshBtn.innerHTML = '🔄 Refresh Stats';
        refreshBtn.style.cssText = `
            margin-top: 2rem;
            padding: 1rem 2rem;
            background: var(--accent-yellow);
            color: var(--grass-dark);
            border: none;
            border-radius: 8px;
            font-family: 'Manrope', sans-serif;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(255, 214, 10, 0.3);
        `;

        refreshBtn.addEventListener('mouseenter', () => {
            refreshBtn.style.transform = 'translateY(-2px)';
            refreshBtn.style.boxShadow = '0 6px 20px rgba(255, 214, 10, 0.4)';
        });

        refreshBtn.addEventListener('mouseleave', () => {
            refreshBtn.style.transform = 'translateY(0)';
            refreshBtn.style.boxShadow = '0 4px 15px rgba(255, 214, 10, 0.3)';
        });

        refreshBtn.addEventListener('click', async () => {
            refreshBtn.innerHTML = '⏳ Refreshing...';
            refreshBtn.disabled = true;
            
            // Clear cache to force fresh data
            localStorage.removeItem('ynwa_stats_cache');
            this.cache = null;
            
            try {
                await this.initialize();
                refreshBtn.innerHTML = '✓ Updated!';
                setTimeout(() => {
                    refreshBtn.innerHTML = '🔄 Refresh Stats';
                    refreshBtn.disabled = false;
                }, 2000);
            } catch (error) {
                refreshBtn.innerHTML = '❌ Error';
                setTimeout(() => {
                    refreshBtn.innerHTML = '🔄 Refresh Stats';
                    refreshBtn.disabled = false;
                }, 2000);
            }
        });

        heroContent.appendChild(refreshBtn);
    }

    // Main initialization
    async initialize() {
        console.log('Initializing YNWA Stats Manager...');

        // Check if API key is set
        if (CONFIG.API_KEY === '57f67398e65a9dd967d70fe6ecfd76df') {
            console.error('⚠️ API Key not set! Please add your API key to the CONFIG object.');
            this.showAPIKeyWarning();
            return;
        }

        try {
            const players = await this.getAllPlayers();
            this.updateWebsite(players);
            console.log('✓ Stats updated successfully!');
        } catch (error) {
            console.error('Error initializing stats:', error);
            this.showError();
        }
    }

    // Show API key warning
    showAPIKeyWarning() {
        const playerGrid = document.querySelector('.player-grid');
        if (playerGrid) {
            playerGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #fff3cd; border-radius: 16px; border: 2px solid #ffc107;">
                    <h3 style="color: #856404; font-size: 1.5rem; margin-bottom: 1rem;">⚠️ API Key Required</h3>
                    <p style="color: #856404;">Please add your API-Football key to enable live stats.</p>
                    <p style="color: #856404; margin-top: 0.5rem;"><small>Edit stats-updater.js and replace YOUR_API_KEY_HERE</small></p>
                </div>
            `;
        }
    }

    // Show error message
    showError() {
        const playerGrid = document.querySelector('.player-grid');
        if (playerGrid) {
            playerGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #f8d7da; border-radius: 16px; border: 2px solid #dc3545;">
                    <h3 style="color: #721c24; font-size: 1.5rem; margin-bottom: 1rem;">❌ Error Loading Stats</h3>
                    <p style="color: #721c24;">Unable to fetch live data. Check console for details.</p>
                </div>
            `;
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    const statsManager = new SoccerStatsManager();
    statsManager.addRefreshButton();
    await statsManager.initialize();
});
