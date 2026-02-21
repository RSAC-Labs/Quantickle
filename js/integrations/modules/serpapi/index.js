(function() {
    const createSerpApiIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'serpapiStatus', ...options });
        };

        return {
            id: 'serpapi',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                saveConfig: async () => {
                    const apiKeyInput = document.getElementById('serpApiKey');
                    const apiKey = apiKeyInput?.value.trim();

                    if (!apiKey) {
                        notify('Please enter an API key', 'error');
                        return { ok: false };
                    }

                    if (!/^[A-Za-z0-9]{20,}$/.test(apiKey)) {
                        notify('Invalid API key format', 'error');
                        return { ok: false };
                    }

                    await services?.credentials?.ensurePassphrase?.();
                    services?.config?.setRuntime?.('serpApiKey', apiKey);

                    const storageKey = services?.config?.getStorageKey?.('SERPAPI_API_KEY');
                    if (storageKey) {
                        services?.storage?.setItem?.(storageKey, await services?.credentials?.encrypt?.(apiKey));
                    }

                    notify('Configuration saved successfully', 'success');
                    return { ok: true };
                },
                testConnection: async () => {
                    const apiKey = services?.config?.getRuntime?.('serpApiKey');
                    if (!apiKey) {
                        notify('No API key configured', 'error');
                        return { ok: false };
                    }

                    notify('Testing connection...', 'testing');

                    try {
                        const response = await services?.server?.serpapi?.request?.({ q: 'coffee', api_key: apiKey });
                        if (!response.ok) {
                            throw new Error('Invalid API key');
                        }
                        notify('Connection successful', 'success');
                        return { ok: true };
                    } catch (error) {
                        console.error('SerpApi connection test failed:', error);
                        notify('Connection test failed (CORS/Network)', 'error');
                        return { ok: false, error };
                    }
                }
            }
        };
    };

    window.SerpApiIntegrationModule = {
        create: createSerpApiIntegrationModule
    };
})();
