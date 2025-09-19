const fs = require('fs');
const path = require('path');

class UnifiedWebsiteUpdater {
    constructor() {
        this.tradiesFile = path.join(__dirname, '..', 'data', 'tradies.json');
        this.htmlFile = path.join(__dirname, '..', 'index.html');
        this.tradiesData = [];
    }

    async updateWebsite() {
        console.log('🔄 Updating website with unified tradie data...');
        
        // Load data from tradies.json
        this.loadTradiesData();
        
        // Update the HTML file
        this.updateHTML();
        
        console.log('✅ Website updated successfully!');
        console.log(`📊 Website now shows ${this.tradiesData.length} Perth tradies`);
    }

    loadTradiesData() {
        try {
            // First try unified format (data/tradies.json)
            if (fs.existsSync(this.tradiesFile)) {
                const data = JSON.parse(fs.readFileSync(this.tradiesFile, 'utf8'));
                this.tradiesData = data.tradies || [];
                console.log(`📊 Loaded ${this.tradiesData.length} tradies from data/tradies.json`);
            } else {
                // Fallback: try to find discovery files
                const dataDir = path.join(__dirname, '..', 'data');
                const files = fs.readdirSync(dataDir).filter(f => 
                    f.startsWith('limited-discovery-') || f.startsWith('discovered-tradies-')
                );
                
                if (files.length === 0) {
                    console.log('❌ No tradie data found. Run discovery script first.');
                    return;
                }
                
                const latestFile = files.sort().reverse()[0];
                console.log(`📊 Loading data from ${latestFile}`);
                
                const data = JSON.parse(fs.readFileSync(path.join(dataDir, latestFile), 'utf8'));
                this.tradiesData = data.businesses || data.valid_businesses || [];
                
                // Convert to expected format
                this.tradiesData = this.tradiesData.map((tradie, index) => ({
                    id: index + 1,
                    name: tradie.business_name || tradie.name || 'Unknown Business',
                    category: tradie.trade_type || tradie.category || 'general',
                    licensed: tradie.license_verified || false,
                    licenseNumber: tradie.license_number || null,
                    rating: tradie.rating || 0,
                    reviewCount: tradie.review_count || tradie.userRatingCount || 0,
                    phone: tradie.phone || tradie.nationalPhoneNumber || 'Contact via website',
                    website: tradie.website || tradie.websiteUri || null,
                    areas: this.extractAreas(tradie.address || tradie.formattedAddress),
                    specialties: this.generateSpecialties(tradie.trade_type || tradie.category),
                    description: this.generateDescription(tradie.business_name || tradie.name, tradie.trade_type || tradie.category),
                    ownerRecommended: tradie.ownerRecommended || false,
                    address: tradie.address || tradie.formattedAddress || '',
                    lastUpdated: new Date().toISOString()
                }));
            }
            
            console.log(`📊 Total tradies loaded: ${this.tradiesData.length}`);
            
        } catch (error) {
            console.error('❌ Error loading tradies data:', error.message);
            this.tradiesData = [];
        }
    }

    extractAreas(address) {
        if (!address) return ['Perth Metro'];
        
        const parts = address.split(',');
        if (parts.length >= 2) {
            const area = parts[1].trim().replace(' WA', '').replace('WA', '').trim();
            return area ? [area] : ['Perth Metro'];
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
        const type = tradeType ? tradeType.replace('_', ' ') : 'service provider';
        return `Professional ${type} services in Perth metro area.`;
    }

    updateHTML() {
        try {
            if (!fs.existsSync(this.htmlFile)) {
                console.error('❌ index.html not found');
                return;
            }

            let htmlContent = fs.readFileSync(this.htmlFile, 'utf8');
            
            // Find and replace the tradiesData array
            const dataStart = htmlContent.indexOf('const tradiesData = [');
            const dataEnd = htmlContent.indexOf('];', dataStart);
            
            if (dataStart === -1 || dataEnd === -1) {
                console.error('❌ Could not find tradiesData array in index.html');
                return;
            }

            // Create the new data string with proper formatting
            const newDataString = `const tradiesData = ${JSON.stringify(this.tradiesData, null, 12)};`;
            
            // Replace the old data with new data
            const before = htmlContent.substring(0, dataStart);
            const after = htmlContent.substring(dataEnd + 2); // +2 for '];'
            htmlContent = before + newDataString + after;
            
            // Add last updated timestamp to footer
            const timestamp = new Date().toLocaleString('en-AU', { 
                timeZone: 'Australia/Perth',
                year: 'numeric',
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            htmlContent = htmlContent.replace(
                /(<p>&copy; 2025 Perth Trades Hub\.)/,
                `<p>Last updated: ${timestamp} | $1`
            );
            
            // Write the updated HTML
            fs.writeFileSync(this.htmlFile, htmlContent);
            console.log('📝 Updated index.html with real tradie data');
            
        } catch (error) {
            console.error('❌ Error updating HTML:', error.message);
        }
    }

    generateSummary() {
        if (this.tradiesData.length === 0) {
            return;
        }

        console.log('\n📋 Website Summary:');
        console.log(`   Total tradies: ${this.tradiesData.length}`);
        
        const licensed = this.tradiesData.filter(t => t.licensed === true).length;
        const withRatings = this.tradiesData.filter(t => t.rating > 0).length;
        const ownerRecommended = this.tradiesData.filter(t => t.ownerRecommended).length;
        
        console.log(`   Licensed: ${licensed}`);
        console.log(`   With ratings: ${withRatings}`);
        console.log(`   Owner recommended: ${ownerRecommended}`);
        
        // Show sample tradies
        console.log('\n📝 Sample listings:');
        this.tradiesData.slice(0, 3).forEach((tradie, i) => {
            console.log(`   ${i + 1}. ${tradie.name}`);
            console.log(`      Category: ${tradie.category}`);
            console.log(`      Rating: ${tradie.rating}/5 (${tradie.reviewCount} reviews)`);
            console.log(`      Areas: ${tradie.areas.join(', ')}`);
        });
    }
}

// Run update
async function main() {
    console.log('🚀 Perth Tradie Website Updater');
    console.log('===============================');
    
    const updater = new UnifiedWebsiteUpdater();
    await updater.updateWebsite();
    updater.generateSummary();
    
    console.log('\n✅ Website update completed!');
    console.log('📱 Your website now shows real Perth tradies');
    console.log('🌐 Open index.html to see the results');
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Website update failed:', error.message);
        process.exit(1);
    });
}

module.exports = UnifiedWebsiteUpdater;