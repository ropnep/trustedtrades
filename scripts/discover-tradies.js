const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// Perth suburbs to search
const PERTH_SUBURBS = [
    'Perth WA', 'Fremantle WA', 'Joondalup WA', 'Mandurah WA'
];

const TRADE_TYPES = [
    { type: 'electrician', query: 'electrician' },
    { type: 'plumber', query: 'plumber' },
    { type: 'gas_fitter', query: 'gas fitter' }
];

class TradieDiscoveryNew {
    constructor() {
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
        this.placeDetailsUrl = 'https://places.googleapis.com/v1/places';
        this.results = [];
        this.apiCallCount = 0;
    }

    // HTTP POST request helper for new API
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

    // HTTP GET request helper for place details
    makeGetRequest(url, headers) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Perth-Trades-Hub/1.0',
                    ...headers
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        });
    }

    async searchTradies() {
        console.log('🔍 Starting tradie discovery for Perth using NEW Places API...');
        
        if (!this.apiKey) {
            console.error('❌ GOOGLE_PLACES_API_KEY environment variable not set');
            console.log('Set it with: export GOOGLE_PLACES_API_KEY="your_key_here"');
            return;
        }
        
        for (const suburb of PERTH_SUBURBS) {
            for (const trade of TRADE_TYPES) {
                await this.searchInLocation(suburb, trade);
                // Rate limiting - don't exceed API limits
                await this.delay(300);
            }
        }
        
        console.log(`✅ Discovery complete. Found ${this.results.length} businesses using ${this.apiCallCount} API calls`);
        
        // Save raw results
        this.saveResults();
        
        return this.results;
    }

    async searchInLocation(location, trade) {
        const query = `${trade.query} in ${location}`;
        console.log(`Searching: ${query}`);
        
        try {
            // Use new Text Search API
            const requestData = {
                textQuery: query,
                pageSize: 20, // Maximum results per request
                languageCode: "en"
            };

            const headers = {
                'X-Goog-Api-Key': this.apiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.regularOpeningHours,places.types,places.location'
            };

            const data = await this.makePostRequest(this.textSearchUrl, requestData, headers);
            this.apiCallCount++;
            
            if (data.places && Array.isArray(data.places)) {
                console.log(`  Found ${data.places.length} results`);
                
                for (const place of data.places) {
                    // Process each place directly from text search response
                    const processedPlace = await this.processPlace(place, trade, location);
                    
                    if (processedPlace) {
                        this.results.push(processedPlace);
                    }
                    
                    // Small delay between processing
                    await this.delay(50);
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
            // Extract data from the place object
            const placeData = {
                google_place_id: place.id,
                business_name: place.displayName?.text || 'Unknown Business',
                address: place.formattedAddress,
                phone: place.nationalPhoneNumber,
                website: place.websiteUri,
                rating: place.rating,
                review_count: place.userRatingCount,
                business_status: place.businessStatus,
                opening_hours: place.regularOpeningHours,
                google_types: place.types,
                location: place.location
            };

            // Filter out businesses that don't look like real tradies
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
        // Filter out irrelevant results
        const name = place.business_name.toLowerCase();
        const address = place.address || '';
        
        // Exclude if clearly not a tradie business
        const excludeKeywords = [
            'bunnings', 'home depot', 'hardware store', 'supply',
            'training', 'course', 'school', 'university', 'tafe',
            'warehouse', 'wholesale', 'retail', 'shop'
        ];
        
        for (const keyword of excludeKeywords) {
            if (name.includes(keyword)) {
                console.log(`  Excluded: ${place.business_name} (contains '${keyword}')`);
                return false;
            }
        }
        
        // Must be in Perth metro area
        if (!address.includes('WA') && !address.includes('Western Australia')) {
            console.log(`  Excluded: ${place.business_name} (not in WA)`);
            return false;
        }

        // Check if it's actually a relevant business type
        const types = place.google_types || [];
        const relevantTypes = [
            'electrician', 'plumber', 'contractor', 'home_improvement_store',
            'point_of_interest', 'establishment'
        ];
        
        const hasRelevantType = types.some(type => 
            relevantTypes.includes(type) || 
            type.includes('contractor') || 
            type.includes('service')
        );

        if (!hasRelevantType && types.length > 0) {
            console.log(`  Excluded: ${place.business_name} (irrelevant type: ${types.join(', ')})`);
            return false;
        }
        
        console.log(`  ✅ Valid: ${place.business_name}`);
        return true;
    }

    saveResults() {
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const filename = `discovered-tradies-${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(dataDir, filename);
        
        const summary = {
            discovery_date: new Date().toISOString(),
            api_version: 'Places API (New)',
            total_api_calls: this.apiCallCount,
            total_businesses_found: this.results.length,
            breakdown_by_trade: this.getTradeBreakdown(),
            businesses: this.results
        };
        
        fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
        console.log(`💾 Results saved to ${filepath}`);
        
        // Also save a simple summary
        console.log('\n📊 Discovery Summary:');
        console.log(`   API Version: Places API (New)`);
        console.log(`   Total API calls: ${this.apiCallCount}`);
        console.log(`   Total businesses found: ${this.results.length}`);
        Object.entries(this.getTradeBreakdown()).forEach(([trade, count]) => {
            console.log(`   ${trade}: ${count} businesses`);
        });
    }

    getTradeBreakdown() {
        const breakdown = {};
        this.results.forEach(result => {
            breakdown[result.trade_type] = (breakdown[result.trade_type] || 0) + 1;
        });
        return breakdown;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run discovery
async function main() {
    console.log('🚀 Perth Tradie Discovery Tool (NEW API)');
    console.log('==========================================');
    
    const discovery = new TradieDiscoveryNew();
    await discovery.searchTradies();
    
    console.log('\n✅ Discovery completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Check the data/ directory for results');
    console.log('   2. Run: node scripts/verify-licenses.js');
    console.log('   3. Run: node scripts/update-website.js');
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Discovery failed:', error.message);
        if (error.message.includes('API key')) {
            console.log('\n🔑 API Key Setup:');
            console.log('   1. Go to https://console.cloud.google.com');
            console.log('   2. Enable "Places API (New)"');
            console.log('   3. Create an API key');
            console.log('   4. Set: export GOOGLE_PLACES_API_KEY="your_key"');
        }
        process.exit(1);
    });
}

module.exports = TradieDiscoveryNew;