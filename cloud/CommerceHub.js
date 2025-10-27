const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading CommerceHub.js file...');

// Utility function to generate unique merchant transaction IDs
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `CH-${shortUserId}-${timestamp}`;
};

// Utility function to generate HMAC signature for Commerce Hub API
const generateCommerceHubSignature = (apiKey, apiSecret, requestBody, timestamp, clientRequestId) => {
  const rawSignature = `${apiKey}${clientRequestId}${timestamp}${requestBody}`;
  const hmac = crypto.createHmac('sha256', apiSecret);
  hmac.update(rawSignature);
  return hmac.digest('base64');
};

// Utility function to generate headers for Commerce Hub API requests
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

// Get Commerce Hub credentials (Step 3 from documentation)
Parse.Cloud.define("commerceHubGetCredentials", async (request) => {
  const { 
    amount, 
    remark,
    orderId,
    customerInfo
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  // Validate required fields
  if (!amount) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Amount is required."
    );
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Invalid amount: must be a positive number."
    );
  }

  try {
    const merchantTransactionId = generateMerchantTransactionId(request.user.id);
    const finalOrderId = orderId || `ORDER-${Date.now()}`;
    
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

    // Prepare security credentials request (as per documentation Step 3)
    const requestBody = {
      amount: {
        currency: "USD",
        total: parsedAmount
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: "10000001"
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('🔑 Requesting Commerce Hub security credentials...');
    console.log('📋 Request body:', bodyString);
    console.log('📋 Headers:', JSON.stringify(headers, null, 2));

    // Make API call to get security credentials
    try {
      const response = await axios.post(
        `${process.env.COMMERCE_HUB_HOST_URL}/payments-vas/v1/security/credentials`,
        requestBody,
        { headers }
      );

      if (!response.data || !response.data.sessionId) {
        console.error('Commerce Hub API Error:', response.data);
        throw new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          `Commerce Hub API error: Unable to get credentials`
        );
      }

      const credentialsData = response.data;
      
      // Save transaction record
      const TransactionDetails = Parse.Object.extend("TransactionRecords");
      const transactionDetails = new TransactionDetails();
      const user = await request.user.fetch({ useMasterKey: true });

      transactionDetails.set("type", "recharge");
      transactionDetails.set("gameId", "786");
      transactionDetails.set("username", user.get("username") || "");
      transactionDetails.set("userId", user.id);
      transactionDetails.set("transactionDate", new Date());
      transactionDetails.set("transactionAmount", parsedAmount);
      transactionDetails.set("remark", remark);
      transactionDetails.set("useWallet", false);
      transactionDetails.set("userParentId", user.get("userParentId") || "");
      transactionDetails.set("status", 1); // pending
      transactionDetails.set("portal", "CommerceHub");
      transactionDetails.set("merchantTransactionId", merchantTransactionId);
      transactionDetails.set("commerceHubOrderId", finalOrderId);
      transactionDetails.set("commerceHubSessionId", credentialsData.sessionId || "");
      transactionDetails.set("commerceHubAccessToken", credentialsData.accessToken || "");

      await transactionDetails.save(null, { useMasterKey: true });

      console.log('✅ Commerce Hub credentials obtained successfully');

      return {
        success: true,
        sessionId: credentialsData.sessionId,
        accessToken: credentialsData.accessToken,
        publicKey: credentialsData.publicKey,
        keyId: credentialsData.keyId,
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        merchantTransactionId: merchantTransactionId,
        transactionId: transactionDetails.id,
        amount: parsedAmount,
        expiresAt: credentialsData.expiresAt,
        environment: process.env.COMMERCE_HUB_ENVIRONMENT || 'CERT'
      };

    } catch (apiError) {
      // Log detailed error information
      console.error("❌ Commerce Hub API Error Details:");
      console.error("Status:", apiError.response?.status);
      console.error("Status Text:", apiError.response?.statusText);
      console.error("Response Data:", JSON.stringify(apiError.response?.data, null, 2));
      console.error("Request Headers:", JSON.stringify(apiError.config?.headers, null, 2));
      console.error("Request Data:", apiError.config?.data);
      
      // Extract error message from response
      const errorData = apiError.response?.data;
      let errorMessage = "Failed to get Commerce Hub credentials";
      
      if (errorData?.error && Array.isArray(errorData.error)) {
        errorMessage = errorData.error.map(e => `${e.field}: ${e.message}`).join(', ');
      } else if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData?.gatewayResponse?.transactionState) {
        errorMessage = `Gateway error: ${errorData.gatewayResponse.transactionState}`;
      }
      
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        errorMessage
      );
    }

  } catch (error) {
    console.error("Commerce Hub credentials error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.response?.data?.error?.message || error.message || "Failed to get Commerce Hub credentials"
    );
  }
});

// Process Commerce Hub Payment (Step 6 from documentation)
Parse.Cloud.define("commerceHubProcessPayment", async (request) => {
  const { 
    sessionId,
    transactionId
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  if (!sessionId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Session ID is required."
    );
  }

  try {
    // Prepare charges request (as per documentation Step 6)
    const requestBody = {
      source: {
        sourceType: "PaymentSession",
        sessionId: sessionId
      },
      transactionDetails: {
        captureFlag: true
      },
      transactionInteraction: {
        origin: "ECOM",
        eciIndicator: "CHANNEL_ENCRYPTED",
        posConditionCode: "CARD_NOT_PRESENT_ECOM"
      },
      merchantDetails: {
        merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
        terminalId: "10000001"
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateCommerceHubHeaders(bodyString);

    console.log('💳 Processing Commerce Hub payment...');

    // Make API call to process payment
    const response = await axios.post(
      `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges`,
      requestBody,
      { headers }
    );

    if (!response.data) {
      console.error('Commerce Hub Payment Error:', response.data);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Commerce Hub payment error`
      );
    }

    const paymentData = response.data;
    const transactionState = paymentData.gatewayResponse?.transactionState;
    const approvalStatus = paymentData.paymentReceipt?.processorResponseDetails?.approvalStatus;
    
    console.log(`📋 Payment Status - State: ${transactionState}, Approval: ${approvalStatus}`);

    // Find and update transaction record
    if (transactionId) {
      const TransactionDetails = Parse.Object.extend("TransactionRecords");
      const query = new Parse.Query(TransactionDetails);
      const transaction = await query.get(transactionId, { useMasterKey: true });

      if (transaction) {
        if (transactionState === "AUTHORIZED" && approvalStatus === "APPROVED") {
          // Payment successful
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");

          // Update pot balance
          const parentUserId = await getParentUserId(userId);
          await updatePotBalance(parentUserId, amount, "recharge");
          
          transaction.set("status", 2); // completed
          transaction.set("commerceHubTransactionState", transactionState);
          transaction.set("commerceHubApprovalStatus", approvalStatus);
          transaction.set("commerceHubApprovalCode", paymentData.paymentReceipt?.processorResponseDetails?.approvalCode);
          transaction.set("commerceHubTransactionId", paymentData.gatewayResponse?.transactionProcessingDetails?.transactionId);
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`✅ Payment completed successfully`);
          
          return {
            success: true,
            status: "APPROVED",
            transactionId: transactionId,
            paymentData: paymentData
          };
        } else {
          // Payment failed or declined
          transaction.set("status", 9); // failed
          transaction.set("commerceHubTransactionState", transactionState);
          transaction.set("commerceHubApprovalStatus", approvalStatus);
          transaction.set("failedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Payment failed - State: ${transactionState}, Status: ${approvalStatus}`);
          
          return {
            success: false,
            status: approvalStatus || "FAILED",
            message: paymentData.paymentReceipt?.processorResponseDetails?.responseMessage || "Payment failed",
            paymentData: paymentData
          };
        }
      }
    }

    return {
      success: transactionState === "AUTHORIZED" && approvalStatus === "APPROVED",
      status: approvalStatus || transactionState,
      paymentData: paymentData
    };

  } catch (error) {
    console.error("Commerce Hub payment processing error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.response?.data?.error?.message || error.message || "Failed to process Commerce Hub payment"
    );
  }
});

// Check Commerce Hub Payment Status and Update Balance
Parse.Cloud.define("checkCommerceHubPaymentsRecharge", async (request) => {
  try {
    console.log("🔄 Starting Commerce Hub payment status check...");

    // Find all pending Commerce Hub transactions
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "CommerceHub");
    query.equalTo("status", 1); // pending
    query.limit(100);

    const pendingTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${pendingTransactions.length} pending Commerce Hub transactions`);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        const sessionId = transaction.get("commerceHubSessionId");
        if (!sessionId) {
          console.log(`⚠️ No session ID for transaction ${transaction.id}`);
          continue;
        }

        // Try to process the payment
        const requestBody = {
          source: {
            sourceType: "PaymentSession",
            sessionId: sessionId
          },
          transactionDetails: {
            captureFlag: true
          },
          transactionInteraction: {
            origin: "ECOM",
            eciIndicator: "CHANNEL_ENCRYPTED",
            posConditionCode: "CARD_NOT_PRESENT_ECOM"
          },
          merchantDetails: {
            merchantId: process.env.COMMERCE_HUB_MERCHANT_ID,
            terminalId: "10000001"
          }
        };

        const bodyString = JSON.stringify(requestBody);
        const headers = generateCommerceHubHeaders(bodyString);

        const response = await axios.post(
          `${process.env.COMMERCE_HUB_HOST_URL}/payments/v1/charges`,
          requestBody,
          { headers }
        );

        if (!response.data) {
          console.log(`❌ Commerce Hub API error for transaction ${transaction.id}`);
          continue;
        }

        const paymentData = response.data;
        const transactionState = paymentData.gatewayResponse?.transactionState;
        const approvalStatus = paymentData.paymentReceipt?.processorResponseDetails?.approvalStatus;
        
        console.log(`📋 Transaction ${transaction.id} - State: ${transactionState}, Status: ${approvalStatus}`);

        if (transactionState === "AUTHORIZED" && approvalStatus === "APPROVED") {
          // Payment successful
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");

          // Update pot balance
          const parentUserId = await getParentUserId(userId);
          await updatePotBalance(parentUserId, amount, "recharge");
          
          transaction.set("status", 2); // completed
          transaction.set("commerceHubTransactionState", transactionState);
          transaction.set("commerceHubApprovalStatus", approvalStatus);
          transaction.set("commerceHubApprovalCode", paymentData.paymentReceipt?.processorResponseDetails?.approvalCode);
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`✅ Transaction ${transaction.id} completed successfully`);
          successCount++;
        } else if (approvalStatus === "DECLINED" || transactionState === "DECLINED") {
          // Payment failed
          transaction.set("status", 9); // failed
          transaction.set("commerceHubTransactionState", transactionState);
          transaction.set("commerceHubApprovalStatus", approvalStatus);
          transaction.set("failedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Transaction ${transaction.id} failed`);
          failedCount++;
        }

        processedCount++;
      } catch (error) {
        if (error.response?.status === 404 || error.response?.data?.error?.type === "INVALID_SESSION") {
          console.log(`⚠️ Session expired for transaction ${transaction.id}`);
        } else {
          console.error(`Error processing transaction ${transaction.id}:`, error.message);
        }
        failedCount++;
      }
    }

    console.log(`🏁 Commerce Hub payment check completed: ${processedCount} processed, ${successCount} successful, ${failedCount} failed`);
    
    return {
      success: true,
      processed: processedCount,
      successful: successCount,
      failed: failedCount
    };

  } catch (error) {
    console.error("Commerce Hub payment status check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to check Commerce Hub payment status"
    );
  }
});

// Expire old Commerce Hub transactions (45 minutes timeout)
Parse.Cloud.define("expireOldCommerceHubTransactions", async (request) => {
  try {
    console.log("🕐 Starting Commerce Hub transaction expiration check...");

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 45); // 45 minutes ago

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "CommerceHub");
    query.equalTo("status", 1); // pending
    query.lessThan("createdAt", cutoffTime);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Commerce Hub transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9); // expired
        transaction.set("expiredAt", new Date());
        await transaction.save(null, { useMasterKey: true });
        expiredCount++;
        console.log(`⏰ Expired transaction ${transaction.id}`);
      } catch (error) {
        console.error(`Error expiring transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Commerce Hub expiration completed: ${expiredCount} transactions expired`);
    
    return {
      success: true,
      expired: expiredCount
    };

  } catch (error) {
    console.error("Commerce Hub transaction expiration error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to expire Commerce Hub transactions"
    );
  }
});

module.exports = {
  generateMerchantTransactionId,
  generateCommerceHubSignature,
  generateCommerceHubHeaders
};
