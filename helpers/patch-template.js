const createPatchFile = (transactionIds) => `
const { apiCall } = require("../../lib/ms");

const trxCountPerLoop = 20;
const transactionIds = ${transactionIds};

const config = {
  method: "PATCH",
  microservice: "transaction-history",
  endPoint: "private/transactionHistory",
  isPrintToFile: false,
};

//run all query
const run = async () => {
  for (let i = 0; i < transactionIds.length; i += trxCountPerLoop) {
    let trxIds;
    if (i + trxCountPerLoop >= transactionIds.length) {
      trxIds = transactionIds.slice(i);
      console.log(\`process last trxs start : \${i}\`, trxIds);
    } else {
      trxIds = transactionIds.slice(i, i + trxCountPerLoop);
      console.log(
        \`process trxs from start : \${i}, end : \${i + trxCountPerLoop}\`,
        trxIds
      );
    }
    await apiCall({
      ...config,
      data: {
        transactionIds: trxIds,
      },
    })
      .then(console.log)
      .catch(console.error);
  }
};

run();
`;

module.exports = createPatchFile;
