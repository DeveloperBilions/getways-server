const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading AffirmHostedCheckout.js file...');



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


// Generate unique merchant transaction ID
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `AFFIRM-${shortUserId}-${timestamp}`;
};

// STEP 1: Whitelist domains for Affirm
Parse.Cloud.define("affirmWhitelistDomains", async (request) => {
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

    console.log('✅ Domains whitelisted for Affirm:', response.data);

    return {
      success: true,
      validDomains: response.data.validDomains || [],
      invalidDomains: response.data.invalidDomains || []
    };

  } catch (error) {
    console.error("Affirm domain whitelist error:", error.response?.data || error.message);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || "Failed to whitelist domains for Affirm"
    );
  }
});

// STEP 2: Start PaymentSession - Acquire Security Credentials for Affirm
Parse.Cloud.define("affirmCreateCredentials", async (request) => {
  const { amount, customerInfo, billingAddress, shippingAddress, orderData } = request.params || {};

  // Don't require authentication for this function since it's called internally
  
  if (!amount) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Amount is required.");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount: must be a positive number.");
  }

  if (!customerInfo || !customerInfo.email) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Customer information with email is required for Affirm.");
  }

  if (!billingAddress || !billingAddress.city || !billingAddress.postalCode) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Complete billing address is required for Affirm.");
  }

  try {
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
    
    // STEP 2: Build credentials request with Affirm-specific data
    // From Documentation: "The example below contains the recommended parameters for a successful 
    // Security Credentials API request with relevant Affirm customer transaction data to create a sessionId."
    const requestBody = {
      amount: {
        total: parsedAmount,
        currency: "USD"
      },
      customer: {
        merchantCustomerId: user?.id || "guest",
        firstName: customerInfo.firstName || "",
        lastName: customerInfo.lastName || "",
        email: customerInfo.email,
        phone: customerInfo.phone ? [{
          type: "MOBILE",
          phoneNumber: customerInfo.phone
        }] : []
      },
      billingAddress: {
        firstName: billingAddress.firstName || customerInfo.firstName || "",
        lastName: billingAddress.lastName || customerInfo.lastName || "",
        address: {
          street: billingAddress.street || "",
          houseNumberOrName: billingAddress.houseNumberOrName || "",
          city: billingAddress.city,
          stateOrProvince: billingAddress.stateOrProvince || "",
          postalCode: billingAddress.postalCode,
          country: billingAddress.country || "US"
        }
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    // Add shipping address if provided (optional for physical goods)
    // From Documentation: "The shippingAddress fields are optional and only required when physical goods are being shipped."
    if (shippingAddress && shippingAddress.city && shippingAddress.postalCode) {
      requestBody.shippingAddress = {
        firstName: shippingAddress.firstName || customerInfo.firstName || "",
        lastName: shippingAddress.lastName || customerInfo.lastName || "",
        address: {
          street: shippingAddress.street || "",
          houseNumberOrName: shippingAddress.houseNumberOrName || "",
          city: shippingAddress.city,
          stateOrProvince: shippingAddress.stateOrProvince || "",
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || "US"
        }
      };
    }

    // Add order data if provided (optional for Affirm page display)
    // From Documentation: "The orderData fields are optional and only required when the merchant 
    // wants the information to be displayed on the Affirm page."
    if (orderData) {
      requestBody.orderData = orderData;
    }

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔑 Requesting Affirm credentials...');
    console.log('📋 Request URL:', `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`);

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`,
      requestBody,
      { headers }
    );

    const credentialsData = response.data;

    console.log('✅ Affirm credentials created:', credentialsData.sessionId);

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
    console.error("Affirm credentials creation error:", error.response?.data || error.message);
    console.error("Full error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || error.message || "Failed to create Affirm credentials"
    );
  }
});

// Initialize recharge with Affirm BNPL
Parse.Cloud.define("affirmInitRecharge", async (request) => {
  const { amount, remark, customerInfo, billingAddress, shippingAddress, orderData, type = "Getways", userId: paramUserId } = request.params || {};

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

    // Get security credentials for Affirm - call without sessionToken since it's an internal call
    const credentialsResponse = await Parse.Cloud.run(
      "affirmCreateCredentials", 
      {
        amount: parsedAmount,
        customerInfo,
        billingAddress,
        shippingAddress,
        orderData
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
    transactionDetails.set("remark", remark || "Affirm BNPL Recharge");
    transactionDetails.set("useWallet", false);
    transactionDetails.set("userParentId", user?.get("userParentId") || "");
    transactionDetails.set("status", 1); // Pending
    transactionDetails.set("portal", "Affirm");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("sessionId", credentialsResponse.sessionId);
    
    // Add platform field for AOG transactions
    if (isAOG) {
      transactionDetails.set("platform", "AOGCOINCLUB");
    }

    await transactionDetails.save(null, { useMasterKey: true });

    console.log(`✅ Affirm recharge initialized: ${transactionDetails.id}`);

    return {
      success: true,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      credentials: credentialsResponse
    };

  } catch (error) {
    console.error("Affirm init recharge error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to initialize Affirm recharge"
    );
  }
});

// STEP 5: Submit a Checkouts Orders request
Parse.Cloud.define("affirmCreateOrder", async (request) => {
  const { transactionId, affirmOrderId, affirmTransactionId, type = "Getways" } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  // }

  if (!transactionId || !affirmOrderId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON, 
      "Transaction ID and Affirm Order ID are required."
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

    // STEP 5: Submit Checkouts Orders API request
    // From Documentation: "The onApprove hook will contain the orderId and transactionId"
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
        merchantTransactionId: transaction.get("merchantTransactionId"),
        merchantOrderId: affirmOrderId
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔄 Creating Affirm checkout order...');

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/checkouts/orders`,
      requestBody,
      { headers }
    );

    const orderResponse = response.data;
    const gatewayResponse = orderResponse.gatewayResponse;

    console.log('✅ Affirm checkout order created:', gatewayResponse);

    // Update transaction with order details
    transaction.set("affirmOrderId", affirmOrderId);
    transaction.set("affirmTransactionId", affirmTransactionId);
    transaction.set("checkoutOrderId", gatewayResponse.transactionProcessingDetails?.orderId);
    transaction.set("gatewayTransactionId", gatewayResponse.transactionProcessingDetails?.transactionId);
    await transaction.save(null, { useMasterKey: true });

    return {
      success: true,
      orderId: affirmOrderId,
      checkoutOrderId: gatewayResponse.transactionProcessingDetails?.orderId,
      transactionId: transactionId
    };

  } catch (error) {
    console.error("Affirm create order error:", error.response?.data || error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.response?.data?.message || error.message || "Failed to create Affirm order"
    );
  }
});

// STEP 6: Authorize the Affirm Order
Parse.Cloud.define("affirmAuthorizeOrder", async (request) => {
  const { transactionId, type = "Getways" } = request.params || {};

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

    const checkoutOrderId = transaction.get("checkoutOrderId");
    if (!checkoutOrderId) {
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED, 
        "Checkout order ID not found. Please create the order first."
      );
    }

    // STEP 6: Authorize the order
    // From Documentation: "requiring a subsequent authorize request using the orderId to authorize the funds"
    const requestBody = {
      amount: {
        total: transaction.get("transactionAmount"),
        currency: "USD"
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: process.env.COMMERCE_HUB_TERMINAL_ID || "10000001"
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔄 Authorizing Affirm order...');

    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges/${checkoutOrderId}/authorization`,
      requestBody,
      { headers }
    );

    const authResponse = response.data;
    const gatewayResponse = authResponse.gatewayResponse;

    console.log('✅ Affirm authorization response:', gatewayResponse);

    // Check if authorized
    if (gatewayResponse.transactionState === "AUTHORIZED") {
      const userId = transaction.get("userId");
      const amount = transaction.get("transactionAmount");
      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, "recharge");

      transaction.set("status", 2); // Success
      transaction.set("completedAt", new Date());
      transaction.set("gatewayState", gatewayResponse.transactionState);
      
      await transaction.save(null, { useMasterKey: true });

      console.log(`✅ Affirm recharge completed: ${transaction.id}`);

      return {
        success: true,
        transactionId: transaction.id,
        status: "authorized"
      };
    } else if (gatewayResponse.transactionState === "DECLINED") {
      transaction.set("status", 9); // Failed
      transaction.set("failedAt", new Date());
      transaction.set("gatewayState", gatewayResponse.transactionState);
      transaction.set("failureReason", gatewayResponse.gatewayMessage || "Authorization declined");
      
      await transaction.save(null, { useMasterKey: true });

      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED, 
        `Authorization declined: ${gatewayResponse.gatewayMessage || 'Unknown reason'}`
      );
    } else {
      // Other states
      transaction.set("gatewayState", gatewayResponse.transactionState);
      await transaction.save(null, { useMasterKey: true });

      return {
        success: false,
        transactionId: transaction.id,
        status: gatewayResponse.transactionState,
        message: gatewayResponse.gatewayMessage || "Authorization pending"
      };
    }

  } catch (error) {
    console.error("Affirm authorize error:", error.response?.data || error);
    
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
      error.response?.data?.message || error.message || "Failed to authorize Affirm order"
    );
  }
});

// Cron job to check and expire old pending Affirm transactions

Parse.Cloud.define("expireOldAffirmTransactions", async (request) => {
  try {
    console.log("🕐 Starting Affirm transaction expiration check...");

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Affirm");
    query.equalTo("status", 1);
    query.lessThan("createdAt", thirtyMinutesAgo);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Affirm transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // Failed
        transaction.set("failedAt", new Date());
        transaction.set("failureReason", "Transaction expired (30 minutes timeout)");
        await transaction.save(null, { useMasterKey: true });
        
        console.log(`⏱️ Expired Affirm transaction ${transaction.id}`);
        expiredCount++;
      } catch (error) {
        console.error(`Error expiring Affirm transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Affirm expiration check completed: ${expiredCount} expired`);
    
    return { 
      success: true, 
      expired: expiredCount 
    };

  } catch (error) {
    console.error("Affirm expiration check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to expire old Affirm transactions"
    );
  }
});

// Get Affirm transaction details by ID
Parse.Cloud.define("getAffirmTransaction", async (request) => {
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
        affirmOrderId: transaction.get("affirmOrderId"),
        checkoutOrderId: transaction.get("checkoutOrderId"),
        createdAt: transaction.get("createdAt"),
        completedAt: transaction.get("completedAt"),
        gatewayState: transaction.get("gatewayState")
      }
    };

  } catch (error) {
    console.error("Get Affirm transaction error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED, 
      error.message || "Failed to get Affirm transaction details"
    );
  }
});

module.exports = {
  generateCommerceHubHeaders,
  generateMerchantTransactionId
};
