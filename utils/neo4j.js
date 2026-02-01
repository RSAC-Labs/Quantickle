function getConfig(credentials = {}) {
    return {
        dbUrl: credentials.url || process.env.NEO4J_URL || 'http://localhost:7474',
        dbName: credentials.db || process.env.NEO4J_DB || 'neo4j',
        user: credentials.username || process.env.NEO4J_USER || 'neo4j',
        password: credentials.password || process.env.NEO4J_PASSWORD || 'neo4j'
    };
}

async function runStatements(statements, credentials) {
    const { dbUrl, dbName, user, password } = getConfig(credentials);
    const authHeader = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
    const url = `${dbUrl}/db/${dbName}/tx/commit`;
    const body = JSON.stringify({ statements });

    // Log outgoing Neo4j request
    console.log('[Neo4j HTTP] POST', url, body);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body
    });

    const responseText = await response.clone().text();
    // Log response from Neo4j
    console.log('[Neo4j HTTP] Response', response.status, responseText);

    if (!response.ok) {
        throw new Error(`Neo4j HTTP error ${response.status}`);
    }
    const data = JSON.parse(responseText);
    if (data.errors && data.errors.length) {
        throw new Error(`Neo4j errors: ${JSON.stringify(data.errors)}`);
    }
    return data;
}

function encodeId(graphName, id) {
    return `${graphName}:${id}`;
}

function decodeId(graphName, id) {
    if (typeof id === 'string' && id.startsWith(graphName + ':')) {
        return id.slice(graphName.length + 1);
    }
    return id;
}

async function saveGraph(graph, credentials) {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const { nodes: _n, edges: _e, ...graphMeta } = graph || {};
    const graphName = graph?.title
        || graph?.graphName
        || graph?.graphId
        || graph?.metadata?.title
        || graph?.metadata?.name
        || graphMeta?.name;
    const statements = [];

    function sanitize(obj) {
        const clean = {};
        for (const [key, value] of Object.entries(obj || {})) {
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                clean[key] = value;
            } else if (Array.isArray(value)) {
                if (value.every(v => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
                    clean[key] = value;
                } else {
                    clean[key] = JSON.stringify(value);
                }
            } else if (value instanceof Map) {
                clean[key] = JSON.stringify(Object.fromEntries(value));
            } else {
                clean[key] = JSON.stringify(value);
            }
        }
        return clean;
    }

    const metadata = (graphMeta.metadata && typeof graphMeta.metadata === 'object')
        ? { ...graphMeta.metadata }
        : (graph?.metadata && typeof graph?.metadata === 'object')
            ? { ...graph.metadata }
            : undefined;
    let savedAt;
    if (graphName) {
        savedAt = new Date().toISOString();
        if (metadata) {
            metadata.savedAt = savedAt;
        }
    }
    const graphProps = sanitize({
        ...graphMeta,
        ...(metadata ? { metadata } : {})
    });
    if (savedAt) {
        graphProps.savedAt = savedAt;
    }
    delete graphProps.saveSequence;
    if (graphName) {
        statements.push({
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName})<-[:IN_GRAPH]-(n:QuantickleNode) ' +
                'MATCH (n)-[r:RELATIONSHIP]-(:QuantickleNode) ' +
                'WITH DISTINCT r DELETE r',
            parameters: { graphName }
        });

        statements.push({
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName})<-[rel:IN_GRAPH]-(n:QuantickleNode) ' +
                'DELETE rel',
            parameters: { graphName }
        });

        statements.push({
            statement:
                'MATCH (n:QuantickleNode) ' +
                'WHERE NOT (n)-[:IN_GRAPH]->(:QuantickleGraph) ' +
                'OPTIONAL MATCH (n)-[r]-() DELETE r, n'
        });

        statements.push({
            statement: 'MERGE (g:QuantickleGraph {name: $graphName}) SET g += $props, g.saveSequence = coalesce(g.saveSequence, 0) + 1, g.savedAt = $savedAt',
            parameters: { graphName, props: graphProps, savedAt }
        });
    }

    const nodeIds = new Set();
    const edgeIds = new Set();

    for (const node of nodes) {
        const { data = {}, position, ...rest } = node;
        const combined = { ...data, ...rest };
        if (position) combined.position = position;
        const { id, ...props } = combined;
        if (!id) continue;
        // Ensure each node stores its graph name alongside the ID
        const cleanProps = sanitize({ ...props, graphName });
        const encodedId = graphName ? encodeId(graphName, id) : id;
        if (encodedId) {
            nodeIds.add(encodedId);
        }
        if (graphName) {
            statements.push({
                statement:
                    'MERGE (n:QuantickleNode {id: $id}) SET n += $props ' +
                    'WITH n MATCH (g:QuantickleGraph {name: $graphName}) ' +
                    'MERGE (n)-[:IN_GRAPH]->(g)',
                parameters: { id: encodedId, props: cleanProps, graphName }
            });
        } else {
            statements.push({
                statement: 'MERGE (n:QuantickleNode {id: $id}) SET n += $props',
                parameters: { id: encodedId, props: cleanProps }
            });
        }
    }

    for (const edge of edges) {
        const { data = {}, ...rest } = edge;
        const combined = { ...data, ...rest };
        const { source, target, id, ...props } = combined;
        if (!source || !target) continue;
        // Store graph name on each relationship as well
        const cleanProps = sanitize({ ...props, graphName });
        const encodedSource = graphName ? encodeId(graphName, source) : source;
        const encodedTarget = graphName ? encodeId(graphName, target) : target;
        const encodedEdgeId = id ? (graphName ? encodeId(graphName, id) : id) : undefined;
        const effectiveEdgeId = encodedEdgeId || `${encodedSource}-${encodedTarget}`;
        if (effectiveEdgeId) {
            edgeIds.add(effectiveEdgeId);
        }
        statements.push({
            statement:
                'MATCH (a:QuantickleNode {id: $source}), (b:QuantickleNode {id: $target}) ' +
                'MERGE (a)-[r:RELATIONSHIP {id: coalesce($id, $source + "-" + $target)}]->(b) ' +
                'SET r += $props',
            parameters: { source: encodedSource, target: encodedTarget, id: encodedEdgeId, props: cleanProps }
        });
    }

    if (graphName) {
        const nodeIdList = Array.from(nodeIds);
        const edgeIdList = Array.from(edgeIds);

        statements.push({
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName})<-[:IN_GRAPH]-(a:QuantickleNode)-[r:RELATIONSHIP]->(b:QuantickleNode)-[:IN_GRAPH]->(g) ' +
                'WHERE NOT (coalesce(r.id, a.id + "-" + b.id) IN $edgeIds) ' +
                'DELETE r',
            parameters: { graphName, edgeIds: edgeIdList }
        });

        statements.push({
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName})<-[rel:IN_GRAPH]-(n:QuantickleNode) ' +
                'WHERE NOT (n.id IN $nodeIds) ' +
                'WITH n, rel DELETE rel ' +
                'WITH n WHERE NOT (n)-[:IN_GRAPH]->(:QuantickleGraph) ' +
                'OPTIONAL MATCH (n)-[r]-() DELETE r, n',
            parameters: { graphName, nodeIds: nodeIdList }
        });
    }

    if (statements.length > 0) {
        await runStatements(statements, credentials);
    }
}

async function findGraphsByNodeLabels(labels = [], credentials) {
    if (!Array.isArray(labels) || labels.length === 0) return [];

    // Normalize and deduplicate labels before querying Neo4j to avoid unnecessary lookups
    const normalizedLabels = Array.from(new Set(
        labels
            .map(value => {
                if (value === null || value === undefined) return null;
                if (typeof value === 'string') return value.trim();
                try {
                    return String(value).trim();
                } catch (_) {
                    return null;
                }
            })
            .filter(Boolean)
    ));

    if (!normalizedLabels.length) return [];

    const statements = [{
        statement:
            'UNWIND $labels AS rawLabel ' +
            'WITH rawLabel, toLower(trim(rawLabel)) AS searchTerm ' +
            'MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g:QuantickleGraph) ' +
            'WITH rawLabel, searchTerm, n, g, ' +
            'CASE WHEN n.label IS NULL THEN [] WHEN n.label = [] THEN [] WHEN n.label = toString(n.label) THEN [n.label] ELSE n.label END AS candidateLabels ' +
            'WHERE any(val IN candidateLabels WHERE val IS NOT NULL AND toLower(trim(toString(val))) = searchTerm) ' +
            '   OR toLower(trim(toString(n.id))) = searchTerm ' +
            'RETURN rawLabel AS label, collect(DISTINCT g.name) AS graphs',
        parameters: { labels: normalizedLabels }
    }];

    const data = await runStatements(statements, credentials);
    return (
        data.results?.[0]?.data.map(row => ({
            label: row.row[0],
            graphs: row.row[1]
        })) || []
    );
}

async function getGraph(graphName, credentials) {
    const statements = [{
        statement:
            'MATCH (g:QuantickleGraph {name:$graphName}) ' +
            'OPTIONAL MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g) ' +
            'OPTIONAL MATCH (n)-[r:RELATIONSHIP]->(m:QuantickleNode)-[:IN_GRAPH]->(g) ' +
            'WITH g, collect(DISTINCT n{.*, id:n.id}) AS nodes, collect(DISTINCT r) AS rs ' +
            'RETURN { metadata: g{.*}, nodes: nodes, edges: [rel IN rs WHERE rel IS NOT NULL | ' +
            'rel{.*, id: coalesce(rel.id, startNode(rel).id + "-" + endNode(rel).id), source: startNode(rel).id, target: endNode(rel).id}] } AS graph',
        parameters: { graphName }
    }];
    const result = await runStatements(statements, credentials);
    const graph = result.results?.[0]?.data?.[0]?.row?.[0] || { nodes: [], edges: [], metadata: {} };

    function parse(obj) {
        const parsed = {};
        for (const [k, v] of Object.entries(obj || {})) {
            if (typeof v === 'string') {
                try {
                    const json = JSON.parse(v);
                    // Map values are stored as JSON strings; revive them as plain objects
                    parsed[k] = json;
                    continue;
                } catch (_) {}
            }
            parsed[k] = v;
        }
        return parsed;
    }

    function decodeNode(node) {
        const parsed = parse(node);
        parsed.id = decodeId(graphName, parsed.id);
        return parsed;
    }

    function decodeEdge(edge) {
        const parsed = parse(edge);
        parsed.id = decodeId(graphName, parsed.id);
        parsed.source = decodeId(graphName, parsed.source);
        parsed.target = decodeId(graphName, parsed.target);
        return parsed;
    }

    return {
        metadata: parse(graph.metadata),
        nodes: (graph.nodes || []).map(decodeNode),
        edges: (graph.edges || []).map(decodeEdge)
    };
}

function tryParseJson(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return value;
    }

    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];
    if (!((firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']'))) {
        return value;
    }

    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
}

function deepParsePossibleJson(value, seen = new Set()) {
    if (value === null || value === undefined) {
        return value;
    }

    if (seen.has(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = tryParseJson(value);
        if (parsed !== value) {
            return deepParsePossibleJson(parsed, seen);
        }
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => deepParsePossibleJson(item, seen));
    }

    if (typeof value === 'object') {
        seen.add(value);
        const entries = Object.entries(value);
        const result = {};
        for (const [key, entry] of entries) {
            result[key] = deepParsePossibleJson(entry, seen);
        }
        seen.delete(value);
        return result;
    }

    return value;
}

function parseTemporalValue(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const digits = String(Math.trunc(Math.abs(value))).length;
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
                return parseTemporalValue(Number(trimmed));
            }
            if (digits === 10) {
                return parseTemporalValue(Number(trimmed) * 1000);
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

        const normalized = trimmed.replace(/\s+/g, 'T');
        const normalizedDate = new Date(normalized);
        return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            const parsed = parseTemporalValue(entry);
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
                const parsed = parseTemporalValue(value[key]);
                if (parsed) {
                    return parsed;
                }
            }
        }
    }

    return null;
}

function collectTemporalValues(value, keys, options = {}) {
    const { collectAll = false } = options;
    const nestedKeys = ['metadata', 'meta', 'attributes', 'details', 'properties', 'data', 'info', 'graph', 'nodes'];
    const visited = new Set();
    const results = [];

    function traverse(target) {
        if (target === null || target === undefined) {
            return false;
        }

        if (typeof target === 'string' || typeof target === 'number' || target instanceof Date) {
            const parsed = parseTemporalValue(target);
            if (parsed) {
                results.push(parsed);
                return true;
            }
            return false;
        }

        if (typeof target !== 'object') {
            return false;
        }

        if (visited.has(target)) {
            return false;
        }
        visited.add(target);

        if (Array.isArray(target)) {
            for (const entry of target) {
                const found = traverse(entry);
                if (found && !collectAll) {
                    return true;
                }
            }
            return false;
        }

        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                const parsed = parseTemporalValue(target[key]);
                if (parsed) {
                    results.push(parsed);
                    if (!collectAll) {
                        return true;
                    }
                }
            }
        }

        for (const nestedKey of nestedKeys) {
            if (Object.prototype.hasOwnProperty.call(target, nestedKey)) {
                const nested = target[nestedKey];
                const found = traverse(nested);
                if (found && !collectAll) {
                    return true;
                }
            }
        }

        for (const valueEntry of Object.values(target)) {
            if (typeof valueEntry === 'object' && valueEntry !== null) {
                const found = traverse(valueEntry);
                if (found && !collectAll) {
                    return true;
                }
            } else if (collectAll) {
                traverse(valueEntry);
            }
        }

        return false;
    }

    traverse(value);
    return results;
}

function findFallbackSavedAt(entry) {
    const savedKeys = ['savedAt', 'saved_at', 'savedOn', 'saved_on', 'updatedAt', 'updated_at', 'createdAt', 'created_at'];
    const savedCandidates = collectTemporalValues(entry, savedKeys, { collectAll: false });
    if (savedCandidates.length) {
        return savedCandidates[0].toISOString();
    }

    const publishedKeys = ['published', 'publishedAt', 'published_at', 'datePublished', 'date'];
    const publishedCandidates = collectTemporalValues(entry, publishedKeys, { collectAll: true });
    if (!publishedCandidates.length) {
        return null;
    }

    publishedCandidates.sort((a, b) => b.getTime() - a.getTime());
    return publishedCandidates[0].toISOString();
}

function normalizeRootNode(root) {
    if (!root || typeof root !== 'object') {
        return null;
    }

    const parsed = deepParsePossibleJson(root);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        data: parsed,
        properties: parsed
    };
}

async function listGraphs(credentials) {
    const statements = [{
        statement:
            'MATCH (g:QuantickleGraph) ' +
            'OPTIONAL MATCH (g)<-[:IN_GRAPH]-(root:QuantickleNode) ' +
            'WHERE coalesce(root.root, false) = true ' +
            '   OR coalesce(root.isRoot, false) = true ' +
            "   OR toLower(coalesce(root.type, '')) IN ['root', 'graph', 'graph-root'] " +
            'WITH g, collect(DISTINCT root { .*, id: root.id }) AS rootNodes ' +
            'RETURN g.name AS name, g.savedAt AS savedAt, g.saveSequence AS sequence, g.metadata AS metadata, rootNodes ' +
            'ORDER BY g.savedAt DESC, g.saveSequence DESC, g.name ASC'
    }];
    const result = await runStatements(statements, credentials);
    const rows = result.results?.[0]?.data || [];

    const updates = [];

    const transformed = rows
        .map(r => {
            const [name, savedAt, sequence, metadataRaw, rootNodesRaw] = r.row || [];
            if (!name) return null;

            let parsedSequence = sequence ?? null;
            if (parsedSequence !== null && parsedSequence !== undefined) {
                const numeric = Number(parsedSequence);
                if (!Number.isNaN(numeric)) {
                    parsedSequence = numeric;
                }
            }

            const metadata = deepParsePossibleJson(metadataRaw);
            const rootNodes = Array.isArray(rootNodesRaw)
                ? rootNodesRaw
                    .map(normalizeRootNode)
                    .filter(Boolean)
                : [];

            const entry = {
                name,
                savedAt: savedAt || null,
                sequence: parsedSequence
            };

            if (metadata && typeof metadata === 'object') {
                entry.metadata = metadata;
            }

            if (rootNodes.length) {
                entry.graph = {
                    nodes: rootNodes
                };
                if (metadata && typeof metadata === 'object') {
                    entry.graph.metadata = metadata;
                }
            } else if (metadata && typeof metadata === 'object') {
                entry.graph = { metadata };
            }

            if (!entry.savedAt) {
                const fallback = findFallbackSavedAt(entry);
                if (fallback) {
                    entry.savedAt = fallback;
                    updates.push({ name, savedAt: fallback });
                }
            }

            return entry;
        })
        .filter(Boolean);

    transformed.sort((a, b) => {
        const timeA = a.savedAt ? Date.parse(a.savedAt) : -Infinity;
        const timeB = b.savedAt ? Date.parse(b.savedAt) : -Infinity;
        if (timeA !== timeB) {
            return timeB - timeA;
        }

        const seqA = typeof a.sequence === 'number' ? a.sequence : -Infinity;
        const seqB = typeof b.sequence === 'number' ? b.sequence : -Infinity;
        if (seqA !== seqB) {
            return seqB - seqA;
        }

        return a.name.localeCompare(b.name);
    });

    if (updates.length) {
        const updateStatements = updates.map(update => ({
            statement: 'MATCH (g:QuantickleGraph {name: $graphName}) SET g.savedAt = $fallback',
            parameters: { graphName: update.name, fallback: update.savedAt }
        }));
        try {
            await runStatements(updateStatements, credentials);
        } catch (err) {
            console.error('Failed to persist fallback savedAt values', err);
        }
    }

    return transformed;
}

async function deleteGraph(graphName, credentials) {
    if (!graphName) {
        throw new Error('Graph name is required for deletion');
    }

    const graphPrefix = `${graphName}:`;
    const statements = [
        {
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName}) OPTIONAL MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g) ' +
                'WITH g, n WHERE n IS NOT NULL AND NOT EXISTS { (n)-[:IN_GRAPH]->(other:QuantickleGraph) WHERE other.name <> $graphName } ' +
                'OPTIONAL MATCH (n)-[r:RELATIONSHIP]-() DELETE r',
            parameters: { graphName }
        },
        {
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName}) OPTIONAL MATCH (n:QuantickleNode)-[:IN_GRAPH]->(g) ' +
                'WITH g, n WHERE n IS NOT NULL AND NOT EXISTS { (n)-[:IN_GRAPH]->(other:QuantickleGraph) WHERE other.name <> $graphName } ' +
                'DETACH DELETE n',
            parameters: { graphName }
        },
        {
            statement:
                'MATCH (g:QuantickleGraph {name: $graphName}) DETACH DELETE g',
            parameters: { graphName }
        },
        {
            statement:
                'MATCH (n:QuantickleNode) WHERE n.id STARTS WITH $graphPrefix ' +
                'AND NOT (n)-[:IN_GRAPH]->(:QuantickleGraph) DETACH DELETE n',
            parameters: { graphPrefix }
        }
    ];

    await runStatements(statements, credentials);
}

module.exports = { saveGraph, findGraphsByNodeLabels, getGraph, listGraphs, deleteGraph };
