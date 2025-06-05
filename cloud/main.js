async function loadModule() {
    const module = await import('./functions.js');
    // Use the imported module
    await import('./getways_api/getways_api.js');
    await import('./CronJob/transaction.js')
    await import('./Triggers/triggers.js')
    await import('./Triggers/nowPayment.js')
    await import('./Triggers/transfiPayment.js')
    await import('./Triggers/WalletAddress.js')
    await import('./ScInputData/generateInput.js')
    await import('./WalletProcessing/wallet.js')
    await import('./BSCSCAN/api.js')
    await import('./CoinBaseOnRamp/CoinBase.js')
    await import('./parse.js')
    await import('./Triggers/transaction.js')
    await import('./PayArc/payarc.js')

}

loadModule();