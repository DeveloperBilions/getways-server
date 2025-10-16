const axios = require('axios');

// Payout API
const PAYOUT_API_CONFIG = {
  baseURL: process.env.CELLPAY_API_BASE_URL,
  credentials: {
    username: process.env.CELLPAY_API_USERNAME,
    password: process.env.CELLPAY_API_PASSWORD,
    visitorId: process.env.CELLPAY_API_VISITOR_ID
  }
};

// Validate required environment variables
if (!PAYOUT_API_CONFIG.credentials.username || !PAYOUT_API_CONFIG.credentials.password || !PAYOUT_API_CONFIG.credentials.visitorId) {
  console.error('Missing required CellPay API environment variables: CELLPAY_API_USERNAME, CELLPAY_API_PASSWORD, CELLPAY_API_VISITOR_ID');
}

// Token storage
let authToken = null;

async function authenticatePayoutAPI() {
  try {
    const response = await axios.post(
      `${PAYOUT_API_CONFIG.baseURL}/auth/signin`,
      {
        username: PAYOUT_API_CONFIG.credentials.username,
        password: PAYOUT_API_CONFIG.credentials.password,
        visitorId: PAYOUT_API_CONFIG.credentials.visitorId
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data.token) {
      authToken = response.data.token;
      console.log('Payout API authentication successful');
      console.log('Token received:', authToken);
      return authToken;
    } else {
      throw new Error('Authentication failed - no token received');
    }
  } catch (error) {
    console.error('Payout API authentication failed:', error.message);
    console.error('Response data:', error.response?.data);
    throw new Parse.Error(500, `Payout API authentication failed: ${error.message}`);
  }
}

async function getAuthToken() {
  if (!authToken) {
    await authenticatePayoutAPI();
  }
  return authToken;
}

async function processCardPayout(payoutData) {
  try {
    const token = await getAuthToken();
    
    const response = await axios.post(
      `${PAYOUT_API_CONFIG.baseURL}/payment/?paymentType=payout-card`,
      payoutData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.status === 200) {
      console.log('Card payout successful:', response.data);
      return response.data;
    } else {
      throw new Error(`Card payout failed with status: ${response.status}`);
    }
  } catch (error) {
    // Extract proper error message from API response
    let errorMessage = error.message;
    if (error.response?.data) {
      const apiError = error.response.data;
      if (apiError.errorMessage) {
        errorMessage = apiError.errorMessage;
      } else if (apiError.error) {
        errorMessage = apiError.error;
      } else if (typeof apiError === 'string') {
        errorMessage = apiError;
      }
    }

    // If authentication error, retry once
    if (error.response?.status === 401) {
      console.log('Token might be expired, re-authenticating...');
      authToken = null; // Reset token
      
      try {
        const newToken = await getAuthToken();
        
        const retryResponse = await axios.post(
          `${PAYOUT_API_CONFIG.baseURL}/payment/?paymentType=payout-card`,
          payoutData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`
            }
          }
        );
        
        if (retryResponse.status === 200) {
          console.log('Card payout successful on retry:', retryResponse.data);
          return retryResponse.data;
        }
      } catch (retryError) {
        // Extract error from retry attempt
        if (retryError.response?.data?.errorMessage) {
          errorMessage = retryError.response.data.errorMessage;
        } else if (retryError.response?.data?.error) {
          errorMessage = retryError.response.data.error;
        }
      }
    }
    
    console.error('Card payout error:', errorMessage);
    console.error('Full error response:', error.response?.data);
    throw new Parse.Error(400, errorMessage);
  }
}

async function processCryptoPayout(payoutData) {
  try {
    const token = await getAuthToken();
    
    const response = await axios.post(
      `${PAYOUT_API_CONFIG.baseURL}/payment/?paymentType=crypto`,
      payoutData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.status === 200) {
      console.log('Crypto payout successful:', response.data);
      return response.data;
    } else {
      throw new Error(`Crypto payout failed with status: ${response.status}`);
    }
  } catch (error) {
    // Extract proper error message from API response
    let errorMessage = error.message;
    if (error.response?.data) {
      const apiError = error.response.data;
      if (apiError.errorMessage) {
        errorMessage = apiError.errorMessage;
      } else if (apiError.error) {
        errorMessage = apiError.error;
      } else if (typeof apiError === 'string') {
        errorMessage = apiError;
      }
    }

    // If authentication error, retry once
    if (error.response?.status === 401) {
      console.log('Token might be expired, re-authenticating...');
      authToken = null; // Reset token
      
      try {
        const newToken = await getAuthToken();
        
        const retryResponse = await axios.post(
          `${PAYOUT_API_CONFIG.baseURL}/payment/?paymentType=crypto`,
          payoutData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`
            }
          }
        );
        
        if (retryResponse.status === 200) {
          console.log('Crypto payout successful on retry:', retryResponse.data);
          return retryResponse.data;
        }
      } catch (retryError) {
        // Extract error from retry attempt
        if (retryError.response?.data?.errorMessage) {
          errorMessage = retryError.response.data.errorMessage;
        } else if (retryError.response?.data?.error) {
          errorMessage = retryError.response.data.error;
        }
      }
    }
    
    console.error('Crypto payout error:', errorMessage);
    console.error('Full error response:', error.response?.data);
    throw new Parse.Error(400, errorMessage);
  }
}

Parse.Cloud.define("cardPayout", async (request) => {
  const {
    payeeId,
    accountId,
    mobileNumber,
    recipient,
    name,
    amount,
    description
  } = request.params;

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  // Validate required parameters
  if (!payeeId || !accountId || !mobileNumber || !recipient || !name || !amount) {
    throw new Parse.Error(400, "Missing required fields: payeeId, accountId, mobileNumber, recipient, name, amount");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(400, "Amount must be greater than 0");
  }

  try {
    const user = await request.user.fetch({ useMasterKey: true });
    
    // Check wallet balance
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    const wallet = await walletQuery
      .equalTo("userID", user.id)
      .first({ useMasterKey: true });

    if (!wallet) {
      throw new Parse.Error(404, "Wallet not found");
    }

    const currentBalance = wallet.get("balance") || 0;
    if (currentBalance < parsedAmount) {
      throw new Parse.Error(400, "Insufficient balance");
    }

    const payoutData = {
      payeeId,
      accountId,
      mobileNumber,
      recipient,
      name,
      amount: parsedAmount,
      description: description || `Card payout for ${name}`
    };

    const result = await processCardPayout(payoutData);
    
    // Create TransactionRecords entry (matching existing structure)
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const transaction = new TransactionRecords();
    
    transaction.set("type", "redeem");
    transaction.set("gameId", "786");
    transaction.set("username", user.get("username") || "");
    transaction.set("userId", user.id);
    transaction.set("transactionDate", new Date());
    transaction.set("transactionAmount", parsedAmount);
    transaction.set("useWallet", true);
    transaction.set("userParentId", user.get("userParentId") || "");
    transaction.set("status", result.status === "PAID" ? 12 : 11); // 12=completed, 11=pending
    transaction.set("portal", "CellPayCard");
    transaction.set("transactionIdFromStripe", result.transactionId);
    transaction.set("isCashOut", true);
    transaction.set("paymentMode", "CELLPAY-CARD");
    transaction.set("remark", description || `Card payout for ${name}`);
    
    // Store additional payout-specific data
    transaction.set("payeeId", payeeId);
    transaction.set("accountId", accountId);
    transaction.set("recipientEmail", recipient);
    transaction.set("recipientName", name);
    transaction.set("mobileNumber", mobileNumber);

    await transaction.save(null, { useMasterKey: true });

    // Update wallet balance only if payout is successful
    if (result.status === "PAID") {
      const newBalance = currentBalance - parsedAmount;
      wallet.set("balance", newBalance);
      await wallet.save(null, { useMasterKey: true });
    }

    return {
      success: true,
      transactionId: transaction.id,
      payoutId: result.id,
      payeeName: result.payeeName,
      accountType: result.accountType,
      payoutTransactionId: result.transactionId,
      amount: result.amount,
      status: result.status,
      createdOn: result.createdOn,
      updatedOn: result.updatedOn,
      message: "Card payout processed successfully"
    };
  } catch (error) {
    console.error("Card payout function error:", error);
    throw error;
  }
});

Parse.Cloud.define("cryptoPayout", async (request) => {
  const {
    walletAddress,
    cryptoType,
    phoneNumber,
    amount,
    description
  } = request.params;

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  // Validate required parameters
  if (!walletAddress || !cryptoType || !phoneNumber || !amount) {
    throw new Parse.Error(400, "Missing required fields: walletAddress, cryptoType, phoneNumber, amount");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(400, "Amount must be greater than 0");
  }

  // Validate crypto type
  const supportedCryptoTypes = ['BTC', 'ETH', 'LTC', 'BCH', 'USDT', 'USDC'];
  if (!supportedCryptoTypes.includes(cryptoType.toUpperCase())) {
    throw new Parse.Error(400, `Unsupported crypto type: ${cryptoType}. Supported types: ${supportedCryptoTypes.join(', ')}`);
  }

  try {
    const user = await request.user.fetch({ useMasterKey: true });
    
    // Check wallet balance
    const Wallet = Parse.Object.extend("Wallet");
    const walletQuery = new Parse.Query(Wallet);
    const wallet = await walletQuery
      .equalTo("userID", user.id)
      .first({ useMasterKey: true });

    if (!wallet) {
      throw new Parse.Error(404, "Wallet not found");
    }

    const currentBalance = wallet.get("balance") || 0;
    if (currentBalance < parsedAmount) {
      throw new Parse.Error(400, "Insufficient balance");
    }

    const payoutData = {
      walletAddress,
      cryptoType: cryptoType.toUpperCase(),
      phoneNumber,
      amount: parsedAmount,
      description: description || `Crypto payout to ${cryptoType} wallet`
    };

    const result = await processCryptoPayout(payoutData);
    
    // Create TransactionRecords entry (matching existing structure)
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const transaction = new TransactionRecords();
    
    transaction.set("type", "redeem");
    transaction.set("gameId", "786");
    transaction.set("username", user.get("username") || "");
    transaction.set("userId", user.id);
    transaction.set("transactionDate", new Date());
    transaction.set("transactionAmount", parsedAmount);
    transaction.set("useWallet", true);
    transaction.set("userParentId", user.get("userParentId") || "");
    transaction.set("status", result.status === "PAID" ? 12 : 11); // 12=completed, 11=pending
    transaction.set("portal", "CellPayCrypto");
    transaction.set("transactionIdFromStripe", result.transactionId);
    transaction.set("isCashOut", true);
    transaction.set("paymentMode", `CELLPAY-${cryptoType.toUpperCase()}`);
    transaction.set("remark", description || `Crypto payout to ${cryptoType} wallet`);
    
    // Store additional crypto-specific data
    transaction.set("walletAddress", walletAddress);
    transaction.set("cryptoType", cryptoType.toUpperCase());
    transaction.set("phoneNumber", phoneNumber);
    if (result.btcRate) transaction.set("cryptoRate", result.btcRate);
    if (result.btcFee) transaction.set("cryptoFee", result.btcFee);

    await transaction.save(null, { useMasterKey: true });

    // Update wallet balance only if payout is successful
    if (result.status === "PAID") {
      const newBalance = currentBalance - parsedAmount;
      wallet.set("balance", newBalance);
      await wallet.save(null, { useMasterKey: true });
    }

    return {
      success: true,
      transactionId: transaction.id,
      payoutId: result.id,
      payoutTransactionId: result.transactionId,
      amount: result.amount,
      status: result.status,
      btcRate: result.btcRate,
      btcFee: result.btcFee,
      message: result.message || "Crypto payout processed successfully"
    };
  } catch (error) {
    console.error("Crypto payout function error:", error);
    throw error;
  }
});

module.exports = {
  authenticatePayoutAPI,
  processCardPayout,
  processCryptoPayout,
  getAuthToken
};
