const stripe = require('stripe')(process.env.REACT_APP_STRIPE_KEY_PRIVATE);

Parse.Cloud.define("checkTransactionStatusStripe", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1);  // Filter by status=1
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000);  // 30 minutes ago in milliseconds

    // Add a condition to fetch records updated within the last half hour
    query.greaterThanOrEqualTo("updatedAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();
    console.log(results.length,"results")

    if (results != null && results.length > 0) {
      console.log("Total Pending records " + results.length);
    } else {
      console.log("No transactions found in the last 30 minutes.");
      return;  // Exit if no records are found
    }

    const data = results.map((record) => record.toJSON());

    for (const record of data) {
      try {
        const session = await stripe.checkout.sessions.retrieve(record.transactionIdFromStripe);
        if (session.payment_status === 'paid') {
          record.status = 2; // Assuming 2 represents 'completed'
        } else if (session.payment_status === 'pending') {
          record.status = 1; // Pending
        } else {
          record.status = 0; // Failed or canceled
        }
        const recordObject = results.find((rec) => rec.id === record.objectId);
        if (recordObject) {
          recordObject.set("status", record.status);
          await recordObject.save();
          console.log(`Stripe transaction updated for orderId ${record.objectId} with status ${record.status}`);
        }
      } catch (error) {
        console.error(`Error with Stripe API for transactionId ${record.transactionId}:`, error.message);
      }
    }
  } catch (error) {
    if (error instanceof Parse.Error) {
      console.log(`Parse-specific error: ${error.code} - ${error.message}`);
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      console.log(`An unexpected error occurred: ${error.message}`);
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});
