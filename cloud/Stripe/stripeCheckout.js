// /cloud/stripeCheckout.js

const stripe = require('stripe')(process.env.REACT_APP_STRIPE_KEY_PRIVATE); // replace with env variable ideally

Parse.Cloud.define("createStripeCheckoutSession", async (request) => {
  const {
    amount,
    currency = "usd",
    productName = "Recharge",
    returnBaseUrl,
    remark = "",
  } = request.params;

  if (!amount || !returnBaseUrl) {
    throw new Error("Missing required parameters: amount or returnBaseUrl or userId");
  }

  const user = await request.user?.fetch({ useMasterKey: true });
  if (!user) {
    throw new Error("User must be authenticated");
  }

  try {
    // Step 1: Create Stripe Session
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: productName,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      return_url: `${returnBaseUrl}?session_id={CHECKOUT_SESSION_ID}`,
      metadata: {
        userId: user.id,
        username: user.get("username")
      }
    });

    // Step 2: Create Transaction Record in Parse
    const TransactionDetails = Parse.Object.extend("TransactionRecords");
    const transaction = new TransactionDetails();
    
    transaction.set("type", "recharge");
    transaction.set("gameId", "786");
    transaction.set("username", user.get("username"));
    transaction.set("userId", user.id);
    transaction.set("transactionDate", new Date());
    transaction.set("transactionAmount", amount);
    transaction.set("remark", remark);
    transaction.set("useWallet", false);
    transaction.set("userParentId", user.get("userParentId") || "");
    transaction.set("status", 1);
    transaction.set("portal", "Stripe");
    transaction.set("transactionIdFromStripe", session.id);
    transaction.set("referralLink", session.url || ""); // in case you add redirect mode later
    transaction.set("walletAddr", user.get("walletAddr") || "");

    await transaction.save(null, { useMasterKey: true });

    return {
      clientSecret: session.client_secret,
      sessionId: session.id,
    };
  } catch (error) {
    console.error("Stripe session creation failed:", error);
    throw new Error("Failed to create Stripe Checkout Session");
  }
});


Parse.Cloud.define("getStripeSessionStatus", async (request) => {
    const { sessionId } = request.params;
  
    if (!sessionId) {
      throw new Error("Missing required parameter: sessionId");
    }
  
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
  
      return {
        status: session.status,
        session,
        customer_email: session.customer_details?.email || null,
      };
    } catch (error) {
      console.error("Error retrieving session:", error);
      throw new Error("Failed to retrieve Stripe session status");
    }
  });
  