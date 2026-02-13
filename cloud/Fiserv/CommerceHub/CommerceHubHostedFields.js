const crypto = require('crypto');
const axios = require('axios');
const { getParentUserId, updatePotBalance } = require('../../utility/utlis');

console.log('🔄 Loading CommerceHubHostedFields.js file...');

// Utility function to generate unique merchant transaction IDs
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `CHFL-${shortUserId}-${timestamp}`;
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

// Get Commerce Hub credentials for Hosted Fields (Step 2 from documentation)
Parse.Cloud.define("commerceHubHostedFieldsGetCredentials", async (request) => {
  const { 
    amount, 
    remark,
    orderId,
    customerInfo,
    type = "Getways",
    userId: paramUserId
  } = request.params || {};

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
    // Use paramUserId if provided, otherwise try request.user.id, fallback to timestamp
    const userIdForTransaction = paramUserId || request.user?.id || `USER-${Date.now()}`;
    const merchantTransactionId = generateMerchantTransactionId(userIdForTransaction);
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

    // Prepare security credentials request (Step 2 from Hosted Fields documentation)
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

    console.log('🔑 Requesting Commerce Hub security credentials for Hosted Fields...');

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

      console.log('📦 Full Credentials API Response:', JSON.stringify(credentialsData, null, 2));
      console.log('🔑 accessToken:', credentialsData.accessToken ? credentialsData.accessToken.substring(0, 20) + '...' : 'MISSING');
      console.log('🔑 sessionId:', credentialsData.sessionId || 'MISSING');
      console.log('🔑 publicKey:', credentialsData.publicKey ? credentialsData.publicKey.substring(0, 30) + '...' : 'MISSING');
      console.log('🔑 keyId:', credentialsData.keyId || 'MISSING');
      console.log('🔑 symmetricEncryptionAlgorithm:', credentialsData.symmetricEncryptionAlgorithm || 'MISSING');
      console.log('🔑 accessTokenIssuedTime:', credentialsData.accessTokenIssuedTime || 'MISSING');
      console.log('🔑 accessTokenTimeToLive:', credentialsData.accessTokenTimeToLive || 'MISSING');
      
      // Save transaction record
      const isAOG = type === "AOG";
      const TableName = isAOG ? "Transactions" : "TransactionRecords";
      const TransactionDetails = Parse.Object.extend(TableName);
      const transactionDetails = new TransactionDetails();
      const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
      
      const finalUserId = paramUserId || user?.id || "";

      transactionDetails.set("type", "recharge");
      transactionDetails.set("gameId", "786");
      transactionDetails.set("username", user?.get("username") || "");
      transactionDetails.set("userId", finalUserId);
      transactionDetails.set("transactionDate", new Date());
      transactionDetails.set("transactionAmount", parsedAmount);
      transactionDetails.set("remark", remark);
      transactionDetails.set("useWallet", false);
      transactionDetails.set("userParentId", user?.get("userParentId") || "");
      transactionDetails.set("status", 1); // pending
      transactionDetails.set("portal", "CommerceHubHostedFields");
      transactionDetails.set("merchantTransactionId", merchantTransactionId);
      transactionDetails.set("commerceHubOrderId", finalOrderId);
      transactionDetails.set("commerceHubSessionId", credentialsData.sessionId || "");
      transactionDetails.set("commerceHubAccessToken", credentialsData.accessToken || "");
      transactionDetails.set("commerceHubKeyId", credentialsData.keyId || "");
      
      // Add platform field for AOG transactions
      if (isAOG) {
        transactionDetails.set("platform", "AOGCOINCLUB");
      }

      await transactionDetails.save(null, { useMasterKey: true });

      console.log('✅ Commerce Hub Hosted Fields credentials obtained successfully');

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
      console.error("❌ Commerce Hub API Error Details:");
      console.error("Status:", apiError.response?.status);
      console.error("Status Text:", apiError.response?.statusText);
      console.error("Response Data:", JSON.stringify(apiError.response?.data, null, 2));
      
      const errorData = apiError.response?.data;
      let errorMessage = "Failed to get Commerce Hub credentials";
      
      if (errorData?.error && Array.isArray(errorData.error)) {
        errorMessage = errorData.error.map(e => `${e.field}: ${e.message}`).join(', ');
      } else if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData?.gatewayResponse?.transactionState) {
        errorMessage = `Transaction state: ${errorData.gatewayResponse.transactionState}`;
      }
      
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        errorMessage
      );
    }

  } catch (error) {
    console.error("Commerce Hub Hosted Fields credentials error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.response?.data?.error?.message || error.message || "Failed to get Commerce Hub credentials"
    );
  }
});

// Process Commerce Hub Hosted Fields Payment (Step 5 from documentation)
Parse.Cloud.define("commerceHubHostedFieldsProcessPayment", async (request) => {
  const { 
    sessionId,
    transactionId
  } = request.params || {};

  if (!sessionId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Session ID is required."
    );
  }

  try {
    // Prepare charges request (Step 5 from Hosted Fields documentation)
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

    console.log('💳 Processing Commerce Hub Hosted Fields payment...');

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
          if (parentUserId) {
            await updatePotBalance(parentUserId, amount, "add");
          }

          // Update transaction status
          transaction.set("status", 2); // success
          transaction.set("approvalCode", paymentData.paymentReceipt?.processorResponseDetails?.approvalCode || "");
          transaction.set("transactionId", paymentData.gatewayResponse?.transactionProcessingDetails?.transactionId || "");
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });

          console.log("✅ Payment approved and balance updated");
        } else {
          // Payment failed
          transaction.set("status", 3); // failed
          transaction.set("failureReason", approvalStatus || transactionState);
          await transaction.save(null, { useMasterKey: true });
          console.log("❌ Payment not approved");
        }
      }
    }

    return {
      success: transactionState === "AUTHORIZED" && approvalStatus === "APPROVED",
      status: approvalStatus || transactionState,
      paymentData: paymentData
    };

  } catch (error) {
    console.error("Commerce Hub Hosted Fields payment processing error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.response?.data?.error?.message || error.message || "Failed to process Commerce Hub payment"
    );
  }
});

module.exports = {
  generateMerchantTransactionId,
  generateCommerceHubSignature,
  generateCommerceHubHeaders
};
