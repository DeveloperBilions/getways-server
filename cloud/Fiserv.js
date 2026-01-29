const crypto = require('crypto');
const fetch = require('node-fetch');
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

console.log('🔄 Loading Fiserv.js file...');

// Utility function to generate unique merchant transaction IDs
const generateMerchantTransactionId = (userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `FISERV-${shortUserId}-${timestamp}`;
};

// Utility function to generate HMAC signature for Fiserv API
const generateHmacSignature = (message, secret) => {
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
};

// Utility function to generate headers for Fiserv API requests
const generateFiservHeaders = (body = '') => {
  const clientRequestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  
  // Create message for signature
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

// Create Fiserv Payment Link
Parse.Cloud.define("fiservCreatePaymentLink", async (request) => {
  const { 
    amount, 
    remark,
    orderId,
    customerInfo,
    expiryHours = 24, 
    type = "Getways",
    userId: paramUserId,
    gc_coins,
    sc_coins
  } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(
  //     Parse.Error.SESSION_MISSING,
  //     "Authentication required."
  //   );
  // }

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
    
    // Calculate expiry date
    const expiryDateTime = new Date();
    expiryDateTime.setHours(expiryDateTime.getHours() + expiryHours);

    // Validate required environment variables
    const requiredEnvVars = ['FISERV_STORE_ID', 'FISERV_API_KEY', 'FISERV_SECRET_KEY', 'FISERV_API_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Parse.Error(
          Parse.Error.SCRIPT_FAILED,
          `${envVar} environment variable is required`
        );
      }
    }

    // Prepare payment link request body
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
        orderId: finalOrderId,
        ...(customerInfo && {
          billing: {
            person: {
              firstName: customerInfo.firstName || null,
              lastName: customerInfo.lastName || null
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
        webHooksUrl: `${process.env.FRONTEND_URL}/api/fiserv-webhook`
      },
      paymentLinkDetails: {
        expiryDateTime: expiryDateTime.toISOString()
      }
    };

    const bodyString = JSON.stringify(requestBody);
    const headers = generateFiservHeaders(bodyString);

    // Make API call to Fiserv
    const response = await fetch(`${process.env.FISERV_API_URL}/payment-links`, {
      method: 'POST',
      headers: headers,
      body: bodyString
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const fiservResponse = await response.json();
    
    // Save transaction record - use Transactions table if type is AOG, otherwise TransactionRecords
    const isAOG = type === "AOG";
    const TableName = isAOG ? "Transactions" : "TransactionRecords";
    const TransactionDetails = Parse.Object.extend(TableName);
    const transactionDetails = new TransactionDetails();
    const user = request.user ? await request.user.fetch({ useMasterKey: true }) : null;
    
    // Use paramUserId if provided (for AOG), otherwise use user.id
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
    transactionDetails.set("status", 2); // pending
    transactionDetails.set("portal", "Fiserv");
    transactionDetails.set("referralLink", fiservResponse.paymentLink?.paymentLinkUrl || "");
    transactionDetails.set("transactionIdFromStripe", fiservResponse.paymentLink?.paymentLinkId || "");
    transactionDetails.set("merchantTransactionId", merchantTransactionId);
    transactionDetails.set("fiservOrderId", finalOrderId);
    transactionDetails.set("fiservCheckoutId", fiservResponse.paymentLink?.checkoutId || "");
    transactionDetails.set("sc_coins", Number(sc_coins) || 0);
    transactionDetails.set("gc_coins", Number(gc_coins) || 0);

    // Add platform field for AOG transactions
    if (isAOG) {
      transactionDetails.set("platform", "AOGCOINCLUB");
    }

    await transactionDetails.save(null, { useMasterKey: true });

    return {
      success: true,
      paymentLink: fiservResponse.paymentLink,
      transactionId: transactionDetails.id,
      merchantTransactionId: merchantTransactionId,
      publicUrl: fiservResponse.paymentLink?.paymentLinkUrl // For iframe
    };

  } catch (error) {
    console.error("Fiserv payment link creation error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to create Fiserv payment link"
    );
  }
});

// Get Fiserv Payment Link Details
Parse.Cloud.define("fiservGetPaymentLinkDetails", async (request) => {
  const { paymentLinkId } = request.params || {};

  // if (!request.user) {
  //   throw new Parse.Error(
  //     Parse.Error.SESSION_MISSING,
  //     "Authentication required."
  //   );
  // }

  if (!paymentLinkId) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Payment Link ID is required."
    );
  }

  try {
    const headers = generateFiservHeaders();

    // Make API call to get payment link details
    const response = await fetch(`${process.env.FISERV_API_URL}/payment-links/${paymentLinkId}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Fiserv API Error:', errorData);
      throw new Parse.Error(
        Parse.Error.SCRIPT_FAILED,
        `Fiserv API error: ${response.status} - ${errorData}`
      );
    }

    const fiservResponse = await response.json();
    
    return {
      success: true,
      paymentLinkDetails: fiservResponse
    };

  } catch (error) {
    console.error("Fiserv payment link details error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to get Fiserv payment link details"
    );
  }
});

// Check Fiserv Payment Status and Update Balance
Parse.Cloud.define("checkFiservPaymentsRecharge", async (request) => {
  try {
    console.log("🔄 Starting Fiserv payment status check...");

    // Find all pending Fiserv transactions
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Fiserv");
    query.equalTo("status", 1); // pending
    query.limit(100);

    const pendingTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${pendingTransactions.length} pending Fiserv transactions`);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const transaction of pendingTransactions) {
      try {
        const paymentLinkId = transaction.get("transactionIdFromStripe");
        if (!paymentLinkId) {
          console.log(`⚠️ No payment link ID for transaction ${transaction.id}`);
          continue;
        }

        // Get payment link details from Fiserv
        const headers = generateFiservHeaders();
        const response = await fetch(`${process.env.FISERV_API_URL}/payment-links/${paymentLinkId}`, {
          method: 'GET',
          headers: headers
        });

        if (!response.ok) {
          console.log(`❌ Fiserv API error for transaction ${transaction.id}: ${response.status}`);
          continue;
        }

        const fiservData = await response.json();
        
        // Check both transactionStatus and ipgTransactionDetails.transactionStatus
        const transactionStatus = fiservData.transactionStatus;
        const ipgTransactionStatus = fiservData.ipgTransactionDetails?.transactionStatus;
        const approvalCode = fiservData.ipgTransactionDetails?.approvalCode;
        
        console.log(`📋 Transaction ${transaction.id} - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}, Approval: ${approvalCode}`);

        // Check if payment is approved (both main status and IPG status should be APPROVED)
        if (transactionStatus === "APPROVED" && ipgTransactionStatus === "APPROVED") {
          // Payment successful - update balance and transaction status
          const userId = transaction.get("userId");
          const amount = transaction.get("transactionAmount");

          // Update pot balance using the correct pattern
          const parentUserId = await getParentUserId(userId);
          await updatePotBalance(parentUserId, amount, "recharge");
          
          transaction.set("status", 2); // completed
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("fiservIpgStatus", ipgTransactionStatus);
          transaction.set("fiservApprovalCode", approvalCode);
          transaction.set("completedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`✅ Transaction ${transaction.id} completed successfully with approval code: ${approvalCode}`);
          successCount++;
        } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
                   ["FAILED", "DECLINED", "FRAUD"].includes(ipgTransactionStatus)) {
          // Payment failed
          transaction.set("status", 9); // failed
          transaction.set("fiservTransactionStatus", transactionStatus);
          transaction.set("fiservIpgStatus", ipgTransactionStatus);
          transaction.set("failedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
          
          console.log(`❌ Transaction ${transaction.id} failed - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
          failedCount++;
        } else {
          // Payment still in progress (INITIATED, WAITING, etc.)
          console.log(`⏳ Transaction ${transaction.id} still in progress - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing transaction ${transaction.id}:`, error);
        failedCount++;
      }
    }

    console.log(`🏁 Fiserv payment check completed: ${processedCount} processed, ${successCount} successful, ${failedCount} failed`);
    
    return {
      success: true,
      processed: processedCount,
      successful: successCount,
      failed: failedCount
    };

  } catch (error) {
    console.error("Fiserv payment status check error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to check Fiserv payment status"
    );
  }
});

// Expire old Fiserv transactions (45 minutes timeout)
Parse.Cloud.define("expireOldFiservTransactions", async (request) => {
  try {
    console.log("🕐 Starting Fiserv transaction expiration check...");

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 45); // 45 minutes ago

    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionDetails);
    query.equalTo("portal", "Fiserv");
    query.equalTo("status", 1); // pending
    query.lessThan("createdAt", cutoffTime);
    query.limit(100);

    const expiredTransactions = await query.find({ useMasterKey: true });
    console.log(`📊 Found ${expiredTransactions.length} expired Fiserv transactions`);

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

    console.log(`🏁 Fiserv expiration completed: ${expiredCount} transactions expired`);
    
    return {
      success: true,
      expired: expiredCount
    };

  } catch (error) {
    console.error("Fiserv transaction expiration error:", error);
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      error.message || "Failed to expire Fiserv transactions"
    );
  }
});

// Fiserv Webhook Handler
Parse.Cloud.define("fiservWebhookHandler", async (request) => {
  try {
    console.log("🔔 Fiserv webhook received:", JSON.stringify(request.params, null, 2));
    
    const webhookData = request.params;
    
    // Validate webhook data
    if (!webhookData || !webhookData.paymentLinkId) {
      console.warn("⚠️ Invalid webhook data received");
      return { success: false, error: "Invalid webhook data" };
    }

    const { 
      paymentLinkId, 
      transactionStatus, 
      ipgTransactionDetails,
      merchantTransactionId,
      approvedAmount 
    } = webhookData;

    // Find the transaction record
    const TransactionRecords = Parse.Object.extend("TransactionRecords");
    const query = new Parse.Query(TransactionRecords);
    query.equalTo("transactionIdFromStripe", paymentLinkId);
    query.equalTo("portal", "Fiserv");
    
    const transaction = await query.first({ useMasterKey: true });
    
    if (!transaction) {
      console.warn(`⚠️ No transaction found for payment link: ${paymentLinkId}`);
      return { success: false, error: "Transaction not found" };
    }

    console.log(`🔄 Processing webhook for transaction ${transaction.id}`);

    // Check if payment is successful
    const ipgStatus = ipgTransactionDetails?.transactionStatus;
    const approvalCode = ipgTransactionDetails?.approvalCode;
    
    if (transactionStatus === "APPROVED" && ipgStatus === "APPROVED") {
      // Payment successful
      const userId = transaction.get("userId");
      const amount = transaction.get("transactionAmount");

      // Update pot balance
      const parentUserId = await getParentUserId(userId);
      await updatePotBalance(parentUserId, amount, "recharge");
      
      transaction.set("status", 2); // completed
      transaction.set("fiservTransactionStatus", transactionStatus);
      transaction.set("fiservIpgStatus", ipgStatus);
      transaction.set("fiservApprovalCode", approvalCode);
      transaction.set("webhookProcessedAt", new Date());
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`✅ Webhook processed: Transaction ${transaction.id} completed successfully`);
      
      return { 
        success: true, 
        message: "Payment processed successfully",
        transactionId: transaction.id
      };
    } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
               ["FAILED", "DECLINED", "FRAUD"].includes(ipgStatus)) {
      // Payment failed
      transaction.set("status", 9); // failed
      transaction.set("fiservTransactionStatus", transactionStatus);
      transaction.set("fiservIpgStatus", ipgStatus);
      transaction.set("webhookProcessedAt", new Date());
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`❌ Webhook processed: Transaction ${transaction.id} failed`);
      
      return { 
        success: true, 
        message: "Payment failure processed",
        transactionId: transaction.id
      };
    } else {
      // Payment still in progress
      console.log(`⏳ Webhook processed: Transaction ${transaction.id} still in progress`);
      
      return { 
        success: true, 
        message: "Payment status updated",
        transactionId: transaction.id
      };
    }

  } catch (error) {
    console.error("Fiserv webhook processing error:", error);
    return { 
      success: false, 
      error: error.message || "Failed to process webhook" 
    };
  }
});

module.exports = {
  generateMerchantTransactionId,
  generateHmacSignature,
  generateFiservHeaders
};
