(function() {
    const createCirclMispIntegrationModule = () => {
        let services = null;

        const requestCirclLu = async (endpoint, options = {}) => {
            const manager = window.IntegrationsManager;
            const { baseUrl, username, authKey } = manager.getCirclLuConfiguration();

            if (!baseUrl) {
                throw new Error('CIRCL-LU base URL not configured');
            }

            const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            const url = `${normalizedBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

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

            let fetchUrl = url;
            let requestUrl;
            try {
                requestUrl = new URL(url);
            } catch (_) {
                requestUrl = new URL(url, window.location.origin);
            }

            const isCrossOrigin = requestUrl.origin !== window.location.origin;
            if (isCrossOrigin) {
                fetchUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
                const proxyHeaders = { ...headers };
                if (authorizationHeader) {
                    proxyHeaders['X-Proxy-Authorization'] = authorizationHeader;
                    delete proxyHeaders.Authorization;
                }
                requestOptions.headers = proxyHeaders;
            } else {
                requestOptions.headers = headers;
            }

            try {
                const response = await services.network.fetch(fetchUrl, requestOptions);
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
            const manager = window.IntegrationsManager;
            const feedUrl = options.feedUrl
                || manager?.CIRCL_LU_BASE_URL
                || manager?.lastCirclMispFeedUrl
                || manager?.CIRCL_MISP_DEFAULT_FEED_URL;

            if (!manager || !feedUrl) {
                throw new Error('CIRCL MISP integration is not available');
            }

            const normalizedFeed = manager.normalizeMispFeedUrl(feedUrl);

            try {
                if (typeof resource === 'string' && /manifest\.json$/i.test(resource.trim())) {
                    const { manifest, descriptors } = await manager.fetchCirclMispManifest(normalizedFeed);
                    manager.lastCirclMispManifest = descriptors;
                    manager.lastCirclMispFeedUrl = normalizedFeed;
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
                request: async (_ctx, params = {}) => requestCirclLu(params.endpoint || '/', params.options || {}),
                importData: async (_ctx, params = {}) => {
                    return window.IntegrationsManager.importCirclMispFeed(params);
                },
                requestResource: async (_ctx, params = {}) => proxyRequest(params.resource, params.options || {}),
                testConnection: async () => requestCirclLu('/manifest.json', { method: 'GET' })
            }
        };
    };

    window.CirclMispIntegrationModule = {
        create: createCirclMispIntegrationModule
    };
})();
