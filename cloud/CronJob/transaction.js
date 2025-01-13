const stripe = require("stripe")(process.env.REACT_APP_STRIPE_KEY_PRIVATE);

Parse.Cloud.define("checkTransactionStatusStripe", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Filter by status=1
    query.limit(10000);
    const now = new Date();
    const halfHourAgo = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago in milliseconds

    // Add a condition to fetch records updated within the last half hour
    query.greaterThanOrEqualTo("updatedAt", halfHourAgo);
    query.descending("updatedAt");

    const results = await query.find();
    console.log(results.length, "results");

    if (results != null && results.length > 0) {
      console.log("Total Pending records " + results.length);
    } else {
      console.log("No transactions found in the last 30 Seconds.");
      return; // Exit if no records are found
    }

    const data = results.map((record) => record.toJSON());

    for (const record of data) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          record.transactionIdFromStripe
        );
        if (session.status === "complete") {
          record.status = 2; // Assuming 2 represents 'completed'
        } else if (session.status === "pending" || session.status === "open") {
          record.status = 1; // Pending
        } else if (session.status === "expired") {
          record.status = 9; // Expired
        } else {
          record.status = 10; // Failed or canceled
        }
        const recordObject = results.find((rec) => rec.id === record.objectId);
        if (recordObject) {
          recordObject.set("status", record.status);
          await recordObject.save();
          console.log(
            `Stripe transaction updated for orderId ${record.objectId} with status ${record.status}`
          );
        }
      } catch (error) {
        console.error(
          `Error with Stripe API for transactionId ${record.transactionId}:`,
          error.message
        );
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

Parse.Cloud.define("expiredTransactionStripe", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 1); // Assuming status 1 means 'initiated' or 'pending'
    query.descending("updatedAt");
    query.limit(10000);

    const results = await query.find();
    console.log(`${results.length} transactions found to check with Stripe.`);

    for (const record of results) {
      const transactionId = record.get("transactionIdFromStripe");

      if (transactionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(
            transactionId
          );

          if (session && session.status) {
            let newStatus;
            if (session.status === "complete") {
              newStatus = 2; // Assuming 2 represents 'completed'
            } else if (
              session.status === "pending" ||
              session.status === "open"
            ) {
              newStatus = 1; // Pending
            } else if (session.status === "expired") {
              newStatus = 9; // Expired
            } else {
              newStatus = 10; // Failed or canceled
            }
            record.set("status", newStatus);
            await record.save();
            console.log(
              `Updated transaction record ${record.id} to status ${newStatus}`
            );
          }
        } catch (stripeError) {
          console.error(
            `Error retrieving Stripe session for transactionId ${transactionId}: ${stripeError.message}`
          );
        }
      } else {
        console.log(
          `No transaction ID found for record ${record.id}, unable to check with Stripe.`
        );
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

Parse.Cloud.define("updateTransactionStatusForBlankData", async (request) => {
  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 0); // Filter by status=0 (initial or pending state)
    query.limit(10000);

    const results = await query.find();

    if (results.length > 0) {
      console.log(`Found ${results.length} transactions to update or remove.`);
      for (const record of results) {
        const transactionId = record.get("transactionIdFromStripe");

        if (transactionId) {
          // Assuming 'paid' on Stripe should update the record to status=1
          record.set("status", 1);
          await record.save();
          console.log(
            `Transaction updated for recordId ${record.id} with new status 1`
          );
        } else {
          // If there is no transactionId and status is 0, delete the record
          await record.destroy();
          console.log(
            `Transaction record deleted for recordId ${record.id} due to missing transactionId`
          );
        }
      }
    } else {
      console.log("No transactions found with status 0.");
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

Parse.Cloud.define("expireRedeemRequest", async (request) => {
  // Calculate 24 hours ago
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const query = new Parse.Query("TransactionRecords");
    query.equalTo("status", 6);
    query.greaterThanOrEqualTo("createdAt", twentyFourHoursAgo);

    const expiredRequests = await query.find();

    for (const req of expiredRequests) {
      req.set("status", 9);
      await req.save(null, { useMasterKey: true });
    }

    return `Expired ${expiredRequests.length} redeem requests`;
  } catch (error) {
    // Handle different error types
    if (error instanceof Parse.Error) {
      // Return the error if it's a Parse-specific error
      return {
        status: "error",
        code: error.code,
        message: error.message,
      };
    } else {
      // Handle any unexpected errors
      return {
        status: "error",
        code: 500,
        message: "An unexpected error occurred.",
      };
    }
  }
});
