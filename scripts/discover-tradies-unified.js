const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// CONFIGURATION
const CONFIG = {
    MAX_API_CALLS: 20,
    TEST_SUBURBS: [
        'Perth WA', 
        'Fremantle WA',
        'Joondalup WA'
    ],
    TEST_TRADES: [
        { type: 'electrician', query: 'electrician' },
        { type: 'plumber', query: 'plumber' }
    ],
    PAGE_SIZE: 10,
    API_DELAY: 500
};

class UnifiedTradieDiscovery {
    constructor() {
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
        this.results = [];
        this.apiCallCount = 0;
        this.outputFile = path.join(__dirname, '..', 'data', 'tradies.json');
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
        console.log('🔍 Starting Perth tradie discovery...');
        console.log(`📊 Config: ${CONFIG.MAX_API_CALLS} calls max, ${CONFIG.TEST_SUBURBS.length} suburbs, ${CONFIG.TEST_TRADES.length} trades`);
        
        if (!this.apiKey) {
            console.error('❌ GOOGLE_PLACES_API_KEY environment variable not set');
            return;
        }

        // Load existing data to avoid duplicates
        this.loadExistingData();
        
        searchLoop:
        for (const suburb of CONFIG.TEST_SUBURBS) {
            for (const trade of CONFIG.TEST_TRADES) {
                if (this.apiCallCount >= CONFIG.MAX_API_CALLS) {
                    console.log(`\n🛑 API LIMIT REACHED (${CONFIG.MAX_API_CALLS} calls)`);
                    break searchLoop;
                }
                
                await this.searchInLocation(suburb, trade);
                await this.delay(CONFIG.API_DELAY);
            }
        }
        
        console.log(`\n📊 DISCOVERY COMPLETE:`);
        console.log(`   API calls used: ${this.apiCallCount}`);
        console.log(`   New businesses found: ${this.results.length}`);
        
        this.saveUnifiedData();
        return this.results;
    }

    loadExistingData() {
        try {
            if (fs.existsSync(this.outputFile)) {
                const existing = JSON.parse(fs.readFileSync(this.outputFile, 'utf8'));
                this.existingTradies = existing.tradies || [];
                console.log(`📋 Loaded ${this.existingTradies.length} existing tradies`);
            } else {
                this.existingTradies = [];
            }
        } catch (error) {
            console.log('⚠️  Could not load existing data, starting fresh');
            this.existingTradies = [];
        }
    }

    async searchInLocation(location, trade) {
        const query = `${trade.query} in ${location}`;
        console.log(`\nSearching: ${query} (Call ${this.apiCallCount + 1}/${CONFIG.MAX_API_CALLS})`);
        
        try {
            const requestData = {
                textQuery: query,
                pageSize: CONFIG.PAGE_SIZE,
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
                    if (processedPlace && !this.isDuplicate(processedPlace)) {
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
                id: this.generateId(),
                name: place.displayName?.text || 'Unknown Business',
                category: trade.type,
                licensed: null, // Will be determined by license verification
                licenseNumber: null,
                rating: place.rating || 0,
                reviewCount: place.userRatingCount || 0,
                phone: place.nationalPhoneNumber || 'Contact via website',
                website: place.websiteUri || null,
                areas: this.extractAreas(place.formattedAddress),
                specialties: this.generateSpecialties(trade.type),
                description: this.generateDescription(place.displayName?.text, trade.type),
                ownerRecommended: false,
                google_place_id: place.id,
                address: place.formattedAddress,
                google_types: place.types || [],
                discovered_location: location,
                discovered_date: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            if (this.isValidTradie(placeData)) {
                return placeData;
            }
        } catch (error) {
            console.error(`❌ Error processing place:`, error.message);
        }
        
        return null;
    }

    generateId() {
        return this.existingTradies.length + this.results.length + 1;
    }

    extractAreas(address) {
        if (!address) return ['Perth Metro'];
        
        const parts = address.split(',');
        if (parts.length >= 2) {
            const area = parts[1].trim().replace(' WA', '');
            return [area];
        }
        
        return ['Perth Metro'];
    }

    generateSpecialties(tradeType) {
        const specialties = {
            'electrician': ['General electrical', 'Repairs', 'Installations'],
            'plumber': ['General plumbing', 'Repairs', 'Maintenance'],
            'gas_fitter': ['Gas installations', 'Gas repairs', 'Safety inspections']
        };
        
        return specialties[tradeType] || ['General services'];
    }

    generateDescription(businessName, tradeType) {
        const type = tradeType.replace('_', ' ');
        return `Professional ${type} services in Perth metro area.`;
    }

    isDuplicate(newTradie) {
        const allTradies = [...this.existingTradies, ...this.results];
        
        return allTradies.some(existing => 
            existing.name.toLowerCase() === newTradie.name.toLowerCase() ||
            (existing.phone && newTradie.phone && existing.phone === newTradie.phone) ||
            (existing.google_place_id && existing.google_place_id === newTradie.google_place_id)
        );
    }

    isValidTradie(place) {
        const name = place.name.toLowerCase();
        const address = place.address || '';
        
        // Exclude obvious non-tradies
        const excludeKeywords = [
            'bunnings', 'masters', 'home depot', 'warehouse', 'wholesale'
        ];
        
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

    saveUnifiedData() {
        const dataDir = path.dirname(this.outputFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Combine existing and new tradies
        const allTradies = [...this.existingTradies, ...this.results];
        
        const unifiedData = {
            lastUpdated: new Date().toISOString(),
            totalTradies: allTradies.length,
            newTradiesAdded: this.results.length,
            apiCallsUsed: this.apiCallCount,
            breakdown: this.getTradeBreakdown(allTradies),
            tradies: allTradies
        };
        
        fs.writeFileSync(this.outputFile, JSON.stringify(unifiedData, null, 2));
        console.log(`\n💾 Unified data saved to data/tradies.json`);
        console.log(`📊 Total tradies in database: ${allTradies.length}`);
        
        // Show breakdown
        Object.entries(unifiedData.breakdown).forEach(([trade, count]) => {
            console.log(`   ${trade}: ${count} businesses`);
        });
    }

    getTradeBreakdown(tradies) {
        const breakdown = {};
        tradies.forEach(tradie => {
            breakdown[tradie.category] = (breakdown[tradie.category] || 0) + 1;
        });
        return breakdown;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run discovery
async function main() {
    console.log('🚀 Perth Tradie Discovery (Unified Output)');
    console.log('==========================================');
    
    const discovery = new UnifiedTradieDiscovery();
    await discovery.searchTradies();
    
    console.log('\n✅ Discovery completed! Data saved to data/tradies.json');
    console.log('\n📋 Next step: Your website will automatically use this data');
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Discovery failed:', error.message);
        process.exit(1);
    });
}

module.exports = UnifiedTradieDiscovery;