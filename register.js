#!/usr/bin/env node
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const dns = require('dns').promises;

// Configuration with fallback options
const CONFIG = {
  apiEndpoints: [
    'https://api.synthelix.io/v1/wallet/register',
    'https://synthelix-api.herokuapp.com/register',
    'https://synthelix-api.alwaysdata.net/register'
  ],
  outputDir: 'synthelix_wallets',
  maxRetries: 3,
  retryDelay: 2000,
  dnsTimeout: 5000,
  connectionTimeout: 10000
};

class WalletRegistrar {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.currentEndpoint = 0;
  }

  async checkEndpointReachable(url) {
    try {
      const { hostname } = new URL(url);
      await dns.lookup(hostname, { timeout: CONFIG.dnsTimeout });
      return true;
    } catch (error) {
      console.log(`⚠️  Endpoint unreachable: ${url}`);
      return false;
    }
  }

  async getWorkingEndpoint() {
    for (let i = 0; i < CONFIG.apiEndpoints.length; i++) {
      const endpoint = CONFIG.apiEndpoints[i];
      if (await this.checkEndpointReachable(endpoint)) {
        console.log(`✓ Using endpoint: ${endpoint}`);
        return endpoint;
      }
    }
    throw new Error('No working API endpoints available');
  }

  async init() {
    try {
      console.log('🔍 Checking API availability...');
      this.activeEndpoint = await this.getWorkingEndpoint();
      
      // Rest of your initialization code...
      await this.runRegistration();

    } catch (error) {
      console.error('❌ Critical error:', error.message);
      console.log('Possible solutions:');
      console.log('1. Check your internet connection');
      console.log('2. Verify api.synthelix.io is not blocked');
      console.log('3. Try again later');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async registerWallet(wallet, referralCode) {
    try {
      const timestamp = new Date().toISOString();
      const message = `Register ${wallet.address} at ${timestamp}`;
      const signature = await wallet.signMessage(message);

      const response = await axios.post(this.activeEndpoint, {
        walletAddress: wallet.address,
        referralCode: referralCode || undefined,
        signature: signature,
        message: message,
        timestamp: timestamp
      }, {
        timeout: CONFIG.connectionTimeout,
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Registration failed');
      }

      return response.data;

    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.log('🔁 Switching to backup endpoint...');
        this.activeEndpoint = await this.getWorkingEndpoint();
        return this.registerWallet(wallet, referralCode);
      }
      throw error;
    }
  }

  // ... rest of your class methods ...
}

// Run the application
(async () => {
  try {
    require.resolve('ethers');
    require.resolve('axios');
  } catch {
    console.log('Required packages missing. Run:');
    console.log('npm install ethers axios');
    process.exit(1);
  }

  await new WalletRegistrar().init();
})();
