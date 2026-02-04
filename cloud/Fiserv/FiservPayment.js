const crypto = require('crypto');
const fetch = require('node-fetch');
const { getParentUserId, updatePotBalance } = require('../utility/utlis');

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
    console.log("Fiserv API Response:", fiservResponse, "-------------------------------->>>>>>");
    
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
    transactionDetails.set("status", 1); // pending
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

    // Helper function to process transactions from a specific table
    const processTransactionsFromTable = async (tableName) => {
      const TransactionDetails = Parse.Object.extend(tableName);
      const query = new Parse.Query(TransactionDetails);
      query.equalTo("portal", "Fiserv");
      query.equalTo("status", 1); // pending
      query.limit(100);

      const pendingTransactions = await query.find({ useMasterKey: true });
      console.log(`📊 Found ${pendingTransactions.length} pending Fiserv transactions in ${tableName}`);

      let processedCount = 0;
      let successCount = 0;
      let failedCount = 0;

      for (const transaction of pendingTransactions) {
        try {
          const paymentLinkId = transaction.get("transactionIdFromStripe");
          if (!paymentLinkId) {
            console.log(`⚠️ No payment link ID for transaction ${transaction.id} in ${tableName}`);
            continue;
          }

          // Get payment link details from Fiserv
          const headers = generateFiservHeaders();
          const response = await fetch(`${process.env.FISERV_API_URL}/payment-links/${paymentLinkId}`, {
            method: 'GET',
            headers: headers
          });

          if (!response.ok) {
            console.log(`❌ Fiserv API error for transaction ${transaction.id} in ${tableName}: ${response.status}`);
            continue;
          }

          const fiservData = await response.json();
          
          // Check both transactionStatus and ipgTransactionDetails.transactionStatus
          const transactionStatus = fiservData.transactionStatus;
          const ipgTransactionStatus = fiservData.ipgTransactionDetails?.transactionStatus;
          const approvalCode = fiservData.ipgTransactionDetails?.approvalCode;
          
          console.log(`📋 Transaction ${transaction.id} (${tableName}) - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}, Approval: ${approvalCode}`);

          // Check if payment is approved (both main status and IPG status should be APPROVED)
          if (transactionStatus === "APPROVED" && ipgTransactionStatus === "APPROVED") {
            // Payment successful - update transaction status
            transaction.set("status", 2); // completed
            
            // Only update pot balance and Fiserv fields for TransactionRecords table
            if (tableName === "TransactionRecords") {
              const userId = transaction.get("userId");
              const amount = transaction.get("transactionAmount");

              // Update pot balance using the correct pattern
              const parentUserId = await getParentUserId(userId);
              await updatePotBalance(parentUserId, amount, "recharge");
              
              transaction.set("fiservTransactionStatus", transactionStatus);
              transaction.set("fiservIpgStatus", ipgTransactionStatus);
              transaction.set("fiservApprovalCode", approvalCode);
              transaction.set("completedAt", new Date());
            }
            
            await transaction.save(null, { useMasterKey: true });
            
            console.log(`✅ Transaction ${transaction.id} (${tableName}) completed successfully with approval code: ${approvalCode}`);
            successCount++;
          } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
                     ["FAILED", "DECLINED", "FRAUD"].includes(ipgTransactionStatus)) {
            // Payment failed
            transaction.set("status", 9); // failed
            
            // Only set Fiserv fields for TransactionRecords table
            if (tableName === "TransactionRecords") {
              transaction.set("fiservTransactionStatus", transactionStatus);
              transaction.set("fiservIpgStatus", ipgTransactionStatus);
              transaction.set("failedAt", new Date());
            }
            
            await transaction.save(null, { useMasterKey: true });
            
            console.log(`❌ Transaction ${transaction.id} (${tableName}) failed - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
            failedCount++;
          } else {
            // Payment still in progress (INITIATED, WAITING, etc.)
            console.log(`⏳ Transaction ${transaction.id} (${tableName}) still in progress - Status: ${transactionStatus}, IPG Status: ${ipgTransactionStatus}`);
          }

          processedCount++;
        } catch (error) {
          console.error(`Error processing transaction ${transaction.id} in ${tableName}:`, error);
          failedCount++;
        }
      }

      return { processedCount, successCount, failedCount };
    };

    // Process transactions from both tables
    const transactionRecordsResults = await processTransactionsFromTable("TransactionRecords");
    const transactionsResults = await processTransactionsFromTable("Transactions");

    const totalProcessed = transactionRecordsResults.processedCount + transactionsResults.processedCount;
    const totalSuccessful = transactionRecordsResults.successCount + transactionsResults.successCount;
    const totalFailed = transactionRecordsResults.failedCount + transactionsResults.failedCount;

    console.log(`🏁 Fiserv payment check completed: ${totalProcessed} processed, ${totalSuccessful} successful, ${totalFailed} failed`);
    console.log(`📊 TransactionRecords: ${transactionRecordsResults.processedCount} processed, ${transactionRecordsResults.successCount} successful, ${transactionRecordsResults.failedCount} failed`);
    console.log(`📊 Transactions: ${transactionsResults.processedCount} processed, ${transactionsResults.successCount} successful, ${transactionsResults.failedCount} failed`);
    
    return {
      success: true,
      processed: totalProcessed,
      successful: totalSuccessful,
      failed: totalFailed,
      details: {
        transactionRecords: transactionRecordsResults,
        transactions: transactionsResults
      }
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

    // Helper function to expire transactions from a specific table
    const expireTransactionsFromTable = async (tableName) => {
      const TransactionDetails = Parse.Object.extend(tableName);
      const query = new Parse.Query(TransactionDetails);
      query.equalTo("portal", "Fiserv");
      query.equalTo("status", 1); // pending
      query.lessThan("createdAt", cutoffTime);
      query.limit(100);

      const expiredTransactions = await query.find({ useMasterKey: true });
      console.log(`📊 Found ${expiredTransactions.length} expired Fiserv transactions in ${tableName}`);

      let expiredCount = 0;

      for (const transaction of expiredTransactions) {
        try {
          transaction.set("status", 9); // expired
          
          // Only set expiredAt timestamp for TransactionRecords table
          if (tableName === "TransactionRecords") {
            transaction.set("expiredAt", new Date());
          }
          
          await transaction.save(null, { useMasterKey: true });
          expiredCount++;
          console.log(`⏰ Expired transaction ${transaction.id} in ${tableName}`);
        } catch (error) {
          console.error(`Error expiring transaction ${transaction.id} in ${tableName}:`, error);
        }
      }

      return expiredCount;
    };

    // Expire transactions from both tables
    const transactionRecordsExpired = await expireTransactionsFromTable("TransactionRecords");
    const transactionsExpired = await expireTransactionsFromTable("Transactions");

    const totalExpired = transactionRecordsExpired + transactionsExpired;

    console.log(`🏁 Fiserv expiration completed: ${totalExpired} transactions expired`);
    console.log(`📊 TransactionRecords: ${transactionRecordsExpired} expired`);
    console.log(`📊 Transactions: ${transactionsExpired} expired`);
    
    return {
      success: true,
      expired: totalExpired,
      details: {
        transactionRecords: transactionRecordsExpired,
        transactions: transactionsExpired
      }
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

    // Helper function to find transaction in a specific table
    const findTransactionInTable = async (tableName) => {
      const TransactionTable = Parse.Object.extend(tableName);
      const query = new Parse.Query(TransactionTable);
      query.equalTo("transactionIdFromStripe", paymentLinkId);
      query.equalTo("portal", "Fiserv");
      
      return await query.first({ useMasterKey: true });
    };

    // Try to find the transaction in both tables
    let transaction = await findTransactionInTable("TransactionRecords");
    let tableName = "TransactionRecords";
    
    if (!transaction) {
      transaction = await findTransactionInTable("Transactions");
      tableName = "Transactions";
    }
    
    if (!transaction) {
      console.warn(`⚠️ No transaction found for payment link: ${paymentLinkId} in either table`);
      return { success: false, error: "Transaction not found" };
    }

    console.log(`🔄 Processing webhook for transaction ${transaction.id} in ${tableName}`);

    // Check if payment is successful
    const ipgStatus = ipgTransactionDetails?.transactionStatus;
    const approvalCode = ipgTransactionDetails?.approvalCode;
    
    if (transactionStatus === "APPROVED" && ipgStatus === "APPROVED") {
      // Payment successful
      transaction.set("status", 2); // completed
      
      // Only update pot balance and Fiserv fields for TransactionRecords table
      if (tableName === "TransactionRecords") {
        const userId = transaction.get("userId");
        const amount = transaction.get("transactionAmount");

        // Update pot balance
        const parentUserId = await getParentUserId(userId);
        await updatePotBalance(parentUserId, amount, "recharge");
        
        transaction.set("fiservTransactionStatus", transactionStatus);
        transaction.set("fiservIpgStatus", ipgStatus);
        transaction.set("fiservApprovalCode", approvalCode);
        transaction.set("webhookProcessedAt", new Date());
      }
      
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`✅ Webhook processed: Transaction ${transaction.id} (${tableName}) completed successfully`);
      
      return { 
        success: true, 
        message: "Payment processed successfully",
        transactionId: transaction.id,
        tableName: tableName
      };
    } else if (["FAILED", "DECLINED", "FRAUD"].includes(transactionStatus) || 
               ["FAILED", "DECLINED", "FRAUD"].includes(ipgStatus)) {
      // Payment failed
      transaction.set("status", 9); // failed
      
      // Only set Fiserv fields for TransactionRecords table
      if (tableName === "TransactionRecords") {
        transaction.set("fiservTransactionStatus", transactionStatus);
        transaction.set("fiservIpgStatus", ipgStatus);
        transaction.set("webhookProcessedAt", new Date());
      }
      
      await transaction.save(null, { useMasterKey: true });
      
      console.log(`❌ Webhook processed: Transaction ${transaction.id} (${tableName}) failed`);
      
      return { 
        success: true, 
        message: "Payment failure processed",
        transactionId: transaction.id,
        tableName: tableName
      };
    } else {
      // Payment still in progress
      console.log(`⏳ Webhook processed: Transaction ${transaction.id} (${tableName}) still in progress`);
      
      return { 
        success: true, 
        message: "Payment status updated",
        transactionId: transaction.id,
        tableName: tableName
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
