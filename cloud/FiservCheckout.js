const crypto = require('crypto');
const fetch = require('node-fetch');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading FiservCheckout.js file...');

const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `FSCHK-${shortUserId}-${timestamp}`;
};

const generateHmacSignature = (message, secret) => {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

const generateFiservHeaders = (body = '') => {
  const clientRequestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const message = process.env.FISERV_API_KEY + clientRequestId + timestamp + body;
  const signature = generateHmacSignature(message, process.env.FISERV_SECRET_KEY);
  
  return {
    'Content-Type': 'application/json',
    'Api-Key': process.env.FISERV_API_KEY,
    'Client-Request-Id': clientRequestId,
    'Timestamp': timestamp,
    'Message-Signature': signature
  };
};

Parse.Cloud.define("fiservCreateCheckout", async (request) => {
  const { amount, remark, customerInfo } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!amount) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Amount is required.");
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount: must be a positive number.");
  }

  try {
    const merchantTransactionId = generateMerchantTransactionId(request.user.id);
    const orderId = `ORDER-${Date.now()}`;
    
    const requiredEnvVars = ['FISERV_STORE_ID', 'FISERV_API_KEY', 'FISERV_SECRET_KEY', 'FISERV_API_URL', 'FRONTEND_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `${envVar} environment variable is required`);
      }
    }

    const requestBody = {
      storeId: process.env.FISERV_STORE_ID,
      merchantTransactionId: merchantTransactionId,
      transactionOrigin: "ECOM",
      transactionType: "SALE",
      transactionAmount: {
        total: parsedAmount,
        currency: "USD"
      },
      order: {
        orderId: orderId,
        ...(customerInfo && {
          billing: {
            person: {
              firstName: customerInfo.firstName || null,
              lastName: customerInfo.lastName || null,
              name: customerInfo.name || null
            },
            contact: {
              email: customerInfo.email || null,
              phone: customerInfo.phone || null
            },
            ...(customerInfo.address && {
              address: {
                address1: customerInfo.address.address1 || null,
                city: customerInfo.address.city || null,
                region: customerInfo.address.region || null,
                postalCode: customerInfo.address.postalCode || null,
                country: customerInfo.address.country || "US"
              }
            })
          }
        })
      },
      checkoutSettings: {
        locale: "en_US",
        redirectBackUrls: {
          successUrl: `${process.env.FRONTEND_URL}/fiserv-checkout-success`,
          failureUrl: `${process.env.FRONTEND_URL}/fiserv-checkout-failure`
        },
        webHooksUrl: `${process.env.FRONTEND_URL}/api/fiserv-checkout-webhook`
      },
      paymentMethodDetails: {
        cards: {
          authenticationPreferences: {
            challengeIndicator: "01",
            skipTra: false
          },
          createToken: {
            declineDuplicateToken: false,
            reusable: true,
            toBeUsedFor: "UNSCHEDULED"
          },
          tokenBasedTransaction: {
            transactionSequence: "FIRST"
          }
        }
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateFiservHeaders(bodyString);

    const response = await fetch(`${process.env.FISERV_API_URL}/checkouts`, {
      method: 'POST',
      headers: headers,
      body: bodyString
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv Checkout API Error:', errorData);
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Fiserv API error: ${response.status} - ${errorData}`);
    }

    const fiservResponse = await response.json();
    
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
    transactionDetails.set("status", 1);
    transactionDetails.set("portal", "FiservCheckout");
    transactionDetails.set("referralLink", fiservResponse.checkout?.redirectionUrl || "");
    transactionDetails.set("transactionIdFromStripe", fiservResponse.checkout?.checkoutId || "");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("fiservOrderId", orderId);
    transactionDetails.set("fiservStoreId", process.env.FISERV_STORE_ID);

    await transactionDetails.save(null, { useMasterKey: true });

    return {
      success: true,
      checkout: fiservResponse.checkout,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      redirectionUrl: fiservResponse.checkout?.redirectionUrl
    };

  } catch (error) {
    console.error("Fiserv checkout creation error:", error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error.message || "Failed to create Fiserv checkout");
  }
});

Parse.Cloud.define("fiservGetCheckoutDetails", async (request) => {
  const { checkoutId } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, "Authentication required.");
  }

  if (!checkoutId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Checkout ID is required.");
  }

  try {
    const headers = generateFiservHeaders();
    const response = await fetch(`${process.env.FISERV_API_URL}/checkouts/${checkoutId}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv API Error:', errorData);
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Fiserv API error: ${response.status} - ${errorData}`);
    }

    const fiservResponse = await response.json();
    return { success: true, checkoutDetails: fiservResponse };

  } catch (error) {
    console.error("Fiserv checkout details error:", error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error.message || "Failed to get Fiserv checkout details");
  }
});

Parse.Cloud.define("checkFiservCheckoutRecharge", async (request) => {
  try {
    console.log("🔄 Starting Fiserv Checkout status check...");

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "FiservCheckout");
    query.equalTo("status", 1);
    query.limit(100);

    const pendingTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${pendingTransactions.length} pending Fiserv Checkout transactions`);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        const checkoutId = transaction.get("transactionIdFromStripe");
        if (!checkoutId) {
          console.log(`⚠️ No checkout ID for transaction ${transaction.id}`);
          continue;
        }

        const headers = generateFiservHeaders();
        const response = await fetch(`${process.env.FISERV_API_URL}/checkouts/${checkoutId}`, {
          method: 'GET',
          headers: headers
        });

        if (!response.ok) {
          console.log(`❌ Fiserv API error for transaction ${transaction.id}: ${response.status}`);
          continue;
        }

        const fiservData = await response.json();
        const transactionStatus = fiservData.transactionStatus;
        const ipgTransactionStatus = fiservData.ipgTransactionDetails?.transactionResult;
        const approvalCode = fiservData.ipgTransactionDetails?.approvalCode;
        const ipgTransactionId = fiservData.ipgTransactionDetails?.ipgTransactionId;
        
        console.log(`📋 Transaction ${transaction.id} - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}, Approval: ${approvalCode}`);

        if (transactionStatus === "APPROVED" && ipgTransactionStatus === "APPROVED") {
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");

          const parentUserId = await getParentUserId(userId);
          await updatePotBalance(parentUserId, amount, "recharge");
          
          transaction.set("status", 2);
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("fiservIpgStatus", ipgTransactionStatus);
          transaction.set("fiservApprovalCode", approvalCode);
          transaction.set("fiservIpgTransactionId", ipgTransactionId);
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`✅ Transaction ${transaction.id} completed successfully with approval code: ${approvalCode}`);
          successCount++;
        } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
                   ["FAILED", "DECLINED", "FRAUD"].includes(ipgTransactionStatus)) {
          transaction.set("status", 9);
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("fiservIpgStatus", ipgTransactionStatus);
          transaction.set("failedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Transaction ${transaction.id} failed - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
          failedCount++;
        } else {
          console.log(`⏳ Transaction ${transaction.id} still in progress - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        failedCount++;
      }
    }

    console.log(`🏁 Fiserv Checkout check completed: ${processedCount} processed, ${successCount} successful, ${failedCount} failed`);
    
    return { success: true, processed: processedCount, successful: successCount, failed: failedCount };

  } catch (error) {
    console.error("Fiserv Checkout status check error:", error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error.message || "Failed to check Fiserv Checkout status");
  }
});

Parse.Cloud.define("expireOldFiservCheckoutTransactions", async (request) => {
  try {
    console.log("🕐 Starting Fiserv Checkout transaction expiration check...");

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 45);

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "FiservCheckout");
    query.equalTo("status", 1);
    query.lessThan("createdAt", cutoffTime);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Fiserv Checkout transactions`);

    let expiredCount = 0;

    for (const transaction of expiredTransactions) {
      try {
        transaction.set("status", 9);
        transaction.set("expiredAt", new Date());
        await transaction.save(null, { useMasterKey: true });
        expiredCount++;
        console.log(`⏰ Expired transaction ${transaction.id}`);
      } catch (error) {
        console.error(`Error expiring transaction ${transaction.id}:`, error);
      }
    }

    console.log(`🏁 Fiserv Checkout expiration completed: ${expiredCount} transactions expired`);
    return { success: true, expired: expiredCount };

  } catch (error) {
    console.error("Fiserv Checkout transaction expiration error:", error);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, error.message || "Failed to expire Fiserv Checkout transactions");
  }
});

Parse.Cloud.define("fiservCheckoutWebhookHandler", async (request) => {
  try {
    console.log("🔔 Fiserv Checkout webhook received:", JSON.stringify(request.params, null, 2));
    
    const webhookData = request.params;
    
    if (!webhookData || !webhookData.checkoutId) {
      console.warn("⚠️ Invalid webhook data received");
      return { success: false, error: "Invalid webhook data" };
    }

    const { checkoutId, transactionStatus, ipgTransactionDetails } = webhookData;

    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("transactionIdFromStripe", checkoutId);
    query.equalTo("portal", "FiservCheckout");
    
    const transaction = await query.first({ useMasterKey: true });
    
    if (!transaction) {
      console.warn(`⚠️ No transaction found for checkout ID: ${checkoutId}`);
      return { success: false, error: "Transaction not found" };
    }

    console.log(`🔄 Processing webhook for transaction ${transaction.id}`);

    const ipgStatus = ipgTransactionDetails?.transactionResult;
    const approvalCode = ipgTransactionDetails?.approvalCode;
    const ipgTransactionId = ipgTransactionDetails?.ipgTransactionId;
    
    if (transactionStatus === "APPROVED" && ipgStatus === "APPROVED") {
      const userId = transaction.get("userId");
      const amount = transaction.get("transactionAmount");

      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, "recharge");
      
      transaction.set("status", 2);
      transaction.set("fiservTransactionStatus", transactionStatus);
      transaction.set("fiservIpgStatus", ipgStatus);
      transaction.set("fiservApprovalCode", approvalCode);
      transaction.set("fiservIpgTransactionId", ipgTransactionId);
      transaction.set("webhookProcessedAt", new Date());
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`✅ Webhook processed: Transaction ${transaction.id} completed successfully`);
      
      return { success: true, message: "Payment processed successfully", transactionId: transaction.id };
    } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
               ["FAILED", "DECLINED", "FRAUD"].includes(ipgStatus)) {
      transaction.set("status", 9);
      transaction.set("fiservTransactionStatus", transactionStatus);
      transaction.set("fiservIpgStatus", ipgStatus);
      transaction.set("webhookProcessedAt", new Date());
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`❌ Webhook processed: Transaction ${transaction.id} failed`);
      
      return { success: true, message: "Payment failure processed", transactionId: transaction.id };
    } else {
      console.log(`⏳ Webhook processed: Transaction ${transaction.id} still in progress`);
      return { success: true, message: "Payment status updated", transactionId: transaction.id };
    }

  } catch (error) {
    console.error("Fiserv Checkout webhook processing error:", error);
    return { success: false, error: error.message || "Failed to process webhook" };
  }
});

module.exports = {
  generateMerchantTransactionId,
  generateHmacSignature,
  generateFiservHeaders
};

