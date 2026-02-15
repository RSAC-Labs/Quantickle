(function() {
    const createVirusTotalModule = () => {
        let services = null;

        const getRuntime = (key, fallback = undefined) => {
            if (!services?.config?.getRuntime) {
                return fallback;
            }
            const value = services.config.getRuntime(key);
            return value === undefined ? fallback : value;
        };

        const setRuntime = (key, value) => {
            if (services?.config?.setRuntime) {
                services.config.setRuntime(key, value);
            }
        };

        const getStorageKey = (key) => services?.config?.getStorageKey?.(key) || null;
        const storageGet = (key) => services?.storage?.getItem?.(key);
        const storageSet = (key, value) => services?.storage?.setItem?.(key, value);

        const notifyStatus = (message, level = 'info', options = {}) => {
            if (services?.status?.notify) {
                services.status.notify({
                    message,
                    level,
                    statusId: 'virustotalStatus',
                    ...options
                });
            }
        };

        const calculateDetectionStats = (lastAnalysisStats) => {
            const stats = lastAnalysisStats || {};
            const total = Object.values(stats).reduce((sum, val) => {
                return sum + (typeof val === 'number' ? val : 0);
            }, 0);
            const malicious = stats.malicious || 0;
            return { malicious, total, detectionRatio: `${malicious}/${total}` };
        };

        const sanitizeDomain = (domain) => {
            if (!domain) return '';
            let clean = domain.trim();
            try {
                clean = new URL(clean).hostname;
            } catch (e) {
                // Ignore errors – input wasn't a full URL
            }
            return clean.toLowerCase().replace(/\.$/, '');
        };

        const isIpAddress = (value) => {
            if (!value || typeof value !== 'string') {
                return false;
            }
            const trimmed = value.trim();
            const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
            const ipv6 = /^[0-9a-f:]+$/i;
            return ipv4.test(trimmed) || (trimmed.includes(':') && ipv6.test(trimmed));
        };

        const extractDomainFromResolution = (relation) => {
            const hostname = relation?.attributes?.hostname || relation?.attributes?.host_name;
            if (hostname) {
                return hostname;
            }
            const raw = relation?.id || '';
            if (typeof raw === 'string' && raw.includes(' ')) {
                const parts = raw.split(/\s+/).filter(Boolean);
                const nonIp = parts.filter(part => !isIpAddress(part));
                if (nonIp.length > 0) {
                    return nonIp[nonIp.length - 1];
                }
            }
            return raw;
        };

        const getAsName = (attributes = {}) => {
            return attributes.as_name || attributes.asn_owner || attributes.as_owner || attributes.asn_name || '';
        };

        const getVTBlocklist = () => {
            const runtimeList = getRuntime('vtBlocklist');
            if (Array.isArray(runtimeList)) {
                return runtimeList;
            }
            const storageKey = getStorageKey('VT_BLOCKLIST');
            if (!storageKey) {
                return [];
            }
            const stored = storageGet(storageKey);
            if (!stored) {
                return [];
            }
            const list = stored.split(/\s*,\s*|\n/).map(v => v.trim()).filter(Boolean);
            setRuntime('vtBlocklist', list);
            return list;
        };

        const addToVTBlocklist = (domain) => {
            const clean = sanitizeDomain(domain);
            if (!clean) return { added: false, domain: '' };
            const parts = clean.split('.');
            const parent = parts.length > 2 ? parts.slice(-2).join('.') : clean;
            const list = getVTBlocklist();
            if (!list.includes(parent)) {
                list.push(parent);
                setRuntime('vtBlocklist', list);
                const storageKey = getStorageKey('VT_BLOCKLIST');
                if (storageKey) {
                    storageSet(storageKey, list.join('\n'));
                }
                return { added: true, domain: parent };
            }
            return { added: false, domain: parent };
        };

        const isDomainBlocked = (domain, list = getVTBlocklist()) => {
            const clean = sanitizeDomain(domain);
            return list.some(b => clean === b || clean.endsWith(`.${b}`));
        };

        const findNodeByLabel = (cy, label) => cy.nodes().filter(n => n.data('label') === label).first();

        const edgeExists = (cy, sourceId, targetId) => {
            return cy.edges(`[source = "${sourceId}"][target = "${targetId}"]`).length > 0;
        };

        const formatInfoHTML = (infoObj) => {
            if (services?.integrations?.formatInfoHTML) {
                return services.integrations.formatInfoHTML(infoObj);
            }
            const rows = Object.entries(infoObj || {})
                .filter(([_, value]) => value !== undefined && value !== null && value !== '')
                .map(([key, value]) =>
                    `<tr><th scope="row" style="text-align:left;border:1px solid #000;padding:4px 8px;">${String(key)}</th>` +
                    `<td style="border:1px solid #000;padding:4px 8px;">${String(value)}</td></tr>`
                )
                .join('');
            return `<table style="border-collapse:collapse;border:3px solid #000;font-family:'Courier New', Courier, monospace;">` +
                `<colgroup><col style="width:12ch;"><col></colgroup>${rows}</table>`;
        };

        const formatInfoText = (infoObj) => {
            if (services?.integrations?.formatInfoText) {
                return services.integrations.formatInfoText(infoObj);
            }
            const stripTags = value => String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            const lines = Object.entries(infoObj || {})
                .filter(([_, value]) => value !== undefined && value !== null && value !== '')
                .map(([key, value]) => `${stripTags(key)}: ${stripTags(value)}`);
            return lines.join('\n');
        };

        const getOrCreateNode = async (cy, id, data = {}, options = {}) => {
            if (!id) {
                return { id: null, created: false };
            }

            const existingById = cy.getElementById(id);
            if (existingById && existingById.length > 0) {
                return { id: existingById.id(), created: false };
            }

            if (data.label) {
                const existingByLabel = cy
                    .nodes()
                    .filter(n => n.data('label') === data.label)
                    .first();
                if (existingByLabel && existingByLabel.length > 0) {
                    return { id: existingByLabel.id(), created: false };
                }
            }

            const nodeType = data.type || 'default';

            if (window.DomainLoader && typeof window.DomainLoader.ensureDomainForType === 'function') {
                await window.DomainLoader.ensureDomainForType(nodeType);
            }

            if (window.NodeTypes && !window.NodeTypes[nodeType]) {
                window.NodeTypes[nodeType] = { ...(window.NodeTypes.default || {}) };
            }

            const typeSettings = window.NodeTypes && window.NodeTypes[nodeType] ? window.NodeTypes[nodeType] : {};
            const styledData = { ...data, id, type: nodeType };
            styledData.color = typeSettings.color || styledData.color;
            styledData.size = typeSettings.size || styledData.size;
            styledData.shape = typeSettings.shape || styledData.shape;
            if ((!styledData.icon || styledData.icon === '') && styledData.iconHiddenDueToLOD !== true) {
                styledData.icon = typeSettings.icon || '';
            }
            styledData.labelColor = typeSettings.labelColor || styledData.labelColor;
            styledData.labelPlacement = typeSettings.labelPlacement || styledData.labelPlacement;

            if (window.GraphRenderer && typeof window.GraphRenderer.normalizeNodeData === 'function') {
                window.GraphRenderer.normalizeNodeData({ data: styledData });
            }

            const node = cy.add({ group: 'nodes', data: styledData });

            if (window.DataManager && typeof window.DataManager.getGraphData === 'function' && typeof window.DataManager.setGraphData === 'function') {
                const currentData = window.DataManager.getGraphData();
                const newNodeData = { group: 'nodes', data: styledData, position: node.position() };
                const updatedData = { nodes: [...currentData.nodes, newNodeData], edges: currentData.edges };
                window.DataManager.setGraphData(updatedData, { skipLayout: true });
            }

            if (window.TableManager && typeof window.TableManager.updateNodeTypesTable === 'function') {
                window.TableManager.updateNodeTypesTable('', true);
            }

            const labelColor = styledData.labelColor
                || window.GraphAreaEditor?.getSettings?.()?.labelColor
                || '#333333';

            if (labelColor !== undefined && labelColor !== null) {
                try {
                    node.style('color', String(labelColor));
                } catch (styleErr) {
                }
            }

            if (styledData.labelPlacement && styledData.labelPlacement !== 'dynamic') {
                let textHalign = 'center';
                let textValign = 'center';
                switch (styledData.labelPlacement) {
                    case 'top':
                        textValign = 'top';
                        break;
                    case 'bottom':
                        textValign = 'bottom';
                        break;
                    case 'left':
                        textHalign = 'left';
                        break;
                    case 'right':
                        textHalign = 'right';
                        break;
                    default:
                        break;
                }
                node.style({
                    'text-halign': textHalign,
                    'text-valign': textValign
                });
            }

            const skipLayout = typeof options === 'boolean' ? options : options.skipLayout;
            if (!skipLayout && window.LayoutManager && typeof window.LayoutManager.calculateOptimalSizing === 'function' && typeof window.LayoutManager.updateNodeStyles === 'function') {
                const sizing = window.LayoutManager.calculateOptimalSizing(cy);
                window.LayoutManager.updateNodeStyles(cy, sizing);
            }

            return { id: node.id(), created: true };
        };

        const addEdgeIfNotExists = (cy, edgeData, options = {}) => {
            if (!edgeData || !edgeData.source || !edgeData.target) {
                return false;
            }
            const edgeCache = options.edgeCache instanceof Set ? options.edgeCache : null;
            const edgeKey = `${edgeData.source}::${edgeData.target}`;
            if (edgeCache) {
                if (edgeCache.has(edgeKey)) {
                    return false;
                }
            } else if (edgeExists(cy, edgeData.source, edgeData.target)) {
                return false;
            }
            cy.add({ group: 'edges', data: edgeData });
            if (edgeCache) {
                edgeCache.add(edgeKey);
            }
            const skipLayout = typeof options === 'boolean' ? options : options.skipLayout;
            if (!skipLayout && window.LayoutManager && typeof window.LayoutManager.calculateOptimalSizing === 'function' && typeof window.LayoutManager.updateNodeStyles === 'function') {
                const sizing = window.LayoutManager.calculateOptimalSizing(cy);
                window.LayoutManager.updateNodeStyles(cy, sizing);
            }
            return true;
        };

        const positionNodesNearSource = (cy, sourceId, newNodeIds, serviceName = null, useServiceContainer = true) => {
            if (!cy || !sourceId || !Array.isArray(newNodeIds) || newNodeIds.length === 0) {
                return;
            }

            let options = {};
            if (serviceName && typeof serviceName === 'object') {
                options = serviceName;
                serviceName = typeof options.serviceName === 'string' ? options.serviceName : null;
            } else if (typeof useServiceContainer === 'object') {
                options = useServiceContainer;
                useServiceContainer = typeof options.useServiceContainer === 'boolean' ? options.useServiceContainer : true;
            }
            if (typeof options.useServiceContainer === 'boolean') {
                useServiceContainer = options.useServiceContainer;
            }

            const source = cy.getElementById(sourceId);
            if (!source || source.empty()) {
                return;
            }

            const layoutName = window.LayoutManager && typeof window.LayoutManager.currentLayout === 'string'
                ? window.LayoutManager.currentLayout
                : '';
            const timelineLayoutActive = layoutName.startsWith('timeline');
            const timelineScaffoldingPresent = cy.nodes('[type="timeline-bar"], [type="timeline-anchor"], [type="timeline-tick"]').length > 0;
            const sourceTimelineScope = typeof source.data === 'function' ? source.data('_timelineScope') : null;
            const avoidIntegrationContainer = timelineLayoutActive || timelineScaffoldingPresent || Boolean(sourceTimelineScope);

            if (avoidIntegrationContainer) {
                useServiceContainer = false;
                if (options.reparent === undefined) {
                    options.reparent = false;
                }
            }

            const reparentNodes = options.reparent !== false;

            const origin = source.position();
            const radius = 80;
            const sourceParent = source.parent();
            const desiredContainerPosition = { x: origin.x + radius + 40, y: origin.y };
            let dataUpdated = false;
            let graphData;
            let nodeRecordById = null;
            if (window.DataManager &&
                typeof window.DataManager.getGraphData === 'function' &&
                typeof window.DataManager.setGraphData === 'function') {
                graphData = window.DataManager.getGraphData();
                if (graphData && Array.isArray(graphData.nodes)) {
                    nodeRecordById = new Map();
                    graphData.nodes.forEach(nodeRecord => {
                        if (nodeRecord && nodeRecord.data && nodeRecord.data.id) {
                            nodeRecordById.set(nodeRecord.data.id, nodeRecord);
                        }
                    });
                }
            }

            let container = null;
            let containerId = null;
            if (serviceName && useServiceContainer) {
                containerId = `${serviceName.toLowerCase()}_container_${sourceId}`;
                container = cy.getElementById(containerId);
                if (!container || container.empty()) {
                    const pos = { ...desiredContainerPosition };
                    if (window.GraphEditorAdapter && typeof window.GraphEditorAdapter.addContainer === 'function') {
                        const tempContainer = window.GraphEditorAdapter.addContainer(pos.x, pos.y, { label: serviceName, id: containerId });
                        if (tempContainer && typeof tempContainer.id === 'function') {
                            if (tempContainer.id() === containerId) {
                                container = tempContainer;
                            } else {
                                typeof tempContainer.remove === 'function' && tempContainer.remove();
                            }
                        }
                    }
                    if (!container || container.empty()) {
                        container = cy.add({
                            group: 'nodes',
                            data: { id: containerId, label: serviceName, type: 'container', isContainer: true },
                            position: pos,
                            classes: 'container'
                        });
                    }
                    if (sourceParent && sourceParent.length) {
                        container.move({ parent: sourceParent.id() });
                    }
                    if (graphData) {
                        graphData.nodes.push({
                            data: {
                                id: containerId,
                                label: serviceName,
                                type: 'container',
                                isContainer: true
                            },
                            position: pos,
                            classes: 'container'
                        });
                        dataUpdated = true;
                    }
                }
            }

            const nodesToPosition = newNodeIds
                .map(id => cy.getElementById(id))
                .filter(node => node && !node.empty());

            if (nodesToPosition.length === 0) {
                return;
            }

            const angleStep = (Math.PI * 2) / nodesToPosition.length;
            nodesToPosition.forEach((node, index) => {
                if (node.id() === sourceId) {
                    return;
                }

                const angle = angleStep * index;
                const x = origin.x + radius * Math.cos(angle);
                const y = origin.y + radius * Math.sin(angle);
                node.position({ x, y });

                if (graphData && nodeRecordById) {
                    const nodeRecord = nodeRecordById.get(node.id());
                    if (nodeRecord) {
                        nodeRecord.position = { x, y };
                        dataUpdated = true;
                    }
                }

                if (reparentNodes) {
                    let parentTarget = sourceParent;
                    if (container) {
                        parentTarget = container;
                    }
                    if (parentTarget && parentTarget.length) {
                        node.move({ parent: parentTarget.id() });
                        if (graphData && nodeRecordById) {
                            const nodeRecord = nodeRecordById.get(node.id());
                            if (nodeRecord && nodeRecord.data) {
                                nodeRecord.data.parent = parentTarget.id();
                                dataUpdated = true;
                            }
                        }
                    }
                }
            });

            if (graphData && dataUpdated && window.DataManager && typeof window.DataManager.setGraphData === 'function') {
                window.DataManager.setGraphData(graphData, { skipLayout: true });
            }
        };

        const getVirusTotalApiKey = () => getRuntime('virustotalApiKey', '');

        const createVirusTotalRelationshipTracker = () => {
            let sessionBackoff = getRuntime('vtRelationshipForbiddenEndpoints');
            if (!(sessionBackoff instanceof Set)) {
                sessionBackoff = new Set();
                setRuntime('vtRelationshipForbiddenEndpoints', sessionBackoff);
            }

            const requestBackoff = new Set();
            const loggedSkips = new Set();
            const categoryKey = key => `category:${key}`;

            const shouldSkip = (key, endpoint) => {
                const category = categoryKey(key);
                return sessionBackoff.has(endpoint)
                    || sessionBackoff.has(category)
                    || requestBackoff.has(endpoint)
                    || requestBackoff.has(category);
            };

            const recordForbidden = (key, endpoint) => {
                const category = categoryKey(key);
                sessionBackoff.add(endpoint);
                sessionBackoff.add(category);
                requestBackoff.add(endpoint);
                requestBackoff.add(category);
            };

            const logSkip = (key, endpoint) => {
                const logKey = `${key}:${endpoint}`;
                if (loggedSkips.has(logKey)) {
                    return;
                }
                loggedSkips.add(logKey);
                console.info(`VirusTotal relationship skipped (403 permission denied): ${endpoint}`);
            };

            return {
                shouldSkip,
                recordForbidden,
                logSkip
            };
        };

        const makeVirusTotalRequest = async (endpoint, method = 'GET', body = null, options = {}) => {
            const apiKey = getVirusTotalApiKey();

            if (!apiKey) {
                throw new Error('VirusTotal API key not configured');
            }

            const { allowForbidden = false, headers: extraHeaders = {} } = options;

            const url = `https://www.virustotal.com/api/v3${endpoint}`;

            const headers = {
                'x-apikey': apiKey,
                'Content-Type': 'application/json',
                ...extraHeaders
            };

            const requestOptions = {
                method,
                headers
            };

            if (body && method !== 'GET') {
                requestOptions.body = body instanceof FormData ? body : JSON.stringify(body);
                if (body instanceof FormData) {
                    delete headers['Content-Type'];
                }
            }

            try {
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
                    headers['x-proxy-x-apikey'] = apiKey;
                }

                const response = await services.network.fetch(fetchUrl, requestOptions);

                if (!response.ok) {
                    if (response.status === 401) {
                        const error = new Error('Invalid VirusTotal API key');
                        error.status = response.status;
                        throw error;
                    } else if (response.status === 429) {
                        const error = new Error('VirusTotal API quota exceeded');
                        error.status = response.status;
                        throw error;
                    } else if (response.status === 403 && allowForbidden) {
                        const fallbackData = await response.json().catch(() => ({ data: [] }));
                        return fallbackData || { data: [] };
                    } else if (response.status === 404) {
                        const error = new Error('Not found in VirusTotal');
                        error.code = 'VT_NOT_FOUND';
                        error.status = response.status;
                        throw error;
                    } else {
                        const error = new Error(`VirusTotal API request failed: ${response.status} ${response.statusText}`);
                        error.status = response.status;
                        throw error;
                    }
                }

                const data = await response.json();

                return data;
            } catch (error) {
                if (error?.code === 'VT_NOT_FOUND') {
                    console.info('VirusTotal resource not found:', endpoint);
                } else {
                    console.error('VirusTotal API error:', error);
                }
                throw error;
            }
        };

        const fetchVirusTotalDomainInfo = async (domain) => {
            const cleanDomain = sanitizeDomain(domain);
            const encoded = encodeURIComponent(cleanDomain);
            try {
                const [domainData, subdomains, siblings] = await Promise.all([
                    makeVirusTotalRequest(`/domains/${encoded}`),
                    makeVirusTotalRequest(`/domains/${encoded}/subdomains`).catch(() => ({ data: [] })),
                    makeVirusTotalRequest(`/domains/${encoded}/siblings`).catch(() => ({ data: [] }))
                ]);

                const attributes = domainData.data?.attributes || {};
                const subdomainList = (subdomains.data || []).map(d => d.id || d).join(', ');
                const siblingList = (siblings.data || []).map(d => d.id || d).join(', ');
                const { malicious, detectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
                const creationDate = attributes.creation_date ? new Date(attributes.creation_date * 1000).toISOString() : null;

                const infoFields = {
                    'Detection Ratio': detectionRatio,
                    'Subdomains': subdomainList,
                    'Sibling Domains': siblingList,
                    'Creation Date': creationDate
                };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio,
                    malicious,
                    creationDate,
                    info: infoText,
                    infoHtml,
                    data: domainData.data,
                    subdomains: subdomains.data || [],
                    siblings: siblings.data || []
                };
            } catch (e) {
                console.error('Failed to fetch domain info:', e);
                const infoFields = { 'Detection Ratio': '0/0' };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio: '0/0',
                    malicious: 0,
                    creationDate: null,
                    info: infoText,
                    infoHtml,
                    data: null,
                    subdomains: [],
                    siblings: []
                };
            }
        };

        const fetchVirusTotalFileInfo = async (hash) => {
            try {
                const data = await makeVirusTotalRequest(`/files/${hash}`);
                const attributes = data.data?.attributes || {};
                const { malicious, detectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
                const fileName = attributes.meaningful_name || (attributes.names && attributes.names[0]) || hash;
                const fileType = attributes.type_description || attributes.type_tag || '';
                const firstSubmissionDate = attributes.first_submission_date
                    ? new Date(attributes.first_submission_date * 1000).toISOString()
                    : null;

                const infoFields = {
                    'Detection Ratio': detectionRatio,
                    'File Name': fileName,
                    'File Type': fileType,
                    'First Seen': firstSubmissionDate
                };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio,
                    malicious,
                    fileName,
                    fileType,
                    firstSubmissionDate,
                    info: infoText,
                    infoHtml,
                    data: data.data
                };
            } catch (e) {
                console.error('Failed to fetch file info:', e);
                const infoFields = { 'Detection Ratio': '0/0' };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio: '0/0',
                    malicious: 0,
                    fileName: hash,
                    fileType: '',
                    firstSubmissionDate: null,
                    info: infoText,
                    infoHtml,
                    data: null
                };
            }
        };

        const fetchVirusTotalIPInfo = async (ip) => {
            try {
                const data = await makeVirusTotalRequest(`/ip_addresses/${ip}`);
                const attributes = data.data?.attributes || {};
                const { malicious, detectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
                const country = attributes.country || null;
                const lastModDate = attributes.last_modification_date
                    ? new Date(attributes.last_modification_date * 1000).toISOString()
                    : null;

                const infoFields = {
                    'Detection Ratio': detectionRatio,
                    'Country': country,
                    'Last Seen': lastModDate
                };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio,
                    malicious,
                    country,
                    lastModDate,
                    info: infoText,
                    infoHtml,
                    data: data.data
                };
            } catch (e) {
                console.error('Failed to fetch IP info:', e);
                const infoFields = { 'Detection Ratio': '0/0' };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio: '0/0',
                    malicious: 0,
                    country: null,
                    lastModDate: null,
                    info: infoText,
                    infoHtml,
                    data: null
                };
            }
        };

        const queryVirusTotalURL = async (url) => {
            if (!url) {
                throw new Error('URL is required');
            }

            try {
                new URL(url.trim());
            } catch (e) {
                throw new Error('Invalid URL format');
            }

            const urlId = btoa(url.trim()).replace(/=/g, '');

            return await makeVirusTotalRequest(`/urls/${urlId}`);
        };

        const fetchVirusTotalURLInfo = async (url) => {
            try {
                const data = await queryVirusTotalURL(url);
                const attributes = data.data?.attributes || {};
                const { detectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
                const lastAnalysisDate = attributes.last_analysis_date
                    ? new Date(attributes.last_analysis_date * 1000).toISOString()
                    : null;

                const infoFields = {
                    'Detection Ratio': detectionRatio,
                    'Last Analysis': lastAnalysisDate
                };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio,
                    lastAnalysisDate,
                    info: infoText,
                    infoHtml,
                    data: data.data
                };
            } catch (e) {
                console.error('Failed to fetch URL info:', e);
                const infoFields = { 'Detection Ratio': '0/0' };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                return {
                    detectionRatio: '0/0',
                    lastAnalysisDate: null,
                    info: infoText,
                    infoHtml,
                    data: null
                };
            }
        };

        const updateVirusTotalInfoForNodes = async (nodes = []) => {
            const nodeList = Array.isArray(nodes)
                ? nodes
                : (nodes && typeof nodes.forEach === 'function' ? Array.from(nodes) : []);

            if (nodeList.length === 0) {
                return { updated: 0, skipped: 0, failed: 0 };
            }

            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                throw new Error('Graph not initialized');
            }

            const cy = window.GraphRenderer.cy;
            const results = {
                updated: 0,
                skipped: 0,
                failed: 0
            };

            const hasVirusTotalData = node => {
                if (!node) return false;
                const data = node.data();
                return Boolean(data?.detectionRatio || data?.vtData || data?.vtLastAnalysisStats || data?.vtPermalink);
            };

            for (const node of nodeList) {
                if (!node || typeof node.data !== 'function') {
                    results.skipped++;
                    continue;
                }

                const nodeType = node.data('type');
                const identifier = node.data('label') || node.id();

                try {
                    let infoData;
                    let updated = false;

                    if (nodeType === 'domain') {
                        infoData = await fetchVirusTotalDomainInfo(identifier);
                        const newData = infoData.data?.attributes?.last_analysis_stats || {};
                        node.data('vtLastAnalysisStats', newData);
                        updated = true;
                    } else if (nodeType === 'ipaddress') {
                        infoData = await fetchVirusTotalIPInfo(identifier);
                        const newData = infoData.data?.attributes?.last_analysis_stats || {};
                        node.data('vtLastAnalysisStats', newData);
                        updated = true;
                    } else if (nodeType === 'malware') {
                        infoData = await fetchVirusTotalFileInfo(identifier);
                        const newData = infoData.data?.attributes?.last_analysis_stats || {};
                        node.data('vtLastAnalysisStats', newData);
                        updated = true;
                    } else if (nodeType === 'url') {
                        infoData = await fetchVirusTotalURLInfo(identifier);
                        const newData = infoData.data?.attributes?.last_analysis_stats || {};
                        node.data('vtLastAnalysisStats', newData);
                        updated = true;
                    } else {
                        results.skipped++;
                        continue;
                    }

                    if (updated) {
                        const attributes = infoData.data?.attributes || {};
                        const { detectionRatio } = calculateDetectionStats(attributes.last_analysis_stats || {});
                        const resolvedDetectionRatio = infoData.detectionRatio || detectionRatio;
                        node.data('detectionRatio', resolvedDetectionRatio);

                        if (nodeType === 'domain' && infoData.creationDate) {
                            node.data('creationDate', infoData.creationDate);
                            node.data('timestamp', infoData.creationDate);
                        }

                        if (nodeType === 'malware') {
                            if (infoData.fileName) {
                                node.data('fileName', infoData.fileName);
                            }
                            if (infoData.fileType) {
                                node.data('fileType', infoData.fileType);
                            }
                            if (infoData.firstSubmissionDate) {
                                node.data('firstSubmissionDate', infoData.firstSubmissionDate);
                                node.data('firstSeen', infoData.firstSubmissionDate);
                                node.data('timestamp', infoData.firstSubmissionDate);
                            }
                        }

                        if (nodeType === 'ipaddress') {
                            if (infoData.country) {
                                node.data('country', infoData.country);
                            }
                            if (infoData.lastModDate) {
                                node.data('lastModDate', infoData.lastModDate);
                                node.data('lastSeen', infoData.lastModDate);
                                node.data('timestamp', infoData.lastModDate);
                            }
                            if (attributes.country && !infoData.country) {
                                node.data('country', attributes.country);
                            }
                            const asName = getAsName(attributes);
                            if (attributes.asn) {
                                node.data('asn', attributes.asn);
                            }
                            if (asName) {
                                node.data('asName', asName);
                            }
                            if (attributes.network) {
                                node.data('network', attributes.network);
                            }
                            if (attributes.reputation !== undefined) {
                                node.data('reputation', attributes.reputation);
                            }
                        }

                        if (nodeType === 'url' && infoData.lastAnalysisDate) {
                            node.data('lastAnalysisDate', infoData.lastAnalysisDate);
                        }

                        const infoFields = {
                            'Detection Ratio': resolvedDetectionRatio,
                            'Last Analysis': attributes.last_analysis_date
                                ? new Date(attributes.last_analysis_date * 1000).toISOString()
                                : null
                        };

                        if (nodeType === 'ipaddress') {
                            if (infoData.country || attributes.country) {
                                infoFields['Country'] = infoData.country || attributes.country;
                            }
                            if (infoData.lastModDate) {
                                infoFields['Last Seen'] = infoData.lastModDate;
                            }
                            if (attributes.asn) {
                                infoFields['ASN'] = attributes.asn;
                            }
                            const asName = getAsName(attributes);
                            if (asName) {
                                infoFields['AS Name'] = asName;
                            }
                            if (attributes.network) {
                                infoFields['Network'] = attributes.network;
                            }
                            if (attributes.reputation !== undefined) {
                                infoFields['Reputation'] = attributes.reputation;
                            }
                        }

                        const infoHtml = infoData.infoHtml || formatInfoHTML(infoFields);
                        const infoText = infoData.info || formatInfoText(infoFields);
                        node.data('info', infoText);
                        node.data('infoHtml', infoHtml);
                        results.updated++;
                    }
                } catch (error) {
                    console.error('Quick VirusTotal info update failed:', error);
                    results.failed++;
                }
            }

            return results;
        };

        const queryVirusTotalFile = async (fileHash) => {
            if (!fileHash) {
                throw new Error('File hash is required');
            }

            const hash = fileHash.trim();
            return await makeVirusTotalRequest(`/files/${hash}`);
        };

        const queryVirusTotalFileEnhanced = async (fileHash) => {
            if (!fileHash) {
                throw new Error('File hash is required');
            }

            const hash = fileHash.trim();

            try {
                const fileData = await makeVirusTotalRequest(`/files/${hash}`);
                const relationshipTracker = createVirusTotalRelationshipTracker();
                const relationships = {};

                const relationshipEndpoints = {
                    communicating_files: `/files/${hash}/relationships/communicating_files`,
                    dropped_files: `/files/${hash}/relationships/dropped_files`,
                    execution_parents: `/files/${hash}/relationships/execution_parents`,
                    contacted_domains: `/files/${hash}/relationships/contacted_domains`,
                    contacted_ips: `/files/${hash}/relationships/contacted_ips`,
                    contacted_urls: `/files/${hash}/relationships/contacted_urls`,
                    submissions: `/files/${hash}/relationships/submissions`,
                    related_samples: `/files/${hash}/relationships/related_samples`
                };

                for (const [key, endpoint] of Object.entries(relationshipEndpoints)) {
                    if (relationshipTracker.shouldSkip(key, endpoint)) {
                        relationshipTracker.logSkip(key, endpoint);
                        continue;
                    }

                    try {
                        const response = await makeVirusTotalRequest(endpoint);
                        relationships[key] = response.data || [];
                    } catch (error) {
                        if (error.status === 403) {
                            relationshipTracker.recordForbidden(key, endpoint);
                        }
                        console.warn('VirusTotal relationship request failed:', endpoint, error);
                        relationships[key] = [];
                    }
                }

                return {
                    data: fileData.data,
                    relationships
                };
            } catch (error) {
                console.error('Enhanced VirusTotal query failed:', error);
                return await makeVirusTotalRequest(`/files/${hash}`);
            }
        };

        const queryVirusTotalDomain = async (domain, { includeRelationships = true } = {}) => {
            if (!domain) {
                throw new Error('Domain is required');
            }

            const cleanDomain = sanitizeDomain(domain);
            const encoded = encodeURIComponent(cleanDomain);

            const domainData = await makeVirusTotalRequest(`/domains/${encoded}`);
            const relationships = {};

            if (includeRelationships) {
                const relationshipTracker = createVirusTotalRelationshipTracker();
                const relationshipEndpoints = {
                    resolutions: `/domains/${encoded}/resolutions`,
                    subdomains: `/domains/${encoded}/subdomains`,
                    siblings: `/domains/${encoded}/siblings`,
                    communicating_files: `/domains/${encoded}/communicating_files`,
                    detected_urls: `/domains/${encoded}/detected_urls`
                };

                for (const [key, endpoint] of Object.entries(relationshipEndpoints)) {
                    if (relationshipTracker.shouldSkip(key, endpoint)) {
                        relationshipTracker.logSkip(key, endpoint);
                        continue;
                    }

                    try {
                        const response = await makeVirusTotalRequest(endpoint);
                        relationships[key] = response.data || [];
                    } catch (error) {
                        if (error.status === 403) {
                            relationshipTracker.recordForbidden(key, endpoint);
                        }
                        console.warn('VirusTotal relationship request failed:', endpoint, error);
                        relationships[key] = [];
                    }
                }
            }

            return {
                data: domainData.data,
                relationships
            };
        };

        const queryVirusTotalIP = async (ipAddress, { includeRelationships = true } = {}) => {
            if (!ipAddress) {
                throw new Error('IP address is required');
            }

            const ip = ipAddress.trim();

            const ipData = await makeVirusTotalRequest(`/ip_addresses/${ip}`);
            const relationships = {};

            if (includeRelationships) {
                const relationshipTracker = createVirusTotalRelationshipTracker();
                const relationshipEndpoints = {
                    resolutions: `/ip_addresses/${ip}/resolutions`,
                    communicating_files: `/ip_addresses/${ip}/communicating_files`,
                    detected_urls: `/ip_addresses/${ip}/detected_urls`,
                    detected_communicating_files: `/ip_addresses/${ip}/detected_communicating_files`
                };

                for (const [key, endpoint] of Object.entries(relationshipEndpoints)) {
                    if (relationshipTracker.shouldSkip(key, endpoint)) {
                        relationshipTracker.logSkip(key, endpoint);
                        continue;
                    }

                    try {
                        const response = await makeVirusTotalRequest(endpoint);
                        relationships[key] = response.data || [];
                    } catch (error) {
                        if (error.status === 403) {
                            relationshipTracker.recordForbidden(key, endpoint);
                        }
                        console.warn('VirusTotal relationship request failed:', endpoint, error);
                        relationships[key] = [];
                    }
                }
            }

            return {
                data: ipData.data,
                relationships
            };
        };

        const submitVirusTotalURL = async (url) => {
            if (!url) {
                throw new Error('URL is required');
            }

            try {
                new URL(url.trim());
            } catch (e) {
                throw new Error('Invalid URL format');
            }

            const formData = new FormData();
            formData.append('url', url.trim());

            return await makeVirusTotalRequest('/urls', 'POST', formData);
        };

        const getVirusTotalUploadURL = async () => {
            return await makeVirusTotalRequest('/files/upload_url');
        };

        const processVirusTotalFileData = async (data, fileHash, queryType = 'file') => {
            if (!data || !data.data) {
                throw new Error('Invalid VirusTotal file data format');
            }

            const fileData = data.data;
            const attributes = fileData.attributes;
            const relationships = data.relationships || {};

            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                throw new Error('Graph not initialized');
            }

            if (window.DomainLoader && typeof window.DomainLoader.loadAndActivateDomains === 'function') {
                try {
                    await window.DomainLoader.loadAndActivateDomains(['cybersecurity']);
                } catch (e) {
                }
            }

            const cy = window.GraphRenderer.cy;
            const existingNodeIds = new Set(cy.nodes().map(n => n.id()));
            const bulkOptions = { skipLayout: true };
            const edgeCache = new Set(cy.edges().map(edge => `${edge.data('source')}::${edge.data('target')}`));
            const edgeOptions = { ...bulkOptions, edgeCache };
            let nodesAdded = 0;
            let edgesAdded = 0;

            const fileLabel = fileHash;
            const { malicious: fileMalicious, detectionRatio: fileDetectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
            const fileInfoFields = {
                'Detection Ratio': fileDetectionRatio,
                'File Name': attributes.meaningful_name || (attributes.names && attributes.names[0]) || fileHash,
                'File Type': attributes.type_description || attributes.type_tag || '',
                'File Size': attributes.size ? `${attributes.size} bytes` : null,
                'First Seen': attributes.first_submission_date ? new Date(attributes.first_submission_date * 1000).toISOString() : null,
                'Last Seen': attributes.last_submission_date ? new Date(attributes.last_submission_date * 1000).toISOString() : null
            };
            const fileInfoHtml = formatInfoHTML(fileInfoFields);
            const fileInfoText = formatInfoText(fileInfoFields);
            const fileNodeData = {
                id: `file_${fileHash}`,
                label: fileLabel,
                type: 'malware',
                color: fileMalicious > 0 ? '#FF4444' : '#80FF80',
                size: 35,
                fileHash: fileHash,
                fileSize: attributes.size,
                fileName: attributes.meaningful_name || (attributes.names && attributes.names[0]) || fileHash,
                fileType: attributes.type_description || attributes.type_tag || '',
                detectionRatio: fileDetectionRatio,
                firstSeen: attributes.first_submission_date ? new Date(attributes.first_submission_date * 1000).toISOString() : null,
                lastSeen: attributes.last_submission_date ? new Date(attributes.last_submission_date * 1000).toISOString() : null,
                timestamp: attributes.first_submission_date ? new Date(attributes.first_submission_date * 1000).toISOString() : null,
                info: fileInfoText,
                infoHtml: fileInfoHtml
            };
            const { id: fileNodeId, created: fileCreated } = await getOrCreateNode(cy, fileNodeData.id, fileNodeData, bulkOptions);
            const fileNode = cy.getElementById(fileNodeId);
            fileNode.data({
                detectionRatio: fileNodeData.detectionRatio,
                fileName: fileNodeData.fileName,
                fileType: fileNodeData.fileType,
                firstSeen: fileNodeData.firstSeen,
                lastSeen: fileNodeData.lastSeen,
                timestamp: fileNodeData.timestamp,
                info: fileInfoText,
                infoHtml: fileInfoHtml
            });
            if (fileCreated) {
                nodesAdded++;
            }

            const newNodeIds = [];
            if (fileCreated) {
                newNodeIds.push(fileNodeId);
            }

            if (relationships.communicating_files && Array.isArray(relationships.communicating_files)) {
                for (const relation of relationships.communicating_files) {
                    const relatedHash = relation.attributes?.sha256 || relation.attributes?.sha1 || relation.attributes?.md5 || relation.id;
                    if (!relatedHash) continue;

                    if (existingNodeIds.has(`file_${relatedHash}`)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(relation.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': relation.attributes?.type_description || relation.attributes?.type_tag || '',
                        'First Seen': relation.attributes?.first_submission_date
                            ? new Date(relation.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const relatedNodeData = {
                        id: `file_${relatedHash}`,
                        label: relatedHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash: relatedHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: relatedNodeId, created } = await getOrCreateNode(cy, relatedNodeData.id, relatedNodeData, bulkOptions);
                    cy.getElementById(relatedNodeId).data('info', infoText);
                    cy.getElementById(relatedNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(relatedNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_communicates_${relatedNodeId}`,
                        source: fileNodeId,
                        target: relatedNodeId,
                        label: 'Communicates With'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.dropped_files && Array.isArray(relationships.dropped_files)) {
                for (const relation of relationships.dropped_files) {
                    const droppedHash = relation.attributes?.sha256 || relation.attributes?.sha1 || relation.attributes?.md5 || relation.id;
                    if (!droppedHash) continue;

                    if (existingNodeIds.has(`file_${droppedHash}`)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(relation.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': relation.attributes?.type_description || relation.attributes?.type_tag || '',
                        'First Seen': relation.attributes?.first_submission_date
                            ? new Date(relation.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const droppedNodeData = {
                        id: `file_${droppedHash}`,
                        label: droppedHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash: droppedHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: droppedNodeId, created } = await getOrCreateNode(cy, droppedNodeData.id, droppedNodeData, bulkOptions);
                    cy.getElementById(droppedNodeId).data('info', infoText);
                    cy.getElementById(droppedNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(droppedNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_drops_${droppedNodeId}`,
                        source: fileNodeId,
                        target: droppedNodeId,
                        label: 'Drops'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.execution_parents && Array.isArray(relationships.execution_parents)) {
                for (const relation of relationships.execution_parents) {
                    const parentHash = relation.attributes?.sha256 || relation.attributes?.sha1 || relation.attributes?.md5 || relation.id;
                    if (!parentHash) continue;

                    if (existingNodeIds.has(`file_${parentHash}`)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(relation.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': relation.attributes?.type_description || relation.attributes?.type_tag || '',
                        'First Seen': relation.attributes?.first_submission_date
                            ? new Date(relation.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const parentNodeData = {
                        id: `file_${parentHash}`,
                        label: parentHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash: parentHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: parentNodeId, created } = await getOrCreateNode(cy, parentNodeData.id, parentNodeData, bulkOptions);
                    cy.getElementById(parentNodeId).data('info', infoText);
                    cy.getElementById(parentNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(parentNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_parent_${parentNodeId}`,
                        source: parentNodeId,
                        target: fileNodeId,
                        label: 'Parent of'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.contacted_domains && Array.isArray(relationships.contacted_domains)) {
                for (const relation of relationships.contacted_domains) {
                    const domain = relation.id || relation.attributes?.id;
                    if (!domain || isDomainBlocked(domain)) continue;

                    const infoFields = {
                        'Domain': domain,
                        'Last Analysis': relation.attributes?.last_analysis_date
                            ? new Date(relation.attributes.last_analysis_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const domainNodeData = {
                        id: domain,
                        label: domain,
                        type: 'domain',
                        color: '#4A90E2',
                        size: 30,
                        domain,
                        info: infoText,
                        infoHtml
                    };

                    const { id: domainNodeId, created } = await getOrCreateNode(cy, domainNodeData.id, domainNodeData, bulkOptions);
                    cy.getElementById(domainNodeId).data('info', infoText);
                    cy.getElementById(domainNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(domainNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_contacts_${domainNodeId}`,
                        source: fileNodeId,
                        target: domainNodeId,
                        label: 'Contacts'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.contacted_ips && Array.isArray(relationships.contacted_ips)) {
                for (const relation of relationships.contacted_ips) {
                    const ip = relation.id || relation.attributes?.id;
                    if (!ip) continue;

                    const infoFields = {
                        'IP Address': ip,
                        'Last Analysis': relation.attributes?.last_analysis_date
                            ? new Date(relation.attributes.last_analysis_date * 1000).toISOString()
                            : null,
                        'Country': relation.attributes?.country || null,
                        'ASN': relation.attributes?.asn || null,
                        'AS Name': getAsName(relation.attributes) || null,
                        'Network': relation.attributes?.network || null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const ipNodeData = {
                        id: `ip_${ip}`,
                        label: ip,
                        type: 'ipaddress',
                        color: '#50E3C2',
                        size: 30,
                        ipAddress: ip,
                        country: relation.attributes?.country,
                        asn: relation.attributes?.asn,
                        asName: getAsName(relation.attributes),
                        network: relation.attributes?.network,
                        info: infoText,
                        infoHtml
                    };

                    const { id: ipNodeId, created } = await getOrCreateNode(cy, ipNodeData.id, ipNodeData, bulkOptions);
                    cy.getElementById(ipNodeId).data('info', infoText);
                    cy.getElementById(ipNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(ipNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_contacts_${ipNodeId}`,
                        source: fileNodeId,
                        target: ipNodeId,
                        label: 'Contacts'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.contacted_urls && Array.isArray(relationships.contacted_urls)) {
                for (const relation of relationships.contacted_urls) {
                    const url = relation.id || relation.attributes?.url;
                    if (!url) continue;

                    const infoFields = {
                        'URL': url,
                        'Last Analysis': relation.attributes?.last_analysis_date
                            ? new Date(relation.attributes.last_analysis_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const urlNodeData = {
                        id: `url_${btoa(url).replace(/=/g, '')}`,
                        label: url,
                        type: 'url',
                        color: '#F5A623',
                        size: 30,
                        url,
                        info: infoText,
                        infoHtml
                    };

                    const { id: urlNodeId, created } = await getOrCreateNode(cy, urlNodeData.id, urlNodeData, bulkOptions);
                    cy.getElementById(urlNodeId).data('info', infoText);
                    cy.getElementById(urlNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(urlNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_contacts_${urlNodeId}`,
                        source: fileNodeId,
                        target: urlNodeId,
                        label: 'Contacts'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.submissions && Array.isArray(relationships.submissions)) {
                for (const relation of relationships.submissions) {
                    const submitter = relation.attributes?.submitter_country || relation.attributes?.submitter;
                    if (!submitter) continue;

                    const infoFields = {
                        'Submitter': submitter
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const submitterNodeData = {
                        id: `submitter_${submitter}`,
                        label: submitter,
                        type: 'organization',
                        color: '#7ED321',
                        size: 25,
                        submitter,
                        info: infoText,
                        infoHtml
                    };

                    const { id: submitterNodeId, created } = await getOrCreateNode(cy, submitterNodeData.id, submitterNodeData, bulkOptions);
                    cy.getElementById(submitterNodeId).data('info', infoText);
                    cy.getElementById(submitterNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(submitterNodeId);
                    }

                    const edgeData = {
                        id: `${submitterNodeId}_submitted_${fileNodeId}`,
                        source: submitterNodeId,
                        target: fileNodeId,
                        label: 'Submitted'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.related_samples && Array.isArray(relationships.related_samples)) {
                for (const relation of relationships.related_samples) {
                    const relatedHash = relation.attributes?.sha256 || relation.attributes?.sha1 || relation.attributes?.md5 || relation.id;
                    if (!relatedHash) continue;

                    if (existingNodeIds.has(`file_${relatedHash}`)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(relation.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': relation.attributes?.type_description || relation.attributes?.type_tag || '',
                        'First Seen': relation.attributes?.first_submission_date
                            ? new Date(relation.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const relatedNodeData = {
                        id: `file_${relatedHash}`,
                        label: relatedHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash: relatedHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: relatedNodeId, created } = await getOrCreateNode(cy, relatedNodeData.id, relatedNodeData, bulkOptions);
                    cy.getElementById(relatedNodeId).data('info', infoText);
                    cy.getElementById(relatedNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(relatedNodeId);
                    }

                    const edgeData = {
                        id: `${fileNodeId}_related_${relatedNodeId}`,
                        source: fileNodeId,
                        target: relatedNodeId,
                        label: 'Related'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (newNodeIds.length > 0) {
                positionNodesNearSource(cy, fileNodeId, newNodeIds, 'VirusTotal');
            }

            if (window.TableManager && window.TableManager.updateTables) {
                window.TableManager.updateTables();
                if (window.TableManager.updateTotalDataTable) {
                    window.TableManager.updateTotalDataTable();
                }
            }
            if (window.GraphAreaEditor && window.GraphAreaEditor.applySettings) {
                window.GraphAreaEditor.applySettings();
            }

            return {
                nodesAdded,
                edgesAdded,
                fileHash,
                detectionRatio: fileDetectionRatio
            };
        };

        const processVirusTotalDomainData = async (data, domain) => {
            if (!data || !data.data) {
                throw new Error('Invalid VirusTotal domain data format');
            }

            const cleanDomain = sanitizeDomain(domain);
            if (isDomainBlocked(cleanDomain)) {
                return { nodesAdded: 0, edgesAdded: 0, domain: cleanDomain, detectionRatio: '0/0', reputation: 0 };
            }

            const domainData = data.data;
            const attributes = domainData.attributes || {};
            const relationships = data.relationships || {};

            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                throw new Error('Graph not initialized');
            }

            if (window.DomainLoader && typeof window.DomainLoader.loadAndActivateDomains === 'function') {
                try {
                    await window.DomainLoader.loadAndActivateDomains(['cybersecurity']);
                } catch (e) {
                }
            }

            const cy = window.GraphRenderer.cy;
            const existingNodeIds = new Set(cy.nodes().map(n => n.id()));
            const bulkOptions = { skipLayout: true };
            const edgeCache = new Set(cy.edges().map(edge => `${edge.data('source')}::${edge.data('target')}`));
            const edgeOptions = { ...bulkOptions, edgeCache };
            let nodesAdded = 0;
            let edgesAdded = 0;

            const { malicious: domainMalicious, detectionRatio: domainDetectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
            const subdomainsList = (relationships.subdomains || []).map(s => s.id || s).join(', ');
            const siblingsList = (relationships.siblings || []).map(s => s.id || s).join(', ');
            const domainInfoFields = {
                'Detection Ratio': domainDetectionRatio,
                'Reputation': attributes.reputation || 0,
                'Subdomains': subdomainsList,
                'Sibling Domains': siblingsList,
                'Creation Date': attributes.creation_date ? new Date(attributes.creation_date * 1000).toISOString() : null,
                'Last Seen': attributes.last_modification_date ? new Date(attributes.last_modification_date * 1000).toISOString() : null
            };
            if (attributes.registrar) {
                domainInfoFields['Registrar'] = attributes.registrar;
            }
            if (attributes.last_analysis_date) {
                domainInfoFields['Last Analysis'] = new Date(attributes.last_analysis_date * 1000).toISOString();
            }
            const domainInfoHtml = formatInfoHTML(domainInfoFields);
            const domainInfoText = formatInfoText(domainInfoFields);
            const domainNodeData = {
                id: cleanDomain,
                label: cleanDomain,
                type: 'domain',
                color: domainMalicious > 0 ? '#FF4444' : '#FF5282',
                size: 40,
                domain: cleanDomain,
                detectionRatio: domainDetectionRatio,
                reputation: attributes.reputation || 0,
                lastSeen: attributes.last_modification_date ? new Date(attributes.last_modification_date * 1000).toISOString() : null,
                timestamp: attributes.creation_date ? new Date(attributes.creation_date * 1000).toISOString() : null,
                info: domainInfoText,
                infoHtml: domainInfoHtml
            };

            const { id: domainNodeId, created: domainCreated } = await getOrCreateNode(
                cy,
                domainNodeData.id,
                domainNodeData,
                bulkOptions
            );
            const domainCreationTime = attributes.creation_date ? new Date(attributes.creation_date * 1000).toISOString() : null;
            const domainNode = cy.getElementById(domainNodeId);
            domainNode.data({
                detectionRatio: domainNodeData.detectionRatio,
                reputation: domainNodeData.reputation,
                creationDate: domainCreationTime,
                timestamp: domainCreationTime,
                lastSeen: domainNodeData.lastSeen,
                info: domainInfoText,
                infoHtml: domainInfoHtml
            });
            if (domainCreated) {
                nodesAdded++;
            }

            const createdNodes = domainCreated ? [domainNodeId] : [];
            const ipSet = new Set();
            if (Array.isArray(attributes.last_dns_records)) {
                attributes.last_dns_records.forEach(record => {
                    if (record && record.type === 'A' && record.value) {
                        ipSet.add(record.value);
                    }
                });
            }
            if (relationships.resolutions && Array.isArray(relationships.resolutions)) {
                relationships.resolutions.forEach(resolution => {
                    const ip = resolution.attributes?.ip_address || resolution.id || resolution;
                    if (ip) {
                        ipSet.add(ip);
                    }
                });
            }

            for (const ip of ipSet) {
                const infoFields = {
                    'IP Address': ip
                };
                const infoHtml = formatInfoHTML(infoFields);
                const infoText = formatInfoText(infoFields);
                const ipNodeData = {
                    id: `ip_${String(ip).replace(/[^a-zA-Z0-9]/g, '_')}`,
                    label: ip,
                    type: 'ipaddress',
                    color: '#0080FF',
                    size: 30,
                    ipAddress: ip,
                    info: infoText,
                    infoHtml
                };

                const { id: ipNodeId, created } = await getOrCreateNode(cy, ipNodeData.id, ipNodeData, bulkOptions);
                cy.getElementById(ipNodeId).data('info', infoText);
                cy.getElementById(ipNodeId).data('infoHtml', infoHtml);
                if (created) {
                    nodesAdded++;
                    createdNodes.push(ipNodeId);
                }

                const edgeData = {
                    id: `${domainNodeId}_resolves_${ipNodeId}`,
                    source: domainNodeId,
                    target: ipNodeId,
                    label: 'Resolves To'
                };
                if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                    edgesAdded++;
                }
            }

            if (relationships.subdomains && Array.isArray(relationships.subdomains)) {
                for (const relation of relationships.subdomains) {
                    const subdomain = relation.id || relation.attributes?.id;
                    if (!subdomain || isDomainBlocked(subdomain)) continue;

                    const infoFields = {
                        'Subdomain': subdomain
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const subNodeData = {
                        id: subdomain,
                        label: subdomain,
                        type: 'domain',
                        color: '#4A90E2',
                        size: 28,
                        domain: subdomain,
                        info: infoText,
                        infoHtml
                    };

                    const { id: subNodeId, created } = await getOrCreateNode(cy, subNodeData.id, subNodeData, bulkOptions);
                    cy.getElementById(subNodeId).data('info', infoText);
                    cy.getElementById(subNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        createdNodes.push(subNodeId);
                    }

                    const edgeData = {
                        id: `${domainNodeId}_subdomain_${subNodeId}`,
                        source: domainNodeId,
                        target: subNodeId,
                        label: 'Subdomain'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.siblings && Array.isArray(relationships.siblings)) {
                for (const relation of relationships.siblings) {
                    const sibling = relation.id || relation.attributes?.id;
                    if (!sibling || isDomainBlocked(sibling)) continue;

                    const infoFields = {
                        'Sibling': sibling
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const siblingNodeData = {
                        id: sibling,
                        label: sibling,
                        type: 'domain',
                        color: '#4A90E2',
                        size: 28,
                        domain: sibling,
                        info: infoText,
                        infoHtml
                    };

                    const { id: siblingNodeId, created } = await getOrCreateNode(cy, siblingNodeData.id, siblingNodeData, bulkOptions);
                    cy.getElementById(siblingNodeId).data('info', infoText);
                    cy.getElementById(siblingNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        createdNodes.push(siblingNodeId);
                    }

                    const edgeData = {
                        id: `${domainNodeId}_sibling_${siblingNodeId}`,
                        source: domainNodeId,
                        target: siblingNodeId,
                        label: 'Sibling'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            const malwareRelationships = [
                { key: 'communicating_files', label: 'Communicates With', direction: 'from_file' },
                { key: 'referrer_files', label: 'Refers', direction: 'from_file' },
                { key: 'downloaded_files', label: 'Downloads', direction: 'to_file' }
            ];

            for (const rel of malwareRelationships) {
                const files = relationships[rel.key];
                if (!files || !Array.isArray(files)) {
                    continue;
                }

                for (const fileObj of files) {
                    const fileHash = fileObj?.sha256 || fileObj?.id || fileObj;
                    if (!fileHash) {
                        continue;
                    }

                    const fileNodeId = `file_${fileHash}`;
                    if (existingNodeIds.has(fileNodeId)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(fileObj?.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': fileObj?.attributes?.type_description || fileObj?.attributes?.type_tag || '',
                        'First Seen': fileObj?.attributes?.first_submission_date
                            ? new Date(fileObj.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const fileNodeData = {
                        id: fileNodeId,
                        label: fileHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: createdFileNodeId, created } = await getOrCreateNode(cy, fileNodeData.id, fileNodeData, bulkOptions);
                    cy.getElementById(createdFileNodeId).data('info', infoText);
                    cy.getElementById(createdFileNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        createdNodes.push(createdFileNodeId);
                    }

                    const sourceId = rel.direction === 'from_file' ? createdFileNodeId : domainNodeId;
                    const targetId = rel.direction === 'from_file' ? domainNodeId : createdFileNodeId;
                    const edgeData = {
                        id: `${sourceId}_${rel.key}_${targetId}`,
                        source: sourceId,
                        target: targetId,
                        label: rel.label
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.detected_urls && Array.isArray(relationships.detected_urls)) {
                for (const relation of relationships.detected_urls) {
                    const url = relation.attributes?.url || relation.id;
                    if (!url) continue;

                    const infoFields = {
                        'URL': url,
                        'Detection Ratio': relation.attributes?.positives !== undefined && relation.attributes?.total !== undefined
                            ? `${relation.attributes.positives}/${relation.attributes.total}`
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const urlNodeData = {
                        id: `url_${btoa(url).replace(/=/g, '')}`,
                        label: url,
                        type: 'url',
                        color: '#F5A623',
                        size: 30,
                        url,
                        info: infoText,
                        infoHtml
                    };

                    const { id: urlNodeId, created } = await getOrCreateNode(cy, urlNodeData.id, urlNodeData, bulkOptions);
                    cy.getElementById(urlNodeId).data('info', infoText);
                    cy.getElementById(urlNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        createdNodes.push(urlNodeId);
                    }

                    const edgeData = {
                        id: `${domainNodeId}_detected_${urlNodeId}`,
                        source: domainNodeId,
                        target: urlNodeId,
                        label: 'Detected URL'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (createdNodes.length > 0) {
                positionNodesNearSource(cy, domainNodeId, createdNodes.filter(id => id !== domainNodeId), 'VirusTotal');
            }

            if (window.TableManager && window.TableManager.updateTables) {
                window.TableManager.updateTables();
                if (window.TableManager.updateTotalDataTable) {
                    window.TableManager.updateTotalDataTable();
                }
            }
            if (window.GraphAreaEditor && window.GraphAreaEditor.applySettings) {
                window.GraphAreaEditor.applySettings();
            }

            return {
                nodesAdded,
                edgesAdded,
                domain: cleanDomain,
                detectionRatio: domainDetectionRatio,
                reputation: attributes.reputation || 0
            };
        };

        const processVirusTotalIPData = async (data, ipAddress) => {
            if (!data || !data.data) {
                throw new Error('Invalid VirusTotal IP data format');
            }

            const ipData = data.data;
            const attributes = ipData.attributes || {};
            const relationships = data.relationships || {};

            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                throw new Error('Graph not initialized');
            }

            if (window.DomainLoader && typeof window.DomainLoader.loadAndActivateDomains === 'function') {
                try {
                    await window.DomainLoader.loadAndActivateDomains(['cybersecurity']);
                } catch (e) {
                }
            }

            const cy = window.GraphRenderer.cy;
            const existingNodeIds = new Set(cy.nodes().map(n => n.id()));
            const bulkOptions = { skipLayout: true };
            const edgeCache = new Set(cy.edges().map(edge => `${edge.data('source')}::${edge.data('target')}`));
            const edgeOptions = { ...bulkOptions, edgeCache };
            let nodesAdded = 0;
            let edgesAdded = 0;

            const { detectionRatio: ipDetectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
            const asnNumber = attributes.asn || attributes.as_number || null;
            const asnDisplay = asnNumber ? `AS${asnNumber}` : null;
            const asOwner = attributes.as_owner || attributes.asn_owner || getAsName(attributes) || null;
            const lastSeen = attributes.last_modification_date || attributes.last_analysis_date || null;
            const ipInfoFields = {
                'Detection Ratio': ipDetectionRatio,
                'Country': attributes.country || null,
                'ASN': asnDisplay && asOwner ? `${asnDisplay} (${asOwner})` : asnDisplay || asOwner || null,
                'Network': attributes.network || null,
                'Last Seen': lastSeen ? new Date(lastSeen * 1000).toISOString() : null,
                'Reputation': attributes.reputation || 0
            };
            const ipInfoHtml = formatInfoHTML(ipInfoFields);
            const ipInfoText = formatInfoText(ipInfoFields);
            const ipNodeData = {
                id: `ip_${ipAddress.replace(/[^a-zA-Z0-9]/g, '_')}`,
                label: ipAddress,
                type: 'ipaddress',
                color: '#0080FF',
                size: 40,
                ipAddress,
                detectionRatio: ipDetectionRatio,
                country: attributes.country || null,
                asn: asnNumber || null,
                asOwner: asOwner || null,
                network: attributes.network || null,
                lastSeen: lastSeen ? new Date(lastSeen * 1000).toISOString() : null,
                timestamp: lastSeen ? new Date(lastSeen * 1000).toISOString() : null,
                reputation: attributes.reputation || 0,
                info: ipInfoText,
                infoHtml: ipInfoHtml
            };

            const { id: ipNodeId, created: ipCreated } = await getOrCreateNode(cy, ipNodeData.id, ipNodeData, bulkOptions);
            const ipNode = cy.getElementById(ipNodeId);
            ipNode.data({
                detectionRatio: ipNodeData.detectionRatio,
                country: ipNodeData.country,
                asn: ipNodeData.asn,
                asOwner: ipNodeData.asOwner,
                network: ipNodeData.network,
                reputation: ipNodeData.reputation,
                lastSeen: ipNodeData.lastSeen,
                lastModDate: ipNodeData.lastSeen,
                timestamp: ipNodeData.timestamp,
                info: ipInfoText,
                infoHtml: ipInfoHtml
            });
            if (ipCreated) {
                nodesAdded++;
            }

            const newNodeIds = ipCreated ? [ipNodeId] : [];

            if (relationships.resolutions && Array.isArray(relationships.resolutions)) {
                for (const relation of relationships.resolutions) {
                    const domain = extractDomainFromResolution(relation);
                    if (!domain || isDomainBlocked(domain)) continue;

                    const infoFields = {
                        'Domain': domain,
                        'Last Resolved': relation.attributes?.date
                            ? new Date(relation.attributes.date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const domainNodeData = {
                        id: domain,
                        label: domain,
                        type: 'domain',
                        color: '#4A90E2',
                        size: 30,
                        domain,
                        info: infoText,
                        infoHtml
                    };

                    const { id: domainNodeId, created } = await getOrCreateNode(cy, domainNodeData.id, domainNodeData, bulkOptions);
                    cy.getElementById(domainNodeId).data('info', infoText);
                    cy.getElementById(domainNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(domainNodeId);
                    }

                    const edgeData = {
                        id: `${domainNodeId}_resolves_${ipNodeId}`,
                        source: domainNodeId,
                        target: ipNodeId,
                        label: 'Resolves To'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            const malwareRelationships = [
                { key: 'communicating_files', label: 'Communicates With', direction: 'from_file' },
                { key: 'referrer_files', label: 'Refers', direction: 'from_file' },
                { key: 'downloaded_files', label: 'Downloads', direction: 'to_file' }
            ];

            for (const rel of malwareRelationships) {
                const files = relationships[rel.key];
                if (!files || !Array.isArray(files)) {
                    continue;
                }

                for (const fileObj of files) {
                    const fileHash = fileObj?.sha256 || fileObj?.id || fileObj;
                    if (!fileHash) {
                        continue;
                    }

                    const fileNodeId = `file_${fileHash}`;
                    if (existingNodeIds.has(fileNodeId)) {
                        continue;
                    }

                    const { detectionRatio } = calculateDetectionStats(fileObj?.attributes?.last_analysis_stats || {});
                    const infoFields = {
                        'Detection Ratio': detectionRatio,
                        'File Type': fileObj?.attributes?.type_description || fileObj?.attributes?.type_tag || '',
                        'First Seen': fileObj?.attributes?.first_submission_date
                            ? new Date(fileObj.attributes.first_submission_date * 1000).toISOString()
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const fileNodeData = {
                        id: fileNodeId,
                        label: fileHash,
                        type: 'malware',
                        color: detectionRatio && detectionRatio.startsWith('0/') ? '#80FF80' : '#FF4444',
                        size: 30,
                        fileHash,
                        detectionRatio,
                        info: infoText,
                        infoHtml
                    };

                    const { id: createdFileNodeId, created } = await getOrCreateNode(cy, fileNodeData.id, fileNodeData, bulkOptions);
                    cy.getElementById(createdFileNodeId).data('info', infoText);
                    cy.getElementById(createdFileNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(createdFileNodeId);
                    }

                    const sourceId = rel.direction === 'from_file' ? createdFileNodeId : ipNodeId;
                    const targetId = rel.direction === 'from_file' ? ipNodeId : createdFileNodeId;
                    const edgeData = {
                        id: `${sourceId}_${rel.key}_${targetId}`,
                        source: sourceId,
                        target: targetId,
                        label: rel.label
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (relationships.detected_urls && Array.isArray(relationships.detected_urls)) {
                for (const relation of relationships.detected_urls) {
                    const url = relation.attributes?.url || relation.id;
                    if (!url) continue;

                    const infoFields = {
                        'URL': url,
                        'Detection Ratio': relation.attributes?.positives !== undefined && relation.attributes?.total !== undefined
                            ? `${relation.attributes.positives}/${relation.attributes.total}`
                            : null
                    };
                    const infoHtml = formatInfoHTML(infoFields);
                    const infoText = formatInfoText(infoFields);
                    const urlNodeData = {
                        id: `url_${btoa(url).replace(/=/g, '')}`,
                        label: url,
                        type: 'url',
                        color: '#F5A623',
                        size: 30,
                        url,
                        info: infoText,
                        infoHtml
                    };

                    const { id: urlNodeId, created } = await getOrCreateNode(cy, urlNodeData.id, urlNodeData, bulkOptions);
                    cy.getElementById(urlNodeId).data('info', infoText);
                    cy.getElementById(urlNodeId).data('infoHtml', infoHtml);
                    if (created) {
                        nodesAdded++;
                        newNodeIds.push(urlNodeId);
                    }

                    const edgeData = {
                        id: `${ipNodeId}_detected_${urlNodeId}`,
                        source: ipNodeId,
                        target: urlNodeId,
                        label: 'Detected URL'
                    };
                    if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                        edgesAdded++;
                    }
                }
            }

            if (newNodeIds.length > 0) {
                positionNodesNearSource(cy, ipNodeId, newNodeIds.filter(id => id !== ipNodeId), 'VirusTotal');
            }

            if (window.TableManager && window.TableManager.updateTables) {
                window.TableManager.updateTables();
                if (window.TableManager.updateTotalDataTable) {
                    window.TableManager.updateTotalDataTable();
                }
            }
            if (window.GraphAreaEditor && window.GraphAreaEditor.applySettings) {
                window.GraphAreaEditor.applySettings();
            }

            return {
                nodesAdded,
                edgesAdded,
                ip: ipAddress,
                detectionRatio: ipDetectionRatio
            };
        };

        const processVirusTotalURLData = async (data, url) => {
            if (!data || !data.data) {
                throw new Error('Invalid VirusTotal URL data format');
            }

            const urlData = data.data;
            const attributes = urlData.attributes;

            if (!window.GraphRenderer || !window.GraphRenderer.cy) {
                throw new Error('Graph not initialized');
            }

            const cy = window.GraphRenderer.cy;
            const bulkOptions = { skipLayout: true };
            const edgeCache = new Set(cy.edges().map(edge => `${edge.data('source')}::${edge.data('target')}`));
            const edgeOptions = { ...bulkOptions, edgeCache };
            let nodesAdded = 0;
            let edgesAdded = 0;

            const { detectionRatio: urlDetectionRatio } = calculateDetectionStats(attributes.last_analysis_stats);
            const urlInfoFields = {
                'Detection Ratio': urlDetectionRatio,
                'Last Analysis': attributes.last_analysis_date ? new Date(attributes.last_analysis_date * 1000).toISOString() : null,
                'First Seen': attributes.first_submission_date ? new Date(attributes.first_submission_date * 1000).toISOString() : null,
                'Last Seen': attributes.last_submission_date ? new Date(attributes.last_submission_date * 1000).toISOString() : null
            };
            const urlInfoHtml = formatInfoHTML(urlInfoFields);
            const urlInfoText = formatInfoText(urlInfoFields);
            const urlNodeData = {
                id: `url_${btoa(url).replace(/=/g, '')}`,
                label: url,
                type: 'url',
                color: '#F5A623',
                size: 35,
                url,
                detectionRatio: urlDetectionRatio,
                firstSeen: attributes.first_submission_date ? new Date(attributes.first_submission_date * 1000).toISOString() : null,
                lastSeen: attributes.last_submission_date ? new Date(attributes.last_submission_date * 1000).toISOString() : null,
                info: urlInfoText,
                infoHtml: urlInfoHtml
            };

            const { id: urlNodeId, created: urlCreated } = await getOrCreateNode(cy, urlNodeData.id, urlNodeData, bulkOptions);
            cy.getElementById(urlNodeId).data('info', urlInfoText);
            cy.getElementById(urlNodeId).data('infoHtml', urlInfoHtml);
            if (urlCreated) {
                nodesAdded++;
            }

            if (attributes.url) {
                try {
                    const urlObj = new URL(attributes.url);
                    const domain = urlObj.hostname;

                    if (domain && !isDomainBlocked(domain)) {
                        const infoFields = {
                            'Domain': domain
                        };
                        const infoHtml = formatInfoHTML(infoFields);
                        const infoText = formatInfoText(infoFields);
                        const domainNodeData = {
                            id: domain,
                            label: domain,
                            type: 'domain',
                            color: '#4A90E2',
                            size: 30,
                            domain,
                            info: infoText,
                            infoHtml
                        };

                        const { id: domainNodeId, created } = await getOrCreateNode(cy, domainNodeData.id, domainNodeData, bulkOptions);
                        cy.getElementById(domainNodeId).data('info', infoText);
                        cy.getElementById(domainNodeId).data('infoHtml', infoHtml);
                        if (created) {
                            nodesAdded++;
                        }

                        const edgeData = {
                            id: `${domainNodeId}_hosts_${urlNodeId}`,
                            source: domainNodeId,
                            target: urlNodeId,
                            label: 'Hosts'
                        };
                        if (addEdgeIfNotExists(cy, edgeData, edgeOptions)) {
                            edgesAdded++;
                        }

                        positionNodesNearSource(cy, urlNodeId, [domainNodeId], 'VirusTotal');
                    }
                } catch (error) {
                    console.warn('Failed to parse URL for domain extraction:', error);
                }
            }

            if (window.TableManager && window.TableManager.updateTables) {
                window.TableManager.updateTables();
                if (window.TableManager.updateTotalDataTable) {
                    window.TableManager.updateTotalDataTable();
                }
            }
            if (window.GraphAreaEditor && window.GraphAreaEditor.applySettings) {
                window.GraphAreaEditor.applySettings();
            }

            return {
                nodesAdded,
                edgesAdded,
                url,
                detectionRatio: urlDetectionRatio
            };
        };

        const importVirusTotalData = async (identifier, queryType) => {
            try {
                notifyStatus(`Querying VirusTotal ${queryType}...`, 'loading', { toast: false });

                let data;
                let result;

                switch (queryType) {
                    case 'file':
                        data = await queryVirusTotalFileEnhanced(identifier);
                        result = await processVirusTotalFileData(data, identifier, queryType);
                        break;
                    case 'domain': {
                        const cleanDomain = sanitizeDomain(identifier);
                        data = await queryVirusTotalDomain(cleanDomain, { includeRelationships: true });
                        result = await processVirusTotalDomainData(data, cleanDomain);
                        identifier = cleanDomain;
                        break;
                    }
                    case 'ip':
                        data = await queryVirusTotalIP(identifier, { includeRelationships: true });
                        result = await processVirusTotalIPData(data, identifier);
                        break;
                    case 'url':
                        data = await queryVirusTotalURL(identifier);
                        result = await processVirusTotalURLData(data, identifier);
                        break;
                    default:
                        throw new Error(`Unsupported query type: ${queryType}`);
                }

                if (result.preservedLabelSettings && window.GraphAreaEditor && window.GraphAreaEditor.getSettings) {
                    const { color, size } = result.preservedLabelSettings;
                    const current = window.GraphAreaEditor.getSettings();
                    const newSettings = {};
                    if (color && current.labelColor !== color) {
                        newSettings.labelColor = color;
                    }
                    if (size && current.labelSize !== size) {
                        newSettings.labelSize = size;
                    }

                    if (Object.keys(newSettings).length && window.GraphAreaEditor.applySettings) {
                        window.GraphAreaEditor.applySettings(newSettings);
                    }
                }

                const message = `Imported ${result.nodesAdded} nodes and ${result.edgesAdded} edges for ${queryType}: ${identifier}`;
                notifyStatus(message, 'success');

                return result;
            } catch (error) {
                console.error('VirusTotal import failed:', error);
                notifyStatus(error.message, 'error');
                throw error;
            }
        };

        return {
            id: 'virustotal',
            allowedHosts: ['virustotal.com', 'www.virustotal.com'],
            init: (moduleServices) => {
                services = moduleServices;
            },
            actions: {
                saveConfig: async () => {
                    const apiKeyInput = document.getElementById('virustotalApiKey');
                    const apiKey = apiKeyInput?.value.trim();

                    if (!apiKey) {
                        notifyStatus('Please enter an API key', 'error');
                        return { ok: false };
                    }

                    if (!/^[a-fA-F0-9]{64}$/.test(apiKey)) {
                        notifyStatus('Invalid API key format', 'error');
                        return { ok: false };
                    }

                    await services?.credentials?.ensurePassphrase?.();
                    setRuntime('virustotalApiKey', apiKey);

                    const storageKey = getStorageKey('VIRUSTOTAL_API_KEY');
                    if (storageKey) {
                        storageSet(storageKey, await services?.credentials?.encrypt?.(apiKey));
                    }

                    notifyStatus('Configuration saved successfully', 'success');
                    return { ok: true };
                },
                enrichFromGraph: (ctx, params) => importVirusTotalData(params?.identifier, params?.queryType),
                quickAction: (ctx, params) => updateVirusTotalInfoForNodes(params?.nodes || []),
                importData: (ctx, params) => importVirusTotalData(params?.identifier, params?.queryType),
                quickUpdate: (ctx, params) => updateVirusTotalInfoForNodes(params?.nodes || []),
                addToBlocklist: (ctx, params) => addToVTBlocklist(params?.identifier),
                submitUrl: (ctx, params) => submitVirusTotalURL(params?.url),
                testConnection: async () => {
                    const apiKey = getVirusTotalApiKey();
                    if (!apiKey) {
                        notifyStatus('No API key configured', 'error');
                        return { ok: false };
                    }

                    notifyStatus('Testing connection...', 'testing');
                    try {
                        await makeVirusTotalRequest('/users/me');
                        notifyStatus('Connection successful', 'success');
                        return { ok: true };
                    } catch (error) {
                        const message = error?.message || 'Connection test failed (CORS/Network)';
                        if (message.includes('Invalid VirusTotal API key')) {
                            notifyStatus('Invalid API key', 'error');
                        } else if (message.includes('VirusTotal proxy blocked')) {
                            notifyStatus('VirusTotal proxy blocked (check proxy allowlist)', 'error');
                        } else if (message.includes('VirusTotal access forbidden')) {
                            notifyStatus('VirusTotal access forbidden (check account permissions)', 'error');
                        } else if (message.includes('VirusTotal API quota exceeded')) {
                            notifyStatus('API quota exceeded', 'error');
                        } else {
                            notifyStatus('Connection test failed (CORS/Network)', 'error');
                        }
                        return { ok: false, error };
                    }
                }
            },
            api: {
                getVirusTotalApiKey,
                makeVirusTotalRequest,
                queryVirusTotalFile,
                queryVirusTotalFileEnhanced,
                queryVirusTotalDomain,
                queryVirusTotalIP,
                queryVirusTotalURL,
                submitVirusTotalURL,
                getVirusTotalUploadURL,
                importVirusTotalData,
                updateVirusTotalInfoForNodes,
                addToVTBlocklist,
                getVTBlocklist
            }
        };
    };

    window.VirusTotalIntegrationModule = {
        create: createVirusTotalModule
    };
})();
