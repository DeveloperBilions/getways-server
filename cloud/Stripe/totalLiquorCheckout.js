const stripe = require('stripe')(process.env.REACT_APP_STRIPE_KEY_PRIVATE);

Parse.Cloud.define("totalLiquorStripeCheckout", async (request) => {
  const { UserId, OrderId, totalAmount } = request.params;
  
  // Validation
  if (!UserId || !OrderId || !totalAmount) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Missing required parameters");
  }
  
  const amount = parseFloat(totalAmount);
  if (isNaN(amount) || amount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "Invalid amount");
  }
  
  try {
    const TLTransactionRecords = Parse.Object.extend("TLTransactionRecords");
    
    // Check for existing pending transaction
    const existingQuery = new Parse.Query(TLTransactionRecords);
    existingQuery.equalTo("orderId", String(OrderId));
    existingQuery.equalTo("paymentStatus", "pending");
    const existing = await existingQuery.first({ useMasterKey: true });

    if (existing) {
      return {
        OrderId: String(OrderId),
        PaymentStatus: existing.get("paymentStatus"),
        TransactionId: existing.get("transactionId"),
        stripeSessionId: existing.get("stripeSessionId"),
        clientSecret: existing.get("clientSecret")
      };
    }

    // Create Stripe session - Always embedded mode
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Total Liquor Order #${OrderId}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      metadata: { userId: String(UserId), orderId: String(OrderId), source: 'total_liquor' },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      mode: 'payment',
      ui_mode: 'embedded',
      return_url: `https://precious-licorice-57b141.netlify.app/?session_id={CHECKOUT_SESSION_ID}&order_id=${OrderId}&status=success`,
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Create transaction record
    const transactionId = `TL_${Date.now()}_${OrderId}`;
    const transaction = new TLTransactionRecords();
    transaction.set("userId", String(UserId));
    transaction.set("orderId", String(OrderId));
    transaction.set("totalAmount", amount);
    transaction.set("transactionId", transactionId);
    transaction.set("stripeSessionId", session.id);
    transaction.set("paymentStatus", "pending");
    transaction.set("createdAt", new Date());
    transaction.set("updatedAt", new Date());
    transaction.set("stripePaymentIntentId", null);
    transaction.set("currency", "usd");
    transaction.set("paymentMethod", "stripe");
    transaction.set("clientSecret", session.client_secret);
    
    await transaction.save(null, { useMasterKey: true });

    return {
      OrderId: String(OrderId),
      PaymentStatus: "pending",
      TransactionId: transactionId,
      stripeSessionId: session.id,
      clientSecret: session.client_secret
    };

  } catch (error) {
    if (error instanceof Parse.Error) throw error;
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `Checkout failed: ${error.message}`);
  }
});

Parse.Cloud.define("totalLiquorPaymentRefresh", async (request) => {
  const { OrderId, TransactionId } = request.params;
  
  if (!OrderId && !TransactionId) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, "OrderId or TransactionId required");
  }

  try {
    const TLTransactionRecords = Parse.Object.extend("TLTransactionRecords");
    const query = new Parse.Query(TLTransactionRecords);
    
    if (OrderId) query.equalTo("orderId", String(OrderId));
    else query.equalTo("transactionId", String(TransactionId));

    const transaction = await query.first({ useMasterKey: true });
    if (!transaction) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Transaction not found");
    }

    let paymentStatus = transaction.get("paymentStatus");
    const stripeSessionId = transaction.get("stripeSessionId");
    
    // Only check Stripe if still pending
    if (paymentStatus === "pending" && stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
        
        if (session.payment_status === "paid") {
          paymentStatus = "success";
          transaction.set("paymentStatus", "success");
          transaction.set("updatedAt", new Date());
          transaction.set("stripePaymentIntentId", session.payment_intent);
          await transaction.save(null, { useMasterKey: true });
        } else if (session.status === "expired" || 
                  (session.payment_status === "unpaid" && session.status !== "open")) {
          paymentStatus = "failed";
          transaction.set("paymentStatus", "failed");
          transaction.set("updatedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
        }
      } catch (stripeError) {
        if (stripeError.code === 'resource_missing') {
          paymentStatus = "failed";
          transaction.set("paymentStatus", "failed");
          transaction.set("updatedAt", new Date());
          await transaction.save(null, { useMasterKey: true });
        }
      }
    }

    const response = {
      OrderId: transaction.get("orderId"),
      PaymentStatus: paymentStatus,
      TransactionId: transaction.get("transactionId")
    };

    // Always include clientSecret since we only use embedded mode
    const clientSecret = transaction.get("clientSecret");
    if (clientSecret) {
      response.clientSecret = clientSecret;
    }

    return response;

  } catch (error) {
    if (error instanceof Parse.Error) throw error;
    throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, `Payment refresh failed: ${error.message}`);
  }
});