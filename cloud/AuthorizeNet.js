const ApiContracts = require('authorizenet').APIContracts;
const ApiControllers = require('authorizenet').APIControllers;
const { getParentUserId, updatePotBalance } = require('./utility/utlis');

// Utility function to generate unique invoice numbers
const generateInvoiceNumber = (prefix, userId) => {
  const timestamp = Date.now().toString().slice(-8);
  const shortUserId = userId.slice(-6);
  return `${prefix}-${shortUserId}-${timestamp}`;
};

// Charge a Credit Card
Parse.Cloud.define("authorizeNetChargeCard", async (request) => {
  const { 
    amount, 
    remark,
    creditCard,
    billingInfo,
    customerInfo 
  } = request.params || {};

  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.SESSION_MISSING,
      "Authentication required."
    );
  }

  // Validate required fields
  if (!amount || !creditCard) {
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      "Amount and credit card information are required."
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
    // Set up merchant authentication
    const merchantAuthenticationType = new ApiContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(process.env.AUTHORIZE_NET_API_LOGIN_ID);
    merchantAuthenticationType.setTransactionKey(process.env.AUTHORIZE_NET_TRANSACTION_KEY);

    // Set up credit card information
    const creditCardType = new ApiContracts.CreditCardType();
    creditCardType.setCardNumber(creditCard.cardNumber);
    creditCardType.setExpirationDate(creditCard.expirationDate);
    if (creditCard.cardCode) {
      creditCardType.setCardCode(creditCard.cardCode);
    }

    // Set up payment
    const paymentType = new ApiContracts.PaymentType();
    paymentType.setCreditCard(creditCardType);

    // Set up order details
    const orderDetails = new ApiContracts.OrderType();
    orderDetails.setInvoiceNumber(generateInvoiceNumber('C', request.user.id));
    orderDetails.setDescription('Account Recharge - Card Charge');

    // Set up billing information if provided
    let nameAndAddressType = null;
    if (billingInfo) {
      nameAndAddressType = new ApiContracts.NameAndAddressType();
      if (billingInfo.firstName) nameAndAddressType.setFirstName(billingInfo.firstName);
      if (billingInfo.lastName) nameAndAddressType.setLastName(billingInfo.lastName);
      if (billingInfo.company) nameAndAddressType.setCompany(billingInfo.company);
      if (billingInfo.address) nameAndAddressType.setAddress(billingInfo.address);
      if (billingInfo.city) nameAndAddressType.setCity(billingInfo.city);
      if (billingInfo.state) nameAndAddressType.setState(billingInfo.state);
      if (billingInfo.zip) nameAndAddressType.setZip(billingInfo.zip);
      if (billingInfo.country) nameAndAddressType.setCountry(billingInfo.country);
    }

    // Set up customer information if provided
    let customerDataType = null;
    if (customerInfo && customerInfo.id) {
      customerDataType = new ApiContracts.CustomerDataType();
      customerDataType.setId(customerInfo.id);
    }

    // Set up transaction request
    const transactionRequestType = new ApiContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    transactionRequestType.setAmount(parsedAmount);
    transactionRequestType.setPayment(paymentType);
    transactionRequestType.setOrder(orderDetails);
    
    if (nameAndAddressType) {
      transactionRequestType.setBillTo(nameAndAddressType);
    }
    
    if (customerDataType) {
      transactionRequestType.setCustomer(customerDataType);
    }

    // Create the transaction request
    const createRequest = new ApiContracts.CreateTransactionRequest();
    createRequest.setMerchantAuthentication(merchantAuthenticationType);
    createRequest.setTransactionRequest(transactionRequestType);
    createRequest.setRefId(generateInvoiceNumber('REF', request.user.id));

    console.log('🔧 Authorize.net Charge Card request prepared:', {
      amount: parsedAmount,
      transactionType: 'authCaptureTransaction',
      environment: process.env.AUTHORIZE_NET_API_URL
    });

    return new Promise((resolve, reject) => {
      const ctrl = new ApiControllers.CreateTransactionController(createRequest.getJSON());
      ctrl.setEnvironment(process.env.AUTHORIZE_NET_API_URL);

      ctrl.execute(async () => {
        const apiResponse = ctrl.getResponse();
        
        console.log('📡 Authorize.net Charge Card API Response:', apiResponse);
        
        if (!apiResponse) {
          const apiError = ctrl.getError();
          console.error('❌ Authorize.net Charge Card API Error:', apiError);
          reject(new Parse.Error(
            Parse.Error.INTERNAL_SERVER_ERROR,
            'Failed to process card charge'
          ));
          return;
        }

        const response = new ApiContracts.CreateTransactionResponse(apiResponse);
        const transactionResponse = response.getTransactionResponse();
        
        if (response.getMessages().getResultCode() === ApiContracts.MessageTypeEnum.OK) {
          if (transactionResponse && transactionResponse.getMessages()) {
            const transactionId = transactionResponse.getTransId();
            const authCode = transactionResponse.getAuthCode();
            const responseCode = transactionResponse.getResponseCode();
            
            console.log('✅ Card Charge successful:', {
              transactionId,
              authCode,
              responseCode,
              amount: parsedAmount
            });

            // Save transaction to database and update pot balance
            try {
              const TransactionDetails = Parse.Object.extend("TransactionRecords");
              const transactionDetails = new TransactionDetails();

              transactionDetails.set("type", "recharge");
              transactionDetails.set("gameId", "786");
              transactionDetails.set("username", request.user.get("username") || "");
              transactionDetails.set("userId", request.user.id);
              transactionDetails.set("transactionDate", new Date());
              transactionDetails.set("transactionAmount", parsedAmount);
              transactionDetails.set("remark",remark);
              transactionDetails.set("useWallet", false);
              transactionDetails.set("userParentId", request.user.get("userParentId") || "");
              transactionDetails.set("status", 2); // success
              transactionDetails.set("portal", "AuthorizeNet");
              transactionDetails.set("transactionIdFromStripe", transactionId);
              transactionDetails.set("authCode", authCode);
              transactionDetails.set("paymentMethod", "Card Charge");

              await transactionDetails.save(null, { useMasterKey: true });
              
              // Update pot balance for successful charge
              const parentUserId = await getParentUserId(request.user.id);
              await updatePotBalance(parentUserId, parsedAmount, "recharge");
              
              console.log('✅ Transaction saved to database and pot balance updated');
            } catch (dbError) {
              console.error('❌ Failed to save transaction or update pot balance:', dbError);
            }
            
            resolve({
              success: true,
              transactionId: transactionId,
              authCode: authCode,
              responseCode: responseCode,
              amount: parsedAmount,
              message: transactionResponse.getMessages().getMessage()[0].getDescription()
            });
          } else {
            const errorMessage = transactionResponse?.getErrors()?.getError()?.[0]?.getErrorText() || 'Transaction failed';
            console.error('❌ Transaction failed:', errorMessage);
            reject(new Parse.Error(Parse.Error.OTHER_CAUSE, errorMessage));
          }
        } else {
          const errorMessage = response.getMessages().getMessage()[0].getText();
          const errorCode = response.getMessages().getMessage()[0].getCode();
          
          console.error('❌ Authorize.net Charge Card Error:', {
            errorCode,
            errorMessage
          });
          
          reject(new Parse.Error(
            Parse.Error.OTHER_CAUSE,
            `Card charge failed: ${errorMessage}`
          ));
        }
      });
    });

  } catch (error) {
    console.error('❌ Authorize.net Card Charge Integration Error:', error);
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      error.message || 'Card charge processing error'
    );
  }
}, { requireUser: true });

// Check Authorize.Net recharge transactions 
Parse.Cloud.define("checkAuthorizeNetPaymentsRecharge", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(TransactionRecords);

  // Find pending Authorize.Net recharge transactions
  query.equalTo("status", 1); // pending
  query.equalTo("portal", "AuthorizeNet");
  query.equalTo("type", "recharge");
  query.exists("transactionIdFromStripe"); // must have transaction ID
  query.limit(50); // process in batches

  try {
    const transactions = await query.find({ useMasterKey: true });
    console.log(`🔎 Found ${transactions.length} pending Authorize.Net recharge transactions`);

    for (const txn of transactions) {
      const transactionId = txn.get("transactionIdFromStripe");
      const createdAt = txn.get("createdAt");
      const paymentMethod = txn.get("paymentMethod");
      const now = new Date();
      const diffMs = now - createdAt;
      const diffMins = diffMs / (1000 * 60);

      // Expire transactions older than 45 minutes
      if (diffMins > 45) {
        txn.set("status", 9); // expired
        await txn.save(null, { useMasterKey: true });
        console.log(`⏰ Expired transaction ${transactionId} due to timeout`);
        continue;
      }

      try {
        // For Authorize.Net direct charges, transactions are immediately processed
        // We mainly need to handle any that might have been created with status 1 by mistake
        if (paymentMethod === "Card Charge") {
          // Update pot balance and mark as completed
          const parentUserId = await getParentUserId(txn.get("userId"));
          await updatePotBalance(parentUserId, txn.get("transactionAmount"), "recharge");
          
          txn.set("status", 2); // completed
          await txn.save(null, { useMasterKey: true });
          console.log(`✅ Updated charge transaction ${transactionId} to completed with pot balance`);
        }
        
      } catch (err) {
        console.error(`❌ Error processing transaction ${transactionId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Authorize.Net recharge transaction check failed:", err.message);
  }
});

// Expire old Authorize.Net transactions
Parse.Cloud.define("expireOldAuthorizeNetTransactions", async (request) => {
  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const query = new Parse.Query(TransactionRecords);

  // 45 minutes ago
  const now = new Date();
  const fortyFiveMinutesAgo = new Date(now.getTime() - 45 * 60 * 1000);
  
  query.equalTo("portal", "AuthorizeNet");
  query.equalTo("status", 1); // Pending
  query.lessThan("createdAt", fortyFiveMinutesAgo);
  query.limit(1000); // Max batch size

  try {
    const results = await query.find({ useMasterKey: true });

    if (results.length === 0) {
      return `No old Authorize.Net transactions to update.`;
    }

    for (const txn of results) {
      txn.set("status", 9); // Mark as expired/failed
    }

    await Parse.Object.saveAll(results, { useMasterKey: true });

    return `Updated ${results.length} Authorize.Net transactions to status 9.`;
  } catch (error) {
    console.error("❌ Error updating expired Authorize.Net transactions:", error);
    throw new Error("Failed to update expired Authorize.Net transactions.");
  }
});