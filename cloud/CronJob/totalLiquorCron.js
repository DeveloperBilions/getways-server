const stripe = require('stripe')(process.env.REACT_APP_STRIPE_KEY_PRIVATE);

/**
 * Checks and updates pending Total Liquor Stripe payments
 * Handles: pending → success/failed/expired status updates
 */
Parse.Cloud.define("checkTotalLiquorTransactionStatus", async (request) => {
  try {
    const TLTransactionRecords = Parse.Object.extend("TLTransactionRecords");
    const query = new Parse.Query(TLTransactionRecords);
    query.equalTo("paymentStatus", "pending");
    query.equalTo("paymentMethod", "stripe");
    query.notEqualTo("stripeSessionId", null);
    query.limit(1000);
    query.descending("updatedAt");

    const pendingTransactions = await query.find({ useMasterKey: true });
    if (!pendingTransactions?.length) return { processed: 0, message: "No pending transactions" };

    let successCount = 0, failedCount = 0, expiredCount = 0;
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    
    // Batch process transactions for efficiency
    const updates = [];
    
    for (const transaction of pendingTransactions) {
      const stripeSessionId = transaction.get("stripeSessionId");
      const createdAt = transaction.get("createdAt");
      
      // Check if transaction expired (older than 30 minutes)
      if (createdAt < thirtyMinutesAgo) {
        transaction.set("paymentStatus", "failed");
        transaction.set("updatedAt", now);
        updates.push(transaction);
        expiredCount++;
        continue;
      }

      // Check Stripe session status
      try {
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
        let newStatus = null;
        
        if (session.payment_status === "paid") {
          newStatus = "success";
          transaction.set("stripePaymentIntentId", session.payment_intent);
          successCount++;
        } else if (session.status === "expired" || 
                  (session.payment_status === "unpaid" && session.status !== "open")) {
          newStatus = "failed";
          failedCount++;
        }
        // If still pending (unpaid + open), no update needed

        if (newStatus) {
          transaction.set("paymentStatus", newStatus);
          transaction.set("updatedAt", now);
          updates.push(transaction);
        }

      } catch (stripeError) {
        if (stripeError.code === 'resource_missing') {
          transaction.set("paymentStatus", "failed");
          transaction.set("updatedAt", now);
          updates.push(transaction);
          failedCount++;
        }
      }
    }

    // Batch save all updates
    if (updates.length > 0) {
      await Parse.Object.saveAll(updates, { useMasterKey: true });
    }

    return {
      processed: pendingTransactions.length,
      updated: updates.length,
      success: successCount,
      failed: failedCount,
      expired: expiredCount,
      timestamp: now
    };

  } catch (error) {
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Total Liquor cron job failed: ${error.message}`
    );
  }
});