async function logTransactionChange({
  originalTxn,
  updatedTxn,
  sourceFunction,
}) {
  const TransactionRecordsLog = Parse.Object.extend("TransactionRecordsLog");
  const log = new TransactionRecordsLog();
  log.set("transaction", originalTxn);
  log.set("beforeData", originalTxn.toJSON());
  log.set("afterData", updatedTxn.toJSON());
  log.set("sourceFunction", sourceFunction);
  await log.save(null, { useMasterKey: true });
}

module.exports = { logTransactionChange };
