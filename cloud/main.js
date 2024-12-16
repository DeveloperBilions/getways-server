async function loadModule() {
    const module = await import('./functions.js');
    // Use the imported module
    await import('./getways_api/getways_api.js');
}

loadModule();