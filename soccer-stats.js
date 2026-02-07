// Netlify serverless function to proxy API-Football requests
// This avoids CORS issues by making API calls from the server side

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Get API key from environment variable (secure!)
    const API_KEY = process.env.API_FOOTBALL_KEY;
    
    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key not configured' })
        };
    }

    // Get query parameters
    const { endpoint, league, season } = event.queryStringParameters || {};

    if (!endpoint) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Endpoint parameter required' })
        };
    }

    // Build API URL
    const apiUrl = new URL(`https://v3.football.api-sports.io/${endpoint}`);
    if (league) apiUrl.searchParams.append('league', league);
    if (season) apiUrl.searchParams.append('season', season);

    try {
        // Make request to API-Football
        const response = await fetch(apiUrl.toString(), {
            method: 'GET',
            headers: {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            }
        });

        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }

        const data = await response.json();

        // Return successful response with CORS headers
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Error fetching from API:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                error: 'Failed to fetch data from API',
                message: error.message 
            })
        };
    }
};
