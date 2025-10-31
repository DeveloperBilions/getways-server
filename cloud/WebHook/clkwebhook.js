const express = require('express');
const crypto = require('crypto');
const Parse = require('parse/node');
const { updatePotBalance } = require('../utility/utlis');

const router = express.Router();

Parse.initialize(process.env.APP_ID, process.env.MASTER_KEY);
Parse.masterKey = process.env.MASTER_KEY;
Parse.serverURL = process.env.SERVER_URL;

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    
    console.log("recieved:webhook:✅✅✅", req.body , req.body.data.object.transaction , req.body.data.object.webhook_metadata);
	
    const isValid = verifyWebhook(
    req.body.toString(),
    req.headers,
    process.env.WEBHOOK_SECRET
  );
  
    const event = req.body
    console.log("Body",event)

    try {
      switch (event.type) {
        case 'payment.succeeded':
          await handlePaymentSucceeded(event.data.object);
          break;

        case 'payment.failed':
          await handlePaymentFailed(event.data.object); // Optional
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
  console.log("Hello :signatures",signatures)      

  for (const sig of signatures) {
    const [version, signatureData] = sig.split(',');
    console.log("Hello :version",version,signatureData, expectedSignature)      

    if (version === 'v1' && signatureData === expectedSignature) {
console.log("Hello :verified")      
return true;
    }
  }
  
  return false;
}

async function handlePaymentSucceeded(event) {
  const {  transaction } = event;
  console.log(transaction,"transaction^^^^^^^^^^")
  const orderId = transaction?.metadata?.checkoutSessionId;

  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const txnQuery = new Parse.Query(TransactionRecords);
  txnQuery.equalTo("transactionIdFromStripe", orderId);
  txnQuery.equalTo("status", 1);
  txnQuery.equalTo("portal", "CLK");

  const txn = await txnQuery.first({ useMasterKey: true });

  if (!txn) {
    console.warn(`⚠️ Transaction not found for ID ${orderId}`);
    return;
  }

  //txn.set("status", 2);
  txn.set("transactionIdFromStripe", transaction?.id);
  await Parse.Object.saveAll([txn], { useMasterKey: true });
  //await updatePotBalance(txn.get("userParentId"), txn.get("transactionAmount"), "recharge");
  
  console.log(`✅ Transaction ${txn.id} marked as PAID`);
}
async function handlePaymentFailed(event) {
    const {  transaction } = event;
  const orderId = transaction?.metadata?.checkoutSessionId;

  const TransactionRecords = Parse.Object.extend("TransactionRecords");
  const txnQuery = new Parse.Query(TransactionRecords);
  txnQuery.equalTo("transactionIdFromStripe", orderId);
  txnQuery.equalTo("status", 1);
  txnQuery.equalTo("portal", "CLK");

  const txn = await txnQuery.first({ useMasterKey: true });

  if (!txn) {
    console.warn(`⚠️ Transaction not found for ID ${orderId}`);
    return;
  }

  txn.set("status", 10);

  await Parse.Object.saveAll([txn], { useMasterKey: true });

  console.log(`✅ Transaction ${txn.id} marked as PAID`);
  console.log(`❌ Payment ${payment_id} failed`);
}

module.exports = router;