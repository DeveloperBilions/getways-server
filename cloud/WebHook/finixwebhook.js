const express = require('express');
const Parse = require('parse/node');
const { updatePotBalance } = require('../utility/utlis');

const router = express.Router();

Parse.initialize(process.env.APP_ID, process.env.MASTER_KEY);
Parse.masterKey = process.env.MASTER_KEY;
Parse.serverURL = process.env.SERVER_URL;

router.post('/', express.json(), async (req, res) => {
  try {
    console.log('📩 Finix webhook received:', JSON.stringify(req.body, null, 2));

    // Handle Finix test webhook (empty payload)
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('✅ Finix test webhook verified');
      return res.status(200).json({ success: true, message: 'Webhook endpoint verified' });
    }

    const { type: eventType, entity, _embedded } = req.body;

    // Finix sends type: "created" or "updated" with entity: "transfer"
    if (entity === 'transfer' && _embedded?.transfers?.[0]) {
      const transferData = _embedded.transfers[0];
      console.log(`📦 Processing transfer ${transferData.id}, state: ${transferData.state}`);

      const query = new Parse.Query('TransactionRecords');
      query.equalTo('finixTransferId', transferData.id);
      const transaction = await query.first({ useMasterKey: true });

      if (transaction) {
        if (transferData.state === 'SUCCEEDED') {
          transaction.set('status', 2);
          await transaction.save(null, { useMasterKey: true });

          // Credit coins after successful payment
          const parentUserId = transaction.get('userParentId');
          const amount = transaction.get('transactionAmount');
          await updatePotBalance(parentUserId, amount, 'recharge');

          console.log(`✅ Transaction ${transaction.id} completed, coins credited`);
          return res.status(200).json({ success: true, message: 'Webhook processed, coins credited' });
        } else if (transferData.state === 'FAILED' || transferData.state === 'CANCELED') {
          transaction.set('status', 10);
          await transaction.save(null, { useMasterKey: true });

          console.log(`❌ Transaction ${transaction.id} failed/canceled`);
          return res.status(200).json({ success: true, message: 'Webhook processed, transaction failed' });
        }

        // For PENDING state, just acknowledge
        console.log(`⏳ Transaction ${transaction.id} still pending`);
        return res.status(200).json({ success: true, message: 'Webhook received, transaction pending' });
      } else {
        console.warn('⚠️ Transaction not found for transfer:', transferData.id);
        return res.status(200).json({ success: true, message: 'Transaction not found' });
      }
    }

    console.log('ℹ️ Webhook received (not a transfer event)');
    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('❌ Error processing Finix webhook:', error);
    // Always return 200 to prevent Finix from retrying
    res.status(200).json({ success: true, message: 'Webhook received' });
  }
});

module.exports = router;
