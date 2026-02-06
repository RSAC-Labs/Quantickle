require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { listJsonFiles } = require('./utils/list-json-files');
const neo4j = require('./utils/neo4j');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSETS_DIR = path.join(__dirname, 'assets');
const CONFIG_DIR = path.join(__dirname, 'config');
const JS_DIR = path.join(__dirname, 'js');
const DATA_RETRIEVAL_DIR = path.join(__dirname, 'data_retrieval');
const UTILS_DIR = path.join(__dirname, 'utils');
const NODE_MODULES_DIR = path.join(__dirname, 'node_modules');
const DOMAIN_DIR = path.join(ASSETS_DIR, 'domains');
const EXAMPLES_DIR = path.join(ASSETS_DIR, 'examples');
const PROXY_ALLOWLIST_PATH = path.join(CONFIG_DIR, 'proxy-allowlist.json');
const DEFAULT_MISP_FEED_URL = 'https://www.circl.lu/doc/misp/feed-osint/';

let proxyAllowlist = [];
const wildcardRegexCache = new Map();

const DEFAULT_BROWSER_HEADERS = Object.freeze({
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
});

const PASSTHROUGH_HEADERS = [
    'accept',
    'accept-encoding',
    'accept-language',
    'cache-control',
    'pragma',
    'x-apikey',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-user',
    'upgrade-insecure-requests',
    'dnt',
    'cookie'
];

const COMMON_TWO_LEVEL_SUFFIXES = new Set([
    'ac.uk', 'co.uk', 'gov.uk', 'org.uk',
    'com.au', 'net.au', 'org.au', 'gov.au',
    'com.br', 'net.br', 'org.br',
    'com.cn', 'net.cn', 'org.cn',
    'com.hk', 'net.hk', 'org.hk',
    'co.in', 'firm.in', 'gen.in', 'ind.in', 'net.in', 'org.in',
    'co.jp', 'ne.jp', 'or.jp',
    'co.kr', 'ne.kr', 'or.kr',
    'com.sg', 'net.sg', 'org.sg'
]);

function getRegistrableDomain(hostname) {
    if (!hostname) {
        return null;
    }

    const normalized = String(hostname).toLowerCase();

    if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
        return 'localhost';
    }

    if (net.isIP(normalized)) {
        return normalized;
    }

    const parts = normalized.split('.').filter(Boolean);
    if (parts.length <= 1) {
        return normalized;
    }

    if (parts.length === 2) {
        return parts.join('.');
    }

    const lastTwo = parts.slice(-2).join('.');
    if (COMMON_TWO_LEVEL_SUFFIXES.has(lastTwo)) {
        return parts.slice(-3).join('.');
    }

    return lastTwo;
}

function determineSiteRelationship(targetUrl, refererUrl) {
    if (!refererUrl) {
        return 'none';
    }

    if (refererUrl.origin === targetUrl.origin) {
        return 'same-origin';
    }

    const targetHost = targetUrl.hostname?.toLowerCase() || '';
    const refererHost = refererUrl.hostname?.toLowerCase() || '';

    const targetDomain = getRegistrableDomain(targetHost);
    const refererDomain = getRegistrableDomain(refererHost);

    if (targetDomain && refererDomain && targetDomain === refererDomain) {
        return 'same-site';
    }

    if (!targetDomain && !refererDomain && targetHost && refererHost && targetHost === refererHost) {
        return 'same-site';
    }

    return 'cross-site';
}

function normalizeAllowlistEntries(entries) {
    if (!Array.isArray(entries)) {
        throw new Error('Proxy allowlist must be provided as an array of host patterns.');
    }

    const cleaned = entries
        .map(value => (value == null ? '' : String(value)).trim().toLowerCase())
        .filter(Boolean);

    if (cleaned.length === 0) {
        throw new Error('Proxy allowlist must include at least one host pattern.');
    }

    return cleaned;
}

async function setProxyAllowlist(entries, { persist = true } = {}) {
    const normalized = normalizeAllowlistEntries(entries);
    proxyAllowlist = normalized;
    wildcardRegexCache.clear();

    if (!persist) {
        return proxyAllowlist;
    }

    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(
        PROXY_ALLOWLIST_PATH,
        JSON.stringify({ allowlist: proxyAllowlist }, null, 2)
    );
    await buildConfigIndex();

    return proxyAllowlist;
}

async function loadProxyAllowlist() {
    try {
        const file = await fs.readFile(PROXY_ALLOWLIST_PATH, 'utf8');
        const parsed = JSON.parse(file);
        if (Array.isArray(parsed?.allowlist)) {
            await setProxyAllowlist(parsed.allowlist, { persist: false });
            return;
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to read proxy allowlist from disk', err);
            throw err;
        }
    }

    const envRaw = typeof process.env.PROXY_ALLOWLIST === 'string' ? process.env.PROXY_ALLOWLIST.trim() : '';
    if (envRaw) {
        const envEntries = envRaw.split(',').map(entry => entry.trim()).filter(Boolean);
        try {
            await setProxyAllowlist(envEntries, { persist: false });
            return;
        } catch (err) {
            console.error('Invalid PROXY_ALLOWLIST configuration', err);
            throw err;
        }
    }

    const message = 'Proxy allowlist configuration is missing. Provide config/proxy-allowlist.json or set the PROXY_ALLOWLIST environment variable.';
    console.error(message);
    proxyAllowlist = [];
    wildcardRegexCache.clear();
    throw new Error(message);
}

function compileWildcard(pattern) {
    if (!wildcardRegexCache.has(pattern)) {
        const source = pattern
            .split('*')
            .map(segment => segment.replace(/[\\^$+?.()|{}\[\]-]/g, '\\$&'))
            .join('.*');
        wildcardRegexCache.set(pattern, new RegExp(`^${source}$`));
    }

    return wildcardRegexCache.get(pattern);
}

function isAllowedHost(hostname) {
    if (!hostname) {
        return false;
    }

    const normalizedHost = String(hostname).toLowerCase();

    return proxyAllowlist.some(entry => {
        if (entry === '*') {
            return true;
        }
        if (entry.includes('*')) {
            return compileWildcard(entry).test(normalizedHost);
        }
        return normalizedHost === entry || normalizedHost.endsWith(`.${entry}`);
    });
}

// Generate a manifest of all domain JSON files for client-side discovery
async function buildDomainIndex() {
    const files = await listJsonFiles(DOMAIN_DIR, __dirname);
    await fs.writeFile(path.join(DOMAIN_DIR, 'index.json'), JSON.stringify({ files }, null, 2));
}
buildDomainIndex().catch(err => {
    console.error('Failed to generate domain index', err);
});

async function buildConfigIndex() {
    const files = await listJsonFiles(CONFIG_DIR, __dirname);
    await fs.writeFile(path.join(CONFIG_DIR, 'index.json'), JSON.stringify({ files }, null, 2));
}
buildConfigIndex().catch(err => {
    console.error('Failed to generate config index', err);
});

loadProxyAllowlist().catch(err => {
    console.error('Failed to initialize proxy allowlist', err);
});

// Middleware
// Only log API endpoint requests
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        console.log(`[server] ${req.method} ${req.originalUrl}`);
    }
    next();
});

const allowedOrigins = (
    process.env.CORS_ORIGINS || 'http://localhost:3000'
).split(',');
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    })
);
app.use(express.json({ limit: '5mb' }));

// Serve cached static JavaScript files
app.use(
    '/js',
    express.static(JS_DIR, {
        immutable: true,
        maxAge: '1y'
    })
);

app.use(
    '/data_retrieval',
    express.static(DATA_RETRIEVAL_DIR, {
        immutable: true,
        maxAge: '1y'
    })
);

app.use(
    '/utils',
    express.static(UTILS_DIR, {
        immutable: true,
        maxAge: '1y'
    })
);

app.use(
    '/node_modules',
    express.static(NODE_MODULES_DIR, {
        immutable: true,
        maxAge: '1y'
    })
);

// Serve static assets
app.use(express.static(PUBLIC_DIR));
app.use('/assets', express.static(ASSETS_DIR));
app.use('/config', express.static(CONFIG_DIR));

app.get('/api/neo4j/config', (req, res) => {
    res.json({
        url: process.env.NEO4J_URL || 'http://localhost:7474'
    });
});

app.get('/api/integrations/misp/config', (req, res) => {
    const envValue = typeof process.env.MISP_CIRCL === 'string' ? process.env.MISP_CIRCL.trim() : '';
    res.json({
        feedUrl: envValue || DEFAULT_MISP_FEED_URL
    });
});

// Provide JSON list of domain files
app.get('/api/domain-files', async (req, res) => {
    try {
        const files = await listJsonFiles(DOMAIN_DIR, __dirname);
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list domain files' });
    }
});

// List available example graph files (read-only)
app.get('/api/examples', async (req, res) => {
    try {
        const entries = await fs.readdir(EXAMPLES_DIR, { withFileTypes: true });
        const examples = await Promise.all(
            entries
                .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.qut'))
                .map(async entry => {
                    const filePath = path.join(EXAMPLES_DIR, entry.name);
                    let size = 0;
                    try {
                        const stats = await fs.stat(filePath);
                        size = stats.size;
                    } catch (err) {
                        size = 0;
                    }

                    const baseName = entry.name.replace(/\.qut$/i, '');
                    const label = baseName
                        .replace(/[-_]+/g, ' ')
                        .replace(/\b\w/g, char => char.toUpperCase());

                    return {
                        filename: entry.name,
                        name: baseName,
                        label,
                        size,
                        url: `/assets/examples/${encodeURIComponent(entry.name)}`
                    };
                })
        );

        examples.sort((a, b) => a.label.localeCompare(b.label));
        res.json({ examples });
    } catch (err) {
        console.error('Failed to list example graphs', err);
        res.status(500).json({ error: 'Failed to list example graphs' });
    }
});

// Proxy SerpApi requests to avoid browser CORS issues
app.get('/api/serpapi', async (req, res) => {
    const { q } = req.query;
    const apiKey = req.query.api_key || process.env.SERPAPI_API_KEY;
    if (!q) {
        return res.status(400).json({ error: 'Missing required parameter: q' });
    }
    if (!apiKey) {
        return res.status(500).json({ error: 'Missing SerpApi API key' });
    }
    try {
        const params = new URLSearchParams({ engine: 'google', q, api_key: apiKey });
        const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
        if (!response.ok) {
            return res.status(500).json({ error: 'SerpApi request failed' });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Failed to query SerpApi', err);
        res.status(500).json({ error: 'Failed to fetch SerpApi' });
    }
});

// Generic backend proxy for allowed hosts
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }
    let target;
    try {
        target = new URL(url);
    } catch (_) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!['http:', 'https:'].includes(target.protocol)) {
        return res.status(400).json({ error: 'Unsupported protocol' });
    }
    if (!isAllowedHost(target.hostname)) {
        return res.status(403).json({ error: 'Host not allowed' });
    }

    const forwardedAuthorization = req.headers['x-proxy-authorization'] || req.headers['authorization'];

    const forwardedRefererHeader =
        req.headers['x-proxy-referer'] ?? req.headers['referer'];
    const refererCandidate = Array.isArray(forwardedRefererHeader)
        ? forwardedRefererHeader[0]
        : forwardedRefererHeader;
    let refererValue = typeof refererCandidate === 'string' ? refererCandidate.trim() : '';
    let parsedReferer = null;

    if (refererValue) {
        try {
            parsedReferer = new URL(refererValue, target);
        } catch (_) {
            refererValue = '';
            parsedReferer = null;
        }
    }

    let computedSecFetchSite = DEFAULT_BROWSER_HEADERS['sec-fetch-site'];
    if (parsedReferer) {
        computedSecFetchSite = determineSiteRelationship(target, parsedReferer);
    }

    const upstreamHeaders = { ...DEFAULT_BROWSER_HEADERS };

    if (refererValue) {
        upstreamHeaders['referer'] = refererValue;
    }

    if (forwardedAuthorization) {
        upstreamHeaders['authorization'] = forwardedAuthorization;
    }

    const forwardedUserAgent = req.headers['x-proxy-user-agent'] || req.headers['user-agent'];
    if (forwardedUserAgent) {
        upstreamHeaders['user-agent'] = forwardedUserAgent;
    }

    for (const headerName of PASSTHROUGH_HEADERS) {
        const overrideHeaderName = `x-proxy-${headerName}`;
        if (Object.prototype.hasOwnProperty.call(req.headers, overrideHeaderName)) {
            const override = req.headers[overrideHeaderName];
            if (typeof override === 'string' && override.length === 0) {
                delete upstreamHeaders[headerName];
            } else if (override) {
                upstreamHeaders[headerName] = override;
            }
        } else if (headerName === 'x-apikey' && req.headers[headerName]) {
            upstreamHeaders[headerName] = req.headers[headerName];
        }
    }

    const effectiveSecFetchDest = (upstreamHeaders['sec-fetch-dest'] || '').toLowerCase();
    const isDocumentNavigation = effectiveSecFetchDest === 'document';

    if (!Object.prototype.hasOwnProperty.call(req.headers, 'x-proxy-sec-fetch-site')) {
        upstreamHeaders['sec-fetch-site'] = computedSecFetchSite;
    }

    if (
        computedSecFetchSite !== 'none' &&
        !Object.prototype.hasOwnProperty.call(req.headers, 'x-proxy-sec-fetch-mode') &&
        !isDocumentNavigation
    ) {
        upstreamHeaders['sec-fetch-mode'] =
            computedSecFetchSite === 'same-origin' ? 'same-origin' : 'cors';
    }

    const effectiveSecFetchMode = upstreamHeaders['sec-fetch-mode'];
    if (
        effectiveSecFetchMode &&
        typeof effectiveSecFetchMode === 'string' &&
        effectiveSecFetchMode.toLowerCase() !== 'navigate' &&
        !Object.prototype.hasOwnProperty.call(req.headers, 'x-proxy-sec-fetch-user')
    ) {
        delete upstreamHeaders['sec-fetch-user'];
    }

    try {
        const response = await fetch(target.toString(), {
            headers: upstreamHeaders
        });
        const buffer = Buffer.from(await response.arrayBuffer());

        res.status(response.status);
        res.set('X-Content-Type-Options', 'nosniff');

        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.set('Content-Type', contentType);
        }
        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            res.set('Cache-Control', cacheControl);
        }
        const etag = response.headers.get('etag');
        if (etag) {
            res.set('ETag', etag);
        }

        res.set('Content-Length', buffer.length.toString());
        res.send(buffer);
    } catch (err) {
        console.error('Proxy request failed', err);
        res.status(500).json({ error: 'Proxy request failed' });
    }
});

// Store graph data in Neo4j
app.post('/api/neo4j/graph', async (req, res) => {
    try {
        const credentials = {
            url: req.headers['x-neo4j-url'],
            username: req.headers['x-neo4j-username'],
            password: req.headers['x-neo4j-password']
        };
        await neo4j.saveGraph(req.body, credentials);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to save graph to Neo4j', err);
        res.status(500).json({ error: 'Failed to save graph to Neo4j' });
    }
});

// Check which graphs contain given node labels
app.post('/api/neo4j/node-graphs', async (req, res) => {
    try {
        const credentials = {
            url: req.headers['x-neo4j-url'],
            username: req.headers['x-neo4j-username'],
            password: req.headers['x-neo4j-password']
        };
        const labels = req.body?.labels || [];
        const currentGraph = req.body?.currentGraph;
        const results = await neo4j.findGraphsByNodeLabels(labels, credentials);

        // Previously we filtered out the current graph to avoid suggesting the user
        // re-open the same graph. However, this caused legitimate hits to be
        // dropped when searching from inside the graph that already contains the
        // label. Preserve all matches so the UI can surface them consistently.
        const normalized = results
            .map(r => ({ label: r.label, graphs: Array.isArray(r.graphs) ? r.graphs : [] }))
            .filter(r => r.graphs.length > 0);

        res.json(normalized);
    } catch (err) {
        console.error('Failed to query Neo4j for node graphs', err);
        res.status(500).json({ error: 'Failed to query Neo4j for node graphs' });
    }
});

// List available graphs in Neo4j
app.get('/api/neo4j/graphs', async (req, res) => {
    try {
        const credentials = {
            url: req.headers['x-neo4j-url'],
            username: req.headers['x-neo4j-username'],
            password: req.headers['x-neo4j-password']
        };
        const graphs = await neo4j.listGraphs(credentials);
        res.json(graphs);
    } catch (err) {
        console.error('Failed to list graphs from Neo4j', err);
        res.status(500).json({ error: 'Failed to list graphs from Neo4j' });
    }
});

// Retrieve graph data by name from Neo4j
app.get('/api/neo4j/graph/:name', async (req, res) => {
    try {
        const credentials = {
            url: req.headers['x-neo4j-url'],
            username: req.headers['x-neo4j-username'],
            password: req.headers['x-neo4j-password']
        };
        const graphName = req.params.name;
        const graph = await neo4j.getGraph(graphName, credentials);
        res.json(graph);
    } catch (err) {
        console.error('Failed to fetch graph from Neo4j', err);
        res.status(500).json({ error: 'Failed to fetch graph from Neo4j' });
    }
});

function extractNeo4jCredentials(req) {
    return {
        url: req.headers['x-neo4j-url'],
        username: req.headers['x-neo4j-username'],
        password: req.headers['x-neo4j-password']
    };
}

async function handleNeo4jGraphDeletion(req, res, graphName) {
    if (!graphName) {
        return res.status(400).json({ error: 'Graph name is required for deletion' });
    }

    try {
        const credentials = extractNeo4jCredentials(req);
        await neo4j.deleteGraph(graphName, credentials);
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete graph from Neo4j', err);
        res.status(500).json({ error: 'Failed to delete graph from Neo4j' });
    }
}

// Delete a graph from Neo4j via query parameter (new preferred route)
app.delete('/api/neo4j/graph', async (req, res) => {
    const graphName = req.query?.name || req.body?.name;
    await handleNeo4jGraphDeletion(req, res, graphName);
});

// Legacy path-parameter deletion support
app.delete('/api/neo4j/graph/:name', async (req, res) => {
    await handleNeo4jGraphDeletion(req, res, req.params.name);
});

// Save or move a node type definition
app.put('/api/node-types/:domain/:type', async (req, res) => {
    try {
        const safeDomain = String(req.params.domain).replace(/[^a-zA-Z0-9_-]/g, '');
        const safeType = String(req.params.type).replace(/[^a-zA-Z0-9_-]/g, '');
        const targetDomain = (req.body && req.body.newDomain) ? String(req.body.newDomain).replace(/[^a-zA-Z0-9_-]/g, '') : safeDomain;

        const dirPath = path.join(DOMAIN_DIR, targetDomain);
        await fs.mkdir(dirPath, { recursive: true });
        const filePath = path.join(dirPath, `${safeType}.json`);

        const data = { ...req.body };
        delete data.newDomain;
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));

        if (targetDomain !== safeDomain) {
            const oldPath = path.join(DOMAIN_DIR, safeDomain, `${safeType}.json`);
            try { await fs.unlink(oldPath); } catch (_) {}
        }

        await buildDomainIndex();

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to save node type', err);
        res.status(500).json({ error: 'Failed to save node type' });
    }
});

// Delete a node type definition
app.delete('/api/node-types/:domain/:type', async (req, res) => {
    try {
        const safeDomain = String(req.params.domain).replace(/[^a-zA-Z0-9_-]/g, '');
        const safeType = String(req.params.type).replace(/[^a-zA-Z0-9_-]/g, '');
        const filePath = path.join(DOMAIN_DIR, safeDomain, `${safeType}.json`);
        await fs.unlink(filePath);
        await buildDomainIndex();
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete node type', err);
        res.status(500).json({ error: 'Failed to delete node type' });
    }
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start server only when run directly
if (require.main === module) {
    app.listen(PORT);
}

module.exports = app;
module.exports._internals = {
    DEFAULT_BROWSER_HEADERS,
    setProxyAllowlist: (entries, options) => setProxyAllowlist(entries, options),
    loadProxyAllowlist: () => loadProxyAllowlist(),
    getProxyAllowlist: () => [...proxyAllowlist],
    isAllowedHost: hostname => isAllowedHost(hostname)
};
