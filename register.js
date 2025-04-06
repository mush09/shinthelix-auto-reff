#!/usr/bin/env node
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');

// Configuration
const CONFIG = {
  synthelixApi: 'https://api.synthelix.io/v1/wallet/register',
  outputDir: 'synthelix_wallets',
  maxRetries: 3,
  retryDelay: 2000,
  defaultWalletCount: 1
};

class WalletRegistrar {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async init() {
    console.log('🔗 Synthelix Bulk Wallet Registration');
    console.log('-------------------------------------');

    // Create output directory
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir);
    }

    // Get user input
    const walletCount = await this.askQuestion(
      `Enter number of wallets to generate (default ${CONFIG.defaultWalletCount}): `,
      CONFIG.defaultWalletCount
    );

    const referralCode = await this.askQuestion(
      'Enter referral code (press Enter to skip): ',
      null,
      false
    );

    // Generate wallets
    await this.generateWallets(walletCount, referralCode);
    this.rl.close();
  }

  async askQuestion(question, defaultValue, isNumber = true) {
    return new Promise(resolve => {
      this.rl.question(question, answer => {
        if (!answer.trim()) return resolve(defaultValue);
        resolve(isNumber ? parseInt(answer) : answer.trim());
      });
    });
  }

  async generateWallets(count, referralCode) {
    console.log(`\n🚀 Generating ${count} wallet(s)...`);

    for (let i = 1; i <= count; i++) {
      const wallet = ethers.Wallet.createRandom();
      const fileName = `${CONFIG.outputDir}/wallet_${i}.json`;

      console.log(`\n💼 Processing Wallet ${i}/${count}`);
      console.log(`📍 Address: ${wallet.address}`);

      await this.registerWithRetry(wallet, fileName, referralCode);
    }

    console.log('\n✅ All wallets processed!');
    console.log(`📁 Check the ${CONFIG.outputDir} directory for results`);
  }

  async registerWithRetry(wallet, fileName, referralCode, attempt = 1) {
    try {
      const result = await this.registerWallet(wallet, referralCode);
      fs.writeFileSync(fileName, JSON.stringify(result, null, 2));
      console.log('🎉 Registration successful!');
      console.log(`📄 Saved to: ${fileName}`);
    } catch (error) {
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
        return this.registerWithRetry(wallet, fileName, referralCode, attempt + 1);
      }
      
      console.log('💢 Max retries reached. Moving to next wallet.');
    }
  }

  async registerWallet(wallet, referralCode) {
    const timestamp = new Date().toISOString();
    const message = `Register ${wallet.address} at ${timestamp}`;
    const signature = await wallet.signMessage(message);

    const response = await axios.post(CONFIG.synthelixApi, {
      walletAddress: wallet.address,
      referralCode: referralCode || undefined,
      signature: signature,
      message: message,
      timestamp: timestamp
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.data.success) {
      throw new Error(response.data.message || 'Registration failed');
    }

    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
      referralCode: referralCode || 'none',
      registeredAt: timestamp,
      apiResponse: response.data
    };
  }
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
