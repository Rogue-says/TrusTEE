const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({solcVersion}, hre, runSuper) => {
  if (solcVersion === '0.8.20') return {compilerPath: require.resolve('solc/soljson.js'), isSolcJs:true,
    version: solcVersion, longVersion: require('solc').version()};
  return runSuper();
});
module.exports = { solidity: '0.8.20', paths: { sources: './my-folder/Contract' },
  networks: { hardhat: { chainId: 5003 } } };
