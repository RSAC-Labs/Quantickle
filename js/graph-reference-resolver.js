(function initializeGraphReferenceResolver(global) {
    const localGraphCache = new Map();
    const MAX_LOCAL_CACHE_ENTRIES = 50;

    const cloneGraphData = (graphData) => {
        if (!graphData || typeof graphData !== 'object') {
            return null;
        }
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(graphData);
            } catch (error) {
                console.debug('Structured clone of graph data failed, falling back to JSON clone', error);
            }
        }
        try {
            return JSON.parse(JSON.stringify(graphData));
        } catch (error) {
            console.warn('Failed to clone graph data for cache reuse', error);
            return graphData;
        }
    };

    const normalizeCacheKey = (reference, ensureExtensionFn, trimFn) => {
        if (reference == null) {
            return '';
        }

        let rawKey = '';
        if (typeof reference === 'string') {
            rawKey = reference;
        } else if (typeof reference === 'object') {
            rawKey = reference.key || reference.path || reference.graph || reference.reference || reference.info || '';
        }

        const ensured = ensureExtensionFn(trimFn(rawKey));
        if (!ensured) {
            return '';
        }

        return ensured.replace(/^\/+/, '');
    };

    const pruneLocalCache = () => {
        if (localGraphCache.size <= MAX_LOCAL_CACHE_ENTRIES) {
            return;
        }
        const excess = localGraphCache.size - MAX_LOCAL_CACHE_ENTRIES;
        for (let i = 0; i < excess; i += 1) {
            const oldestKey = localGraphCache.keys().next();
            if (!oldestKey || oldestKey.done) {
                break;
            }
            localGraphCache.delete(oldestKey.value);
        }
    };

    const storeGraphInCache = (reference, graphData, ensureExtensionFn, trimFn) => {
        if (!graphData || typeof graphData !== 'object' || !Array.isArray(graphData.nodes)) {
            return;
        }
        const cacheKey = normalizeCacheKey(reference, ensureExtensionFn, trimFn);
        if (!cacheKey) {
            return;
        }
        const cloned = cloneGraphData(graphData);
        if (!cloned) {
            return;
        }

        const entry = {
            graphData: cloned,
            storedAt: Date.now()
        };

        localGraphCache.set(cacheKey, entry);

        if (/^graphs\//i.test(cacheKey)) {
            const withoutGraphs = cacheKey.replace(/^graphs\//i, '');
            if (withoutGraphs && !localGraphCache.has(withoutGraphs)) {
                localGraphCache.set(withoutGraphs, entry);
            }
        } else {
            const withGraphsPrefix = `graphs/${cacheKey}`;
            if (!localGraphCache.has(withGraphsPrefix)) {
                localGraphCache.set(withGraphsPrefix, entry);
            }
        }

        pruneLocalCache();
    };

    const fetchGraphFromCache = (reference, ensureExtensionFn, trimFn) => {
        const cacheKey = normalizeCacheKey(reference, ensureExtensionFn, trimFn);
        if (!cacheKey || !localGraphCache.has(cacheKey)) {
            return null;
        }
        const entry = localGraphCache.get(cacheKey);
        if (!entry || !entry.graphData) {
            return null;
        }
        return cloneGraphData(entry.graphData);
    };

    const VALID_SOURCES = new Set(['file', 'neo4j', 'url', 'store', 'auto']);

    const SOURCE_LABELS = {
        file: 'Graph file',
        neo4j: 'Neo4j graph',
        url: 'Graph URL',
        store: 'Saved graph',
        auto: 'Graph reference'
    };

    const DEFAULT_SEQUENCE = {
        file: ['file'],
        neo4j: ['neo4j'],
        url: ['url'],
        store: ['store'],
        auto: ['store']
    };

    const resolveFileExtension = () => {
        const configured = global.FileManager?.config?.fileExtension;
        if (typeof configured === 'string' && configured.trim()) {
            return configured.trim();
        }
        return '.qut';
    };

    const ensureFileKeyExtension = (key) => {
        const trimmed = trimToString(key);
        if (!trimmed) {
            return trimmed;
        }
        const extension = resolveFileExtension();
        if (!extension) {
            return trimmed;
        }
        const lowerExt = extension.toLowerCase();
        return trimmed.toLowerCase().endsWith(lowerExt) ? trimmed : `${trimmed}${extension}`;
    };

    const trimToString = (value) => {
        if (value == null) {
            return '';
        }
        return String(value).trim();
    };

    const buildSequence = (source) => {
        if (!source || !Array.isArray(DEFAULT_SEQUENCE[source])) {
            return DEFAULT_SEQUENCE.store.slice();
        }
        return DEFAULT_SEQUENCE[source].slice();
    };

    const safeJsonParse = (text) => {
        try {
            return JSON.parse(text);
        } catch (error) {
            console.warn('Failed to parse graph JSON payload', error);
            return null;
        }
    };

    const resolveUrl = (candidate, base) => {
        const trimmedCandidate = trimToString(candidate);
        if (!trimmedCandidate) {
            return null;
        }
        if (/^https?:\/\//i.test(trimmedCandidate)) {
            return trimmedCandidate;
        }
        if (!base) {
            return trimmedCandidate;
        }
        try {
            return new URL(trimmedCandidate, base).toString();
        } catch (error) {
            console.warn('Failed to resolve graph URL', trimmedCandidate, base, error);
            return trimmedCandidate;
        }
    };

    const fetchJson = async (url, options) => {
        if (!url) {
            return null;
        }
        const fetchFn = options && typeof options.fetchFn === 'function' ? options.fetchFn : (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) {
            console.warn('No fetch implementation available for graph reference resolution');
            return null;
        }
        const requestInit = {};
        if (options && options.headers && typeof options.headers === 'object') {
            requestInit.headers = options.headers;
        }
        if (options && options.signal) {
            requestInit.signal = options.signal;
        }
        try {
            const response = await fetchFn(url, requestInit);
            if (!response || !response.ok) {
                return null;
            }
            const text = await response.text();
            if (!text) {
                return null;
            }
            return safeJsonParse(text);
        } catch (error) {
            if (error && error.name === 'AbortError') {
                throw error;
            }
            console.warn('Graph reference fetch failed', url, error);
            return null;
        }
    };

    const buildFileCandidates = (key) => {
        const trimmed = trimToString(key);
        const candidates = new Set();
        if (!trimmed) {
            return [];
        }
        candidates.add(trimmed);
        if (!/\.qut$/i.test(trimmed)) {
            candidates.add(`${trimmed}.qut`);
        }
        const normalized = trimmed.replace(/^\/+/, '');
        if (normalized && !/\.qut$/i.test(normalized)) {
            candidates.add(`${normalized}.qut`);
        }
        const qutName = normalized || trimmed;
        if (qutName) {
            const ensured = /\.qut$/i.test(qutName) ? qutName : `${qutName}.qut`;
            candidates.add(`/graphs/${ensured}`);
        }
        return Array.from(candidates);
    };

    const attemptWorkspaceGraphFetch = async (key) => {
        const manager = global.WorkspaceManager;
        if (!manager || !manager.handle || typeof manager.readFile !== 'function') {
            return null;
        }

        const candidates = buildFileCandidates(key);
        if (!candidates.length) {
            return null;
        }

        const ensureWorkspaceGraphExtension = (path) => {
            if (!path) {
                return '';
            }
            return /\.qut$/i.test(path) ? path : `${path}.qut`;
        };

        const buildWorkspacePathCandidates = (candidate) => {
            const trimmed = trimToString(candidate).replace(/^\/+/, '');
            if (!trimmed) {
                return [];
            }

            const normalizedSegments = trimmed.split('/').filter(Boolean);
            const paths = new Set();
            const registerPath = (value) => {
                const normalized = trimToString(value).replace(/^\/+/, '');
                if (!normalized) {
                    return;
                }
                paths.add(ensureWorkspaceGraphExtension(normalized));
            };

            if (normalizedSegments.length) {
                const firstSegment = normalizedSegments[0].toLowerCase();
                if (firstSegment === 'graphs') {
                    registerPath(normalizedSegments.join('/'));
                    if (normalizedSegments.length > 1) {
                        registerPath(normalizedSegments.slice(1).join('/'));
                    }
                } else {
                    registerPath(`graphs/${trimmed}`);
                }
            } else {
                registerPath(`graphs/${trimmed}`);
            }

            registerPath(trimmed);
            return Array.from(paths);
        };

        const attemptedPaths = new Set();

        for (const candidate of candidates) {
            const workspacePaths = buildWorkspacePathCandidates(candidate);
            for (const workspacePath of workspacePaths) {
                if (!workspacePath || attemptedPaths.has(workspacePath)) {
                    continue;
                }
                attemptedPaths.add(workspacePath);

                try {
                    const file = await manager.readFile(workspacePath);
                    if (!file) {
                        continue;
                    }
                    const text = await file.text();
                    if (!text) {
                        continue;
                    }
                    const graphData = safeJsonParse(text);
                    if (graphData && Array.isArray(graphData.nodes)) {
                        storeGraphInCache({ key: candidate }, graphData, ensureFileKeyExtension, trimToString);
                        return { graphData, source: 'file' };
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    console.debug('Workspace graph read failed', workspacePath, error);
                }
            }
        }

        return null;
    };

    const attemptFileFetch = async (key, options) => {
        const cached = fetchGraphFromCache({ key }, ensureFileKeyExtension, trimToString);
        if (cached) {
            return { graphData: cached, source: 'file' };
        }

        const workspaceResult = await attemptWorkspaceGraphFetch(key);
        if (workspaceResult) {
            return workspaceResult;
        }

        const base = options && options.base ? options.base : '';
        const candidates = buildFileCandidates(key);
        for (const candidate of candidates) {
            const url = resolveUrl(candidate, base);
            const graphData = await fetchJson(url, options);
            if (graphData) {
                storeGraphInCache({ key: candidate }, graphData, ensureFileKeyExtension, trimToString);
                return { graphData, source: 'file' };
            }
        }
        return null;
    };

    const attemptNeo4jFetch = async (key, options) => {
        const base = options && options.base ? options.base : '';
        const normalizedKey = trimToString(key).replace(/\.qut$/i, '');
        if (!normalizedKey) {
            return null;
        }
        const path = `/api/neo4j/graph/${encodeURIComponent(normalizedKey)}`;
        const url = resolveUrl(path, base);
        const graphData = await fetchJson(url, options);
        if (graphData) {
            return { graphData, source: 'neo4j' };
        }
        return null;
    };

    const attemptUrlFetch = async (url, options) => {
        const resolved = resolveUrl(url, options && options.base ? options.base : '');
        if (!resolved) {
            return null;
        }
        const graphData = await fetchJson(resolved, options);
        if (graphData) {
            return { graphData, source: 'url' };
        }
        return null;
    };

    const attemptStoreFetch = async (normalized, options) => {
        const loader = options && typeof options.fetchGraphStoreGraph === 'function'
            ? options.fetchGraphStoreGraph
            : null;
        if (loader) {
            try {
                const loaderResult = await loader(normalized.key, options);
                if (loaderResult) {
                    if (loaderResult.graphData && Array.isArray(loaderResult.graphData.nodes)) {
                        return { graphData: loaderResult.graphData, source: loaderResult.source || 'store' };
                    }
                    if (Array.isArray(loaderResult.nodes)) {
                        return { graphData: loaderResult, source: 'store' };
                    }
                }
            } catch (error) {
                if (!error || error.name !== 'AbortError') {
                    console.warn('Graph store fetch failed', error);
                }
            }
        }
        const fileResult = await attemptFileFetch(normalized.key, options);
        if (fileResult) {
            return fileResult;
        }
        return attemptNeo4jFetch(normalized.key, options);
    };

    const GraphReferenceResolver = {
        normalize(reference) {
            if (reference == null) {
                return null;
            }
            if (typeof reference === 'string') {
                const trimmed = reference.trim();
                if (!trimmed) {
                    return null;
                }
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    const parsed = safeJsonParse(trimmed);
                    if (parsed) {
                        return this.normalize(parsed);
                    }
                }
                const colonIndex = trimmed.indexOf(':');
                if (colonIndex > 0) {
                    const sourceCandidate = trimmed.slice(0, colonIndex).toLowerCase();
                    let remainder = trimmed.slice(colonIndex + 1).trim();
                    if (VALID_SOURCES.has(sourceCandidate)) {
                        const normalizedSource = sourceCandidate === 'auto' ? 'store' : sourceCandidate;
                        if (normalizedSource === 'file') {
                            remainder = ensureFileKeyExtension(remainder);
                        }
                        return {
                            source: normalizedSource,
                            key: remainder,
                            sequence: buildSequence(normalizedSource)
                        };
                    }
                }
                if (/^https?:\/\//i.test(trimmed)) {
                    return { source: 'url', key: trimmed, sequence: buildSequence('url') };
                }
                if (/\/|\\|\.qut$/i.test(trimmed)) {
                    return { source: 'file', key: ensureFileKeyExtension(trimmed), sequence: buildSequence('file') };
                }
                return { source: 'store', key: trimmed, sequence: buildSequence('store') };
            }
            if (typeof reference === 'object') {
                if (Array.isArray(reference)) {
                    if (reference.length === 0) {
                        return null;
                    }
                    return this.normalize(reference[0]);
                }
                if (reference.graphLink) {
                    return this.normalize(reference.graphLink);
                }
                const sourceRaw = reference.source || reference.type || reference.kind || reference.mode;
                const keyRaw = reference.key || reference.id || reference.path || reference.graph || reference.reference || reference.ref || reference.name || reference.info;
                let normalizedKey = trimToString(keyRaw);
                if (!normalizedKey) {
                    return null;
                }
                const normalizedSource = trimToString(sourceRaw).toLowerCase();
                const finalSource = VALID_SOURCES.has(normalizedSource)
                    ? (normalizedSource === 'auto' ? 'store' : normalizedSource)
                    : 'store';
                if (finalSource === 'file') {
                    normalizedKey = ensureFileKeyExtension(normalizedKey);
                }
                return {
                    source: finalSource,
                    key: normalizedKey,
                    sequence: buildSequence(finalSource)
                };
            }
            return null;
        },

        stringify(reference) {
            const normalized = this.normalize(reference);
            if (!normalized) {
                return '';
            }
            if (normalized.source === 'url') {
                return normalized.key;
            }
            return `${normalized.source}:${normalized.key}`;
        },

        describe(reference) {
            const normalized = this.normalize(reference);
            if (!normalized) {
                return '';
            }
            const label = SOURCE_LABELS[normalized.source] || SOURCE_LABELS.auto;
            if (!normalized.key) {
                return label;
            }
            return `${label}: ${normalized.key}`;
        },

        async fetch(reference, options = {}) {
            const normalized = this.normalize(reference);
            if (!normalized) {
                return null;
            }

            const cached = fetchGraphFromCache(normalized, ensureFileKeyExtension, trimToString);
            if (cached) {
                return {
                    graphData: cached,
                    link: {
                        source: normalized.source,
                        key: normalized.key
                    }
                };
            }

            const sequence = Array.isArray(normalized.sequence) && normalized.sequence.length
                ? normalized.sequence
                : buildSequence('store');
            for (const step of sequence) {
                let result = null;
                if (step === 'file') {
                    result = await attemptFileFetch(normalized.key, options);
                } else if (step === 'neo4j') {
                    result = await attemptNeo4jFetch(normalized.key, options);
                } else if (step === 'url') {
                    result = await attemptUrlFetch(normalized.key, options);
                } else if (step === 'store') {
                    result = await attemptStoreFetch(normalized, options);
                }
                if (result && result.graphData && Array.isArray(result.graphData.nodes)) {
                    if (result.source === 'file' || step === 'file') {
                        storeGraphInCache({ key: normalized.key }, result.graphData, ensureFileKeyExtension, trimToString);
                    }
                    return {
                        graphData: result.graphData,
                        link: {
                            source: result.source || step || normalized.source,
                            key: normalized.key
                        }
                    };
                }
            }
            return null;
        }
    };

    Object.defineProperty(GraphReferenceResolver, 'VALID_SOURCES', {
        value: Array.from(VALID_SOURCES),
        enumerable: false
    });

    GraphReferenceResolver.cacheLocalGraph = function cacheLocalGraph(reference, graphData) {
        storeGraphInCache(reference, graphData, ensureFileKeyExtension, trimToString);
    };

    GraphReferenceResolver.getCachedGraph = function getCachedGraph(reference) {
        return fetchGraphFromCache(reference, ensureFileKeyExtension, trimToString);
    };

    GraphReferenceResolver.clearCachedGraphs = function clearCachedGraphs() {
        localGraphCache.clear();
    };

    global.GraphReferenceResolver = GraphReferenceResolver;
})(typeof window !== 'undefined' ? window : globalThis);
