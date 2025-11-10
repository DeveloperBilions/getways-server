async function logTransactionChange({
  originalTxn,
  updatedTxn,
  sourceFunction,
}) {
  const TransactionRecordsLog = Parse.Object.extend("TransactionRecordsLog");
  const log = new TransactionRecordsLog();

  const before = originalTxn.toJSON ? originalTxn.toJSON() : originalTxn;
  const after = updatedTxn.toJSON ? updatedTxn.toJSON() : updatedTxn;

  const beforeDiff = {};
  const afterDiff = {};

  for (const key in after) {
    if (["objectId", "createdAt", "updatedAt"].includes(key)) continue;

    const beforeVal = before[key];
    const afterVal = after[key];

    // Compare using JSON.stringify for deep equality
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      beforeDiff[key] = beforeVal === undefined ? null : beforeVal;
      afterDiff[key] = afterVal === undefined ? null : afterVal;
    }
  }
  if (Object.keys(afterDiff).length > 0) {
    log.set("transaction", {
      __type: "Pointer",
      className: "TransactionRecords",
      objectId: updatedTxn.id,
    });
    log.set("beforeData", beforeDiff);
    log.set("afterData", afterDiff);
    log.set("sourceFunction", sourceFunction);

    await log.save(null, { useMasterKey: true });
  }
}


module.exports = { logTransactionChange };
