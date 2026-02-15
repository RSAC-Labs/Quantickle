(function() {
    const createOpenAIIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'openaiStatus', ...options });
        };

        return {
            id: 'openai',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                saveConfig: async () => {
                    const apiKeyInput = document.getElementById('openaiApiKey');
                    const apiKey = apiKeyInput?.value.trim();

                    if (!apiKey) {
                        notify('Please enter an API key', 'error');
                        return { ok: false };
                    }

                    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
                        notify('Invalid API key format', 'error');
                        return { ok: false };
                    }

                    await services?.credentials?.ensurePassphrase?.();
                    services?.config?.setRuntime?.('openaiApiKey', apiKey);

                    const storageKey = services?.config?.getStorageKey?.('OPENAI_API_KEY');
                    if (storageKey) {
                        services?.storage?.setItem?.(storageKey, await services?.credentials?.encrypt?.(apiKey));
                    }

                    notify('Configuration saved successfully', 'success');
                    return { ok: true };
                },
                testConnection: async () => {
                    const apiKey = services?.config?.getRuntime?.('openaiApiKey');
                    if (!apiKey) {
                        notify('No API key configured', 'error');
                        return { ok: false };
                    }

                    notify('Testing connection...', 'testing');

                    try {
                        const response = await services.network.fetch('https://api.openai.com/v1/models', {
                            headers: { 'Authorization': `Bearer ${apiKey}` }
                        });
                        if (!response.ok) {
                            throw new Error('Invalid API key');
                        }
                        notify('Connection successful', 'success');
                        return { ok: true };
                    } catch (error) {
                        console.error('OpenAI connection test failed:', error);
                        notify('Connection test failed (CORS/Network)', 'error');
                        return { ok: false, error };
                    }
                }
            }
        };
    };

    window.OpenAIIntegrationModule = {
        create: createOpenAIIntegrationModule
    };
})();
