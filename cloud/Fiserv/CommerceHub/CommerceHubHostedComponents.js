const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('../../utility/utlis');

console.log('🔄 Loading CommerceHubHostedCheckout.js file...');

const generateCommerceHubSignature = (apiKey, apiSecret, requestBody, timestamp, clientRequestId) => {
  const rawSignature = `${apiKey}${clientRequestId}${timestamp}${requestBody}`;
  const hmac = crypto.createHmac('sha256', apiSecret);
  hmac.update(rawSignature);
  return hmac.digest('base64');
};

const generateCommerceHubHeaders = (body = '') => {
  const apiKey = process.env.COMMERCE_HUB_API_KEY;
  const apiSecret = process.env.COMMERCE_HUB_API_SECRET;
  const clientRequestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  
  const authorization = generateCommerceHubSignature(apiKey, apiSecret, body, timestamp, clientRequestId);
  
  return {
    'Content-Type': 'application/json',
    'Client-Request-Id': clientRequestId,
    'Api-Key': apiKey,
    'Timestamp': timestamp,
    'Auth-Token-Type': 'HMAC',
    'Authorization': authorization
  };
};

/**
 * Generate unique merchant transaction ID
 */
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `CHSDK-${shortUserId}-${timestamp}`;
};

// STEP 1: Whitelist domains for Commerce Hub

Parse.Cloud.define("commerceHubWhitelistDomains", async (request) => {
  const { domains } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Domains array is required.");
  }

  try {
    const requestBody = { domains };
    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/security/v1/saq/whitelist/domains`,
      requestBody,
      { headers }
    );

    console.log('✅ Domains whitelisted:', response.data);

    return {
      success: true,
      validDomains: response.data.validDomains || [],
      invalidDomains: response.data.invalidDomains || []
    };

  } catch (error) {
    console.error("Domain whitelist error:", error.response?.data || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || "Failed to whitelist domains"
    );
  }
});

// STEP 2: Start PaymentSession - Acquire Security Credentials
Parse.Cloud.define("commerceHubCreateCredentials", async (request) => {
  const { amount, customerInfo, billingAddress, use3DS = false } = request.params || {};

  // Don't require authentication for this function since it's called internally
  // The parent function (commerceHubInitRecharge) handles authentication
  
  if (!amount) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Amount is required.");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount: must be a positive number.");
  }

  try {
    // Get user from request or use master key
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    
    // Validate required environment variables
    const requiredEnvVars = ['COMMERCE_HUB_MERCHANT_ID', 'COMMERCE_HUB_API_KEY', 'COMMERCE_HUB_API_SECRET', 'COMMERCE_HUB_HOST_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          `${envVar} environment variable is required`
        );
      }
    }
    
    // Build credentials request with optional 3DS data
    const requestBody = {
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    // STEP 2 (3-D Secure): Add customer transaction data for 3DS
    // From 3DS Documentation:
    // "The example below contains the recommended parameters for a successful Security Credentials 
    // API request with relevant 3DS customer transaction data to create a sessionId."
    if (use3DS) {
      requestBody.amount = {
        total: parsedAmount,
        currency: "USD"
      };

      if (customerInfo) {
        requestBody.customer = {
          merchantCustomerId: user?.id || "guest",
          email: customerInfo.email || user?.get("email") || "",
          ...(customerInfo.phone && {
            phone: [{
              type: "MOBILE",
              phoneNumber: customerInfo.phone
            }]
          })
        };
      }

      if (billingAddress) {
        requestBody.billingAddress = {
          firstName: billingAddress.firstName || "",
          lastName: billingAddress.lastName || "",
          address: {
            street: billingAddress.street || "",
            houseNumberOrName: billingAddress.houseNumberOrName || "",
            city: billingAddress.city || "",
            stateOrProvince: billingAddress.stateOrProvince || "",
            postalCode: billingAddress.postalCode || "",
            country: billingAddress.country || "US"
          }
        };
      }
    }

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔑 Requesting Commerce Hub security credentials...');
    console.log('📋 Request URL:', `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`);

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`,
      requestBody,
      { headers }
    );

    const credentialsData = response.data;

    console.log('✅ Security credentials created:', credentialsData.sessionId);

    return {
      success: true,
      sessionId: credentialsData.sessionId,
      accessToken: credentialsData.accessToken,
      publicKey: credentialsData.publicKey,
      keyId: credentialsData.keyId,
      accessTokenIssuedTime: credentialsData.accessTokenIssuedTime,
      accessTokenTimeToLive: credentialsData.accessTokenTimeToLive,
      asymmetricEncryptionAlgorithm: credentialsData.asymmetricEncryptionAlgorithm,
      expiresAt: credentialsData.expiresAt
    };

  } catch (error) {
    console.error("Credentials creation error:", error.response?.data || error.message);
    console.error("Full error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || error.message || "Failed to create security credentials"
    );
  }
});

// Initialize recharge with Commerce Hub Hosted Checkout SDK
Parse.Cloud.define("commerceHubInitRecharge", async (request) => {
  const { amount, remark, customerInfo, billingAddress, use3DS = false, type = "Getways", userId: paramUserId } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  // }

  if (!amount) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Amount is required.");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount: must be a positive number.");
  }

  try {
    // Use paramUserId if provided, otherwise try request.user.id, fallback to timestamp
    const userIdForTransaction = paramUserId || request.user?.id || `USER-${Date.now()}`;
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    const merchantTransactionId = generateMerchantTransactionId(userIdForTransaction);

    // Get security credentials - call without sessionToken since it's an internal call
    const credentialsResponse = await Parse.Cloud.run(
      "commerceHubCreateCredentials", 
      {
        amount: parsedAmount,
        customerInfo,
        billingAddress,
        use3DS
      }, 
      { useMasterKey: true }
    );

    // Create transaction record - use Transactions table if type is AOG, otherwise TransactionRecords
    const isAOG = type === "AOG";
    const TableName = isAOG ? "Transactions" : "TransactionRecords";
    const TransactionDetails = Parse.Object.extend(TableName);
    const transactionDetails = new TransactionDetails();

    transactionDetails.set("type", "recharge");
    transactionDetails.set("gameId", "786");
    transactionDetails.set("username", user?.get("username") || "");
    transactionDetails.set("userId", userIdForTransaction);
    transactionDetails.set("transactionDate", new Date());
    transactionDetails.set("transactionAmount", parsedAmount);
    transactionDetails.set("remark", remark || "Commerce Hub Recharge");
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user?.get("userParentId") || "");
    transactionDetails.set("status", 1); // Pending
    transactionDetails.set("portal", "CommerceHubSDK");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("sessionId", credentialsResponse.sessionId);
    transactionDetails.set("use3DS", use3DS);
    
    // Add platform field for AOG transactions
    if (isAOG) {
      transactionDetails.set("platform", "AOGCOINCLUB");
    }

    await transactionDetails.save(null, { useMasterKey: true });

    console.log(`✅ Commerce Hub recharge initialized: ${transactionDetails.id}`);

    return {
      success: true,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      credentials: credentialsResponse
    };

  } catch (error) {
    console.error("Commerce Hub init recharge error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to initialize Commerce Hub recharge"
    );
  }
});

// STEP 6: Submit a Transaction Request - Complete Recharge
Parse.Cloud.define("commerceHubCompleteRecharge", async (request) => {
  const { 
    transactionId, 
    paymentToken, 
    authenticationTransactionId,
    transactionState,
    type = "Getways"
  } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  // }

  if (!transactionId || !paymentToken) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON, 
      "Transaction ID and payment token are required."
    );
  }

  try {
    // Get transaction record - check both tables
    const isAOG = type === "AOG";
    const TableName = isAOG ? "Transactions" : "TransactionRecords";
    const TransactionDetails = Parse.Object.extend(TableName);
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("objectId", transactionId);
    
    const transaction = await query.first({ useMasterKey: true });
    
    if (!transaction) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Transaction not found.");
    }

    if (transaction.get("status") !== 1) {
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED, 
        "Transaction is not in pending state."
      );
    }

    const amount = transaction.get("transactionAmount");
    const sessionId = transaction.get("sessionId");

    // STEP 6: Submit charges API request to Commerce Hub
    // From Documentation: "Submit a charges, tokenization, or account verification request"
    const requestBody = {
      amount: {
        total: amount,
        currency: "USD"
      },
      source: {
        sourceType: "PaymentSession",
        sessionId: sessionId
      },
      transactionDetails: {
        captureFlag: true,
        merchantTransactionId: transaction.get("merchantTransactionId")
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    // STEP 6 (3-D Secure): Add 3DS authentication details if available
    // From 3DS Documentation:
    // "After authentication has been completed with the 3DS provider, submit a charges request.
    // Include the authenticationTransactionId which will be used as a reference of 3DS authentication."
    if (authenticationTransactionId && transactionState) {
      requestBody.authenticationRequest = {
        authenticationTransactionId: authenticationTransactionId
      };
      
      transaction.set("authenticationTransactionId", authenticationTransactionId);
      transaction.set("transactionState", transactionState);
    }

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges`,
      requestBody,
      { headers }
    );

    const chargeResponse = response.data;
    const gatewayResponse = chargeResponse.gatewayResponse;

    console.log('Commerce Hub Charge Response:', gatewayResponse);

    // Check if transaction was approved
    if (gatewayResponse.transactionState === "AUTHORIZED" || 
        gatewayResponse.transactionState === "CAPTURED") {
      
      const userId = transaction.get("userId");
      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, "recharge");

      transaction.set("status", 2); // Success
      transaction.set("completedAt", new Date());
      transaction.set("gatewayTransactionId", gatewayResponse.transactionProcessingDetails?.transactionId);
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("paymentToken", paymentToken);
      
      await transaction.save(null, { useMasterKey: true });

      console.log(`✅ Commerce Hub recharge completed: ${transaction.id}`);

      return {
        success: true,
        transactionId: transaction.id,
        status: "completed",
        gatewayTransactionId: gatewayResponse.transactionProcessingDetails?.transactionId
      };

    } else if (gatewayResponse.transactionState === "DECLINED") {
      transaction.set("status", 9); // Failed
      transaction.set("failedAt", new Date());
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("failureReason", gatewayResponse.gatewayMessage || "Transaction declined");
      
      await transaction.save(null, { useMasterKey: true });

      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED, 
        `Payment declined: ${gatewayResponse.gatewayMessage || 'Unknown reason'}`
      );
    } else {
      // Other states (WAITING, PENDING, etc.)
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("paymentToken", paymentToken);
      await transaction.save(null, { useMasterKey: true });

      return {
        success: false,
        transactionId: transaction.id,
        status: gatewayResponse.transactionState,
        message: gatewayResponse.gatewayMessage || "Transaction pending"
      };
    }

  } catch (error) {
    console.error("Commerce Hub complete recharge error:", error.response?.data || error);
    
    // Try to update transaction status
    try {
      const isAOG = type === "AOG";
      const TableName = isAOG ? "Transactions" : "TransactionRecords";
      const TransactionDetails = Parse.Object.extend(TableName);
      const query = new Parse.Query(TransactionDetails);
      query.equalTo("objectId", transactionId);
      const transaction = await query.first({ useMasterKey: true });
      
      if (transaction && transaction.get("status") === 1) {
        transaction.set("status", 9); // Failed
        transaction.set("failedAt", new Date());
        transaction.set("failureReason", error.message);
        await transaction.save(null, { useMasterKey: true });
      }
    } catch (updateError) {
      console.error("Failed to update transaction status:", updateError);
    }

    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || error.message || "Failed to complete recharge"
    );
  }
});

// Cron job to check and expire old pending transactions
Parse.Cloud.define("expireOldCommerceHubTransactions", async (request) => {
  try {
    console.log("🕐 Starting Commerce Hub SDK transaction expiration check...");

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "CommerceHubSDK");
    query.equalTo("status", 1);
    query.lessThan("createdAt", thirtyMinutesAgo);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Commerce Hub SDK transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // Failed
        transaction.set("failedAt", new Date());
        transaction.set("failureReason", "Transaction expired (30 minutes timeout)");
        await transaction.save(null, { useMasterKey: true });
        
        console.log(`⏱️ Expired transaction ${transaction.id}`);
        expiredCount++;
      } catch (error) {
        console.error(`Error expiring transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Commerce Hub SDK expiration check completed: ${expiredCount} expired`);
    
    return { 
      success: true, 
      expired: expiredCount 
    };

  } catch (error) {
    console.error("Commerce Hub SDK expiration check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to expire old transactions"
    );
  }
});

// Get transaction details by ID
Parse.Cloud.define("getCommerceHubTransaction", async (request) => {
  const { transactionId } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!transactionId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Transaction ID is required.");
  }

  try {
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("objectId", transactionId);
    query.equalTo("userId", request.user.id);

    const transaction = await query.first({ useMasterKey: true });

    if (!transaction) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Transaction not found.");
    }

    return {
      success: true,
      transaction: {
        id: transaction.id,
        amount: transaction.get("transactionAmount"),
        status: transaction.get("status"),
        merchantTransactionId: transaction.get("merchantTransactionId"),
        createdAt: transaction.get("createdAt"),
        completedAt: transaction.get("completedAt"),
        gatewayState: transaction.get("gatewayState"),
        gatewayTransactionId: transaction.get("gatewayTransactionId")
      }
    };

  } catch (error) {
    console.error("Get Commerce Hub transaction error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to get transaction details"
    );
  }
});

module.exports = {
  generateCommerceHubHeaders,
  generateMerchantTransactionId
};
