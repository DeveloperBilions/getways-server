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
    name,
    mobileNumber,
    recipient,
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
  if (!name || !mobileNumber || !recipient || !amount) {
    throw new Parse.Error(400, "Missing required fields: name, mobileNumber, recipient, amount");
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

    // Prepare simplified payout data (no payeeId/accountId needed)
    const payoutData = {
      name,
      mobileNumber,
      recipient,
      amount: parsedAmount,
      description: description || `Card payout for ${name}`
    };

    const result = await processCardPayout(payoutData);
    
    // Always create TransactionRecords entry to store API response (success or failure)
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const transaction = new TransactionRecords();
    
    // Common transaction fields
    transaction.set("userId", user.id);
    transaction.set("username", user.get("username") || "");
    transaction.set("userParentId", user.get("userParentId") || "");
    transaction.set("type", "redeem");
    transaction.set("transactionAmount", parsedAmount);
    transaction.set("gameId", "786");
    transaction.set("transactionDate", new Date());
    transaction.set("isCashOut", true);
    transaction.set("paymentMode", "GETPAY-CARD");
    transaction.set("remark", description || `Card payout for ${name}`);
    transaction.set("recipientEmail", recipient);
    transaction.set("recipientName", name);
    transaction.set("mobileNumber", mobileNumber);
    
    // CellPay API response data
    transaction.set("cellpayTransactionId", result.id);
    transaction.set("transactionIdFromStripe", result.id?.toString());
    transaction.set("cellpayMessage", result.message);
    transaction.set("cellpayAccountType", result.data?.accountType);
    transaction.set("cellpayStatusCode", result.data?.statusCode);
    transaction.set("cellpayStatus", result.data?.status);
    transaction.set("cellpayCreatedOn", result.data?.createdOn);
    transaction.set("cellpayUpdatedOn", result.data?.updatedOn);
    transaction.set("cellpayFullResponse", JSON.stringify(result));
    
    // Check if the API response indicates success
    if (result && result.id && result.message === "Payment successfully completed") {
      // Mark as pending (11) initially - will be updated by cron job
      transaction.set("status", 11); // 11 = pending (waiting for settlement)
      
      await transaction.save(null, { useMasterKey: true });

      // Deduct balance immediately after successful API response
      const newBalance = currentBalance - parsedAmount;
      wallet.set("balance", newBalance);
      await wallet.save(null, { useMasterKey: true });

      return {
        success: true,
        transactionId: transaction.id,
        cellpayTransactionId: result.id,
        payoutId: result.id,
        amount: parsedAmount,
        message: result.message || "Card payout created successfully - pending settlement"
      };
    } else {
      // Mark as failed
      transaction.set("status", 10); // 10 = failed
      
      await transaction.save(null, { useMasterKey: true });
      
      // DO NOT deduct balance for failed payments
      throw new Parse.Error(400, result.message || "Payment was not completed successfully");
    }
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
    transaction.set("portal", "GetPayCrypto");
    transaction.set("transactionIdFromStripe", result.transactionId);
    transaction.set("isCashOut", true);
    transaction.set("paymentMode", `GetPAY-${cryptoType.toUpperCase()}`);
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

async function searchPayments(startDate, endDate) {
  try {
    const response = await axios.post(
      `${PAYOUT_API_CONFIG.baseURL}/payment/search`,
      {
        startDate,
        endDate
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200) {
      console.log('Payment search successful:', response.data);
      return response.data;
    } else {
      throw new Error(`Payment search failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Payment search error:', error.message);
    console.error('Full error response:', error.response?.data);
    throw new Parse.Error(400, `Payment search failed: ${error.message}`);
  }
}

async function getPaymentById(paymentId) {
  try {
    const token = await getAuthToken();
    
    const response = await axios.get(
      `${PAYOUT_API_CONFIG.baseURL}/payment/${paymentId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (response.status === 200) {
      console.log('Get payment by ID successful:', response.data);
      return response.data;
    } else {
      throw new Error(`Get payment by ID failed with status: ${response.status}`);
    }
  } catch (error) {
    // If authentication error, retry once
    if (error.response?.status === 401) {
      console.log('Token might be expired, re-authenticating for getPaymentById...');
      authToken = null; // Reset token
      
      try {
        const newToken = await getAuthToken();
        
        const retryResponse = await axios.get(
          `${PAYOUT_API_CONFIG.baseURL}/payment/${paymentId}`,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newToken}`
            }
          }
        );
        
        if (retryResponse.status === 200) {
          console.log('Get payment by ID successful on retry:', retryResponse.data);
          return retryResponse.data;
        }
      } catch (retryError) {
        console.error('Get payment by ID retry failed:', retryError.message);
      }
    }
    
    console.error('Get payment by ID error:', error.message);
    console.error('Full error response:', error.response?.data);
    throw new Parse.Error(400, `Get payment by ID failed: ${error.message}`);
  }
}

module.exports = {
  authenticatePayoutAPI,
  processCardPayout,
  processCryptoPayout,
  getAuthToken,
  searchPayments,
  getPaymentById
};
