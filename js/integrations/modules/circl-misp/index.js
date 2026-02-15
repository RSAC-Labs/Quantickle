(function() {
    const createCirclMispIntegrationModule = () => {
        let services = null;

        const notify = (message, level = 'info', options = {}) => {
            services?.status?.notify?.({ message, level, statusId: 'circlLuStatus', ...options });
        };

        const requestCirclLu = async (endpoint, options = {}) => {
            const manager = services?.integrations;
            const { baseUrl, username, authKey } = manager?.getCirclLuConfiguration?.() || {};

            if (!baseUrl) {
                throw new Error('CIRCL-LU base URL not configured');
            }

            const requestOptions = { ...options };
            const headers = { ...(options.headers || {}) };

            let authorizationHeader = '';
            if (username && authKey) {
                const token = btoa(`${username}:${authKey}`);
                authorizationHeader = `Basic ${token}`;
            } else if (authKey) {
                authorizationHeader = `Bearer ${authKey}`;
            }

            if (authorizationHeader) {
                headers.Authorization = authorizationHeader;
            }

            const proxyHeaders = { ...headers };
            if (authorizationHeader) {
                proxyHeaders['X-Proxy-Authorization'] = authorizationHeader;
                delete proxyHeaders.Authorization;
            }
            requestOptions.headers = proxyHeaders;

            try {
                const relativeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
                const response = await services?.server?.misp?.request?.(relativeEndpoint, requestOptions);
                if (!response.ok) {
                    throw new Error(`CIRCL-LU request failed (${response.status})`);
                }
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    return await response.json();
                }
                return await response.text();
            } catch (error) {
                throw new Error(error.message || 'Failed to reach CIRCL-LU feed');
            }
        };

        const proxyRequest = async (resource = 'manifest.json', options = {}) => {
            const manager = services?.integrations;
            const feedUrl = options.feedUrl
                || services?.config?.getRuntime?.('circlLuBaseUrl')
                || manager?.getLastMispFeedUrl?.()
                || manager?.getDefaultMispFeedUrl?.();

            if (!manager || !feedUrl) {
                throw new Error('CIRCL MISP integration is not available');
            }

            const normalizedFeed = manager?.normalizeMispFeedUrl?.(feedUrl) || feedUrl;

            try {
                if (typeof resource === 'string' && /manifest\.json$/i.test(resource.trim())) {
                    const { manifest } = await manager.fetchCirclMispManifest(normalizedFeed);
                    return manifest;
                }

                const descriptor = typeof resource === 'object' && resource
                    ? { ...resource }
                    : { path: resource };

                if (!descriptor.uuid && typeof descriptor.path === 'string') {
                    const uuidFromPath = descriptor.path.replace(/\.json(\.gz)?$/i, '').split('/').pop();
                    descriptor.uuid = uuidFromPath || descriptor.uuid;
                }

                return await manager.fetchMispEventPayload(normalizedFeed, descriptor);
            } catch (error) {
                console.error('CIRCL MISP proxy request failed', error);
                const status = error.status || (/status\s+(\d{3})/i.exec(error.message || '')?.[1]) || 'unknown';
                const wrapped = new Error(`CIRCL-LU request failed (${status})`);
                wrapped.cause = error;
                throw wrapped;
            }
        };

        return {
            id: 'circl-misp',
            init: async (providedServices) => {
                services = providedServices;
            },
            actions: {
                saveConfig: async () => {
                    const usernameInput = document.getElementById('circlLuAuthUsername');
                    const authKeyInput = document.getElementById('circlLuAuthKey');
                    const lastSyncInput = document.getElementById('circlLuLastSync');

                    const username = usernameInput?.value.trim() || '';
                    const authKey = authKeyInput?.value.trim() || '';
                    const lastSync = lastSyncInput?.value.trim() || '';

                    await services?.credentials?.ensurePassphrase?.();

                    services?.config?.setRuntime?.('circlLuAuthUsername', username);
                    services?.config?.setRuntime?.('circlLuAuthKey', authKey);
                    services?.config?.setRuntime?.('circlLuLastSync', lastSync);

                    const usernameStorageKey = services?.config?.getStorageKey?.('CIRCL_LU_AUTH_USERNAME');
                    const authStorageKey = services?.config?.getStorageKey?.('CIRCL_LU_AUTH_KEY');
                    const lastSyncStorageKey = services?.config?.getStorageKey?.('CIRCL_LU_LAST_SYNC');

                    if (usernameStorageKey) {
                        if (username) {
                            services?.storage?.setItem?.(usernameStorageKey, await services?.credentials?.encrypt?.(username));
                        } else {
                            services?.storage?.removeItem?.(usernameStorageKey);
                        }
                    }

                    if (authStorageKey) {
                        if (authKey) {
                            services?.storage?.setItem?.(authStorageKey, await services?.credentials?.encrypt?.(authKey));
                        } else {
                            services?.storage?.removeItem?.(authStorageKey);
                        }
                    }

                    if (lastSyncStorageKey) {
                        if (lastSync) {
                            services?.storage?.setItem?.(lastSyncStorageKey, lastSync);
                        } else {
                            services?.storage?.removeItem?.(lastSyncStorageKey);
                        }
                    }

                    notify('Configuration saved successfully', 'success');
                    return { ok: true };
                },
                request: async (_ctx, params = {}) => requestCirclLu(params.endpoint || '/', params.options || {}),
                importData: async (_ctx, params = {}) => {
                    const mispTasks = services?.tasks?.misp;
                    mispTasks?.resetCancel?.();
                    return services?.integrations?.importCirclMispFeed?.({
                        ...params,
                        taskHooks: {
                            beginProgress: (label) => mispTasks?.beginProgress?.(label),
                            updateProgress: (taskId, label) => mispTasks?.updateProgress?.(taskId, label),
                            endProgress: (taskId) => mispTasks?.endProgress?.(taskId),
                            isCancelRequested: () => mispTasks?.isCancelRequested?.() || false
                        }
                    });
                },
                cancelImport: async () => {
                    services?.tasks?.misp?.requestCancel?.();
                    notify('Cancelling CIRCL MISP import...', 'info', { toast: false });
                    return { ok: true };
                },
                requestResource: async (_ctx, params = {}) => proxyRequest(params.resource, params.options || {}),
                testConnection: async () => {
                    notify('Testing connection...', 'testing');
                    try {
                        await requestCirclLu('/manifest.json', { method: 'GET' });
                        notify('Connection successful', 'success');
                        return { ok: true };
                    } catch (error) {
                        notify(error.message || 'Connection test failed', 'error');
                        return { ok: false, error };
                    }
                },
                fetchManifest: async () => {
                    notify('Fetching manifest...', 'testing');
                    try {
                        const manifest = await requestCirclLu('/manifest.json', { method: 'GET' });
                        console.info('CIRCL-LU manifest:', manifest);
                        notify('Manifest fetched (check console for details)', 'success');
                        return manifest;
                    } catch (error) {
                        notify(error.message || 'Failed to fetch manifest', 'error');
                        throw error;
                    }
                }
            }
        };
    };

    window.CirclMispIntegrationModule = {
        create: createCirclMispIntegrationModule
    };
})();
