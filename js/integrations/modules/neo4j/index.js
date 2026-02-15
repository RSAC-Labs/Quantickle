(function() {
    const createNeo4jIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'neo4jStatus', ...options });
        };

        const getCredentials = () => ({
            url: services?.config?.getRuntime?.('neo4jUrl') || '',
            username: services?.config?.getRuntime?.('neo4jUsername') || '',
            password: services?.config?.getRuntime?.('neo4jPassword') || ''
        });

        return {
            id: 'neo4j',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                saveConfig: async () => {
                    const usernameInput = document.getElementById('neo4jUsername');
                    const passwordInput = document.getElementById('neo4jPassword');

                    const url = services?.config?.getRuntime?.('neo4jUrl')?.trim();
                    const username = usernameInput?.value.trim();
                    const password = passwordInput?.value.trim();

                    if (!url || !username || !password) {
                        notify(url ? 'Please enter username and password' : 'Server Neo4j URL is not configured', 'error');
                        services?.integrations?.updateNeo4jMenuVisibility?.();
                        return { ok: false };
                    }

                    await services?.credentials?.ensurePassphrase?.();

                    services?.config?.setRuntime?.('neo4jUrl', url);
                    services?.config?.setRuntime?.('neo4jUsername', username);
                    services?.config?.setRuntime?.('neo4jPassword', password);

                    const usernameStorageKey = services?.config?.getStorageKey?.('NEO4J_USERNAME');
                    const passwordStorageKey = services?.config?.getStorageKey?.('NEO4J_PASSWORD');
                    if (usernameStorageKey) {
                        services?.storage?.setItem?.(usernameStorageKey, await services?.credentials?.encrypt?.(username));
                    }
                    if (passwordStorageKey) {
                        services?.storage?.setItem?.(passwordStorageKey, await services?.credentials?.encrypt?.(password));
                    }

                    notify('Configuration saved successfully', 'success');
                    services?.integrations?.updateNeo4jMenuVisibility?.();
                    return { ok: true };
                },
                testConnection: async () => {
                    const creds = getCredentials();
                    if (!creds.url || !creds.username || !creds.password) {
                        notify('No credentials configured', 'error');
                        return { ok: false };
                    }

                    notify('Testing connection...', 'testing');

                    try {
                        const auth = btoa(`${creds.username}:${creds.password}`);
                        let testUrl = creds.url;
                        let database = 'neo4j';

                        try {
                            const parsed = new URL(testUrl);

                            if (parsed.protocol === 'neo4j:' || parsed.protocol === 'bolt:') {
                                testUrl = `http://${parsed.hostname}:7474`;
                            } else {
                                testUrl = `${parsed.protocol}//${parsed.host}`;
                            }

                            const pathParts = parsed.pathname.split('/').filter(Boolean);
                            if (pathParts[0] === 'db' && pathParts[1]) {
                                database = pathParts[1];
                            }
                        } catch (urlError) {
                            console.warn('Unable to parse Neo4j URL, using raw value:', urlError);
                        }

                        const url = `${testUrl.replace(/\/$/, '')}/db/${database}/tx/commit`;
                        const apiPath = url.replace(/^https?:\/\/[^/]+/i, '');
                        const body = JSON.stringify({ statements: [{ statement: 'RETURN 1' }] });
                        const response = await services?.server?.neo4j?.request?.(apiPath, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Basic ${auth}`,
                                'Content-Type': 'application/json'
                            },
                            body
                        });

                        const responseText = await response.clone().text();
                        if (!response.ok) {
                            throw new Error(`Status ${response.status}`);
                        }

                        const result = JSON.parse(responseText);
                        if (result.errors && result.errors.length > 0) {
                            throw new Error(result.errors[0].message);
                        }

                        notify('Connection successful', 'success');
                        return { ok: true };
                    } catch (error) {
                        console.error('Neo4j connection test failed:', error);
                        notify('Connection test failed', 'error');
                        return { ok: false, error };
                    }
                }
            }
        };
    };

    window.Neo4jIntegrationModule = {
        create: createNeo4jIntegrationModule
    };
})();
