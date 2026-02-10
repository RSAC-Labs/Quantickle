/**
 * File Manager Module
 * 
 * Handles file operations, CSV loading, data parsing, and graph persistence.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * - Papa Parse library (for CSV parsing)
 * 
 * PROVIDES:
 * - loadCSVFile(file) - loads CSV file and creates graph
 * - saveGraphFile() - saves current graph to .qut file
 * - loadGraphFile(file) - loads .qut graph file
 * - loadSampleData() - loads example/sample graph data
 * - exportGraphData() - exports graph in various formats
 * - importGraphData(data) - imports graph data from various sources
 * 
 * FEATURES:
 * - Multiple file format support (CSV, JSON, QUT)
 * - Data validation and error handling
 * - Performance optimization for large datasets
 * - Sample data management
 * - File persistence and metadata tracking
 */

class FileManagerModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        this.papaParseLib = dependencies.papaParseLib;
        
        // Internal state
        this.currentFile = null;
        this.graphData = { nodes: [], edges: [] };
        this.nodeLimit = 15000;
        this.lastIgnoredDuplicateNodes = [];

        this._imagePreloadCache = new Map();
        
        // File configuration
        this.config = {
            fileExtension: '.qut',
            mimeType: 'application/quantickle-graph',
            csvMimeTypes: ['text/csv', 'application/csv', 'text/plain'],
            edgeListMimeTypes: ['text/plain'],
            maxFileSize: 100 * 1024 * 1024, // 100MB
            supportedFormats: ['csv', 'edges', 'json', 'qut']
        };
        
        // Data optimization structures
        this.nodeIndex = new Map();
        this.edgeIndex = new Map();
        this.typeIndex = new Map();

        // Example loader UI state
        this.exampleModal = null;
        this._boundExampleKeyHandler = null;
        
        // Initialize the module
        this.init();
    }
    
    /**
     * Initialize the file manager module
     */
    init() {
        this.setupDataOptimizations();
    }
    
    
    /**
     * Resolve configured API and asset base URLs so deployments behind proxies work reliably.
     * @returns {{ apiBase: string, serverBase: string }}
     */
    getServerBasePaths() {
        const configuredBase = typeof window !== 'undefined' ? window.QuantickleConfig?.apiBase : null;
        const defaultPaths = { apiBase: '/api', serverBase: '' };
    
        if (!configuredBase || typeof configuredBase !== 'string') {
            return defaultPaths;
        }
    
        const trimmed = configuredBase.trim();
        if (!trimmed) {
            return defaultPaths;
        }
    
        const hasProtocol = /^https?:\/\//i.test(trimmed);
        const baseForUrl = hasProtocol
            ? undefined
            : ((typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
                ? window.location.origin
                : 'http://localhost');
    
        try {
            const parsed = new URL(trimmed, baseForUrl);
            let pathname = parsed.pathname || '';
            pathname = pathname.replace(/\/+$/, '');
            const endsWithApi = /\/api$/i.test(pathname);
            const serverPath = endsWithApi ? pathname.slice(0, -4) : pathname;
    
            if (hasProtocol) {
                const origin = parsed.origin === 'null' ? '' : parsed.origin;
                const serverBase = `${origin}${serverPath}`.replace(/\/+$/, '');
                const apiBase = pathname ? `${origin}${pathname}`.replace(/\/+$/, '') : origin;
                return {
                    apiBase: apiBase || origin,
                    serverBase: serverBase || origin
                };
            }
    
            const serverBase = serverPath || '';
            const apiBase = pathname || '/api';
    
            return {
                apiBase: apiBase || '/api',
                serverBase
            };
        } catch (err) {
            let sanitized = trimmed.replace(/\/+$/, '');
            const endsWithApi = /\/api$/i.test(sanitized);
            if (!hasProtocol && sanitized && !sanitized.startsWith('/')) {
                sanitized = `/${sanitized}`;
            }
            const serverBase = endsWithApi ? sanitized.slice(0, -4).replace(/\/+$/, '') : sanitized;
            return {
                apiBase: sanitized || '/api',
                serverBase: serverBase || ''
            };
        }
    }
    
    /**
     * Join a base URL with a path segment without introducing duplicate slashes.
     * @param {string} base
     * @param {string} path
     * @returns {string}
     */
    joinUrl(base, path) {
        const normalizedBase = (base || '').toString();
        const normalizedPath = (path || '').toString();

        if (!normalizedPath) {
            return normalizedBase || '';
        }

        if (!normalizedBase) {
            return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath.replace(/^\/+/, '')}`;
        }

        const trimmedBase = normalizedBase.replace(/\/+$/, '');
        const trimmedPath = normalizedPath.replace(/^\/+/, '');

        return `${trimmedBase}/${trimmedPath}`;
    }

    async buildNeo4jApiError(response, fallbackMessage) {
        const status = response?.status;
        let detail = '';

        if (response && typeof response.text === 'function') {
            try {
                const rawBody = await response.text();
                const trimmed = (rawBody || '').trim();
                if (trimmed) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (parsed && typeof parsed === 'object') {
                            if (typeof parsed.error === 'string' && parsed.error.trim()) {
                                detail = parsed.error.trim();
                            } else if (Array.isArray(parsed.errors) && parsed.errors.length) {
                                detail = parsed.errors
                                    .map(err => {
                                        if (!err) return null;
                                        if (typeof err === 'string') return err;
                                        if (typeof err.message === 'string') return err.message;
                                        if (typeof err.code === 'string' && typeof err.message === 'string') {
                                            return `${err.code}: ${err.message}`;
                                        }
                                        return null;
                                    })
                                    .filter(Boolean)
                                    .join('; ');
                            }
                        }
                    } catch (_) {
                        detail = this.extractPlainTextErrorDetail(trimmed);
                    }
                }
            } catch (_) {
                // Ignore body parsing issues and fall back to generic messaging.
            }
        }

        let message;
        if (status === 404) {
            message = 'Neo4j deletion endpoint returned 404. Verify the Quantickle API base path or that the graph still exists.';
        } else if (status) {
            message = `${fallbackMessage || 'Neo4j request failed'} (HTTP ${status})`;
        } else {
            message = fallbackMessage || 'Neo4j request failed';
        }

        if (detail) {
            const trimmedDetail = detail.length > 400 ? `${detail.slice(0, 397)}…` : detail;
            message += ` Details: ${trimmedDetail}`;
        }

        return new Error(message);
    }

    extractPlainTextErrorDetail(rawBody) {
        if (!rawBody || typeof rawBody !== 'string') {
            return '';
        }

        const trimmed = rawBody.trim();
        if (!trimmed) {
            return '';
        }

        const htmlLike = /<!DOCTYPE|<html|<body|<pre|<head|<div|<span|<p\b/i.test(trimmed);
        if (!htmlLike && !/[<>]/.test(trimmed)) {
            return trimmed;
        }

        const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        const content = preMatch ? preMatch[1] : trimmed;

        const withoutScripts = content
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ');
        const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
        const decodedEntities = withoutTags
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
                const code = parseInt(hex, 16);
                return Number.isFinite(code) ? String.fromCharCode(code) : '';
            })
            .replace(/&#(\d+);/g, (_, num) => {
                const code = parseInt(num, 10);
                return Number.isFinite(code) ? String.fromCharCode(code) : '';
            });

        return decodedEntities.replace(/\s+/g, ' ').trim();
    }

    /**
     * Determine whether Neo4j credentials are configured.
     * @returns {boolean}
     */
    hasNeo4jCredentials() {
        const creds = window.IntegrationsManager?.getNeo4jCredentials?.();
        return Boolean(creds?.url && creds?.username && creds?.password);
    }

    /**
     * Ensure Neo4j actions have both integration support and credentials.
     * @param {string} actionDescription - friendly description of the action, used in warnings
     * @returns {boolean}
     */
    ensureNeo4jReady(actionDescription = 'use the Neo4j graph store') {
        const hasCredentials = this.hasNeo4jCredentials();

        if (hasCredentials) {
            return true;
        }

        const message = `Configure Neo4j credentials to ${actionDescription}.`;

        this.notifications?.show?.(message, 'warning');
        this.showNeo4jSetupGuide();
        return false;
    }

    getNeo4jRequestContext() {
        const paths = this.getServerBasePaths();
        const apiBase = paths.apiBase || '/api';
        const creds = window.IntegrationsManager?.getNeo4jCredentials?.() || {};
        const headers = { 'Content-Type': 'application/json' };

        if (creds.url) headers['X-Neo4j-Url'] = creds.url;
        if (creds.username) headers['X-Neo4j-Username'] = creds.username;
        if (creds.password) headers['X-Neo4j-Password'] = creds.password;

        return { apiBase, headers };
    }

    resolveNeo4jApiBase(context) {
        const paths = this.getServerBasePaths();
        if (context && context.apiBase) {
            return context.apiBase;
        }
        return paths.apiBase || '/api';
    }

    normalizeNeo4jGraphList(graphs) {
        if (!Array.isArray(graphs)) {
            return [];
        }

        const normalized = graphs
            .map(item => {
                if (!item) return null;
                if (typeof item === 'string') {
                    return { name: item, savedAt: null, sequence: null };
                }
                if (typeof item.name === 'string' && item.name.trim()) {
                    this.ensureNeo4jGraphEntryStructure(item);
                    let sequence = null;
                    if (typeof item.sequence === 'number') {
                        sequence = item.sequence;
                    } else if (typeof item.sequence === 'string') {
                        const parsed = Number.parseFloat(item.sequence);
                        if (Number.isFinite(parsed)) {
                            sequence = parsed;
                        }
                    }
                    const resolvedSavedAt = this.resolveGraphSavedTimestamp(item);
                    const savedAt = this.sanitizeSavedAtValue(resolvedSavedAt);

                    return {
                        name: item.name.trim(),
                        savedAt,
                        sequence
                    };
                }
                return null;
            })
            .filter(Boolean);

        const getComparableTimestamp = entry => {
            if (!entry || !entry.savedAt) {
                return Number.NEGATIVE_INFINITY;
            }

            const parsed = this.parseTemporalValue(entry.savedAt);
            if (!parsed || !this.isPlausibleSavedTimestamp(parsed)) {
                return Number.NEGATIVE_INFINITY;
            }

            const value = parsed.getTime();
            return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
        };

        normalized.sort((a, b) => {
            const timeA = getComparableTimestamp(a);
            const timeB = getComparableTimestamp(b);

            if (timeA !== timeB) {
                return timeB - timeA;
            }

            const seqA = typeof a.sequence === 'number' ? a.sequence : null;
            const seqB = typeof b.sequence === 'number' ? b.sequence : null;
            if (seqA !== null || seqB !== null) {
                if (seqA === null) return 1;
                if (seqB === null) return -1;
                if (seqA !== seqB) {
                    return seqB - seqA;
                }
            }

            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return normalized;
    }

    resolveGraphSavedTimestamp(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const candidateKeys = [
            'savedAt',
            'saved_at',
            'savedOn',
            'saved_on',
            'updatedAt',
            'updated_at',
            'createdAt',
            'created_at'
        ];

        const collect = (source, visited = new Set()) => {
            if (!source || typeof source !== 'object') {
                return null;
            }

            if (visited.has(source)) {
                return null;
            }

            visited.add(source);

            for (const key of candidateKeys) {
                if (Object.prototype.hasOwnProperty.call(source, key)) {
                    const sanitized = this.sanitizeSavedAtValue(source[key]);
                    if (sanitized) {
                        return sanitized;
                    }
                }
            }

            const nestedKeys = [
                'metadata',
                'meta',
                'attributes',
                'details',
                'properties',
                'data',
                'info'
            ];

            for (const nestedKey of nestedKeys) {
                if (!Object.prototype.hasOwnProperty.call(source, nestedKey)) {
                    continue;
                }

                const nestedValue = source[nestedKey];

                if (Array.isArray(nestedValue)) {
                    for (const entry of nestedValue) {
                        const resolved = collect(entry, visited);
                        if (resolved) {
                            return resolved;
                        }
                    }
                    continue;
                }

                if (nestedValue && typeof nestedValue === 'object') {
                    const resolved = collect(nestedValue, visited);
                    if (resolved) {
                        return resolved;
                    }
                }
            }

            return null;
        };

        const applyResolved = (value) => {
            const sanitized = this.sanitizeSavedAtValue(value);
            if (!sanitized) {
                return null;
            }
            this.applyGraphSavedTimestamp(entry, sanitized);
            if (entry.graph && typeof entry.graph === 'object') {
                this.applyGraphSavedTimestamp(entry.graph, sanitized);
            }
            return sanitized;
        };

        const direct = collect(entry);
        if (direct) {
            return applyResolved(direct);
        }

        if (entry.metadata && typeof entry.metadata === 'object') {
            const fromMetadata = collect(entry.metadata);
            if (fromMetadata) {
                return applyResolved(fromMetadata);
            }
        }

        if (entry.graph && typeof entry.graph === 'object') {
            const fromGraph = collect(entry.graph);
            if (fromGraph) {
                return applyResolved(fromGraph);
            }
            if (entry.graph.metadata && typeof entry.graph.metadata === 'object') {
                const fromGraphMetadata = collect(entry.graph.metadata);
                if (fromGraphMetadata) {
                    return applyResolved(fromGraphMetadata);
                }
            }
        }

        const published = this.extractGraphPublishedDate(entry);
        return applyResolved(published) || null;
    }

    safeParsePossibleJson(value, visited = new Set()) {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return this.safeParsePossibleJson(parsed, visited);
                } catch (_) {
                    return value;
                }
            }
            return value;
        }

        if (visited.has(value)) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(entry => this.safeParsePossibleJson(entry, visited));
        }

        if (typeof value === 'object') {
            visited.add(value);
            const result = {};
            for (const [key, entry] of Object.entries(value)) {
                result[key] = this.safeParsePossibleJson(entry, visited);
            }
            visited.delete(value);
            return result;
        }

        return value;
    }

    _isHtmlLikeString(value) {
        if (typeof value !== 'string') {
            return false;
        }
        const trimmed = value.trim();
        if (!trimmed || !/[<>]/.test(trimmed)) {
            return false;
        }
        if (/<\s*\/?\s*[a-z][\s>]/i.test(trimmed) || /<\/\s*[a-z]/i.test(trimmed)) {
            return true;
        }
        if (typeof DOMParser !== 'undefined') {
            try {
                const parsed = new DOMParser().parseFromString(trimmed, 'text/html');
                return !!(parsed && parsed.body && parsed.body.children && parsed.body.children.length);
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    normalizeGraphLinkPayload(...candidates) {
        const resolver = (typeof window !== 'undefined' ? window.GraphReferenceResolver : null)
            || (typeof globalThis !== 'undefined' ? globalThis.GraphReferenceResolver : null);

        const normalizeSourceValue = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            const trimmed = value.trim().toLowerCase();
            if (!trimmed) {
                return '';
            }
            if (trimmed === 'auto') {
                return 'store';
            }
            if (['file', 'neo4j', 'url', 'store'].includes(trimmed)) {
                return trimmed;
            }
            return '';
        };

        const inferSourceFromKey = (key) => {
            if (typeof key !== 'string') {
                return 'store';
            }
            const trimmed = key.trim();
            if (!trimmed) {
                return 'store';
            }
            if (/^https?:\/\//i.test(trimmed)) {
                return 'url';
            }
            if (/[\\/]/.test(trimmed) || /\.qut$/i.test(trimmed)) {
                return 'file';
            }
            return 'store';
        };

        const normalizeWithResolver = (candidate) => {
            if (!resolver || typeof resolver.normalize !== 'function') {
                return null;
            }
            if (typeof candidate === 'string' && this._isHtmlLikeString(candidate)) {
                return null;
            }
            try {
                const normalized = resolver.normalize(candidate);
                if (normalized && normalized.key) {
                    if (this._isHtmlLikeString(normalized.key)) {
                        return null;
                    }
                    const resolvedSource = normalizeSourceValue(normalized.source)
                        || inferSourceFromKey(normalized.key);
                    return { source: resolvedSource, key: normalized.key };
                }
            } catch (error) {
                console.debug('GraphReferenceResolver.normalize failed while processing graph link payload', error);
            }
            return null;
        };

        for (const candidate of candidates) {
            if (!candidate) {
                continue;
            }

            const resolverNormalized = normalizeWithResolver(candidate);
            if (resolverNormalized) {
                return resolverNormalized;
            }

            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (trimmed) {
                    if (this._isHtmlLikeString(trimmed)) {
                        continue;
                    }
                    return { source: inferSourceFromKey(trimmed), key: trimmed };
                }
                continue;
            }

            if (typeof candidate !== 'object') {
                continue;
            }

            const possibleKeyFields = ['key', 'graphReference', 'reference', 'info'];
            let resolvedKey = '';
            for (const keyField of possibleKeyFields) {
                const value = candidate[keyField];
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (!trimmed || this._isHtmlLikeString(trimmed)) {
                        continue;
                    }
                    resolvedKey = trimmed;
                    break;
                }
            }

            if (!resolvedKey) {
                continue;
            }

            const normalizedSource = normalizeSourceValue(candidate.source);
            const source = normalizedSource || inferSourceFromKey(resolvedKey);
            return { source, key: resolvedKey };
        }

        return null;
    }

    ensureNodeGraphLink(data) {
        if (!data || typeof data !== 'object') {
            return null;
        }

        const nodeType = data.type;
        const allowsGraphLink = nodeType === 'graph';
        if (!allowsGraphLink) {
            if (data.graphLink !== undefined) {
                delete data.graphLink;
            }
            if (data.graphReference !== undefined) {
                delete data.graphReference;
            }
            if (data.reference !== undefined) {
                delete data.reference;
            }
            return null;
        }

        let infoCandidate = data.info;
        if (typeof infoCandidate === 'string' && data.infoHtml && this._isHtmlLikeString(infoCandidate)) {
            infoCandidate = null;
        }

        let normalized = this.normalizeGraphLinkPayload(
            data.graphLink,
            data.graphReference,
            data.reference,
            infoCandidate
        );

        if (normalized && this._isHtmlLikeString(normalized.key)) {
            normalized = null;
        }

        if (normalized) {
            data.graphLink = normalized;
            data.graphReference = normalized.key;
            if (typeof data.info !== 'string' || !data.info.trim()) {
                data.info = normalized.key;
            }
        } else {
            if (data.graphLink !== undefined) {
                delete data.graphLink;
            }
            if (data.graphReference !== undefined) {
                delete data.graphReference;
            }
            if (data.reference !== undefined) {
                delete data.reference;
            }
        }

        return normalized;
    }

    ensureGraphNodeShape(node, graph) {
        if (!node || typeof node !== 'object') {
            return node;
        }

        if (typeof node.metadata === 'string') {
            const parsedMetadata = this.safeParsePossibleJson(node.metadata);
            if (parsedMetadata && typeof parsedMetadata === 'object') {
                node.metadata = parsedMetadata;
            }
        }

        if (Array.isArray(node.metadata)) {
            node.metadata = node.metadata.map(entry => this.safeParsePossibleJson(entry));
        }

        if (node.data && typeof node.data === 'string') {
            const parsedData = this.safeParsePossibleJson(node.data);
            if (parsedData && typeof parsedData === 'object') {
                node.data = parsedData;
            }
        }

        if (!node.data) {
            if (node.properties && typeof node.properties === 'object') {
                const parsedProps = this.safeParsePossibleJson(node.properties);
                node.properties = parsedProps;
                node.data = parsedProps;
            } else {
                const parsedNode = this.safeParsePossibleJson(node);
                if (parsedNode && typeof parsedNode === 'object' && parsedNode !== node) {
                    node.data = parsedNode;
                }
            }
        } else if (typeof node.data === 'object') {
            node.data = this.safeParsePossibleJson(node.data);
        }

        if (!node.properties && node.data && typeof node.data === 'object') {
            node.properties = node.data;
        }

        if (graph && typeof graph === 'object') {
            const graphId = graph.graphId || graph.id || graph.name;
            if (graphId && !node.graphId) {
                node.graphId = graphId;
            }
        }

        return node;
    }

    ensureNeo4jGraphEntryStructure(entry) {
        if (!entry || typeof entry !== 'object') {
            return entry;
        }

        if (typeof entry.metadata === 'string') {
            const parsedMetadata = this.safeParsePossibleJson(entry.metadata);
            if (parsedMetadata && typeof parsedMetadata === 'object') {
                entry.metadata = parsedMetadata;
            }
        }

        if (entry.metadata && typeof entry.metadata === 'object' && Array.isArray(entry.metadata)) {
            entry.metadata = entry.metadata.map(item => this.safeParsePossibleJson(item));
        }

        if (entry.graph && typeof entry.graph === 'string') {
            const parsedGraph = this.safeParsePossibleJson(entry.graph);
            if (parsedGraph && typeof parsedGraph === 'object') {
                entry.graph = parsedGraph;
            }
        }

        if (!entry.graph && entry.metadata && typeof entry.metadata === 'object') {
            entry.graph = { metadata: entry.metadata };
        }

        if (entry.graph && typeof entry.graph === 'object') {
            if (typeof entry.graph.metadata === 'string') {
                const parsedGraphMetadata = this.safeParsePossibleJson(entry.graph.metadata);
                if (parsedGraphMetadata && typeof parsedGraphMetadata === 'object') {
                    entry.graph.metadata = parsedGraphMetadata;
                }
            }

            if (!entry.graph.metadata && entry.metadata && typeof entry.metadata === 'object') {
                entry.graph.metadata = entry.metadata;
            }

            if (Array.isArray(entry.graph.nodes)) {
                entry.graph.nodes = entry.graph.nodes
                    .map(node => this.ensureGraphNodeShape(node, entry.graph))
                    .filter(Boolean);
            }
        }

        return entry;
    }

    extractGraphPublishedDate(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        const dates = [];
        const pushDate = value => {
            const parsed = this.parseTemporalValue(value);
            if (parsed && this.isPlausibleSavedTimestamp(parsed)) {
                dates.push(parsed);
            }
        };

        const collectPublished = (value, visited = new Set()) => {
            if (visited.has(value)) {
                return;
            }

            if (!value || typeof value !== 'object') {
                pushDate(value);
                return;
            }

            visited.add(value);

            pushDate(value.published);
            pushDate(value.publishedAt);
            pushDate(value.published_at);
            pushDate(value.datePublished);
            pushDate(value.date);

            const nestedKeys = [
                'metadata',
                'meta',
                'attributes',
                'details',
                'properties',
                'data',
                'info'
            ];

            for (const key of nestedKeys) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) {
                    continue;
                }

                const nested = value[key];

                if (Array.isArray(nested)) {
                    for (const entry of nested) {
                        collectPublished(entry, visited);
                    }
                    continue;
                }

                if (nested && typeof nested === 'object') {
                    collectPublished(nested, visited);
                }
            }
        };

        collectPublished(entry);
        if (entry.metadata && typeof entry.metadata === 'object') {
            collectPublished(entry.metadata);
        }

        if (entry.graph && typeof entry.graph === 'object') {
            const graph = entry.graph;
            collectPublished(graph);
            if (graph.metadata && typeof graph.metadata === 'object') {
                collectPublished(graph.metadata);
            }

            if (Array.isArray(graph.nodes)) {
                const nodes = graph.nodes;
                const rootNode = nodes.find(node => this.isLikelyRootNode(node, graph)) || nodes[0];
                const rootData = rootNode && (rootNode.data || rootNode.properties || rootNode);
                if (rootData) {
                    collectPublished(rootNode);
                    collectPublished(rootData);
                }
            }
        }

        if (!dates.length) {
            return null;
        }

        dates.sort((a, b) => b.getTime() - a.getTime());
        return dates[0].toISOString();
    }

    isLikelyRootNode(node, graph) {
        if (!node || typeof node !== 'object') {
            return false;
        }

        const data = node.data || node.properties || node;
        if (!data || typeof data !== 'object') {
            return false;
        }

        const truthyFlags = ['root', 'isRoot', 'is_root', 'isPrimary', 'is_primary'];
        if (truthyFlags.some(flag => data[flag])) {
            return true;
        }

        const stringFlags = ['type', 'category', 'label', 'kind'];
        if (stringFlags.some(flag => typeof data[flag] === 'string' && data[flag].toLowerCase() === 'root')) {
            return true;
        }

        if (graph && typeof graph === 'object') {
            const graphId = graph.graphId || graph.id || graph.name;
            if (graphId && typeof data.id === 'string' && data.id === graphId) {
                return true;
            }
        }

        return false;
    }

    parseTemporalValue(value) {
        if (!value) {
            return null;
        }

        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const abs = Math.abs(value);
            const digits = String(Math.trunc(abs)).length;
            if (digits === 13) {
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? null : date;
            }
            if (digits === 10) {
                const date = new Date(value * 1000);
                return Number.isNaN(date.getTime()) ? null : date;
            }
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }

            if (/^-?\d+$/.test(trimmed)) {
                const withoutSign = trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
                const digits = withoutSign.length;
                if (digits === 13) {
                    return this.parseTemporalValue(Number(trimmed));
                }
                if (digits === 10) {
                    return this.parseTemporalValue(Number(trimmed) * 1000);
                }
                if (digits === 8) {
                    const year = Number(trimmed.slice(0, 4));
                    const month = Number(trimmed.slice(4, 6));
                    const day = Number(trimmed.slice(6, 8));
                    if (
                        Number.isInteger(year) &&
                        Number.isInteger(month) &&
                        Number.isInteger(day) &&
                        month >= 1 &&
                        month <= 12 &&
                        day >= 1 &&
                        day <= 31
                    ) {
                        const date = new Date(Date.UTC(year, month - 1, day));
                        return Number.isNaN(date.getTime()) ? null : date;
                    }
                }
            }

            const parsed = new Date(trimmed);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed;
            }

            const replaced = trimmed.replace(/\s+/g, 'T');
            const parsedReplaced = new Date(replaced);
            if (!Number.isNaN(parsedReplaced.getTime())) {
                return parsedReplaced;
            }

            return null;
        }

        if (Array.isArray(value)) {
            for (const entry of value) {
                const parsed = this.parseTemporalValue(entry);
                if (parsed) {
                    return parsed;
                }
            }
            return null;
        }

        if (typeof value === 'object') {
            const candidateKeys = ['value', 'date', 'timestamp', '$date', 'time'];
            for (const key of candidateKeys) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const parsed = this.parseTemporalValue(value[key]);
                    if (parsed) {
                        return parsed;
                    }
                }
            }
        }

        return null;
    }

    sanitizeSavedAtValue(value) {
        const parsed = this.parseTemporalValue(value);
        if (!parsed || !this.isPlausibleSavedTimestamp(parsed)) {
            return null;
        }

        return parsed.toISOString();
    }

    isPlausibleSavedTimestamp(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return false;
        }

        const timestamp = date.getTime();
        const earliestTimestamp = Date.UTC(1970, 0, 1);
        if (timestamp < earliestTimestamp) {
            return false;
        }

        const maxFutureSkewMs = 1000 * 60 * 60 * 24 * 30; // Allow up to ~30 days clock drift.
        const maxAllowedTimestamp = Date.now() + maxFutureSkewMs;
        if (timestamp > maxAllowedTimestamp) {
            return false;
        }

        return true;
    }

    getSavedAtParts(savedAt) {
        const fallback = { date: '—', time: '—' };
        if (!savedAt) {
            return fallback;
        }

        try {
            const date = new Date(savedAt);
            if (Number.isNaN(date.getTime())) {
                return { date: savedAt, time: savedAt };
            }
            return {
                date: date.toLocaleDateString(undefined, { dateStyle: 'medium' }),
                time: date.toLocaleTimeString(undefined, { timeStyle: 'short' })
            };
        } catch (_) {
            return fallback;
        }
    }

    formatSavedDate(savedAt) {
        return this.getSavedAtParts(savedAt).date;
    }

    formatSavedTime(savedAt) {
        return this.getSavedAtParts(savedAt).time;
    }

    formatSavedAt(savedAt) {
        const parts = this.getSavedAtParts(savedAt);
        if (parts.date === '—' && parts.time === '—') {
            return '—';
        }
        if (parts.date === parts.time) {
            return parts.date;
        }
        if (parts.date === '—') {
            return parts.time;
        }
        if (parts.time === '—') {
            return parts.date;
        }
        return `${parts.date} ${parts.time}`;
    }

    applyGraphSavedTimestamp(target, savedAt) {
        if (!target || typeof target !== 'object') {
            return;
        }

        const parsed = this.parseTemporalValue(savedAt);
        if (!parsed) {
            return;
        }

        const iso = parsed.toISOString();
        const setIfMissing = (obj, key) => {
            if (!obj || typeof obj !== 'object') {
                return;
            }
            const current = obj[key];
            if (!current) {
                obj[key] = iso;
                return;
            }
            const currentDate = this.parseTemporalValue(current);
            if (!currentDate) {
                obj[key] = iso;
            }
        };

        setIfMissing(target, 'savedAt');
        setIfMissing(target, 'saved_at');

        if (!target.metadata || typeof target.metadata !== 'object') {
            target.metadata = {};
        }

        setIfMissing(target.metadata, 'savedAt');
        setIfMissing(target.metadata, 'saved_at');
    }

    ensureGraphSavedTimestamp(graphData, fallbackTimestamp = null) {
        if (!graphData || typeof graphData !== 'object') {
            return null;
        }

        const context = {
            savedAt: graphData.savedAt,
            saved_at: graphData.saved_at,
            metadata: graphData.metadata,
            graph: graphData
        };

        const resolved = this.resolveGraphSavedTimestamp(context);
        if (resolved) {
            this.applyGraphSavedTimestamp(graphData, resolved);
            return resolved;
        }

        if (!fallbackTimestamp) {
            return null;
        }

        let fallbackDate = this.parseTemporalValue(fallbackTimestamp);
        if (!fallbackDate || !this.isPlausibleSavedTimestamp(fallbackDate)) {
            fallbackDate = new Date();
        }

        if (!fallbackDate || Number.isNaN(fallbackDate.getTime()) || !this.isPlausibleSavedTimestamp(fallbackDate)) {
            return null;
        }

        const iso = fallbackDate.toISOString();
        this.applyGraphSavedTimestamp(graphData, iso);
        return iso;
    }

    normalizeGraphTitle(target, title) {
        if (!target || typeof target !== 'object') {
            return;
        }
        const rawTitle = typeof title === 'string' ? title.trim() : '';
        if (!rawTitle) {
            return;
        }

        target.title = rawTitle;
        target.graphName = rawTitle;
        target.name = rawTitle;
        if (!target.graphId || typeof target.graphId !== 'string' || !target.graphId.trim() || target.graphId === 'Unsaved graph') {
            target.graphId = rawTitle;
        }

        if (!target.metadata || typeof target.metadata !== 'object') {
            target.metadata = {};
        }
        target.metadata.title = rawTitle;
        target.metadata.name = rawTitle;
        if (!target.metadata.graphId || typeof target.metadata.graphId !== 'string' || !target.metadata.graphId.trim() || target.metadata.graphId === 'Unsaved graph') {
            target.metadata.graphId = rawTitle;
        }
        target.metadata.saveName = rawTitle;
    }

    synchronizeGraphTitleState(title, options = {}) {
        let rawTitle = typeof title === 'string' ? title.trim() : '';
        if (!rawTitle) {
            return null;
        }

        const dm = window.DataManager || null;
        const source = options.source || null;
        const ensureExtension = options.ensureExtension === true;

        if (ensureExtension) {
            rawTitle = this.ensureGraphFileExtension(rawTitle);
        }

        if (dm && typeof dm.setGraphName === 'function') {
            dm.setGraphName(rawTitle, { source, ensureExtension: false });
            if (dm.graphIdentity && typeof dm.graphIdentity === 'object') {
                const identity = dm.graphIdentity;
                const updatedMetadata = { ...(identity.metadata || {}) };
                updatedMetadata.title = rawTitle;
                updatedMetadata.name = rawTitle;
                updatedMetadata.graphId = rawTitle;
                if (source) {
                    updatedMetadata.saveSource = source;
                }
                dm.graphIdentity = {
                    ...identity,
                    title: rawTitle,
                    metadata: updatedMetadata
                };
            }
        }

        if (window.GraphManager && window.GraphManager.currentGraph) {
            this.normalizeGraphTitle(window.GraphManager.currentGraph, rawTitle);
        }

        return rawTitle;
    }

    ensureGraphFileExtension(name) {
        const extension = this.config?.fileExtension || '';
        if (!extension) {
            return name;
        }
        if (typeof name !== 'string') {
            return extension;
        }
        const trimmed = name.trim();
        if (!trimmed) {
            return extension;
        }
        if (trimmed.toLowerCase().endsWith(extension.toLowerCase())) {
            return trimmed.slice(0, -extension.length).trim() + extension;
        }
        return `${trimmed}${extension}`;
    }

    stripGraphFileExtension(name) {
        const extension = this.config?.fileExtension || '';
        if (!extension || typeof name !== 'string') {
            return name;
        }
        if (name.toLowerCase().endsWith(extension.toLowerCase())) {
            return name.slice(0, -extension.length);
        }
        return name;
    }

    deriveGraphNameFromFile(pathOrName, graphData) {
        const rawName = typeof pathOrName === 'string'
            ? pathOrName.split('/').filter(Boolean).pop()
            : '';
        const fallback = this.stripGraphFileExtension(rawName || 'local-graph');
        const candidates = [
            graphData?.metadata?.title,
            graphData?.metadata?.name,
            graphData?.title,
            graphData?.name
        ];
        const fromData = candidates.find(value => typeof value === 'string' && value.trim());
        return (fromData ? fromData.trim() : fallback) || fallback;
    }

    requestGraphName(options = {}) {
        const {
            defaultName = 'New graph',
            message = 'Enter a name for this graph:'
        } = options;

        const safeDefault = typeof defaultName === 'string' && defaultName.trim()
            ? defaultName.trim()
            : 'New graph';

        const input = window.prompt(message, safeDefault);
        if (input === null) {
            return { status: 'cancelled', name: null };
        }

        const trimmed = input.trim();
        if (!trimmed) {
            this.notifications?.show?.('Graph name cannot be empty', 'warning');
            return { status: 'invalid', name: null };
        }

        return { status: 'ok', name: trimmed };
    }

    getSuggestedGraphBaseName() {
        const extension = this.config?.fileExtension || '';
        const stripExtension = name => {
            if (typeof name !== 'string') {
                return null;
            }
            const trimmed = name.trim();
            if (!trimmed) {
                return null;
            }
            if (extension && trimmed.toLowerCase().endsWith(extension.toLowerCase())) {
                return trimmed.slice(0, -extension.length).trim();
            }
            return trimmed;
        };

        const dm = window.DataManager || null;
        if (dm) {
            const fromFile = stripExtension(dm.currentGraphFileName);
            if (fromFile && fromFile !== 'Unsaved graph') {
                return fromFile;
            }

            const fromName = stripExtension(dm.currentGraphName);
            if (fromName && fromName !== 'Unsaved graph') {
                return fromName;
            }
        }

        if (this.currentFile && typeof this.currentFile.name === 'string') {
            const stripped = stripExtension(this.currentFile.name);
            if (stripped) {
                return stripped;
            }
        }

        const fallback = `quantickle-graph-${new Date().toISOString().slice(0, 10)}`;
        return fallback;
    }

    buildNeo4jGraphList(graphs, options = {}) {
        const manager = this;
        const {
            id = 'neo4j-graph-select',
            maxHeight = '320px',
            emptyMessage = 'No graphs found in Neo4j.',
            onSelectChange,
            onConfirm
        } = options;

        let rawItems = manager.normalizeNeo4jGraphList(graphs);
        const sortState = { key: 'savedAt', direction: 'desc' };

        const getComparableTimestamp = entry => {
            if (!entry || !entry.savedAt) {
                return Number.NEGATIVE_INFINITY;
            }
            const parsed = manager.parseTemporalValue(entry.savedAt);
            if (!parsed || Number.isNaN(parsed.getTime())) {
                return Number.NEGATIVE_INFINITY;
            }
            return parsed.getTime();
        };

        const applySorting = source => {
            const list = Array.isArray(source) ? source.slice() : [];
            const { key, direction } = sortState;
            const modifier = direction === 'asc' ? 1 : -1;

            list.sort((a, b) => {
                if (key === 'name') {
                    const comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                    if (comparison !== 0) {
                        return comparison * modifier;
                    }
                    const timeDelta = getComparableTimestamp(a) - getComparableTimestamp(b);
                    if (timeDelta !== 0) {
                        return timeDelta * modifier;
                    }
                    return 0;
                }

                if (key === 'savedAt') {
                    const timeDelta = getComparableTimestamp(a) - getComparableTimestamp(b);
                    if (timeDelta !== 0) {
                        return timeDelta * modifier;
                    }
                }

                return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
            });

            return list;
        };

        let items = applySorting(rawItems);
        let selected = items[0]?.name || null;

        const container = document.createElement('div');
        container.id = id;
        container.setAttribute('role', 'listbox');
        container.tabIndex = 0;
        container.style.maxHeight = maxHeight;
        container.style.overflowY = 'auto';
        container.style.margin = '12px 0';
        container.style.border = '1px solid rgba(148, 163, 184, 0.25)';
        container.style.borderRadius = '8px';
        container.style.background = 'rgba(30, 41, 59, 0.6)';
        container.style.backdropFilter = 'blur(6px)';

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '14px';
        table.style.color = '#e2e8f0';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.background = 'rgba(15, 23, 42, 0.55)';
        headerRow.style.position = 'sticky';
        headerRow.style.top = '0';
        headerRow.style.backdropFilter = 'blur(4px)';

        const nameHeaderLabel = 'Graph Name';
        const nameHeader = document.createElement('th');
        nameHeader.textContent = nameHeaderLabel;
        nameHeader.style.textAlign = 'left';
        nameHeader.style.padding = '12px';

        const savedDateHeaderLabel = 'Saved Date';
        const savedDateHeader = document.createElement('th');
        savedDateHeader.textContent = savedDateHeaderLabel;
        savedDateHeader.style.textAlign = 'left';
        savedDateHeader.style.padding = '12px';
        savedDateHeader.style.width = '32%';

        const savedTimeHeader = document.createElement('th');
        savedTimeHeader.textContent = 'Saved Time';
        savedTimeHeader.style.textAlign = 'left';
        savedTimeHeader.style.padding = '12px';
        savedTimeHeader.style.width = '24%';

        headerRow.appendChild(nameHeader);
        headerRow.appendChild(savedDateHeader);
        headerRow.appendChild(savedTimeHeader);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        container.appendChild(table);

        const emptyState = document.createElement('div');
        emptyState.textContent = emptyMessage;
        emptyState.style.padding = '16px';
        emptyState.style.textAlign = 'center';
        emptyState.style.color = '#94a3b8';
        emptyState.style.display = 'none';
        container.appendChild(emptyState);

        const sortableHeaders = [
            { element: nameHeader, key: 'name', label: nameHeaderLabel },
            { element: savedDateHeader, key: 'savedAt', label: savedDateHeaderLabel }
        ];

        const updateSortIndicators = () => {
            sortableHeaders.forEach(({ element, key, label }) => {
                let indicator = '';
                let ariaSort = 'none';
                if (sortState.key === key) {
                    indicator = sortState.direction === 'asc' ? ' ▲' : ' ▼';
                    ariaSort = sortState.direction === 'asc' ? 'ascending' : 'descending';
                }
                element.textContent = `${label}${indicator}`;
                element.setAttribute('aria-sort', ariaSort);
            });
        };

        const defaultDirectionForKey = key => (key === 'name' ? 'asc' : 'desc');

        const changeSort = key => {
            if (!key) {
                return;
            }

            if (sortState.key === key) {
                sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.key = key;
                sortState.direction = defaultDirectionForKey(key);
            }

            items = applySorting(rawItems);
            render();
        };

        sortableHeaders.forEach(({ element, key, label }) => {
            element.style.cursor = 'pointer';
            element.style.userSelect = 'none';
            element.tabIndex = 0;
            element.title = `Sort by ${label}`;
            element.addEventListener('click', () => changeSort(key));
            element.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    changeSort(key);
                }
            });
        });

        const notifySelection = () => {
            if (typeof onSelectChange === 'function') {
                onSelectChange(selected);
            }
        };

        const updateRowStyles = () => {
            Array.from(tbody.rows).forEach(row => {
                const isSelected = row.dataset.graphName === selected;
                row.style.background = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'transparent';
                row.style.color = '#f8fafc';
            });
        };

        const selectGraph = name => {
            selected = name || null;
            updateRowStyles();
            notifySelection();
        };

        const handleConfirm = () => {
            if (typeof onConfirm === 'function' && selected) {
                onConfirm(selected);
            }
        };

        const render = () => {
            updateSortIndicators();
            tbody.innerHTML = '';
            if (!items.length) {
                table.style.display = 'none';
                emptyState.style.display = '';
                selected = null;
                notifySelection();
                return;
            }

            table.style.display = '';
            emptyState.style.display = 'none';

            items.forEach(item => {
                const row = document.createElement('tr');
                row.dataset.graphName = item.name;
                row.style.cursor = 'pointer';
                row.style.transition = 'background 0.2s ease';

                const nameCell = document.createElement('td');
                nameCell.textContent = item.name;
                nameCell.style.padding = '10px 12px';
                nameCell.style.borderBottom = '1px solid rgba(148, 163, 184, 0.12)';

                const savedDateCell = document.createElement('td');
                savedDateCell.textContent = manager.formatSavedDate(item.savedAt);
                savedDateCell.style.padding = '10px 12px';
                savedDateCell.style.borderBottom = '1px solid rgba(148, 163, 184, 0.12)';
                savedDateCell.style.whiteSpace = 'nowrap';

                const savedTimeCell = document.createElement('td');
                savedTimeCell.textContent = manager.formatSavedTime(item.savedAt);
                savedTimeCell.style.padding = '10px 12px';
                savedTimeCell.style.borderBottom = '1px solid rgba(148, 163, 184, 0.12)';
                savedTimeCell.style.whiteSpace = 'nowrap';

                row.appendChild(nameCell);
                row.appendChild(savedDateCell);
                row.appendChild(savedTimeCell);

                row.addEventListener('click', () => selectGraph(item.name));
                row.addEventListener('dblclick', () => {
                    selectGraph(item.name);
                    handleConfirm();
                });
                row.addEventListener('keydown', event => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        selectGraph(item.name);
                        handleConfirm();
                    }
                });
                row.tabIndex = 0;

                tbody.appendChild(row);
            });

            if (selected && !items.some(item => item.name === selected)) {
                selected = items[0]?.name || null;
            } else if (!selected) {
                selected = items[0]?.name || null;
            }

            updateRowStyles();
            notifySelection();
        };

        container.addEventListener('keydown', event => {
            if (!items.length) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const currentIndex = items.findIndex(item => item.name === selected);
                let nextIndex = currentIndex;
                if (event.key === 'ArrowDown') {
                    nextIndex = currentIndex >= 0 ? Math.min(currentIndex + 1, items.length - 1) : 0;
                } else {
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
                }
                const target = items[nextIndex];
                if (target) {
                    selectGraph(target.name);
                    const row = Array.from(tbody.rows).find(r => r.dataset.graphName === target.name);
                    row?.scrollIntoView({ block: 'nearest' });
                }
            } else if (event.key === 'Enter') {
                event.preventDefault();
                handleConfirm();
            }
        });

        render();

        return {
            container,
            setGraphs(newGraphs, preserveSelection = true) {
                const previousSelection = preserveSelection ? selected : null;
                rawItems = manager.normalizeNeo4jGraphList(newGraphs);
                items = applySorting(rawItems);
                if (preserveSelection && previousSelection && items.some(item => item.name === previousSelection)) {
                    selected = previousSelection;
                } else {
                    selected = items[0]?.name || null;
                }
                render();
            },
            getSelected() {
                return selected;
            },
            setSelected(name) {
                if (name && items.some(item => item.name === name)) {
                    selectGraph(name);
                }
            },
            focus() {
                const targetRow = Array.from(tbody.rows).find(row => row.dataset.graphName === selected);
                if (targetRow) {
                    targetRow.focus({ preventScroll: true });
                } else {
                    container.focus({ preventScroll: true });
                }
            },
            getItems() {
                return items.slice();
            }
        };
    }

    async fetchNeo4jGraphs(context) {
        const ctx = context || this.getNeo4jRequestContext();
        const apiBase = this.resolveNeo4jApiBase(ctx);
        if (!ctx.apiBase) {
            ctx.apiBase = apiBase;
        }
        const response = await fetch(this.joinUrl(apiBase, '/neo4j/graphs'), { headers: ctx.headers });
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const payload = await response.json();
        const graphs = this.normalizeNeo4jGraphList(payload);
        return { graphs, apiBase, headers: ctx.headers };
    }

    async fetchLocalGraphFiles() {
        if (!window.WorkspaceManager || !WorkspaceManager.handle) {
            return [];
        }

        const listFiles = WorkspaceManager.listFiles;
        const readFile = WorkspaceManager.readFile;
        if (typeof listFiles !== 'function' || typeof readFile !== 'function') {
            return [];
        }

        const extension = this.config?.fileExtension || '.qut';
        try {
            const filePaths = await listFiles.call(WorkspaceManager, 'graphs', extension);
            const entries = [];

            for (const path of filePaths) {
                try {
                    const file = await readFile.call(WorkspaceManager, path);
                    if (!file) continue;

                    let graphData = null;
                    try {
                        const text = await file.text();
                        graphData = JSON.parse(text);
                    } catch (error) {
                        console.warn('Unable to parse local graph metadata', path, error);
                    }

                    const savedAt = this.sanitizeSavedAtValue(
                        this.resolveGraphSavedTimestamp(graphData) || file.lastModified
                    );

                    entries.push({
                        name: this.deriveGraphNameFromFile(path, graphData),
                        savedAt,
                        source: 'file',
                        file,
                        path
                    });
                } catch (error) {
                    console.warn('Failed to read local graph file', path, error);
                }
            }

            const getComparableTimestamp = entry => {
                const parsed = this.parseTemporalValue(entry?.savedAt);
                return parsed && this.isPlausibleSavedTimestamp(parsed)
                    ? parsed.getTime()
                    : Number.NEGATIVE_INFINITY;
            };

            entries.sort((a, b) => {
                const timeA = getComparableTimestamp(a);
                const timeB = getComparableTimestamp(b);
                if (timeA !== timeB) {
                    return timeB - timeA;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });

            return entries;
        } catch (error) {
            console.warn('Failed to list local graph files', error);
            return [];
        }
    }

    async deleteGraphFromNeo4j(graphName, context) {
        if (!graphName) {
            throw new Error('Graph name is required for deletion');
        }
        const ctx = context || this.getNeo4jRequestContext();
        const apiBase = this.resolveNeo4jApiBase(ctx);
        if (!ctx.apiBase) {
            ctx.apiBase = apiBase;
        }
        const graphDeleteBase = this.joinUrl(apiBase, '/neo4j/graph');
        const separator = graphDeleteBase.includes('?') ? '&' : '?';
        const deleteUrl = `${graphDeleteBase}${separator}name=${encodeURIComponent(graphName)}`;
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: ctx.headers
        });
        if (!response.ok) {
            throw await this.buildNeo4jApiError(
                response,
                `Failed to delete graph "${graphName}" from Neo4j`
            );
        }
        return true;
    }

    /**
     * Open the Neo4j setup guide in a new tab or fall back to navigation.
     */
    showNeo4jSetupGuide() {
        try {
            const guidePath = 'NEO4J_INTEGRATION_README.md';
            const opened = window.open(guidePath, '_blank', 'noopener');
            if (!opened) {
                window.location.href = guidePath;
            }
        } catch (error) {
            console.error('Failed to open Neo4j setup guide', error);
        }
    }

    /**
     * PUBLIC INTERFACE: Load CSV file and create graph
     * @param {File} file - CSV file to load
     */
    async loadCSVFile(file) {
        if (!this.validateFile(file, 'csv')) {
            return;
        }
        
        const dm = window.DataManager || null;
        try {
            this.notifications.show('Loading CSV file...', 'info');
            if (dm) dm.isLoading = true;

            const text = await this.readFileAsText(file);
            const result = await this.parseCSV(text);

            if (result.data && result.data.length > 0) {
                const graphData = this.convertCSVToGraph(result.data, result.meta);
                this.normalizeGraphTitle(graphData, file.name);
                await this.prepareDomainsForGraph(graphData);
                this.applyGraphData(graphData, { selectImportedNodes: false });

                this.currentFile = {
                    name: file.name,
                    type: 'csv',
                    lastModified: new Date(file.lastModified),
                    size: file.size
                };

                if (dm) {
                    dm.isLoading = false;
                }

                this.synchronizeGraphTitleState(file.name, { source: 'file', ensureExtension: true });

                this.notifications.show(`Loaded ${graphData.nodes.length} nodes and ${graphData.edges.length} edges from CSV`, 'success');
            } else {
                this.notifications.show('CSV file appears to be empty or invalid', 'error');
            }
        } catch (error) {
            console.error('CSV loading failed:', error);
            this.notifications.show(`Failed to load CSV: ${error.message}`, 'error');
        } finally {
            if (dm) dm.isLoading = false;
        }
    }

    /**
     * PUBLIC INTERFACE: Load edge list file and create graph
     * @param {File} file - Edge list file to load
     */
    async loadEdgesFile(file) {
        if (!this.validateFile(file, 'edges')) {
            return;
        }

        const dm = window.DataManager || null;
        try {
            this.notifications.show('Loading edge list...', 'info');
            if (dm) dm.isLoading = true;

            const text = await this.readFileAsText(file);
            const graphData = this.parseEdgeList(text);
            this.normalizeGraphTitle(graphData, file.name);
            await this.prepareDomainsForGraph(graphData);
            this.applyGraphData(graphData, { selectImportedNodes: false });

            this.currentFile = {
                name: file.name,
                type: 'edges',
                lastModified: new Date(file.lastModified),
                size: file.size
            };

            if (dm) {
                dm.isLoading = false;
            }

            this.synchronizeGraphTitleState(file.name, { source: 'file', ensureExtension: true });

            this.notifications.show(`Loaded ${graphData.nodes.length} nodes and ${graphData.edges.length} edges from edge list`, 'success');
        } catch (error) {
            console.error('Edge list loading failed:', error);
            this.notifications.show(`Failed to load edge list: ${error.message}`, 'error');
        } finally {
            if (dm) dm.isLoading = false;
        }
    }

    /**
     * PUBLIC INTERFACE: Save current graph to .qut file
     */
    async saveGraphFile() {
        if (!this.cy) {
            this.notifications.show('No graph data to save', 'warning');
            return;
        }

        try {
            const suggestedBase = this.getSuggestedGraphBaseName();
            const extension = this.config?.fileExtension || '';

            let baseName = typeof suggestedBase === 'string' ? suggestedBase : '';
            if (extension && baseName.toLowerCase().endsWith(extension.toLowerCase())) {
                baseName = baseName.slice(0, -extension.length);
            }

            baseName = baseName.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!baseName) {
                baseName = 'graph';
            }

            const suggestedFilename = this.ensureGraphFileExtension(baseName);
            const graphData = this.exportCurrentGraph();
            this.ensureGraphSavedTimestamp(graphData, new Date());

            const sanitizeName = (name) => {
                if (typeof name !== 'string') {
                    return '';
                }
                const trimmed = name.trim();
                if (!trimmed) {
                    return '';
                }
                return trimmed.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
            };

            const preparePayload = (name) => {
                let sanitized = sanitizeName(name);
                if (!sanitized) {
                    sanitized = sanitizeName(suggestedFilename) || 'graph';
                }
                const ensured = this.ensureGraphFileExtension(sanitized);
                const normalizedTitle = this.synchronizeGraphTitleState(ensured, { source: 'file' }) || ensured;
                this.normalizeGraphTitle(graphData, normalizedTitle);
                return {
                    filename: ensured,
                    payload: JSON.stringify(graphData, null, 2)
                };
            };

            const abortErrorCode = typeof DOMException !== 'undefined' ? DOMException.ABORT_ERR : 20;
            const isUserCancellation = (error) =>
                error?.name === 'AbortError' ||
                error?.code === abortErrorCode;

            const isStaleHandleError = (error) => {
                if (!error) {
                    return false;
                }
                const name = typeof error.name === 'string' ? error.name : '';
                const message = typeof error.message === 'string' ? error.message : '';
                const code = typeof error.code === 'number' ? error.code : null;
                const normalizedMessage = message.toLowerCase();

                return (
                    name === 'InvalidStateError' ||
                    name === 'NotFoundError' ||
                    code === 11 ||
                    normalizedMessage.includes('stale') ||
                    normalizedMessage.includes('file handle') ||
                    normalizedMessage.includes('no longer usable') ||
                    normalizedMessage.includes('not found')
                );
            };

            const saveWithHandle = async (handle) => {
                const chosenName = handle?.name || suggestedFilename;
                pendingPayload = preparePayload(chosenName);
                const writable = await handle.createWritable();
                await writable.write(new Blob([pendingPayload.payload], { type: this.config.mimeType }));
                await writable.close();
                return pendingPayload;
            };

            const saveWithPicker = async () => {
                let startIn;
                if (window.WorkspaceManager && WorkspaceManager.handle) {
                    startIn = await WorkspaceManager.getSubDirHandle('graphs');
                }
                const handle = await window.showSaveFilePicker({
                    suggestedName: suggestedFilename,
                    types: [{
                        description: 'Quantickle Graph',
                        accept: { 'application/quantickle-graph': [this.config.fileExtension] }
                    }],
                    startIn
                });
                return saveWithHandle(handle);
            };

            let savedPayload = null;
            let pendingPayload = null;

            if (window.showSaveFilePicker) {
                try {
                    savedPayload = await saveWithPicker();
                } catch (pickerError) {
                    if (isUserCancellation(pickerError)) {
                        this.notifications?.show?.('Graph save cancelled', 'info');
                        return;
                    }

                    if (isStaleHandleError(pickerError)) {
                        try {
                            savedPayload = await saveWithPicker();
                        } catch (retryError) {
                            if (isUserCancellation(retryError)) {
                                this.notifications?.show?.('Graph save cancelled', 'info');
                                return;
                            }

                            if (isStaleHandleError(retryError)) {
                                this.notifications?.show?.(
                                    'The selected file handle appears to be stale. Please reselect the file location and try saving again.',
                                    'error'
                                );
                                return;
                            }

                            console.warn('showSaveFilePicker failed after retrying a stale handle.', retryError);
                        }
                    } else {
                        console.warn('showSaveFilePicker failed, falling back to alternate save mechanisms.', pickerError);
                    }

                }
            }

            if (!savedPayload) {
                const payloadToUse = pendingPayload || preparePayload(suggestedFilename);
                if (window.WorkspaceManager && WorkspaceManager.handle) {
                    await WorkspaceManager.saveFile(`graphs/${payloadToUse.filename}`, payloadToUse.payload, this.config.mimeType);
                } else {
                    this.downloadFile(payloadToUse.payload, payloadToUse.filename, this.config.mimeType);
                }
                savedPayload = payloadToUse;
            }

            if (!savedPayload) {
                return;
            }

            this.currentFile = {
                name: savedPayload.filename,
                type: 'qut',
                lastModified: new Date(),
                size: savedPayload.payload.length
            };

            this.notifications.show(`Graph saved as ${savedPayload.filename}`, 'success');

            if (window.GraphRenderer && typeof window.GraphRenderer.handleActiveGraphSaved === 'function') {
                try {
                    window.GraphRenderer.handleActiveGraphSaved({
                        source: 'file',
                        key: savedPayload.filename,
                        filename: savedPayload.filename,
                        graphName: graphData.graphName,
                        title: graphData.title,
                        graphData
                    });
                } catch (error) {
                    console.warn('Unable to update origin node with saved file reference', error);
                }
            }
        } catch (error) {
            console.error('Save failed:', error);
            this.notifications.show(`Failed to save graph: ${error.message}`, 'error');
        }
    }

    /**
     * PUBLIC INTERFACE: Display a full-screen grid of Neo4j graphs
     */
    async openGraphDesktop() {
        if (!this.ensureNeo4jReady('browse graphs in the Neo4j store')) {
            return false;
        }

        const context = this.getNeo4jRequestContext();
        let graphs = [];
        let localGraphs = [];

        try {
            const result = await this.fetchNeo4jGraphs(context);
            graphs = (result.graphs || []).map(entry => ({ ...entry, source: 'neo4j' }));
            if (result.apiBase) {
                context.apiBase = result.apiBase;
            }
        } catch (error) {
            console.error('Failed to fetch graphs from Neo4j', error);
            this.notifications?.show?.(`Failed to fetch graphs from Neo4j: ${error.message}`, 'error');
            return false;
        }

        try {
            localGraphs = await this.fetchLocalGraphFiles();
        } catch (error) {
            console.warn('Unable to load local graph files for desktop view', error);
        }

        const sortGraphs = list => {
            const getComparableTimestamp = entry => {
                const parsed = this.parseTemporalValue(entry?.savedAt);
                return parsed && this.isPlausibleSavedTimestamp(parsed)
                    ? parsed.getTime()
                    : Number.NEGATIVE_INFINITY;
            };

            return list.slice().sort((a, b) => {
                const timeA = getComparableTimestamp(a);
                const timeB = getComparableTimestamp(b);
                if (timeA !== timeB) {
                    return timeB - timeA;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });
        };

        const rebuildGraphList = () => {
            graphs = sortGraphs([...(graphs || []), ...(localGraphs || [])]);
        };

        rebuildGraphList();

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,41,59,0.9));
            backdrop-filter: blur(6px);
            display: flex;
            align-items: stretch;
            justify-content: center;
            padding: 28px;
            box-sizing: border-box;
            z-index: 10000;
            overflow: auto;
        `;

        const desktop = document.createElement('div');
        desktop.style.cssText = `
            background: rgba(15, 23, 42, 0.92);
            color: #e2e8f0;
            border-radius: 18px;
            box-shadow: 0 30px 60px rgba(0,0,0,0.45);
            width: min(1280px, 100%);
            display: flex;
            flex-direction: column;
            padding: 24px;
            gap: 16px;
            max-height: calc(100vh - 56px);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';

        const titleGroup = document.createElement('div');
        titleGroup.style.display = 'flex';
        titleGroup.style.flexDirection = 'column';

        const title = document.createElement('h2');
        title.textContent = 'Neo4j Graph Desktop';
        title.style.margin = '0';
        title.style.fontSize = '18px';
        title.style.fontWeight = '700';

        const subtitle = document.createElement('div');
        subtitle.textContent = 'Browse, load, rename, and delete graphs from Neo4j or your workspace.';
        subtitle.style.fontSize = '13px';
        subtitle.style.color = '#cbd5f5';
        subtitle.style.opacity = '0.85';
        titleGroup.appendChild(title);
        titleGroup.appendChild(subtitle);

        const headerActions = document.createElement('div');
        headerActions.style.display = 'flex';
        headerActions.style.gap = '10px';
        headerActions.style.alignItems = 'center';
        headerActions.style.flexWrap = 'wrap';

        const saveActions = document.createElement('div');
        saveActions.style.display = 'flex';
        saveActions.style.gap = '8px';

        const runSaveAction = async (button, action) => {
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Saving…';
            button.style.opacity = '0.75';
            try {
                await action();
                await refreshGraphs(true);
            } catch (error) {
                console.error('Graph desktop save action failed', error);
                this.notifications?.show?.(`Failed to save graph: ${error.message}`, 'error');
            } finally {
                button.disabled = false;
                button.textContent = originalText;
                button.style.opacity = '1';
            }
        };

        const saveToFileBtn = document.createElement('button');
        saveToFileBtn.textContent = '💾 Save to file';
        saveToFileBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(16,185,129,0.35), rgba(52,211,153,0.45));
            color: #f8fafc;
            border: none;
            padding: 10px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.25);
        `;
        saveToFileBtn.addEventListener('click', () => runSaveAction(saveToFileBtn, () => this.saveGraphFile()));

        const saveToNeoBtn = document.createElement('button');
        saveToNeoBtn.textContent = '🕸️ Save to Neo4j';
        saveToNeoBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(59,130,246,0.6), rgba(129,140,248,0.6));
            color: #f8fafc;
            border: none;
            padding: 10px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
        `;
        saveToNeoBtn.addEventListener('click', () => runSaveAction(saveToNeoBtn, () => this.saveGraphToNeo4j()));

        saveActions.appendChild(saveToFileBtn);
        saveActions.appendChild(saveToNeoBtn);

        const saveMenuWrapper = document.createElement('div');
        saveMenuWrapper.style.position = 'relative';
        saveMenuWrapper.style.display = 'inline-flex';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save Active';
        saveBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(16,185,129,0.35), rgba(52,211,153,0.45));
            color: #f8fafc;
            border: none;
            padding: 10px 14px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.25);
        `;

        const saveMenu = document.createElement('div');
        saveMenu.style.cssText = `
            position: absolute;
            top: 110%;
            right: 0;
            background: rgba(15,23,42,0.98);
            border: 1px solid rgba(148,163,184,0.25);
            border-radius: 12px;
            box-shadow: 0 20px 45px rgba(0,0,0,0.35);
            padding: 10px;
            display: none;
            flex-direction: column;
            gap: 8px;
            min-width: 210px;
            z-index: 10001;
        `;

        const hideSaveMenu = () => {
            saveMenu.style.display = 'none';
        };

        const showSaveMenu = () => {
            saveMenu.style.display = 'flex';
        };

        const toggleSaveMenu = event => {
            event?.stopPropagation?.();
            const isOpen = saveMenu.style.display === 'flex';
            if (isOpen) {
                hideSaveMenu();
            } else {
                showSaveMenu();
            }
        };

        saveBtn.addEventListener('click', toggleSaveMenu);

        const saveMenuOutsideHandler = event => {
            if (!saveMenuWrapper.contains(event.target)) {
                hideSaveMenu();
            }
        };
        document.addEventListener('click', saveMenuOutsideHandler);

        const saveMenuButton = (label, description, handler) => {
            const option = document.createElement('button');
            option.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
                border: 1px solid rgba(148,163,184,0.25);
                background: rgba(30,41,59,0.75);
                color: #e2e8f0;
                border-radius: 10px;
                padding: 10px 12px;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
            `;

            const titleLine = document.createElement('span');
            titleLine.textContent = label;
            titleLine.style.fontWeight = '700';
            titleLine.style.fontSize = '13px';

            const descLine = document.createElement('span');
            descLine.textContent = description;
            descLine.style.fontSize = '12px';
            descLine.style.opacity = '0.8';

            option.appendChild(titleLine);
            option.appendChild(descLine);

            option.addEventListener('mouseenter', () => {
                option.style.background = 'rgba(59,130,246,0.2)';
                option.style.borderColor = 'rgba(59,130,246,0.35)';
                option.style.transform = 'translateY(-1px)';
            });

            option.addEventListener('mouseleave', () => {
                option.style.background = 'rgba(30,41,59,0.75)';
                option.style.borderColor = 'rgba(148,163,184,0.25)';
                option.style.transform = 'none';
            });

            option.addEventListener('click', async event => {
                event.stopPropagation();
                hideSaveMenu();
                const originalText = titleLine.textContent;
                titleLine.textContent = 'Saving...';
                option.disabled = true;
                option.style.opacity = '0.7';
                try {
                    await handler();
                    await refreshGraphs(true);
                } catch (error) {
                    console.error('Graph desktop save action failed', error);
                    this.notifications?.show?.(`Failed to save graph: ${error.message}`, 'error');
                } finally {
                    option.disabled = false;
                    titleLine.textContent = originalText;
                    option.style.opacity = '1';
                }
            });

            return option;
        };

        saveMenu.appendChild(
            saveMenuButton('Save to file', 'Download the active graph as a .qut file', () => this.saveGraphFile())
        );

        saveMenu.appendChild(
            saveMenuButton(
                'Save to Neo4j',
                'Store the active graph in your Neo4j graph store',
                () => this.saveGraphToNeo4j()
            )
        );

        saveMenuWrapper.appendChild(saveBtn);
        saveMenuWrapper.appendChild(saveMenu);

        const searchWrap = document.createElement('div');
        searchWrap.style.display = 'flex';
        searchWrap.style.alignItems = 'center';
        searchWrap.style.gap = '6px';
        searchWrap.style.background = 'rgba(148,163,184,0.1)';
        searchWrap.style.border = '1px solid rgba(148,163,184,0.2)';
        searchWrap.style.borderRadius = '10px';
        searchWrap.style.padding = '8px 10px';

        const searchIcon = document.createElement('span');
        searchIcon.textContent = '🔍';
        searchIcon.style.opacity = '0.85';
        searchWrap.appendChild(searchIcon);

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search graphs...';
        searchInput.style.cssText = `
            background: transparent;
            border: none;
            color: #e2e8f0;
            outline: none;
            font-size: 14px;
            width: 200px;
        `;
        searchWrap.appendChild(searchInput);

        const viewToggleBtn = document.createElement('button');
        viewToggleBtn.textContent = '🔲 Tile View';
        viewToggleBtn.style.cssText = `
            background: rgba(148,163,184,0.12);
            color: #e2e8f0;
            border: 1px solid rgba(148,163,184,0.25);
            padding: 10px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
        `;

        const newGraphBtn = document.createElement('button');
        newGraphBtn.textContent = '🆕 New Graph';
        newGraphBtn.style.cssText = `
            background: linear-gradient(135deg, rgba(59,130,246,0.6), rgba(129,140,248,0.6));
            color: #f8fafc;
            border: none;
            padding: 10px 14px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(59, 130, 246, 0.25);
        `;

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '↻ Refresh';
        refreshBtn.style.cssText = `
            background: rgba(59,130,246,0.12);
            color: #cbd5f5;
            border: 1px solid rgba(99,102,241,0.25);
            padding: 10px 14px;
            border-radius: 10px;
            cursor: pointer;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.setAttribute('aria-label', 'Close graph desktop');
        closeBtn.style.cssText = `
            background: rgba(148, 163, 184, 0.15);
            color: #cbd5f5;
            border: none;
            padding: 10px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 700;
        `;

        headerActions.appendChild(viewToggleBtn);
        headerActions.appendChild(newGraphBtn);
        headerActions.appendChild(saveActions);
        headerActions.appendChild(refreshBtn);
        headerActions.appendChild(closeBtn);
        headerActions.appendChild(searchWrap);
        header.appendChild(titleGroup);
        header.appendChild(headerActions);

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 14px;
            width: 100%;
            flex: 1;
            overflow: auto;
            padding: 6px 2px;
        `;

        const searchEmptyState = document.createElement('div');
        searchEmptyState.textContent = 'No graphs match your search.';
        searchEmptyState.style.cssText = `
            display: none;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            background: rgba(30,41,59,0.55);
            border: 1px dashed rgba(148,163,184,0.35);
            border-radius: 12px;
            padding: 18px;
            font-size: 14px;
        `;

        const emptyState = document.createElement('div');
        emptyState.textContent = 'No graphs found. Save a graph to Neo4j or your workspace to see it here.';
        emptyState.style.cssText = `
            display: none;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            background: rgba(30,41,59,0.55);
            border: 1px dashed rgba(148,163,184,0.35);
            border-radius: 12px;
            padding: 18px;
            font-size: 14px;
        `;

        const content = document.createElement('div');
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.gap = '8px';
        content.style.flex = '1';
        content.style.minHeight = '0';
        content.appendChild(header);
        content.appendChild(grid);
        content.appendChild(searchEmptyState);
        content.appendChild(emptyState);
        desktop.appendChild(content);
        overlay.appendChild(desktop);

        const closeDesktop = () => {
            overlay.remove();
            document.removeEventListener('keydown', keyHandler);
            document.removeEventListener('click', saveMenuOutsideHandler);
        };

        const keyHandler = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDesktop();
            }
        };
        document.addEventListener('keydown', keyHandler);

        const setRefreshing = isRefreshing => {
            refreshBtn.disabled = isRefreshing;
            refreshBtn.style.opacity = isRefreshing ? '0.65' : '1';
            refreshBtn.textContent = isRefreshing ? 'Refreshing…' : '↻ Refresh';
        };

        const formatTimestamp = savedAt => this.formatSavedAt(savedAt);

        let searchTerm = '';
        let viewMode = 'grid';

        const updateViewToggle = () => {
            const isGrid = viewMode === 'grid';
            viewToggleBtn.textContent = isGrid ? '📋 List View' : '🔲 Tile View';
        };

        const renderGrid = () => {
            grid.innerHTML = '';
            const visibleGraphs = graphs.filter(graph => {
                if (!searchTerm.trim()) return true;
                const name = typeof graph.name === 'string' ? graph.name : '';
                return name.toLowerCase().includes(searchTerm.toLowerCase());
            });

            const hasGraphs = graphs.length > 0;
            emptyState.style.display = hasGraphs ? 'none' : 'flex';
            searchEmptyState.style.display = hasGraphs && visibleGraphs.length === 0 ? 'flex' : 'none';

            const renderListView = () => {
                grid.style.display = 'block';
                grid.style.padding = '0';

                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.fontSize = '13px';
                table.style.color = '#e2e8f0';

                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                headerRow.style.background = 'rgba(15, 23, 42, 0.55)';
                headerRow.style.position = 'sticky';
                headerRow.style.top = '0';
                headerRow.style.zIndex = '1';

                const headers = ['Graph', 'Source', 'Last updated', 'Actions'];
                headers.forEach((label, index) => {
                    const th = document.createElement('th');
                    th.textContent = label;
                    th.style.textAlign = 'left';
                    th.style.padding = '12px 14px';
                    th.style.fontWeight = '600';
                    if (index === headers.length - 1) {
                        th.style.textAlign = 'right';
                    }
                    headerRow.appendChild(th);
                });

                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');

                visibleGraphs.forEach(graph => {
                    const isLocalFile = graph.source === 'file';
                    const name = typeof graph.name === 'string' ? graph.name : 'Untitled graph';
                    const savedLabel = formatTimestamp(graph.savedAt);

                    const row = document.createElement('tr');
                    row.style.borderBottom = '1px solid rgba(148,163,184,0.2)';
                    row.style.cursor = 'pointer';
                    row.addEventListener('mouseenter', () => {
                        row.style.background = 'rgba(59,130,246,0.12)';
                    });
                    row.addEventListener('mouseleave', () => {
                        row.style.background = 'transparent';
                    });

                    const nameCell = document.createElement('td');
                    nameCell.style.padding = '12px 14px';
                    nameCell.style.fontWeight = '600';
                    nameCell.textContent = name;

                    const sourceCell = document.createElement('td');
                    sourceCell.style.padding = '12px 14px';
                    sourceCell.textContent = isLocalFile ? 'Local file' : 'Neo4j';
                    sourceCell.style.opacity = '0.8';

                    const timeCell = document.createElement('td');
                    timeCell.style.padding = '12px 14px';
                    timeCell.textContent = savedLabel ? `Updated ${savedLabel}` : 'No timestamp available';
                    timeCell.style.opacity = '0.8';

                    const actionsCell = document.createElement('td');
                    actionsCell.style.padding = '12px 14px';
                    actionsCell.style.textAlign = 'right';

                    const actionsWrap = document.createElement('div');
                    actionsWrap.style.display = 'inline-flex';
                    actionsWrap.style.gap = '8px';
                    actionsWrap.style.alignItems = 'center';

                    const baseIconButton = (label, titleText) => {
                        const btn = document.createElement('button');
                        btn.textContent = label;
                        btn.title = titleText;
                        btn.style.cssText = `
                            border: none;
                            background: rgba(148,163,184,0.18);
                            color: #e2e8f0;
                            padding: 6px 8px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: background 0.2s ease, transform 0.2s ease;
                        `;
                        btn.addEventListener('mouseenter', () => {
                            btn.style.background = 'rgba(96,165,250,0.25)';
                            btn.style.transform = 'translateY(-1px)';
                        });
                        btn.addEventListener('mouseleave', () => {
                            btn.style.background = 'rgba(148,163,184,0.18)';
                            btn.style.transform = 'none';
                        });
                        return btn;
                    };

                    const loadBtn = document.createElement('button');
                    loadBtn.textContent = graph.source === 'file' ? 'Open' : 'Load';
                    loadBtn.style.cssText = `
                        background: linear-gradient(135deg, rgba(52,211,153,0.65), rgba(59,130,246,0.65));
                        color: #0f172a;
                        border: none;
                        padding: 6px 10px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 700;
                    `;

                    const renameBtn = baseIconButton('✏️', 'Rename graph');
                    const deleteBtn = baseIconButton('🗑️', 'Delete graph');

                    if (graph.source === 'file') {
                        renameBtn.disabled = true;
                        renameBtn.title = 'Rename local graphs from your workspace.';
                        renameBtn.style.opacity = '0.6';
                        renameBtn.style.cursor = 'not-allowed';
                    }

                    const handleLoad = async () => {
                        if (graph.source === 'file') {
                            try {
                                const file = graph.file;
                                if (!file) {
                                    this.notifications?.show?.('Local file is unavailable. Reopen the desktop to refresh.', 'error');
                                    return;
                                }
                                await this.loadGraphFile(file);
                                closeDesktop();
                            } catch (error) {
                                console.error('Failed to load local graph file', error);
                                this.notifications?.show?.(`Failed to load local graph: ${error.message}`, 'error');
                            }
                            return;
                        }

                        const loaded = await this.loadGraphFromNeo4j({ graphName: name, context });
                        if (loaded) {
                            closeDesktop();
                        }
                    };

                    const handleDelete = async () => {
                        if (graph.source === 'file') {
                            const manager = window.WorkspaceManager;
                            if (!manager || typeof manager.removeFile !== 'function') {
                                this.notifications?.show?.('Delete local graphs directly from your workspace.', 'warning');
                                return;
                            }

                            const confirmed = window.confirm(`Delete "${name}" from your workspace? This cannot be undone.`);
                            if (!confirmed) {
                                this.notifications?.show?.('Graph deletion cancelled', 'info');
                                return;
                            }

                            deleteBtn.disabled = true;
                            deleteBtn.textContent = '…';
                            try {
                                await manager.removeFile(graph.path);
                                this.notifications?.show?.(`Deleted local graph "${name}"`, 'success');
                                await refreshGraphs(true);
                            } catch (error) {
                                console.error('Failed to delete local graph file', error);
                                this.notifications?.show?.(`Failed to delete local graph: ${error.message}`, 'error');
                            } finally {
                                deleteBtn.disabled = false;
                                deleteBtn.textContent = '🗑️';
                            }

                            return;
                        }

                        const confirmed = window.confirm(`Delete "${name}" from Neo4j? This cannot be undone.`);
                        if (!confirmed) {
                            this.notifications?.show?.('Graph deletion cancelled', 'info');
                            return;
                        }
                        deleteBtn.disabled = true;
                        deleteBtn.textContent = '…';
                        try {
                            await this.deleteGraphFromNeo4j(name, context);
                            this.notifications?.show?.(`Deleted graph "${name}"`, 'success');
                            await refreshGraphs(true);
                        } catch (error) {
                            console.error('Failed to delete graph', error);
                            this.notifications?.show?.(`Failed to delete graph: ${error.message}`, 'error');
                        } finally {
                            deleteBtn.disabled = false;
                            deleteBtn.textContent = '🗑️';
                        }
                    };

                    const handleRename = async () => {
                        if (graph.source === 'file') {
                            this.notifications?.show?.('Rename local graphs directly from your workspace.', 'warning');
                            return;
                        }

                        const nextName = window.prompt('Enter a new name for this graph:', name);
                        if (nextName === null) {
                            this.notifications?.show?.('Rename cancelled', 'info');
                            return;
                        }

                        const trimmed = nextName.trim();
                        if (!trimmed) {
                            this.notifications?.show?.('Graph name cannot be empty', 'warning');
                            return;
                        }

                        if (trimmed === name) {
                            this.notifications?.show?.('Graph name unchanged', 'info');
                            return;
                        }

                        const duplicate = graphs.some(entry => entry.name === trimmed && entry.source !== 'file');
                        if (duplicate) {
                            this.notifications?.show?.('A graph with that name already exists. Choose another name.', 'error');
                            return;
                        }

                        renameBtn.disabled = true;
                        renameBtn.textContent = '…';
                        try {
                            const apiBase = this.resolveNeo4jApiBase(context);
                            const response = await fetch(this.joinUrl(apiBase, `/neo4j/graph/${encodeURIComponent(name)}`), {
                                headers: context.headers
                            });

                            if (!response.ok) {
                                throw new Error(`Server responded with ${response.status}`);
                            }

                            const graphData = await response.json();
                            const normalizedName = trimmed.replace(/\s+/g, ' ').trim();
                            graphData.graphName = normalizedName;
                            this.normalizeGraphTitle(graphData, normalizedName);
                            if (!graphData.metadata || typeof graphData.metadata !== 'object') {
                                graphData.metadata = {};
                            }
                            graphData.metadata.name = normalizedName;
                            graphData.metadata.title = normalizedName;
                            this.ensureGraphSavedTimestamp(graphData, new Date());

                            const saveResponse = await fetch(this.joinUrl(apiBase, '/neo4j/graph'), {
                                method: 'POST',
                                headers: context.headers,
                                body: JSON.stringify(graphData)
                            });

                            if (!saveResponse.ok) {
                                throw new Error(`Rename failed with status ${saveResponse.status}`);
                            }

                            await this.deleteGraphFromNeo4j(name, context);
                            this.notifications?.show?.(`Renamed graph to "${normalizedName}"`, 'success');
                            await refreshGraphs(true);
                        } catch (error) {
                            console.error('Failed to rename Neo4j graph', error);
                            this.notifications?.show?.(`Failed to rename graph: ${error.message}`, 'error');
                        } finally {
                            renameBtn.disabled = false;
                            renameBtn.textContent = '✏️';
                        }
                    };

                    row.addEventListener('click', handleLoad);
                    loadBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleLoad();
                    });
                    deleteBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleDelete();
                    });
                    renameBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleRename();
                    });

                    actionsWrap.appendChild(loadBtn);
                    actionsWrap.appendChild(renameBtn);
                    actionsWrap.appendChild(deleteBtn);
                    actionsCell.appendChild(actionsWrap);

                    row.appendChild(nameCell);
                    row.appendChild(sourceCell);
                    row.appendChild(timeCell);
                    row.appendChild(actionsCell);
                    tbody.appendChild(row);
                });

                table.appendChild(tbody);
                grid.appendChild(table);
            };

            const renderTileView = () => {
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
                grid.style.gap = '14px';
                grid.style.padding = '6px 2px';
                visibleGraphs.forEach(graph => {
                    const isLocalFile = graph.source === 'file';
                    const sourceStyle = isLocalFile
                        ? {
                            backgroundTint: 'linear-gradient(160deg, rgba(34,197,94,0.08), rgba(16,185,129,0.06))',
                            border: 'rgba(74, 222, 128, 0.3)',
                            hoverBorder: 'rgba(74, 222, 128, 0.6)',
                            glow: '0 0 0 1px rgba(74, 222, 128, 0.15)',
                            hoverGlow: '0 18px 40px rgba(16,185,129,0.28)',
                            badgeBg: 'rgba(34,197,94,0.18)',
                            badgeColor: '#bbf7d0'
                        }
                        : {
                            backgroundTint: 'linear-gradient(160deg, rgba(59,130,246,0.08), rgba(99,102,241,0.06))',
                            border: 'rgba(96, 165, 250, 0.35)',
                            hoverBorder: 'rgba(59, 130, 246, 0.6)',
                            glow: '0 0 0 1px rgba(96, 165, 250, 0.18)',
                            hoverGlow: '0 18px 40px rgba(30,64,175,0.35)',
                            badgeBg: 'rgba(59,130,246,0.18)',
                            badgeColor: '#cbd5f5'
                        };

                    const card = document.createElement('div');
                    card.style.cssText = `
                        position: relative;
                        background: ${sourceStyle.backgroundTint}, linear-gradient(160deg, rgba(30,41,59,0.85), rgba(51,65,85,0.82));
                        border: 1px solid ${sourceStyle.border};
                        border-radius: 14px;
                        padding: 14px 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        cursor: pointer;
                        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                        box-shadow: 0 15px 35px rgba(0,0,0,0.25), ${sourceStyle.glow};
                    `;

                    card.addEventListener('mouseenter', () => {
                        card.style.transform = 'translateY(-2px)';
                        card.style.borderColor = sourceStyle.hoverBorder;
                        card.style.boxShadow = `0 18px 40px rgba(0,0,0,0.25), ${sourceStyle.hoverGlow}`;
                    });

                    card.addEventListener('mouseleave', () => {
                        card.style.transform = 'none';
                        card.style.borderColor = sourceStyle.border;
                        card.style.boxShadow = `0 15px 35px rgba(0,0,0,0.25), ${sourceStyle.glow}`;
                    });

                    const name = typeof graph.name === 'string' ? graph.name : 'Untitled graph';
                    const savedLabel = formatTimestamp(graph.savedAt);

                    const headerRow = document.createElement('div');
                    headerRow.style.display = 'flex';
                    headerRow.style.alignItems = 'flex-start';
                    headerRow.style.justifyContent = 'space-between';
                    headerRow.style.gap = '8px';

                    const nameBlock = document.createElement('div');
                    nameBlock.style.display = 'flex';
                    nameBlock.style.flexDirection = 'column';
                    nameBlock.style.gap = '4px';

                    const nameLabel = document.createElement('div');
                    nameLabel.textContent = name;
                    nameLabel.style.fontWeight = '700';
                    nameLabel.style.fontSize = '15px';
                    nameLabel.style.color = '#f8fafc';
                    nameBlock.appendChild(nameLabel);

                    const sourceTag = document.createElement('span');
                    sourceTag.textContent = isLocalFile ? 'Local file' : 'Neo4j';
                    sourceTag.style.cssText = `
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        background: ${sourceStyle.badgeBg};
                        color: ${sourceStyle.badgeColor};
                        padding: 4px 8px;
                        border-radius: 999px;
                        font-size: 11px;
                        width: fit-content;
                        letter-spacing: 0.01em;
                        border: 1px solid ${sourceStyle.border};
                    `;
                    nameBlock.appendChild(sourceTag);

                    const savedText = document.createElement('div');
                    savedText.textContent = savedLabel ? `Updated ${savedLabel}` : 'No timestamp available';
                    savedText.style.fontSize = '12px';
                    savedText.style.color = '#cbd5f5';
                    savedText.style.opacity = '0.8';
                    nameBlock.appendChild(savedText);

                    const hoverActions = document.createElement('div');
                    hoverActions.style.display = 'flex';
                    hoverActions.style.gap = '6px';
                    hoverActions.style.opacity = '0';
                    hoverActions.style.transition = 'opacity 0.2s ease';

                    card.addEventListener('mouseenter', () => {
                        hoverActions.style.opacity = '1';
                    });
                    card.addEventListener('mouseleave', () => {
                        hoverActions.style.opacity = '0';
                    });

                    const baseIconButton = (label, titleText) => {
                        const btn = document.createElement('button');
                        btn.textContent = label;
                        btn.title = titleText;
                        btn.style.cssText = `
                            border: none;
                            background: rgba(148,163,184,0.18);
                            color: #e2e8f0;
                            padding: 6px 8px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: background 0.2s ease, transform 0.2s ease;
                        `;
                        btn.addEventListener('mouseenter', () => {
                            btn.style.background = 'rgba(96,165,250,0.25)';
                            btn.style.transform = 'translateY(-1px)';
                        });
                        btn.addEventListener('mouseleave', () => {
                            btn.style.background = 'rgba(148,163,184,0.18)';
                            btn.style.transform = 'none';
                        });
                        return btn;
                    };

                    const renameBtn = baseIconButton('✏️', 'Rename graph');
                    const deleteBtn = baseIconButton('🗑️', 'Delete graph');

                    if (graph.source === 'file') {
                        renameBtn.disabled = true;
                        renameBtn.title = 'Rename local graphs from your workspace.';
                        renameBtn.style.opacity = '0.6';
                        renameBtn.style.cursor = 'not-allowed';
                    }
                    hoverActions.appendChild(renameBtn);
                    hoverActions.appendChild(deleteBtn);

                    headerRow.appendChild(nameBlock);
                    headerRow.appendChild(hoverActions);
                    card.appendChild(headerRow);

                    const actionRow = document.createElement('div');
                    actionRow.style.display = 'flex';
                    actionRow.style.justifyContent = 'space-between';
                    actionRow.style.alignItems = 'center';

                    const meta = document.createElement('div');
                    meta.style.display = 'flex';
                    meta.style.flexDirection = 'column';
                    meta.style.gap = '2px';
                    meta.style.fontSize = '12px';
                    meta.style.color = '#cbd5f5';
                    meta.innerHTML = `<span style="opacity:0.8;">Last updated</span><strong style="color:#e2e8f0;">${savedLabel || 'Unknown'}</strong>`;

                    const loadBtn = document.createElement('button');
                    loadBtn.textContent = graph.source === 'file' ? 'Open' : 'Load';
                    loadBtn.style.cssText = `
                        background: linear-gradient(135deg, rgba(52,211,153,0.65), rgba(59,130,246,0.65));
                        color: #0f172a;
                        border: none;
                        padding: 9px 14px;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: 700;
                        min-width: 84px;
                        box-shadow: 0 10px 25px rgba(16,185,129,0.35);
                        transition: transform 0.2s ease;
                    `;
                    loadBtn.addEventListener('mouseenter', () => {
                        loadBtn.style.transform = 'translateY(-1px)';
                    });
                    loadBtn.addEventListener('mouseleave', () => {
                        loadBtn.style.transform = 'none';
                    });

                    actionRow.appendChild(meta);
                    actionRow.appendChild(loadBtn);
                    card.appendChild(actionRow);

                    const handleLoad = async () => {
                        if (graph.source === 'file') {
                            try {
                                const file = graph.file;
                                if (!file) {
                                    this.notifications?.show?.('Local file is unavailable. Reopen the desktop to refresh.', 'error');
                                    return;
                                }
                                await this.loadGraphFile(file);
                                closeDesktop();
                            } catch (error) {
                                console.error('Failed to load local graph file', error);
                                this.notifications?.show?.(`Failed to load local graph: ${error.message}`, 'error');
                            }
                            return;
                        }

                        const loaded = await this.loadGraphFromNeo4j({ graphName: name, context });
                        if (loaded) {
                            closeDesktop();
                        }
                    };

                    const handleDelete = async () => {
                        if (graph.source === 'file') {
                            const manager = window.WorkspaceManager;
                            if (!manager || typeof manager.removeFile !== 'function') {
                                this.notifications?.show?.('Delete local graphs directly from your workspace.', 'warning');
                                return;
                            }

                            const confirmed = window.confirm(`Delete "${name}" from your workspace? This cannot be undone.`);
                            if (!confirmed) {
                                this.notifications?.show?.('Graph deletion cancelled', 'info');
                                return;
                            }

                            deleteBtn.disabled = true;
                            deleteBtn.textContent = '…';
                            try {
                                await manager.removeFile(graph.path);
                                this.notifications?.show?.(`Deleted local graph "${name}"`, 'success');
                                await refreshGraphs(true);
                            } catch (error) {
                                console.error('Failed to delete local graph file', error);
                                this.notifications?.show?.(`Failed to delete local graph: ${error.message}`, 'error');
                            } finally {
                                deleteBtn.disabled = false;
                                deleteBtn.textContent = '🗑️';
                            }

                            return;
                        }

                        const confirmed = window.confirm(`Delete "${name}" from Neo4j? This cannot be undone.`);
                        if (!confirmed) {
                            this.notifications?.show?.('Graph deletion cancelled', 'info');
                            return;
                        }
                        deleteBtn.disabled = true;
                        deleteBtn.textContent = '…';
                        try {
                            await this.deleteGraphFromNeo4j(name, context);
                            this.notifications?.show?.(`Deleted graph "${name}"`, 'success');
                            await refreshGraphs(true);
                        } catch (error) {
                            console.error('Failed to delete graph', error);
                            this.notifications?.show?.(`Failed to delete graph: ${error.message}`, 'error');
                        } finally {
                            deleteBtn.disabled = false;
                            deleteBtn.textContent = '🗑️';
                        }
                    };

                    const handleRename = async () => {
                        if (graph.source === 'file') {
                            this.notifications?.show?.('Rename local graphs directly from your workspace.', 'warning');
                            return;
                        }

                        const nextName = window.prompt('Enter a new name for this graph:', name);
                        if (nextName === null) {
                            this.notifications?.show?.('Rename cancelled', 'info');
                            return;
                        }

                        const trimmed = nextName.trim();
                        if (!trimmed) {
                            this.notifications?.show?.('Graph name cannot be empty', 'warning');
                            return;
                        }

                        if (trimmed === name) {
                            this.notifications?.show?.('Graph name unchanged', 'info');
                            return;
                        }

                        const duplicate = graphs.some(entry => entry.name === trimmed && entry.source !== 'file');
                        if (duplicate) {
                            this.notifications?.show?.('A graph with that name already exists. Choose another name.', 'error');
                            return;
                        }

                        renameBtn.disabled = true;
                        renameBtn.textContent = '…';
                        try {
                            const apiBase = this.resolveNeo4jApiBase(context);
                            const response = await fetch(this.joinUrl(apiBase, `/neo4j/graph/${encodeURIComponent(name)}`), {
                                headers: context.headers
                            });

                            if (!response.ok) {
                                throw new Error(`Server responded with ${response.status}`);
                            }

                            const graphData = await response.json();
                            const normalizedName = trimmed.replace(/\s+/g, ' ').trim();
                            graphData.graphName = normalizedName;
                            this.normalizeGraphTitle(graphData, normalizedName);
                            if (!graphData.metadata || typeof graphData.metadata !== 'object') {
                                graphData.metadata = {};
                            }
                            graphData.metadata.name = normalizedName;
                            graphData.metadata.title = normalizedName;
                            this.ensureGraphSavedTimestamp(graphData, new Date());

                            const saveResponse = await fetch(this.joinUrl(apiBase, '/neo4j/graph'), {
                                method: 'POST',
                                headers: context.headers,
                                body: JSON.stringify(graphData)
                            });

                            if (!saveResponse.ok) {
                                throw new Error(`Rename failed with status ${saveResponse.status}`);
                            }

                            await this.deleteGraphFromNeo4j(name, context);
                            this.notifications?.show?.(`Renamed graph to "${normalizedName}"`, 'success');
                            await refreshGraphs(true);
                        } catch (error) {
                            console.error('Failed to rename Neo4j graph', error);
                            this.notifications?.show?.(`Failed to rename graph: ${error.message}`, 'error');
                        } finally {
                            renameBtn.disabled = false;
                            renameBtn.textContent = '✏️';
                        }
                    };

                    card.addEventListener('click', handleLoad);
                    loadBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleLoad();
                    });
                    deleteBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleDelete();
                    });
                    renameBtn.addEventListener('click', event => {
                        event.stopPropagation();
                        handleRename();
                    });

                    grid.appendChild(card);
                });
            };

            if (viewMode === 'list') {
                renderListView();
            } else {
                renderTileView();
            }

            updateViewToggle();
        };

        searchInput.addEventListener('input', event => {
            searchTerm = event.target.value;
            renderGrid();
        });

        viewToggleBtn.addEventListener('click', () => {
            viewMode = viewMode === 'grid' ? 'list' : 'grid';
            renderGrid();
        });

        const refreshGraphs = async (preserve = false) => {
            setRefreshing(true);
            try {
                const refreshed = await this.fetchNeo4jGraphs(context);
                graphs = (refreshed.graphs || []).map(entry => ({ ...entry, source: 'neo4j' }));

                try {
                    localGraphs = await this.fetchLocalGraphFiles();
                } catch (error) {
                    console.warn('Unable to refresh local graph files', error);
                }

                rebuildGraphList();
                searchTerm = searchInput.value;
                renderGrid();
                if (preserve && graphs.length === 0) {
                    emptyState.textContent = 'No graphs remain in Neo4j or your workspace.';
                }
            } catch (error) {
                console.error('Failed to refresh Neo4j graphs', error);
                this.notifications?.show?.(`Failed to refresh Neo4j graphs: ${error.message}`, 'error');
            } finally {
                setRefreshing(false);
            }
        };

        newGraphBtn.addEventListener('click', () => {
            closeDesktop();
            this.createNewGraph();
        });

        refreshBtn.addEventListener('click', () => refreshGraphs(false));
        closeBtn.addEventListener('click', closeDesktop);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeDesktop();
            }
        });

        renderGrid();
        updateViewToggle();
        document.body.appendChild(overlay);
        return true;
    }

    /**
     * PUBLIC INTERFACE: Open Neo4j graph store management dialog
     */
    async openGraphStoreDialog() {
        if (!this.ensureNeo4jReady('manage graphs in the Neo4j store')) {
            return false;
        }

        const context = this.getNeo4jRequestContext();
        let graphs = [];
        try {
            const result = await this.fetchNeo4jGraphs(context);
            graphs = result.graphs;
            if (result.apiBase) {
                context.apiBase = result.apiBase;
            }
        } catch (error) {
            console.error('Failed to fetch graphs from Neo4j', error);
            this.notifications?.show?.(`Failed to fetch graphs from Neo4j: ${error.message}`, 'error');
            return false;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(15, 23, 42, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: rgba(17, 24, 39, 0.95);
            color: #f8fafc;
            padding: 24px;
            border-radius: 16px;
            max-width: 940px;
            width: min(95vw, 940px);
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
        `;

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '12px';

        const title = document.createElement('h2');
        title.textContent = 'Neo4j Graph Store';
        title.style.fontSize = '18px';
        title.style.margin = '0';
        title.style.fontWeight = '600';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = '#cbd5f5';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';

        header.appendChild(title);
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const description = document.createElement('p');
        description.textContent = 'Save the current graph with a custom name, or load and manage previously saved graphs.';
        description.style.margin = '0 0 12px';
        description.style.color = '#cbd5f5';
        description.style.fontSize = '14px';
        description.style.lineHeight = '1.5';
        dialog.appendChild(description);

        let listControl;
        const existingNamesSet = () => new Set((graphs || []).map(graph => graph.name));

        const baseButtonStyles = btn => {
            btn.style.padding = '10px 16px';
            btn.style.borderRadius = '8px';
            btn.style.border = 'none';
            btn.style.cursor = 'pointer';
            btn.style.fontSize = '14px';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.transition = 'background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease';
        };

        const applyPrimaryButtonStyles = btn => {
            baseButtonStyles(btn);
            btn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.55), rgba(129, 140, 248, 0.55))';
            btn.style.color = '#f8fafc';
            btn.style.boxShadow = '0 10px 15px -3px rgba(59, 130, 246, 0.25)';
            btn.addEventListener('mouseenter', () => {
                if (btn.disabled) return;
                btn.style.transform = 'translateY(-1px) scale(1.01)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'none';
            });
        };

        const applyGhostButtonStyles = btn => {
            baseButtonStyles(btn);
            btn.style.background = 'rgba(59, 130, 246, 0.12)';
            btn.style.color = '#f8fafc';
            btn.addEventListener('mouseenter', () => {
                if (btn.disabled) return;
                btn.style.transform = 'translateY(-1px)';
                btn.style.background = 'rgba(59, 130, 246, 0.22)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'none';
                btn.style.background = 'rgba(59, 130, 246, 0.12)';
            });
        };

        const nameWrapper = document.createElement('div');
        nameWrapper.style.display = 'flex';
        nameWrapper.style.flexDirection = 'column';
        nameWrapper.style.gap = '6px';
        nameWrapper.style.marginTop = '16px';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Graph name';
        nameLabel.style.fontSize = '13px';
        nameLabel.style.color = '#cbd5f5';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Enter a name for this graph';
        nameInput.style.padding = '10px 12px';
        nameInput.style.borderRadius = '8px';
        nameInput.style.border = '1px solid rgba(148, 163, 184, 0.35)';
        nameInput.style.background = 'rgba(15, 23, 42, 0.6)';
        nameInput.style.color = '#f8fafc';
        nameInput.style.fontSize = '14px';
        nameInput.style.outline = 'none';
        nameInput.style.transition = 'border-color 0.2s ease, box-shadow 0.2s ease';

        nameInput.addEventListener('focus', () => {
            nameInput.style.borderColor = 'rgba(99, 102, 241, 0.65)';
            nameInput.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.2)';
        });
        nameInput.addEventListener('blur', () => {
            nameInput.style.borderColor = 'rgba(148, 163, 184, 0.35)';
            nameInput.style.boxShadow = 'none';
        });

        nameInput.addEventListener('input', () => {
            hideDuplicateAction();
            updateButtonState();
        });

        nameWrapper.appendChild(nameLabel);
        nameWrapper.appendChild(nameInput);
        dialog.appendChild(nameWrapper);

        const primaryButtonRow = document.createElement('div');
        primaryButtonRow.style.display = 'flex';
        primaryButtonRow.style.gap = '10px';
        primaryButtonRow.style.marginTop = '16px';
        primaryButtonRow.style.flexWrap = 'wrap';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        applyPrimaryButtonStyles(saveBtn);

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load selected';
        applyPrimaryButtonStyles(loadBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        applyGhostButtonStyles(cancelBtn);

        primaryButtonRow.appendChild(saveBtn);
        primaryButtonRow.appendChild(loadBtn);
        primaryButtonRow.appendChild(cancelBtn);
        dialog.appendChild(primaryButtonRow);

        const duplicateActionRow = document.createElement('div');
        duplicateActionRow.style.display = 'none';
        duplicateActionRow.style.flexDirection = 'column';
        duplicateActionRow.style.gap = '8px';
        duplicateActionRow.style.marginTop = '12px';
        duplicateActionRow.style.padding = '12px';
        duplicateActionRow.style.background = 'rgba(248, 113, 113, 0.08)';
        duplicateActionRow.style.border = '1px solid rgba(239, 68, 68, 0.25)';
        duplicateActionRow.style.borderRadius = '10px';

        const duplicateMessage = document.createElement('div');
        duplicateMessage.style.fontSize = '13px';
        duplicateMessage.style.color = '#fecaca';

        const duplicateButtons = document.createElement('div');
        duplicateButtons.style.display = 'flex';
        duplicateButtons.style.gap = '10px';
        duplicateButtons.style.flexWrap = 'wrap';

        const replaceExistingBtn = document.createElement('button');
        replaceExistingBtn.textContent = 'Replace existing';
        applyGhostButtonStyles(replaceExistingBtn);

        const saveVersionBtn = document.createElement('button');
        saveVersionBtn.textContent = 'Save as new version';
        applyGhostButtonStyles(saveVersionBtn);

        duplicateButtons.appendChild(replaceExistingBtn);
        duplicateButtons.appendChild(saveVersionBtn);
        duplicateActionRow.appendChild(duplicateMessage);
        duplicateActionRow.appendChild(duplicateButtons);
        dialog.appendChild(duplicateActionRow);

        const deleteRow = document.createElement('div');
        deleteRow.style.display = 'flex';
        deleteRow.style.justifyContent = 'flex-end';
        deleteRow.style.marginTop = '24px';

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete selected';
        deleteBtn.style.background = '#991b1b';
        deleteBtn.style.color = '#fef2f2';
        deleteBtn.style.padding = '8px 12px';
        deleteBtn.style.borderRadius = '999px';
        deleteBtn.style.border = 'none';
        deleteBtn.style.fontSize = '13px';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.opacity = '0.95';
        deleteBtn.style.transition = 'background 0.2s ease, transform 0.2s ease';
        deleteBtn.addEventListener('mouseenter', () => {
            if (deleteBtn.disabled) return;
            deleteBtn.style.transform = 'translateY(-1px)';
            deleteBtn.style.background = '#b91c1c';
        });
        deleteBtn.addEventListener('mouseleave', () => {
            deleteBtn.style.transform = 'none';
            deleteBtn.style.background = '#991b1b';
        });

        deleteRow.appendChild(deleteBtn);
        dialog.appendChild(deleteRow);

        const hideDuplicateAction = () => {
            duplicateActionRow.style.display = 'none';
            delete duplicateActionRow.dataset.baseName;
        };

        const updateButtonState = selectedName => {
            const hasSelection = Boolean(
                typeof selectedName === 'undefined' ? listControl?.getSelected?.() : selectedName
            );
            const hasGraphs = listControl ? listControl.getItems().length > 0 : (graphs?.length || 0) > 0;
            const currentName = nameInput.value.trim();

            loadBtn.disabled = !hasSelection;
            loadBtn.style.opacity = loadBtn.disabled ? '0.6' : '1';

            deleteBtn.disabled = !hasSelection;
            deleteBtn.style.opacity = deleteBtn.disabled ? '0.6' : '1';
            deleteBtn.style.cursor = deleteBtn.disabled ? 'not-allowed' : 'pointer';

            const canSave = Boolean(this.cy) && Boolean(currentName);
            saveBtn.disabled = !canSave;
            saveBtn.style.opacity = saveBtn.disabled ? '0.6' : '1';

            cancelBtn.disabled = false;

            if (!hasGraphs) {
                loadBtn.disabled = true;
                deleteBtn.disabled = true;
            }
        };

        let listControlResult;
        let listControlContainer = null;
        try {
            listControlResult = this.buildNeo4jGraphList(graphs, {
            onSelectChange: selectedName => {
                if (selectedName) {
                    nameInput.value = selectedName;
                }
                hideDuplicateAction();
                updateButtonState(selectedName);
            },
            onConfirm: name => handleLoad(name)
            });
            listControlContainer = listControlResult?.container || null;
        } catch (error) {
            console.error('Failed to build Neo4j graph list control', error);
        }

        if (!listControlResult || !listControlContainer) {
            console.error('Neo4j graph list control is missing its container element.', listControlResult);
            this.notifications?.show?.(
                'Unable to display the Neo4j graph list. Please reload and try again.',
                'error'
            );
            return false;
        }

        listControl = listControlResult;
        dialog.insertBefore(listControlContainer, nameWrapper);

        const showDuplicateAction = baseName => {
            duplicateMessage.textContent = `A graph named "${baseName}" already exists. Choose how to continue.`;
            duplicateActionRow.dataset.baseName = baseName;
            duplicateActionRow.style.display = 'flex';
        };
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const closeDialog = () => {
            if (overlay.parentElement) {
                overlay.parentElement.removeChild(overlay);
            }
            document.removeEventListener('keydown', keyHandler);
        };

        const keyHandler = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDialog();
            }
        };

        document.addEventListener('keydown', keyHandler);

        const refreshGraphList = async preserveSelection => {
            try {
                const refreshed = await this.fetchNeo4jGraphs(context);
                graphs = refreshed.graphs;
                listControl.setGraphs(graphs, preserveSelection);
            } catch (error) {
                console.error('Failed to refresh Neo4j graphs', error);
                this.notifications?.show?.(`Failed to refresh Neo4j graphs: ${error.message}`, 'error');
            } finally {
                updateButtonState();
            }
        };

        const getDefaultNameSuggestion = () => {
            let baseName = this.getSuggestedGraphBaseName();
            if (typeof baseName === 'string') {
                baseName = baseName.trim();
            }
            if (!baseName) {
                baseName = 'quantickle-graph';
            }
            const existingNames = existingNamesSet();
            if (!existingNames.has(baseName)) {
                return baseName;
            }

            let counter = 2;
            let suggestion = `${baseName}-v${counter}`;
            while (existingNames.has(suggestion)) {
                counter += 1;
                suggestion = `${baseName}-v${counter}`;
            }
            return suggestion;
        };

        const getNextVersionName = baseName => {
            const existing = existingNamesSet();
            if (!existing.has(baseName)) {
                return baseName;
            }

            let counter = 2;
            let candidate = `${baseName}-v${counter}`;
            while (existing.has(candidate)) {
                counter += 1;
                candidate = `${baseName}-v${counter}`;
            }
            return candidate;
        };

        const performSave = async (targetName, options = {}) => {
            const originalLabel = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            try {
                const saved = await this.saveGraphToNeo4j({
                    targetName,
                    ...options
                });
                if (saved) {
                    await refreshGraphList(false);
                    listControl.setSelected(targetName);
                    nameInput.value = targetName;
                    hideDuplicateAction();
                }
            } finally {
                saveBtn.textContent = originalLabel;
                updateButtonState();
            }
        };

        const handleSave = async () => {
            const trimmed = nameInput.value.trim();
            if (!trimmed) {
                this.notifications?.show?.('Graph name cannot be empty', 'warning');
                return;
            }

            const existingNames = existingNamesSet();
            if (existingNames.has(trimmed)) {
                showDuplicateAction(trimmed);
                updateButtonState();
                return;
            }

            await performSave(trimmed, { disallowOverwrite: true });
        };

        const handleLoad = async name => {
            const target = name || listControl.getSelected();
            if (!target) {
                this.notifications?.show?.('Select a graph to load.', 'warning');
                return;
            }

            const loaded = await this.loadGraphFromNeo4j({ graphName: target, context });
            if (loaded) {
                closeDialog();
            }
        };

        const handleDelete = async () => {
            const target = listControl.getSelected();
            if (!target) {
                this.notifications?.show?.('Select a graph to delete.', 'warning');
                return;
            }

            const confirmDelete = window.confirm(`Delete "${target}" from Neo4j? This action cannot be undone.`);
            if (!confirmDelete) {
                this.notifications?.show?.('Graph deletion cancelled', 'info');
                return;
            }

            const originalLabel = deleteBtn.textContent;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
            deleteBtn.style.opacity = '0.6';
            deleteBtn.style.cursor = 'not-allowed';
            this.notifications?.show?.(`Deleting graph "${target}" from Neo4j...`, 'info');
            try {
                await this.deleteGraphFromNeo4j(target, context);
                this.notifications?.show?.(`Deleted graph "${target}" from Neo4j`, 'success');
                await refreshGraphList(false);
            } catch (error) {
                console.error('Failed to delete Neo4j graph', error);
                this.notifications?.show?.(`Failed to delete graph: ${error.message}`, 'error');
            } finally {
                deleteBtn.textContent = originalLabel;
                deleteBtn.disabled = false;
                updateButtonState();
            }
        };

        const defaultSuggestion = getDefaultNameSuggestion();
        nameInput.value = defaultSuggestion;
        listControl.setSelected(defaultSuggestion);

        saveBtn.addEventListener('click', handleSave);
        replaceExistingBtn.addEventListener('click', async () => {
            const baseName = duplicateActionRow.dataset.baseName;
            if (!baseName) {
                hideDuplicateAction();
                return;
            }
            await performSave(baseName, {
                forceOverwrite: true,
                successMessage: `Replaced graph "${baseName}" in Neo4j`
            });
        });

        saveVersionBtn.addEventListener('click', async () => {
            const baseName = duplicateActionRow.dataset.baseName;
            if (!baseName) {
                hideDuplicateAction();
                return;
            }
            const nextName = getNextVersionName(baseName);
            nameInput.value = nextName;
            await performSave(nextName, { disallowOverwrite: true });
        });

        loadBtn.addEventListener('click', () => handleLoad());
        deleteBtn.addEventListener('click', handleDelete);
        cancelBtn.addEventListener('click', closeDialog);
        closeBtn.addEventListener('click', closeDialog);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeDialog();
            }
        });

        updateButtonState();

        listControl.focus();
        return true;
    }

    /**
     * PUBLIC INTERFACE: Search Neo4j graph store for existing graphs
     */
    async searchGraphStore() {
        if (!this.ensureNeo4jReady('search the Neo4j graph store')) {
            return;
        }

        const hasSearchCapability =
            window.GraphRenderer && typeof window.GraphRenderer.checkNeo4jForExistingNodes === 'function';

        if (!hasSearchCapability) {
            this.notifications?.show?.('Neo4j search not available. Review the setup guide for integration steps.', 'warning');
            this.showNeo4jSetupGuide();
            return;
        }

        try {
            const input = window.prompt('Enter node labels to search (comma-separated, leave blank for all labels):', '');
            if (input === null) {
                this.notifications?.show?.('Neo4j search cancelled', 'info');
                return;
            }

            const labels = input
                .split(',')
                .map(label => label.trim())
                .filter(label => label.length > 0);

            await window.GraphRenderer.checkNeo4jForExistingNodes(labels.length ? labels : null);
        } catch (error) {
            console.error('Neo4j search failed:', error);
            this.notifications?.show?.(`Neo4j search failed: ${error.message}`, 'error');
        }
    }

    /**
     * PUBLIC INTERFACE: Save current graph to Neo4j database
     */
    async saveGraphToNeo4j(options = {}) {
        if (!this.ensureNeo4jReady('save graphs to Neo4j')) {
            return false;
        }

        if (!this.cy) {
            this.notifications.show('No graph data to save', 'warning');
            return false;
        }

        const {
            targetName,
            forceOverwrite = false,
            disallowOverwrite = false,
            progressMessage = null,
            successMessage = null
        } = options || {};

        try {
            const extension = this.config?.fileExtension || '';
            let resolvedName = (typeof targetName === 'string' && targetName.trim())
                ? targetName.trim()
                : null;

            if (!resolvedName) {
                const suggested = this.getSuggestedGraphBaseName();
                const { status, name } = this.requestGraphName({
                    defaultName: suggested,
                    message: 'Enter a name for this graph:'
                });

                if (status === 'cancelled') {
                    this.notifications?.show?.('Graph save cancelled', 'info');
                    return false;
                }

                if (status !== 'ok' || !name) {
                    return false;
                }

                resolvedName = name;
            }

            if (extension && resolvedName.toLowerCase().endsWith(extension.toLowerCase())) {
                resolvedName = resolvedName.slice(0, -extension.length);
            }

            resolvedName = resolvedName.replace(/\s+/g, ' ').trim();
            if (!resolvedName) {
                this.notifications?.show?.('Graph name cannot be empty', 'warning');
                return false;
            }

            const finalTitle = this.synchronizeGraphTitleState(resolvedName, { source: 'neo4j' }) || resolvedName;

            const graphData = this.exportCurrentGraph();
            this.normalizeGraphTitle(graphData, finalTitle);
            this.ensureGraphSavedTimestamp(graphData, new Date());
            const context = this.getNeo4jRequestContext();
            context.apiBase = this.resolveNeo4jApiBase(context);
            if (progressMessage) {
                this.notifications?.show?.(progressMessage, 'info');
            }

            let duplicateExists = false;
            if (!forceOverwrite || disallowOverwrite) {
                try {
                    const { graphs } = await this.fetchNeo4jGraphs(context);
                    duplicateExists = graphs.some(graph => graph.name === graphData.graphName);
                } catch (err) {
                    console.error('Neo4j list fetch failed:', err);
                    if (disallowOverwrite) {
                        this.notifications?.show?.('Unable to verify existing graphs. Try again later.', 'error');
                        return false;
                    }
                }
            }

            if (duplicateExists) {
                if (disallowOverwrite) {
                    this.notifications?.show?.(
                        `A graph named "${graphData.graphName}" already exists. Choose a different name.`,
                        'error'
                    );
                    return false;
                }

                if (!forceOverwrite) {
                    const proceed = window.confirm(
                        `A graph named "${graphData.graphName}" already exists in Neo4j. Overwrite?`
                    );
                    if (!proceed) {
                        this.notifications?.show?.('Graph save cancelled', 'info');
                        return false;
                    }
                }
            }

            const apiBase = this.resolveNeo4jApiBase(context);
            const response = await fetch(this.joinUrl(apiBase, '/neo4j/graph'), {
                method: 'POST',
                headers: context.headers,
                body: JSON.stringify(graphData)
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }

            const finalSuccessMessage = successMessage || 'Graph saved to Neo4j';
            this.notifications?.show?.(finalSuccessMessage, 'success');

            if (window.GraphRenderer && typeof window.GraphRenderer.handleActiveGraphSaved === 'function') {
                try {
                    window.GraphRenderer.handleActiveGraphSaved({
                        source: 'neo4j',
                        key: graphData.graphName,
                        graphName: graphData.graphName,
                        title: finalTitle,
                        graphData
                    });
                } catch (error) {
                    console.warn('Unable to update origin node with saved Neo4j reference', error);
                }
            }
            return true;
        } catch (error) {
            console.error('Neo4j save failed:', error);
            this.notifications?.show?.(`Failed to save graph to Neo4j: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * PUBLIC INTERFACE: Load graph from Neo4j database
     */
    async loadGraphFromNeo4j(options = {}) {
        if (!this.ensureNeo4jReady('load graphs from Neo4j')) {
            return false;
        }

        if (!this.cy) {
            this.notifications.show('No graph instance available', 'warning');
            return false;
        }

        if (this.cy && typeof this.cy.elements === 'function' && this.cy.elements().length > 0) {
            const proceed = window.confirm('Opening a new graph will replace the current graph. Continue?');
            if (!proceed) {
                this.notifications?.show?.('Graph load cancelled', 'info');
                return false;
            }
        }

        const { graphName, context } = options || {};
        const ctx = context || this.getNeo4jRequestContext();
        const apiBase = this.resolveNeo4jApiBase(ctx);
        if (!ctx.apiBase) {
            ctx.apiBase = apiBase;
        }

        const dm = window.DataManager || null;
        try {
            if (dm) dm.isLoading = true;

            let targetName = typeof graphName === 'string' && graphName.trim() ? graphName.trim() : '';
            if (!targetName) {
                this.notifications.show('Fetching graphs from Neo4j...', 'info');
                const { graphs } = await this.fetchNeo4jGraphs(ctx);
                if (!graphs.length) {
                    this.notifications.show('No graphs found in Neo4j', 'warning');
                    return false;
                }

                const choice = await this.showNeo4jGraphSelection(graphs, { confirmLabel: 'Load' });
                if (!choice) {
                    this.notifications?.show?.('Graph load cancelled', 'info');
                    return false;
                }
                targetName = choice;
            } else {
                this.notifications.show(`Loading graph ${targetName} from Neo4j...`, 'info');
            }

            const dataResp = await fetch(this.joinUrl(apiBase, `/neo4j/graph/${encodeURIComponent(targetName)}`), {
                headers: ctx.headers
            });
            if (!dataResp.ok) {
                throw new Error(`Server responded with ${dataResp.status}`);
            }
            const rawGraphData = await dataResp.json();
            const graphData = this.prepareGraphData(rawGraphData) || rawGraphData;

            this.normalizeGraphTitle(graphData, targetName);

            this.ensureGraphSavedTimestamp(graphData);

            await this.prepareDomainsForGraph(graphData);

            this.applyGraphData(graphData, { selectImportedNodes: false });
            this.applyGraphAreaSettingsFromSource(graphData, rawGraphData);
            this.currentFile = { name: targetName, type: 'neo4j', lastModified: new Date(), size: 0 };
            this.synchronizeGraphTitleState(targetName, { source: 'neo4j' });
            this.notifications.show(`Loaded graph ${targetName} from Neo4j`, 'success');
            return true;
        } catch (error) {
            console.error('Neo4j load failed:', error);
            this.notifications.show(`Failed to load graph from Neo4j: ${error.message}`, 'error');
            return false;
        } finally {
            if (dm) dm.isLoading = false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Load .qut graph file
     * @param {File} file - QUT file to load
     */
    async loadGraphFile(file) {
        if (!this.validateFile(file, 'qut')) {
            return;
        }

        if (!this.confirmGraphOverwrite('Opening a new graph')) {
            return;
        }

        const dm = window.DataManager || null;
        try {
            this.notifications.show('Loading graph file...', 'info');
            if (dm) dm.isLoading = true;

            const text = await this.readFileAsText(file);
            const rawData = JSON.parse(text);

            if (this.containsExternalResources(rawData)) {
                const allow = await this.showExternalResourcePrompt();
                if (!allow) {
                    this.stripExternalResources(rawData);
                }
            }

            // Normalize legacy Cytoscape-style QUT files where node/edge data is nested
            const graphData = this.prepareGraphData(rawData);


            if (this.validateGraphData(graphData)) {
                this.normalizeGraphTitle(graphData, file.name);
                await this.prepareDomainsForGraph(graphData);

                this.applyGraphData(graphData, { selectImportedNodes: false });
                this.applyGraphAreaSettingsFromSource(graphData, rawData);

                this.currentFile = {
                    name: file.name,
                    type: 'qut',
                    lastModified: new Date(file.lastModified),
                    size: file.size
                };

                if (dm) {
                    dm.isLoading = false;
                }

                this.synchronizeGraphTitleState(file.name, { source: 'file', ensureExtension: true });

                this.notifications.show(`Loaded graph: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`, 'success');
            } else {
                this.notifications.show('Invalid graph file format', 'error');
            }
        } catch (error) {
            console.error('Graph loading failed:', error);
            this.notifications.show(`Failed to load graph: ${error.message}`, 'error');
        } finally {
            if (dm) dm.isLoading = false;
        }
    }
    
    /**
     * PUBLIC INTERFACE: Load sample/example data
     */
    async loadSampleData() {
        if (!this.confirmGraphOverwrite('Loading a sample graph')) {
            return;
        }
        const dm = window.DataManager || null;
        if (dm) dm.isLoading = true;
        const sampleData = this.generateSampleGraph();
        this.normalizeGraphTitle(sampleData, 'sample-graph');
        await this.prepareDomainsForGraph(sampleData);
        this.applyGraphData(sampleData, { selectImportedNodes: false });
        this.applyGraphAreaSettingsFromSource(sampleData);

        this.currentFile = {
            name: 'sample-graph',
            type: 'sample',
            lastModified: new Date(),
            size: 0
        };

        if (dm) {
            dm.isLoading = false;
        }

        this.synchronizeGraphTitleState('sample-graph', { source: 'sample' });

        this.notifications.show(`Loaded sample graph: ${sampleData.nodes.length} nodes, ${sampleData.edges.length} edges`, 'success');
    }

    /**
     * PUBLIC INTERFACE: Show example graph loader dialog
     */
    async openExamplesDialog() {
        await this.showExamplesDialog();
    }

    async showExamplesDialog() {
        try {
            const { apiBase } = this.getServerBasePaths();
            const response = await fetch(this.joinUrl(apiBase, 'examples'), { cache: 'no-store' });

            if (!response.ok) {
                throw new Error('Unable to fetch example list');
            }

            const payload = await response.json();
            const examples = Array.isArray(payload.examples) ? payload.examples : [];

            if (!examples.length) {
                this.notifications.show('No example graphs available', 'warning');
                return;
            }

            this.renderExamplesModal(examples);
        } catch (error) {
            console.error('Failed to load example list', error);
            this.notifications.show(`Failed to load examples: ${error.message}`, 'error');
        }
    }

    renderExamplesModal(examples) {
        this.hideExamplesModal();

        const modal = document.createElement('div');
        modal.id = 'example-graph-modal';
        modal.className = 'modal';
        modal.style.display = 'block';

        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.hideExamplesModal();
            }
        });

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '420px';
        content.style.background = 'rgba(17, 24, 39, 0.95)';
        content.style.color = '#f9fafb';
        content.style.border = '1px solid rgba(148, 163, 184, 0.15)';
        content.style.borderRadius = '12px';
        content.style.boxShadow = '0 24px 48px rgba(15, 23, 42, 0.45)';
        content.style.backdropFilter = 'blur(6px)';
        content.style.padding = '24px';
        content.style.margin = '10% auto';

        const header = document.createElement('div');
        header.className = 'modal-header';
        header.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(139, 92, 246, 0.2))';
        header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.15)';
        header.style.margin = '-24px -24px 16px';
        header.style.padding = '20px 24px';

        const title = document.createElement('h2');
        title.textContent = 'Load Example Graph';
        title.style.color = '#f1f5f9';
        title.style.fontSize = '18px';
        title.style.fontWeight = '600';
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('role', 'button');
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.addEventListener('click', () => this.hideExamplesModal());
        closeBtn.style.color = '#e2e8f0';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.padding = '4px 8px';
        closeBtn.style.borderRadius = '6px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.transition = 'background 0.2s ease, color 0.2s ease';
        const highlightClose = () => {
            closeBtn.style.background = 'rgba(59, 130, 246, 0.25)';
            closeBtn.style.color = '#f8fafc';
        };
        const resetClose = () => {
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = '#e2e8f0';
        };
        closeBtn.addEventListener('mouseenter', highlightClose);
        closeBtn.addEventListener('mouseleave', resetClose);
        closeBtn.addEventListener('focus', highlightClose);
        closeBtn.addEventListener('blur', resetClose);

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.margin = '0 -4px';

        const intro = document.createElement('p');
        intro.textContent = 'Select an example graph to load:';
        intro.style.color = '#cbd5f5';
        intro.style.fontSize = '14px';
        intro.style.marginBottom = '12px';
        body.appendChild(intro);

        const list = document.createElement('div');
        list.className = 'example-list';

        examples.forEach(example => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'example-graph-option';

            const label = document.createElement('span');
            label.textContent = example.label || this.formatExampleLabel(example.filename || example.name || 'example');

            const meta = document.createElement('span');
            meta.className = 'example-meta';
            const filename = example.filename || `${example.name}.qut`;
            const sizeText = typeof example.size === 'number' && example.size > 0 ? this.formatFileSize(example.size) : '';
            meta.textContent = sizeText ? `${filename} · ${sizeText}` : filename;

            button.appendChild(label);
            button.appendChild(meta);

            button.addEventListener('click', () => this.loadExampleGraph(example));

            list.appendChild(button);
        });

        body.appendChild(list);

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        document.body.appendChild(modal);
        this.exampleModal = modal;

        this._boundExampleKeyHandler = (event) => {
            if (event.key === 'Escape') {
                this.hideExamplesModal();
            }
        };
        document.addEventListener('keydown', this._boundExampleKeyHandler);

        // Focus first button for accessibility
        const firstButton = list.querySelector('button');
        if (firstButton) {
            firstButton.focus({ preventScroll: true });
        }
    }

    hideExamplesModal() {
        if (this.exampleModal && this.exampleModal.parentNode) {
            this.exampleModal.parentNode.removeChild(this.exampleModal);
        }
        this.exampleModal = null;

        if (this._boundExampleKeyHandler) {
            document.removeEventListener('keydown', this._boundExampleKeyHandler);
            this._boundExampleKeyHandler = null;
        }
    }

    async loadExampleGraph(example) {
        if (!this.confirmGraphOverwrite('Loading an example graph')) {
            return;
        }

        this.hideExamplesModal();

        const dm = window.DataManager || null;
        if (dm) dm.isLoading = true;

        const filename = example && example.filename ? example.filename : `${example.name}.qut`;
        const label = example && (example.label || example.name) ? (example.label || example.name) : this.formatExampleLabel(filename);
        const { serverBase } = this.getServerBasePaths();
        const rawUrl = example && example.url ? example.url : `/assets/examples/${encodeURIComponent(filename)}`;
        const url = this.normalizeExampleUrl(rawUrl, serverBase);


        try {
            this.notifications.show(`Loading example: ${label}`, 'info');

            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Unable to load ${filename}`);
            }

            const text = await response.text();
            let graphData;
            try {
                graphData = JSON.parse(text);
            } catch (parseError) {
                throw new Error('Invalid example graph format');
            }

            graphData = this.prepareGraphData(graphData);

            if (!this.validateGraphData(graphData)) {
                throw new Error('Example graph failed validation');
            }

            this.normalizeGraphTitle(graphData, filename);
            await this.prepareDomainsForGraph(graphData);

            this.applyGraphData(graphData, { selectImportedNodes: false });
            this.applyGraphAreaSettingsFromSource(graphData);

            this.currentFile = {
                name: filename,
                type: 'example',
                lastModified: new Date(),
                size: typeof example.size === 'number' ? example.size : text.length
            };

            if (dm) {
                dm.isLoading = false;
            }

            this.synchronizeGraphTitleState(filename, { source: 'file', ensureExtension: true });

            this.notifications.show(
                `Loaded example graph: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`,
                'success'
            );
        } catch (error) {
            console.error('Failed to load example graph', error);
            this.notifications.show(`Failed to load example: ${error.message}`, 'error');
        } finally {
            if (dm) dm.isLoading = false;
        }
    }

    normalizeExampleUrl(url, base) {
        if (!url) {
            return this.joinUrl(base, 'assets/examples/');
        }

        if (/^https?:/i.test(url)) {

            return url;
        }

        if (url.startsWith('/')) {

            if (!base) {
                return url;
            }
            if (/^https?:/i.test(base)) {
                return `${base.replace(/\/+$/, '')}${url}`;
            }
            return `${base}${url}`;
        }

        return this.joinUrl(base, url);
    }

    formatExampleLabel(value) {
        if (!value) {
            return 'Example Graph';
        }
        const base = String(value).replace(/\.qut$/i, '').replace(/[-_]+/g, ' ');
        return base.replace(/\b\w/g, char => char.toUpperCase());
    }

    formatFileSize(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) {
            return '';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
    }

    /**
     * Basic HTML escaping utility used when DOMPurify is unavailable.
     * @param {*} value
     * @returns {string}
     */
    escapeHtml(value) {
        if (value == null) {
            return '';
        }
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    markExportError(message) {
        const error = new Error(message);
        error.__notified = true;
        this.notifications.show(message, 'error');
        return error;
    }

    collectBackgroundImageUrls(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value.reduce((acc, item) => acc.concat(this.collectBackgroundImageUrls(item)), []);
        }

        if (typeof value !== 'string') {
            return [];
        }

        const trimmed = value.trim();
        if (!trimmed || trimmed.toLowerCase() === 'none') {
            return [];
        }

        const urls = [];
        const urlRegex = /url\(([^)]+)\)/gi;
        let match;
        while ((match = urlRegex.exec(trimmed))) {
            const raw = match[1] ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
            if (raw) {
                urls.push(raw);
            }
        }

        if (!urls.length && !/^url\(/i.test(trimmed)) {
            const raw = trimmed.replace(/^['"]|['"]$/g, '');
            if (raw) {
                urls.push(raw);
            }
        }

        return urls;
    }

    async preloadBackgroundImagesForExport() {
        if (!this.cy || typeof this.cy.nodes !== 'function') {
            return;
        }

        const nodes = this.cy.nodes();
        if (!nodes || !nodes.length) {
            return;
        }

        const urlsToPreload = new Set();

        nodes.forEach(node => {
            if (!node) {
                return;
            }

            if (typeof node.data === 'function') {
                this.collectBackgroundImageUrls(node.data('backgroundImage')).forEach(url => urlsToPreload.add(url));
                this.collectBackgroundImageUrls(node.data('background-image')).forEach(url => urlsToPreload.add(url));
            }

            if (typeof node.style === 'function') {
                try {
                    this.collectBackgroundImageUrls(node.style('background-image')).forEach(url => urlsToPreload.add(url));
                } catch (err) {
                    console.warn('Failed to read node background image style during export preflight.', err);
                }
            }
        });

        if (!urlsToPreload.size || typeof Image === 'undefined') {
            urlsToPreload.forEach(url => {
                if (!/^data:/i.test(url)) {
                    this._imagePreloadCache.set(url, { loaded: true });
                }
            });
            return;
        }

        const promises = [];
        const timeoutMs = 7000;

        urlsToPreload.forEach(url => {
            if (!url || /^data:/i.test(url)) {
                return;
            }

            const cached = this._imagePreloadCache.get(url);
            if (cached && (cached.loaded || cached.failed)) {
                return;
            }

            if (cached && cached.promise) {
                promises.push(cached.promise);
                return;
            }

            const promise = new Promise(resolve => {
                const img = new Image();
                let settled = false;
                const finalize = status => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timeoutId);
                    this._imagePreloadCache.set(url, {
                        loaded: status === 'loaded',
                        failed: status !== 'loaded'
                    });
                    resolve({ url, status });
                };

                const timeoutId = setTimeout(() => finalize('timeout'), timeoutMs);

                img.onload = () => finalize('loaded');
                img.onerror = () => finalize('error');
                img.src = url;
            });

            this._imagePreloadCache.set(url, { loaded: false, promise });
            promises.push(promise);
        });

        if (!promises.length) {
            return;
        }

        const results = await Promise.allSettled(promises);

        const shouldWarn = results.some(result => {
            if (result.status !== 'fulfilled') {
                return true;
            }

            const info = result.value;
            return info && info.status && info.status !== 'loaded';
        });

        if (shouldWarn) {
            this.notifications.show('Some node background images failed to load before export; they may appear missing in the snapshot.', 'warning');
        }
    }

    async captureExportSnapshot({ desiredScale = 2, backgroundColor = '#ffffff', onError } = {}) {
        const markNotifiedError = onError || (message => this.markExportError(message));

        if (!this.cy || typeof this.cy.png !== 'function') {
            throw markNotifiedError('No active graph is available to export.');
        }

        if (typeof this.cy.destroyed === 'function' && this.cy.destroyed()) {
            throw markNotifiedError('The current graph has been disposed and cannot be exported.');
        }

        const scale = Number.isFinite(desiredScale) && desiredScale > 0 ? desiredScale : 1;

        await this.preloadBackgroundImagesForExport();

        const container = typeof this.cy.container === 'function' ? this.cy.container() : null;
        if (!container) {
            throw markNotifiedError('Graph container is not available for export.');
        }

        const rect = typeof container.getBoundingClientRect === 'function'
            ? container.getBoundingClientRect()
            : { width: this.cy.width ? this.cy.width() : 0, height: this.cy.height ? this.cy.height() : 0 };

        const elements = typeof this.cy.elements === 'function' ? this.cy.elements() : null;
        const renderedBounds = elements && typeof elements.renderedBoundingBox === 'function'
            ? elements.renderedBoundingBox({ includeOverlays: false, includeEdges: true, includeLabels: true })
            : null;

        const boundsWidth = renderedBounds && Number.isFinite(renderedBounds.w) && renderedBounds.w > 0
            ? renderedBounds.w
            : rect && Number.isFinite(rect.width) && rect.width > 0
                ? rect.width
                : (this.cy.width ? this.cy.width() : 0);

        const boundsHeight = renderedBounds && Number.isFinite(renderedBounds.h) && renderedBounds.h > 0
            ? renderedBounds.h
            : rect && Number.isFinite(rect.height) && rect.height > 0
                ? rect.height
                : (this.cy.height ? this.cy.height() : 0);

        if (!boundsWidth || !boundsHeight) {
            throw markNotifiedError('Unable to determine graph dimensions for export.');
        }

        let pngDataUrl;
        try {
            pngDataUrl = this.cy.png({ full: true, scale, bg: backgroundColor });
        } catch (err) {
            err.__notified = true;
            this.notifications.show('Capturing the graph snapshot failed.', 'error');
            throw err;
        }

        if (!pngDataUrl || (typeof pngDataUrl === 'string' && !pngDataUrl.trim())) {
            throw markNotifiedError('Failed to capture graph snapshot.');
        }

        return {
            pngDataUrl,
            scale,
            renderedBounds,
            rect,
            boundsWidth,
            boundsHeight,
            originX: renderedBounds && Number.isFinite(renderedBounds.x1) ? renderedBounds.x1 : 0,
            originY: renderedBounds && Number.isFinite(renderedBounds.y1) ? renderedBounds.y1 : 0
        };
    }


    async normalizeSnapshotForPdf(imageSource, onError) {
        const markNotifiedError = onError || (message => this.markExportError(message));

        if (!imageSource || typeof imageSource !== 'string') {
            throw markNotifiedError('Graph snapshot is not in a supported image format for PDF export.');
        }

        const source = imageSource.trim();

        if (!source) {
            throw markNotifiedError('Graph snapshot is not in a supported image format for PDF export.');
        }

        if (/^data:image\/(png|jpeg|jpg);base64,/i.test(source)) {
            return source;
        }

        if (!source.includes(',') && /^[a-z0-9+/=\s]+$/i.test(source)) {
            return `data:image/png;base64,${source.replace(/\s+/g, '')}`;
        }

        try {
            const response = await fetch(source);
            if (!response.ok) {
                throw new Error(`Snapshot fetch failed with status ${response.status}`);
            }

            const blob = await response.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read snapshot image data.'));
                reader.readAsDataURL(blob);
            });

            if (!dataUrl || typeof dataUrl !== 'string') {
                throw new Error('Failed to normalize snapshot image data.');
            }

            if (dataUrl.startsWith('data:image/')) {
                return dataUrl;
            }

            if (dataUrl.startsWith('data:')) {
                const base64Payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
                return `data:image/png;base64,${base64Payload}`;
            }

            return dataUrl;
        } catch (error) {
            throw markNotifiedError('Unable to normalize graph snapshot for PDF export.');
        }
    }


    /**
     * PUBLIC INTERFACE: Export graph data in specified format
     * @param {string} format - Export format ('json', 'csv', 'png', 'pdf')
     */
    async exportGraphData(format = 'json') {
        if (!this.cy) {
            this.notifications.show('No graph data to export', 'warning');
            return;
        }

        try {
            let data, filename, mimeType;

            switch (format.toLowerCase()) {
                case 'json':
                    data = JSON.stringify(this.exportCurrentGraph(), null, 2);
                    filename = `graph-export-${Date.now()}.json`;
                    mimeType = 'application/json';
                    break;

                case 'csv':
                    data = this.exportToCSV();
                    filename = `graph-export-${Date.now()}.csv`;
                    mimeType = 'text/csv';
                    break;

                case 'png': {
                    const snapshot = await this.captureExportSnapshot({ desiredScale: 4 });
                    const pngResponse = await fetch(snapshot.pngDataUrl);
                    data = await pngResponse.blob();
                    filename = `graph-export-${Date.now()}.png`;
                    mimeType = 'image/png';
                    break;
                }

                case 'pdf':
                    if (typeof window === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
                        this.notifications.show('PDF export requires jsPDF library', 'error');
                        return;
                    }

                    const snapshot = await this.captureExportSnapshot({ desiredScale: 2 });
                    const normalizedImageDataUrl = await this.normalizeSnapshotForPdf(snapshot.pngDataUrl);

                    const container = snapshot.rect ? snapshot.rect : this.cy.container();
                    const containerWidth = container ? container.width || container.clientWidth || 0 : 0;
                    const containerHeight = container ? container.height || container.clientHeight || 0 : 0;
                    const containerRatio = containerWidth && containerHeight
                        ? containerWidth / containerHeight
                        : 1;

                    const orientation = containerRatio >= 1 ? 'landscape' : 'portrait';
                    const pdfDoc = new window.jspdf.jsPDF({ orientation });

                    const pageWidth = pdfDoc.internal.pageSize.getWidth();
                    const pageHeight = pdfDoc.internal.pageSize.getHeight();

                    const imgWidth = Math.max(1, Math.round(snapshot.boundsWidth * snapshot.scale));
                    const imgHeight = Math.max(1, Math.round(snapshot.boundsHeight * snapshot.scale));
                    const imageRatio = imgWidth / imgHeight;

                    let renderWidth = pageWidth;
                    let renderHeight = renderWidth / imageRatio;

                    if (renderHeight > pageHeight) {
                        renderHeight = pageHeight;
                        renderWidth = renderHeight * imageRatio;
                    }

                    const offsetX = (pageWidth - renderWidth) / 2;
                    const offsetY = (pageHeight - renderHeight) / 2;

                    pdfDoc.addImage(normalizedImageDataUrl, 'PNG', offsetX, offsetY, renderWidth, renderHeight);

                    data = pdfDoc.output('blob');
                    filename = `graph-export-${Date.now()}.pdf`;
                    mimeType = 'application/pdf';
                    break;

                case 'html':
                    data = await this.createViewportHtmlExport();
                    filename = `graph-export-${Date.now()}.html`;
                    mimeType = 'text/html';
                    break;

                default:
                    this.notifications.show(`Unsupported export format: ${format}`, 'error');
                    return;
            }

            this.downloadFile(data, filename, mimeType);
            this.notifications.show(`Graph exported as ${filename}`, 'success');

        } catch (error) {
            console.error('Export failed:', error);
            if (!error || !error.__notified) {
                const message = error && error.message ? error.message : 'Unknown error';
                this.notifications.show(`Export failed: ${message}`, 'error');
            }
        }
    }

    /**
     * Create a sanitized HTML document that captures the current Cytoscape viewport.
     * @param {number} desiredScale
     * @returns {string}
     */
    async createViewportHtmlExport(desiredScale = 2) {
        const markNotifiedError = message => {
            const error = new Error(message);
            error.__notified = true;
            this.notifications.show(message, 'error');
            return error;
        };

        const snapshot = await this.captureExportSnapshot({ desiredScale, onError: markNotifiedError });
        const { pngDataUrl, scale, renderedBounds, boundsWidth, boundsHeight, originX, originY } = snapshot;

        const graphExport = this.exportCurrentGraph();
        const metadata = graphExport && typeof graphExport === 'object' ? graphExport.metadata || {} : {};

        const mapName = `graphViewportMap${Date.now()}`;
        const sanitizedMapName = this.escapeHtml(mapName);

        const nodes = this.cy.nodes
            ? this.cy.nodes().filter(node => (typeof node.visible === 'function' ? node.visible() : true))
            : [];

        const stripHtmlToText = value => {
            if (value === null || value === undefined) {
                return '';
            }

            const stringValue = String(value);
            const withoutStyleAndScript = stringValue
                .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
                .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ');

            return withoutStyleAndScript

                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const hasMeaningfulContent = value => stripHtmlToText(value).length > 0;

        const areaElements = [];

        nodes.forEach(node => {
            if (!node || typeof node.renderedPosition !== 'function') {
                return;
            }
            const pos = node.renderedPosition();
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
                return;
            }

            const renderedWidth = typeof node.renderedWidth === 'function' ? node.renderedWidth() : node.width ? node.width() : 0;
            const renderedHeight = typeof node.renderedHeight === 'function' ? node.renderedHeight() : node.height ? node.height() : 0;
            const baseRadius = Math.max(renderedWidth, renderedHeight) / 2;
            const scaledRadius = Math.max(8, Math.round(baseRadius * scale));

            const scaledX = Math.round((pos.x - originX) * scale);
            const scaledY = Math.round((pos.y - originY) * scale);

            const data = typeof node.data === 'function' ? node.data() : {};
            const nodeId = typeof node.id === 'function' ? node.id() : (data && data.id ? data.id : '');
            const label = data && (data.label || data.name) ? data.label || data.name : nodeId;
            const type = data && data.type ? `Type: ${data.type}` : '';

            const getNodeData = key => {
                if (typeof node.data === 'function') {
                    try {
                        return node.data(key);
                    } catch (err) {
                        return undefined;
                    }
                }

                return data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
            };

            const isContainerClass = typeof node.hasClass === 'function' && node.hasClass('container');
            const containerFlag = getNodeData('isContainer');
            const hasContainerFlag = containerFlag === true || containerFlag === 1 ||
                (typeof containerFlag === 'string' && containerFlag.toLowerCase() === 'true');
            const containerDescriptorKeys = ['type', 'nodeType', 'category', 'group'];
            const hasContainerDescriptor = containerDescriptorKeys.some(key => {
                const value = getNodeData(key);
                return typeof value === 'string' && value.toLowerCase() === 'container';
            });

            if ((typeof node.isParent === 'function' && node.isParent()) ||
                isContainerClass ||
                hasContainerFlag ||
                hasContainerDescriptor) {
                return;
            }

            const infoHtml = getNodeData('infoHtml');
            const info = getNodeData('info');

            let tooltipText = '';
            if (hasMeaningfulContent(infoHtml)) {
                tooltipText = stripHtmlToText(infoHtml);
            } else if (hasMeaningfulContent(info)) {
                tooltipText = stripHtmlToText(info);
            } else {
                const fallbackParts = [];
                if (label) fallbackParts.push(label);
                if (type) fallbackParts.push(type);
                tooltipText = fallbackParts.join(' • ');
            }

            const sanitizedTooltip = this.escapeHtml(tooltipText || label || nodeId);
            const sanitizedNodeId = this.escapeHtml(nodeId);

            const coords = `${scaledX},${scaledY},${scaledRadius}`;
            areaElements.push(
                `            <area shape="circle" coords="${coords}" href="#" tabindex="0" data-node-id="${sanitizedNodeId}" alt="${sanitizedTooltip}" title="${sanitizedTooltip}" aria-label="${sanitizedTooltip}">`
            );
        });

        const nodeCount = Number.isFinite(metadata.nodeCount) ? metadata.nodeCount : (graphExport && Array.isArray(graphExport.nodes) ? graphExport.nodes.length : undefined);
        const edgeCount = Number.isFinite(metadata.edgeCount) ? metadata.edgeCount : (graphExport && Array.isArray(graphExport.edges) ? graphExport.edges.length : undefined);

        const captionParts = [];
        if (Number.isFinite(nodeCount)) {
            captionParts.push(`${nodeCount} nodes`);
        }
        if (Number.isFinite(edgeCount)) {
            captionParts.push(`${edgeCount} edges`);
        }
        if (metadata && metadata.exportDate) {
            try {
                const formattedDate = new Date(metadata.exportDate).toLocaleString();
                captionParts.push(`Exported ${formattedDate}`);
            } catch (e) {
                captionParts.push(`Exported ${metadata.exportDate}`);
            }
        }

        const graphTitle = metadata && metadata.name ? metadata.name : 'Quantickle Graph Export';
        const sanitizedTitle = this.escapeHtml(graphTitle);
        const sanitizedCaption = this.escapeHtml(captionParts.join(' • '));
        const altText = `${graphTitle} snapshot`;
        const sanitizedAltText = this.escapeHtml(altText);

        const scaledWidth = Math.max(1, Math.round(boundsWidth * scale));
        const scaledHeight = Math.max(1, Math.round(boundsHeight * scale));

        const headerSummaryMarkup = sanitizedCaption
            ? `            <p class="graph-summary">${sanitizedCaption}</p>`
            : '';
        const figureCaptionMarkup = sanitizedCaption
            ? `                <figcaption class="graph-caption">${sanitizedCaption}</figcaption>`
            : '';

        const mapMarkup = areaElements.length
            ? areaElements.join('\n')
            : '                    <!-- No node regions available -->';

        const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${sanitizedTitle}</title>
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #05070d; color: #e5e7eb; }
        .graph-export-page { min-height: 100vh; display: flex; flex-direction: column; }
        header { padding: 1.5rem 2rem; background: #0f172a; border-bottom: 1px solid rgba(148, 163, 184, 0.2); }
        header h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 600; }
        .graph-summary { margin: 0; font-size: 0.95rem; color: rgba(226, 232, 240, 0.82); }
        main { flex: 1; padding: 1.5rem; display: flex; }
        figure { margin: 0; flex: 1; display: flex; flex-direction: column; gap: 1rem; }
        .graph-export-viewport { flex: 1; overflow: auto; border-radius: 0.75rem; border: 1px solid rgba(148, 163, 184, 0.35); background: #020617; padding: 1rem; }
        .graph-export-viewport img { display: block; max-width: none; height: auto; }
        .graph-caption { margin: 0; font-size: 0.95rem; color: rgba(226, 232, 240, 0.85); }
        footer { padding: 1rem 2rem 2rem; font-size: 0.85rem; color: rgba(226, 232, 240, 0.7); }
    </style>
</head>
<body>
    <div class="graph-export-page">
        <header>
            <h1>${sanitizedTitle}</h1>
${headerSummaryMarkup || ''}
        </header>
        <main>
            <figure>
                <div class="graph-export-viewport">
                    <img src="${pngDataUrl}" alt="${sanitizedAltText}" usemap="#${sanitizedMapName}" width="${scaledWidth}" height="${scaledHeight}">
                </div>
                <map name="${sanitizedMapName}">
${mapMarkup}
                </map>
${figureCaptionMarkup || ''}
            </figure>
        </main>
        <footer>
            Export generated by Quantickle.
        </footer>
    </div>
</body>
</html>`;

        if (typeof window !== 'undefined' && window.DOMPurify) {
            const purifyConfig = {
                WHOLE_DOCUMENT: true,
                ADD_TAGS: ['style'],
                ADD_ATTR: ['data-node-id', 'usemap', 'aria-label', 'tabindex']
            };
            return window.DOMPurify.sanitize(htmlDocument, purifyConfig);
        }


        return htmlDocument;
    }
    
    /**
     * PUBLIC INTERFACE: Import graph data from various sources
     * @param {Object} data - Data to import
     * @param {string} format - Data format
     */
    async importGraphData(data, format = 'json') {
        const dm = window.DataManager || null;
        try {
            let graphData;

            switch (format.toLowerCase()) {
                case 'json':
                    graphData = typeof data === 'string' ? JSON.parse(data) : data;
                    break;

                case 'cytoscape':
                    graphData = this.convertCytoscapeToGraph(data);
                    break;

                default:
                    this.notifications.show(`Unsupported import format: ${format}`, 'error');
                    return;
            }

            graphData = this.resolveImportDuplicates(graphData);

            if (this.validateGraphData(graphData)) {
                if (dm) dm.isLoading = true;
                await this.prepareDomainsForGraph(graphData);
                this.applyGraphData(graphData, { selectImportedNodes: false });
                if (dm) {
                    dm.isLoading = false;
                    if (typeof dm.setGraphName === 'function') {
                        dm.setGraphName('Unsaved graph');
                    }
                }
                this.currentFile = null;
                this.notifications.show(`Imported ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`, 'success');
            } else {
                this.notifications.show('Invalid data format for import', 'error');
            }

        } catch (error) {
            console.error('Import failed:', error);
            this.notifications.show(`Import failed: ${error.message}`, 'error');
        } finally {
            if (dm) dm.isLoading = false;
        }
    }

    /**
     * PUBLIC INTERFACE: Open file dialog for graph files
     */
    async openGraphDialog() {
        if (window.showOpenFilePicker) {
            try {
                let startIn;
                if (window.WorkspaceManager && WorkspaceManager.handle) {
                    startIn = await WorkspaceManager.getSubDirHandle('graphs');
                }
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Quantickle Graph',
                        accept: { [this.config.mimeType]: ['.qut'] }
                    }],
                    startIn
                });
                const file = await handle.getFile();
                await this.loadGraphFile(file);
                return;
            } catch (err) {
                // If the user cancels the file picker, do not fall back to a second dialog
                if (err && err.name === 'AbortError') {
                    return;
                }
                // For other errors, fall through to the manual input fallback below
            }
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.qut';

        const cleanup = () => {
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
        };

        input.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                this.loadGraphFile(file);
            }
            cleanup();
        };

        document.body.appendChild(input);

        // Avoid triggering the file dialog without explicit user interaction
        if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
            console.warn('File chooser dialog can only be shown with a user activation.');
            cleanup();
            return;
        }

        if (typeof input.showPicker === 'function') {
            input.showPicker();
        } else {
            input.click();
        }

        input.addEventListener('blur', cleanup);
    }

    /**
     * PUBLIC INTERFACE: Open file dialog for CSV files
     */
    async openCSVDialog() {
        if (window.showOpenFilePicker) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'CSV or Edge List',
                        accept: { 'text/csv': ['.csv', '.edges'] }
                    }]
                });
                const file = await handle.getFile();
                if (file.name.endsWith('.edges')) {
                    await this.loadEdgesFile(file);
                } else {
                    await this.loadCSVFile(file);
                }
                return;
            } catch (_) {}
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.edges,text/csv,application/csv';

        const cleanup = () => {
            if (input.parentNode) {
                input.parentNode.removeChild(input);
            }
        };

        input.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                if (file.name.endsWith('.edges')) {
                    this.loadEdgesFile(file);
                } else {
                    this.loadCSVFile(file);
                }
            }
            cleanup();
        };

        document.body.appendChild(input);

        // Avoid triggering the file dialog without explicit user interaction
        if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
            console.warn('File chooser dialog can only be shown with a user activation.');
            cleanup();
            return;
        }

        if (typeof input.showPicker === 'function') {
            input.showPicker();
        } else {
            input.click();
        }

        input.addEventListener('blur', cleanup);
    }

    // Legacy API wrappers for backward compatibility
    openFileDialog() { return this.openGraphDialog(); }
    saveFileDialog() { return this.saveGraphFile(); }
    exportGraph(format = 'json') { return this.exportGraphData(format); }
    createNewGraph() {
        if (!this.confirmGraphOverwrite('Creating a new graph')) {
            return;
        }
        const fileBase = 'new-graph';
        const title = 'New graph';
        const graphData = {
            id: window.QuantickleUtils?.generateUuid?.() || `graph-${Date.now()}`,
            title,
            nodes: [],
            edges: [],
            metadata: {
                source: 'Manually added',
                title,
                name: title
            }
        };
        if (window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                defaultTitle: title,
                defaultSource: 'Manually added'
            });
        }
        this.applyGraphData(graphData, { selectImportedNodes: false });
        this.synchronizeGraphTitleState(title, { source: 'manual' });
        this.currentFile = {
            name: `${fileBase}${this.config.fileExtension}`,
            type: 'qut',
            lastModified: new Date(),
            size: 0
        };
        this.notifications.show('New graph created', 'info');
    }
    containsExternalReferences(data) { return this.containsExternalResources(data); }
    hasExternalReferences(data) { return this.containsExternalResources(data); }
    
    /**
     * PUBLIC INTERFACE: Get current file information
     */
    getCurrentFileInfo() {
        return this.currentFile ? { ...this.currentFile } : null;
    }
    
    /**
     * PUBLIC INTERFACE: Clear current graph
     */
    clearGraph() {
        if (this.cy) {
            this.cy.elements().remove();
            this.clearDataStructures();
            this.currentFile = null;
            this.notifications.show('Graph cleared', 'info');
        }
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Setup data optimization structures
     */
    setupDataOptimizations() {
        this.nodeIndex.clear();
        this.edgeIndex.clear();
        this.typeIndex.clear();
        
        // Check for Web Workers support
        if (typeof Worker !== 'undefined') {
        }
    }
    
    /**
     * Validate file before processing
     */
    validateFile(file, expectedType) {
        if (!file) {
            this.notifications.show('No file provided', 'error');
            return false;
        }
        
        if (file.size > this.config.maxFileSize) {
            this.notifications.show(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max: ${this.config.maxFileSize / 1024 / 1024}MB)`, 'error');
            return false;
        }
        
        if (expectedType === 'csv' && !this.config.csvMimeTypes.some(type => file.type === type || file.name.endsWith('.csv'))) {
            this.notifications.show('Please select a CSV file', 'error');
            return false;
        }

        if (expectedType === 'edges' && !(this.config.edgeListMimeTypes.some(type => file.type === type) || file.name.endsWith('.edges'))) {
            this.notifications.show('Please select an edge list (.edges) file', 'error');
            return false;
        }

        if (expectedType === 'qut' && !file.name.endsWith(this.config.fileExtension)) {
            this.notifications.show(`Please select a ${this.config.fileExtension} file`, 'error');
            return false;
        }
        
        return true;
    }

    confirmGraphOverwrite(actionDescription = 'Loading a new graph') {
        if (this.cy && typeof this.cy.elements === 'function' && this.cy.elements().length > 0) {
            const proceed = window.confirm(`${actionDescription} will replace the current graph. Continue?`);
            if (!proceed) {
                this.notifications?.show?.('Graph load cancelled', 'info');
                return false;
            }
        }
        return true;
    }
    
    /**
     * Read file as text
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadstart = () => {
            };
            reader.onprogress = (e) => {
            };
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => {
                console.error('FileReader error:', e);
                reject(new Error('Failed to read file'));
            };
            reader.onabort = () => {
            };
            reader.onloadend = () => {
            };
            reader.readAsText(file);
        });
    }

    /**
     * Read file as ArrayBuffer
     */
    readFileAsBinary(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => {
                console.error('FileReader error:', e);
                reject(new Error('Failed to read file'));
            };
            reader.readAsArrayBuffer(file);
        });
    }
    
    /**
     * Parse CSV using Papa Parse
     */
    parseCSV(text, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.papaParseLib) {
                reject(new Error('Papa Parse library not available'));
                return;
            }
            this.papaParseLib.parse(text, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                ...options,
                complete: resolve,
                error: (error) => {
                    console.error('Papa Parse error:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * Parse simple edge list text (source target per line)
     */
    parseEdgeList(text) {
        const nodeMap = new Map();
        const edges = [];
        let index = 0;

        text.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const parts = trimmed.split(/[\s,]+/);
            if (parts.length < 2) return;
            const source = parts[0];
            const target = parts[1];

            if (!nodeMap.has(source)) {
                nodeMap.set(source, { id: source, label: source, type: 'default' });
            }
            if (!nodeMap.has(target)) {
                nodeMap.set(target, { id: target, label: target, type: 'default' });
            }

            edges.push({
                id: `edge_${source}_${target}_${index++}`,
                source,
                target,
                label: '',
                weight: 1,
                type: 'default'
            });
        });

        return { nodes: Array.from(nodeMap.values()), edges };
    }

    /**
     * Convert CSV data to graph format
     */
    convertCSVToGraph(csvData, meta) {
        const nodes = [];
        const edges = [];
        const nodeMap = new Map();
        const debugModeEnabled = typeof this.isDebugModeEnabled === 'function'
            ? this.isDebugModeEnabled()
            : false;
        const logTag = '[FileManagerModule CSV import]';
        const rowLogLimit = 5;
        const shouldLog = (rowIndex = 0) => debugModeEnabled || rowIndex < rowLogLimit;
        const logDebug = (message, payload, rowIndex = 0, force = false) => {
            if (!force && !shouldLog(rowIndex)) {
                return;
            }
            if (payload !== undefined) {
                console.debug(`${logTag} ${message}`, payload);
            } else {
                console.debug(`${logTag} ${message}`);
            }
        };
        const logWarn = (message, payload, rowIndex = 0, force = false) => {
            if (!force && !shouldLog(rowIndex)) {
                return;
            }
            if (payload !== undefined) {
                console.warn(`${logTag} ${message}`, payload);
            } else {
                console.warn(`${logTag} ${message}`);
            }
        };
        let summaryNotificationShown = false;
        const notifySummary = (contextLabel = '') => {
            const nodeCount = nodeMap.size || nodes.length;
            const edgeCount = edges.length;
            const contextSuffix = contextLabel ? ` (${contextLabel})` : '';
            logDebug(`CSV import summary${contextSuffix}`, {
                nodeCount,
                edgeCount,
                mapSize: nodeMap.size
            });

            if (
                debugModeEnabled &&
                !summaryNotificationShown &&
                this.notifications &&
                typeof this.notifications.show === 'function'
            ) {
                this.notifications.show(
                    `Debug: CSV import produced ${nodeCount} nodes and ${edgeCount} edges`,
                    'info'
                );
                summaryNotificationShown = true;
            }
        };


        const normalizeKey = (key) => {
            if (typeof key !== 'string') {
                return key;
            }
            return key
                .trim()
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .replace(/[\s-]+/g, '_')
                .toLowerCase();
        };

        const buildNormalizedRow = (row) => {
            if (!row || typeof row !== 'object') {
                return {};
            }

            const normalized = {};
            Object.entries(row).forEach(([key, value]) => {
                const normalizedKey = normalizeKey(key);
                if (normalizedKey == null || normalizedKey === '') {
                    return;
                }
                if (!(normalizedKey in normalized)) {
                    normalized[normalizedKey] = value;
                }
            });
            return normalized;
        };

        const getNormalizedValue = (row, ...keys) => {
            for (const key of keys) {
                const normalizedKey = normalizeKey(key);
                if (normalizedKey == null) continue;
                if (!(normalizedKey in row)) continue;

                const value = row[normalizedKey];
                if (value === undefined || value === null) {
                    continue;
                }
                if (typeof value === 'string' && value.trim() === '') {
                    continue;
                }
                return value;
            }
            return undefined;
        };

        const headers = meta.fields || [];
        const normalizedHeaders = headers.map(header => normalizeKey(header));


        const hasNodeSection =
            normalizedHeaders.includes('node_id') && normalizedHeaders.includes('node_label');

        const hasSourceTarget =
            (normalizedHeaders.includes('source') || normalizedHeaders.includes('source_id')) &&
            (normalizedHeaders.includes('target') || normalizedHeaders.includes('target_id'));

        const toStringSafe = value => (value == null ? '' : String(value));
        const parseNumber = (value, fallback) => {
            if (value === '' || value === null || value === undefined) {
                return fallback;
            }
            const num = Number(value);
            return Number.isFinite(num) ? num : fallback;
        };

        if (hasNodeSection) {
            let inEdgeSection = false;

            let edgeColumnMap = null;

            const buildEdgeColumnMap = (headerRow) => {
                const map = {};
                Object.entries(headerRow).forEach(([key, value]) => {
                    if (typeof value !== 'string') {
                        return;
                    }

                    const normalizedValue = value.trim().toLowerCase();
                    if (!normalizedValue) {
                        return;
                    }

                    switch (normalizedValue) {
                        case 'source':
                        case 'source_id':
                        case 'from':
                            map.source = key;
                            break;
                        case 'target':
                        case 'target_id':
                        case 'to':
                            map.target = key;
                            break;
                        case 'label':
                        case 'edge_label':
                            map.label = key;
                            break;
                        case 'weight':
                        case 'edge_weight':
                            map.weight = key;
                            break;
                        case 'type':
                        case 'edge_type':
                            map.type = key;
                            break;
                        case 'edge_id':
                        case 'id':
                            map.id = key;
                            break;
                        default:
                            break;
                    }
                });

                return map;
            };

            const getEdgeValue = (row, columnMapKey, ...fallbackKeys) => {
                if (edgeColumnMap && columnMapKey && edgeColumnMap[columnMapKey]) {
                    const mappedKey = edgeColumnMap[columnMapKey];
                    if (mappedKey in row) {
                        const mappedValue = row[mappedKey];
                        if (mappedValue !== undefined && mappedValue !== null) {
                            if (typeof mappedValue !== 'string' || mappedValue.trim() !== '') {
                                return mappedValue;
                            }
                        }
                    }
                }

                return getNormalizedValue(row, ...fallbackKeys);
            };

            csvData.forEach((row) => {

                if (!row || typeof row !== 'object') {
                    return;
                }


                const normalizedRow = buildNormalizedRow(row);

                const hasRowValues = Object.values(normalizedRow).some(value => {
                    if (value === undefined || value === null) {
                        return false;
                    }

                    if (typeof value === 'string' && value.trim() === '') {
                        return false;
                    }

                    return true;
                });

                const maybeEdgeHeader = (() => {
                    const values = Object.values(normalizedRow)
                        .filter(v => typeof v === 'string')
                        .map(v => v.trim().toLowerCase());

                    if (values.length === 0) {
                        return false;
                    }

                    const sourceHeaderValues = new Set(['source', 'source_id', 'from']);
                    const targetHeaderValues = new Set(['target', 'target_id', 'to']);

                    const hasSourceHeader = values.some(value => sourceHeaderValues.has(value));
                    const hasTargetHeader = values.some(value => targetHeaderValues.has(value));

                    return hasSourceHeader && hasTargetHeader;
                })();


                if (!inEdgeSection && !hasRowValues) {
                    inEdgeSection = true;
                    edgeColumnMap = null;

                    return;
                }

                if (!inEdgeSection && maybeEdgeHeader) {
                    inEdgeSection = true;
                    edgeColumnMap = buildEdgeColumnMap(normalizedRow);

                    return;
                }

                if (inEdgeSection && maybeEdgeHeader && !edgeColumnMap) {
                    edgeColumnMap = buildEdgeColumnMap(normalizedRow);

                    return;
                }

                const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';

                if (!inEdgeSection) {
                    const nodeId = toStringSafe(

                        getNormalizedValue(
                            normalizedRow,
                            'node_id',
                            'id',
                            'nodeid'
                        ) || ''

                    ).trim();

                    if (!nodeId) {
                        return;
                    }

                    const labelValue =

                        getNormalizedValue(
                            normalizedRow,
                            'node_label',
                            'label',
                            'name'
                        ) || nodeId;

                    const typeValue =
                        getNormalizedValue(
                            normalizedRow,
                            'node_type',
                            'type'
                        ) || 'default';
                    const sizeValue = getNormalizedValue(
                        normalizedRow,
                        'node_size',
                        'size'
                    );
                    const colorValue =
                        getNormalizedValue(
                            normalizedRow,
                            'node_color',
                            'color'
                        ) || defaultNodeColor;
                    const xValue = getNormalizedValue(
                        normalizedRow,
                        'node_x',
                        'x'
                    );
                    const yValue = getNormalizedValue(
                        normalizedRow,
                        'node_y',
                        'y'
                    );


                    const node = {
                        id: nodeId,
                        label: toStringSafe(labelValue) || nodeId,
                        type: toStringSafe(typeValue) || 'default',
                        size: parseNumber(sizeValue, 30),
                        color: toStringSafe(colorValue) || defaultNodeColor,
                        x: parseNumber(xValue, null),
                        y: parseNumber(yValue, null)
                    };

                    if (node.x == null) {
                        node.x = Math.random() * 500;
                    }
                    if (node.y == null) {
                        node.y = Math.random() * 500;
                    }

                    if (nodeMap.has(nodeId)) {
                        Object.assign(nodeMap.get(nodeId), node);
                    } else {
                        nodeMap.set(nodeId, node);
                        nodes.push(node);
                    }
                } else {
                    if (maybeEdgeHeader) {
                        return;
                    }

                    const sourceId = toStringSafe(

                        getEdgeValue(
                            normalizedRow,
                            'source',
                            'source',

                            'source_id',
                            'from',
                            'node_id',
                            'nodeid'
                        ) || ''
                    ).trim();

                    const targetId = toStringSafe(

                        getEdgeValue(
                            normalizedRow,
                            'target',
                            'target',

                            'target_id',
                            'to',
                            'node_label',
                            'targetid'
                        ) || ''

                    ).trim();

                    if (!sourceId || !targetId) {
                        return;
                    }

                    if (!nodeMap.has(sourceId)) {
                        const node = {
                            id: sourceId,
                            label: sourceId,
                            type: 'default',
                            size: 30,
                            color: defaultNodeColor,
                            x: Math.random() * 500,
                            y: Math.random() * 500
                        };
                        nodeMap.set(sourceId, node);
                        nodes.push(node);
                    }

                    if (!nodeMap.has(targetId)) {
                        const node = {
                            id: targetId,
                            label: targetId,
                            type: 'default',
                            size: 30,
                            color: defaultNodeColor,
                            x: Math.random() * 500,
                            y: Math.random() * 500
                        };
                        nodeMap.set(targetId, node);
                        nodes.push(node);
                    }


                    let labelValue = getEdgeValue(
                        normalizedRow,
                        'label',
                        'label',

                        'edge_label'
                    );
                    if (labelValue === undefined) {
                        labelValue = getNormalizedValue(normalizedRow, 'node_type');
                    }


                    const weightValue = getEdgeValue(
                        normalizedRow,
                        'weight',
                        'weight',

                        'edge_weight',
                        'node_size'
                    );


                    let typeValue = getEdgeValue(
                        normalizedRow,
                        'type',
                        'type',

                        'edge_type',
                        'edgeType'
                    );
                    if (typeValue === undefined) {
                        typeValue = getNormalizedValue(normalizedRow, 'node_color');
                    }


                    edges.push({
                        id:
                            toStringSafe(
                                getEdgeValue(
                                    normalizedRow,
                                    'id',
                                    'edge_id',
                                    'id'
                                )
                            ).trim() || `edge_${sourceId}_${targetId}_${edges.length}`,
             source: sourceId,
                        target: targetId,
                        label: toStringSafe(labelValue),
                        weight: parseNumber(weightValue, 1),
                        type: toStringSafe(typeValue) || 'default'
                    });
                }
            });

            notifySummary('node section');

            return { nodes, edges };
        }

        if (hasSourceTarget) {
            csvData.forEach((row, index) => {
                const normalizedRow = buildNormalizedRow(row);

                const sourceId = toStringSafe(
                    getNormalizedValue(
                        normalizedRow,
                        'source',
                        'source_id',
                        'from',
                        'sourceid'
                    ) || ''
                ).trim();

                const targetId = toStringSafe(
                    getNormalizedValue(
                        normalizedRow,
                        'target',
                        'target_id',
                        'to',
                        'targetid'
                    ) || ''
                ).trim();

                logDebug(
                    `Row ${index}: normalized IDs`,
                    {
                        rowIndex: index,
                        sourceId: sourceId || null,
                        targetId: targetId || null,
                        normalizedRow
                    },
                    index,
                    true
                );

                if (!sourceId || !targetId) {
                    const missingParts = [];
                    if (!sourceId) missingParts.push('source');
                    if (!targetId) missingParts.push('target');

                    logWarn(
                        `Skipping row ${index}: missing ${missingParts.join(' and ')} id`,
                        {
                            rowIndex: index,
                            normalizedRow
                        },
                        index,
                        true
                    );

                    return;
                }

                const ensureNode = (id, prefix, rowIndex) => {
                    if (!nodeMap.has(id)) {
                        nodeMap.set(id, { id });
                    }

                    const node = nodeMap.get(id);
                    const updates = [];
                    const shouldLogDetails = shouldLog(rowIndex);

                    const labelValue = getNormalizedValue(
                        normalizedRow,
                        `${prefix}_label`,
                        `${prefix}_name`
                    );
                    if (labelValue !== undefined) {
                        const labelString = toStringSafe(labelValue) || id;
                        node.label = labelString;
                        if (shouldLogDetails) {
                            updates.push(`label set from ${prefix}_label -> "${labelString}"`);
                        }
                    } else if (!node.label) {
                        node.label = id;
                        if (shouldLogDetails) {
                            updates.push('label defaulted to node id');
                        }
                    }

                    const typeValue = getNormalizedValue(
                        normalizedRow,
                        `${prefix}_type`
                    );
                    if (typeValue !== undefined) {
                        const normalizedType = toStringSafe(typeValue).trim();
                        const typeToUse = normalizedType || 'default';
                        node.type = typeToUse;
                        if (shouldLogDetails) {
                            updates.push(`type set from ${prefix}_type -> "${typeToUse}"`);
                        }
                    } else if (!node.type) {
                        node.type = 'default';
                        if (shouldLogDetails) {
                            updates.push('type defaulted to "default"');
                        }
                    }

                    const colorValue = getNormalizedValue(
                        normalizedRow,
                        `${prefix}_color`
                    );
                    const defaultNodeColor =
                        (window && window.QuantickleConfig && window.QuantickleConfig.defaultNodeColor) ||
                        '#ffffff';
                    if (colorValue !== undefined) {
                        const normalizedColor = toStringSafe(colorValue).trim();
                        const isHexColor = /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(normalizedColor);
                        if (normalizedColor && isHexColor) {
                            node.color = normalizedColor;
                            if (shouldLogDetails) {
                                updates.push(`color set from ${prefix}_color -> "${normalizedColor}"`);
                            }
                        } else if (!node.color) {
                            node.color = defaultNodeColor;
                            if (shouldLogDetails) {
                                updates.push(`color defaulted to ${defaultNodeColor} (invalid provided value)`);
                            }
                        }
                    } else if (!node.color) {
                        node.color = defaultNodeColor;
                        if (shouldLogDetails) {
                            updates.push(`color defaulted to ${defaultNodeColor}`);
                        }
                    }

                    const sizeValue = getNormalizedValue(
                        normalizedRow,
                        `${prefix}_size`
                    );
                    if (sizeValue !== undefined) {
                        const fallbackSize =
                            typeof node.size === 'number' && Number.isFinite(node.size)
                                ? node.size
                                : 30;
                        const parsedSize = parseNumber(sizeValue, fallbackSize);
                        node.size = parsedSize;
                        if (shouldLogDetails) {
                            updates.push(`size set from ${prefix}_size -> ${parsedSize}`);
                        }
                    }

                    if (node.size == null) {
                        node.size = 30;
                        if (shouldLogDetails) {
                            updates.push('size defaulted to 30');
                        }
                    }

                    if (node.x == null) {
                        const xValue = getNormalizedValue(
                            normalizedRow,
                            `${prefix}_x`,
                            `${prefix}x`,
                            `${prefix}X`,
                            `${prefix} x`,
                            `${prefix}-x`
                        );

                        const parsedX = parseNumber(xValue, null);
                        if (parsedX != null) {
                            node.x = parsedX;
                        }
                    }

                    if (node.y == null) {
                        const yValue = getNormalizedValue(
                            normalizedRow,
                            `${prefix}_y`,
                            `${prefix}y`,
                            `${prefix}Y`,
                            `${prefix} y`,
                            `${prefix}-y`
                        );

                        const parsedY = parseNumber(yValue, null);
                        if (parsedY != null) {
                            node.y = parsedY;
                        }
                    }

                    if (node.x == null) {
                        node.x = Math.random() * 500;
                    }

                    if (node.y == null) {
                        node.y = Math.random() * 500;
                    }

                    if (updates.length && shouldLogDetails) {
                        logDebug(
                            `Row ${rowIndex}: ensured ${prefix} node ${id}`,
                            {
                                updates,
                                node: { ...node }
                            },
                            rowIndex
                        );
                    }

                    return node;
                };

                ensureNode(sourceId, 'source', index);
                ensureNode(targetId, 'target', index);

                const relationshipLabel = getNormalizedValue(
                    normalizedRow,
                    'relationship_label',
                    'edge_label',
                    'label'
                );
                const relationshipType = getNormalizedValue(
                    normalizedRow,
                    'relationship_type',
                    'edge_type',
                    'type'
                );
                const weightValue = getNormalizedValue(
                    normalizedRow,
                    'relationship_weight',
                    'edge_weight',
                    'weight'
                );

                edges.push({
                    id: `edge_${sourceId}_${targetId}_${index}`,
                    source: sourceId,
                    target: targetId,
                    label: toStringSafe(relationshipLabel || ''),
                    weight: parseNumber(weightValue, 1),
                    type: toStringSafe(relationshipType || 'default') || 'default'
                });
            });

            nodes.push(...nodeMap.values());
        } else {
            const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
            csvData.forEach((row, index) => {
                const nodeId = toStringSafe(row.id || row.Id || row.ID || index).trim();

                nodes.push({
                    id: nodeId,
                    label: row.label || row.Label || row.name || row.Name || nodeId,
                    type: row.type || row.Type || 'default',
                    size: row.size || row.Size || 30,
                    color: row.color || row.Color || defaultNodeColor,
                    x: row.x || row.X || Math.random() * 500,
                    y: row.y || row.Y || Math.random() * 500
                });
            });
        }

        if (hasSourceTarget) {
            notifySummary('source-target section');
        } else {
            notifySummary('node-only section');
        }

        return { nodes, edges };
    }

    isDebugModeEnabled() {
        if (this.config && typeof this.config.debugMode === 'boolean') {
            return this.config.debugMode;
        }

        if (typeof window !== 'undefined') {
            const debugTools = window.DebugTools;
            if (debugTools && debugTools.moduleInstance && typeof debugTools.moduleInstance.debugMode === 'boolean') {
                return debugTools.moduleInstance.debugMode;
            }

            if (debugTools && typeof debugTools.debugMode === 'boolean') {
                return debugTools.debugMode;
            }

            if (typeof window.QUANTICKLE_DEBUG_MODE === 'boolean') {
                return window.QUANTICKLE_DEBUG_MODE;
            }
        }

        return false;
    }
    
    /**
     * Auto-load required domain configurations for the supplied graph data
     */
    async prepareDomainsForGraph(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes) || graphData.nodes.length === 0) {
            return [];
        }

        const domainLoader = window.DomainLoader;
        if (!domainLoader || typeof domainLoader.autoLoadDomainsForGraph !== 'function') {
            return [];
        }

        try {
            const loaded = await domainLoader.autoLoadDomainsForGraph(graphData);
            if (Array.isArray(loaded) && loaded.length > 0 && typeof domainLoader.updateActiveDomainsStatus === 'function') {
                domainLoader.updateActiveDomainsStatus();
            }
            return Array.isArray(loaded) ? loaded : [];
        } catch (error) {
            console.error('[FileManager] Domain auto-loading failed:', error);
            return [];
        }
    }

    extractNodeLabel(node) {
        if (!node) {
            return '';
        }

        const source = node.data && typeof node.data === 'object' ? node.data : node;
        const label = source && typeof source.label === 'string' ? source.label : '';
        return label.trim();
    }

    extractNodeId(node) {
        if (!node) {
            return '';
        }

        if (typeof node.id === 'string') {
            return node.id;
        }

        if (node.data && node.data.id != null) {
            return String(node.data.id);
        }

        return '';
    }

    buildDuplicateDialogMessage(duplicates, context = 'import') {
        const cappedList = duplicates.slice(0, 5).map(label => `"${label}"`).join(', ');
        const extraCount = duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : '';
        const prefix = context === 'paste' ? 'Pasted nodes' : 'Imported data';
        return `${prefix} include labels already present in the graph: ${cappedList}${extraCount}.
Choose OK to duplicate these nodes or Cancel to ignore duplicates.`;
    }

    resolveImportDuplicates(graphData) {
        if (!graphData || !Array.isArray(graphData.nodes)) {
            return graphData;
        }

        this.lastIgnoredDuplicateNodes = [];

        const existingLabels = new Set();
        const labelToNodes = new Map();
        const candidateCy = this.cy || (window.GraphRenderer && window.GraphRenderer.cy) || null;
        if (candidateCy) {
            const nodes = typeof candidateCy.nodes === 'function' ? candidateCy.nodes() : [];
            nodes.forEach(node => {
                if (!node) return;
                const label = node.data && typeof node.data === 'function'
                    ? node.data('label')
                    : node.data?.label || node.label;
                if (label) {
                    const trimmed = String(label).trim();
                    existingLabels.add(trimmed);
                    if (!labelToNodes.has(trimmed)) {
                        labelToNodes.set(trimmed, []);
                    }
                    labelToNodes.get(trimmed).push(node);
                }
            });
        }

        if (existingLabels.size === 0) {
            return graphData;
        }

        const duplicateLabels = Array.from(new Set(
            graphData.nodes
                .map(node => this.extractNodeLabel(node))
                .filter(label => label && existingLabels.has(label))
        ));

        if (duplicateLabels.length === 0) {
            return graphData;
        }

        let allowDuplicates = true;
        if (typeof window.confirm === 'function') {
            allowDuplicates = window.confirm(this.buildDuplicateDialogMessage(duplicateLabels, 'import'));
        }

        if (allowDuplicates) {
            return graphData;
        }

        const filteredNodes = [];
        const removedIds = new Set();

        graphData.nodes.forEach(node => {
            const label = this.extractNodeLabel(node);
            if (label && existingLabels.has(label)) {
                const id = this.extractNodeId(node);
                if (id) {
                    removedIds.add(id);
                }
                return;
            }
            filteredNodes.push(node);
        });

        const filteredEdges = Array.isArray(graphData.edges)
            ? graphData.edges.filter(edge => {
                const data = edge && typeof edge === 'object' ? (edge.data || edge) : {};
                const source = data.source;
                const target = data.target;
                return !removedIds.has(source) && !removedIds.has(target);
            })
            : [];

        const updatedGraph = { ...graphData, nodes: filteredNodes, edges: filteredEdges };

        if (this.notifications && typeof this.notifications.show === 'function' && removedIds.size > 0) {
            this.notifications.show(
                `Skipped ${removedIds.size} duplicate node${removedIds.size === 1 ? '' : 's'} during import`,
                'info'
            );
        }

        this.lastIgnoredDuplicateNodes = duplicateLabels
            .map(label => labelToNodes.get(label) || [])
            .flat()
            .filter(node => node && typeof node.select === 'function');

        return updatedGraph;
    }

    _selectImportedNodes(cy, addedNodes = [], graphData = null, options = {}) {
        if (!cy) {
            return;
        }

        const shouldSelect = options.select !== false;
        if (!shouldSelect) {
            this.lastIgnoredDuplicateNodes = [];
            return;
        }

        const nodesToSelect = [];
        if (Array.isArray(addedNodes) && addedNodes.length > 0) {
            nodesToSelect.push(...addedNodes.filter(node => node && typeof node.select === 'function'));
        } else if (graphData && Array.isArray(graphData.nodes)) {
            nodesToSelect.push(
                ...graphData.nodes
                    .map(node => {
                        const id = this.extractNodeId(node);
                        return id ? cy.getElementById(id) : null;
                    })
                    .filter(node => node && typeof node.select === 'function')
            );
        }

        if (Array.isArray(this.lastIgnoredDuplicateNodes) && this.lastIgnoredDuplicateNodes.length > 0) {
            nodesToSelect.push(...this.lastIgnoredDuplicateNodes);
        }

        if (nodesToSelect.length === 0) {
            return;
        }

        try {
            const selected = typeof cy.elements === 'function' ? cy.elements(':selected') : null;
            if (selected && typeof selected.unselect === 'function') {
                selected.unselect();
            }

            const seen = new Set();
            nodesToSelect.forEach(node => {
                const id = typeof node.id === 'function' ? node.id() : null;
                if (id && seen.has(id)) {
                    return;
                }

                if (id) {
                    seen.add(id);
                }
                node.select();
            });
        } catch (error) {
            console.warn('[FileManager] Unable to select imported nodes:', error);
        } finally {
            this.lastIgnoredDuplicateNodes = [];
        }
    }

    /**
     * Apply graph data to Cytoscape
     */
    applyGraphData(graphData, options = {}) {
        const { selectImportedNodes = true } = options;

        const hasGraphRenderer = Boolean(window.GraphRenderer && typeof window.GraphRenderer.renderGraph === 'function');
        if (!this.cy && !hasGraphRenderer) {
            return;
        }

        this.resetViewportBeforeGraphLoad();

        if (window.GraphRenderer) {
            if (typeof window.GraphRenderer.stashClipboardForNextGraph === 'function') {
                try {
                    window.GraphRenderer.stashClipboardForNextGraph();
                } catch (stashError) {
                    console.warn('Unable to stash clipboard before graph reload', stashError);
                }
            }
            if (typeof window.GraphRenderer.resetGraphInstanceStack === 'function') {
                window.GraphRenderer.resetGraphInstanceStack();
            }
        }

        if (graphData && window.QuantickleUtils && typeof window.QuantickleUtils.normalizeGraphIdentity === 'function') {
            window.QuantickleUtils.normalizeGraphIdentity(graphData, {
                defaultTitle: graphData.title || graphData.graphName || graphData.graphId || 'Loaded graph',
                defaultSource: () => graphData?.metadata?.source || 'Manually added'
            });
        }

        const nodesForLayoutCheck = Array.isArray(graphData?.nodes) ? graphData.nodes : [];
        const layoutSettings = graphData?.layoutSettings || null;
        const savedLayout = layoutSettings?.currentLayout;
        const hasSavedLayout = typeof savedLayout === 'string' ? savedLayout.trim() !== '' : Boolean(savedLayout);
        const hasSavedPositions = nodesForLayoutCheck.length > 0 && nodesForLayoutCheck.some(node => {
            if (!node) {
                return false;
            }

            const hasPositionObject = node.position &&
                node.position.x !== undefined &&
                node.position.y !== undefined;

            const hasTopLevelCoords = node.x !== undefined &&
                node.y !== undefined;

            const data = node.data || {};
            const hasDataCoords = data.x !== undefined &&
                data.y !== undefined;

            return hasPositionObject || hasTopLevelCoords || hasDataCoords;
        });
        const shouldRespectSavedLayout = hasSavedLayout || hasSavedPositions;

        if (window.LayoutManager) {
            if (hasSavedLayout) {
                window.LayoutManager.currentLayout = savedLayout;
                if (typeof window.LayoutManager.updateLayoutDropdown === 'function') {
                    try {
                        window.LayoutManager.updateLayoutDropdown();
                    } catch (dropdownError) {
                        console.warn('Error updating layout dropdown during graph restore:', dropdownError);
                    }
                }
            } else if (typeof window.LayoutManager.ensureGridLayoutDefault === 'function') {
                window.LayoutManager.ensureGridLayoutDefault();
            }
        }

        if (shouldRespectSavedLayout && window.GraphRenderer) {
            window.GraphRenderer.skipNextLayoutApplication = true;
        }

        // Reset 3D effects and auto-rotation to defaults
        try {
            if (typeof window.reset3DRotation === 'function') {
                window.reset3DRotation(false, this.cy);
            }

            if (window.GlobeLayout3D) {
                if (typeof window.GlobeLayout3D.stopAutoRotation === 'function') {
                    window.GlobeLayout3D.stopAutoRotation();
                }
                if (window.GlobeLayout3D.config) {
                    window.GlobeLayout3D.config.autoRotate = false;
                }
                if (typeof window.GlobeLayout3D.resetRotation === 'function') {
                    window.GlobeLayout3D.resetRotation();
                }
                if (typeof window.GlobeLayout3D.resetVisualEffects === 'function') {
                    window.GlobeLayout3D.resetVisualEffects();
                }
                window.GlobeLayout3D.isActive = false;
            }
        } catch (error) {
            console.error('Error resetting 3D state:', error);
        }

        // Clear existing graph
        if (this.cy && typeof this.cy.elements === 'function') {
            const elements = this.cy.elements();
            if (elements && typeof elements.remove === 'function') {
                elements.remove();
            }
        }
        this.clearDataStructures();
        
        // Apply node limit for performance
        const nodeCount = graphData.nodes.length;
        if (nodeCount > this.nodeLimit) {
            this.notifications.show(`Large dataset detected (${nodeCount} nodes). Limiting to ${this.nodeLimit} for performance.`, 'warning');
            graphData.nodes = graphData.nodes.slice(0, this.nodeLimit);
            
            // Filter edges to only include those with valid nodes
            const nodeIds = new Set(graphData.nodes.map(n => n.id));
            graphData.edges = graphData.edges.filter(e => 
                nodeIds.has(e.source) && nodeIds.has(e.target)
            );
        }
        
        // Add nodes - ensure containers exist before their children
        const nodesToAdd = [...graphData.nodes];
        if (nodesToAdd.length) {
            const idMap = new Map(nodesToAdd.map(n => [n.id, n]));
            const depthCache = new Map();
            const getDepth = (node) => {
                if (!node) {
                    return 0;
                }
                if (depthCache.has(node.id)) {
                    return depthCache.get(node.id);
                }
                let depth = 0;
                if (node.parent && idMap.has(node.parent)) {
                    depth = getDepth(idMap.get(node.parent)) + 1;
                }
                depthCache.set(node.id, depth);
                return depth;
            };
            nodesToAdd.sort((a, b) => getDepth(a) - getDepth(b));
            graphData.nodes = nodesToAdd;
        }

        const hasViewportSettings =
            layoutSettings &&
            typeof layoutSettings.zoom === 'number' &&
            layoutSettings.pan &&
            typeof layoutSettings.pan.x === 'number' &&
            typeof layoutSettings.pan.y === 'number';

        if (hasGraphRenderer) {
            this.graphData = graphData;
            this.syncExternalManagers(graphData);

                const finalizeDelegatedRender = () => {
                    const rendererCy = (window.GraphRenderer && window.GraphRenderer.cy) || this.cy;
                    if (rendererCy && !this.cy) {
                        this.cy = rendererCy;
                    }
                    this.rebuildIndexesFromCyInstance(rendererCy);
                    this.applyViewportAndPostRenderSettings(layoutSettings, hasViewportSettings);
                    this._selectImportedNodes(rendererCy, [], graphData, { select: selectImportedNodes });

                    if (
                        window.GraphRenderer
                        && typeof window.GraphRenderer.applyClipboardTransferToCurrentGraph === 'function'
                    ) {
                        try {
                            window.GraphRenderer.applyClipboardTransferToCurrentGraph({ preserveClipboard: true });
                        } catch (error) {
                            console.warn('Unable to reapply clipboard after graph reload', error);
                        }
                    }
                };

            try {
                const renderResult = window.GraphRenderer.renderGraph();
                if (renderResult && typeof renderResult.then === 'function') {
                    renderResult
                        .then(() => {
                            finalizeDelegatedRender();
                        })
                        .catch(error => {
                            console.error('GraphRenderer.renderGraph() promise rejected:', error);
                        });
                } else {
                    finalizeDelegatedRender();
                }
                return;
            } catch (error) {
                console.error('GraphRenderer.renderGraph() threw an error, falling back to manual render:', error);
            }
        }

        const coercePosition = entry => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const x = Number(entry.x);
            const y = Number(entry.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return null;
            }
            return { x, y };
        };

        // Prepare node and edge elements before adding to Cytoscape
        const nodeElements = [];
        const storedNodeState = new Map();
        graphData.nodes.forEach(nodeData => {
            if (!nodeData) {
                return;
            }

            const isContainer = nodeData.type === 'container' || nodeData.isContainer;
            if (isContainer) {
                let classes = (nodeData.classes || '').split(/\s+/).filter(Boolean);
                if (!classes.includes('container')) {
                    classes.push('container');
                    nodeData.classes = classes.join(' ');
                }

                nodeData.shape = nodeData.shape || 'round-rectangle';
                if (nodeData.width === undefined) nodeData.width = 200;
                if (nodeData.height === undefined) nodeData.height = 150;
                if (nodeData.color === undefined) nodeData.color = '#d3d3d3';

                let baseLabel = nodeData.baseLabel || nodeData.label || '';
                baseLabel = baseLabel.replace(/\s*[\u25B6\u25BC]\s*$/, '');
                nodeData.baseLabel = baseLabel;
                const collapsed = !!nodeData.collapsed;
                if (collapsed) {
                    nodeData.collapsed = true;
                } else {
                    delete nodeData.collapsed;
                }
                nodeData.label = baseLabel;
            }

            if (nodeData.info === undefined) {
                nodeData.info = '';
            }
            this.ensureNodeGraphLink(nodeData);
            if (typeof nodeData.backgroundImage === 'string' && nodeData.backgroundImage.trim() === '') {
                delete nodeData.backgroundImage;
            }
            if (typeof nodeData['background-image'] === 'string' && nodeData['background-image'].trim() === '') {
                delete nodeData['background-image'];
            }

            delete nodeData['border-width'];
            delete nodeData['border-color'];
            delete nodeData.borderWidth;
            delete nodeData.borderColor;

            const { classes, locked, ...data } = nodeData;
            if (data.lockedX !== undefined) {
                const normalizedLockedX = Number(data.lockedX);
                if (Number.isFinite(normalizedLockedX)) {
                    data.lockedX = normalizedLockedX;
                } else {
                    delete data.lockedX;
                }
            }

            const position = data.x !== undefined && data.y !== undefined ? { x: data.x, y: data.y } : undefined;

            nodeElements.push({
                group: 'nodes',
                data,
                classes,
                locked,
                position
            });

            const entryData = nodeData.data && typeof nodeData.data === 'object' ? nodeData.data : nodeData;
            const id = entryData && entryData.id != null ? String(entryData.id) : nodeData.id != null ? String(nodeData.id) : null;
            if (!id) {
                return;
            }

            const topLevelPosition = nodeData.position && typeof nodeData.position === 'object' ? nodeData.position : null;
            const nestedPosition = entryData && typeof entryData.position === 'object' ? entryData.position : null;
            const simplePosition =
                nodeData.x !== undefined && nodeData.y !== undefined
                    ? { x: nodeData.x, y: nodeData.y }
                    : entryData && entryData.x !== undefined && entryData.y !== undefined
                    ? { x: entryData.x, y: entryData.y }
                    : null;

            const storedPosition =
                coercePosition(topLevelPosition) ||
                coercePosition(nestedPosition) ||
                coercePosition(simplePosition);

            const normalizedLockedX = Number(
                Object.prototype.hasOwnProperty.call(entryData, 'lockedX')
                    ? entryData.lockedX
                    : Object.prototype.hasOwnProperty.call(nodeData, 'lockedX')
                    ? nodeData.lockedX
                    : undefined
            );

            const record = {
                position: storedPosition,
                locked: nodeData.locked !== undefined ? nodeData.locked : entryData?.locked,
                grabbable: nodeData.grabbable !== undefined ? nodeData.grabbable : entryData?.grabbable,
                selectable: nodeData.selectable !== undefined ? nodeData.selectable : entryData?.selectable
            };

            if (Number.isFinite(normalizedLockedX)) {
                record.lockedX = normalizedLockedX;
            }

            storedNodeState.set(id, record);
        });

        const edgeElements = graphData.edges.map(edgeData => ({
            group: 'edges',
            data: edgeData
        }));

        // Add all elements in a single batch after preparation
        let addedNodes = [];
        let addedEdges = [];
        if (typeof this.cy.batch === 'function') {
            this.cy.batch(() => {
                if (nodeElements.length) {
                    addedNodes = this.cy.add(nodeElements);
                }
                if (edgeElements.length) {
                    addedEdges = this.cy.add(edgeElements);
                }
            });
        } else {
            if (nodeElements.length) {
                addedNodes = nodeElements.map(el => this.cy.add(el));
            }
            if (edgeElements.length) {
                addedEdges = edgeElements.map(el => this.cy.add(el));
            }
        }

        addedNodes = Array.from(addedNodes || []);
        addedEdges = Array.from(addedEdges || []);

        // Ensure pinned nodes remain locked after reload
        addedNodes.forEach(node => {
            if (!node) return;
            const pinned = typeof node.data === 'function' ? node.data('pinned') : node.pinned;
            const isLocked = typeof node.locked === 'function' ? node.locked() : node.locked;
            if (pinned || isLocked) {
                if (typeof node.lock === 'function') {
                    node.lock();
                }
            }
        });

        // Index nodes and edges after they are added to the graph
        addedNodes.forEach(node => {
            if (!node) return;
            const id = typeof node.id === 'function' ? node.id() : node.data?.id;
            if (id) this.nodeIndex.set(id, node);
            const type = (typeof node.data === 'function' ? node.data('type') : node.data?.type) || 'default';
            if (!this.typeIndex.has(type)) {
                this.typeIndex.set(type, []);
            }
            this.typeIndex.get(type).push(node);
        });

        addedEdges.forEach(edge => {
            if (!edge) return;
            const id = typeof edge.id === 'function' ? edge.id() : edge.data?.id;
            if (id) this.edgeIndex.set(id, edge);
        });

        // Store graph data
        this.graphData = graphData;

        if (layoutSettings && window.LayoutManager) {
            if (layoutSettings.currentLayout) {
                window.LayoutManager.currentLayout = layoutSettings.currentLayout;
                if (typeof window.LayoutManager.updateLayoutDropdown === 'function') {
                    try {
                        window.LayoutManager.updateLayoutDropdown();
                    } catch (error) {
                        console.error('Error updating layout dropdown:', error);
                    }
                }
            }
        }

        if (storedNodeState.size > 0) {
            addedNodes.forEach(node => {
                if (!node || typeof node.id !== 'function') {
                    return;
                }

                const id = String(node.id());
                const state = storedNodeState.get(id);
                if (!state) {
                    return;
                }

                if (state.position && typeof node.position === 'function') {
                    try {
                        node.position({ x: state.position.x, y: state.position.y });
                    } catch (error) {
                        console.error(`Error restoring position for node ${id}:`, error);
                    }
                }

                if (state.lockedX !== undefined && typeof node.data === 'function') {
                    node.data('lockedX', state.lockedX);
                } else if (typeof node.removeData === 'function') {
                    node.removeData('lockedX');
                }

                if (state.locked !== undefined) {
                    if (state.locked && typeof node.lock === 'function') {
                        node.lock();
                    } else if (!state.locked && typeof node.unlock === 'function') {
                        node.unlock();
                    }
                }

                if (state.grabbable !== undefined && typeof node.grabbable === 'function') {
                    node.grabbable(!!state.grabbable);
                }

                if (state.selectable !== undefined && typeof node.selectable === 'function') {
                    node.selectable(!!state.selectable);
                }
            });
        }

        this.syncExternalManagers(graphData);
        this.applyViewportAndPostRenderSettings(layoutSettings, hasViewportSettings);
        this._selectImportedNodes(this.cy, addedNodes, graphData, { select: selectImportedNodes });

    }

    resetViewportBeforeGraphLoad() {
        const candidateCy = this.cy || (window.GraphRenderer && window.GraphRenderer.cy) || null;
        if (!candidateCy) {
            return;
        }

        try {
            if (typeof candidateCy.zoom === 'function') {
                candidateCy.zoom(1);
            }
        } catch (error) {
            console.warn('Unable to reset viewport zoom before graph load:', error);
        }
    }

    syncExternalManagers(graphData) {
        if (window.DataManager && typeof window.DataManager.setGraphData === 'function') {
            window.DataManager.setGraphData(graphData);
        }

        if (window.GraphManager) {
            window.GraphManager.currentGraph = graphData;
            if (typeof window.GraphManager.updateGraphUI === 'function') {
                window.GraphManager.updateGraphUI();
            }
        }
    }

    rebuildIndexesFromCyInstance(cy) {
        this.nodeIndex.clear();
        this.edgeIndex.clear();
        this.typeIndex.clear();

        if (!cy || typeof cy.nodes !== 'function' || typeof cy.edges !== 'function') {
            return;
        }

        const nodes = Array.from(cy.nodes());
        nodes.forEach(node => {
            if (!node) {
                return;
            }
            const id = typeof node.id === 'function' ? node.id() : node.data?.id;
            if (id) {
                this.nodeIndex.set(id, node);
            }
            const type = (typeof node.data === 'function' ? node.data('type') : node.data?.type) || 'default';
            if (!this.typeIndex.has(type)) {
                this.typeIndex.set(type, []);
            }
            this.typeIndex.get(type).push(node);
        });

        const edges = Array.from(cy.edges());
        edges.forEach(edge => {
            if (!edge) {
                return;
            }
            const id = typeof edge.id === 'function' ? edge.id() : edge.data?.id;
            if (id) {
                this.edgeIndex.set(id, edge);
            }
        });
    }

    applyViewportAndPostRenderSettings(layoutSettings, hasViewportSettings) {
        if (!this.cy) {
            return;
        }

        if (hasViewportSettings) {
            setTimeout(() => {
                try {
                    if (typeof this.cy.zoom === 'function') {
                        this.cy.zoom(layoutSettings.zoom);
                    }
                    if (typeof this.cy.pan === 'function') {
                        this.cy.pan(layoutSettings.pan);
                    }
                } catch (error) {
                    console.error('Error restoring viewport settings:', error);
                }
            }, 200);
        } else if (typeof this.cy.fit === 'function') {
            this.cy.fit();
        }

        const currentLayout = layoutSettings?.currentLayout || (window.LayoutManager?.currentLayout);
        if (currentLayout === 'timeline') {
            setTimeout(() => {
                try {
                    if (window.CustomLayouts && typeof window.CustomLayouts.rebuildTimelineConnectors === 'function') {
                        console.log('[FileManager] Rebuilding timeline connectors for loaded graph');
                        window.CustomLayouts.rebuildTimelineConnectors(this.cy);
                        this.applyTimelineDragConstraints();
                        console.log('[FileManager] Timeline behavior restored without repositioning nodes');
                    }
                } catch (error) {
                    console.error('Error rebuilding timeline connectors during file load:', error);
                }
            }, 100);
        }

        if (window.GraphAreaEditor && typeof window.GraphAreaEditor.applySettings === 'function') {
            try {
                window.GraphAreaEditor.applySettings();
            } catch (error) {
                console.error('Error applying GraphAreaEditor settings:', error);
            }
        }
    }

    /**
     * Apply timeline drag constraints without repositioning nodes
     */
    applyTimelineDragConstraints() {
        if (!this.cy) {
            return;
        }

        // Helper function to check if a node is a container
        const isContainerNode = node => {
            if (!node || typeof node.data !== 'function') {
                return false;
            }
            const data = node.data();
            return data && (data.type === 'container' || data.isContainer === true);
        };

        const resolveTimelineScopeKey = scopeId => {
            if (typeof scopeId === 'string' && scopeId.length > 0) {
                return scopeId;
            }
            return '__root__';
        };

        const updateLockedXForContainer = container => {
            if (!container || typeof container.descendants !== 'function') {
                return;
            }

            const containerScopeKey = resolveTimelineScopeKey(container.id());
            const descendants = container.descendants('node');

            descendants.forEach(child => {
                if (!child || typeof child.data !== 'function') {
                    return;
                }

                const type = child.data('type');
                if (type === 'container' || type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick') {
                    return;
                }

                const scopedKey = resolveTimelineScopeKey(child.data('_timelineScope'));
                const hasLockedX = normalizeNodeLockedX(child) !== undefined;
                if (!hasLockedX && scopedKey !== containerScopeKey) {
                    return;
                }

                const position = typeof child.position === 'function' ? child.position() : null;
                if (position && Number.isFinite(position.x)) {
                    child.data('lockedX', position.x);
                }
            });
        };

        const normalizeNodeLockedX = node => {
            if (!node || typeof node.data !== 'function') {
                return undefined;
            }

            const rawLockedX = node.data('lockedX');
            if (rawLockedX === undefined || rawLockedX === null) {
                return undefined;
            }

            if (typeof rawLockedX === 'string' && rawLockedX.trim() === '') {
                if (typeof node.removeData === 'function') {
                    node.removeData('lockedX');
                }
                return undefined;
            }

            const coerced = Number(rawLockedX);
            if (!Number.isFinite(coerced)) {
                if (typeof node.removeData === 'function') {
                    node.removeData('lockedX');
                }
                return undefined;
            }

            node.data('lockedX', coerced);
            return coerced;
        };

        // Remove any existing timeline handlers from previous setups
        if (this.cy._timelineResetX) {
            this.cy.off('grab drag position free', 'node[type!="timeline-bar"][type!="timeline-anchor"][type!="timeline-tick"]', this.cy._timelineResetX);
        }
        if (this.cy._timelineContainerGrabHandler) {
            this.cy.off('grab', 'node', this.cy._timelineContainerGrabHandler);
        }
        if (this.cy._timelineContainerFreeHandler) {
            this.cy.off('free dragfree', 'node', this.cy._timelineContainerFreeHandler);
        }

        const lockTimelineScaffoldingElements = () => {
            if (window.GraphManager && typeof window.GraphManager._lockTimelineScaffoldingElements === 'function') {
                window.GraphManager._lockTimelineScaffoldingElements();
                return;
            }

            const timelineScaffolding = this.cy.nodes('[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]');
            if (timelineScaffolding && typeof timelineScaffolding.forEach === 'function') {
                this.cy.batch(() => {
                    timelineScaffolding.forEach(node => {
                        if (!node) {
                            return;
                        }

                        if (typeof node.ungrabify === 'function') {
                            node.ungrabify();
                        } else if (typeof node.grabbable === 'function') {
                            node.grabbable(false);
                        }

                        if (typeof node.lock === 'function') {
                            node.lock();
                        } else if (typeof node.locked === 'function') {
                            node.locked(true);
                        }

                        if (typeof node.selectable === 'function') {
                            node.selectable(node.data && node.data('type') === 'timeline-bar');
                        }
                        if (typeof node.selectify === 'function') {
                            node.selectify();
                        }
                    });
                });
            }
        };

        // Define the resetX function that constrains node movement to y-axis only
        const resetX = evt => {
            const node = evt.target;
            
            // Skip if this node is suppressed (during container movement)
            if (typeof node.scratch === 'function' && node.scratch('_timelineSuppressResetX')) {
                return;
            }

            const lockedX = normalizeNodeLockedX(node);
            if (lockedX !== undefined && node.position('x') !== lockedX) {
                const y = node.position('y');
                // Only lock the x-coordinate; preserve the current y-position
                node.position({ x: lockedX, y });
            }
        };

        // Store the handler so it can be removed on subsequent runs
        this.cy._timelineResetX = resetX;

        const getScopedTimelineScaffolding = container => {
            return this.cy.nodes('[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]').filter(node => {
                if (!node || typeof node.data !== 'function') {
                    return false;
                }

                const scopeKey = resolveTimelineScopeKey(node.data('_timelineScope'));
                const matchesScope = scopeKey === resolveTimelineScopeKey(container.id());
                const parent = typeof node.parent === 'function' ? node.parent() : null;
                const isCurrentChild = parent && typeof parent.id === 'function' && parent.id() === container.id();

                return matchesScope || isCurrentChild;
            });
        };

        const containerGrabHandler = evt => {
            const container = evt.target;
            if (!container || container.length === 0 || !isContainerNode(container) || typeof container.descendants !== 'function') {
                return;
            }

            const descendants = container.descendants('node');
            descendants.forEach(child => {
                if (typeof child.scratch === 'function') {
                    child.scratch('_timelineSuppressResetX', true);
                }
            });

            const scopedScaffolding = getScopedTimelineScaffolding(container);

            scopedScaffolding.forEach(scaffold => {
                if (typeof scaffold.locked === 'function' && scaffold.locked()) {
                    if (typeof scaffold.unlock === 'function') {
                        scaffold.unlock();
                    } else {
                        scaffold.locked(false);
                    }
                }
                if (typeof scaffold.scratch === 'function') {
                    scaffold.scratch('_timelineSuppressResetX', true);
                }
                scaffold.grabbable(false);
                scaffold.selectable(false);

                const parent = typeof scaffold.parent === 'function' ? scaffold.parent() : null;
                if (typeof scaffold.scratch === 'function' && scaffold.scratch('_timelineOriginalParent') === undefined) {
                    const parentId = parent && parent.length > 0 && typeof parent.id === 'function' ? parent.id() : null;
                    scaffold.scratch('_timelineOriginalParent', parentId);
                }

                if (!parent || parent.length === 0 || parent.id() !== container.id()) {
                    scaffold.move({ parent: container.id() });
                }
            });
        };

        const containerFreeHandler = evt => {
            const container = evt.target;
            if (!container || container.length === 0 || !isContainerNode(container) || typeof container.descendants !== 'function') {
                return;
            }

            const clearSuppression = () => {
                const descendants = container.descendants('node');
                descendants.forEach(child => {
                    if (typeof child.removeScratch === 'function') {
                        child.removeScratch('_timelineSuppressResetX');
                    }
                });

                updateLockedXForContainer(container);

                const scopedScaffolding = getScopedTimelineScaffolding(container);

                scopedScaffolding.forEach(scaffold => {
                    const originalParent = typeof scaffold.scratch === 'function' ? scaffold.scratch('_timelineOriginalParent') : undefined;
                    if (typeof scaffold.removeScratch === 'function') {
                        scaffold.removeScratch('_timelineSuppressResetX');
                    }
                    if (originalParent !== undefined && typeof scaffold.move === 'function') {
                        scaffold.move({ parent: originalParent || null });
                    }
                    if (typeof scaffold.removeScratch === 'function') {
                        scaffold.removeScratch('_timelineOriginalParent');
                    }
                });

                lockTimelineScaffoldingElements();
            };

            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(clearSuppression);
            } else {
                setTimeout(clearSuppression, 0);
            }
        };

        // Store handlers for cleanup
        this.cy._timelineContainerGrabHandler = containerGrabHandler;
        this.cy._timelineContainerFreeHandler = containerFreeHandler;

        // Ensure timeline scaffolding elements are non-grabbable and non-selectable
        this.cy.nodes().forEach(node => {
            const type = node.data('type');
            if (type === 'timeline-bar' || type === 'timeline-anchor' || type === 'timeline-tick') {
                if (typeof node.locked === 'function' && node.locked()) {
                    node.locked(false);
                }
                node.grabbable(false);
                node.selectable(false);
            }
        });

        // Apply the constraint handlers
        this.cy.on('grab drag position free', 'node[type!="timeline-bar"][type!="timeline-anchor"][type!="timeline-tick"]', resetX);
        this.cy.on('grab', 'node', containerGrabHandler);
        this.cy.on('free dragfree', 'node', containerFreeHandler);

        // Ensure the timeline scaffolding stays fixed after constraints are applied
        lockTimelineScaffoldingElements();

        console.log('[FileManager] Timeline drag constraints applied - nodes locked to x-axis with container support');
    }
    
    /**
     * Export current graph from Cytoscape
     */
    exportCurrentGraph() {
        if (!this.cy) return { nodes: [], edges: [] };

        const parseDimension = (value) => {
            if (typeof value === 'number') {
                return Number.isFinite(value) ? value : null;
            }
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                    return null;
                }
                const parsed = parseFloat(trimmed);
                return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
        };

        const resolveDimension = (preferred, fallback) => {
            if (Number.isFinite(preferred) && preferred > 0) {
                return preferred;
            }
            if (Number.isFinite(fallback) && fallback > 0) {
                return fallback;
            }
            return null;
        };

        const clampNumber = (value, min, max) => {
            if (!Number.isFinite(value)) {
                return null;
            }
            let result = value;
            if (Number.isFinite(min) && result < min) {
                result = min;
            }
            if (Number.isFinite(max) && result > max) {
                result = max;
            }
            return result;
        };

        const sizeSettings = (() => {
            const globalConfig = typeof window !== 'undefined' ? window.QuantickleConfig : null;
            const nodeSizeSettings = globalConfig && globalConfig.nodeSizeSettings ? globalConfig.nodeSizeSettings : {};
            const minSize = Number.isFinite(nodeSizeSettings.minSize) ? nodeSizeSettings.minSize : 1;
            const maxSize = Number.isFinite(nodeSizeSettings.maxSize) ? nodeSizeSettings.maxSize : 200;
            const defaultSize = Number.isFinite(globalConfig && globalConfig.defaultNodeSize)
                ? globalConfig.defaultNodeSize
                : 30;
            return {
                min: minSize,
                max: maxSize,
                default: clampNumber(defaultSize, minSize, maxSize) || minSize
            };
        })();

        const nodeRequiresExplicitDimensions = (node, data = {}) => {
            const type = data?.type;
            const isContainerType = type === 'container' || data?.isContainer === true;
            const hasContainerClass = (() => {
                try {
                    return typeof node?.hasClass === 'function' && node.hasClass('container');
                } catch (_) {
                    return false;
                }
            })();
            return Boolean(isContainerType || hasContainerClass);
        };

        const dataUriPattern = /^\s*(?:url\((['"]?)\s*)?data:/i;
        const wrapAsUrl = (src) => {
            if (typeof src !== 'string') {
                return null;
            }
            const trimmed = src.trim();
            if (!trimmed) {
                return null;
            }
            if (/^url\(/i.test(trimmed)) {
                return trimmed;
            }
            const escaped = trimmed.replace(/"/g, '\\"');
            return `url("${escaped}")`;
        };
        const resolveIconReference = (icon) => {
            if (typeof icon !== 'string') {
                return null;
            }
            const trimmed = icon.trim();
            if (!trimmed) {
                return null;
            }
            const candidates = [];
            if (window.IconConfigs && typeof window.IconConfigs === 'object') {
                const mapped = window.IconConfigs[trimmed];
                if (typeof mapped === 'string' && mapped.trim()) {
                    candidates.push(mapped.trim());
                }
            }
            const looksLikePath = /^(https?:|file:)/i.test(trimmed) ||
                trimmed.startsWith('/') ||
                trimmed.startsWith('./') ||
                trimmed.startsWith('../') ||
                /\.(png|jpe?g|gif|svg)$/i.test(trimmed);
            if (looksLikePath) {
                candidates.push(trimmed);
            }
            for (const candidate of candidates) {
                if (typeof candidate !== 'string') {
                    continue;
                }
                const normalized = candidate.trim();
                if (!normalized || /^data:/i.test(normalized)) {
                    continue;
                }
                const wrapped = wrapAsUrl(normalized);
                if (wrapped) {
                    return wrapped;
                }
            }
            return null;
        };
        const sanitizeBackgroundImage = (data) => {
            if (!data || typeof data !== 'object') {
                return;
            }
            ['backgroundImage', 'background-image'].forEach(key => {
                const value = data[key];
                if (typeof value !== 'string') {
                    return;
                }
                const trimmed = value.trim();
                if (!trimmed || !dataUriPattern.test(trimmed)) {
                    return;
                }
                const replacement = resolveIconReference(data.icon);
                if (replacement) {
                    data[key] = replacement;
                    return;
                }
                delete data[key];
            });
        };

        const isGraphReturnNode = (node) => {
            if (!node) {
                return false;
            }

            try {
                if (typeof node.hasClass === 'function' && node.hasClass('graph-return-node')) {
                    return true;
                }
            } catch (error) {
                // Ignore class lookup failures and fall back to data inspection
            }

            try {
                if (typeof node.data === 'function') {
                    if (node.data('graphReturn')) {
                        return true;
                    }

                    const rawData = node.data();
                    if (rawData && rawData.graphReturn) {
                        return true;
                    }
                }
            } catch (error) {
                // Ignore data lookup failures
            }

            if (node.data && typeof node.data === 'object' && node.data.graphReturn) {
                return true;
            }

            return false;
        };

        const nodeCollection = this.cy.nodes();
        const filteredNodes = [];
        const excludedNodeIds = new Set();

        const visitNode = (node) => {
            if (isGraphReturnNode(node)) {
                try {
                    const nodeId = typeof node.id === 'function' ? node.id() : node.id;
                    if (nodeId) {
                        excludedNodeIds.add(nodeId);
                    }
                } catch (error) {
                    // Ignore ID extraction failures
                }
                return;
            }

            filteredNodes.push(node);
        };

        if (nodeCollection && typeof nodeCollection.forEach === 'function') {
            nodeCollection.forEach(visitNode);
        } else if (Array.isArray(nodeCollection)) {
            nodeCollection.forEach(visitNode);
        } else if (nodeCollection && typeof nodeCollection.length === 'number') {
            for (let i = 0; i < nodeCollection.length; i += 1) {
                visitNode(nodeCollection[i]);
            }
        }

        const nodes = filteredNodes.map(node => {
            const data = { ...node.data() };
            sanitizeBackgroundImage(data);
            if (data.info === undefined) {
                data.info = '';
            }
            this.ensureNodeGraphLink(data);

            const locked = data.pinned === true || data.locked === true;

            const safeBoundingBox = () => {
                if (!node || typeof node.boundingBox !== 'function') {
                    return null;
                }
                try {
                    return node.boundingBox();
                } catch (_) {
                    return null;
                }
            };

            const boundingBox = safeBoundingBox();
            const measuredWidth = boundingBox
                ? Math.max(boundingBox.w || 0, boundingBox.width || 0)
                : null;
            const measuredHeight = boundingBox
                ? Math.max(boundingBox.h || 0, boundingBox.height || 0)
                : null;
            const fallbackWidth = Number.isFinite(measuredWidth) && measuredWidth > 0
                ? measuredWidth
                : (() => {
                    if (typeof node.width === 'function') {
                        try {
                            return node.width();
                        } catch (_) {
                            return null;
                        }
                    }
                    return null;
                })();
            const fallbackHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
                ? measuredHeight
                : (() => {
                    if (typeof node.height === 'function') {
                        try {
                            return node.height();
                        } catch (_) {
                            return null;
                        }
                    }
                    return null;
                })();

            const requiresExplicitDimensions = nodeRequiresExplicitDimensions(node, data);
            const hasWidthInData = Object.prototype.hasOwnProperty.call(data, 'width');
            const hasHeightInData = Object.prototype.hasOwnProperty.call(data, 'height');
            const widthFromData = parseDimension(data.width);
            const heightFromData = parseDimension(data.height);
            const resolvedWidth = resolveDimension(
                widthFromData,
                (hasWidthInData || requiresExplicitDimensions) ? fallbackWidth : null
            );
            const resolvedHeight = resolveDimension(
                heightFromData,
                (hasHeightInData || requiresExplicitDimensions) ? fallbackHeight : null
            );

            if (hasWidthInData || requiresExplicitDimensions) {
                if (resolvedWidth !== null) {
                    data.width = resolvedWidth;
                } else {
                    delete data.width;
                }
            } else {
                delete data.width;
            }

            if (hasHeightInData || requiresExplicitDimensions) {
                if (resolvedHeight !== null) {
                    data.height = resolvedHeight;
                } else {
                    delete data.height;
                }
            } else {
                delete data.height;
            }

            const hasSizeInData = Object.prototype.hasOwnProperty.call(data, 'size');
            const hasIntendedSize = Object.prototype.hasOwnProperty.call(data, 'intendedSize');
            const sizeFromData = parseDimension(data.size);
            const intendedSizeFromData = parseDimension(data.intendedSize);
            let resolvedSize = Number.isFinite(sizeFromData) ? sizeFromData : null;
            if (!Number.isFinite(resolvedSize) && Number.isFinite(intendedSizeFromData)) {
                resolvedSize = intendedSizeFromData;
            }
            if (!Number.isFinite(resolvedSize) || resolvedSize <= 0) {
                resolvedSize = sizeSettings.default;
            }

            const normalizedSize = clampNumber(resolvedSize, sizeSettings.min, sizeSettings.max);
            if (Number.isFinite(normalizedSize) && normalizedSize > 0) {
                if (hasSizeInData || hasIntendedSize || requiresExplicitDimensions) {
                    data.size = normalizedSize;
                } else {
                    delete data.size;
                }
            } else {
                delete data.size;
            }

            return {
                id: node.id(),
                ...data,
                locked,
                x: node.position('x'),
                y: node.position('y')
            };
        });

        const nodeTypeStyles = this.buildNodeTypeStylesForExport(nodes);
        const optimizedNodes = this.stripNodeDefaultsForExport(nodes, nodeTypeStyles);

        const edges = [];
        const edgeCollection = this.cy.edges();
        const visitEdge = (edge) => {
            try {
                const data = typeof edge.data === 'function' ? edge.data() : edge.data || {};
                const sourceId = data ? data.source : undefined;
                const targetId = data ? data.target : undefined;

                if ((sourceId && excludedNodeIds.has(sourceId)) || (targetId && excludedNodeIds.has(targetId))) {
                    return;
                }

                const edgeData = { ...data };

                if (edgeData.label == null && typeof edge.style === 'function') {
                    const styleLabel = edge.style('label');
                    if (styleLabel) {
                        edgeData.label = styleLabel;
                    }
                }

                if (edgeData.color == null && typeof edge.style === 'function') {
                    const lineColor = edge.style('line-color');
                    if (lineColor) {
                        edgeData.color = lineColor;
                    }
                }

                edges.push({
                    id: edge.id(),
                    ...edgeData
                });
            } catch (error) {
                // Skip edges that fail processing
            }
        };

        if (edgeCollection && typeof edgeCollection.forEach === 'function') {
            edgeCollection.forEach(visitEdge);
        } else if (Array.isArray(edgeCollection)) {
            edgeCollection.forEach(visitEdge);
        } else if (edgeCollection && typeof edgeCollection.length === 'number') {
            for (let i = 0; i < edgeCollection.length; i += 1) {
                visitEdge(edgeCollection[i]);
            }
        }
        
        const graphAreaSettings =
            window.QuantickleConfig &&
            window.QuantickleConfig.graphAreaSettings &&
            typeof window.QuantickleConfig.graphAreaSettings.extractCurrentSettings === 'function'
                ? window.QuantickleConfig.graphAreaSettings.extractCurrentSettings()
                : undefined;

        const layoutSettings = {
            currentLayout: (window.LayoutManager && window.LayoutManager.currentLayout) || null,
            zoom: this.cy.zoom(),
            pan: this.cy.pan()
        };

        return {
            nodes: optimizedNodes,
            edges,
            graphAreaSettings,
            layoutSettings,
            metadata: {
                exportDate: new Date().toISOString(),
                nodeCount: nodes.length,
                edgeCount: edges.length,
                version: '1.0',
                name:
                    (window.DataManager && window.DataManager.currentGraphName) ||
                    (this.currentFile && this.currentFile.name) ||
                    'Unsaved graph',
                ...(Object.keys(nodeTypeStyles).length ? { nodeTypeStyles } : {})
            }
        };
    }
    
    /**
     * Export graph to CSV format
     */
    exportToCSV() {
        const graphData = this.exportCurrentGraph();

        const sanitizeValue = value => {
            if (value == null) {
                return '';
            }
            return String(value)
                .replace(/\r?\n/g, ' ')
                .replace(/,/g, ';');
        };

        const nodeHeaders = [
            'node_id',
            'node_label',
            'node_type',
            'node_size',
            'node_color',
            'node_x',
            'node_y'
        ];

        const rows = [nodeHeaders.join(',')];

        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        graphData.nodes.forEach(node => {
            const row = [
                sanitizeValue(node.id),
                sanitizeValue(node.label || node.name || node.id),
                sanitizeValue(node.type || 'default'),
                sanitizeValue(node.size != null ? node.size : 30),
                sanitizeValue(node.color || defaultNodeColor),
                sanitizeValue(node.x != null ? node.x : ''),
                sanitizeValue(node.y != null ? node.y : '')
            ];
            rows.push(row.join(','));
        });

        rows.push('');

        const edgeHeaders = ['source', 'target', 'label', 'weight', 'type'];
        rows.push(edgeHeaders.join(','));

        graphData.edges.forEach(edge => {
            const row = [
                sanitizeValue(edge.source || ''),
                sanitizeValue(edge.target || ''),
                sanitizeValue(edge.label || ''),
                sanitizeValue(edge.weight != null ? edge.weight : 1),
                sanitizeValue(edge.type || 'default')
            ];
            rows.push(row.join(','));
        });

        return rows.join('\n');
    }
    
    /**
     * Generate sample graph data
     */
    generateSampleGraph() {
        const nodes = [
            { id: 'node1', label: 'Central Hub', type: 'hub', color: '#ff6b6b', size: 40 },
            { id: 'node2', label: 'Data Source', type: 'source', color: '#4ecdc4', size: 30 },
            { id: 'node3', label: 'Processing Unit', type: 'processor', color: '#45b7d1', size: 30 },
            { id: 'node4', label: 'Output Terminal', type: 'output', color: '#96ceb4', size: 30 },
            { id: 'node5', label: 'Storage', type: 'storage', color: '#ffeaa7', size: 25 },
            { id: 'node6', label: 'Monitor', type: 'monitor', color: '#dda0dd', size: 25 }
        ];
        
        const edges = [
            { id: 'edge1', source: 'node1', target: 'node2', label: 'feeds', weight: 2 },
            { id: 'edge2', source: 'node1', target: 'node3', label: 'controls', weight: 3 },
            { id: 'edge3', source: 'node2', target: 'node3', label: 'processes', weight: 1 },
            { id: 'edge4', source: 'node3', target: 'node4', label: 'outputs', weight: 2 },
            { id: 'edge5', source: 'node3', target: 'node5', label: 'stores', weight: 1 },
            { id: 'edge6', source: 'node1', target: 'node6', label: 'monitors', weight: 1 }
        ];
        
        return { nodes, edges };
    }
    
    /**
     * Validate graph data structure
     */
    validateGraphData(data) {
        if (!data || typeof data !== 'object') return false;
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return false;
        
        // Validate nodes have required fields
        for (const node of data.nodes) {
            if (!node.id) return false;
        }
        
        // Validate edges have required fields
        for (const edge of data.edges) {
            if (!edge.id || !edge.source || !edge.target) return false;
        }

        return true;
    }

    /**
     * Check if graph data references external resources
     */
    containsExternalResources(data) {
        const urlRegex = /^(https?:|file:)/i;
        const bgRegex = /^url\(["']?(https?:|file:)/i;
        return Boolean((data.nodes || []).some(node => {
            const n = node.data || node;
            return (n.icon && urlRegex.test(n.icon)) ||
                   (n.backgroundImage && bgRegex.test(n.backgroundImage)) ||
                   (n['background-image'] && bgRegex.test(n['background-image']));
        }) || (
            data.graphAreaSettings &&
            data.graphAreaSettings.background &&
            typeof data.graphAreaSettings.background.backgroundImage === 'string' &&
            urlRegex.test(data.graphAreaSettings.background.backgroundImage)
        ));
    }

    /**
     * Show selection dialog for Neo4j graphs
     */
    showNeo4jGraphSelection(graphs, options = {}) {
        const { title = 'Select graph to load', confirmLabel = 'Load', cancelLabel = 'Cancel' } = options;
        const items = this.normalizeNeo4jGraphList(graphs);

        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.75);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(4px);
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: rgba(17, 24, 39, 0.95);
                color: #f8fafc;
                padding: 24px;
                border-radius: 14px;
                max-width: 420px;
                width: calc(100% - 32px);
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
            `;

            const heading = document.createElement('h3');
            heading.textContent = title;
            heading.style.margin = '0 0 12px';
            heading.style.fontSize = '18px';
            heading.style.fontWeight = '600';
            dialog.appendChild(heading);

            let listControl;
            let confirmBtn;
            const updateConfirmState = () => {
                if (!confirmBtn || !listControl) {
                    return;
                }

                const hasSelection = Boolean(listControl.getSelected());
                confirmBtn.disabled = !hasSelection;
                confirmBtn.style.opacity = hasSelection ? '1' : '0.6';
                confirmBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
            };

            listControl = this.buildNeo4jGraphList(items, {
                onSelectChange: () => updateConfirmState(),
                onConfirm: selection => finish(selection)
            });
            dialog.appendChild(listControl.container);

            const buttons = document.createElement('div');
            buttons.style.display = 'flex';
            buttons.style.justifyContent = 'flex-end';
            buttons.style.gap = '10px';
            buttons.style.marginTop = '16px';

            confirmBtn = document.createElement('button');
            confirmBtn.id = 'neo4j-load-confirm';
            confirmBtn.textContent = confirmLabel;
            confirmBtn.style.padding = '10px 16px';
            confirmBtn.style.borderRadius = '8px';
            confirmBtn.style.border = 'none';
            confirmBtn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.55), rgba(129, 140, 248, 0.55))';
            confirmBtn.style.color = '#f8fafc';
            confirmBtn.style.cursor = 'pointer';

            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'neo4j-load-cancel';
            cancelBtn.textContent = cancelLabel;
            cancelBtn.style.padding = '10px 16px';
            cancelBtn.style.borderRadius = '8px';
            cancelBtn.style.border = 'none';
            cancelBtn.style.background = 'rgba(59, 130, 246, 0.15)';
            cancelBtn.style.color = '#f8fafc';
            cancelBtn.style.cursor = 'pointer';

            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            dialog.appendChild(buttons);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = () => {
                if (overlay.parentElement) {
                    overlay.parentElement.removeChild(overlay);
                }
                document.removeEventListener('keydown', keyHandler);
            };

            const finish = value => {
                cleanup();
                resolve(value);
            };

            const keyHandler = event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(null);
                }
            };

            confirmBtn.addEventListener('click', () => {
                const selected = listControl.getSelected();
                finish(selected || null);
            });

            cancelBtn.addEventListener('click', () => finish(null));

            overlay.addEventListener('click', event => {
                if (event.target === overlay) {
                    finish(null);
                }
            });

            document.addEventListener('keydown', keyHandler);
            updateConfirmState();
            listControl.focus();
        });
    }

    /**
     * Show warning dialog for external resources
     */
    showExternalResourcePrompt() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #1f2937;
                color: #f9fafb;
                padding: 20px;
                border-radius: 8px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            `;
            dialog.innerHTML = `
                <p style="margin-bottom:15px;">This file tries to load external content. If you received this file from an untrusted source, it is recommended to block this action.</p>
            `;

            const buttons = document.createElement('div');
            buttons.style.marginTop = '10px';

            const allowBtn = document.createElement('button');
            allowBtn.textContent = 'Allow';
            allowBtn.style.marginRight = '10px';
            allowBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };

            const blockBtn = document.createElement('button');
            blockBtn.textContent = 'Block';
            blockBtn.style.background = '#e53e3e';
            blockBtn.style.color = '#fff';
            blockBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };

            buttons.appendChild(allowBtn);
            buttons.appendChild(blockBtn);
            dialog.appendChild(buttons);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        });
    }

    /**
     * Remove external resource references from graph data
     */
    stripExternalResources(data) {
        const urlRegex = /^(https?:|file:)/i;
        const bgRegex = /^url\(["']?(https?:|file:)/i;
        (data.nodes || []).forEach(node => {
            const n = node.data || node;
            if (n.icon && urlRegex.test(n.icon)) {
                delete n.icon;
            }
            if (n.backgroundImage && bgRegex.test(n.backgroundImage)) {
                delete n.backgroundImage;
            }
            if (n['background-image'] && bgRegex.test(n['background-image'])) {
                delete n['background-image'];
            }
        });

        if (data.graphAreaSettings && data.graphAreaSettings.background) {
            const bg = data.graphAreaSettings.background.backgroundImage;
            if (bg && urlRegex.test(bg)) {
                delete data.graphAreaSettings.background.backgroundImage;
            }
        }

    }

    flattenGraphMetadata(rawData) {
        if (!rawData || typeof rawData !== 'object') {
            return rawData;
        }

        const base = { ...rawData };
        const metadata = base.metadata;

        if (!metadata || typeof metadata !== 'object') {
            return base;
        }

        const nested = metadata.metadata;
        let mergedMetadata = { ...metadata };
        if (nested && typeof nested === 'object' && nested !== metadata) {
            mergedMetadata = { ...mergedMetadata, ...nested };
        }

        if (metadata.metadata && typeof metadata.metadata === 'object') {
            delete mergedMetadata.metadata;
        }

        const result = {
            ...base,
            metadata: mergedMetadata
        };

        if (!result.graphAreaSettings && mergedMetadata.graphAreaSettings) {
            result.graphAreaSettings = { ...mergedMetadata.graphAreaSettings };
        }

        if (!result.layoutSettings && mergedMetadata.layoutSettings) {
            result.layoutSettings = { ...mergedMetadata.layoutSettings };
        }

        const normalizedName = typeof mergedMetadata.name === 'string'
            ? mergedMetadata.name.trim()
            : '';
        if (normalizedName) {
            if (!result.graphName) {
                result.graphName = normalizedName;
            }
            if (!result.title) {
                result.title = normalizedName;
            }
        }

        return result;
    }

    /**
     * Prepare graph data for validation and rendering
     */
    prepareGraphData(rawData) {
        const withMetadata = this.flattenGraphMetadata(rawData);
        const normalized = this.normalizeQutData(withMetadata);
        const withDefaults = this.applyMetadataNodeTypeStyles(normalized);
        return this.normalizeGraphAreaSettings(withDefaults);
    }

    /**
     * Normalize legacy QUT data where node/edge details are nested
     */
    normalizeQutData(rawData) {
        return {
            ...rawData,
            nodes: (rawData.nodes || []).map(n => {
                if (n && typeof n === 'object' && 'data' in n) {
                    const flattened = { ...n.data };
                    if (n.position) {
                        if ((flattened.x === undefined || flattened.x === null) && typeof n.position.x === 'number') {
                            flattened.x = n.position.x;
                        }
                        if ((flattened.y === undefined || flattened.y === null) && typeof n.position.y === 'number') {
                            flattened.y = n.position.y;
                        }
                        if ((flattened.z === undefined || flattened.z === null) && typeof n.position.z === 'number') {
                            flattened.z = n.position.z;
                        }
                    }
                    if (n.classes) {
                        flattened.classes = n.classes;
                    }
                    if (n.parent) {
                        flattened.parent = n.parent;
                    }

                    // Ensure legacy container nodes are properly marked
                    if (
                        flattened.type === 'container' ||
                        flattened.isContainer === true
                    ) {
                        if (flattened.classes) {
                            const classList = flattened.classes
                                .split(/\s+/)
                                .filter(Boolean);
                            if (!classList.includes('container')) {
                                classList.push('container');
                                flattened.classes = classList.join(' ');
                            }
                        } else {
                            flattened.classes = 'container';
                        }
                    }

                    if (flattened.type === 'text' && window.QuantickleUtils && typeof window.QuantickleUtils.ensureNodeCallout === 'function') {
                        window.QuantickleUtils.ensureNodeCallout(flattened, { defaultFormat: 'text', syncLegacy: false });
                    }

                    this.mergeLegacyTextNodeStyles(flattened);
                    this.ensureNodeGraphLink(flattened);

                    return flattened;
                }
                if (n && typeof n === 'object') {
                    const normalized = { ...n };
                    if (
                        normalized.type === 'container' ||
                        normalized.isContainer === true
                    ) {
                        if (normalized.classes) {
                            const classList = normalized.classes
                                .split(/\s+/)
                                .filter(Boolean);
                            if (!classList.includes('container')) {
                                classList.push('container');
                                normalized.classes = classList.join(' ');
                            }
                        } else {
                            normalized.classes = 'container';
                        }
                    }
                    if (normalized.type === 'text' && window.QuantickleUtils && typeof window.QuantickleUtils.ensureNodeCallout === 'function') {
                        window.QuantickleUtils.ensureNodeCallout(normalized, { defaultFormat: 'text', syncLegacy: false });
                    }
                    this.mergeLegacyTextNodeStyles(normalized);
                    this.ensureNodeGraphLink(normalized);
                    return normalized;
                }
                return n;
            }),
            edges: (rawData.edges || []).map(e => (
                e && typeof e === 'object' && 'data' in e ? { ...e.data } : e
            ))
        };
    }

    /**
     * Normalize graph area background settings so empty values clear defaults
     */
    normalizeGraphAreaSettings(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return graphData;
        }

        const settings = graphData.graphAreaSettings;
        if (!settings || typeof settings !== 'object') {
            return graphData;
        }

        const normalizedGraphData = {
            ...graphData,
            graphAreaSettings: { ...settings }
        };

        const background = settings.background;
        if (background && typeof background === 'object') {
            const normalizedBackground = { ...background };

            if (Object.prototype.hasOwnProperty.call(background, 'backgroundImage')) {
                const rawImage = background.backgroundImage;
                if (rawImage === null || rawImage === undefined) {
                    normalizedBackground.backgroundImage = null;
                } else if (typeof rawImage === 'string') {
                    const trimmed = rawImage.trim();
                    normalizedBackground.backgroundImage = trimmed.length ? trimmed : null;
                } else {
                    normalizedBackground.backgroundImage = null;
                }
            } else {
                normalizedBackground.backgroundImage = null;
            }

            normalizedGraphData.graphAreaSettings.background = normalizedBackground;
        } else {
            normalizedGraphData.graphAreaSettings.background = {
                backgroundImage: null
            };
        }

        return normalizedGraphData;
    }

    mergeLegacyTextNodeStyles(node) {
        if (!node || typeof node !== 'object') {
            return node;
        }

        const legacyText = node.text;
        if (!legacyText || typeof legacyText !== 'object') {
            return node;
        }

        this.ensureNodeStyleKeyCaches();

        Object.keys(legacyText).forEach(key => {
            const canonicalKey = this.getCanonicalNodeStyleKey(key);
            if (!canonicalKey) {
                return;
            }
            const value = legacyText[key];
            if (value === undefined || value === null) {
                return;
            }
            const current = this.getNodeStyleValue(node, canonicalKey).value;
            if (current !== undefined && current !== null) {
                return;
            }
            node[canonicalKey] = this.cloneStyleValue(value);
        });

        return node;
    }

    cloneStyleValue(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.cloneStyleValue(item));
        }
        if (value && typeof value === 'object') {
            const cloned = {};
            Object.keys(value).forEach(key => {
                cloned[key] = this.cloneStyleValue(value[key]);
            });
            return cloned;
        }
        return value;
    }

    areStyleValuesEqual(a, b) {
        if (a === b) {
            return true;
        }
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                return false;
            }
            return a.every((item, index) => this.areStyleValuesEqual(item, b[index]));
        }
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) {
                return false;
            }
            return keysA.every(key => this.areStyleValuesEqual(a[key], b[key]));
        }
        if (typeof a === 'number' && typeof b === 'number') {
            return Number.isNaN(a) && Number.isNaN(b);
        }
        const numericTypes = ['number', 'string'];
        if (numericTypes.includes(typeof a) && numericTypes.includes(typeof b)) {
            const parsedA = Number(a);
            const parsedB = Number(b);
            if (Number.isFinite(parsedA) && Number.isFinite(parsedB)) {
                return Math.abs(parsedA - parsedB) < 1e-9;
            }
        }
        return false;
    }

    ensureNodeStyleKeyCaches() {
        if (this.NODE_STYLE_KEYS_CACHE) {
            return;
        }

        const canonicalKeys = [
            'color',
            'size',
            'shape',
            'icon',
            'fontColor',
            'fontSize',
            'fontFamily',
            'fontWeight',
            'fontStyle',
            'bold',
            'italic',
            'textOutlineColor',
            'textOutlineWidth',
            'textValign',
            'textHalign',
            'backgroundColor',
            'backgroundOpacity',
            'borderColor',
            'borderWidth',
            'cornerRadius',
            'padding',
            'boxShadow',
            'labelColor',
            'labelPlacement',
            'labelVisible',
            'iconOpacity',
            'iconBackgroundColor',
            'iconBackgroundShape',
            'iconScale',
            'iconRotation',
            'iconX',
            'iconY',
            'iconOffsetX',
            'iconOffsetY',
            'iconSaturation',
            'iconBrightness',
            'iconContrast',
            'iconHueRotate',
            'iconInvert',
            'iconGrayscale',
            'iconSepia',
            'opacity',
            'backgroundImage',
            'backgroundFit',
            'backgroundPosition',
            'backgroundWidth',
            'backgroundHeight',
            'backgroundRepeat',
            'textWrap',
            'textMaxWidth',
            'lineHeight'
        ];

        const aliasEntries = {
            'font-color': 'fontColor',
            'font-size': 'fontSize',
            'font-family': 'fontFamily',
            'font-weight': 'fontWeight',
            'font-style': 'fontStyle',
            'text-outline-color': 'textOutlineColor',
            'text-outline-width': 'textOutlineWidth',
            'text-valign': 'textValign',
            'text-halign': 'textHalign',
            'background-color': 'backgroundColor',
            'background-opacity': 'backgroundOpacity',
            'background-image': 'backgroundImage',
            'background-fit': 'backgroundFit',
            'background-position': 'backgroundPosition',
            'background-width': 'backgroundWidth',
            'background-height': 'backgroundHeight',
            'background-repeat': 'backgroundRepeat',
            'border-color': 'borderColor',
            'border-width': 'borderWidth',
            'corner-radius': 'cornerRadius',
            'box-shadow': 'boxShadow',
            'label-color': 'labelColor',
            'label-placement': 'labelPlacement',
            'label-visible': 'labelVisible',
            'icon-opacity': 'iconOpacity',
            'icon-background-color': 'iconBackgroundColor',
            'icon-background-shape': 'iconBackgroundShape',
            'icon-scale': 'iconScale',
            'icon-rotation': 'iconRotation',
            'icon-x': 'iconX',
            'icon-y': 'iconY',
            'icon-offset-x': 'iconOffsetX',
            'icon-offset-y': 'iconOffsetY',
            'icon-saturation': 'iconSaturation',
            'icon-brightness': 'iconBrightness',
            'icon-contrast': 'iconContrast',
            'icon-hue-rotate': 'iconHueRotate',
            'icon-invert': 'iconInvert',
            'icon-grayscale': 'iconGrayscale',
            'icon-sepia': 'iconSepia',
            'text-wrap': 'textWrap',
            'text-max-width': 'textMaxWidth',
            'line-height': 'lineHeight'
        };

        this.NODE_STYLE_KEYS_CACHE = new Set(canonicalKeys);
        this.NODE_STYLE_KEY_ALIASES = aliasEntries;
        this.NODE_STYLE_ALIAS_LOOKUP = {};

        canonicalKeys.forEach(key => {
            this.NODE_STYLE_ALIAS_LOOKUP[key] = [];
        });

        Object.entries(aliasEntries).forEach(([alias, canonical]) => {
            if (!this.NODE_STYLE_KEYS_CACHE.has(canonical)) {
                this.NODE_STYLE_KEYS_CACHE.add(canonical);
                if (!this.NODE_STYLE_ALIAS_LOOKUP[canonical]) {
                    this.NODE_STYLE_ALIAS_LOOKUP[canonical] = [];
                }
            }
            this.NODE_STYLE_ALIAS_LOOKUP[canonical].push(alias);
        });
    }

    getNodeStyleKeys() {
        this.ensureNodeStyleKeyCaches();
        return this.NODE_STYLE_KEYS_CACHE;
    }

    getNodeStyleKeyAliases() {
        this.ensureNodeStyleKeyCaches();
        return this.NODE_STYLE_KEY_ALIASES;
    }

    getCanonicalNodeStyleKey(key) {
        if (!key) {
            return null;
        }

        this.ensureNodeStyleKeyCaches();

        if (this.NODE_STYLE_KEYS_CACHE.has(key)) {
            return key;
        }

        return this.NODE_STYLE_KEY_ALIASES[key] || null;
    }

    getNodeStyleAliasKeys(canonicalKey) {
        this.ensureNodeStyleKeyCaches();
        return this.NODE_STYLE_ALIAS_LOOKUP[canonicalKey] || [];
    }

    getNodeStyleValue(source, canonicalKey) {
        if (!source || typeof source !== 'object') {
            return { key: null, value: undefined };
        }

        this.ensureNodeStyleKeyCaches();

        if (Object.prototype.hasOwnProperty.call(source, canonicalKey)) {
            return { key: canonicalKey, value: source[canonicalKey] };
        }

        const aliases = this.getNodeStyleAliasKeys(canonicalKey);
        for (const alias of aliases) {
            if (Object.prototype.hasOwnProperty.call(source, alias)) {
                return { key: alias, value: source[alias] };
            }
        }

        return { key: null, value: undefined };
    }

    normalizeNodeTypeStyles(nodeTypeStyles) {
        if (!nodeTypeStyles || typeof nodeTypeStyles !== 'object') {
            return {};
        }

        const styleKeys = this.getNodeStyleKeys();
        const normalized = {};

        Object.keys(nodeTypeStyles).forEach(typeName => {
            const entry = nodeTypeStyles[typeName];
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const filtered = {};
            Object.keys(entry).forEach(key => {
                const canonicalKey = this.getCanonicalNodeStyleKey(key);
                if (!canonicalKey || !styleKeys.has(canonicalKey)) {
                    return;
                }
                const value = entry[key];
                if (value === undefined) {
                    return;
                }
                if (filtered[canonicalKey] !== undefined && !this.areStyleValuesEqual(filtered[canonicalKey], value)) {
                    filtered[canonicalKey] = this.cloneStyleValue(value);
                    return;
                }
                if (filtered[canonicalKey] === undefined) {
                    filtered[canonicalKey] = this.cloneStyleValue(value);
                }
            });
            if (Object.keys(filtered).length > 0) {
                const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
                    acc[key] = filtered[key];
                    return acc;
                }, {});
                normalized[typeName] = sorted;
            }
        });

        return normalized;
    }

    applyMetadataNodeTypeStyles(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return graphData;
        }

        const metadata = graphData.metadata;
        const normalizedStyles = this.normalizeNodeTypeStyles(
            metadata && typeof metadata === 'object' ? metadata.nodeTypeStyles : null
        );

        if (!Object.keys(normalizedStyles).length) {
            return graphData;
        }

        const nodes = (graphData.nodes || []).map(node => {
            if (!node || typeof node !== 'object') {
                return node;
            }
            const updated = { ...node };
            const type = updated.type || 'default';
            const typeDefaults = normalizedStyles[type];
            const fallbackDefaults = type !== 'default' ? normalizedStyles.default : null;
            const defaults = typeDefaults || fallbackDefaults || null;
            if (!defaults) {
                return updated;
            }
            Object.keys(defaults).forEach(key => {
                const { key: presentKey, value } = this.getNodeStyleValue(updated, key);
                if (presentKey && value !== undefined && value !== null) {
                    return;
                }
                updated[key] = this.cloneStyleValue(defaults[key]);
            });
            return updated;
        });

        if (metadata && typeof metadata === 'object') {
            metadata.nodeTypeStyles = normalizedStyles;
        }

        if (window.NodeTypes && typeof window.NodeTypes === 'object') {
            Object.keys(normalizedStyles).forEach(typeName => {
                const defaults = normalizedStyles[typeName];
                if (!defaults || typeof defaults !== 'object') {
                    return;
                }
                if (!window.NodeTypes[typeName]) {
                    window.NodeTypes[typeName] = {};
                }
                Object.keys(defaults).forEach(key => {
                    window.NodeTypes[typeName][key] = this.cloneStyleValue(defaults[key]);
                });
            });
        }

        return {
            ...graphData,
            nodes
        };
    }

    buildNodeTypeStylesForExport(nodes) {
        const styleKeys = this.getNodeStyleKeys();
        const nonDefaultableKeys = new Set(['icon', 'backgroundImage']);
        const nodeTypesConfig = (window.NodeTypes && typeof window.NodeTypes === 'object')
            ? window.NodeTypes
            : {};
        const grouped = new Map();

        nodes.forEach(node => {
            if (!node || typeof node !== 'object') {
                return;
            }
            const type = node.type || 'default';
            if (!grouped.has(type)) {
                grouped.set(type, []);
            }
            grouped.get(type).push(node);
        });

        const styles = {};
        grouped.forEach((typeNodes, type) => {
            const defaults = {};
            const typeConfig = nodeTypesConfig[type];
            if (typeConfig && typeof typeConfig === 'object') {
                Object.keys(typeConfig).forEach(key => {
                    const canonicalKey = this.getCanonicalNodeStyleKey(key);
                    if (!canonicalKey || !styleKeys.has(canonicalKey)) {
                        return;
                    }
                    const value = typeConfig[key];
                    if (value === undefined) {
                        return;
                    }
                    if (defaults[canonicalKey] !== undefined && this.areStyleValuesEqual(defaults[canonicalKey], value)) {
                        return;
                    }
                    defaults[canonicalKey] = this.cloneStyleValue(value);
                });
            }

            styleKeys.forEach(key => {
                if (nonDefaultableKeys.has(key)) {
                    return;
                }
                const values = typeNodes
                    .map(node => this.getNodeStyleValue(node, key).value)
                    .filter(value => value !== undefined);
                if (!values.length) {
                    return;
                }
                const first = values[0];
                const allMatchFirst = values.every(value => this.areStyleValuesEqual(value, first));
                const hasDefault = defaults[key] !== undefined;

                if (!hasDefault) {
                    defaults[key] = this.cloneStyleValue(first);
                    return;
                }

                const defaultMatchesAll = values.every(value => this.areStyleValuesEqual(value, defaults[key]));
                if (!defaultMatchesAll && allMatchFirst) {
                    defaults[key] = this.cloneStyleValue(first);
                }
            });

            if (Object.keys(defaults).length > 0) {
                styles[type] = Object.keys(defaults).sort().reduce((acc, key) => {
                    acc[key] = defaults[key];
                    return acc;
                }, {});
            }
        });

        return Object.keys(styles).sort().reduce((acc, type) => {
            acc[type] = styles[type];
            return acc;
        }, {});
    }

    stripNodeDefaultsForExport(nodes, nodeTypeStyles) {
        const styleKeys = this.getNodeStyleKeys();
        return nodes.map(node => {
            if (!node || typeof node !== 'object') {
                return node;
            }
            const optimized = { ...node };
            const type = optimized.type || 'default';
            const typeDefaults = nodeTypeStyles[type];
            const fallbackDefaults = type !== 'default' ? nodeTypeStyles.default : null;

            styleKeys.forEach(key => {
                const defaultValue = typeDefaults && typeDefaults[key] !== undefined
                    ? typeDefaults[key]
                    : (fallbackDefaults && fallbackDefaults[key] !== undefined ? fallbackDefaults[key] : undefined);
                if (defaultValue === undefined) {
                    return;
                }

                const { key: presentKey, value } = this.getNodeStyleValue(optimized, key);
                if (presentKey && value !== undefined && this.areStyleValuesEqual(value, defaultValue)) {
                    delete optimized[presentKey];
                }

                const aliasKeys = this.getNodeStyleAliasKeys(key);
                aliasKeys.forEach(alias => {
                    if (!Object.prototype.hasOwnProperty.call(optimized, alias)) {
                        return;
                    }
                    const aliasValue = optimized[alias];
                    if (aliasValue !== undefined && this.areStyleValuesEqual(aliasValue, defaultValue)) {
                        delete optimized[alias];
                    }
                });
            });

            return optimized;
        });
    }
    
    /**
     * Download file to user's computer
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }
    
    /**
     * Clear data optimization structures
     */
    clearDataStructures() {
        this.nodeIndex.clear();
        this.edgeIndex.clear();
        this.typeIndex.clear();
    }

    restoreUserGraphAreaSettings() {
        if (window.GraphAreaEditor) {
            try {
                window.GraphAreaEditor.settings = { ...window.GraphAreaEditor.defaultSettings };
                window.GraphAreaEditor.loadSettings();
                window.GraphAreaEditor.applyAllSettings();
            } catch (e) {
            }
        }
    }
    applyGraphAreaSettingsFromSource(graphData, rawSource = null) {
        const sourceSettings = (graphData && graphData.graphAreaSettings)
            || (rawSource && rawSource.graphAreaSettings)
            || null;

        const config = window.QuantickleConfig && window.QuantickleConfig.graphAreaSettings;
        if (!config) {
            if (!sourceSettings) {
                this.restoreUserGraphAreaSettings();
            }
            return;
        }

        try {
            if (sourceSettings) {
                const settings = typeof config.mergeWithDefaults === 'function'
                    ? config.mergeWithDefaults(sourceSettings)
                    : sourceSettings;
                if (typeof config.applySettings === 'function') {
                    config.applySettings(settings);
                }
            } else if (typeof config.applyBackgroundSettings === 'function'
                && typeof config.createDefault === 'function') {
                this.restoreUserGraphAreaSettings();
                const defaults = config.createDefault();
                if (defaults && Object.prototype.hasOwnProperty.call(defaults, 'background')) {
                    config.applyBackgroundSettings(defaults.background);
                }
            }
        } catch (err) {
        }
    }



    /**
     * Convert Cytoscape format to internal graph format
     */
    convertCytoscapeToGraph(cytoscapeData) {
        const nodes = [];
        const edges = [];
        
        if (cytoscapeData.elements) {
            cytoscapeData.elements.forEach(element => {
                if (element.group === 'nodes') {
                    nodes.push({
                        id: element.data.id,
                        ...element.data,
                        x: element.position ? element.position.x : undefined,
                        y: element.position ? element.position.y : undefined
                    });
                } else if (element.group === 'edges') {
                    edges.push({
                        id: element.data.id,
                        ...element.data
                    });
                }
            });
        }
        
        return { nodes, edges };
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        this.clearDataStructures();
        this.currentFile = null;
        this.graphData = { nodes: [], edges: [] };
        this.cy = null;
        this.notifications = null;
        this.papaParseLib = null;
    }
}

// Export for use
window.FileManagerModule = FileManagerModule;
