const express = require('express');
const crypto = require('crypto');
const Parse = require('parse/node');

const router = express.Router();

// Setup Parse (if not globally initialized already)
Parse.initialize(process.env.PARSE_APP_ID, process.env.PARSE_JS_KEY || '', process.env.PARSE_MASTER_KEY);
Parse.serverURL = process.env.PARSE_SERVER_URL;

// Raw body parser must be used in the main app before this router
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    console.log("recieved:webhook:✅✅✅✅",req.body.toString() )
	
const isValid = verifyWebhook(
    req.body.toString(),
    req.headers,
    process.env.WEBHOOK_SECRET
  );
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
    const event = JSON.parse(req.body.toString());
    console.log("Body",event)

    try {
      switch (event.event_type) {
        case 'payment.succeeded':
          await handlePaymentSucceeded(event);
          break;

        case 'payment.failed':
          await handlePaymentFailed(event); // Optional
          break;

        default:
          console.log('⚠️ Unhandled event:', event.event_type);
      }

      res.status(200).send('OK');
    } catch (err) {
      console.error('❌ Webhook error:', err);
      res.status(200).send('OK'); // Return 200 to prevent retries
    }
  }
);
function verifyWebhook(body, headers, secret) {

  // Extract headers
  const timestamp = headers['svix-timestamp'];
  const msgId = headers['svix-id'];
  const signature = headers['svix-signature'];
  
  // Create signed content
  const toSign = msgId + '.' + timestamp + '.' + body;
  console.log("verifyingg signature:✅✅✅✅",signature )

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(toSign)
    .digest('base64');
  
  // Compare signatures
  const signatures = signature.split(' ');
  for (const sig of signatures) {
    const [version, signatureData] = sig.split(',');
    if (version === 'v1' && signatureData === expectedSignature) {
console.log("Hello :verified")      
return true;
    }
  }
  
  return false;
}

// --- Handle Payment Succeeded ---
async function handlePaymentSucceeded(event) {
  const { payment_id, amount, transaction } = event;
  const transactionId = payment_id;
  const orderId = transaction?.metadata?.order_id;

  // Check for already processed webhook
  const existing = await new Parse.Query("ProcessedWebhooks")
    .equalTo("eventId", transactionId)
    .first({ useMasterKey: true });

  if (existing) {
    console.log(`🔁 Event ${transactionId} already processed`);
    return;
  }

  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const txnQuery = new Parse.Query(TransactionRecords);
  txnQuery.equalTo("transactionIdFromStripe", transactionId);
  txnQuery.equalTo("status", 1); // pending
  txnQuery.equalTo("portal", "CLK");

  const txn = await txnQuery.first({ useMasterKey: true });

  if (!txn) {
    console.warn(`⚠️ Transaction not found for ID ${transactionId}`);
    return;
  }

  // Save processed webhook + update transaction
  const ProcessedWebhooks = Parse.Object.extend("ProcessedWebhooks");
  const webhook = new ProcessedWebhooks();
  webhook.set("eventId", transactionId);
  webhook.set("eventType", event.event_type);
  webhook.set("processedAt", new Date());

  txn.set("status", 2);
  txn.set("paidAmount", parseFloat(amount));
  txn.set("paidAt", new Date(transaction.completedAt));
  txn.set("paymentMethod", transaction.payment_method);

  await Parse.Object.saveAll([webhook, txn], { useMasterKey: true });

  console.log(`✅ Transaction ${txn.id} marked as PAID`);
}

// Optional
async function handlePaymentFailed(event) {
  const { payment_id } = event;
  console.log(`❌ Payment ${payment_id} failed`);
  // Add any desired logic (mark as failed, notify user, etc.)
}

module.exports = router;