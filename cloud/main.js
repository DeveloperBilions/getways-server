async function loadModule() {
    const module = await import('./functions.js');
    // Use the imported module
    await import('./getways_api/getways_api.js');
    await import('./CronJob/transaction.js')
    await import('./Triggers/triggers.js')
    await import('./Triggers/nowPayment.js')

}

loadModule();