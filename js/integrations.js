// Integration Management System
// Handles configuration and connections to external services

window.IntegrationsManager = {
    // Configuration storage keys
    STORAGE_KEYS: {
        VIRUSTOTAL_API_KEY: 'quantickle_virustotal_api_key',
        OPENAI_API_KEY: 'quantickle_openai_api_key',
        SERPAPI_API_KEY: 'quantickle_serpapi_api_key',
        NEO4J_URL: 'quantickle_neo4j_url',
        NEO4J_USERNAME: 'quantickle_neo4j_username',
        NEO4J_PASSWORD: 'quantickle_neo4j_password',
        VT_BLOCKLIST: 'quantickle_vt_blocklist',
        CIRCL_LU_AUTH_USERNAME: 'quantickle_circl_lu_auth_username',
        CIRCL_LU_AUTH_KEY: 'quantickle_circl_lu_auth_key',
        CIRCL_LU_LAST_SYNC: 'quantickle_circl_lu_last_sync',
        OPML_XML: 'quantickle_opml_xml',
        OPML_FEED_STATE: 'quantickle_opml_feed_state',
        OPML_LAST_RUN: 'quantickle_opml_last_run'
    },

    CIRCL_MISP_FALLBACK_FEED_URL: 'https://www.circl.lu/doc/misp/feed-osint/',
    CIRCL_MISP_DEFAULT_FEED_URL: 'https://www.circl.lu/doc/misp/feed-osint/',
    CIRCL_LU_BASE_URL: 'https://www.circl.lu/doc/misp/feed-osint/',
    truncateLabel: function(label, maxLength = 200) {
        if (label === undefined || label === null) {
            return '';
        }

        const ellipsis = '…';
        const normalized = label.toString().trim();
        if (normalized.length <= maxLength) {
            return normalized;
        }

        const sliceLength = Math.max(0, maxLength - ellipsis.length);
        return `${normalized.slice(0, sliceLength)}${ellipsis}`;
    },

    normalizeIdentifier: function(value, { fallbackPrefix = 'item' } = {}) {
        const safe = (value || '')
            .toString()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        if (safe) {
            return safe;
        }
        return `${fallbackPrefix}_${Date.now()}`;
    },

    // Runtime-only storage for sensitive credentials
    runtime: {
        virustotalApiKey: '',
        openaiApiKey: '',
        serpApiKey: '',
        neo4jUrl: '',
        neo4jUsername: '',
        neo4jPassword: '',
        vtBlocklist: ['microsoft.com', 'cloudflare.com', 'akamai.com'],
        proxyAllowlist: [],
        circlLuAuthUsername: '',
        circlLuAuthKey: '',
        circlLuLastSync: '',
        opmlXml: '',
        opmlFeeds: [],
        opmlFeedState: {},
        opmlLastRun: '',
        opmlScanInProgress: false,
        opmlHostFetchTimestamps: {},
        opmlCancelRequested: false,
        opmlUpdatingListDisplay: false,
        opmlExistingGraphNames: new Set(),
        opmlExistingGraphCacheReady: false,
        mispImportCancelRequested: false,
        vtRelationshipForbiddenEndpoints: new Set(),
        integrationHosts: []
    },

    moduleRegistry: null,
    moduleServices: null,

    createModuleServices: function() {
        const manager = this;
        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        const safeFetch = (...args) => {
            if (!fetchFn) {
                return Promise.reject(new Error('Fetch is not available'));
            }
            return fetchFn(...args);
        };

        const createApiAdapter = (basePath) => ({
            request: (path = '', options = {}) => {
                const normalizedPath = typeof path === 'string' ? path : '';
                const endpoint = `${basePath}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
                return safeFetch(endpoint, options);
            }
        });

        const uiAdapter = {
            beginActivity: (activityId, label) => window.UI?.beginGraphActivity?.(activityId, label) || null,
            updateActivity: (taskId, label) => {
                if (taskId) {
                    window.UI?.updateGraphActivity?.(taskId, label);
                }
            },
            endActivity: (taskId) => {
                if (taskId) {
                    window.UI?.endGraphActivity?.(taskId);
                }
            }
        };

        return {
            config: {
                getRuntime: (key) => this.runtime?.[key],
                setRuntime: (key, value) => {
                    if (!this.runtime) {
                        this.runtime = {};
                    }
                    this.runtime[key] = value;
                },
                getStorageKey: (key) => this.STORAGE_KEYS?.[key] || null
            },
            storage: {
                getItem: (key) => {
                    try {
                        return localStorage.getItem(key);
                    } catch (error) {
                        console.warn('Storage getItem failed:', error);
                        return null;
                    }
                },
                setItem: (key, value) => {
                    try {
                        localStorage.setItem(key, value);
                    } catch (error) {
                        console.warn('Storage setItem failed:', error);
                    }
                },
                removeItem: (key) => {
                    try {
                        localStorage.removeItem(key);
                    } catch (error) {
                        console.warn('Storage removeItem failed:', error);
                    }
                }
            },
            status: {
                notify: (message, level = 'info', options = {}) => {
                    let payload = { message, level, ...options };
                    if (message && typeof message === 'object') {
                        payload = { ...message };
                    }

                    const resolvedMessage = payload.message ?? '';
                    const resolvedLevel = payload.level ?? level;
                    const statusId = payload.statusId;

                    if (statusId && window.IntegrationsManager?.updateStatus) {
                        window.IntegrationsManager.updateStatus(statusId, resolvedMessage, resolvedLevel);
                    }

                    if (payload.toast !== false && window.UI?.notifications?.show) {
                        window.UI.notifications.show(resolvedMessage, resolvedLevel);
                    }
                }
            },
            integrations: {
                getCirclLuConfiguration: () => manager.getCirclLuConfiguration(),
                getDefaultMispFeedUrl: () => manager.CIRCL_MISP_DEFAULT_FEED_URL,
                getLastMispFeedUrl: () => manager.lastCirclMispFeedUrl,
                normalizeMispFeedUrl: (feedUrl) => manager.normalizeMispFeedUrl(feedUrl),
                fetchCirclMispManifest: (feedUrl) => manager.fetchCirclMispManifest(feedUrl),
                fetchMispEventPayload: (feedUrl, descriptor) => manager.fetchMispEventPayload(feedUrl, descriptor),
                importCirclMispFeed: (options = {}) => manager.importCirclMispFeed(options),
                fetchOpmlText: (opmlUrl) => manager.fetchOpmlText(opmlUrl),
                parseOpmlFeeds: (opmlText) => manager.parseOpmlFeeds(opmlText),
                setOpmlFeeds: (feeds, options = {}) => manager.setOpmlFeeds(feeds, options),
                refreshOpmlExistingGraphCache: () => manager.refreshOpmlExistingGraphCache(),
                processOpmlFeed: (feed, statusId) => manager.processOpmlFeed(feed, statusId),
                persistOpmlState: () => manager.persistOpmlState(),
                updateOpmlFeedListDisplay: (feeds) => manager.updateOpmlFeedListDisplay(feeds),
                updateOpmlControls: () => manager.updateOpmlControls(),
                formatInfoHTML: (info) => manager.formatInfoHTML(info),
                formatInfoText: (info) => manager.formatInfoText(info),
                updateNeo4jMenuVisibility: () => manager.updateNeo4jMenuVisibility()
            },
            credentials: {
                ensurePassphrase: async () => {
                    if (window.SecureStorage?.ensurePassphrase) {
                        await window.SecureStorage.ensurePassphrase();
                    }
                },
                encrypt: async (value) => {
                    if (window.SecureStorage?.encrypt) {
                        return window.SecureStorage.encrypt(value);
                    }
                    return value;
                },
                decrypt: async (value) => {
                    if (window.SecureStorage?.decrypt) {
                        return window.SecureStorage.decrypt(value);
                    }
                    return value;
                }
            },
            graph: window.GraphServiceAdapter?.create?.() || null,
            network: {
                fetch: (...args) => safeFetch(...args)
            },
            server: {
                misp: createApiAdapter('/api/integrations/misp'),
                neo4j: createApiAdapter('/api/neo4j'),
                serpapi: {
                    request: (params, options = {}) => {
                        if (typeof params === 'string') {
                            return safeFetch(`/api/serpapi?${params}`, options);
                        }
                        const searchParams = new URLSearchParams(params || {}).toString();
                        const suffix = searchParams ? `?${searchParams}` : '';
                        return safeFetch(`/api/serpapi${suffix}`, options);
                    }
                }
            },
            tasks: {
                opml: {
                    isRunning: () => Boolean(manager.runtime?.opmlScanInProgress),
                    setRunning: (running) => {
                        manager.runtime.opmlScanInProgress = Boolean(running);
                    },
                    isCancelRequested: () => Boolean(manager.runtime?.opmlCancelRequested),
                    requestCancel: () => {
                        manager.runtime.opmlCancelRequested = true;
                        manager.updateOpmlControls?.();
                    },
                    resetCancel: () => {
                        manager.runtime.opmlCancelRequested = false;
                        manager.updateOpmlControls?.();
                    },
                    beginProgress: (label = 'Checking OPML feeds...') => uiAdapter.beginActivity('opml-scan', label),
                    updateProgress: (taskId, label) => uiAdapter.updateActivity(taskId, label),
                    endProgress: (taskId) => uiAdapter.endActivity(taskId)
                },
                misp: {
                    isCancelRequested: () => Boolean(manager.runtime?.mispImportCancelRequested),
                    requestCancel: () => {
                        manager.runtime.mispImportCancelRequested = true;
                    },
                    resetCancel: () => {
                        manager.runtime.mispImportCancelRequested = false;
                    },
                    beginProgress: (label = 'Loading CIRCL MISP manifest...') => uiAdapter.beginActivity('misp-import', label),
                    updateProgress: (taskId, label) => uiAdapter.updateActivity(taskId, label),
                    endProgress: (taskId) => uiAdapter.endActivity(taskId)
                }
            }
        };
    },

    initializeModuleRegistry: async function() {
        if (!window.IntegrationModuleRegistry?.create) {
            console.warn('Integration module registry not available');
            return;
        }

        if (!this.moduleRegistry) {
            this.moduleRegistry = window.IntegrationModuleRegistry.create();
        }

        this.moduleServices = this.createModuleServices();
        this.registerDefaultModules();

        if (this.moduleRegistry?.initAll) {
            await this.moduleRegistry.initAll(this.moduleServices);
        }
    },

    registerDefaultModules: function() {
        if (!this.moduleRegistry?.register) {
            return;
        }

        const factoryDefinitions = [
            { id: 'virustotal', globalName: 'VirusTotalIntegrationModule' },
            { id: 'openai', globalName: 'OpenAIIntegrationModule' },
            { id: 'serpapi', globalName: 'SerpApiIntegrationModule' },
            { id: 'circl-misp', globalName: 'CirclMispIntegrationModule' },
            { id: 'opml', globalName: 'OpmlIntegrationModule' },
            { id: 'neo4j', globalName: 'Neo4jIntegrationModule' }
        ];

        factoryDefinitions.forEach(({ id, globalName }) => {
            const factory = window[globalName];
            if (!factory?.create) {
                console.warn(`Integration module script missing or invalid for ${id}: window.${globalName}.create()`);
                return;
            }

            try {
                const moduleInstance = factory.create();
                if (!moduleInstance) {
                    console.warn(`Integration module factory returned no instance for ${id}: window.${globalName}.create()`);
                    return;
                }
                this.moduleRegistry.register(moduleInstance);
            } catch (error) {
                console.warn(`Failed to register integration module ${id}:`, error);
            }
        });
    },

    getModule: function(id) {
        return this.moduleRegistry?.get?.(id) || null;
    },

    runAction: function(id, actionName, ctx, params) {
        if (!this.moduleRegistry?.runAction) {
            throw new Error('Integration module registry not initialized');
        }
        return this.moduleRegistry.runAction(id, actionName, ctx, params);
    },

    lastCirclMispManifest: [],
    lastCirclMispFeedUrl: '',
    cachedNeo4jGraphs: [],
    cachedNeo4jGraphIdentifiers: new Set(),

    hasStoredCredentials: function() {
        const sensitive = [
            this.STORAGE_KEYS.VIRUSTOTAL_API_KEY,
            this.STORAGE_KEYS.OPENAI_API_KEY,
            this.STORAGE_KEYS.SERPAPI_API_KEY,
            this.STORAGE_KEYS.NEO4J_USERNAME,
            this.STORAGE_KEYS.NEO4J_PASSWORD,
            this.STORAGE_KEYS.CIRCL_LU_AUTH_USERNAME,
            this.STORAGE_KEYS.CIRCL_LU_AUTH_KEY
        ];
        return sensitive.some(key => localStorage.getItem(key));
    },

    // Initialize the integrations manager
    init: async function() {
        if (this.hasStoredCredentials()) {
            await SecureStorage.ensurePassphrase();
        }
        await this.loadSavedConfigurations();
        await this.loadNeo4jServerConfig();
        await this.loadCirclMispServerConfig();
        await this.loadProxyAllowlist();
        await this.loadIntegrationAllowlist();
        await this.loadOpmlSources();
        await this.initializeModuleRegistry();
        this.bindEvents();
    },

    // Load saved configurations from localStorage
    loadSavedConfigurations: async function() {
        const assignIfExists = async (storageKey, fieldId, runtimeProp) => {
            const stored = localStorage.getItem(storageKey);
            if (!stored) return;
            const value = await SecureStorage.decrypt(stored);
            if (!value) return;
            this.runtime[runtimeProp] = value;
            const el = document.getElementById(fieldId);
            if (el) el.value = value;
        };

        const assignBlocklist = (storageKey, fieldId, runtimeProp) => {
            const stored = localStorage.getItem(storageKey);
            if (!stored) return;
            const list = stored.split(/\s*,\s*|\n/).map(v => v.trim()).filter(Boolean);
            this.runtime[runtimeProp] = list;
            const el = document.getElementById(fieldId);
            if (el) el.value = list.join('\n');
        };

        const assignPlainIfExists = (storageKey, fieldId, runtimeProp) => {
            const stored = localStorage.getItem(storageKey);
            if (!stored) return;
            this.runtime[runtimeProp] = stored;
            const el = document.getElementById(fieldId);
            if (el) el.value = stored;
        };

        await assignIfExists(this.STORAGE_KEYS.VIRUSTOTAL_API_KEY, 'virustotalApiKey', 'virustotalApiKey');
        await assignIfExists(this.STORAGE_KEYS.OPENAI_API_KEY, 'openaiApiKey', 'openaiApiKey');
        await assignIfExists(this.STORAGE_KEYS.SERPAPI_API_KEY, 'serpApiKey', 'serpApiKey');
        await assignIfExists(this.STORAGE_KEYS.NEO4J_USERNAME, 'neo4jUsername', 'neo4jUsername');
        await assignIfExists(this.STORAGE_KEYS.NEO4J_PASSWORD, 'neo4jPassword', 'neo4jPassword');
        await assignIfExists(this.STORAGE_KEYS.CIRCL_LU_AUTH_USERNAME, 'circlLuAuthUsername', 'circlLuAuthUsername');
        await assignIfExists(this.STORAGE_KEYS.CIRCL_LU_AUTH_KEY, 'circlLuAuthKey', 'circlLuAuthKey');
        assignBlocklist(this.STORAGE_KEYS.VT_BLOCKLIST, 'virustotalBlocklist', 'vtBlocklist');
        assignPlainIfExists(this.STORAGE_KEYS.CIRCL_LU_LAST_SYNC, 'circlLuLastSync', 'circlLuLastSync');

        const vtEl = document.getElementById('virustotalBlocklist');
        if (vtEl && !vtEl.value) vtEl.value = this.runtime.vtBlocklist.join('\n');
        this.updateNeo4jMenuVisibility();
    },

    loadProxyAllowlist: async function() {
        const textarea = document.getElementById('proxyAllowlistDisplay');
        const helpText = document.getElementById('proxyAllowlistHelp');

        if (!textarea) {
            return;
        }

        const setHelp = (message) => {
            if (helpText) {
                helpText.textContent = message;
            }
        };

        const setTextareaState = ({ value = '', placeholder, error = false }) => {
            textarea.value = value;
            if (typeof placeholder === 'string') {
                textarea.placeholder = placeholder;
            }
            textarea.classList.toggle('error', Boolean(error));
        };

        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        if (!fetchFn) {
            this.runtime.proxyAllowlist = [];
            setTextareaState({ value: '', placeholder: 'Proxy allowlist not available in this environment.', error: true });
            setHelp('Unable to display proxy allowlist because fetch is not supported in this environment.');
            return;
        }

        setHelp('Loading allowlist from server…');
        setTextareaState({ value: '', placeholder: 'Loading proxy allowlist...' });

        try {
            const response = await fetchFn('config/proxy-allowlist.json', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const entries = Array.isArray(data?.allowlist) ? data.allowlist.map(entry => entry.toString()) : [];
            this.runtime.proxyAllowlist = entries;

            if (entries.length === 0) {
                setTextareaState({ value: '', placeholder: 'No hosts configured in the server allowlist.' });
                setHelp('No entries found in config/proxy-allowlist.json on the server.');
                return;
            }

            setTextareaState({ value: entries.join('\n'), placeholder: '' });
            setHelp('These hosts are approved for proxy requests. Update config/proxy-allowlist.json on the server to change them.');
        } catch (error) {
            console.error('Failed to load proxy allowlist', error);
            this.runtime.proxyAllowlist = [];
            setTextareaState({ value: '', placeholder: 'Unable to load proxy allowlist.', error: true });
            setHelp('Unable to load proxy allowlist from the server. Check that config/proxy-allowlist.json is accessible.');
        }
    },

    loadIntegrationAllowlist: async function() {
        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        if (!fetchFn) {
            return;
        }

        try {
            const response = await fetchFn('config/integration-allowlist.json', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const entries = Array.isArray(data?.allowlist) ? data.allowlist.map(entry => entry.toString()) : [];
            const normalized = entries.map(entry => entry.trim().toLowerCase()).filter(Boolean);
            const current = new Set((this.runtime.integrationHosts || []).map(host => host.toLowerCase()));
            normalized.forEach(host => current.add(host));
            this.runtime.integrationHosts = Array.from(current);

            if (this.runtime.integrationHosts.length) {
                console.info('Integration allowlist hosts loaded:', this.runtime.integrationHosts);
            }
        } catch (error) {
            console.warn('Failed to load integration allowlist', error);
        }
    },

    parseOpmlFeeds: function(opmlText) {
        if (!opmlText || typeof opmlText !== 'string') {
            return [];
        }
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(opmlText, 'text/xml');
            if (doc.getElementsByTagName('parsererror').length > 0) {
                return [];
            }
            const outlines = Array.from(doc.querySelectorAll('outline[xmlUrl], outline[url]'));
            const feeds = [];
            const seen = new Set();
            for (const outline of outlines) {
                const url = (outline.getAttribute('xmlUrl') || outline.getAttribute('url') || '').trim();
                if (!url || seen.has(url)) {
                    continue;
                }
                seen.add(url);
                const title = outline.getAttribute('title') || outline.getAttribute('text') || url;
                feeds.push({ title, url });
            }
            return feeds;
        } catch (error) {
            console.error('Failed to parse OPML input', error);
            return [];
        }
    },

    parseManualOpmlList: function(listText) {
        if (!listText || typeof listText !== 'string') {
            return [];
        }
        const lines = listText.split('\n');
        const feeds = [];
        const seen = new Set();

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                continue;
            }

            const urlMatch = line.match(/https?:\/\/\S+/i);
            if (!urlMatch) {
                continue;
            }

            const url = urlMatch[0].replace(/[)\]]+$/, '');
            if (!url || seen.has(url)) {
                continue;
            }

            const titlePart = line.replace(urlMatch[0], '').replace(/[—–-]\s*$/, '').trim();
            const title = titlePart || line.replace(urlMatch[0], '').trim() || url;

            seen.add(url);
            feeds.push({ title, url });
        }

        return feeds;
    },

    escapeXmlAttribute: function(value) {
        return (value || '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    createOpmlFromFeeds: function(feeds = []) {
        if (!Array.isArray(feeds) || feeds.length === 0) {
            return '';
        }

        const outlines = feeds
            .filter(feed => feed && feed.url)
            .map(feed => {
                const title = this.escapeXmlAttribute(feed.title || feed.url);
                const url = this.escapeXmlAttribute(feed.url);
                return `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${url}" />`;
            })
            .join('\n');

        if (!outlines) {
            return '';
        }

        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<opml version="2.0">',
            '  <head><title>Quantickle OPML Feeds</title></head>',
            '  <body>',
            outlines,
            '  </body>',
            '</opml>'
        ].join('\n');
    },

    setOpmlFeeds: function(feeds, { opmlXml = null, statusId = 'opmlStatus', statusOnUpdate = false } = {}) {
        const normalizedFeeds = Array.isArray(feeds) ? feeds.filter(feed => feed && feed.url) : [];
        this.runtime.opmlFeeds = normalizedFeeds;
        this.runtime.opmlFeedState = {};
        this.runtime.opmlLastRun = '';

        const xml = opmlXml === null ? this.createOpmlFromFeeds(normalizedFeeds) : (opmlXml || '');
        this.runtime.opmlXml = xml;

        if (xml) {
            localStorage.setItem(this.STORAGE_KEYS.OPML_XML, xml);
        } else {
            localStorage.removeItem(this.STORAGE_KEYS.OPML_XML);
        }
        localStorage.removeItem(this.STORAGE_KEYS.OPML_FEED_STATE);
        localStorage.removeItem(this.STORAGE_KEYS.OPML_LAST_RUN);

        this.updateOpmlFeedListDisplay(normalizedFeeds);

        if (statusOnUpdate) {
            const message = normalizedFeeds.length
                ? `Tracking ${normalizedFeeds.length} feed${normalizedFeeds.length === 1 ? '' : 's'}`
                : 'Feed list cleared. Paste OPML or add feeds to track.';
            this.updateStatus(statusId, message, normalizedFeeds.length ? 'success' : 'warning');
        }
    },

    handleOpmlFeedListInput: function(event) {
        if (this.runtime.opmlUpdatingListDisplay) {
            return;
        }
        const textarea = event?.target;
        const text = textarea?.value || '';
        const feeds = this.parseManualOpmlList(text);
        this.setOpmlFeeds(feeds, { statusOnUpdate: true });
    },

    updateOpmlFeedListDisplay: function(feeds = this.runtime.opmlFeeds) {
        const textarea = document.getElementById('opmlFeedListDisplay');
        const help = document.getElementById('opmlFeedListHelp');
        const lastRun = this.runtime.opmlLastRun;
        if (textarea) {
            this.runtime.opmlUpdatingListDisplay = true;
            if (!feeds || feeds.length === 0) {
                textarea.value = '';
                textarea.placeholder = 'Enter feeds like “Blog — https://example.com/feed”.';
            } else {
                textarea.value = feeds.map(feed => `${feed.title} — ${feed.url}`).join('\n');
                textarea.placeholder = '';
            }
            this.runtime.opmlUpdatingListDisplay = false;
        }
        if (help) {
            if (!feeds || feeds.length === 0) {
                help.textContent = 'Paste OPML XML or load it from a URL, then run a check—or edit the list directly.';
            } else if (lastRun) {
                help.textContent = `Monitoring ${feeds.length} feeds. Last check: ${lastRun}.`;
            } else {
                help.textContent = `Monitoring ${feeds.length} feeds. Run a check to get started.`;
            }
        }
    },

    loadOpmlSources: async function() {
        const textarea = document.getElementById('opmlFeedInput');
        const storedOpml = localStorage.getItem(this.STORAGE_KEYS.OPML_XML) || '';
        const storedState = localStorage.getItem(this.STORAGE_KEYS.OPML_FEED_STATE);
        let feedState = {};
        if (storedState) {
            try {
                const parsed = JSON.parse(storedState);
                if (parsed && typeof parsed === 'object') {
                    feedState = parsed;
                }
            } catch (error) {
                console.warn('Unable to parse stored OPML feed state', error);
            }
        }

        this.runtime.opmlXml = storedOpml;
        this.runtime.opmlFeedState = feedState;
        this.runtime.opmlLastRun = localStorage.getItem(this.STORAGE_KEYS.OPML_LAST_RUN) || '';

        if (textarea && storedOpml) {
            textarea.value = storedOpml;
        }

        if (storedOpml) {
            this.runtime.opmlFeeds = this.parseOpmlFeeds(storedOpml);
        } else {
            this.runtime.opmlFeeds = [];
        }

        this.updateOpmlFeedListDisplay();
        this.updateOpmlControls();
    },

    persistOpmlState: function() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.OPML_FEED_STATE, JSON.stringify(this.runtime.opmlFeedState || {}));
        } catch (error) {
            console.error('Failed to persist OPML feed state', error);
        }
    },

    updateOpmlControls: function() {
        const runButton = document.getElementById('opmlRunButton');
        const cancelButton = document.getElementById('opmlCancelButton');
        const inProgress = this.runtime.opmlScanInProgress;

        if (runButton) {
            runButton.disabled = inProgress;
        }
        if (cancelButton) {
            const cancellable = inProgress || this.runtime.opmlCancelRequested;
            cancelButton.disabled = false;
            cancelButton.setAttribute('aria-disabled', cancellable ? 'false' : 'true');
            cancelButton.textContent = this.runtime.opmlCancelRequested ? 'Cancelling...' : 'Cancel Run';
        }
    },

    pruneSeenEntries: function(entries = {}, limit = 200) {
        const sorted = Object.entries(entries)
            .sort(([, aTs], [, bTs]) => {
                const a = Date.parse(aTs) || 0;
                const b = Date.parse(bTs) || 0;
                return b - a;
            });
        const pruned = sorted.slice(0, limit);
        return pruned.reduce((acc, [key, ts]) => {
            acc[key] = ts;
            return acc;
        }, {});
    },

    fetchWithProxy: async function(targetUrl, options = {}) {
        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        if (!fetchFn) {
            throw new Error('Fetch is not available in this environment');
        }

        const proxiedUrl = targetUrl.startsWith('/api/')
            ? targetUrl
            : `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetchFn(proxiedUrl, { cache: 'no-store', ...options });
        if (!response.ok) {
            const error = new Error(`Request failed with status ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return response;
    },

    fetchOpmlText: async function(opmlUrl) {
        const response = await this.fetchWithProxy(opmlUrl);
        return await response.text();
    },

    fetchFeedDocument: async function(feedUrl) {
        const response = await this.fetchWithProxy(feedUrl);
        return await response.text();
    },

    extractRssArticles: function(feedXml, feedUrl) {
        if (!feedXml) {
            return [];
        }
        let doc;
        try {
            doc = new DOMParser().parseFromString(feedXml, 'text/xml');
        } catch (error) {
            console.error('Failed to parse RSS/Atom feed', error);
            return [];
        }
        if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
            return [];
        }
        const items = Array.from(doc.querySelectorAll('item'));
        const entries = Array.from(doc.querySelectorAll('entry'));
        const nodes = items.length > 0 ? items : entries;
        const articles = nodes.map(node => {
            const title = (node.querySelector('title')?.textContent || '').trim();
            const guid = (node.querySelector('guid')?.textContent || '').trim();
            const linkNode = node.querySelector('link');
            const linkAttr = linkNode ? (linkNode.getAttribute('href') || linkNode.textContent || '') : '';
            const link = (linkAttr || '').trim();
            const pubDate = (node.querySelector('pubDate')?.textContent
                || node.querySelector('updated')?.textContent
                || node.querySelector('published')?.textContent
                || '').trim();
            return {
                title: title || link || feedUrl,
                link,
                guid,
                published: pubDate || ''
            };
        }).filter(article => article.link);

        return articles.sort((a, b) => {
            const aTime = Date.parse(a.published || '') || 0;
            const bTime = Date.parse(b.published || '') || 0;
            return bTime - aTime;
        });
    },

    sanitizeArticleIocs: function(iocs, articleUrl) {
        if (!iocs || typeof iocs !== 'object') {
            return {};
        }

        const normalizedUrl = (articleUrl || '').trim().toLowerCase().replace(/\/+$/, '');
        const normalizeDomainToken = token => {
            return String(token || '')
                .replace(/\[\.\]/g, '.')
                .replace(/^[a-z]+:\/\//i, '')
                .replace(/^www\./i, '')
                .split(/[\/?#]/)[0]
                .replace(/^[^a-z0-9]+|[^a-z0-9.-]+$/gi, '')
                .toLowerCase();
        };

        let sourceHost = '';
        if (normalizedUrl) {
            try {
                sourceHost = normalizeDomainToken(new URL(normalizedUrl).hostname || '');
            } catch {
                sourceHost = normalizeDomainToken(normalizedUrl);
            }
        }

        const stripMatchingUrls = (values = []) => values.filter(value => {
            const candidate = String(value || '').trim().toLowerCase().replace(/\/+$/, '');
            if (!candidate) {
                return false;
            }
            if (normalizedUrl && candidate === normalizedUrl) {
                return false;
            }
            if (!sourceHost) {
                return true;
            }
            let candidateHost = '';
            try {
                candidateHost = normalizeDomainToken(new URL(candidate).hostname || '');
            } catch {
                candidateHost = normalizeDomainToken(candidate);
            }
            return candidateHost !== sourceHost;
        });

        const stripMatchingDomains = (values = []) => values.filter(value => {
            const domain = normalizeDomainToken(value);
            return domain && (!sourceHost || domain !== sourceHost);
        });

        return Object.entries(iocs).reduce((acc, [key, values]) => {
            if (!Array.isArray(values)) {
                acc[key] = values;
                return acc;
            }

            let filtered = values;
            if (key === 'urls') {
                filtered = stripMatchingUrls(values);
            } else if (key === 'domains') {
                filtered = stripMatchingDomains(values);
            }

            if (Array.isArray(filtered) && filtered.length > 0) {
                acc[key] = filtered;
            }

            return acc;
        }, {});
    },

    normalizeArticleKey: function(article) {
        if (!article) {
            return '';
        }
        if (article.guid) {
            return article.guid.trim();
        }
        if (article.link) {
            return article.link.trim();
        }
        if (article.title) {
            return this.normalizeIdentifier(article.title);
        }
        return '';
    },

    enforceOpmlHostCooldown: async function(articleUrl, statusId = 'opmlStatus') {
        if (!articleUrl) {
            return;
        }

        let hostname = '';
        try {
            hostname = new URL(articleUrl).hostname;
        } catch (error) {
            console.warn('Unable to parse hostname for OPML article', articleUrl, error);
            return;
        }

        if (!hostname) {
            return;
        }

        const minIntervalMs = 10_000;
        const lastFetched = this.runtime.opmlHostFetchTimestamps?.[hostname] || 0;
        const now = Date.now();
        const elapsed = now - lastFetched;

        if (elapsed < minIntervalMs) {
            const waitMs = minIntervalMs - elapsed;
            const seconds = Math.ceil(waitMs / 1000);
            this.updateStatus(statusId, `Waiting ${seconds}s before fetching another article from ${hostname}`, 'info');
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }

        this.runtime.opmlHostFetchTimestamps[hostname] = Date.now();
    },

    runOpmlDailyCheck: async function(options = {}) {
        return this.runAction('opml', 'runScan', { source: 'manager' }, options);
    },

    processOpmlFeed: async function(feed, statusId = 'opmlStatus') {
        const result = { newArticles: 0, iocGraphs: 0, cancelled: false };
        if (!feed || !feed.url) {
            return result;
        }

        const state = this.runtime.opmlFeedState[feed.url] || { seen: {} };
        const seen = state.seen || {};
        let feedXml;
        try {
            this.updateStatus(statusId, `Fetching ${feed.title || feed.url}...`, 'loading');
            feedXml = await this.fetchFeedDocument(feed.url);
        } catch (error) {
            console.error('Failed to fetch feed', feed, error);
            this.updateStatus(statusId, `Failed to fetch ${feed.title || feed.url}`, 'error');
            return result;
        }

        const articles = this.extractRssArticles(feedXml, feed.url).slice(0, 25);
        for (const article of articles) {
            if (this.runtime.opmlCancelRequested) {
                result.cancelled = true;
                break;
            }
            const key = this.normalizeArticleKey(article);
            if (!key || seen[key]) {
                continue;
            }
            result.newArticles += 1;
            const articleResult = await this.handleArticleForIocs(article, feed.title, statusId);
            if (articleResult && articleResult.hasIocs) {
                result.iocGraphs += 1;
            }
            seen[key] = article.published || new Date().toISOString();
            if (this.runtime.opmlCancelRequested) {
                result.cancelled = true;
                break;
            }
        }

        state.seen = this.pruneSeenEntries(seen, 200);
        state.lastFetched = new Date().toISOString();
        this.runtime.opmlFeedState[feed.url] = state;

        return result;
    },

    handleArticleForIocs: async function(article, feedTitle, statusId = 'opmlStatus', options = {}) {
        if (!article || !article.link) {
            return { hasIocs: false };
        }

        const ragModule = options.ragModule || await import('/js/rag-pipeline.js');
        const fetchPage = options.fetchPage || ragModule.fetchPage;
        const extractIocs = options.extractIocs || ragModule.extractIocs;
        const selectQualifyingIocs = options.selectQualifyingIocs || ragModule.selectQualifyingIocs;

        await this.enforceOpmlHostCooldown(article.link, statusId);
        const doc = await fetchPage(article.link, article.title || feedTitle || 'Article');
        if (!doc) {
            return { hasIocs: false };
        }

        const extractedIocs = extractIocs(doc.content || '');
        const sanitizedIocs = this.sanitizeArticleIocs(extractedIocs, doc.metadata?.url || article.link);
        const qualifyingIocs = selectQualifyingIocs(sanitizedIocs);
        const hasIocs = Object.values(qualifyingIocs).some(values => Array.isArray(values) && values.length > 0);
        if (!hasIocs) {
            console.info('Skipping article with no qualifying IOCs', {
                title: article.title,
                link: article.link
            });
            this.updateStatus(statusId, `No qualifying IOCs in ${article.title || article.link}; skipping`, 'info');
            return { hasIocs: false };
        }

        if (doc.metadata && typeof doc.metadata === 'object') {
            doc.metadata.feed_title = feedTitle || '';
            doc.metadata.source = doc.metadata.source || 'opml_rss';
        }

        const graphTitle = this.resolveOpmlGraphTitle(doc.metadata);
        if (await this.shouldSkipOpmlGraph(graphTitle)) {
            const skipMessage = `Skipping ${graphTitle}: graph already exists.`;
            console.info(skipMessage);
            this.updateStatus(statusId, skipMessage, 'info');
            return { hasIocs: false, skippedExisting: true };
        }

        try {
            await this.createGraphFromArticleDocument(doc, {
                feedTitle,
                iocs: qualifyingIocs,
                graphTitle
            });
            this.updateStatus(statusId, `IOC match in ${article.title || article.link}`, 'success');
        } catch (error) {
            console.error('Failed to build graph from article', error);
            this.updateStatus(statusId, `Failed to create graph for ${article.title || article.link}`, 'error');
        }

        return { hasIocs: true };
    },

    createGraphFromArticleDocument: async function(doc, options = {}) {
        const feedTitle = options.feedTitle || '';
        const iocs = options.iocs || {};
        const meta = doc.metadata || {};
        const graphTitle = options.graphTitle || this.resolveOpmlGraphTitle(meta);

        await this.ensureNodeTypeAvailability('report');

        const reportId = `report_${this.normalizeIdentifier(meta.url || graphTitle, { fallbackPrefix: 'report' })}`;
        const iocSummary = Object.entries(iocs)
            .filter(([, list]) => Array.isArray(list) && list.length > 0)
            .map(([key, list]) => `${key}: ${list.length}`)
            .join(', ');

        const infoFields = {
            Title: graphTitle,
            Source: feedTitle || meta.source || 'OPML RSS',
            URL: meta.url || '',
            Retrieved: meta.retrieved_at || new Date().toISOString(),
            IOCs: iocSummary || 'Detected via regex'
        };
        const infoHtml = this.formatInfoHTML(infoFields);
        const infoText = this.formatInfoText(infoFields);

        const graphData = {
            title: graphTitle,
            graphId: graphTitle,
            graphName: graphTitle,
            description: `Automatically created from ${feedTitle || meta.url || 'RSS feed entry'}`,
            metadata: {
                source: 'OPML RSS feed ingestion',
                feedTitle: feedTitle || undefined,
                url: meta.url || undefined,
                retrievedAt: meta.retrieved_at || new Date().toISOString()
            },
            nodes: [
                {
                    data: {
                        id: reportId,
                        label: graphTitle,
                        type: 'report',
                        url: meta.url || '',
                        info: infoText,
                        infoHtml,
                        domain: 'cybersecurity'
                    }
                }
            ],
            edges: []
        };

        if (window.GraphRenderer && typeof window.GraphRenderer.normalizeNodeData === 'function') {
            window.GraphRenderer.normalizeNodeData(graphData.nodes[0]);
        }

        if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graphData);
            if (typeof window.DataManager.setGraphName === 'function') {
                window.DataManager.setGraphName(graphTitle, { source: 'opml-rss', ensureExtension: false });
            }
        }

        if (window.GraphManager) {
            window.GraphManager.currentGraph = graphData;
            if (typeof window.GraphManager.updateGraphUI === 'function') {
                window.GraphManager.updateGraphUI();
            }
        }

        if (window.GraphRenderer && typeof window.GraphRenderer.renderGraph === 'function') {
            window.GraphRenderer.renderGraph();
        }

        const cy = window.GraphRenderer?.cy;
        if (cy && window.ContextMenu && typeof window.ContextMenu.aiFetch === 'function') {
            const node = cy.getElementById(reportId);
            if (node && node.length > 0) {
                try {
                    await window.ContextMenu.aiFetch(node);
                } catch (error) {
                    console.error('Failed to run RAG pipeline for report node', error);
                }
            }
        }

        try {
            await this.persistOpmlGraph(graphTitle);
        } catch (error) {
            console.error('Failed to persist OPML RSS graph', error);
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(`Failed to save ${graphTitle}: ${error.message}`, 'error');
            }
        }
    },

    resolveOpmlGraphNames(graphTitle) {
        const fm = window.FileManager;
        const sanitize = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            const trimmed = value.trim();
            if (!trimmed) {
                return '';
            }
            return trimmed.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
        };

        const baseName = sanitize(graphTitle) || 'opml-rss-graph';
        if (fm && typeof fm.ensureGraphFileExtension === 'function') {
            return {
                baseName,
                filename: fm.ensureGraphFileExtension(baseName)
            };
        }

        const ensured = /\.qut$/i.test(baseName) ? baseName : `${baseName}.qut`;
        return { baseName, filename: ensured };
    },

    resolveOpmlGraphTitle(meta = {}) {
        const rawTitle = meta.title || meta.url || 'RSS Article';
        return this.truncateLabel(rawTitle, 120);
    },

    registerOpmlGraphName(graphTitle) {
        const names = this.runtime.opmlExistingGraphNames instanceof Set
            ? this.runtime.opmlExistingGraphNames
            : new Set();
        this.deriveOpmlGraphKeys(graphTitle).forEach(key => names.add(key));
        this.runtime.opmlExistingGraphNames = names;
        this.runtime.opmlExistingGraphCacheReady = true;
    },

    async refreshOpmlExistingGraphCache() {
        const fm = window.FileManager;
        const names = new Set();
        const extension = fm?.config?.fileExtension || '.qut';

        const register = (value) => {
            this.deriveOpmlGraphKeys(value).forEach(key => names.add(key));
        };

        if (window.WorkspaceManager && WorkspaceManager.handle && typeof WorkspaceManager.listFiles === 'function') {
            try {
                const files = await WorkspaceManager.listFiles('graphs', extension);
                files.forEach(path => {
                    const parts = path.split('/');
                    register(parts.pop() || path);
                });
            } catch (error) {
                console.warn('Unable to check existing local graphs for OPML ingestion', error);
            }
        }

        let neo4jAvailable = false;
        if (typeof this.checkNeo4jAvailability === 'function') {
            try {
                neo4jAvailable = await this.checkNeo4jAvailability();
            } catch (error) {
                console.warn('Unable to determine Neo4j availability for OPML ingestion', error);
            }
        }

        if (neo4jAvailable && fm && typeof fm.fetchNeo4jGraphs === 'function') {
            try {
                const { graphs } = await fm.fetchNeo4jGraphs();
                if (Array.isArray(graphs)) {
                    graphs.forEach(entry => register(entry?.name));
                }
            } catch (error) {
                console.warn('Unable to check existing Neo4j graphs for OPML ingestion', error);
            }
        }

        this.runtime.opmlExistingGraphNames = names;
        this.runtime.opmlExistingGraphCacheReady = true;
        return names;
    },

    async ensureOpmlExistingGraphCache() {
        if (this.runtime.opmlExistingGraphCacheReady && this.runtime.opmlExistingGraphNames instanceof Set) {
            return this.runtime.opmlExistingGraphNames;
        }
        this.runtime.opmlExistingGraphCacheReady = false;
        return await this.refreshOpmlExistingGraphCache();
    },

    async shouldSkipOpmlGraph(graphTitle) {
        const existing = await this.ensureOpmlExistingGraphCache();
        const candidates = this.deriveOpmlGraphKeys(graphTitle);
        for (const key of candidates) {
            if (key && existing.has(key)) {
                return true;
            }
        }
        return false;
    },

    async persistOpmlGraph(graphTitle) {
        const fm = window.FileManager;
        if (!fm) {
            throw new Error('FileManager is not available to save graphs');
        }

        const { baseName, filename } = this.resolveOpmlGraphNames(graphTitle);
        const mimeType = fm.config?.mimeType || 'application/quantickle-graph';

        let neo4jAvailable = false;
        if (typeof this.checkNeo4jAvailability === 'function') {
            neo4jAvailable = await this.checkNeo4jAvailability();
        }

        if (neo4jAvailable && typeof fm.saveGraphToNeo4j === 'function') {
            try {
                const saved = await fm.saveGraphToNeo4j({
                    targetName: baseName,
                    progressMessage: `Saving ${baseName} to Neo4j...`,
                    successMessage: `Saved ${baseName} to Neo4j`
                });
                if (saved) {
                    this.registerOpmlGraphName(graphTitle);
                    return { destination: 'neo4j', name: baseName };
                }
            } catch (error) {
                console.warn('Neo4j save unavailable, falling back to local file', error);
            }
        }

        if (typeof fm.exportCurrentGraph !== 'function') {
            throw new Error('Unable to export graph for saving');
        }

        const graphData = fm.exportCurrentGraph();
        if (typeof fm.normalizeGraphTitle === 'function') {
            fm.normalizeGraphTitle(graphData, baseName);
        }
        if (typeof fm.ensureGraphSavedTimestamp === 'function') {
            fm.ensureGraphSavedTimestamp(graphData, new Date());
        }

        const payload = JSON.stringify(graphData, null, 2);
        if (window.WorkspaceManager?.handle && typeof window.WorkspaceManager.saveFile === 'function') {
            await window.WorkspaceManager.saveFile(`graphs/${filename}`, payload, mimeType);
        } else if (typeof fm.downloadFile === 'function') {
            fm.downloadFile(payload, filename, mimeType);
        } else {
            throw new Error('No available mechanism to save graph locally');
        }

        fm.currentFile = {
            name: filename,
            type: 'qut',
            lastModified: new Date(),
            size: payload.length
        };

        if (typeof fm.synchronizeGraphTitleState === 'function') {
            fm.synchronizeGraphTitleState(filename, { source: 'file', ensureExtension: true });
        }

        if (window.GraphRenderer && typeof window.GraphRenderer.handleActiveGraphSaved === 'function') {
            try {
                window.GraphRenderer.handleActiveGraphSaved({
                    source: 'file',
                    key: filename,
                    filename,
                    graphName: graphData.graphName,
                    title: graphData.title,
                    graphData
                });
            } catch (error) {
                console.warn('Unable to update origin node after OPML graph save', error);
            }
        }

        this.registerOpmlGraphName(graphTitle);
        return { destination: 'file', name: filename };
    },

    normalizeOpmlGraphKey(value) {
        if (!value || typeof value !== 'string') {
            return '';
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }
        return trimmed.toLowerCase();
    },

    deriveOpmlGraphKeys(value) {
        const fm = window.FileManager;
        const keys = new Set();
        const add = (name) => {
            const key = this.normalizeOpmlGraphKey(name);
            if (!key) return;
            keys.add(key);
            if (key.endsWith('.qut')) {
                keys.add(key.replace(/\.qut$/i, ''));
            } else {
                keys.add(`${key}.qut`);
            }
        };

        const { baseName, filename } = this.resolveOpmlGraphNames(value || '');
        [value, baseName, filename].forEach(candidate => add(candidate));

        if (fm && typeof fm.ensureGraphFileExtension === 'function') {
            add(fm.ensureGraphFileExtension(baseName || value || ''));
        }

        if (fm && typeof fm.normalizeGraphTitle === 'function') {
            const tempGraph = { graphName: value || baseName || '', title: value || baseName || '' };
            try {
                fm.normalizeGraphTitle(tempGraph, baseName || value || '');
                add(tempGraph.graphName);
                add(tempGraph.title);
            } catch (error) {
                console.warn('Unable to normalize OPML graph title for duplicate detection', error);
            }
        }

        return keys;
    },

    loadNeo4jServerConfig: async function() {
        const input = document.getElementById('neo4jUrl');

        const applyUrl = (value, { placeholder, title } = {}) => {
            this.runtime.neo4jUrl = value || '';
            if (!input) {
                return;
            }

            input.value = value || '';
            input.readOnly = true;
            input.classList.add('readonly-input');
            input.placeholder = placeholder || input.placeholder;
            if (title) {
                input.title = title;
            }
        };

        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        if (!fetchFn) {
            applyUrl('', {
                placeholder: 'Fetch is not available in this environment.',
                title: 'Unable to load server-provided Neo4j URL'
            });
            return;
        }

        try {
            const response = await fetchFn('/api/neo4j/config', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const url = typeof data?.url === 'string' ? data.url.trim() : '';

            applyUrl(url, {
                placeholder: url ? 'Configured by server' : 'Neo4j URL not configured on server',
                title: 'This URL is set by the server environment.'
            });
        } catch (error) {
            console.error('Failed to load Neo4j configuration from server', error);
            applyUrl('', {
                placeholder: 'Unable to load server Neo4j URL',
                title: 'Check server NEO4J_URL configuration.'
            });
        }
    },

    loadCirclMispServerConfig: async function() {
        const input = document.getElementById('circlMispFeedUrl');

        const applyFeedUrl = (value, { placeholder, title } = {}) => {
            const resolved = value || this.CIRCL_MISP_FALLBACK_FEED_URL;
            this.CIRCL_MISP_DEFAULT_FEED_URL = resolved;

            if (!this.lastCirclMispFeedUrl) {
                this.lastCirclMispFeedUrl = resolved;
            }

            if (!input) {
                return;
            }

            input.value = resolved;
            input.readOnly = true;
            input.classList.add('readonly-input');
            input.setAttribute('aria-readonly', 'true');

            if (placeholder) {
                input.placeholder = placeholder;
            }
            if (title) {
                input.title = title;
            }
        };

        const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function')
            ? window.fetch.bind(window)
            : (typeof fetch === 'function' ? fetch : null);

        if (!fetchFn) {
            applyFeedUrl('', {
                placeholder: 'Unable to load CIRCL MISP feed URL from server',
                title: 'Fetch is not available in this environment.'
            });
            return;
        }

        try {
            const response = await fetchFn('/api/integrations/misp/config', { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const feedUrl = typeof data?.feedUrl === 'string' ? data.feedUrl.trim() : '';
            const normalizedFeed = this.normalizeMispFeedUrl(feedUrl || this.CIRCL_MISP_FALLBACK_FEED_URL);

            this.CIRCL_LU_BASE_URL = normalizedFeed;

            applyFeedUrl(normalizedFeed, {
                placeholder: feedUrl ? 'Configured by server' : 'Using default CIRCL MISP feed URL',
                title: 'This feed URL is configured by the server via MISP_CIRCL.'
            });
        } catch (error) {
            console.error('Failed to load CIRCL MISP feed configuration', error);
            applyFeedUrl('', {
                placeholder: 'Unable to load CIRCL MISP feed URL from server',
                title: 'Falling back to default CIRCL MISP feed URL.'
            });
        }
    },

    // Bind event listeners
    bindEvents: function() {
        // Auto-save on input changes (debounced)
        const inputs = ['virustotalApiKey', 'openaiApiKey', 'serpApiKey', 'neo4jUsername', 'neo4jPassword', 'virustotalBlocklist', 'circlLuAuthUsername', 'circlLuAuthKey', 'circlLuLastSync'];
        inputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                const handler = this.debounce(() => {
                    this.autoSaveConfiguration(inputId);
                }, 1000);
                input.addEventListener('input', handler);
                if (input.tagName === 'SELECT') {
                    input.addEventListener('change', handler);
                }
            }
        });

        const opmlFeedList = document.getElementById('opmlFeedListDisplay');
        if (opmlFeedList) {
            opmlFeedList.addEventListener('input', this.debounce(event => {
                this.handleOpmlFeedListInput(event);
            }, 500));
        }


        const normalizeText = value => (value || '')
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');

        const findButtonByText = (label) => {
            if (!label) {
                return null;
            }
            const normalized = normalizeText(label);
            if (!normalized) {
                return null;
            }
            const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], .button'));
            return candidates.find(element => {
                const text = normalizeText(element.textContent || element.innerText);
                if (!text) {
                    return false;
                }
                return text === normalized || text.includes(normalized);
            }) || null;
        };

        const attachMispClick = (button, handler) => {
            if (!button || typeof handler !== 'function') {
                return;
            }
            if (button.dataset.circlMispBound === 'true') {
                return;
            }
            button.addEventListener('click', event => {
                if (event && typeof event.preventDefault === 'function') {
                    event.preventDefault();
                }
                if (event && typeof event.stopPropagation === 'function') {
                    event.stopPropagation();
                }
                handler();
            });
            button.dataset.circlMispBound = 'true';
        };

        const mispLoadButton = document.getElementById('circlMispLoadManifest')
            || document.getElementById('circlMispLoadFeed')
            || findButtonByText('Load manifest');
        attachMispClick(mispLoadButton, () => {
            if (typeof window.loadCirclMispFeedManifest === 'function') {
                window.loadCirclMispFeedManifest();
            }
        });

        const mispImportButton = document.getElementById('circlMispImportEvents')
            || document.getElementById('circlMispSyncLatestEvents')
            || document.getElementById('circlMispSyncEvents')
            || findButtonByText('Sync latest events');
        attachMispClick(mispImportButton, () => {
            if (typeof window.importSelectedCirclMispEvents === 'function') {
                window.importSelectedCirclMispEvents();
            }
        });

        this.updateNeo4jMenuVisibility();
    },

    // Capture configuration in memory
    autoSaveConfiguration: async function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const value = input.value.trim();
        const skipValueRequired = ['virustotalBlocklist', 'circlLuLastSync'];
        if (!value && !skipValueRequired.includes(inputId)) return;

        const skipEncryptionInputs = ['virustotalBlocklist', 'circlLuLastSync'];
        const requiresEncryption = !skipEncryptionInputs.includes(inputId) && value;
        if (requiresEncryption) {
            // Ensure we have a passphrase before storing anything
            await SecureStorage.ensurePassphrase();
        }

        switch (inputId) {
            case 'virustotalApiKey':
                this.runtime.virustotalApiKey = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.VIRUSTOTAL_API_KEY,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('virustotalStatus', 'Input captured', 'success');
                break;
            case 'openaiApiKey':
                this.runtime.openaiApiKey = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.OPENAI_API_KEY,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('openaiStatus', 'Input captured', 'success');
                break;
            case 'serpApiKey':
                this.runtime.serpApiKey = value;
                localStorage.setItem(
                this.STORAGE_KEYS.SERPAPI_API_KEY,
                await SecureStorage.encrypt(value)
            );
            this.updateStatus('serpapiStatus', 'Input captured', 'success');
            break;
            case 'neo4jUsername':
                this.runtime.neo4jUsername = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.NEO4J_USERNAME,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('neo4jStatus', 'Input captured', 'success');
                this.updateNeo4jMenuVisibility();
                break;
            case 'neo4jPassword':
                this.runtime.neo4jPassword = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.NEO4J_PASSWORD,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('neo4jStatus', 'Input captured', 'success');
                this.updateNeo4jMenuVisibility();
                break;
            case 'virustotalBlocklist':
                this.runtime.vtBlocklist = value.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
                localStorage.setItem(this.STORAGE_KEYS.VT_BLOCKLIST, this.runtime.vtBlocklist.join('\n'));
                break;
            case 'circlLuAuthUsername':
                this.runtime.circlLuAuthUsername = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.CIRCL_LU_AUTH_USERNAME,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('circlLuStatus', 'Input captured', 'success');
                break;
            case 'circlLuAuthKey':
                this.runtime.circlLuAuthKey = value;
                localStorage.setItem(
                    this.STORAGE_KEYS.CIRCL_LU_AUTH_KEY,
                    await SecureStorage.encrypt(value)
                );
                this.updateStatus('circlLuStatus', 'Input captured', 'success');
                break;
            case 'circlLuLastSync':
                this.runtime.circlLuLastSync = value;
                if (value) {
                    localStorage.setItem(this.STORAGE_KEYS.CIRCL_LU_LAST_SYNC, value);
                } else {
                    localStorage.removeItem(this.STORAGE_KEYS.CIRCL_LU_LAST_SYNC);
                }
                this.updateStatus('circlLuStatus', 'Last sync updated', 'success');
                break;
        }
    },

    // Update status indicator
    updateStatus: function(statusId, message, type) {
        const statusElement = document.getElementById(statusId);
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-indicator ${type}`;

            // Clear status after 3 seconds for non-error messages
            if (type !== 'error') {
                setTimeout(() => {
                    statusElement.textContent = '';
                    statusElement.className = 'status-indicator';
                }, 3000);
            }
        }
    },

    async importCirclMispFeed(options = {}) {
        const {
            feedUrl = this.CIRCL_MISP_DEFAULT_FEED_URL,
            selectedEventUuids = null,
            autoSave = false,
            statusId = 'circlMispStatus',
            onEventImported,
            maxEvents = null,
            batchSave = false,
            taskHooks = null
        } = options;

        const baseUrl = this.normalizeMispFeedUrl(feedUrl);
        this.updateStatus(statusId, 'Fetching CIRCL MISP manifest...', 'loading');
        const graphTaskId = taskHooks?.beginProgress
            ? taskHooks.beginProgress('Loading CIRCL MISP manifest...')
            : window.UI?.beginGraphActivity?.('misp-import', 'Loading CIRCL MISP manifest...');

        try {
        let descriptors = [];
        try {
            const manifest = await this.fetchCirclMispManifest(baseUrl);
            descriptors = manifest.descriptors;
            this.lastCirclMispManifest = descriptors;
            this.lastCirclMispFeedUrl = baseUrl;
        } catch (error) {
            console.error('Failed to load CIRCL MISP manifest', error);
            const message = `Failed to load CIRCL MISP manifest: ${error.message}`;
            this.updateStatus(statusId, message, 'error');
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(message, 'error');
            }
            throw error;
        }

        if (!descriptors.length) {
            const message = 'No events found in CIRCL MISP feed manifest';
            this.updateStatus(statusId, message, 'warning');
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(message, 'warning');
            }
            return { events: [], manifest: [] };
        }

        let targetEvents = descriptors;
        if (Array.isArray(selectedEventUuids) && selectedEventUuids.length) {
            targetEvents = descriptors.filter(descriptor => selectedEventUuids.includes(descriptor.uuid));
            const missing = selectedEventUuids.filter(uuid => !descriptors.some(descriptor => descriptor.uuid === uuid));
            if (missing.length && window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(
                    `Some selected events were not present in the manifest: ${missing.join(', ')}`,
                    'warning'
                );
            }
        }

        if (!targetEvents.length) {
            const message = 'No matching events found for the selected filters';
            this.updateStatus(statusId, message, 'warning');
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(message, 'warning');
            }
            return { events: [], manifest: descriptors };
        }


        let eventsToProcess = targetEvents;
        let limited = false;
        if (maxEvents != null) {
            const parsedLimit = Number(maxEvents);
            if (Number.isFinite(parsedLimit) && parsedLimit >= 0) {
                eventsToProcess = targetEvents.slice(0, parsedLimit);
                limited = targetEvents.length > eventsToProcess.length;
            }
        }

        if (!eventsToProcess.length) {
            const message = 'No CIRCL MISP events available for import';
            this.updateStatus(statusId, message, 'warning');
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(message, 'warning');
            }
            return { events: [], manifest: descriptors };
        }

        if (limited && window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification('Importing only a subset of CIRCL MISP events.', 'info');
        }

        const results = [];
        let index = 0;
        let neo4jAvailable = batchSave ? await this.checkNeo4jAvailability() : false;
        const existingNeo4jIdentifiers = new Set();
        const addExistingIdentifier = value => {
            if (typeof value !== 'string') {
                return;
            }

            const trimmed = value.trim();
            if (!trimmed) {
                return;
            }

            const normalized = trimmed.toString();
            existingNeo4jIdentifiers.add(normalized);

            const withoutExtension = normalized.replace(/\.qut$/i, '');
            if (withoutExtension && withoutExtension !== normalized) {
                existingNeo4jIdentifiers.add(withoutExtension);
            }

            if (!/\.qut$/i.test(normalized)) {
                existingNeo4jIdentifiers.add(`${normalized}.qut`);
            }
        };

        if (batchSave && neo4jAvailable) {
            if (this.cachedNeo4jGraphIdentifiers instanceof Set) {
                this.cachedNeo4jGraphIdentifiers.forEach(addExistingIdentifier);
            } else if (Array.isArray(this.cachedNeo4jGraphIdentifiers)) {
                this.cachedNeo4jGraphIdentifiers.forEach(addExistingIdentifier);
            }

            if (Array.isArray(this.cachedNeo4jGraphs)) {
                this.cachedNeo4jGraphs.forEach(entry => {
                    this.collectNeo4jGraphIdentifiers(entry).forEach(addExistingIdentifier);
                });
            }
        }
        let skippedDueToExisting = 0;

        for (const descriptor of eventsToProcess) {
            index++;
            try {
                const progressMessage = `Importing CIRCL MISP event ${descriptor.info || descriptor.uuid} (${index}/${eventsToProcess.length})...`;

                this.updateStatus(statusId, progressMessage, 'loading');
                if (taskHooks?.updateProgress) {
                    taskHooks.updateProgress(graphTaskId, progressMessage);
                } else {
                    window.UI?.updateGraphActivity?.('misp-import', progressMessage);
                }

                if (taskHooks?.isCancelRequested?.()) {
                    this.updateStatus(statusId, 'CIRCL MISP import cancelled', 'warning');
                    break;
                }

                const descriptorUuid = typeof descriptor?.uuid === 'string' ? descriptor.uuid.trim() : null;
                const graphFileName = this.buildMispGraphFileName(descriptor);
                const baseGraphName = graphFileName.replace(/\.qut$/i, '');

                const descriptorInfo = typeof descriptor?.info === 'string' ? descriptor.info.trim() : null;
                const candidateIdentifiers = new Set([
                    baseGraphName,
                    descriptorUuid,
                    descriptorInfo,
                    descriptorUuid ? `${descriptorUuid}.qut` : null,
                    baseGraphName ? `${baseGraphName}.qut` : null
                ].filter(Boolean));

                let alreadySynced = false;
                if (batchSave && neo4jAvailable) {
                    for (const identifier of candidateIdentifiers) {
                        if (existingNeo4jIdentifiers.has(identifier)) {
                            alreadySynced = true;
                            break;
                        }
                    }
                }

                if (alreadySynced) {
                    const skipMessage = descriptorUuid
                        ? `Skipping CIRCL MISP event ${descriptor.info || descriptorUuid}: event ${descriptorUuid} already exists in Neo4j.`
                        : `Skipping CIRCL MISP event ${descriptor.info || descriptor.uuid}: graph already exists in Neo4j.`;
                    this.updateStatus(statusId, skipMessage, 'success');
                    if (window.UI && typeof window.UI.showNotification === 'function') {
                        window.UI.showNotification(skipMessage, 'info');
                    }
                    skippedDueToExisting++;
                    continue;
                }

                const payload = await this.fetchMispEventPayload(baseUrl, descriptor);
                const graphData = this.buildGraphFromMispEvent(payload, {
                    descriptor,
                    feedUrl: baseUrl
                });

                if (!window.DataManager || typeof window.DataManager.setGraphData !== 'function') {
                    throw new Error('DataManager not available');
                }

                const displayName = (graphData && typeof graphData.title === 'string' && graphData.title.trim())
                    ? graphData.title.trim()
                    : ((descriptor && typeof descriptor.info === 'string' && descriptor.info.trim())
                        ? descriptor.info.trim()
                        : (descriptor?.uuid || 'Imported graph'));
                const finalName = graphFileName || displayName;

                if (graphData && typeof graphData === 'object') {
                    const normalizedName = finalName;
                    graphData.title = normalizedName;
                    graphData.graphName = normalizedName;
                    graphData.graphId = normalizedName;
                    if (!graphData.metadata || typeof graphData.metadata !== 'object') {
                        graphData.metadata = {};
                    }
                    graphData.metadata.title = normalizedName;
                    graphData.metadata.name = normalizedName;
                    graphData.metadata.graphId = normalizedName;
                    graphData.metadata.saveSource = graphFileName ? 'file' : 'import';
                }

                window.DataManager.setGraphData(graphData);

                if (typeof window.DataManager.setGraphName === 'function') {
                    window.DataManager.setGraphName(finalName, {
                        source: graphFileName ? 'file' : 'import',
                        ensureExtension: Boolean(graphFileName)
                    });
                }

                if (window.GraphRenderer && typeof window.GraphRenderer.renderGraph === 'function') {
                    window.GraphRenderer.renderGraph();
                }

                let batchInfo = null;

                if (batchSave) {
                    const savingMessage = neo4jAvailable
                        ? `Saving ${baseGraphName} to Neo4j...`
                        : `Saving ${baseGraphName} locally...`;
                    this.updateStatus(statusId, savingMessage, 'loading');
                    batchInfo = await this.batchSaveMispGraph({
                        descriptor,
                        fileName: graphFileName,
                        neo4jAvailable
                    });
                    neo4jAvailable = batchInfo.neo4jAvailable;
                    if (batchInfo.destination === 'neo4j') {
                        addExistingIdentifier(baseGraphName);
                        if (descriptorUuid) {
                            addExistingIdentifier(descriptorUuid);
                        }
                        if (this.cachedNeo4jGraphIdentifiers instanceof Set) {
                            this.cachedNeo4jGraphIdentifiers.add(baseGraphName);
                            if (descriptorUuid) {
                                this.cachedNeo4jGraphIdentifiers.add(descriptorUuid);
                            }
                        }
                        if (Array.isArray(this.cachedNeo4jGraphs)) {
                            this.cachedNeo4jGraphs.push({
                                name: baseGraphName,
                                metadata: {
                                    eventUuid: descriptorUuid || baseGraphName,
                                    descriptorUuid: descriptorUuid || baseGraphName
                                }
                            });
                        }
                    }
                } else if (autoSave && window.FileManager && typeof window.FileManager.saveGraphFile === 'function') {
                    try {
                        await window.FileManager.saveGraphFile();
                    } catch (saveError) {
                        console.error('Auto-save failed for CIRCL MISP event', saveError);
                        if (window.UI && typeof window.UI.showNotification === 'function') {
                            window.UI.showNotification(`Auto-save failed: ${saveError.message}`, 'error');
                        }
                    }
                }

                let successMessage = `Imported CIRCL MISP event ${descriptor.info || descriptor.uuid}`;
                if (batchInfo) {
                    if (batchInfo.destination === 'neo4j') {
                        successMessage += ' and saved to Neo4j';
                    } else if (batchInfo.destination === 'local') {
                        successMessage += ' and saved locally';
                    }
                }
                this.updateStatus(statusId, successMessage, 'success');
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(successMessage, 'success');
                }

                if (typeof onEventImported === 'function') {
                    onEventImported({ descriptor, payload, graphData });
                }

                results.push({ descriptor, payload, graphData, destination: batchInfo ? batchInfo.destination : null });
            } catch (error) {
                console.error('Failed to import CIRCL MISP event', descriptor.uuid, error);
                const message = `Failed to import ${descriptor.info || descriptor.uuid}: ${error.message}`;
                this.updateStatus(statusId, message, 'error');
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(message, 'error');
                }
            } finally {
                if (batchSave) {
                    await this.resetGraphStateForBatch();
                }
            }
        }

        if (taskHooks?.isCancelRequested?.()) {
            return { events: results, manifest: descriptors, cancelled: true };
        }

        if (!results.length) {
            if (skippedDueToExisting > 0) {
                const message = skippedDueToExisting === 1
                    ? 'Skipped 1 CIRCL MISP event already present in Neo4j.'
                    : `Skipped ${skippedDueToExisting} CIRCL MISP events already present in Neo4j.`;
                this.updateStatus(statusId, message, 'success');
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(message, 'info');
                }
                return { events: results, manifest: descriptors };
            }
            throw new Error('No CIRCL MISP events were successfully imported');
        }

        return { events: results, manifest: descriptors };
        } finally {
            if (taskHooks?.endProgress) {
                taskHooks.endProgress(graphTaskId);
            } else if (graphTaskId) {
                window.UI?.endGraphActivity?.(graphTaskId);
            }
        }
    },

    normalizeMispFeedUrl(feedUrl) {
        if (!feedUrl) {
            return this.CIRCL_MISP_DEFAULT_FEED_URL;
        }
        return feedUrl.endsWith('/') ? feedUrl : `${feedUrl}/`;
    },

    async fetchCirclMispManifest(feedUrl) {
        const manifestUrl = new URL('manifest.json', feedUrl).toString();
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(manifestUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            const error = new Error(`Manifest request failed with status ${response.status}`);
            error.status = response.status;
            throw error;

        }

        const text = await response.text();
        let manifest;
        try {
            manifest = JSON.parse(text);
        } catch (error) {
            throw new Error('Manifest did not contain valid JSON');
        }

        const descriptors = this.normalizeMispManifest(manifest, feedUrl);
        return { manifest, descriptors };
    },

    normalizeMispManifest(manifest, baseUrl) {
        const descriptors = [];
        if (!manifest) {
            return descriptors;
        }

        const addDescriptor = (raw = {}, uuidOverride = null) => {
            const uuid = uuidOverride || raw.uuid || raw.id || raw.event_id || raw.event_uuid;
            if (!uuid) {
                return;
            }

            let path = raw.path || raw.location || raw.event_path;
            let url = raw.url;
            if (!url && typeof raw.href === 'string') {
                url = raw.href;
            }
            if (!path && typeof raw.filename === 'string') {
                path = raw.filename;
            }

            const info = raw.info || raw.event_info || raw.title || raw.description || '';
            const published = raw.published || raw.publish_timestamp || raw.date || raw.timestamp;
            const org = raw.org || raw.orgc || raw.orgc_name || raw.owner_org || null;

            const descriptor = {
                uuid,
                info,
                path,
                url,
                published,
                org
            };

            if (!descriptor.path && descriptor.url && descriptor.url.startsWith('http')) {
                descriptor.path = descriptor.url;
            }

            if (!descriptor.path && !descriptor.url) {
                descriptor.path = `${uuid}.json`;
            }

            if (descriptor.path) {
                descriptor.path = descriptor.path.replace(/^\//, '');
            }

            descriptors.push(descriptor);
        };

        if (Array.isArray(manifest)) {
            manifest.forEach(entry => addDescriptor(entry));
        } else if (Array.isArray(manifest?.events)) {
            manifest.events.forEach(entry => addDescriptor(entry));
        } else if (manifest.lookup && typeof manifest.lookup === 'object') {
            Object.entries(manifest.lookup).forEach(([uuid, entry]) => addDescriptor(entry, uuid));
        } else if (typeof manifest === 'object') {
            Object.entries(manifest).forEach(([key, value]) => {
                if (['name', 'version', 'description', 'url', 'can_cache'].includes(key)) {
                    return;
                }
                if (value && typeof value === 'object') {
                    addDescriptor(value, key);
                }
            });
        }

        return descriptors.filter(item => item.uuid && (item.path || item.url)).map(item => ({
            ...item,
            feedUrl: baseUrl
        }));
    },

    describeMispEventOption(descriptor) {
        if (!descriptor) {
            return '';
        }
        const date = descriptor.published ? this.formatMispDate(descriptor.published) : '';
        const info = descriptor.info || descriptor.uuid;
        const org = descriptor.org ? ` • ${descriptor.org}` : '';
        const uuid = descriptor.uuid ? ` (${descriptor.uuid})` : '';
        return `${date ? `${date} • ` : ''}${info}${org}${uuid}`.trim();
    },

    formatMispDate(value) {
        if (!value) {
            return '';
        }
        const numeric = Number(value);
        if (!Number.isNaN(numeric) && numeric > 1000000000) {
            return new Date(numeric * 1000).toISOString().slice(0, 10);
        }
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }
        return value.toString();
    },

    normalizeMispTimestamp(value) {
        if (value === undefined || value === null) {
            return null;
        }

        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                return null;
            }
            return value.toISOString();
        }

        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                return null;
            }
            if (value > 1e12) {
                return new Date(value).toISOString();
            }
            if (value > 1e9) {
                return new Date(value * 1000).toISOString();
            }
            if (value > 1e6) {
                return new Date(value).toISOString();
            }
            return null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }

            if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
                return this.normalizeMispTimestamp(Number(trimmed));
            }

            let normalized = trimmed;
            if (trimmed.includes(' ') && !trimmed.includes('T')) {
                normalized = trimmed.replace(/\s+/, 'T');
            }

            const hasTimeZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized);
            if (!hasTimeZone) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                    normalized = `${normalized}T00:00:00Z`;
                } else if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(normalized)) {
                    normalized = `${normalized}:00:00Z`;
                } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
                    normalized = `${normalized}:00Z`;
                } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized)) {
                    normalized = `${normalized}Z`;
                }
            }

            const parsed = new Date(normalized);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
            return null;
        }

        return null;
    },

    resolveMispTimestamp(...values) {
        for (const value of values) {
            const normalized = this.normalizeMispTimestamp(value);
            if (normalized) {
                return normalized;
            }
        }
        return null;
    },

    generateMispGraphName(descriptor) {
        const info = typeof descriptor?.info === 'string' ? descriptor.info.trim() : '';

        if (info) {
            return info;
        }

        if (descriptor && descriptor.uuid) {
            return String(descriptor.uuid).trim();
        }

        return 'misp-event';
    },

    buildMispGraphFileName(descriptor) {
        const baseName = this.generateMispGraphName(descriptor) || 'misp-event';
        return baseName.endsWith('.qut') ? baseName : `${baseName}.qut`;
    },

    resolveNeo4jGraphMetadata(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        if (entry.metadata && typeof entry.metadata === 'object') {
            return entry.metadata;
        }

        if (entry.graph && typeof entry.graph === 'object') {
            if (entry.graph.metadata && typeof entry.graph.metadata === 'object') {
                return entry.graph.metadata;
            }
        }

        return null;
    },

    collectNeo4jGraphIdentifiers(entry) {
        const identifiers = new Set();
        const add = value => {
            if (typeof value !== 'string') {
                return;
            }
            const trimmed = value.trim();
            if (trimmed) {
                identifiers.add(trimmed);
            }
        };

        if (!entry) {
            return identifiers;
        }

        if (typeof entry === 'string') {
            add(entry);
            return identifiers;
        }

        if (entry && typeof entry === 'object') {
            add(entry.name);
            add(entry.id);
            add(entry.graphName);
            add(entry.graphId);

            if (Array.isArray(entry.identifiers)) {
                entry.identifiers.forEach(add);
            }

            const metadata = this.resolveNeo4jGraphMetadata(entry);
            if (metadata) {
                const possibleKeys = [
                    'id',
                    'graphId',
                    'graphName',
                    'name',
                    'uuid',
                    'eventUuid',
                    'event_uuid',
                    'descriptorUuid',
                    'descriptor_uuid',
                    'eventId',
                    'event_id',
                    'externalId',
                    'external_id'
                ];
                possibleKeys.forEach(key => add(metadata[key]));

                const extraSources = [
                    metadata.externalIds,
                    metadata.external_ids,
                    metadata.identifiers
                ];
                extraSources.forEach(source => {
                    if (Array.isArray(source)) {
                        source.forEach(add);
                    } else {
                        add(source);
                    }
                });
            }
        }

        return identifiers;
    },

    async checkNeo4jAvailability() {
        try {
            const creds = this.getNeo4jCredentials();
            if (!creds.url || !creds.username || !creds.password) {
                this.cachedNeo4jGraphs = [];
                this.cachedNeo4jGraphIdentifiers = new Set();
                return false;
            }

            const base = '';
            const headers = { 'Content-Type': 'application/json' };
            headers['X-Neo4j-Url'] = creds.url;
            headers['X-Neo4j-Username'] = creds.username;
            headers['X-Neo4j-Password'] = creds.password;

            const response = await fetch(`${base}/api/neo4j/graphs`, { headers });
            if (!response.ok) {
                this.cachedNeo4jGraphs = [];
                this.cachedNeo4jGraphIdentifiers = new Set();
                return false;
            }
            const graphs = await response.json();
            if (Array.isArray(graphs)) {
                this.cachedNeo4jGraphs = graphs;
                this.cachedNeo4jGraphIdentifiers = new Set();
                this.cachedNeo4jGraphs.forEach(entry => {
                    this.collectNeo4jGraphIdentifiers(entry).forEach(identifier => {
                        this.cachedNeo4jGraphIdentifiers.add(identifier);
                    });
                });
            } else {
                this.cachedNeo4jGraphs = [];
                this.cachedNeo4jGraphIdentifiers = new Set();
            }
            return true;
        } catch (error) {
            console.warn('Neo4j availability check failed', error);
            this.cachedNeo4jGraphs = [];
            this.cachedNeo4jGraphIdentifiers = new Set();
            return false;
        }
    },

    async batchSaveMispGraph({ fileName, neo4jAvailable }) {
        if (!window.FileManager || typeof window.FileManager.exportCurrentGraph !== 'function') {
            throw new Error('FileManager not available for batch save');
        }

        const graphData = window.FileManager.exportCurrentGraph();
        const baseName = fileName.replace(/\.qut$/i, '');

        if (graphData && window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                defaultTitle: graphData.title || baseName,
                defaultSource: () => graphData?.metadata?.source || 'Imported from MISP'
            });
        }

        graphData.graphName = graphData.title || baseName;
        if (!graphData.metadata || typeof graphData.metadata !== 'object') {
            graphData.metadata = {};
        }
        graphData.metadata.title = graphData.metadata.title || graphData.title || baseName;
        graphData.metadata.name = graphData.metadata.title;
        graphData.metadata.fileName = baseName;

        const base = '';
        const creds = this.getNeo4jCredentials?.() || {};
        const headers = { 'Content-Type': 'application/json' };
        if (creds.url) headers['X-Neo4j-Url'] = creds.url;
        if (creds.username) headers['X-Neo4j-Username'] = creds.username;
        if (creds.password) headers['X-Neo4j-Password'] = creds.password;

        if (neo4jAvailable) {
            try {
                const response = await fetch(`${base}/api/neo4j/graph`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(graphData)
                });
                if (!response.ok) {
                    throw new Error(`Neo4j responded with status ${response.status}`);
                }
                return { destination: 'neo4j', neo4jAvailable: true };
            } catch (error) {
                console.error('Batch Neo4j save failed', error);
                if (window.UI && typeof window.UI.showNotification === 'function') {
                    window.UI.showNotification(`Neo4j save failed: ${error.message}`, 'error');
                }
                neo4jAvailable = false;
            }
        }

        const jsonString = JSON.stringify(graphData, null, 2);
        try {
            if (window.WorkspaceManager?.handle && typeof window.WorkspaceManager.saveFile === 'function') {
                await window.WorkspaceManager.saveFile(`graphs/${fileName}`, jsonString, 'application/quantickle-graph');
            } else if (typeof window.FileManager.downloadFile === 'function') {
                window.FileManager.downloadFile(jsonString, fileName, 'application/quantickle-graph');
            }
            if (window.FileManager) {
                window.FileManager.currentFile = {
                    name: fileName,
                    type: 'qut',
                    lastModified: new Date(),
                    size: jsonString.length
                };
            }
        } catch (error) {
            console.error('Batch local save failed', error);
            if (window.UI && typeof window.UI.showNotification === 'function') {
                window.UI.showNotification(`Local save failed: ${error.message}`, 'error');
            }
            throw error;
        }

        return { destination: 'local', neo4jAvailable: false };
    },

    async resetGraphStateForBatch() {
        try {
            if (window.FileManager && typeof window.FileManager.applyGraphData === 'function') {
                window.FileManager.applyGraphData({ nodes: [], edges: [], metadata: {} });
            } else if (window.GraphRenderer && window.GraphRenderer.cy) {
                window.GraphRenderer.cy.elements().remove();
            }
        } catch (error) {
            console.warn('Failed to reset graph renderer between MISP events', error);
        }

        if (window.DataManager) {
            try {
                if (typeof window.DataManager.setGraphName === 'function') {
                    window.DataManager.setGraphName('Unsaved graph');
                } else {
                    window.DataManager.currentGraphName = 'Unsaved graph';
                    window.DataManager.currentGraphFileName = 'Unsaved graph.qut';
                }
            } catch (error) {
                console.warn('Failed to reset graph name between MISP events', error);
            }
        }

        if (window.TableManager) {
            try {
                if (typeof window.TableManager.updateTables === 'function') {
                    window.TableManager.updateTables();
                }
                if (typeof window.TableManager.updateTotalDataTable === 'function') {
                    window.TableManager.updateTotalDataTable();
                }
            } catch (error) {
                console.warn('Failed to refresh tables between MISP events', error);
            }
        }
    },

    resolveMispEventUrl(baseUrl, descriptor) {
        const sanitizedBase = this.normalizeMispFeedUrl(baseUrl);
        if (descriptor.url) {
            return new URL(descriptor.url, sanitizedBase).toString();
        }
        if (descriptor.path) {
            return new URL(descriptor.path, sanitizedBase).toString();
        }
        return new URL(`${descriptor.uuid}.json`, sanitizedBase).toString();
    },

    async fetchMispEventPayload(baseUrl, descriptor) {
        const eventUrl = this.resolveMispEventUrl(baseUrl, descriptor);
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(eventUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {

            const error = new Error(`Event request failed with status ${response.status}`);
            error.status = response.status;
            error.eventUrl = eventUrl;
            throw error;

        }

        const contentType = response.headers.get('content-type') || '';
        const contentEncoding = response.headers.get('content-encoding') || '';
        const isGzip = /gzip/.test(contentType) || /gzip/.test(contentEncoding) || /\.gz($|\?)/.test(eventUrl);

        let text;
        if (isGzip) {
            const buffer = await response.arrayBuffer();
            text = await this.decompressGzip(buffer);
        } else {
            text = await response.text();
        }

        let payload;
        try {
            payload = JSON.parse(text);
        } catch (error) {
            throw new Error('Event payload did not contain valid JSON');
        }

        return payload;
    },

    async decompressGzip(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            throw new Error('Invalid gzip buffer');
        }
        if (typeof DecompressionStream !== 'undefined') {
            const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
            return await new Response(stream).text();
        }
        if (typeof window !== 'undefined' && window.pako && typeof window.pako.ungzip === 'function') {
            return window.pako.ungzip(new Uint8Array(buffer), { to: 'string' });
        }
        if (typeof window !== 'undefined' && window.Zlib && typeof window.Zlib.Gunzip === 'function') {
            const gunzip = new window.Zlib.Gunzip(new Uint8Array(buffer));
            const decompressed = gunzip.decompress();
            return new TextDecoder().decode(decompressed);
        }
        throw new Error('Gzip decompression is not supported in this environment');
    },

    buildGraphFromMispEvent(payload, context = {}) {
        const event = payload?.Event || payload;
        if (!event) {
            throw new Error('Invalid MISP event payload');
        }

        const descriptor = context.descriptor || {};
        const feedUrl = context.feedUrl || this.CIRCL_MISP_DEFAULT_FEED_URL;
        const uuid = event.uuid || descriptor.uuid || `misp-event-${Date.now()}`;
        const info = event.info || descriptor.info || uuid;
        const normalizedInfo = typeof info === 'string' ? info.trim() : '';
        const published = event.publish_timestamp || descriptor.published;
        const reportNodeId = `misp_report_${uuid}`;
        const sourceUrl = this.resolveMispEventUrl(feedUrl, descriptor);

        const reportMetadata = {
            source: sourceUrl,
            feed: feedUrl,
            eventUuid: uuid,
            published: published ? this.formatMispDate(published) : undefined,
            threatLevel: event.threat_level_id,
            analysis: event.analysis,
            organisation: event.Orgc?.name || event.orgc?.name || descriptor.org || null
        };
        Object.keys(reportMetadata).forEach(key => {
            if (reportMetadata[key] === undefined || reportMetadata[key] === null) {
                delete reportMetadata[key];
            }
        });

        const reportLabel = normalizedInfo || String(info || uuid);

        const reportNode = {
            id: reportNodeId,
            label: reportLabel,
            type: 'report',
            category: 'misp-report',
            url: sourceUrl,
            color: '#1976D2',
            size: 80,
            metadata: Object.keys(reportMetadata).length ? reportMetadata : undefined
        };
        if (!reportNode.metadata) {
            delete reportNode.metadata;
        }

        const nodes = [reportNode];

        const { nodes: attributeNodes, edges } = this.mapMispAttributes(event.Attribute, reportNodeId);
        nodes.push(...attributeNodes);

        const sourceLabel = window.QuantickleUtils && typeof window.QuantickleUtils.buildImportSourceLabel === 'function'
            ? window.QuantickleUtils.buildImportSourceLabel({ integration: 'MISP', feedUrl })
            : 'Imported from MISP';

        const graphTitle = normalizedInfo || String(info || uuid);


        const graphMetadata = {
            id: uuid,
            title: graphTitle,
            eventUuid: uuid,
            descriptorUuid: descriptor.uuid,
            integration: 'MISP',
            feedUrl,
            sourceUrl,
            source: sourceLabel
        };

        if (graphTitle && typeof graphTitle === 'string') {
            graphMetadata.name = graphTitle;
        }

        const graphData = {
            id: uuid,
            title: graphTitle,
            nodes,
            edges,
            metadata: graphMetadata
        };

        if (window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                defaultTitle: graphTitle,
                defaultSource: sourceLabel
            });
        }

        return graphData;
    },

    mapMispAttributes(attributes, reportNodeId) {
        const nodes = [];
        const edges = [];
        const seen = new Set();
        const relationshipSeen = new Set();

        if (!Array.isArray(attributes)) {
            return { nodes, edges };
        }

        const addNodeIfNeeded = (info, attribute) => {
            if (!info || !info.id) {
                return;
            }

            if (!seen.has(info.id)) {
                const firstSeen = this.resolveMispTimestamp(
                    info.metadata && info.metadata.firstSeen,
                    attribute.first_seen,
                    attribute.timestamp
                );
                const lastSeen = this.resolveMispTimestamp(
                    info.metadata && info.metadata.lastSeen,
                    attribute.last_seen,
                    attribute.timestamp
                );
                const nodeTimestamp = this.resolveMispTimestamp(
                    info.metadata && info.metadata.timestamp,
                    attribute.timestamp,
                    firstSeen,
                    lastSeen
                );

                const label = this.truncateLabel(info.label || info.value || attribute.uuid || info.id);

                const nodeData = {
                    id: info.id,
                    label,
                    type: info.type,
                    category: attribute.category || info.category || 'indicator',
                    color: info.color,
                    size: info.size,
                    url: info.url,
                    value: info.value,
                    mispType: attribute.type,
                    mispCategory: attribute.category,
                    uuid: attribute.uuid,
                    toIds: attribute.to_ids,
                    metadata: info.metadata
                };
                if (!nodeData.label) {
                    nodeData.label = this.truncateLabel(info.value || attribute.uuid || info.id);
                }
                if (firstSeen) {
                    nodeData.firstSeen = firstSeen;
                }
                if (lastSeen) {
                    nodeData.lastSeen = lastSeen;
                }
                if (nodeTimestamp) {
                    nodeData.timestamp = nodeTimestamp;
                    if (nodeData.metadata) {
                        nodeData.metadata.timestamp = nodeTimestamp;
                    }
                }
                if (!nodeData.size) {
                    delete nodeData.size;
                }
                if (!nodeData.url) {
                    delete nodeData.url;
                }
                if (!nodeData.metadata) {
                    delete nodeData.metadata;
                }
                nodes.push(nodeData);
                seen.add(info.id);
            }
        };

        const addReportEdge = (info, attribute) => {
            if (!info || !info.id) {
                return;
            }
            const sanitizedValue = (info.value || '')
                .toString()
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .slice(0, 32);
            const edgeId = `${reportNodeId}_describes_${info.id}_${sanitizedValue || attribute.uuid || 'relation'}`;
            edges.push({
                id: edgeId,
                source: reportNodeId,
                target: info.id,
                label: attribute.category || 'indicator-of',
                type: 'misp-relationship'
            });
        };

        const addRelationshipEdge = (sourceInfo, targetInfo, attribute, relationship = {}) => {
            if (!sourceInfo || !targetInfo || !sourceInfo.id || !targetInfo.id) {
                return;
            }

            const direction = (relationship.direction || 'outgoing').toLowerCase();
            const isIncoming = direction === 'incoming';
            const sourceId = isIncoming ? targetInfo.id : sourceInfo.id;
            const targetId = isIncoming ? sourceInfo.id : targetInfo.id;
            const label = relationship.label || 'related-to';
            const type = relationship.type || 'misp-relationship';

            const relationKey = `${sourceId}->${targetId}->${type}->${label}`;
            if (relationshipSeen.has(relationKey)) {
                return;
            }

            const sanitizedRelation = (type || label || 'relation')
                .toString()
                .replace(/[^a-zA-Z0-9]+/g, '_')
                .slice(0, 32) || 'relation';

            const edgeId = `${sourceId}_${sanitizedRelation}_${targetId}`;
            edges.push({
                id: edgeId,
                source: sourceId,
                target: targetId,
                label,
                type
            });
            relationshipSeen.add(relationKey);
        };

        const processInfo = (info, attribute, parentInfo = null) => {
            if (!info || !info.id) {
                return;
            }

            addNodeIfNeeded(info, attribute);
            addReportEdge(info, attribute);

            if (parentInfo && parentInfo.id && parentInfo.id !== info.id) {
                addRelationshipEdge(parentInfo, info, attribute, info.relationship);
            }

            if (Array.isArray(info.relatedDescriptors)) {
                for (const related of info.relatedDescriptors) {
                    processInfo(related, attribute, info);
                }
            }
        };

        for (const attribute of attributes) {
            if (this.shouldSkipMispAttribute(attribute)) {
                continue;
            }

            const info = this.getMispAttributeTypeInfo(attribute);
            if (!info || !info.value) {
                continue;
            }

            processInfo(info, attribute, null);
        }

        return { nodes, edges };
    },

    getMispAttributeTypeInfo(attribute = {}) {
        const mapper = this.getNodeDescriptorMapper && this.getNodeDescriptorMapper('misp');
        const colorMapping = {
            domain: '#4CAF50',
            url: '#009688',
            ipaddress: '#FF5722',
            email_address: '#AB47BC',
            malware: '#607D8B',
            malware_family: '#EF6C00',
            threat_actor: '#F44336',
            forensic_evidence: '#795548',
            report: '#1976D2',
            filename: '#FF52C2'
        };

        const convertDescriptorToInfo = (descriptor, attributeContext = attribute) => {
            if (!descriptor || typeof descriptor !== 'object') {
                return null;
            }

            const type = descriptor.type || 'indicator';
            const metadata = descriptor.metadata ? { ...descriptor.metadata } : undefined;

            if (metadata) {
                if (Object.prototype.hasOwnProperty.call(metadata, 'timestamp')) {
                    const normalizedTimestamp = this.normalizeMispTimestamp(metadata.timestamp);
                    if (normalizedTimestamp) {
                        metadata.timestamp = normalizedTimestamp;
                    } else {
                        delete metadata.timestamp;
                    }
                }
                if (Object.prototype.hasOwnProperty.call(metadata, 'firstSeen')) {
                    const normalizedFirstSeen = this.normalizeMispTimestamp(metadata.firstSeen);
                    if (normalizedFirstSeen) {
                        metadata.firstSeen = normalizedFirstSeen;
                    } else {
                        delete metadata.firstSeen;
                    }
                }
                if (Object.prototype.hasOwnProperty.call(metadata, 'lastSeen')) {
                    const normalizedLastSeen = this.normalizeMispTimestamp(metadata.lastSeen);
                    if (normalizedLastSeen) {
                        metadata.lastSeen = normalizedLastSeen;
                    } else {
                        delete metadata.lastSeen;
                    }
                }
            }

            const valueCandidates = [
                metadata?.value,
                metadata?.hash,
                metadata?.sha256,
                metadata?.sha1,
                metadata?.md5,
                metadata?.ipAddress,
                metadata?.domain,
                metadata?.url,
                metadata?.email,
                descriptor.label,
                attributeContext?.value,
                attributeContext?.value1
            ];

            let resolvedValue = '';
            for (const candidate of valueCandidates) {
                if (candidate === undefined || candidate === null) {
                    continue;
                }
                const str = candidate.toString().trim();
                if (str) {
                    resolvedValue = str;
                    break;
                }
            }

            const nodeIdSeed = metadata?.sha256
                || metadata?.hash
                || metadata?.sha1
                || metadata?.md5
                || descriptor.label
                || resolvedValue
                || attributeContext?.uuid
                || type;

            const info = {
                id: this.generateMispNodeId(type, nodeIdSeed),
                label: descriptor.label || resolvedValue,
                type,
                category: attributeContext?.category || metadata?.category,
                color: colorMapping[type] || '#FFC107',
                url: metadata?.url,
                value: resolvedValue,
                metadata
            };

            info.label = this.truncateLabel(info.label || resolvedValue || attributeContext?.uuid || info.id);

            if (!info.value) {
                info.value = info.label || attributeContext?.uuid || '';
            }

            if (!info.url) {
                delete info.url;
            }

            if (metadata) {
                Object.keys(metadata).forEach(key => {
                    const metaValue = metadata[key];
                    if (metaValue === undefined || metaValue === null) {
                        delete metadata[key];
                    } else if (typeof metaValue === 'string' && !metaValue.trim()) {
                        delete metadata[key];
                    }
                });
                if (Object.keys(metadata).length === 0) {
                    delete info.metadata;
                }
            } else {
                delete info.metadata;
            }

            const relatedEntries = Array.isArray(descriptor.relatedDescriptors) ? descriptor.relatedDescriptors : [];
            const relatedInfos = [];
            for (const entry of relatedEntries) {
                const relatedDescriptor = entry && entry.descriptor ? entry.descriptor : entry;
                const relatedInfo = convertDescriptorToInfo(relatedDescriptor, attributeContext);
                if (!relatedInfo) {
                    continue;
                }
                if (entry && entry.relationship) {
                    relatedInfo.relationship = entry.relationship;
                }
                relatedInfos.push(relatedInfo);
            }
            if (relatedInfos.length > 0) {
                info.relatedDescriptors = relatedInfos;
            }

            return info;
        };

        if (mapper && typeof mapper.mapAttribute === 'function') {
            try {
                const descriptor = mapper.mapAttribute(attribute) || null;
                if (descriptor) {
                    return convertDescriptorToInfo(descriptor, attribute);
                }
            } catch (error) {
                console.error('Failed to map MISP attribute via descriptor mapper', error);
            }
        }

        const type = (attribute.type || '').toLowerCase();
        if (['md5', 'sha1', 'sha224', 'sha384', 'sha512', 'ssdeep', 'authentihash', 'imphash', 'pehash'].includes(type)) {
            return null;
        }

        const rawValue = (attribute.value || attribute.value1 || '').toString().trim();
        const mapping = {
            domain: { type: 'domain', color: '#4CAF50' },
            hostname: { type: 'domain', color: '#4CAF50' },
            'domain|ip': { type: 'domain', color: '#4CAF50' },
            url: { type: 'url', color: '#009688', url: rawValue },
            uri: { type: 'url', color: '#009688', url: rawValue },
            'uri-dst': { type: 'url', color: '#009688', url: rawValue },
            'ip-src': { type: 'ipaddress', color: '#FF5722' },
            'ip-dst': { type: 'ipaddress', color: '#FF5722' },
            'ip-src|port': { type: 'ipaddress', color: '#FF5722' },
            'ip-dst|port': { type: 'ipaddress', color: '#FF5722' },
            'email-src': { type: 'email_address', color: '#AB47BC' },
            'email-dst': { type: 'email_address', color: '#AB47BC' },
            'sha256': { type: 'malware', color: '#607D8B' },
            'malware-sample': { type: 'malware', color: '#607D8B' },
            'ja3-fingerprint-md5': { type: 'fingerprint', color: '#3F51B5' },
            'user-agent': { type: 'user-agent', color: '#8D6E63' },
            'asn': { type: 'asn', color: '#7E57C2' }
        };

        const info = mapping[type] ? { ...mapping[type] } : { type: 'indicator', color: '#FFC107' };
        info.value = rawValue;
        info.label = this.truncateLabel(rawValue || attribute.uuid || info.type);
        info.id = this.generateMispNodeId(info.type, rawValue || attribute.uuid || type);
        const metadata = info.metadata ? { ...info.metadata } : {};

        const normalizedTimestamp = this.normalizeMispTimestamp(attribute.timestamp);
        const normalizedFirstSeen = this.normalizeMispTimestamp(attribute.first_seen || attribute.firstSeen);
        const normalizedLastSeen = this.normalizeMispTimestamp(attribute.last_seen || attribute.lastSeen);

        if (attribute.comment) {
            metadata.comment = attribute.comment;
        }
        if (attribute.uuid) {
            metadata.uuid = attribute.uuid;
        }
        if (attribute.id) {
            metadata.id = attribute.id;
        }
        if (attribute.category) {
            metadata.category = attribute.category;
        }
        if (attribute.type) {
            metadata.mispType = attribute.type;
        }
        if (rawValue) {
            metadata.value = rawValue;
        }
        if (Object.prototype.hasOwnProperty.call(attribute, 'to_ids')) {
            metadata.toIds = attribute.to_ids;
        }
        if (normalizedFirstSeen) {
            metadata.firstSeen = normalizedFirstSeen;
        }
        if (normalizedLastSeen) {
            metadata.lastSeen = normalizedLastSeen;
        }
        if (normalizedTimestamp) {
            metadata.timestamp = normalizedTimestamp;
        }
        metadata.kind = metadata.kind || 'attribute';
        metadata.sourceSystem = metadata.sourceSystem || 'MISP';

        Object.keys(metadata).forEach(key => {
            const value = metadata[key];
            if (value === undefined || value === null) {
                delete metadata[key];
            } else if (typeof value === 'string' && !value.trim()) {
                delete metadata[key];
            }
        });

        if (Object.keys(metadata).length > 0) {
            info.metadata = metadata;
        } else {
            delete info.metadata;
        }
        info.label = this.truncateLabel(info.label || info.value || attribute.uuid || info.id);
        return info;
    },

    generateMispNodeId(prefix, value) {
        const safePrefix = (prefix || 'ioc').toString().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const sanitizedValue = (value || '')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 80);
        const base = sanitizedValue || Math.random().toString(36).slice(2, 10);
        return `${safePrefix}_${base}`;
    },

    shouldSkipMispAttribute(attribute = {}) {
        const type = (attribute.type || '').toLowerCase();
        const relation = (attribute.object_relation || '').toLowerCase();

        const skipTypes = new Set(['attachment', 'malware-sample', 'malware-sample', 'content']);
        if (skipTypes.has(type) || skipTypes.has(relation)) {
            return true;
        }
        if (type.includes('malware-sample') || relation.includes('malware-sample') ||
            type.includes('malware-sample') || relation.includes('malware-sample')) {
            return true;
        }
        if (attribute.data || attribute.value_data || attribute.base64) {
            return true;
        }
        const value = attribute.value || '';
        if (typeof value === 'string' && value.length > 4096) {
            return true;
        }
        return false;
    },

    // Debounce utility
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    nodeDescriptorMappers: {},

    registerNodeDescriptorMapper: function(key, mapper) {
        if (!key || !mapper) {
            return;
        }
        const normalized = key.toString().toLowerCase();
        this.nodeDescriptorMappers[normalized] = mapper;
    },

    getNodeDescriptorMapper: function(key) {
        if (!key) {
            return null;
        }
        const normalized = key.toString().toLowerCase();
        if (!this.nodeDescriptorMappers[normalized] && normalized === 'misp' && window.MispMapper) {
            this.registerNodeDescriptorMapper('misp', window.MispMapper);
        }
        return this.nodeDescriptorMappers[normalized] || null;
    },

    ensureNodeTypeAvailability: async function(nodeType) {
        if (!nodeType) {
            return;
        }
        if (window.DomainLoader && typeof window.DomainLoader.ensureDomainForType === 'function') {
            await window.DomainLoader.ensureDomainForType(nodeType);
        }
    },

    mapMispAttribute: async function(attribute, options = {}) {
        const mapper = this.getNodeDescriptorMapper('misp');
        if (!mapper || typeof mapper.mapAttribute !== 'function') {
            return null;
        }
        const descriptor = mapper.mapAttribute(attribute, options) || null;
        const ensureDescriptorTypes = async desc => {
            if (!desc || typeof desc !== 'object') {
                return;
            }
            if (desc.type) {
                await this.ensureNodeTypeAvailability(desc.type);
            }
            const related = Array.isArray(desc.relatedDescriptors) ? desc.relatedDescriptors : [];
            for (const entry of related) {
                const relatedDescriptor = entry && entry.descriptor ? entry.descriptor : entry;
                await ensureDescriptorTypes(relatedDescriptor);
            }
        };
        if (descriptor) {
            await ensureDescriptorTypes(descriptor);
        }
        return descriptor;
    },

    mapMispGalaxyCluster: async function(cluster, options = {}) {
        const mapper = this.getNodeDescriptorMapper('misp');
        if (!mapper || typeof mapper.mapGalaxyCluster !== 'function') {
            return null;
        }
        const descriptor = mapper.mapGalaxyCluster(cluster, options) || null;
        if (descriptor && descriptor.type) {
            await this.ensureNodeTypeAvailability(descriptor.type);
        }
        return descriptor;
    },

    mapMispSighting: async function(sighting, options = {}) {
        const mapper = this.getNodeDescriptorMapper('misp');
        if (!mapper || typeof mapper.mapSighting !== 'function') {
            return null;
        }
        const descriptor = mapper.mapSighting(sighting, options) || null;
        if (descriptor && descriptor.type) {
            await this.ensureNodeTypeAvailability(descriptor.type);
        }
        return descriptor;
    },

    // Sanitize arbitrary HTML with DOMPurify if available, falling back to a basic whitelist
    sanitizeHTML: function(dirty) {
        if (window.DOMPurify) {
            return DOMPurify.sanitize(dirty, {
                ALLOWED_TAGS: ['table', 'tr', 'th', 'td', 'colgroup', 'col'],
                ALLOWED_ATTR: ['style', 'scope']
            });
        }
        return dirty.replace(/<script.*?>[\s\S]*?<\/script>/gi, '');
    },

    // Escape text content to prevent HTML injection when DOMPurify is unavailable
    escapeHTML: function(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    },

    // Format key-value pairs into a sanitized HTML table for node info
    formatInfoHTML: function(infoObj) {
        const rows = Object.entries(infoObj)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) =>
                `<tr><th scope="row" style="text-align:left;border:1px solid #000;padding:4px 8px;">${this.escapeHTML(key)}</th>` +
                `<td style="border:1px solid #000;padding:4px 8px;">${this.escapeHTML(value)}</td></tr>`
            )
            .join('');
        const tableHTML = `<table style="border-collapse:collapse;border:3px solid #000;font-family:'Courier New', Courier, monospace;">` +
               `<colgroup><col style="width:12ch;"><col></colgroup>${rows}</table>`;
        return this.sanitizeHTML(tableHTML);
    },

    // Format key-value pairs into a plain-text summary for node info
    formatInfoText: function(infoObj) {
        const stripTags = value => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const lines = Object.entries(infoObj)
            .filter(([_, value]) => value !== undefined && value !== null && value !== '')
            .map(([key, value]) => `${stripTags(key)}: ${stripTags(value)}`);
        return lines.join('\n');
    },

    // Get API key for OpenAI from runtime storage
    getOpenAIApiKey: function() {
        return this.runtime.openaiApiKey;
    },

    // Get API key for SerpApi from runtime storage
    getSerpApiKey: function() {
        return this.runtime.serpApiKey;
    },

    // Get CIRCL-LU configuration from runtime storage
    getCirclLuConfiguration: function() {
        const baseUrl = this.CIRCL_LU_BASE_URL
            || this.lastCirclMispFeedUrl
            || this.CIRCL_MISP_DEFAULT_FEED_URL;
        return {
            baseUrl,
            username: this.runtime.circlLuAuthUsername,
            authKey: this.runtime.circlLuAuthKey,
            lastSync: this.runtime.circlLuLastSync
        };
    },

    // Get Neo4j credentials from runtime storage
    getNeo4jCredentials: function() {
        return {
            url: this.runtime.neo4jUrl,
            username: this.runtime.neo4jUsername,
            password: this.runtime.neo4jPassword
        };
    },

    makeCirclLuRequest: async function(endpoint, options = {}) {
        return this.runAction('circl-misp', 'request', { source: 'manager' }, { endpoint, options });
    },

    updateNeo4jMenuVisibility: function() {
        const desktopOption = document.getElementById('neo4jDesktopOption');
        const setupOption = document.getElementById('neo4jSetupOption');
        const setupSeparator = document.getElementById('neo4jSetupSeparator');

        const neo4jEnabled = this.hasNeo4jCredentials();
        const disabledTitle = 'Configure Neo4j credentials to enable this action';

        if (desktopOption) {
            desktopOption.classList.toggle('disabled', !neo4jEnabled);
            desktopOption.setAttribute('aria-disabled', neo4jEnabled ? 'false' : 'true');
            desktopOption.title = neo4jEnabled ? '' : disabledTitle;
        }

        if (setupOption) {
            const shouldShowSetup = !neo4jEnabled;
            setupOption.style.display = shouldShowSetup ? '' : 'none';
            setupOption.setAttribute('aria-hidden', shouldShowSetup ? 'false' : 'true');
        }

        if (setupSeparator) {
            setupSeparator.style.display = neo4jEnabled ? 'none' : '';
        }
    },

    hasNeo4jCredentials: function() {
        const { neo4jUrl, neo4jUsername, neo4jPassword } = this.runtime;
        return Boolean(neo4jUrl && neo4jUsername && neo4jPassword);
    },

};

// Global functions for UI interactions
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    const button = input?.nextElementSibling;
    
    if (input && button) {
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🙈';
        } else {
            input.type = 'password';
            button.textContent = '👁️';
        }
    }
};

window.loadOpmlFromUrl = async function() {
    return window.IntegrationsManager.runAction('opml', 'loadFromUrl', { source: 'ui' }, {});
};

window.importOpmlFeeds = async function() {
    return window.IntegrationsManager.runAction('opml', 'importFeeds', { source: 'ui' }, {});
};

window.runOpmlScanNow = async function() {
    return window.IntegrationsManager.runAction('opml', 'runScan', { source: 'ui' }, { force: true, statusId: 'opmlStatus' });
};

window.cancelOpmlScan = function() {
    return window.IntegrationsManager.runAction('opml', 'cancelScan', { source: 'ui' }, {});
};

// Compatibility wrappers: keep existing global names while delegating into module actions.
window.saveVirusTotalConfig = async function() {
    return window.IntegrationsManager.runAction('virustotal', 'saveConfig', { source: 'ui' }, {});
};

window.testVirusTotalConnection = async function() {
    return window.IntegrationsManager.runAction('virustotal', 'testConnection', { source: 'ui' }, {});
};

window.saveCirclLuConfig = async function() {
    return window.IntegrationsManager.runAction('circl-misp', 'saveConfig', { source: 'ui' }, {});
};

window.testCirclLuConnection = async function() {
    return window.IntegrationsManager.runAction('circl-misp', 'testConnection', { source: 'ui' }, {});
};

window.fetchCirclLuManifest = async function() {
    return window.IntegrationsManager.runAction('circl-misp', 'fetchManifest', { source: 'ui' }, {});
};

// VirusTotal Query Functions

window.queryVirusTotalFile = async function() {
    const fileHash = prompt('Enter file hash (MD5, SHA1, or SHA256):', '');
    
    if (!fileHash || !fileHash.trim()) {
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Please enter a valid file hash', 'warning');
        }
        return;
    }
    
    try {
        const result = await window.IntegrationsManager.runAction('virustotal', 'enrichFromGraph', { source: 'ui' }, {
            identifier: fileHash.trim(),
            queryType: 'file'
        });
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(
                `File analysis imported: ${result.detectionRatio} detection ratio (${result.malicious} malicious)`, 
                result.malicious > 0 ? 'warning' : 'success'
            );
        }
    } catch (error) {
        console.error('❌ VirusTotal file query failed:', error);
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`File query failed: ${error.message}`, 'error');
        }
    }
};

window.queryVirusTotalDomain = async function() {
    const domain = prompt('Enter domain name:', '');
    
    if (!domain || !domain.trim()) {
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Please enter a valid domain name', 'warning');
        }
        return;
    }
    
    try {
        const result = await window.IntegrationsManager.runAction('virustotal', 'enrichFromGraph', { source: 'ui' }, {
            identifier: domain.trim(),
            queryType: 'domain'
        });
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(
                `Domain analysis imported: ${result.detectionRatio} detection ratio (rep: ${result.reputation})`, 
                'success'
            );
        }
    } catch (error) {
        console.error('❌ VirusTotal domain query failed:', error);
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`Domain query failed: ${error.message}`, 'error');
        }
    }
};

window.queryVirusTotalIP = async function() {
    const ipAddress = prompt('Enter IP address:', '');
    
    if (!ipAddress || !ipAddress.trim()) {
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Please enter a valid IP address', 'warning');
        }
        return;
    }
    
    try {
        const result = await window.IntegrationsManager.runAction('virustotal', 'enrichFromGraph', { source: 'ui' }, {
            identifier: ipAddress.trim(),
            queryType: 'ip'
        });
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`IP analysis imported (basic implementation)`, 'success');
        }
    } catch (error) {
        console.error('❌ VirusTotal IP query failed:', error);
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`IP query failed: ${error.message}`, 'error');
        }
    }
};

window.queryVirusTotalURL = async function() {
    const url = prompt('Enter URL:', '');
    
    if (!url || !url.trim()) {
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Please enter a valid URL', 'warning');
        }
        return;
    }
    
    try {
        const result = await window.IntegrationsManager.runAction('virustotal', 'enrichFromGraph', { source: 'ui' }, {
            identifier: url.trim(),
            queryType: 'url'
        });
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`URL analysis imported (basic implementation)`, 'success');
        }
    } catch (error) {
        console.error('❌ VirusTotal URL query failed:', error);
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`URL query failed: ${error.message}`, 'error');
        }
    }
};

window.submitVirusTotalURL = async function() {
    const url = prompt('Enter URL to submit for analysis:', '');

    if (!url || !url.trim()) {
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification('Please enter a valid URL', 'warning');
        }
        return;
    }
    
    try {
        window.IntegrationsManager.updateStatus('virustotalStatus', 'Submitting URL for analysis...', 'loading');
        
        const result = await window.IntegrationsManager.runAction('virustotal', 'submitUrl', { source: 'ui' }, {
            url: url.trim()
        });
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`URL submitted successfully. Analysis ID: ${result.data.id}`, 'success');
        }
        
        window.IntegrationsManager.updateStatus('virustotalStatus', 'URL submitted successfully', 'success');
    } catch (error) {
        console.error('❌ VirusTotal URL submission failed:', error);
        window.IntegrationsManager.updateStatus('virustotalStatus', error.message, 'error');
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`URL submission failed: ${error.message}`, 'error');
        }
    }
};

window.loadCirclMispFeedManifest = async function() {
    if (!window.IntegrationsManager) {
        return [];
    }

    const feedInput = document.getElementById('circlMispFeedUrl');
    const requestedUrl = feedInput?.value?.trim();
    const feedUrl = requestedUrl || window.IntegrationsManager.lastCirclMispFeedUrl || window.IntegrationsManager.CIRCL_MISP_DEFAULT_FEED_URL;

    try {
        window.IntegrationsManager.updateStatus('circlMispStatus', 'Loading CIRCL MISP manifest...', 'loading');
        const normalizedUrl = window.IntegrationsManager.normalizeMispFeedUrl(feedUrl);
        const { descriptors } = await window.IntegrationsManager.fetchCirclMispManifest(normalizedUrl);
        window.IntegrationsManager.lastCirclMispManifest = descriptors;
        window.IntegrationsManager.lastCirclMispFeedUrl = normalizedUrl;

        const select = document.getElementById('circlMispEventSelect');
        if (select) {
            select.innerHTML = '';
            descriptors.forEach(descriptor => {
                const option = document.createElement('option');
                option.value = descriptor.uuid;
                option.textContent = window.IntegrationsManager.describeMispEventOption(descriptor);
                option.dataset.path = descriptor.path || '';
                option.dataset.url = descriptor.url || '';
                select.appendChild(option);
            });
        }

        const message = descriptors.length
            ? `Loaded ${descriptors.length} CIRCL MISP events`
            : 'No CIRCL MISP events available';
        window.IntegrationsManager.updateStatus('circlMispStatus', message, descriptors.length ? 'success' : 'warning');
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification(message, descriptors.length ? 'success' : 'warning');
        }

        return descriptors;
    } catch (error) {
        console.error('Failed to load CIRCL MISP manifest', error);
        const message = `Failed to load CIRCL MISP manifest: ${error.message}`;
        window.IntegrationsManager.updateStatus('circlMispStatus', message, 'error');
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification(message, 'error');
        }
        throw error;
    }
};

window.importSelectedCirclMispEvents = async function() {
    if (!window.IntegrationsManager) {
        return;
    }

    const select = document.getElementById('circlMispEventSelect');
    const feedInput = document.getElementById('circlMispFeedUrl');
    const autoSaveToggle = document.getElementById('circlMispAutoSave');

    const selected = select
        ? Array.from(select.selectedOptions || []).map(option => option.value).filter(Boolean)
        : [];


    const selectHasOptions = !!(select && select.options && select.options.length);

    if (selectHasOptions && !selected.length) {

        window.IntegrationsManager.updateStatus('circlMispStatus', 'Please select at least one event to import', 'warning');
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification('Select at least one CIRCL MISP event to import.', 'warning');
        }
        return;
    }

    const requestedUrl = feedInput?.value?.trim();
    const feedUrl = requestedUrl || window.IntegrationsManager.lastCirclMispFeedUrl || window.IntegrationsManager.CIRCL_MISP_DEFAULT_FEED_URL;
    const autoSave = !!(autoSaveToggle && autoSaveToggle.checked);

    try {
        await window.IntegrationsManager.runAction('circl-misp', 'importData', { source: 'ui' }, {
            feedUrl,
            selectedEventUuids: selected.length ? selected : null,
            autoSave,
            statusId: 'circlMispStatus'
        });
    } catch (error) {
        // importCirclMispFeed already reported the error through status/notifications
        console.error('CIRCL MISP import failed', error);
    }
};


window.syncCirclLuLatestEvent = async function(options = {}) {
    if (!window.IntegrationsManager) {
        return;
    }

    const feedInput = document.getElementById('circlMispFeedUrl');
    const requestedUrl = feedInput?.value?.trim();
    const feedUrl = options.feedUrl
        || requestedUrl
        || window.IntegrationsManager.lastCirclMispFeedUrl
        || window.IntegrationsManager.CIRCL_MISP_DEFAULT_FEED_URL;

    try {
        const result = await window.IntegrationsManager.runAction('circl-misp', 'importData', { source: 'ui' }, {
            feedUrl,
            selectedEventUuids: null,
            autoSave: !!options.autoSave,
            statusId: options.statusId || 'circlMispStatus',
            maxEvents: 1
        });
        return result;
    } catch (error) {
        console.error('Failed to sync CIRCL MISP events via legacy shortcut', error);
        const message = `Failed to sync CIRCL MISP events: ${error.message}`;
        window.IntegrationsManager.updateStatus(options.statusId || 'circlMispStatus', message, 'error');
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification(message, 'error');
        }
        throw error;
    }
};

window.syncCirclMispWholeFeed = async function(options = {}) {
    if (!window.IntegrationsManager) {
        return;
    }

    const feedInput = document.getElementById('circlMispFeedUrl');
    const requestedUrl = feedInput?.value?.trim();
    const feedUrl = options.feedUrl
        || requestedUrl
        || window.IntegrationsManager.lastCirclMispFeedUrl
        || window.IntegrationsManager.CIRCL_MISP_DEFAULT_FEED_URL;

    try {
        const result = await window.IntegrationsManager.runAction('circl-misp', 'importData', { source: 'ui' }, {
            feedUrl,
            selectedEventUuids: null,
            autoSave: false,
            statusId: options.statusId || 'circlMispStatus',
            batchSave: true
        });
        return result;
    } catch (error) {
        console.error('Failed to sync entire CIRCL MISP feed', error);
        const message = `Failed to sync CIRCL MISP feed: ${error.message}`;
        window.IntegrationsManager.updateStatus(options.statusId || 'circlMispStatus', message, 'error');
        if (window.UI && typeof window.UI.showNotification === 'function') {
            window.UI.showNotification(message, 'error');
        }
        throw error;
    }
};


window.importCirclMispEvents = async function(options = {}) {
    return window.IntegrationsManager.runAction('circl-misp', 'importData', { source: 'ui' }, options);
};

window.makeCirclLuRequest = async function(resource = 'manifest.json', options = {}) {
    return window.IntegrationsManager.runAction('circl-misp', 'requestResource', { source: 'ui' }, { resource, options });
};


window.saveOpenAIConfig = async function() {
    return window.IntegrationsManager.runAction('openai', 'saveConfig', { source: 'ui' }, {});
};

window.testOpenAIConnection = async function() {
    return window.IntegrationsManager.runAction('openai', 'testConnection', { source: 'ui' }, {});
};

window.saveSerpApiConfig = async function() {
    return window.IntegrationsManager.runAction('serpapi', 'saveConfig', { source: 'ui' }, {});
};

window.testSerpApiConnection = async function() {
    return window.IntegrationsManager.runAction('serpapi', 'testConnection', { source: 'ui' }, {});
};

window.saveNeo4jConfig = async function() {
    return window.IntegrationsManager.runAction('neo4j', 'saveConfig', { source: 'ui' }, {});
};

window.testNeo4jConnection = async function() {
    return window.IntegrationsManager.runAction('neo4j', 'testConnection', { source: 'ui' }, {});
};
