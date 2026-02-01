// Domain-specific Node Types Loader
// Handles loading and managing domain-specific node type configurations

window.DomainLoader = {
    domainDir: null,
    // Track whether the File System Access API is available
    fsApiSupported: null,
    missingTypeCache: new Set(),
    _nodeTypesRefreshTimeout: null,
    normalizeTypeKey: function(type) {
        if (!type) return '';
        return type
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '_');
    },
    getCanonicalTypeName: function(domainKey, typeName) {
        if (!domainKey || !typeName) {
            return null;
        }

        const typeKey = typeName.toString().trim();
        if (!typeKey || typeKey === 'default') {
            return null;
        }

        const domainPart = domainKey.toString().trim();
        if (!domainPart) {
            return null;
        }

        if (typeKey.startsWith(domainPart + '.')) {
            return typeKey;
        }

        return `${domainPart}.${typeKey}`;
    },
    resolveCanonicalName: function(domainKey, typeName) {
        if (!typeName) {
            return null;
        }

        if (!this.typeCanonicalMap || typeof this.typeCanonicalMap !== 'object') {
            this.typeCanonicalMap = {};
        }

        const key = typeName.toString();
        const normalized = this.normalizeTypeKey(key);

        if (this.typeCanonicalMap[key]) {
            return this.typeCanonicalMap[key];
        }

        if (normalized && this.typeCanonicalMap[normalized]) {
            return this.typeCanonicalMap[normalized];
        }

        const canonical = this.getCanonicalTypeName(domainKey, key);
        if (canonical) {
            this.typeCanonicalMap[key] = canonical;
            if (normalized) {
                this.typeCanonicalMap[normalized] = canonical;
            }
            this.typeCanonicalMap[canonical] = canonical;
            const canonicalNormalized = this.normalizeTypeKey(canonical);
            if (canonicalNormalized) {
                this.typeCanonicalMap[canonicalNormalized] = canonical;
            }
        }

        return canonical || null;
    },
    applyCanonicalAliases: function(target, aliasEntries, options = {}) {
        if (!target || typeof target !== 'object' || !aliasEntries) {
            return;
        }

        const skipMissing = !!options.skipMissing;
        aliasEntries.forEach((legacyKey, canonicalKey) => {
            if (!canonicalKey || !legacyKey || canonicalKey === legacyKey) {
                return;
            }
            if (skipMissing && !Object.prototype.hasOwnProperty.call(target, legacyKey)) {
                return;
            }
            if (Object.prototype.hasOwnProperty.call(target, canonicalKey)) {
                return;
            }
            const descriptor = Object.getOwnPropertyDescriptor(target, canonicalKey);
            if (descriptor && !descriptor.configurable) {
                return;
            }
            try {
                Object.defineProperty(target, canonicalKey, {
                    enumerable: false,
                    configurable: true,
                    get: () => target[legacyKey],
                    set: value => {
                        target[legacyKey] = value;
                    }
                });
            } catch (err) {
                console.warn('[DomainLoader] Failed to apply canonical alias', canonicalKey, '→', legacyKey, err);
            }
        });
    },
    getCanonicalTypeKey: function(typeName) {
        if (!typeName) {
            return null;
        }

        if (this.typeCanonicalMap && this.typeCanonicalMap[typeName]) {
            return this.typeCanonicalMap[typeName];
        }

        const normalized = this.normalizeTypeKey(typeName);
        if (normalized && this.typeCanonicalMap && this.typeCanonicalMap[normalized]) {
            return this.typeCanonicalMap[normalized];
        }

        const domainKey = this.getDomainForType(typeName);
        if (!domainKey) {
            return null;
        }

        return this.resolveCanonicalName(domainKey, typeName);
    },
    getLegacyTypeKey: function(typeName, domainKey = null) {
        if (!typeName) {
            return typeName;
        }

        let resolved = null;
        if (this.typeNameMap && typeof this.typeNameMap === 'object') {
            const key = typeName.toString();
            if (this.typeNameMap[key]) {
                resolved = this.typeNameMap[key];
            } else {
                const lower = key.toLowerCase();
                if (this.typeNameMap[lower]) {
                    resolved = this.typeNameMap[lower];
                } else {
                    const normalized = this.normalizeTypeKey(key);
                    if (normalized && this.typeNameMap[normalized]) {
                        resolved = this.typeNameMap[normalized];
                    }
                }
            }
        }

        if (resolved) {
            return resolved;
        }

        const keyString = typeName.toString();
        if (typeof domainKey === 'string' && keyString.startsWith(`${domainKey}.`)) {
            return keyString.slice(domainKey.length + 1);
        }

        if (keyString.includes('.')) {
            const [prefix, rest] = keyString.split('.', 2);
            if (rest && (!domainKey || prefix === domainKey)) {
                return rest;
            }
        }

        return keyString;
    },
    getTypeOriginKey: function(typeName) {
        if (!typeName && typeName !== 0) return null;
        const key = typeName.toString();
        const normalized = this.normalizeTypeKey(key);
        if (normalized) return normalized;
        const lower = key.toLowerCase();
        if (lower) return lower;
        return key;
    },
    getDomainForType: function(typeName) {
        if (!typeName) return null;

        const ensureMaps = () => {
            if (!this.typeDomainMap) this.typeDomainMap = {};
            if (!this.typeNameMap) this.typeNameMap = {};
            if (!this.typeDefinitionOrigins) this.typeDefinitionOrigins = {};
        };

        ensureMaps();

        const key = typeName.toString();
        const lower = key.toLowerCase();
        const normalized = this.normalizeTypeKey(key);

        const lookupDomainMap = () => {
            if (!this.typeDomainMap) return null;
            return this.typeDomainMap[key] ||
                this.typeDomainMap[lower] ||
                (normalized ? this.typeDomainMap[normalized] : null) ||
                null;
        };

        const directDomain = lookupDomainMap();
        if (directDomain) {
            return directDomain;
        }

        if (!this.typeDefinitionOrigins) {
            return null;
        }

        const canonical = (this.typeNameMap && (
            this.typeNameMap[key] ||
            this.typeNameMap[lower] ||
            (normalized ? this.typeNameMap[normalized] : null)
        )) || key;

        const originKey = this.getTypeOriginKey(canonical);
        const origin = originKey ? this.typeDefinitionOrigins[originKey] : null;
        return origin?.domainKey || null;
    },
    sanitizeDomainFolder: function(name) {
        if (!name && name !== 0) {
            return 'custom-domain';
        }
        const sanitized = name.toString().trim().toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        return sanitized || 'custom-domain';
    },
    folderToDomainKey: function(folder) {
        if (!folder && folder !== 0) {
            return 'custom_domain';
        }
        return folder.toString().trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/-/g, '_') || 'custom_domain';
    },
    folderToDisplayName: function(folder) {
        if (!folder && folder !== 0) {
            return 'Custom Domain';
        }
        return folder.toString()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase()) || 'Custom Domain';
    },
    recordTypeMapping: function(domainKey, typeName, options = {}) {
        const force = !!(options && options.force);
        if (!domainKey || !typeName) return;
        if (!this.typeDomainMap) this.typeDomainMap = {};
        if (!this.typeNameMap) this.typeNameMap = {};
        if (!this.typeDefinitionOrigins) this.typeDefinitionOrigins = {};
        if (!this.typeCanonicalMap || typeof this.typeCanonicalMap !== 'object') {
            this.typeCanonicalMap = {};
        }
        const key = typeName.toString();
        const lower = key.toLowerCase();
        const normalized = this.normalizeTypeKey(key);
        const canonical = this.getCanonicalTypeName(domainKey, key);
        const canonicalLower = canonical ? canonical.toLowerCase() : null;
        const canonicalNormalized = canonical ? this.normalizeTypeKey(canonical) : null;
        const originName = canonical || key;
        const originKey = this.getTypeOriginKey(originName);
        if (originKey && (!this.typeDefinitionOrigins[originKey] || force)) {
            this.typeDefinitionOrigins[originKey] = { domainKey, typeKey: originName, legacyKey: key };
        }
        const assignIfUnset = (map, mapKey, value) => {
            if (!mapKey && mapKey !== 0) return;
            if (!force && map[mapKey] && map[mapKey] !== value) return;
            map[mapKey] = value;
        };
        assignIfUnset(this.typeDomainMap, key, domainKey);
        assignIfUnset(this.typeDomainMap, lower, domainKey);
        if (normalized) {
            assignIfUnset(this.typeDomainMap, normalized, domainKey);
        }
        if (canonical) {
            assignIfUnset(this.typeDomainMap, canonical, domainKey);
        }
        if (canonicalLower) {
            assignIfUnset(this.typeDomainMap, canonicalLower, domainKey);
        }
        if (canonicalNormalized) {
            assignIfUnset(this.typeDomainMap, canonicalNormalized, domainKey);
        }
        if (!this.typeNameMap[key]) {
            this.typeNameMap[key] = key;
        }
        if (!this.typeNameMap[lower]) {
            this.typeNameMap[lower] = key;
        }
        if (normalized && !this.typeNameMap[normalized]) {
            this.typeNameMap[normalized] = key;
        }
        if (canonical && !this.typeNameMap[canonical]) {
            this.typeNameMap[canonical] = key;
        }
        if (canonicalLower && !this.typeNameMap[canonicalLower]) {
            this.typeNameMap[canonicalLower] = key;
        }
        if (canonicalNormalized && !this.typeNameMap[canonicalNormalized]) {
            this.typeNameMap[canonicalNormalized] = key;
        }

        const assignCanonical = (mapKey) => {
            if (!mapKey && mapKey !== 0) return;
            if (!this.typeCanonicalMap[mapKey]) {
                this.typeCanonicalMap[mapKey] = originName;
            }
        };
        assignCanonical(key);
        assignCanonical(lower);
        assignCanonical(normalized);
        if (canonical) assignCanonical(canonical);
        if (canonicalLower) assignCanonical(canonicalLower);
        if (canonicalNormalized) assignCanonical(canonicalNormalized);
    },
    registerTypeConflict: function(typeKey, originalDomain, duplicateDomain) {
        if (!typeKey || !originalDomain || !duplicateDomain) return;
        if (originalDomain === duplicateDomain) return;
        if (!this.typeConflicts) this.typeConflicts = [];
        if (!this.typeConflictSet || !(this.typeConflictSet instanceof Set)) {
            this.typeConflictSet = new Set();
        }
        const signature = `${typeKey}|${originalDomain}|${duplicateDomain}`;
        if (this.typeConflictSet.has(signature)) {
            return;
        }
        this.typeConflictSet.add(signature);
        this.typeConflicts.push({
            typeKey,
            originalDomain,
            duplicateDomain
        });
    },
    notifyTypeConflicts: function() {
        if (!this.typeConflicts || this.typeConflicts.length === 0) {
            this.lastConflictNotificationKey = null;
            return;
        }

        const signature = this.typeConflicts
            .map(conflict => `${conflict.typeKey}|${conflict.originalDomain}|${conflict.duplicateDomain}`)
            .sort()
            .join('|');

        if (this.lastConflictNotificationKey === signature) {
            return;
        }

        this.lastConflictNotificationKey = signature;

        const domainLabel = key => {
            if (!key) return '';
            if (key === 'default') return 'Default';
            const domain = this.availableDomains && this.availableDomains[key];
            return (domain && domain.name) || key;
        };

        const preview = this.typeConflicts.slice(0, 3).map(conflict => {
            const duplicateName = domainLabel(conflict.duplicateDomain);
            const originalName = domainLabel(conflict.originalDomain);
            return `"${conflict.typeKey}" (${duplicateName} → ${originalName})`;
        }).join(', ');

        const extraCount = this.typeConflicts.length > 3 ? this.typeConflicts.length - 3 : 0;
        const extraText = extraCount > 0 ? ` and ${extraCount} more` : '';
        const message = `Duplicate node types skipped: ${preview}${extraText}. Rename or relocate the duplicates.`;

        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(message, 'warning', 10000);
        } else {
            console.warn(`[DomainLoader] ${message}`);
        }
    },
    ensureDomainDir: function() {
        if (!this.domainDir) {
            if (typeof window !== 'undefined' && window.DOMAIN_DIR) {
                this.domainDir = window.DOMAIN_DIR;
            } else {
                this.domainDir = '/assets/domains';
            }
            console.log('[DomainLoader] resolved domainDir', this.domainDir);
        }
        return this.domainDir;
    },
    // Determine if the File System Access API is available
    ensureFsApi: function() {
        if (this.fsApiSupported === null) {
            this.fsApiSupported = !!(window && window.showDirectoryPicker);
        }
        return this.fsApiSupported;
    },
    // Prompt the user for a configuration directory when using the File System Access API
    requestConfigDirectory: async function() {
        if (!this.ensureFsApi()) return null;
        if (!this.dirHandle) {
            if (window.WorkspaceManager && WorkspaceManager.handle) {
                this.dirHandle = await WorkspaceManager.getSubDirHandle('assets/domains');
            } else {
                try {
                    this.dirHandle = await window.showDirectoryPicker();
                } catch (_) {
                    return null;
                }
            }
        }
        return this.dirHandle;
    },
    // Recursively collect JSON files under domain directory via a manifest
    listConfigJsonFiles: async function() {
        this.ensureDomainDir();
        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
            try {
                return await WorkspaceManager.listFiles('assets/domains', '.json');
            } catch (_) {}
        }
        try {
            const res = await fetch('/assets/domains/index.json');
            if (res.ok) {
                const data = await res.json();
                return data.files || [];
            }
        } catch (_) {}
        const res = await fetch('/api/domain-files');
        if (!res.ok) throw new Error('Failed to list domain files');
        const data = await res.json();
        return data.files || [];
    },

    // When using the File System Access API, synchronize local JSON files
    // with the latest server-side definitions so new domains and updated
    // configurations are discovered on reload.
    refreshLocalConfigFiles: async function() {
        if (!this.ensureFsApi() || !window.WorkspaceManager || !WorkspaceManager.handle) {
            return;
        }

        try {
            const manifestResponse = await fetch('/assets/domains/index.json');
            if (!manifestResponse.ok) {
                return;
            }

            const manifest = await manifestResponse.json();
            const files = manifest.files || [];
            const fetchPromises = files.map(async rel => {
                try {
                    const res = await fetch('/' + rel);
                    if (!res.ok) {
                        return;
                    }
                    const blob = await res.blob();
                    await WorkspaceManager.saveFile(rel, blob);
                } catch (_) {}
            });

            await Promise.all(fetchPromises);
        } catch (_) {}
    },

    // Relocate any locally cached workspace domain JSON files into a temporary
    // folder so that a subsequent reload can repopulate /assets/domains with fresh
    // definitions pulled from the server.
    moveLocalConfigFilesToTmp: async function() {
        if (!this.ensureFsApi() || !window.WorkspaceManager || !WorkspaceManager.handle) {
            return;
        }

        if (typeof WorkspaceManager.listFiles !== 'function') {
            return;
        }

        try {
            const files = await WorkspaceManager.listFiles('assets/domains', '.json');
            if (!files || files.length === 0) {
                return;
            }

            const moves = files
                .filter(rel => rel !== 'assets/domains/index.json')
                .map(async rel => {
                    try {
                        let fileText = null;
                        if (typeof WorkspaceManager.readFile === 'function') {
                            const file = await WorkspaceManager.readFile(rel);
                            if (file && typeof file.text === 'function') {
                                fileText = await file.text();
                            }
                        }

                        if (fileText !== null) {
                            await WorkspaceManager.saveFile(`tmp/${rel}`, fileText, 'application/json');
                        }

                        if (typeof WorkspaceManager.removeFile === 'function') {
                            await WorkspaceManager.removeFile(rel);
                            return;
                        }

                        const configDir = await this.requestConfigDirectory();
                        if (!configDir) {
                            return;
                        }

                        const parts = rel.split('/').filter(Boolean);
                        // Remove leading "assets" and "domains"
                        if (parts[0] === 'assets') {
                            parts.shift();
                        }
                        if (parts[0] === 'domains') {
                            parts.shift();
                        }
                        if (parts.length === 0) {
                            return;
                        }

                        let parent = configDir;
                        for (let i = 0; i < parts.length - 1; i++) {
                            parent = await parent.getDirectoryHandle(parts[i]);
                        }
                        await parent.removeEntry(parts[parts.length - 1]);
                    } catch (_) {}
                });

            await Promise.all(moves);
        } catch (_) {}
    },

    // Available domains with metadata
    availableDomains: {},

    // Map of node type -> domain key for quick lookup
    typeDomainMap: {},
    typeNameMap: {},
    typeDefinitionOrigins: {},
    typeCanonicalMap: {},
    typeConflicts: [],
    typeConflictSet: new Set(),
    lastConflictNotificationKey: null,

    // Currently active domains
    activeDomains: new Set(['default']), // Always include default domain

    // Path to a simple fallback icon used when a requested icon is missing.
    defaultIcon: 'assets/icons/defaults/missing-icon.svg',
    iconUrlCache: new Map(),

    // Normalize icon references so callers always receive either a relative
    // asset path, a fully-qualified URL or an existing data URI.
    normalizeIconSource: function(iconPath) {
        if (typeof iconPath !== 'string' || iconPath.length === 0) {
            return null;
        }

        const trimmed = iconPath.trim();
        if (!trimmed) {
            return null;
        }

        if (trimmed.startsWith('data:')) {
            return trimmed;
        }

        if (/^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }

        return trimmed.replace(/^\/+/, '');
    },
    resolveIconMapping: function(iconPath) {
        const normalized = this.normalizeIconSource(iconPath);
        if (!normalized) {
            return { normalized: null, mapped: null };
        }

        const isSimpleKey = !normalized.startsWith('data:') &&
            !/^https?:\/\//i.test(normalized) &&
            !normalized.includes('/');
        if (!isSimpleKey) {
            return { normalized, mapped: null };
        }

        const iconConfigs = (window.IconConfigs && typeof window.IconConfigs === 'object')
            ? window.IconConfigs
            : null;
        let mapped = iconConfigs ? iconConfigs[normalized] : null;
        if (!mapped && this.defaultIconConfigs && typeof this.defaultIconConfigs === 'object') {
            mapped = this.defaultIconConfigs[normalized];
        }

        if (typeof mapped === 'string' && mapped.trim()) {
            const normalizedMapped = this.normalizeIconSource(mapped);
            return { normalized, mapped: normalizedMapped || null };
        }

        return { normalized, mapped: null };
    },

    /**
     * Return a proxied URL for remote icons while preserving the original
     * reference for local assets. This mirrors resolveIcon but avoids the
     * network validation so synchronous call sites can still normalize
     * references safely.
     */
    getIconProxyUrl: function(iconPath) {
        const { normalized, mapped } = this.resolveIconMapping(iconPath);
        if (!normalized) {
            return null;
        }

        if (this.iconUrlCache && this.iconUrlCache.has(normalized)) {
            return this.iconUrlCache.get(normalized);
        }

        const source = mapped || normalized;
        if (this.iconUrlCache && this.iconUrlCache.has(source)) {
            const cached = this.iconUrlCache.get(source);
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, cached);
            }
            return cached;
        }

        if (normalized.startsWith('data:')) {
            return normalized;
        }

        if (source.startsWith('data:')) {
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, source);
            }
            return source;
        }

        if (/^https?:\/\//i.test(source)) {
            const proxied = `/api/proxy?url=${encodeURIComponent(source)}`;
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, proxied);
            }
            return proxied;
        }

        if (mapped && this.iconUrlCache) {
            this.iconUrlCache.set(normalized, source);
        }

        return source;
    },

    // Resolve an icon path while preserving the reference instead of embedding
    // the image data. When the File System Access API is available we still try
    // to cache the asset locally, but the returned value is always a path or URL
    // so saved graphs no longer contain base64-encoded image data.
    resolveIcon: async function(iconPath) {
        const { normalized, mapped } = this.resolveIconMapping(iconPath);
        if (!normalized) {
            return this.defaultIcon;
        }

        if (this.iconUrlCache && this.iconUrlCache.has(normalized)) {
            return this.iconUrlCache.get(normalized);
        }

        const source = mapped || normalized;
        if (this.iconUrlCache && this.iconUrlCache.has(source)) {
            const cached = this.iconUrlCache.get(source);
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, cached);
            }
            return cached;
        }

        if (source.startsWith('data:')) {
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, source);
            }
            return source;
        }

        if (/^https?:\/\//i.test(source)) {
            const proxiedUrl = `/api/proxy?url=${encodeURIComponent(source)}`;
            if (mapped && this.iconUrlCache) {
                this.iconUrlCache.set(normalized, proxiedUrl);
            }

            if (typeof fetch === 'function') {
                try {
                    const response = await fetch(proxiedUrl, {
                        headers: { 'X-Proxy-Accept': 'image/*' }
                    });
                    if (response.ok) {
                        return proxiedUrl;
                    }

                    console.info(`[DomainLoader] Icon fetch returned ${response.status} for ${source}`);
                } catch (err) {
                    console.warn(`[DomainLoader] Failed to validate remote icon ${source}:`, err);
                    return proxiedUrl;
                }
            }

            return proxiedUrl;
        }

        const assetPath = source;
        if (mapped && this.iconUrlCache) {
            this.iconUrlCache.set(normalized, assetPath);
        }

        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
            try {
                const file = await WorkspaceManager.readFile(assetPath);
                if (file) {
                    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                        const objectUrl = URL.createObjectURL(file);
                        if (this.iconUrlCache) {
                            this.iconUrlCache.set(assetPath, objectUrl);
                            if (mapped) {
                                this.iconUrlCache.set(normalized, objectUrl);
                            }
                        }
                        return objectUrl;
                    }
                    return assetPath;
                }
            } catch (_) {}
        }

        if (typeof fetch !== 'function') {
            return assetPath;
        }

        try {
            const response = await fetch(`/${assetPath}`);
            if (response.ok) {
                if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                    try {
                        const blob = await response.blob();
                        await WorkspaceManager.saveFile(assetPath, blob);
                    } catch (err) {
                        console.warn(`[DomainLoader] Failed to cache icon ${assetPath}:`, err);
                    }
                }
                return assetPath;
            }

            console.info(`[DomainLoader] Icon fetch returned ${response.status} for ${assetPath}`);
            return this.defaultIcon;
        } catch (err) {
            console.warn(`[DomainLoader] Failed to validate icon ${assetPath}:`, err);
            return assetPath;
        }

        return this.defaultIcon;
    },

    // Replace icon config paths with embedded data URIs, ensuring icons are
    // always available without additional network requests.
    validateIconConfigs: async function(iconConfigs) {
        const entries = Object.entries(iconConfigs);
        const promises = entries.map(([_, url]) => this.resolveIcon(url));
        const results = await Promise.all(promises);
        entries.forEach(([key], idx) => {
            iconConfigs[key] = results[idx];
        });
    },

    // Ensure domain type definitions reference embedded icon data. When a file
    // is missing locally, the server-hosted icon is fetched and embedded instead
    // of leaving a broken reference.
    validateIconsInTypes: async function(types) {
        const entries = Object.entries(types);
        const keys = [];
        const iconValues = [];
        const promises = [];
        for (const [typeKey, type] of entries) {
            if (typeof type?.icon !== 'string') {
                continue;
            }

            const iconValue = type.icon.trim();
            if (!iconValue) {
                continue;
            }

            const looksLikePath = iconValue.startsWith('data:') ||
                iconValue.startsWith('/') ||
                iconValue.includes('/') ||
                /^https?:\/\//i.test(iconValue);

            if (!looksLikePath) {
                continue;
            }

            keys.push(typeKey);
            iconValues.push(iconValue);
            promises.push(this.resolveIcon(iconValue));
        }

        const resolved = await Promise.all(promises);
        resolved.forEach((icon, idx) => {
            const typeKey = keys[idx];
            const type = types[typeKey];
            if (!type) {
                return;
            }

            if (typeof type.iconSource !== 'string' || type.iconSource.trim() === '') {
                type.iconSource = iconValues[idx];
            }

            type.icon = icon;
        });
    },

    // Initialize the domain loader
    init: async function() {

        // Validate initial icon configuration to avoid missing files
        await this.validateIconConfigs(window.IconConfigs);

        // Store original node types as the default domain
        this.defaultNodeTypes = { ...window.NodeTypes };

        // Store original icon configs
        this.defaultIconConfigs = { ...window.IconConfigs };

        // Check for File System Access API support and warn if unavailable
        this.ensureFsApi();
        if (!this.fsApiSupported) {
            const warn = document.getElementById('fileApiWarning');
            if (warn) {
                warn.style.display = 'block';
                warn.textContent = 'This browser lacks File System Access API support; server endpoints will be used.';
            }
        }

        await this.fetchAvailableDomains();

        // Load any persisted node type state
        this.loadPersistedState();

        // Ensure we always track the default domain and discard missing entries
        if (!(this.activeDomains instanceof Set)) {
            this.activeDomains = new Set(['default']);
        }

        let activeChanged = false;
        const sanitized = Array.from(this.activeDomains).filter(domainKey => {
            if (domainKey === 'default') {
                return true;
            }
            if (this.availableDomains && this.availableDomains[domainKey]) {
                return true;
            }
            activeChanged = true;
            return false;
        });
        if (!sanitized.includes('default')) {
            sanitized.push('default');
            activeChanged = true;
        }
        this.activeDomains = new Set(sanitized);

        // Update default node types after loading persisted state
        this.defaultNodeTypes = { ...window.NodeTypes };
        // Ensure the type definition cache contains the default domain at startup
        this.storeDomainCache('default', this.defaultNodeTypes);

        // Load the default domain plus any persisted active domains
        const persistedActive = Array.from(this.activeDomains).filter(key => key !== 'default');
        for (const domainKey of persistedActive) {
            const loaded = await this.loadDomain(domainKey);
            if (!loaded) {
                const domain = this.availableDomains[domainKey];
                if (domain) {
                    domain.loaded = false;
                    domain.types = null;
                }
                this.activeDomains.delete(domainKey);
                activeChanged = true;
            }
        }

        if (activeChanged) {
            this.saveState();
        }

        // Rebuild configuration based on active domains from persisted state
        this.rebuildActiveConfiguration();

        // Initialize UI when DOM is ready
        setTimeout(() => this.initializeUI(), 100);

        // Populate node types table at startup
        if (window.TableManager && typeof window.TableManager.updateNodeTypesTable === 'function') {
            setTimeout(() => window.TableManager.updateNodeTypesTable('', true), 150);
        }
    },

    // Load persisted active domains from localStorage
    loadPersistedState: function() {
        try {
            if (typeof localStorage === 'undefined') return;
            const saved = localStorage.getItem('quantickle_active_domains');
            if (!saved) return;
            const state = JSON.parse(saved);
            if (state.activeDomains) {
                this.activeDomains = new Set(state.activeDomains);
            }
        } catch (err) {
            // localStorage may be unavailable; ignore errors
        }
    },

    // Persist current active domains to localStorage
    saveState: function() {
        try {
            if (typeof localStorage === 'undefined') return;
            const state = {
                activeDomains: Array.from(this.activeDomains)
            };
            localStorage.setItem('quantickle_active_domains', JSON.stringify(state));
        } catch (err) {
            // localStorage may be unavailable; ignore errors
        }
    },

    // --- Domain cache helpers ---
    getCacheKey: function(domainKey) {
        return `domain_${domainKey}_json`;
    },

    getDirtyKey: function(domainKey) {
        return `domain_${domainKey}_dirty`;
    },

    getMetadataKey: function(domainKey) {
        return `domain_${domainKey}_meta`;
    },

    storeDomainMetadata: function(domainKey, metadata) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(this.getMetadataKey(domainKey), JSON.stringify(metadata));
        } catch (_) {}
    },

    removeDomainMetadata: function(domainKey) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.removeItem(this.getMetadataKey(domainKey));
        } catch (_) {}
    },

    loadStoredDomainMetadata: function() {
        const results = [];
        try {
            if (typeof localStorage === 'undefined') return results;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('domain_') || !key.endsWith('_meta')) {
                    continue;
                }
                const domainKey = key.substring(7, key.length - 5);
                try {
                    const value = JSON.parse(localStorage.getItem(key));
                    if (value) {
                        results.push({ key: domainKey, ...value });
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return results;
    },

    clearDomainCache: function(domainKey) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.removeItem(this.getCacheKey(domainKey));
            localStorage.removeItem(this.getDirtyKey(domainKey));
        } catch (_) {}
    },

    clearAllDomainCaches: function() {
        try {
            if (typeof localStorage === 'undefined') return;
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith('domain_') && (key.endsWith('_json') || key.endsWith('_dirty'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (_) {}
    },

    invalidateAllDomainCaches: function() {
        try {
            if (typeof localStorage === 'undefined') return;
            const domains = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith('domain_') && key.endsWith('_json')) {
                    const domainKey = key.substring(7, key.length - 5);
                    domains.push(domainKey);
                }
            }

            domains.forEach(domainKey => {
                localStorage.setItem(this.getCacheKey(domainKey), 'null');
                localStorage.setItem(this.getDirtyKey(domainKey), '1');
            });
        } catch (_) {}
    },

    loadCachedDomain: function(domainKey) {
        try {
            if (typeof localStorage === 'undefined') return null;
            if (localStorage.getItem(this.getDirtyKey(domainKey))) return null;
            const cached = localStorage.getItem(this.getCacheKey(domainKey));
            return cached ? JSON.parse(cached) : null;
        } catch (_) {
            return null;
        }
    },

    storeDomainCache: function(domainKey, types) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(this.getCacheKey(domainKey), JSON.stringify(types));
            localStorage.removeItem(this.getDirtyKey(domainKey));
        } catch (_) {}
    },

    markDomainDirty: function(domainKey) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(this.getDirtyKey(domainKey), '1');
        } catch (_) {}
    },

    exportLocalDomains: function() {
        try {
            if (typeof localStorage === 'undefined') return;
            const exportData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('domain_') && key.endsWith('_json')) {
                    const domainKey = key.substring(7, key.length - 5);
                    try {
                        exportData[domainKey] = JSON.parse(localStorage.getItem(key));
                    } catch (_) {}
                }
            }
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'domain-backup.json';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);
        } catch (err) {
            console.error('Failed to export domains', err);
        }
    },

    detectMimeType: function(fileName) {
        if (!fileName) return null;
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.svg')) return 'image/svg+xml';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.bmp')) return 'image/bmp';
        return null;
    },

    bytesToDataUrl: function(bytes, mime) {
        if (!(bytes instanceof Uint8Array)) {
            return null;
        }
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const slice = bytes.subarray(i, i + chunk);
            binary += String.fromCharCode.apply(null, slice);
        }
        return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
    },

    normalizeZipPath: function(path) {
        if (typeof path !== 'string') return '';
        return path
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/^\.\//, '')
            .replace(/\/+/g, '/');
    },

    registerIconEntry: function(iconMap, relativePath, bytes, mime, list) {
        const normalized = this.normalizeZipPath(relativePath);
        if (!normalized) {
            return;
        }
        const canonical = normalized.toLowerCase();
        let entry = iconMap.get(canonical);
        if (!entry) {
            entry = { relativePath: normalized, bytes, mime, dataUri: null };
            if (Array.isArray(list)) {
                list.push(entry);
            }
        }
        const fileName = normalized.split('/').pop();
        const keys = new Set([normalized, canonical]);
        if (fileName) {
            keys.add(fileName);
            keys.add(fileName.toLowerCase());
        }
        keys.forEach(key => {
            if (!iconMap.has(key)) {
                iconMap.set(key, entry);
            }
        });
    },

    resolveImportedIcon: function(iconEntries, folder, reference, persisted) {
        if (typeof reference !== 'string') {
            return null;
        }
        const trimmed = reference.trim();
        if (!trimmed) {
            return null;
        }
        if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) {
            return trimmed;
        }
        let normalized = this.normalizeZipPath(trimmed);
        normalized = normalized.replace(/^assets\/domains\//, '').replace(/^assets\/icons\//, '');
        if (normalized.startsWith(folder + '/')) {
            normalized = normalized.slice(folder.length + 1);
        }
        const lookups = [normalized, normalized.toLowerCase()];
        const fileName = normalized.split('/').pop();
        if (fileName) {
            lookups.push(fileName, fileName.toLowerCase());
        }
        for (const key of lookups) {
            if (iconEntries.has(key)) {
                const entry = iconEntries.get(key);
                if (persisted) {
                    return `/assets/domains/${folder}/${entry.relativePath}`;
                }
                if (!entry.dataUri) {
                    entry.dataUri = this.bytesToDataUrl(entry.bytes, entry.mime);
                }
                return entry.dataUri || trimmed;
            }
        }
        if (persisted && normalized) {
            return `/assets/domains/${folder}/${normalized}`;
        }
        return trimmed;
    },

    adjustBackgroundImageReference: function(value, resolver) {
        if (typeof value !== 'string') {
            return value;
        }
        return value.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => {
            const resolved = resolver(url);
            if (!resolved) {
                return match;
            }
            const needsQuotes = resolved.includes('(') || resolved.includes(')') || resolved.includes(' ');
            const wrapped = needsQuotes ? `"${resolved}"` : resolved;
            return `url(${wrapped})`;
        });
    },

    prepareImportedType: function(typeName, typeEntry, options) {
        const { folder, iconEntries, persisted } = options;
        const definition = typeEntry?.definition || {};
        const clone = JSON.parse(JSON.stringify(definition));
        const resolveIcon = (iconValue) => this.resolveImportedIcon(iconEntries, folder, iconValue, persisted);
        if (typeof clone.iconSource === 'string') {
            const resolved = resolveIcon(clone.iconSource);
            if (resolved) {
                clone.iconSource = resolved;
                if (!clone.icon) {
                    clone.icon = resolved;
                }
            }
        }
        if (typeof clone.icon === 'string') {
            const resolved = resolveIcon(clone.icon);
            if (resolved) {
                clone.icon = resolved;
                if (!clone.iconSource) {
                    clone.iconSource = resolved;
                }
            }
        }
        if (typeof clone.backgroundImage === 'string') {
            clone.backgroundImage = this.adjustBackgroundImageReference(clone.backgroundImage, resolveIcon);
        }
        if (typeof clone.backgroundImageUrl === 'string') {
            const resolvedBg = resolveIcon(clone.backgroundImageUrl);
            if (resolvedBg) {
                clone.backgroundImageUrl = resolvedBg;
            }
        }
        return clone;
    },

    decompressDeflateRaw: async function(data) {
        if (!(data instanceof Uint8Array)) {
            data = new Uint8Array(data || []);
        }
        if (typeof DecompressionStream === 'function') {
            const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            const buffer = await new Response(stream).arrayBuffer();
            return new Uint8Array(buffer);
        }
        if (typeof window !== 'undefined') {
            if (window.pako && typeof window.pako.inflateRaw === 'function') {
                return window.pako.inflateRaw(data);
            }
            if (window.Zlib && typeof window.Zlib.Inflate === 'function') {
                const inflater = new window.Zlib.Inflate(data);
                return new Uint8Array(inflater.decompress());
            }
        }
        throw new Error('Deflate decompression is not supported in this environment');
    },

    parseDomainZip: async function(file) {
        if (!file) {
            throw new Error('No file provided');
        }
        const arrayBuffer = await file.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Empty domain package');
        }
        const view = new DataView(arrayBuffer);
        const bytes = new Uint8Array(arrayBuffer);
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const eocdSignature = 0x06054b50;
        let eocdOffset = -1;
        const maxComment = Math.min(arrayBuffer.byteLength, 65536 + 22);
        for (let i = arrayBuffer.byteLength - 22; i >= arrayBuffer.byteLength - maxComment; i--) {
            if (i < 0) break;
            if (view.getUint32(i, true) === eocdSignature) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) {
            throw new Error('Invalid domain package (missing directory)');
        }
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        const centralSize = view.getUint32(eocdOffset + 12, true);
        const centralOffset = view.getUint32(eocdOffset + 16, true);
        const entries = [];
        let cursor = centralOffset;
        const centralEnd = centralOffset + centralSize;
        while (cursor < centralEnd) {
            if (view.getUint32(cursor, true) !== 0x02014b50) {
                throw new Error('Invalid domain package (malformed directory entry)');
            }
            const flags = view.getUint16(cursor + 8, true);
            const compression = view.getUint16(cursor + 10, true);
            const compressedSize = view.getUint32(cursor + 20, true);
            const fileNameLength = view.getUint16(cursor + 28, true);
            const extraLength = view.getUint16(cursor + 30, true);
            const commentLength = view.getUint16(cursor + 32, true);
            const localOffset = view.getUint32(cursor + 42, true);
            const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength);
            const fileName = decoder.decode(nameBytes);
            entries.push({ fileName, flags, compression, compressedSize, localOffset });
            cursor += 46 + fileNameLength + extraLength + commentLength;
        }
        if (entries.length !== totalEntries) {
            console.warn('[DomainLoader] Expected', totalEntries, 'entries but found', entries.length);
        }
        const sanitizedPackageName = file && file.name ? this.sanitizeDomainFolder(file.name.replace(/\.zip$/i, '')) : null;
        let domainFolder = null;
        const iconEntries = new Map();
        const iconList = [];
        const typeDefinitions = {};
        const jsonFiles = [];
        let meta = null;
        const errors = [];
        for (const entry of entries) {
            let normalizedName = this.normalizeZipPath(entry.fileName);
            if (!normalizedName || normalizedName.endsWith('/')) {
                continue;
            }
            if (/^__macosx\//i.test(normalizedName)) {
                continue;
            }
            const segments = normalizedName.split('/').filter(Boolean);
            if (segments.length === 0 || segments.some(seg => seg === '..')) {
                continue;
            }
            let relativeSegments = segments;
            const candidateFolder = this.sanitizeDomainFolder(segments[0]);
            if (!domainFolder) {
                if (segments.length > 1) {
                    domainFolder = candidateFolder || sanitizedPackageName || 'custom-domain';
                    relativeSegments = segments.slice(1);
                } else {
                    domainFolder = candidateFolder || sanitizedPackageName || 'custom-domain';
                    relativeSegments = segments;
                }
            } else if (segments.length > 1 && candidateFolder === domainFolder) {
                relativeSegments = segments.slice(1);
            } else if (segments.length > 1 && candidateFolder !== domainFolder) {
                errors.push(`Skipping ${normalizedName} from unexpected folder`);
                continue;
            }
            if (relativeSegments.length === 0) {
                continue;
            }
            const localSignature = view.getUint32(entry.localOffset, true);
            if (localSignature !== 0x04034b50) {
                errors.push(`Invalid local header for ${normalizedName}`);
                continue;
            }
            const nameLength = view.getUint16(entry.localOffset + 26, true);
            const extraLength = view.getUint16(entry.localOffset + 28, true);
            const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
            if (dataOffset + entry.compressedSize > bytes.length) {
                errors.push(`Corrupt entry ${normalizedName}`);
                continue;
            }
            const dataSlice = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
            let fileBytes;
            if (entry.compression === 0) {
                fileBytes = new Uint8Array(dataSlice);
            } else if (entry.compression === 8) {
                try {
                    fileBytes = await this.decompressDeflateRaw(new Uint8Array(dataSlice));
                } catch (err) {
                    errors.push(`Unable to decompress ${normalizedName}: ${err?.message || err}`);
                    continue;
                }
            } else {
                errors.push(`Unsupported compression for ${normalizedName}`);
                continue;
            }
            const relativePath = relativeSegments.join('/');
            if (!relativePath) {
                continue;
            }
            if (/\.json$/i.test(relativePath)) {
                const text = decoder.decode(fileBytes).replace(/^\uFEFF/, '');
                try {
                    const json = JSON.parse(text);
                    if (relativeSegments.length === 1 && relativeSegments[0].toLowerCase() === 'meta.json') {
                        meta = json;
                        continue;
                    }
                    const typeName = relativeSegments[relativeSegments.length - 1].replace(/\.json$/i, '');
                    typeDefinitions[typeName] = { definition: json, relativePath };
                    jsonFiles.push(`assets/domains/${domainFolder}/${relativePath}`);
                } catch (err) {
                    errors.push(`Invalid JSON in ${relativePath}: ${err?.message || err}`);
                }
            } else {
                const mime = this.detectMimeType(relativePath);
                if (!mime) {
                    continue;
                }
                this.registerIconEntry(iconEntries, relativePath, new Uint8Array(fileBytes), mime, iconList);
            }
        }
        if (!domainFolder) {
            domainFolder = sanitizedPackageName || 'custom-domain';
        }
        if (Object.keys(typeDefinitions).length === 0) {
            throw new Error('Domain package must include at least one node type');
        }
        if (errors.length > 0) {
            console.warn('[DomainLoader] Issues while importing package:', errors.join('; '));
        }
        const key = this.folderToDomainKey(domainFolder);
        const name = meta?.name || this.folderToDisplayName(domainFolder);
        const description = meta?.description || '';
        return { folder: domainFolder, key, name, description, typeDefinitions, iconEntries, iconList, jsonFiles, meta };
    },

    importDomainPackage: async function(file) {
        const parsed = await this.parseDomainZip(file);
        const { folder, key, name, description, typeDefinitions, iconEntries, iconList, jsonFiles, meta } = parsed;
        if (this.availableDomains[key]) {
            throw new Error(`Domain "${name}" already exists`);
        }
        let persisted = false;
        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
            try {
                const dirHandle = await this.requestConfigDirectory();
                if (dirHandle) {
                    await dirHandle.getDirectoryHandle(folder, { create: true });
                    if (meta) {
                        await WorkspaceManager.saveFile(`assets/domains/${folder}/meta.json`, new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }));
                    }
                    for (const [typeName, entry] of Object.entries(typeDefinitions)) {
                        await WorkspaceManager.saveFile(`assets/domains/${folder}/${entry.relativePath}`, new Blob([JSON.stringify(entry.definition, null, 2)], { type: 'application/json' }));
                    }
                    for (const iconEntry of iconList) {
                        const blob = new Blob([iconEntry.bytes], { type: iconEntry.mime || 'application/octet-stream' });
                        await WorkspaceManager.saveFile(`assets/domains/${folder}/${iconEntry.relativePath}`, blob);
                    }
                    persisted = true;
                }
            } catch (err) {
                console.error('Failed to persist imported domain package', err);
            }
        }

        const domainTypes = {};
        Object.entries(typeDefinitions).forEach(([typeName, entry]) => {
            domainTypes[typeName] = this.prepareImportedType(typeName, entry, { folder, iconEntries, persisted });
        });

        this.availableDomains[key] = {
            name,
            description,
            folder,
            loaded: true,
            types: domainTypes,
            files: persisted ? jsonFiles : null,
            virtual: !persisted
        };

        const typeKeys = Object.keys(domainTypes);
        typeKeys.forEach(typeName => this.recordTypeMapping(key, typeName));
        this.storeDomainCache(key, domainTypes);
        this.storeDomainMetadata(key, { name, description, folder, typeKeys, virtual: !persisted });
        this.activeDomains.add(key);
        this.rebuildActiveConfiguration();
        this.refreshUI();
        this.saveState();

        if (window.UI && window.UI.showNotification) {
            const suffix = persisted ? '' : ' (stored locally)';
            window.UI.showNotification(`Imported domain: ${name}${suffix}`, 'success');
        }

        return { key, name, folder, persisted };
    },

    // Save a node type definition to its domain folder
    saveNodeType: async function(domainKey, typeName) {
        const domain = this.availableDomains[domainKey];
        if (!domain) return;
        const legacyName = this.getLegacyTypeKey(typeName, domainKey);
        const data = window.NodeTypes[typeName] || window.NodeTypes[legacyName] || {};
        const snapshot = { ...this.availableDomains };
        try {
            const dirHandle = this.ensureFsApi() ? await this.requestConfigDirectory() : null;
            if (dirHandle) {
                const domainDir = await dirHandle.getDirectoryHandle(domain.folder, { create: true });
                const fileHandle = await domainDir.getFileHandle(`${legacyName}.json`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();
            } else {
                await fetch(`/api/node-types/${domain.folder}/${encodeURIComponent(legacyName)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }
        } catch (err) {
            console.error('Failed to save node type', typeName, err);
        } finally {
            this.availableDomains = snapshot;
        }

        if (!domain.types) domain.types = {};
        domain.types[legacyName] = data;
        if (typeName !== legacyName && domain.types[typeName]) {
            delete domain.types[typeName];
        }
        this.recordTypeMapping(domainKey, legacyName);
        this.storeDomainCache(domainKey, domain.types);
        this.storeDomainMetadata(domainKey, {
            name: domain.name,
            description: domain.description,
            folder: domain.folder,
            typeKeys: Object.keys(domain.types || {}),
            virtual: !!domain.virtual
        });
    },

    // Delete a node type definition file
    deleteNodeTypeFile: async function(domainKey, typeName) {
        const domain = this.availableDomains[domainKey];
        if (!domain) return;
        const legacyName = this.getLegacyTypeKey(typeName, domainKey);
        try {
            const dirHandle = this.ensureFsApi() ? await this.requestConfigDirectory() : null;
            if (dirHandle) {
                const domainDir = await dirHandle.getDirectoryHandle(domain.folder);
                await domainDir.removeEntry(`${legacyName}.json`);
            } else {
                await fetch(`/api/node-types/${domain.folder}/${encodeURIComponent(legacyName)}`, { method: 'DELETE' });
            }
        } catch (err) {
            console.error('Failed to delete node type', typeName, err);
        }

        if (domain.types) {
            delete domain.types[legacyName];
            if (typeName !== legacyName) {
                delete domain.types[typeName];
            }
            this.clearDomainCache(domainKey);
        }
        this.storeDomainMetadata(domainKey, {
            name: domain.name,
            description: domain.description,
            folder: domain.folder,
            typeKeys: Object.keys(domain.types || {}),
            virtual: !!domain.virtual
        });
    },

    // Move a node type to a different domain
    moveNodeType: async function(typeName, fromDomainKey, toDomainKey) {
        const fromDomain = this.availableDomains[fromDomainKey];
        const toDomain = this.availableDomains[toDomainKey];
        if (!fromDomain || !toDomain) return;
        const legacyName = this.getLegacyTypeKey(typeName, fromDomainKey);
        try {
            const dirHandle = this.ensureFsApi() ? await this.requestConfigDirectory() : null;
            if (dirHandle) {
                const fromDir = await dirHandle.getDirectoryHandle(fromDomain.folder);
                const fileHandle = await fromDir.getFileHandle(`${legacyName}.json`);
                const file = await fileHandle.getFile();
                const text = await file.text();
                const toDir = await dirHandle.getDirectoryHandle(toDomain.folder, { create: true });
                const newFile = await toDir.getFileHandle(`${legacyName}.json`, { create: true });
                const writable = await newFile.createWritable();
                await writable.write(text);
                await writable.close();
                await fromDir.removeEntry(`${legacyName}.json`);
            } else {
                const data = window.NodeTypes[typeName] || window.NodeTypes[legacyName] || {};
                await fetch(`/api/node-types/${fromDomain.folder}/${encodeURIComponent(legacyName)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...data, newDomain: toDomain.folder })
                });
            }
        } catch (err) {
            console.error('Failed to move node type', typeName, err);
        }

        this.recordTypeMapping(toDomainKey, legacyName, { force: true });
        this.clearDomainCache(fromDomainKey);
        this.clearDomainCache(toDomainKey);
        this.storeDomainMetadata(fromDomainKey, {
            name: fromDomain.name,
            description: fromDomain.description,
            folder: fromDomain.folder,
            typeKeys: Object.keys((fromDomain.types || {})),
            virtual: !!fromDomain.virtual
        });
        this.storeDomainMetadata(toDomainKey, {
            name: toDomain.name,
            description: toDomain.description,
            folder: toDomain.folder,
            typeKeys: Object.keys((toDomain.types || {})),
            virtual: !!toDomain.virtual
        });
    },

    // Create domain folder
    createDomainFolder: async function(domainKey) {
        const domain = this.availableDomains[domainKey];
        if (!domain || !domain.folder) return false;

        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
            try {
                const configDir = await WorkspaceManager.getSubDirHandle('assets/domains');
                if (configDir && configDir.getDirectoryHandle) {
                    await configDir.getDirectoryHandle(domain.folder, { create: true });
                    return true;
                }
            } catch (err) {
                console.error('Failed to create domain folder via File System Access API', domainKey, err);
            }
        }

        return false;
    },

    // Delete domain folder
    deleteDomainFolder: async function(domainKey) {
        const domain = this.availableDomains[domainKey];
        if (!domain || !domain.folder) return false;

        let removed = false;
        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
            try {
                const configDir = await WorkspaceManager.getSubDirHandle('assets/domains');
                if (configDir && configDir.removeEntry) {
                    await configDir.removeEntry(domain.folder, { recursive: true });
                    removed = true;
                }
            } catch (err) {
                console.error('Failed to delete domain folder via File System Access API', domainKey, err);
            }
        }

        this.clearDomainCache(domainKey);
        this.removeDomainMetadata(domainKey);
        return removed;
    },

    // Discover available domain configs by reading the config directory
    fetchAvailableDomains: async function() {
        try {
            const files = await this.listConfigJsonFiles();
            this.missingTypeCache.clear();
            this.availableDomains = {
                default: { name: 'Default', folder: null, description: '', loaded: true, types: this.defaultNodeTypes }
            };
            this.typeDomainMap = {};
            this.typeNameMap = {};
            this.typeDefinitionOrigins = {};
            this.typeCanonicalMap = {};
            this.typeConflicts = [];
            this.typeConflictSet = new Set();
            this.lastConflictNotificationKey = null;

            if (this.defaultNodeTypes) {
                Object.keys(this.defaultNodeTypes).forEach(typeName => {
                    this.recordTypeMapping('default', typeName);
                });
            }

            const domainInfo = {};
            files.forEach(relPath => {
                const normalized = relPath.replace(/\\/g, '/');
                const parts = normalized.split('/');
                if (parts.length < 4) return; // expect assets/domains/<domain>/<file>
                const folder = parts[2];
                const key = folder.replace(/-/g, '_');
                if (!domainInfo[key]) {
                    domainInfo[key] = { folder, files: [], meta: null };
                }
                // Treat "meta.json" as optional metadata; all other JSON files
                // are considered node type definitions (including "domain.json")
                const filePart = parts.slice(3).join('/');
                if (filePart === 'meta.json') {
                    domainInfo[key].meta = normalized;
                } else {
                    domainInfo[key].files.push(normalized);
                }
            });

            for (const [key, info] of Object.entries(domainInfo)) {
                let name = info.folder.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                let description = '';
                if (info.meta) {
                    try {
                        let meta;
                        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                            const file = await WorkspaceManager.readFile(info.meta);
                            if (file) {
                                meta = JSON.parse(await file.text());
                            }
                        } else {
                            const res = await fetch('/' + info.meta);
                            if (res.ok) {
                                meta = await res.json();
                            }
                        }
                        if (meta) {
                            name = meta.name || name;
                            description = meta.description || '';
                        }
                    } catch (_) {}
                }

                this.availableDomains[key] = {
                    name,
                    description,
                    folder: info.folder,
                    loaded: false,
                    types: null,
                    files: info.files
                };

                // Map each type definition file to this domain for quick lookups
                info.files.forEach(f => {
                    const typeKey = f.split('/').pop().replace('.json', '');
                    this.recordTypeMapping(key, typeKey);
                });
            }

            const storedMetadata = this.loadStoredDomainMetadata();
            storedMetadata.forEach(meta => {
                if (!meta || !meta.key) {
                    return;
                }
                if (this.availableDomains[meta.key]) {
                    if (Array.isArray(meta.typeKeys)) {
                        meta.typeKeys.forEach(typeName => this.recordTypeMapping(meta.key, typeName));
                    }
                    return;
                }
                const folder = meta.folder || meta.key.replace(/_/g, '-');
                const name = meta.name || folder.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const description = meta.description || '';
                this.availableDomains[meta.key] = {
                    name,
                    description,
                    folder,
                    loaded: false,
                    types: null,
                    files: null,
                    virtual: true
                };
                if (Array.isArray(meta.typeKeys)) {
                    meta.typeKeys.forEach(typeName => this.recordTypeMapping(meta.key, typeName));
                }
            });
        } catch (err) {
            console.error('Error fetching available domains:', err);
            this.availableDomains = {
                default: { name: 'Default', folder: null, description: '', loaded: true, types: this.defaultNodeTypes }
            };
        }
    },

    // Initialize the domain selection UI with expandable sections
    initializeUI: function() {
        const domainSelector = document.getElementById('domainSelector');
        if (!domainSelector) {
            return;
        }

        // Clear existing content and set up container
        domainSelector.innerHTML = '';
        domainSelector.style.cssText = 'display: flex; flex-direction: column; flex-wrap: wrap; align-content: flex-start; gap: 10px; max-height: 80vh; overflow-y: auto;';

        Object.keys(this.availableDomains).forEach(domainKey => {
            const domain = this.availableDomains[domainKey];
            const domainItem = document.createElement('div');
            domainItem.style.cssText = 'width: 150px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px;';

            const label = document.createElement('label');
            label.style.cssText = 'display: flex; align-items: flex-start; gap: 8px; color: #ffffff; font-size: 12px; cursor: pointer; padding: 4px;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `domain-${domainKey}`;
            checkbox.value = domainKey;
            checkbox.style.cssText = 'margin: 2px 0 0 0; flex-shrink: 0;';

            const textContainer = document.createElement('div');
            textContainer.style.cssText = 'flex: 1; min-width: 0;';

            const title = document.createElement('div');
            title.style.cssText = 'font-weight: 500; color: #ffffff; margin-bottom: 2px;';
            title.textContent = domain.name;

            const description = document.createElement('div');
            description.style.cssText = 'font-size: 11px; color: #b0b0b0; line-height: 1.3;';
            description.textContent = domain.description;

            textContainer.appendChild(title);
            textContainer.appendChild(description);

            label.appendChild(checkbox);
            label.appendChild(textContainer);
            domainItem.appendChild(label);
            domainSelector.appendChild(domainItem);
        });

        // Update status
        this.updateDomainStatus();
    },

    // Update the domain status display
    updateDomainStatus: function() {
        const statusDiv = document.getElementById('domainStatus');
        if (!statusDiv) return;

        const activeDomainNames = Array.from(this.activeDomains)
            .filter(key => key !== 'default')
            .map(key => this.availableDomains[key]?.name || key);

        let message;
        let color;

        if (activeDomainNames.length === 0) {
            message = 'Using default node types only. Select domains and click "Load Selected" to add specialized types.';
            color = '#b0b0b0';
        } else {
            message = `Active domains: ${activeDomainNames.join(', ')} (${Object.keys(window.NodeTypes).length} total types available)`;
            color = '#4CAF50';
        }

        if (this.typeConflicts && this.typeConflicts.length > 0) {
            const conflictTypes = Array.from(new Set(this.typeConflicts.map(conflict => conflict.typeKey)));
            const preview = conflictTypes.slice(0, 3).join(', ');
            const remaining = conflictTypes.length > 3 ? `, +${conflictTypes.length - 3} more` : '';
            message += ` Conflicts detected for: ${preview}${remaining}. Rename or relocate duplicates to use their definitions.`;
            color = '#FFA726';
        }

        statusDiv.textContent = message;
        statusDiv.style.color = color;
    },

    // Reset to default domain configuration
    clearActiveDomains: function() {
        if (!this.defaultNodeTypes) {
            this.defaultNodeTypes = { ...window.NodeTypes };
            this.defaultIconConfigs = { ...window.IconConfigs };
        }

        this.activeDomains = new Set(['default']);
        window.NodeTypes = { ...this.defaultNodeTypes };
        window.IconConfigs = { ...this.defaultIconConfigs };

        this.refreshUI();

        // Persist reset state
        this.saveState();
    },

    // Load a specific domain's node types
    loadDomain: async function(domainKey, options = {}) {
        const { forceRemote = false } = options;
        const domain = this.availableDomains[domainKey];
        if (!domain) {
            console.error('Unknown domain:', domainKey);
            return false;
        }

        if (domain.loaded && !forceRemote) {
            return true;
        }

        if (!forceRemote) {
            // Check localStorage cache first
            const cached = this.loadCachedDomain(domainKey);
            if (cached) {
                domain.types = cached;
                Object.keys(domain.types || {}).forEach(typeName => {
                    this.recordTypeMapping(domainKey, typeName);
                });
                await this.validateIconsInTypes(domain.types);
                domain.loaded = true;
                return true;
            }
        }

        try {
            this.ensureDomainDir();
            if (domain.file) {
                let scriptText = null;
                if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                    const file = await WorkspaceManager.readFile(domain.file);
                    if (file) {
                        scriptText = await file.text();
                    }
                }
                if (forceRemote || scriptText === null) {
                    const response = await fetch(domain.file);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${domain.file}: ${response.statusText}`);
                    }
                    scriptText = await response.text();
                    if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                        await WorkspaceManager.saveFile(domain.file, new Blob([scriptText], { type: 'application/javascript' }));
                    }
                }
                const script = document.createElement('script');
                script.textContent = scriptText;
                document.head.appendChild(script);
                const globalVarName = this.getDomainGlobalVarName(domainKey);
                const domainTypes = window[globalVarName];
                if (!domainTypes) {
                    throw new Error(`Failed to load domain types for ${domainKey}`);
                }
                domain.types = domainTypes;
                Object.keys(domain.types || {}).forEach(typeName => {
                    this.recordTypeMapping(domainKey, typeName);
                });
                await this.validateIconsInTypes(domain.types);
                domain.loaded = true;
                this.storeDomainCache(domainKey, domain.types);
                document.head.removeChild(script);
                delete window[globalVarName];
                return true;
            } else if (domain.files) {
                const typePromises = domain.files.map(async rel => {
                    try {
                        let def;
                        if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                            const file = await WorkspaceManager.readFile(rel);
                            if (file) {
                                def = JSON.parse(await file.text());
                            }
                        }
                        let fetched = false;
                        if (!def || forceRemote) {
                            try {
                                const res = await fetch('/' + rel);
                                if (res.ok) {
                                    def = await res.json();
                                    fetched = true;
                                    if (this.ensureFsApi() && window.WorkspaceManager && WorkspaceManager.handle) {
                                        await WorkspaceManager.saveFile(rel, new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' }));
                                    }
                                }
                            } catch (_) {}
                        }
                        if (!def) return null;
                        const typeKey = rel.split('/').pop().replace('.json', '');
                        return [typeKey, def];
                    } catch (_) {
                        return null; // Skip invalid files
                    }
                });

                const typeEntries = await Promise.all(typePromises);
                const types = {};
                for (const entry of typeEntries) {
                    if (entry) {
                        const [typeKey, def] = entry;
                        types[typeKey] = def;
                    }
                }

                domain.types = types;
                await this.validateIconsInTypes(domain.types);
                domain.loaded = true;
                this.storeDomainCache(domainKey, domain.types);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error loading domain', domainKey, ':', error);
            return false;
        }
    },

    // Force reload a domain's type definitions by bypassing cached data
    forceReloadDomain: async function(domainKey) {
        this.clearDomainCache(domainKey);
        const domain = this.availableDomains[domainKey];
        if (domain) {
            domain.loaded = false;
            domain.types = null;
        }
        return await this.loadDomain(domainKey, { forceRemote: true });
    },

    // Force reload of all known domains and rebuild the active configuration
    forceReloadAllDomains: async function() {

        const previousActive = new Set(this.activeDomains);

        await this.moveLocalConfigFilesToTmp();

        this.invalidateAllDomainCaches();

        await this.refreshLocalConfigFiles();

        await this.fetchAvailableDomains();

        this.activeDomains = new Set(
            Array.from(previousActive).filter(key => key === 'default' || this.availableDomains[key])
        );

        const keys = Object.keys(this.availableDomains || {}).filter(key => key !== 'default');
        const reloadPromises = keys.map(key => this.forceReloadDomain(key));
        await Promise.all(reloadPromises);

        this.rebuildActiveConfiguration();
        this.refreshUI();
        this.storeDomainCache('default', this.defaultNodeTypes);
    },

    // Ensure the appropriate domain is active for a given node type
    ensureDomainForType: async function(nodeType) {
        if (!nodeType || window.NodeTypes[nodeType]) {
            return null;
        }

        if (!this.availableDomains || Object.keys(this.availableDomains).length === 0) {
            await this.fetchAvailableDomains();
        }

        const lookupDomain = type => {
            if (!type || !this.typeDomainMap) return null;
            const key = type.toString();
            const lower = key.toLowerCase();
            const normalized = this.normalizeTypeKey(key);
            const domainKey = this.typeDomainMap[key] ||
                this.typeDomainMap[lower] ||
                (normalized ? this.typeDomainMap[normalized] : null);
            if (!domainKey) {
                return null;
            }
            const canonical = (this.typeNameMap && ((normalized && this.typeNameMap[normalized]) || this.typeNameMap[key] || this.typeNameMap[lower])) || key;
            return { domainKey, canonical };
        };

        const mapped = lookupDomain(nodeType);
        if (mapped) {
            const domain = this.availableDomains[mapped.domainKey];
            if (domain && !domain.loaded) {
                await this.loadDomain(mapped.domainKey);
            }
            if (domain && domain.types && domain.types[mapped.canonical]) {
                this.activateDomain(mapped.domainKey);
                return mapped.domainKey;
            }
        }

        const normalizedKey = this.normalizeTypeKey(nodeType);
        if (normalizedKey && normalizedKey !== nodeType) {
            const normalizedDomain = lookupDomain(normalizedKey);
            if (normalizedDomain) {
                const domain = this.availableDomains[normalizedDomain.domainKey];
                if (domain && !domain.loaded) {
                    await this.loadDomain(normalizedDomain.domainKey);
                }
                const canonicalType = normalizedDomain.canonical;
                if (domain && domain.types && domain.types[canonicalType]) {
                    this.activateDomain(normalizedDomain.domainKey);
                    return normalizedDomain.domainKey;
                }
            }
        }

        if (!this.missingTypeCache.has(nodeType)) {
            console.info(`[DomainLoader] No domain found for node type '${nodeType}'. Using default settings.`);
            this.missingTypeCache.add(nodeType);
        }

        return null;
    },

    // Auto-detect and load domains based on node types in graph data
    autoLoadDomainsForGraph: async function(graphData) {

        if (!graphData || !Array.isArray(graphData.nodes) || graphData.nodes.length === 0) {
            // If there's no graph data or no nodes, retain the existing active domains
            // rather than clearing them. This prevents saved domain selections from
            // being wiped on page reload when an empty graph initializes.
            return [];
        }

        // Ensure we start from a clean slate only when there is meaningful graph data
        this.clearActiveDomains();

        // Ensure defaults and available domains are initialized
        if (!this.defaultNodeTypes) {
            this.defaultNodeTypes = { ...window.NodeTypes };
            this.defaultIconConfigs = { ...window.IconConfigs };
        }

        if (!this.availableDomains || Object.keys(this.availableDomains).length === 0) {
            await this.fetchAvailableDomains();
        }

        // Extract all unique node types from the graph
        const nodeTypes = new Set();
        graphData.nodes.forEach(node => {
            const nodeType = node.data?.type || node.type || 'default';
            if (nodeType && nodeType !== 'default') {
                if (this.defaultNodeTypes && this.defaultNodeTypes[nodeType]) {
                    return;
                }
                nodeTypes.add(nodeType);
            }
        });

        const activated = new Set();
        for (const type of nodeTypes) {
            const domainKey = await this.ensureDomainForType(type);
            if (domainKey) {
                activated.add(domainKey);
            }
        }

        if (activated.size > 0) {
            this.refreshUI();
        }

        return Array.from(activated);
    },

    // Activate a domain (add its types to the active configuration)
    activateDomain: function(domainKey) {
        const domain = this.availableDomains[domainKey];
        if (!domain || !domain.loaded) {
            console.error('Domain not loaded:', domainKey);
            return false;
        }

        if (this.activeDomains.has(domainKey)) {
            return true;
        }

        this.activeDomains.add(domainKey);
        this.rebuildActiveConfiguration();
        
        return true;
    },

    // Deactivate a domain (remove its types from the active configuration)
    deactivateDomain: function(domainKey) {
        if (domainKey === 'default') {
            return false;
        }

        if (!this.activeDomains.has(domainKey)) {
            return true;
        }

        this.activeDomains.delete(domainKey);
        this.rebuildActiveConfiguration();
        
        return true;
    },

    // Rebuild the active node types configuration
    rebuildActiveConfiguration: function() {

        const baseNodeTypes = this.defaultNodeTypes || {};
        const baseIconConfigs = this.defaultIconConfigs || {};

        const newNodeTypes = {};
        const newIconConfigs = { ...baseIconConfigs };
        const canonicalAliases = new Map();

        if (!this.typeDefinitionOrigins) {
            this.typeDefinitionOrigins = {};
        }
        this.typeConflicts = [];
        this.typeConflictSet = new Set();

        const ensureOrigin = (domainKey, canonicalKey, legacyKey) => {
            const lookupKey = canonicalKey || legacyKey;
            const originKey = this.getTypeOriginKey(lookupKey);
            if (!originKey) {
                return domainKey;
            }
            const existing = this.typeDefinitionOrigins[originKey];
            if (!existing || !existing.domainKey || (this.availableDomains && !this.availableDomains[existing.domainKey])) {
                this.typeDefinitionOrigins[originKey] = {
                    domainKey,
                    typeKey: lookupKey,
                    legacyKey: legacyKey || lookupKey
                };
                return domainKey;
            }
            return existing.domainKey;
        };

        const registerTypeDefinition = (domainKey, typeKey, typeDef, options = {}) => {
            if (!typeKey) {
                return null;
            }

            const canonicalKey = this.resolveCanonicalName(domainKey, typeKey);
            const owningDomain = ensureOrigin(domainKey, canonicalKey, typeKey);
            if (owningDomain !== domainKey) {
                if (!options.skipConflict) {
                    const conflictKey = canonicalKey || typeKey;
                    this.registerTypeConflict(conflictKey, owningDomain, domainKey);
                }
                return null;
            }

            newNodeTypes[typeKey] = typeDef;
            if (canonicalKey && canonicalKey !== typeKey) {
                canonicalAliases.set(canonicalKey, typeKey);
            }

            return { canonicalKey, legacyKey: typeKey };
        };

        Object.entries(baseNodeTypes).forEach(([typeKey, typeDef]) => {
            registerTypeDefinition('default', typeKey, typeDef, { skipConflict: true });
        });

        this.activeDomains.forEach(domainKey => {
            if (domainKey === 'default') return;

            const domain = this.availableDomains[domainKey];
            if (!domain || !domain.loaded || !domain.types) {
                return;
            }

            const acceptedTypes = {};

            Object.entries(domain.types).forEach(([typeKey, typeDef]) => {
                const registered = registerTypeDefinition(domainKey, typeKey, typeDef);
                if (registered) {
                    acceptedTypes[typeKey] = typeDef;
                }
            });

            if (Object.keys(acceptedTypes).length > 0) {
                this.extractIconsFromDomain(acceptedTypes, newIconConfigs);
            }
        });

        window.NodeTypes = newNodeTypes;
        this.applyCanonicalAliases(window.NodeTypes, canonicalAliases);
        window.IconConfigs = newIconConfigs;
        this.applyCanonicalAliases(window.IconConfigs, canonicalAliases, { skipMissing: true });

        this.refreshUI();

        this.saveState();

        this.notifyTypeConflicts();
    },

    // Extract icons from domain types and add to icon configs
    extractIconsFromDomain: function(domainTypes, iconConfigs) {
        const normalizeIconSource = iconPath => {
            if (typeof iconPath !== 'string' || iconPath.length === 0) {
                return null;
            }
            if (iconPath.startsWith('/assets/icons/')) {
                return iconPath.replace(/^\/+/, '').replace(/^assets\/icons\//, 'assets/domains/');
            }
            if (iconPath.startsWith('/assets/domains/')) {
                return iconPath.replace(/^\/+/, '');
            }
            if (iconPath.startsWith('assets/icons/') || iconPath.startsWith('data:')) {
                return iconPath.startsWith('assets/icons/')
                    ? iconPath.replace(/^assets\/icons\//, 'assets/domains/')
                    : iconPath;
            }
            if (iconPath.startsWith('assets/domains/')) {
                return iconPath;
            }
            return null;
        };

        Object.keys(domainTypes).forEach(typeKey => {
            const type = domainTypes[typeKey];
            if (!type) {
                return;
            }

            let iconSource = normalizeIconSource(type.iconSource);
            if (!iconSource) {
                iconSource = normalizeIconSource(type.icon);
            }

            if (!iconSource) {
                return;
            }

            type.iconSource = iconSource;
            iconConfigs[typeKey] = iconSource;
            type.icon = typeKey;
        });
    },

    // Get list of available domains
    getAvailableDomains: function() {
        return Object.keys(this.availableDomains).map(key => ({
            key: key,
            ...this.availableDomains[key]
        }));
    },

    // Get list of active domains
    getActiveDomains: function() {
        return Array.from(this.activeDomains);
    },

    // Load and activate multiple domains
    loadAndActivateDomains: async function(domainKeys) {
        
        const results = [];
        for (const domainKey of domainKeys) {
            const loaded = await this.loadDomain(domainKey);
            if (loaded) {
                const activated = this.activateDomain(domainKey);
                results.push({ domain: domainKey, success: activated });
            } else {
                results.push({ domain: domainKey, success: false });
            }
        }
        
        return results;
    },

    // Refresh UI components that depend on node types
    refreshUI: function() {
        // Update domain status
        this.updateDomainStatus();

        // Refresh node types table if visible (with a small delay to let the icons load)
        if (window.TableManager && typeof window.TableManager.updateNodeTypesTable === 'function') {
            if (!this._nodeTypesRefreshTimeout) {
                const attemptRefresh = () => {
                    if (!window.TableManager || typeof window.TableManager.updateNodeTypesTable !== 'function') {
                        this._nodeTypesRefreshTimeout = null;
                        return;
                    }
                    if (window.TableManager.nodeTypesTableRebuildInProgress) {
                        this._nodeTypesRefreshTimeout = setTimeout(attemptRefresh, 100);
                        return;
                    }
                    this._nodeTypesRefreshTimeout = null;
                    window.TableManager.updateNodeTypesTable('', true);
                };
                this._nodeTypesRefreshTimeout = setTimeout(attemptRefresh, 100);
            }
        }

        // Refresh graph if needed to update node appearances
        if (
            window.GraphRenderer &&
            window.GraphRenderer.cy &&
            window.LayoutManager &&
            typeof window.LayoutManager.updateNodeStyles === 'function' &&
            typeof window.LayoutManager.calculateOptimalSizing === 'function'
        ) {
            const cy = window.GraphRenderer.cy;
            const sizing = window.LayoutManager.calculateOptimalSizing(cy);
            window.LayoutManager.updateNodeStyles(cy, sizing);
        }
        
        // Refresh any dropdowns or selectors that list node types
        this.refreshNodeTypeSelectors();
    },

    // Refresh all node type selectors in the UI
    refreshNodeTypeSelectors: function() {
        // Find all node type dropdowns and refresh them
        const nodeTypeSelects = document.querySelectorAll('.node-type-select, #nodeTypeSelect');
        nodeTypeSelects.forEach(select => {
            const currentValue = select.value;
            
            // Clear existing options except the first one (usually "Select type")
            const firstOption = select.querySelector('option');
            select.innerHTML = '';
            if (firstOption && firstOption.value === '') {
                select.appendChild(firstOption);
            }
            
            // Add all available node types
            Object.keys(window.NodeTypes).forEach(typeKey => {
                if (typeKey !== 'default') {
                    const option = document.createElement('option');
                    option.value = typeKey;
                    option.textContent = typeKey.replace(/_/g, ' ');
                    select.appendChild(option);
                }
            });
            
            // Restore previous selection if it still exists
            if (currentValue && window.NodeTypes[currentValue]) {
                select.value = currentValue;
            }
        });
    }
};

console.info('[DomainLoader] domain-loader.js loaded.');

window.reloadTypeDefinitions = async function() {
    if (window.DomainLoader && typeof window.DomainLoader.forceReloadAllDomains === 'function') {
        await window.DomainLoader.forceReloadAllDomains();
    }
};

window.reloadTypeDefinitions = async function() {
    if (window.DomainLoader && typeof window.DomainLoader.forceReloadAllDomains === 'function') {
        await window.DomainLoader.forceReloadAllDomains();
    }
};
