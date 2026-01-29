const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading PazeHostedCheckout.js file...');

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

const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `PAZE-${shortUserId}-${timestamp}`;
};

// STEP 1: Whitelist domains for Paze
Parse.Cloud.define("pazeWhitelistDomains", async (request) => {
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

    console.log('✅ Domains whitelisted for Paze:', response.data);

    return {
      success: true,
      validDomains: response.data.validDomains || [],
      invalidDomains: response.data.invalidDomains || []
    };

  } catch (error) {
    console.error("Paze domain whitelist error:", error.response?.data || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || "Failed to whitelist domains for Paze"
    );
  }
});

// STEP 2-5: Initialize Paze recharge (creates session for frontend)
Parse.Cloud.define("pazeInitRecharge", async (request) => {
  const { amount, remark, customerInfo, type = "Getways", userId: paramUserId } = request.params || {};

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

  if (!customerInfo || !customerInfo.email) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Customer email is required for Paze.");
  }

  try {
    // Use paramUserId if provided, otherwise try request.user.id, fallback to timestamp
    const userIdForTransaction = paramUserId || request.user?.id || `USER-${Date.now()}`;
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    const merchantTransactionId = generateMerchantTransactionId(userIdForTransaction);

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

    // Create Security Credentials for session
    const credentialsRequestBody = {
      amount: {
        total: parsedAmount,
        currency: "USD"
      },
      customer: {
        merchantCustomerId: userIdForTransaction,
        email: customerInfo.email
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    const bodyString = JSON.stringify(credentialsRequestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔑 Requesting Paze credentials...');

    const credentialsResponse = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`,
      credentialsRequestBody,
      { headers }
    );

    const credentialsData = credentialsResponse.data;

    console.log('✅ Paze credentials created:', credentialsData.sessionId);

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
    transactionDetails.set("remark", remark || "Paze Digital Wallet Recharge");
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user?.get("userParentId") || "");
    transactionDetails.set("status", 1); // Pending
    transactionDetails.set("portal", "Paze");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("sessionId", credentialsData.sessionId);
    transactionDetails.set("customerEmail", customerInfo.email);
    
    // Add platform field for AOG transactions
    if (isAOG) {
      transactionDetails.set("platform", "AOGCOINCLUB");
    }

    await transactionDetails.save(null, { useMasterKey: true });

    console.log(`✅ Paze recharge initialized: ${transactionDetails.id}`);

    return {
      success: true,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      sessionId: credentialsData.sessionId,
      credentials: {
        sessionId: credentialsData.sessionId,
        accessToken: credentialsData.accessToken,
        publicKey: credentialsData.publicKey,
        keyId: credentialsData.keyId,
        accessTokenIssuedTime: credentialsData.accessTokenIssuedTime,
        accessTokenTimeToLive: credentialsData.accessTokenTimeToLive,
        asymmetricEncryptionAlgorithm: credentialsData.asymmetricEncryptionAlgorithm,
        expiresAt: credentialsData.expiresAt
      }
    };

  } catch (error) {
    console.error("Paze init recharge error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to initialize Paze recharge"
    );
  }
});

// STEP 6: Submit Charges API request
Parse.Cloud.define("pazeCompleteRecharge", async (request) => {
  const { transactionId, pazeData, type = "Getways" } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  // }

  if (!transactionId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Transaction ID is required.");
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
    const merchantTransactionId = transaction.get("merchantTransactionId");

    // STEP 6: Submit Charges API request
    // From Documentation: "Submit a Charges API request with sourceType of PaymentSession"
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
        merchantTransactionId: merchantTransactionId
      },
      transactionInteraction: {
        origin: "ECOM",
        eciIndicator: "CHANNEL_ENCRYPTED",
        posConditionCode: "CARD_NOT_PRESENT_ECOM"
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔄 Submitting Paze payment to Charges API...');

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges`,
      requestBody,
      { headers }
    );

    const chargesResponse = response.data;
    const gatewayResponse = chargesResponse.gatewayResponse;

    console.log('✅ Paze charges response:', gatewayResponse);

    // Store Paze card info if provided
    if (pazeData && pazeData.card) {
      transaction.set("pazeCardLast4", pazeData.card.last4);
      transaction.set("pazeCardBrand", pazeData.card.brand);
      transaction.set("pazeCardType", pazeData.card.type);
    }

    // Store customer info if provided
    if (pazeData && pazeData.customer) {
      transaction.set("pazeCustomerName", pazeData.customer.fullName);
      transaction.set("pazeCustomerEmail", pazeData.customer.email);
    }

    // Check transaction state
    if (gatewayResponse.transactionState === "CAPTURED" || gatewayResponse.transactionState === "AUTHORIZED") {
      const userId = transaction.get("userId");
      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, "recharge");

      transaction.set("status", 2); // Success
      transaction.set("completedAt", new Date());
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("gatewayTransactionId", gatewayResponse.transactionProcessingDetails?.transactionId);
      transaction.set("orderId", gatewayResponse.transactionProcessingDetails?.orderId);
      
      await transaction.save(null, { useMasterKey: true });

      console.log(`✅ Paze recharge completed: ${transaction.id}`);

      return {
        success: true,
        transactionId: transaction.id,
        status: "completed"
      };
    } else if (gatewayResponse.transactionState === "DECLINED") {
      transaction.set("status", 9); // Failed
      transaction.set("failedAt", new Date());
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("failureReason", gatewayResponse.gatewayMessage || "Payment declined");
      
      await transaction.save(null, { useMasterKey: true });

      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED, 
        `Payment declined: ${gatewayResponse.gatewayMessage || 'Unknown reason'}`
      );
    } else {
      // Other states
      transaction.set("gatewayState", gatewayResponse.transactionState);
      await transaction.save(null, { useMasterKey: true });

      return {
        success: false,
        transactionId: transaction.id,
        status: gatewayResponse.transactionState,
        message: gatewayResponse.gatewayMessage || "Payment processing"
      };
    }

  } catch (error) {
    console.error("Paze complete payment error:", error.response?.data || error);
    
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
      error.response?.data?.message || error.message || "Failed to complete Paze payment"
    );
  }
});

//Cron job to check and expire old pending Paze transactions
Parse.Cloud.define("expireOldPazeTransactions", async (request) => {
  try {
    console.log("🕐 Starting Paze transaction expiration check...");

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Paze");
    query.equalTo("status", 1);
    query.lessThan("createdAt", thirtyMinutesAgo);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Paze transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // Failed
        transaction.set("failedAt", new Date());
        transaction.set("failureReason", "Transaction expired (30 minutes timeout)");
        await transaction.save(null, { useMasterKey: true });
        
        console.log(`⏱️ Expired Paze transaction ${transaction.id}`);
        expiredCount++;
      } catch (error) {
        console.error(`Error expiring Paze transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Paze expiration check completed: ${expiredCount} expired`);
    
    return { 
      success: true, 
      expired: expiredCount 
    };

  } catch (error) {
    console.error("Paze expiration check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to expire old Paze transactions"
    );
  }
});

// Get Paze transaction details by ID
Parse.Cloud.define("getPazeTransaction", async (request) => {
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
        sessionId: transaction.get("sessionId"),
        pazeCardLast4: transaction.get("pazeCardLast4"),
        pazeCardBrand: transaction.get("pazeCardBrand"),
        pazeCardType: transaction.get("pazeCardType"),
        createdAt: transaction.get("createdAt"),
        completedAt: transaction.get("completedAt"),
        gatewayState: transaction.get("gatewayState")
      }
    };

  } catch (error) {
    console.error("Get Paze transaction error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to get Paze transaction details"
    );
  }
});

module.exports = {
  generateCommerceHubHeaders,
  generateMerchantTransactionId
};
