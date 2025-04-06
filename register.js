#!/usr/bin/env node
const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const readline = require('readline');
const dns = require('dns').promises;

// Configuration
const CONFIG = {
  synthelixApi: 'https://api.synthelix.io/v1/wallet/register',
  outputDir: 'synthelix_wallets',
  maxRetries: 3,
  retryDelay: 2000,
  defaultWalletCount: 1,
  dnsCheckTimeout: 5000 // 5 seconds for DNS verification
};

// Create output directory if not exists
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir);
}

async function checkNetworkConnection() {
  try {
    // Verify DNS resolution first
    const hostname = new URL(CONFIG.synthelixApi).hostname;
    await dns.resolve(hostname).catch(() => {
      throw new Error(`DNS resolution failed for ${hostname}`);
    });

    // Verify network connectivity
    await axios.get('https://google.com', { timeout: CONFIG.dnsCheckTimeout });
    return true;
  } catch (error) {
    console.error('\n🛑 Network Error:', error.message);
    console.log('Please check:');
    console.log('1. Your internet connection');
    console.log('2. DNS settings');
    console.log('3. API endpoint availability');
    return false;
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log('🔗 Synthelix Bulk Wallet Registration');
    console.log('-------------------------------------');

    // Verify network before proceeding
    if (!await checkNetworkConnection()) {
      process.exit(1);
    }

    // Rest of your existing main() function
    const walletCount = parseInt(await question(rl, 
      `\nEnter number of wallets to generate (default ${CONFIG.defaultWalletCount}): `)) 
      || CONFIG.defaultWalletCount;

    const referralCode = await question(rl,
      'Enter referral code (press Enter to skip): ');

    console.log(`\n🚀 Generating ${walletCount} wallets...`);

    for (let i = 1; i <= walletCount; i++) {
      await generateAndRegisterWallet(i, walletCount, referralCode.trim());
    }

    console.log('\n✅ All wallets processed successfully!');

  } catch (error) {
    console.error('\n💥 Critical Error:', error.message);
  } finally {
    rl.close();
  }
}

async function generateAndRegisterWallet(current, total, referralCode) {
  const wallet = ethers.Wallet.createRandom();
  const fileName = `${CONFIG.outputDir}/wallet_${current}_of_${total}_${Date.now()}.json`;

  console.log(`\n🔄 Processing wallet ${current}/${total}: ${wallet.address}`);

  let attempts = 0;
  let registered = false;

  while (attempts < CONFIG.maxRetries && !registered) {
    attempts++;
    try {
      // Additional network check before each attempt
      if (!await checkNetworkConnection()) {
        throw new Error('Network unavailable');
      }

      const result = await registerWallet(wallet, referralCode || undefined);
      fs.writeFileSync(fileName, JSON.stringify(result, null, 2));
      
      console.log(`🎉 Success! ${referralCode ? `Used code: ${referralCode}` : 'No referral code used'}`);
      console.log(`📁 Saved to: ${fileName}`);
      registered = true;

    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      console.log(`❌ Attempt ${attempts} failed: ${errorMsg}`);
      
      if (error.code === 'ENOTFOUND' || errorMsg.includes('getaddrinfo')) {
        console.log('🛑 DNS Error Detected. Please check:');
        console.log(`1. Is "api.synthelix.io" spelled correctly in config?`);
        console.log('2. Are you connected to the internet?');
        console.log('3. Try changing DNS servers (e.g., to 8.8.8.8)');
      }

      if (attempts < CONFIG.maxRetries) {
        console.log(`⏳ Retrying in ${CONFIG.retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      }
    }
  }

  if (!registered) {
    console.log(`⚠️ Failed to register wallet after ${CONFIG.maxRetries} attempts`);
  }
}

async function registerWallet(wallet, referralCode) {
  const timestamp = new Date().toISOString();
  const message = `Register ${wallet.address} at ${timestamp}`;
  const signature = await wallet.signMessage(message);

  try {
    const response = await axios.post(CONFIG.synthelixApi, {
      walletAddress: wallet.address,
      referralCode: referralCode,
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
  } catch (error) {
    // Enhance the error message for network issues
    if (error.code === 'ENOTFOUND') {
      error.message = `DNS lookup failed: ${error.hostname || CONFIG.synthelixApi}`;
    }
    throw error;
  }
}

// Helper function for questions
async function question(rl, prompt) {
  return new Promise(resolve => {
    rl.question(prompt, answer => resolve(answer));
  });
}

// Run the script
(async () => {
  try {
    require.resolve('ethers');
    require.resolve('axios');
  } catch {
    console.log('Required packages missing. Run:');
    console.log('npm install ethers axios');
    process.exit(1);
  }

  await main();
})();
