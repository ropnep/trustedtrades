const fs = require('fs');
const path = require('path');

class LicenseVerifier {
    constructor() {
        this.waLicenseUrl = 'https://ols.demirs.wa.gov.au/api/search'; // Hypothetical API
        this.verifiedCount = 0;
        this.licensedCount = 0;
    }

    async verifyAllLicenses() {
        console.log('🔍 Starting license verification...');
        
        // Load latest discovered tradies
        const dataFiles = fs.readdirSync(path.join(__dirname, '..', 'data'))
            .filter(file => file.startsWith('discovered-tradies-'))
            .sort()
            .reverse();
        
        if (dataFiles.length === 0) {
            console.log('No tradie data found');
            return;
        }
        
        const latestFile = path.join(__dirname, '..', 'data', dataFiles[0]);
        const tradies = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
        
        // Verify licenses for each tradie
        for (const tradie of tradies) {
            await this.verifyLicense(tradie);
            await this.delay(200); // Rate limiting
        }
        
        console.log(`✅ License verification complete. ${this.licensedCount}/${this.verifiedCount} tradies are licensed`);
        
        // Save updated data
        this.saveUpdatedTradies(tradies);
    }

    async verifyLicense(tradie) {
        this.verifiedCount++;
        
        // Extract business name and try different variations
        const searchTerms = this.generateSearchTerms(tradie.business_name);
        
        for (const term of searchTerms) {
            const licenseInfo = await this.searchWALicense(term, tradie.trade_type);
            
            if (licenseInfo) {
                tradie.license_verified = true;
                tradie.license_number = licenseInfo.license_number;
                tradie.license_type = licenseInfo.license_type;
                tradie.license_status = licenseInfo.status;
                tradie.license_verified_date = new Date().toISOString();
                this.licensedCount++;
                console.log(`✅ Licensed: ${tradie.business_name} - ${licenseInfo.license_number}`);
                return;
            }
        }
        
        // No license found
        tradie.license_verified = false;
        tradie.license_number = null;
        tradie.license_status = 'unlicensed';
        tradie.license_verified_date = new Date().toISOString();
        console.log(`❌ Unlicensed: ${tradie.business_name}`);
    }

    generateSearchTerms(businessName) {
        const terms = [businessName];
        
        // Remove common suffixes
        const cleaned = businessName
            .replace(/\s*(pty|ltd|electrical|plumbing|services|solutions|group).*$/i, '')
            .trim();
        
        if (cleaned !== businessName) {
            terms.push(cleaned);
        }
        
        // Try just the first word (often the owner's name)
        const firstWord = businessName.split(' ')[0];
        if (firstWord.length > 3) {
            terms.push(firstWord);
        }
        
        return terms;
    }

    async searchWALicense(searchTerm, tradeType) {
        // Note: This is a simplified example
        // The actual WA licensing API may have different endpoints and requirements
        
        try {
            const licenseTypes = this.mapTradeToLicenseType(tradeType);
            
            for (const licenseType of licenseTypes) {
                // Simulated API call - replace with actual WA API
                const mockResponse = await this.mockLicenseSearch(searchTerm, licenseType);
                
                if (mockResponse.found) {
                    return {
                        license_number: mockResponse.license_number,
                        license_type: licenseType,
                        status: 'active'
                    };
                }
            }
        } catch (error) {
            console.error(`Error verifying license for ${searchTerm}:`, error);
        }
        
        return null;
    }

    mapTradeToLicenseType(tradeType) {
        const mapping = {
            'electrician': ['Electrical Contractor', 'Electrician'],
            'plumber': ['Plumbing Contractor', 'Plumber'],
            'gas_fitter': ['Gas Fitter']
        };
        
        return mapping[tradeType] || [];
    }

    // Mock function - replace with actual API call
    async mockLicenseSearch(searchTerm, licenseType) {
        // Simulate API call delay
        await this.delay(100);
        
        // Mock response - in reality, this would query the WA licensing database
        const isLicensed = Math.random() > 0.6; // 40% of tradies are licensed (realistic)
        
        if (isLicensed) {
            return {
                found: true,
                license_number: `${licenseType.substr(0, 2).toUpperCase()}${Math.floor(Math.random() * 100000)}`
            };
        }
        
        return { found: false };
    }

    saveUpdatedTradies(tradies) {
        const filename = `verified-tradies-${new Date().toISOString().split('T')[0]}.json`;
        const filepath = path.join(__dirname, '..', 'data', filename);
        
        fs.writeFileSync(filepath, JSON.stringify(tradies, null, 2));
        console.log(`💾 Verified data saved to ${filepath}`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run verification
async function main() {
    const verifier = new LicenseVerifier();
    await verifier.verifyAllLicenses();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = LicenseVerifier;