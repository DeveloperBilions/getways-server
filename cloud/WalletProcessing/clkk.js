const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const axios = require('axios');

Parse.Cloud.define('updateClkkTransactionStatusFromLocalFile', async (request) => {
  const filePath = './trn.csv';

  const absolutePath = path.resolve(__dirname, filePath);

  // Step 1: Read file
  let csvString;
  try {
    csvString = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read file at ${absolutePath}: ${err.message}`);
  }

  // Step 2: Parse CSV
  const records = parse(csvString, {
    columns: true,
    skip_empty_lines: true,
  });

  // Step 3: Setup tracking + constants
  const AUTH_TOKEN = 'ckpl_m9n090qbSpjTSGnjavXAvq2RmQuNdtkIN3hrtyN-QuM';
  const BASE_URL = 'https://api.staging.clkk-api.io/api/partner/payments/';

  let total = records.length;
  let missing = 0;
  let success = 0;
  let failed = 0;

  console.log(`🚀 Processing ${total} transaction(s) from CSV file: ${filePath}`);

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const transactionId = row.transactionIdFromclkk;

    if (!transactionId) {
      row.statusCLK = 'MISSING_TXN_ID';
      missing++;
      console.log(`⚠️  Row ${i + 1}: Missing transactionIdFromclkk`);
      continue;
    }

    try {
      const res = await axios.get(`${BASE_URL}${transactionId}`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      });

      const status = res.data?.status || 'UNKNOWN';
      row.statusCLK = status;
      success++;

      console.log(`✅ Row ${i + 1}: ${transactionId} → ${status}`);
    } catch (err) {
      row.statusCLK = 'ERROR';
      failed++;

      console.error(`❌ Row ${i + 1}: ${transactionId} → ERROR (${err.message})`);
    }
  }

  // Step 4: Write back to file
  const updatedCSV = stringify(records, { header: true });
  const outputPath = path.resolve(__dirname, `updated_${path.basename(filePath)}`);

  try {
    fs.writeFileSync(outputPath, updatedCSV, 'utf-8');
  } catch (err) {
    throw new Error(`Could not write updated file: ${err.message}`);
  }

  // Final summary
  console.log('📊 Final Summary:');
  console.log(`➡️  Total rows: ${total}`);
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Missing Txn ID: ${missing}`);
  console.log(`📁 Updated file saved to: ${outputPath}`);

  return {
    message: 'CSV updated successfully.',
    stats: { total, success, failed, missing },
    outputPath,
  };
});


Parse.Cloud.define('updateClkkTransactionStatusFromLocalFileUserId', async (request) => {
    const filePath = './updated_trn.csv';
    const absolutePath = path.resolve(__dirname, filePath);
  
    // Step 1: Read file
    let csvString;
    try {
      csvString = fs.readFileSync(absolutePath, 'utf-8');
    } catch (err) {
      throw new Error(`Could not read file at ${absolutePath}: ${err.message}`);
    }
  
    // Step 2: Parse CSV
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
    });
  
    // Step 3: Setup tracking + constants
    const AUTH_TOKEN = 'ckpl_m9n090qbSpjTSGnjavXAvq2RmQuNdtkIN3hrtyN-QuM';
    const BASE_URL = 'https://api.staging.clkk-api.io/api/partner/payments/';
  
    let total = records.length;
    let missing = 0;
    let success = 0;
    let failed = 0;
  
    console.log(`🚀 Processing ${total} transaction(s) from CSV file: ${filePath}`);
  
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const userId = row.userId;
  
      if (userId) {
        try {
          const userQuery = new Parse.Query(Parse.User);
          userQuery.equalTo('objectId', userId);
      
          const user = await userQuery.first({ useMasterKey: true });
      
          row.userParentName = user?.get('userParentName') || 'N/A';
          row.userParentId = user?.get('userParentId') || 'N/A';
          console.log(`✅ Row ${i + 1}`);

        } catch (err) {
          console.warn(`⚠️  Could not fetch user for userId: ${userId}`);
          row.userParentName = 'ERROR';
          row.userParentId = 'ERROR';
        }
      } else {
        row.userParentName = 'MISSING_USER_ID';
        row.userParentId = 'MISSING_USER_ID';
      }
      
    }
  
    // Step 4: Write back updated CSV
    const updatedCSV = stringify(records, { header: true });
    const outputPath = path.resolve(__dirname, `updated__${path.basename(filePath)}`);
  
    try {
      fs.writeFileSync(outputPath, updatedCSV, 'utf-8');
    } catch (err) {
      throw new Error(`Could not write updated file: ${err.message}`);
    }
  
    // Final summary
    console.log('📊 Final Summary:');
    console.log(`➡️  Total rows: ${total}`);
    console.log(`✅ Success: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Missing Txn ID: ${missing}`);
    console.log(`📁 Updated file saved to: ${outputPath}`);
  
    return {
      message: 'CSV updated successfully with status and parent name.',
      stats: { total, success, failed, missing },
      outputPath,
    };
  });
  