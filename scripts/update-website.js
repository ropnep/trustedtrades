const fs = require('fs');
const path = require('path');

class WebsiteUpdater {
    constructor() {
        this.tradiesData = [];
    }

    async updateWebsite() {
        console.log('🔄 Updating website with new tradie data...');
        
        // Load latest verified data
        this.loadLatestData();
        
        // Process and clean data
        this.processData();
        
        // Update the HTML file
        this.updateHTML();
        
        // Generate JSON for dynamic loading
        this.generateJSON();
        
        console.log('✅ Website updated successfully');
    }

   loadLatestData() {
    const tradiesFile = path.join(__dirname, '..', 'data', 'tradies.json');
    
    if (!fs.existsSync(tradiesFile)) {
        console.log('No tradies.json found');
        return;
    }
    
    const data = JSON.parse(fs.readFileSync(tradiesFile, 'utf8'));
    this.tradiesData = data.tradies || [];
    
    console.log(`📊 Loaded ${this.tradiesData.length} tradies from tradies.json`);
}

    processData() {
        // Clean and standardize data
        this.tradiesData = this.tradiesData.map((tradie, index) => ({
            id: index + 1,
            name: tradie.business_name,
            category: tradie.trade_type,
            licensed: tradie.license_verified || false,
            licenseNumber: tradie.license_number,
            rating: tradie.rating || 4.0,
            reviewCount: tradie.review_count || 0,
            phone: tradie.phone || 'Contact via website',
            website: tradie.website,
            areas: this.extractAreas(tradie.address),
            specialties: this.generateSpecialties(tradie.trade_type),
            description: this.generateDescription(tradie),
            ownerRecommended: false, // Manual review required
            lastUpdated: new Date().toISOString()
        }));

        // Remove duplicates based on business name and phone
        this.tradiesData = this.removeDuplicates(this.tradiesData);
        
        console.log(`🧹 Processed data: ${this.tradiesData.length} unique tradies`);
    }

    extractAreas(address) {
        if (!address) return ['Perth Metro'];
        
        // Extract suburb from address
        const parts = address.split(',');
        if (parts.length >= 2) {
            return [parts[1].trim()];
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

    generateDescription(tradie) {
    const type = (tradie.trade_type || 'service provider').replace('_', ' ');
    const licensed = tradie.license_verified ? 'Licensed' : 'General';
    
    return `${licensed} ${type} providing professional services in Perth.`;
    }

    removeDuplicates(tradies) {
    const seen = new Set();
    return tradies.filter(tradie => {
        const name = tradie.name || tradie.business_name || 'Unknown';
        const phone = tradie.phone || 'No phone';
        const key = `${name.toLowerCase()}_${phone}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

    updateHTML() {
        // Update the main HTML file with new data
        const htmlPath = path.join(__dirname, '..', 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Replace the tradiesData array in the HTML
        const dataStart = htmlContent.indexOf('const tradiesData = [');
        const dataEnd = htmlContent.indexOf('];', dataStart) + 2;
        
        if (dataStart !== -1 && dataEnd !== -1) {
            const newDataString = `const tradiesData = ${JSON.stringify(this.tradiesData, null, 12)};`;
            htmlContent = htmlContent.substring(0, dataStart) + newDataString + htmlContent.substring(dataEnd);
            
            // Add last updated timestamp
            const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' });
            htmlContent = htmlContent.replace(
                /<p>&copy; 2025 Perth Trades Hub\./,
                `<p>Last updated: ${timestamp} | &copy; 2025 Perth Trades Hub.`
            );
            
            fs.writeFileSync(htmlPath, htmlContent);
            console.log('📝 HTML file updated');
        }
    }

    generateJSON() {
        // Create separate JSON file for API access
        const jsonPath = path.join(__dirname, '..', 'data', 'tradies.json');
        
        const exportData = {
            lastUpdated: new Date().toISOString(),
            totalTradies: this.tradiesData.length,
            licensedCount: this.tradiesData.filter(t => t.licensed).length,
            tradies: this.tradiesData
        };
        
        fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2));
        console.log('📋 JSON API file generated');
    }
}

// Run update
async function main() {
    const updater = new WebsiteUpdater();
    await updater.updateWebsite();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = WebsiteUpdater;