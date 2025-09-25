const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// CONFIGURATION - ADJUST THESE TO LIMIT API CALLS
const CONFIG = {
    // Limit total API calls
    MAX_API_CALLS: 250,  // Set your limit here (250 = safe test)
    
    // Reduce suburbs (fewer suburbs = fewer calls)
    TEST_SUBURBS: [
        'Perth WA',      // Just test 2-3 suburbs first
        'Fremantle WA',
        'Joondalup WA',  // Comment out to reduce calls
        'Canning Vale WA',
        'Rockingham WA',     // Comment out to reduce calls
        'Armadale WA',  // Comment out to reduce calls
        'Mandurah WA',   // Comment out to reduce calls 
        'Ballajura WA',
        'Darch WA',
        'Wanneroo WA',
        'Morley WA',
        'Canning Vale WA',
        'Thornlie WA',
        'Hocking WA',
        'Butler WA',
        'Ellenbrook WA',
        'Midland WA',
        'Kalamunda WA',
        'Gosnells WA',
        'Bunbury WA',
        'Bayswater WA',
        'Victoria Park WA',
        'East Perth WA',
        'Subiaco WA',
        'Claremont WA',
        'Willetton WA',
        'Heathridge WA',
        'Karrinyup WA',
        'Scarborough WA',
        'Leederville WA',
        'Mount Lawley WA',
        'Cottesloe WA',
        'Applecross WA',
        'South Perth WA',
        'Como WA',
        'Bentley WA',
        'Riverton WA',
        'Wilsons Promontory WA'
    ],
    
    // Reduce trade types
    TEST_TRADES: [
        { type: 'electrician', query: 'electrician' },
        { type: 'plumber', query: 'plumber' },  // Comment out to reduce calls
        { type: 'gas_fitter', query: 'gas fitter' }
    ],
    
    // Reduce results per search
    PAGE_SIZE: 5,  // Default 20, reduce to 5 for testing
    
    // Add delay between calls (ms)
    API_DELAY: 500  // Half second between calls
};

class LimitedTradieDiscovery {
    constructor() {
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
        this.results = [];
        this.apiCallCount = 0;
        this.maxCalls = CONFIG.MAX_API_CALLS;
    }

    makePostRequest(url, data, headers) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const postData = JSON.stringify(data);
            
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Perth-Trades-Hub/1.0',
                    ...headers
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(responseData);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    async searchTradies() {
        console.log('🔍 Starting LIMITED tradie discovery...');
        console.log(`📊 Limits: ${this.maxCalls} API calls max, ${CONFIG.TEST_SUBURBS.length} suburbs, ${CONFIG.TEST_TRADES.length} trades`);
        
        if (!this.apiKey) {
            console.error('❌ GOOGLE_PLACES_API_KEY environment variable not set');
            return;
        }
        
        searchLoop:
        for (const suburb of CONFIG.TEST_SUBURBS) {
            for (const trade of CONFIG.TEST_TRADES) {
                // Check if we've hit our API limit
                if (this.apiCallCount >= this.maxCalls) {
                    console.log(`\n🛑 API LIMIT REACHED (${this.maxCalls} calls)`);
                    break searchLoop;
                }
                
                await this.searchInLocation(suburb, trade);
                await this.delay(CONFIG.API_DELAY);
            }
        }
        
        console.log(`\n📊 FINAL RESULTS:`);
        console.log(`   API calls used: ${this.apiCallCount}/${this.maxCalls}`);
        console.log(`   Businesses found: ${this.results.length}`);
        console.log(`   Estimated cost: $0 (within free tier)`);
        
        this.saveResults();
        return this.results;
    }

    async searchInLocation(location, trade) {
        const query = `${trade.query} in ${location}`;
        console.log(`\nSearching: ${query} (Call ${this.apiCallCount + 1}/${this.maxCalls})`);
        
        try {
            const requestData = {
                textQuery: query,
                pageSize: CONFIG.PAGE_SIZE,  // Limit results per call
                languageCode: "en"
            };

            const headers = {
                'X-Goog-Api-Key': this.apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.types'
            };

            const data = await this.makePostRequest(this.textSearchUrl, requestData, headers);
            this.apiCallCount++;
            
            if (data.places && Array.isArray(data.places)) {
                console.log(`  📍 Found ${data.places.length} results`);
                
                for (const place of data.places) {
                    const processedPlace = await this.processPlace(place, trade, location);
                    if (processedPlace) {
                        this.results.push(processedPlace);
                        console.log(`    ✅ ${place.displayName?.text || 'Unknown'}`);
                    }
                }
            } else {
                console.log(`  No results found`);
                if (data.error) {
                    console.log(`  Error: ${data.error.message}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error searching ${query}:`, error.message);
        }
    }

    async processPlace(place, trade, location) {
        try {
            const placeData = {
                google_place_id: place.id,
                business_name: place.displayName?.text || 'Unknown Business',
                address: place.formattedAddress,
                phone: place.nationalPhoneNumber,
                website: place.websiteUri,
                rating: place.rating,
                review_count: place.userRatingCount,
                google_types: place.types || []
            };

            // Simple validation
            if (this.isValidTradie(placeData)) {
                return {
                    ...placeData,
                    trade_type: trade.type,
                    discovered_location: location,
                    discovered_date: new Date().toISOString()
                };
            }
        } catch (error) {
            console.error(`❌ Error processing place:`, error.message);
        }
        
        return null;
    }

    isValidTradie(place) {
        const name = place.business_name.toLowerCase();
        const address = place.address || '';
        
        // Basic filtering
        const excludeKeywords = ['bunnings', 'masters'];
        
        for (const keyword of excludeKeywords) {
            if (name.includes(keyword)) {
                return false;
            }
        }
        
        // Must be in WA
        if (address && !address.includes('WA') && !address.includes('Western Australia')) {
            return false;
        }
        
        return true;
    }

  // In scripts/discover-tradies-limited.js, find the saveResults() function and replace it:

saveResults() {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Save directly to tradies.json (standard format)
    const tradiesData = {
        lastUpdated: new Date().toISOString(),
        totalTradies: this.results.length,
        apiCallsUsed: this.apiCallCount,
        tradies: this.results
    };
    
    fs.writeFileSync(path.join(dataDir, 'tradies.json'), JSON.stringify(tradiesData, null, 2));
    console.log(`💾 Results saved to data/tradies.json`);
    
    // Show summary
    console.log(`📊 Total tradies: ${this.results.length}`);
    if (this.results.length > 0) {
        console.log(`📋 Sample businesses found:`);
        this.results.slice(0, 3).forEach((business, i) => {
            console.log(`   ${i + 1}. ${business.business_name}`);
        });
    }
}

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run discovery
async function main() {
    console.log('🚀 LIMITED Perth Tradie Discovery Tool');
    console.log('=====================================');
    console.log(`🔒 Safety limits: ${CONFIG.MAX_API_CALLS} API calls max`);
    console.log(`📍 Testing: ${CONFIG.TEST_SUBURBS.length} suburbs`);
    console.log(`🔧 Testing: ${CONFIG.TEST_TRADES.length} trade types`);
    console.log(`⏱️  Delay: ${CONFIG.API_DELAY}ms between calls`);
    
    const discovery = new LimitedTradieDiscovery();
    await discovery.searchTradies();
    
    console.log('\n✅ Limited discovery completed safely!');
    console.log('\n📋 To expand search:');
    console.log('   1. Increase CONFIG.MAX_API_CALLS');
    console.log('   2. Add more suburbs to CONFIG.TEST_SUBURBS');
    console.log('   3. Add more trades to CONFIG.TEST_TRADES');
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Discovery failed:', error.message);
        process.exit(1);
    });
}

module.exports = LimitedTradieDiscovery;