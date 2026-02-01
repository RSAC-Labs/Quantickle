// Table management for Quantickle
// Handles table updates, filtering, and data display

window.TableManager = {
    draggedNode: null,
    nodeTypesTableBuilt: false,
    lastNodeTypesSearch: '',
    nodeTypesTableRebuildInProgress: false,
    shapeSymbols: {
        ellipse: '◯',
        rectangle: '▭',
        triangle: '▲',
        diamond: '◆',
        hexagon: '⬡',
        octagon: '⯃',
        star: '★',
        'round-rectangle': '▢'
    },

    buildShapeOptions: function(selectedShape = 'round-rectangle') {
        return Object.entries(this.shapeSymbols)
            .map(([shape, symbol]) => `<option value="${shape}" ${selectedShape === shape ? 'selected' : ''}>${symbol}</option>`)
            .join('');
    },

    resolveTypeSettings: function(typeName) {
        if (window.NodeTypes && window.NodeTypes[typeName]) {
            return window.NodeTypes[typeName];
        }

        if (window.NodeTypes && window.NodeTypes.default) {
            return window.NodeTypes.default;
        }

        return {
            color: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
            size: 30,
            shape: 'round-rectangle',
            icon: ''
        };
    },

    lightenColor: function(color, amount = 0.4) {
        if (window.GraphRenderer && typeof window.GraphRenderer.lightenColor === 'function') {
            return window.GraphRenderer.lightenColor(color, amount);
        }

        if (typeof color !== 'string') {
            return color;
        }

        let normalized = color.trim();
        const shortHex = /^#([0-9a-f]{3})$/i;
        const longHex = /^#([0-9a-f]{6})$/i;

        if (shortHex.test(normalized)) {
            const [, parts] = normalized.match(shortHex);
            normalized = `#${parts[0]}${parts[0]}${parts[1]}${parts[1]}${parts[2]}${parts[2]}`;
        } else if (!longHex.test(normalized)) {
            return color;
        }

        const channel = (hex) => Math.min(255, Math.round(parseInt(hex, 16) + (255 * amount)));
        const r = channel(normalized.slice(1, 3)).toString(16).padStart(2, '0');
        const g = channel(normalized.slice(3, 5)).toString(16).padStart(2, '0');
        const b = channel(normalized.slice(5, 7)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    },

    ensureNumberInputStyles: function() {
        if (this.numberInputStylesInjected) {
            return;
        }

        const style = document.createElement('style');
        style.textContent = `
            .node-number-input {
                appearance: textfield;
                -moz-appearance: textfield;
            }
            .node-number-input::-webkit-outer-spin-button,
            .node-number-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
        `;

        document.head.appendChild(style);
        this.numberInputStylesInjected = true;
    },

    normalizeIconBackground: function(iconValue) {
        if (!iconValue || typeof iconValue !== 'string') {
            return 'none';
        }

        const icon = iconValue.trim();
        if (!icon) {
            return 'none';
        }

        if (window.IconConfigs && window.IconConfigs[icon]) {
            return `url("${window.IconConfigs[icon]}")`;
        }

        if (/^url\(/i.test(icon)) {
            return icon;
        }

        if (/^(https?:|file:|data:)/.test(icon) || icon.startsWith('/') || icon.startsWith('./') || icon.startsWith('../')) {
            return `url("${icon}")`;
        }

        return 'none';
    },

    applyNodeEditorStyles: function(cyNode) {
        if (!cyNode || typeof cyNode.style !== 'function') {
            return;
        }

        if (window.NodeEditorModule && typeof window.NodeEditorModule.applyNodeStyles === 'function') {
            try {
                window.NodeEditorModule.applyNodeStyles(cyNode);
                return;
            } catch (error) {
                console.warn('Failed to delegate to NodeEditorModule.applyNodeStyles', error);
            }
        }

        const color = cyNode.data('color');
        if (color) {
            cyNode.style('background-color', color);
        }

        const shape = cyNode.data('shape');
        if (shape) {
            cyNode.style('shape', shape);
        }

        const size = cyNode.data('size');
        if (size) {
            cyNode.style({
                width: size,
                height: size
            });
        }

        const opacity = cyNode.data('opacity');
        if (opacity !== undefined) {
            cyNode.style('opacity', opacity);
        }

        const iconOpacity = cyNode.data('iconOpacity');
        if (iconOpacity !== undefined) {
            cyNode.style('background-opacity', iconOpacity);
        }

        const borderColor = cyNode.data('borderColor');
        if (borderColor) {
            cyNode.style('border-color', borderColor);
        }

        cyNode.style('text-opacity', cyNode.data('labelVisible') !== false ? 1 : 0);

        const backgroundImage = cyNode.data('backgroundImage');
        if (backgroundImage && backgroundImage !== 'none') {
            const lighterColor = color ? this.lightenColor(color, 0.4) : null;
            cyNode.style({
                'background-color': lighterColor || color,
                'background-image': backgroundImage,
                'background-fit': 'contain',
                'background-repeat': 'no-repeat',
                'background-position-x': '50%',
                'background-position-y': '50%'
            });
        }

        if (!backgroundImage || backgroundImage === 'none') {
            cyNode.style('background-image', 'none');
        }

        if (window.GraphRenderer && window.GraphRenderer.cy) {
            window.GraphRenderer.cy.style().update();
        }
    },
    // Initialize table manager
    init: function() {
        this.ensureNumberInputStyles();
        this.updateNodeTypesTable('', true);
    },

    // Update all tables
    updateTables: function(force = false, delta = null) {

        if (force) {
            this.nodeTypesTableBuilt = false;
        }

        const shouldUpdate = force
            || this.isTableViewVisible()
            || this.deltaImpactsCurrentTable(delta);

        if (!shouldUpdate) {
            return;
        }

        this.updateTableContent(window.DataManager.currentTable, force, delta);
        this.updateTableStats();
    },

    isTableViewVisible: function() {
        const currentView = window.DataManager ? window.DataManager.currentView : null;
        if (currentView && currentView !== 'table') {
            return false;
        }

        const tableView = document.getElementById('tableView');
        if (!tableView) return false;

        const isActive = tableView.classList.contains('active');
        const isDisplayed = tableView.style.display !== 'none' && tableView.offsetParent !== null;
        return isActive || isDisplayed;
    },

    deltaImpactsCurrentTable: function(delta) {
        if (!delta) return true;

        const hasNodes = Array.isArray(delta.nodes) && delta.nodes.length > 0;
        const hasEdges = Array.isArray(delta.edges) && delta.edges.length > 0;
        const currentTable = window.DataManager ? window.DataManager.currentTable : 'nodeTypes';

        switch (currentTable) {
            case 'edges':
                return hasEdges;
            case 'relationships':
                return hasNodes || hasEdges;
            case 'nodeTypes':
                return hasNodes;
            default:
                return hasNodes || hasEdges;
        }
    },

    // Update table content based on current table type
    updateTableContent: function(tableName, force = false, delta = null) {
        const tableSearchElement = document.getElementById('tableSearch');
        const searchTerm = tableSearchElement ? tableSearchElement.value.toLowerCase() : '';

        switch (tableName) {
            case 'nodeTypes':
                this.updateNodeTypesTable(searchTerm, force);
                break;
            case 'edges':
                this.updateEdgesTable(searchTerm);
                break;
            case 'relationships':
                this.updateRelationshipsTable(searchTerm, { delta });
                break;
            default:
        }
    },

    // Update data types table
    updateNodeTypesTable: function(searchTerm, force = false) {

        const container = document.getElementById('nodeTypeTree');
        if (!container) {
            console.error('nodeTypeTree not found');
            return;
        }

        const searchLower = searchTerm ? searchTerm.toLowerCase() : '';
        const domainLoader = window.DomainLoader;
        const activeDomains = (domainLoader && domainLoader.activeDomains instanceof Set)
            ? domainLoader.activeDomains
            : new Set(['default']);

        if (!force && this.nodeTypesTableBuilt && searchLower === this.lastNodeTypesSearch) {
            return;
        }

        this.nodeTypesTableRebuildInProgress = true;
        const self = this;

        try {
            // Preserve which domain branches are currently expanded
            const previouslyOpen = new Set(
                Array.from(container.querySelectorAll('li.has-children > .node[data-open="true"]'))
                    .map(node => node.parentElement?.dataset?.domain)
                    .filter(Boolean)
            );

            container.innerHTML = '';

            // Build domain grouping from available domains
            const domainMap = {};

            const defaultTypes = this.collectDomainTypeInfos('default', searchLower);
            domainMap['default'] = { name: 'Default', types: defaultTypes, active: true, loaded: true };

            if (window.DomainLoader && window.DomainLoader.availableDomains) {
                for (const [key, domain] of Object.entries(window.DomainLoader.availableDomains)) {
                    if (key === 'default') continue;
                    if (!domainMap[key]) {
                        const isActive = activeDomains.has(key);
                        domainMap[key] = { name: domain.name, types: [], loaded: domain.loaded, active: isActive };
                    } else {
                        domainMap[key].loaded = domain.loaded;
                        domainMap[key].active = activeDomains.has(key);
                    }

                    if (domain.loaded) {
                        domainMap[key].types = this.collectDomainTypeInfos(key, searchLower);
                    }
                }
            }

            const rootUl = document.createElement('ul');

            Object.entries(domainMap).forEach(([domainKey, domain]) => {
                const domainLi = document.createElement('li');
                domainLi.className = 'has-children';
                domainLi.dataset.domain = domainKey;

                const nodeDiv = document.createElement('div');
                nodeDiv.className = 'node';
                const isOpen = previouslyOpen.has(domainKey);
                nodeDiv.dataset.open = isOpen ? 'true' : 'false';
                nodeDiv.dataset.domainName = domain.name;
                nodeDiv.dataset.domain = domainKey;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'domain-active-checkbox';
                checkbox.dataset.domain = domainKey;
                const isActive = domainKey === 'default' ? true : !!domain.active;
                checkbox.checked = isActive;
                if (domainKey === 'default') {
                    checkbox.disabled = true;
                }

                const twisty = document.createElement('button');
                twisty.className = 'twisty';
                twisty.textContent = isOpen ? '▼' : '▶';

                const title = document.createElement('span');
                title.className = 'domain-title';
                title.textContent = `${domain.name} (${domain.types.length})`;

                const addBtn = document.createElement('button');
                addBtn.className = 'add-type-btn';
                addBtn.dataset.domain = domainKey;
                addBtn.textContent = 'Add node type';

                nodeDiv.append(checkbox, twisty, title, addBtn);

                const childrenUl = document.createElement('ul');
                childrenUl.className = 'children';
                if (isOpen) {
                    childrenUl.style.display = 'block';
                }

                this.populateDomainList(childrenUl, domain.types, domainKey);

                domainLi.append(nodeDiv, childrenUl);
                rootUl.appendChild(domainLi);
            });

            container.appendChild(rootUl);

            if (!container._delegated) {
                container.addEventListener('click', async function(e) {
                    const twisty = e.target.closest('.twisty');
                    if (twisty) {
                        const node = twisty.closest('.node');
                        const li = node.parentElement;
                        const isOpen = node.dataset.open === 'true';
                        if (li.classList.contains('has-children')) {
                            const domainKey = li.dataset.domain;
                            const domainInfo = window.DomainLoader ? window.DomainLoader.availableDomains[domainKey] : null;
                            const domainLoader = window.DomainLoader;
                            const isDomainActive = domainLoader && domainLoader.activeDomains && domainLoader.activeDomains.has(domainKey);
                            let shouldToggle = true;
                            if (
                                !isOpen &&
                                domainInfo &&
                                domainLoader &&
                                typeof domainLoader.loadAndActivateDomains === 'function' &&
                                !isDomainActive
                            ) {
                                const results = await domainLoader.loadAndActivateDomains([domainKey]);
                                const loaded = Array.isArray(results) && results.some(result => result && result.domain === domainKey && result.success);
                                if (loaded) {
                                    if (typeof domainLoader.refreshNodeTypeSelectors === 'function') {
                                        domainLoader.refreshNodeTypeSelectors();
                                    }
                                    const searchInput = document.getElementById('tableSearch');
                                    const searchLower = searchInput ? (searchInput.value || '').toLowerCase() : '';
                                    const childrenUl = li.querySelector('.children');
                                    const types = self.collectDomainTypeInfos(domainKey, searchLower);
                                    self.populateDomainList(childrenUl, types, domainKey);
                                } else {
                                    shouldToggle = false;
                                }
                            }
                            if (shouldToggle) {
                                node.dataset.open = isOpen ? 'false' : 'true';
                                twisty.textContent = isOpen ? '▶' : '▼';
                                const children = li.querySelector('.children');
                                if (children) children.style.display = isOpen ? 'none' : 'block';
                            }
                        }
                        return;
                    }

                    const addBtn = e.target.closest('.add-type-btn');
                    if (addBtn) {
                        e.stopPropagation();
                        self.addNewNodeType(addBtn.dataset.domain);
                        return;
                    }
                    const delTypeBtn = e.target.closest('.delete-type-btn');
                    if (delTypeBtn) {
                        e.stopPropagation();
                        self.deleteNodeType(delTypeBtn.dataset.type, delTypeBtn.dataset.domain);
                        return;
                    }

                    const iconFileBtn = e.target.closest('.icon-file-button');
                    if (iconFileBtn) {
                        e.stopPropagation();
                        const typeInput = iconFileBtn.parentElement.querySelector('.icon-input');
                        if (!typeInput || !window.QuantickleUtils?.pickImageFilePath) {
                            return;
                        }
                        const path = await window.QuantickleUtils.pickImageFilePath({ workspaceSubdir: 'assets' });
                        if (!path) {
                            return;
                        }
                        typeInput.value = path;
                        typeInput.dispatchEvent(new Event('change', { bubbles: true }));
                        return;
                    }

                    const iconSwatch = e.target.closest('.icon-swatch');
                    if (iconSwatch) {
                        e.stopPropagation();
                        const typeInput = iconSwatch.parentElement.querySelector('.icon-input');
                        if (!typeInput) return;
                        const typeName = typeInput.dataset.type;
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = '.png,.jpg,.jpeg,.svg';
                        fileInput.addEventListener('change', function(ev) {
                            const file = ev.target.files[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = function(loadEvent) {
                                    const dataUrl = loadEvent.target.result;
                                    if (!dataUrl) {
                                        return;
                                    }
                                    typeInput.value = dataUrl;
                                    self.updateNodeTypeProperty(typeName, 'icon', dataUrl);
                                    self.updateNodeTypesTable(document.getElementById('tableSearch') ? document.getElementById('tableSearch').value : '', true);
                                };
                                reader.readAsDataURL(file);
                            }
                        });
                        fileInput.click();
                        return;
                    }

                    const actionBtn = e.target.closest('[data-action]');
                    if (actionBtn) {
                        if (actionBtn.dataset.action === 'expand-all') {
                            container.querySelectorAll('li.has-children > .node').forEach(n => {
                                n.dataset.open = 'true';
                                const t = n.querySelector('.twisty');
                                if (t) t.textContent = '▼';
                                const c = n.nextElementSibling;
                                if (c) c.style.display = 'block';
                            });
                        } else if (actionBtn.dataset.action === 'collapse-all') {
                            container.querySelectorAll('li.has-children > .node').forEach(n => {
                                n.dataset.open = 'false';
                                const t = n.querySelector('.twisty');
                                if (t) t.textContent = '▶';
                                const c = n.nextElementSibling;
                                if (c) c.style.display = 'none';
                            });
                        }
                    }
                });

            container.addEventListener('change', async function(e) {
                const domainCheckbox = e.target.closest('.domain-active-checkbox');
                if (domainCheckbox) {
                    e.stopPropagation();
                    const domainKey = domainCheckbox.dataset.domain;
                    if (!domainKey) {
                        return;
                    }
                    const domainLoader = window.DomainLoader;
                    if (!domainLoader) {
                        return;
                    }
                    if (domainKey === 'default') {
                        domainCheckbox.checked = true;
                        return;
                    }
                    if (domainCheckbox.checked) {
                        if (typeof domainLoader.loadAndActivateDomains === 'function') {
                            domainCheckbox.disabled = true;
                            try {
                                const results = await domainLoader.loadAndActivateDomains([domainKey]);
                                const success = Array.isArray(results)
                                    ? results.some(result => result && result.domain === domainKey && result.success)
                                    : !!results;
                                if (!success) {
                                    domainCheckbox.checked = false;
                                }
                            } finally {
                                domainCheckbox.disabled = false;
                            }
                        } else if (typeof domainLoader.activateDomain === 'function') {
                            const success = domainLoader.activateDomain(domainKey);
                            if (!success) {
                                domainCheckbox.checked = false;
                                return;
                            }
                        }
                    } else {
                        if (typeof domainLoader.deactivateDomain === 'function') {
                            const success = domainLoader.deactivateDomain(domainKey);
                            if (!success) {
                                domainCheckbox.checked = true;
                                return;
                            }
                        } else {
                            domainCheckbox.checked = true;
                            return;
                        }
                    }

                    if (typeof domainLoader.refreshUI === 'function') {
                        domainLoader.refreshUI();
                    } else if (window.TableManager && typeof window.TableManager.updateNodeTypesTable === 'function') {
                        window.TableManager.updateNodeTypesTable('', true);
                    }
                    return;
                }
                const colorInput = e.target.closest('.color-input');
                if (colorInput) {
                    self.updateNodeTypeProperty(colorInput.dataset.type, 'color', colorInput.value);
                    return;
                }
                const sizeInput = e.target.closest('.size-input');
                if (sizeInput) {
                    const val = parseInt(sizeInput.value, 10);
                    self.updateNodeTypeProperty(sizeInput.dataset.type, 'size', isNaN(val) ? 30 : val);
                    return;
                }
                const shapeSelect = e.target.closest('.shape-select');
                if (shapeSelect) {
                    self.updateNodeTypeProperty(shapeSelect.dataset.type, 'shape', shapeSelect.value);
                    return;
                }
                const iconInput = e.target.closest('.icon-input');
                if (iconInput) {
                    self.updateNodeTypeProperty(iconInput.dataset.type, 'icon', iconInput.value);
                    self.updateNodeTypesTable(document.getElementById('tableSearch') ? document.getElementById('tableSearch').value : '', true);
                    return;
                }
            });

            container.addEventListener('keydown', function(e) {
                const nameInput = e.target.closest('.type-name-input');
                if (nameInput && e.key === 'Enter') {
                    e.preventDefault();
                    self.saveNewTypeName(nameInput);
                }
            });

            container.addEventListener('focusout', function(e) {
                const nameInput = e.target.closest('.type-name-input');
                if (nameInput) {
                    self.saveNewTypeName(nameInput);
                }
            });

            container.addEventListener('dragstart', function(e) {
                const node = e.target.closest('.node');
                if (node && node.dataset.type) {
                    self.draggedNode = node;
                    e.dataTransfer.effectAllowed = 'move';
                }
            });

            container.addEventListener('dragover', function(e) {
                if (self.draggedNode) {
                    e.preventDefault();
                }
            });

            container.addEventListener('drop', function(e) {
                if (!self.draggedNode) return;
                e.preventDefault();

                const domainNode = e.target.closest('li.has-children > .node');
                const draggedType = self.draggedNode.dataset.type;
                const fromDomain = self.draggedNode.dataset.domain;

                if (domainNode && !domainNode.dataset.type) {
                    const toDomain = domainNode.parentElement.dataset.domain;
                    if (toDomain && toDomain !== fromDomain) {
                        const draggedLi = self.draggedNode.parentElement;
                        const targetUl = domainNode.parentElement.querySelector('.children');
                        targetUl.appendChild(draggedLi);
                        self.draggedNode.dataset.domain = toDomain;

                        if (window.DomainLoader) {
                            const typeData = window.NodeTypes[draggedType];
                            if (window.DomainLoader.availableDomains[fromDomain] && window.DomainLoader.availableDomains[fromDomain].types) {
                                delete window.DomainLoader.availableDomains[fromDomain].types[draggedType];
                            }
                            if (!window.DomainLoader.availableDomains[toDomain].types) {
                                window.DomainLoader.availableDomains[toDomain].types = {};
                            }
                            window.DomainLoader.availableDomains[toDomain].types[draggedType] = typeData;
                            if (typeof window.DomainLoader.moveNodeType === 'function') {
                                window.DomainLoader.moveNodeType(draggedType, fromDomain, toDomain);
                            }
                        }
                        self.updateNodeTypesTable(document.getElementById('tableSearch') ? document.getElementById('tableSearch').value : '', true);
                    }
                    self.draggedNode = null;
                    return;
                }

                const targetNode = e.target.closest('.node');
                if (!targetNode || !targetNode.dataset.type || targetNode === self.draggedNode) return;
                const draggedLi = self.draggedNode.parentElement;
                const targetLi = targetNode.parentElement;
                if (draggedLi.parentElement === targetLi.parentElement) {
                    draggedLi.parentElement.insertBefore(draggedLi, targetLi.nextSibling);
                }
                self.draggedNode = null;
            });

            container.addEventListener('dragend', function() {
                self.draggedNode = null;
            });

            container._delegated = true;
        }

            const addDomainDiv = document.createElement('div');
            addDomainDiv.style.marginTop = '10px';
            addDomainDiv.style.display = 'flex';
            addDomainDiv.style.gap = '6px';
            addDomainDiv.innerHTML = `
                <button class="toolbar-btn add-new-domain-btn" style="background: #2196F3; color: white; padding: 6px 12px;">➕ Add New Domain</button>
                <button class="toolbar-btn import-domain-package-btn" style="background: #4CAF50; color: white; padding: 6px 12px;">📦 Import Domain Package</button>
            `;
            container.appendChild(addDomainDiv);
            addDomainDiv.querySelector('.add-new-domain-btn').addEventListener('click', function() {
                self.addNewDomain();
            });
            addDomainDiv.querySelector('.import-domain-package-btn').addEventListener('click', function() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.zip';
                input.addEventListener('change', async function(ev) {
                    const file = ev.target.files && ev.target.files[0];
                    if (!file) {
                        return;
                    }
                    if (!window.DomainLoader || typeof window.DomainLoader.importDomainPackage !== 'function') {
                        alert('Domain package import is not supported in this environment.');
                        return;
                    }
                    try {
                        await window.DomainLoader.importDomainPackage(file);
                        self.updateNodeTypesTable('', true);
                    } catch (err) {
                        const message = err && err.message ? err.message : 'Failed to import domain package.';
                        if (window.UI && window.UI.showNotification) {
                            window.UI.showNotification(message, 'error');
                        } else {
                            alert(message);
                        }
                    }
                });
                input.click();
            });
            this.nodeTypesTableBuilt = true;
            this.lastNodeTypesSearch = searchLower;
        } finally {
            this.nodeTypesTableRebuildInProgress = false;
        }
    },

    collectDomainTypeInfos: function(domainKey, searchLower) {
        const results = [];
        const normalizedSearch = searchLower || '';

        if (domainKey === 'default') {
            const domainLoader = window.DomainLoader;
            const baseTypes = (domainLoader && domainLoader.defaultNodeTypes) ? domainLoader.defaultNodeTypes : (window.NodeTypes || {});
            Object.keys(baseTypes).forEach(typeName => {
                if (normalizedSearch && !typeName.toLowerCase().includes(normalizedSearch)) return;
                const settings = window.NodeTypes[typeName] || baseTypes[typeName] || {};
                results.push({ name: typeName, settings });
            });
            return results;
        }

        const domainLoader = window.DomainLoader;
        if (!domainLoader || !domainLoader.availableDomains) {
            return results;
        }

        const domain = domainLoader.availableDomains[domainKey];
        if (!domain || !domain.loaded || !domain.types) {
            return results;
        }

        Object.keys(domain.types).forEach(typeName => {
            if (normalizedSearch && !typeName.toLowerCase().includes(normalizedSearch)) return;
            const settings = window.NodeTypes[typeName] || domain.types[typeName] || {};
            results.push({ name: typeName, settings });
        });

        return results;
    },

    populateDomainList: function(childrenUl, typeInfos, domainKey) {
        if (!childrenUl) return;

        childrenUl.innerHTML = '';

        (typeInfos || []).forEach(info => {
            const typeLi = this.buildTypeListItem(info, domainKey);
            childrenUl.appendChild(typeLi);
        });

        const domainNode = childrenUl.previousElementSibling;
        if (domainNode) {
            const titleEl = domainNode.querySelector('.domain-title');
            const domainName = domainNode.dataset.domainName || (titleEl ? titleEl.textContent.split(' (')[0] : '');
            if (titleEl && domainName) {
                titleEl.textContent = `${domainName} (${typeInfos ? typeInfos.length : 0})`;
            }
        }
    },

    buildTypeListItem: function(info, domainKey) {
        const currentShape = info.settings.shape || 'round-rectangle';
        const shapeOptions = this.buildShapeOptions(currentShape);
        let iconDisplay;
        if (info.settings.icon) {
            const iconRef = info.settings.icon;
            if (window.IconConfigs && window.IconConfigs[iconRef]) {
                iconDisplay = `<img src="${window.IconConfigs[iconRef]}" class="icon-swatch" alt="${iconRef}" title="${iconRef}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="icon-swatch na-icon" style="display:none;">n/a</div>`;
            } else if (/^(https?:|file:|data:)/.test(iconRef) || iconRef.startsWith('/') || iconRef.startsWith('./') || iconRef.startsWith('../') || /\.(png|jpe?g|gif|svg)$/i.test(iconRef)) {
                iconDisplay = `<img src="${iconRef}" class="icon-swatch" alt="${iconRef}" title="${iconRef}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="icon-swatch na-icon" style="display:none;">n/a</div>`;
            } else {
                iconDisplay = `<div class="icon-swatch na-icon">n/a</div>`;
            }
        } else {
            iconDisplay = `<div class="icon-swatch na-icon">n/a</div>`;
        }

        const typeLi = document.createElement('li');
        const typeNode = document.createElement('div');
        typeNode.className = 'node type-entry';
        typeNode.draggable = true;
        typeNode.dataset.type = info.name;
        typeNode.dataset.domain = domainKey;
        const colorValue = (window.globalFunctions && typeof window.globalFunctions.normalizeColor === 'function')
            ? window.globalFunctions.normalizeColor(info.settings.color || '#000000')
            : (info.settings.color || '#000000');
        typeNode.innerHTML = `${[
            '<span class="twisty"></span>',
            `<span class="type-label">${info.name}</span>`,
            `<input type="color" class="color-input" data-type="${info.name}" value="${colorValue}">`,
            `<input type="number" class="size-input" data-type="${info.name}" value="${info.settings.size || 30}">`,
            `<select class="shape-select" data-type="${info.name}">${shapeOptions}</select>`,
            `<input type="text" class="icon-input" data-type="${info.name}" value="${info.settings.icon || ''}">`,
            `<button type="button" class="icon-file-button" data-type="${info.name}" title="Choose icon file" style="padding:2px 6px; font-size:11px;">📁</button>`,
            iconDisplay,
            `<button class="delete-type-btn" data-type="${info.name}" data-domain="${domainKey}">✖</button>`
        ].join('')}`;
        typeLi.appendChild(typeNode);
        return typeLi;
    },

    // Update edges table
    updateEdgesTable: function(searchTerm) {
        const tbody = document.getElementById('edgesTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        const graphData = window.DataManager.getGraphData();
        
        const searchLower = (searchTerm || '').toLowerCase();

        const normalizedEdges = graphData.edges.map(function(edge) {
            const data = edge && edge.data ? edge.data : {};
            const id = edge && edge.id != null ? edge.id : (data.id != null ? data.id : '');
            const source = edge && edge.source != null ? edge.source : (data.source != null ? data.source : '');
            const target = edge && edge.target != null ? edge.target : (data.target != null ? data.target : '');
            const type = edge && edge.type != null ? edge.type : (data.type != null ? data.type : '');
            const weightValue = edge && edge.weight != null ? edge.weight : (data.weight != null ? data.weight : undefined);
            const weight = (weightValue === undefined || weightValue === null || weightValue === '') ? 1 : weightValue;

            return {
                raw: edge,
                id: id,
                source: source,
                target: target,
                type: type,
                weight: weight
            };
        });

        const filteredEdges = normalizedEdges.filter(function(edge) {
            if (!searchLower) return true;

            return [edge.id, edge.source, edge.target, edge.type]
                .some(function(value) {
                    return value != null && value.toString().toLowerCase().includes(searchLower);
                });
        });

        filteredEdges.forEach(function(edge) {
            const typeClass = edge.type || 'default';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${edge.id}</td>
                <td class="clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${edge.source}')">${edge.source}</td>
                <td class="clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${edge.target}')">${edge.target}</td>
                <td><span class="edge-type-badge ${typeClass}">${typeClass}</span></td>
                <td>${edge.weight}</td>
                <td>→</td>
                <td>
                    <button class="toolbar-btn" onclick="window.globalFunctions.focusEdge('${edge.id}')">Focus</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    // Update relationships table
    updateRelationshipsTable: function(searchTerm, options = {}) {
        const tbody = document.getElementById('relationshipsTableBody');
        if (!tbody) return;

        const delta = options.delta;
        const relationshipResult = delta
            ? (window.DataManager.updateRelationshipsDelta(delta) || {})
            : { relationships: window.DataManager.calculateRelationships() };

        const relationships = Array.isArray(relationshipResult.relationships)
            ? relationshipResult.relationships
            : Array.isArray(relationshipResult)
                ? relationshipResult
                : [];
        const updatedPairs = new Set(relationshipResult.updatedPairs || []);
        const searchLower = searchTerm ? searchTerm.toLowerCase() : '';

        const filteredRelationships = relationships.filter(function(rel) {
            if (!searchLower) return true;
            return (rel.source && rel.source.toLowerCase().includes(searchLower)) ||
                   (rel.target && rel.target.toLowerCase().includes(searchLower)) ||
                   (rel.type && rel.type.toLowerCase().includes(searchLower));
        });

        const hasDelta = delta && (Array.isArray(delta.nodes) || Array.isArray(delta.edges));
        if (!hasDelta) {
            tbody.innerHTML = '';
            filteredRelationships.forEach(rel => {
                tbody.appendChild(this.buildRelationshipRow(rel));
            });
            return;
        }

        const filteredMap = new Map();
        filteredRelationships.forEach(rel => {
            const key = this.getRelationshipKey(rel);
            if (key) {
                filteredMap.set(key, rel);
            }
        });

        const existingRows = new Map();
        Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            if (row.dataset.relationshipKey) {
                existingRows.set(row.dataset.relationshipKey, row);
            }
        });

        existingRows.forEach((row, key) => {
            if (!filteredMap.has(key) || updatedPairs.has(key)) {
                row.remove();
            }
        });

        filteredMap.forEach((rel, key) => {
            if (!existingRows.has(key) || updatedPairs.has(key)) {
                tbody.appendChild(this.buildRelationshipRow(rel, key));
            }
        });
    },

    getRelationshipKey: function(rel) {
        if (!rel) return '';
        const sourceId = rel.sourceId || rel.source;
        const targetId = rel.targetId || rel.target;
        if (!sourceId || !targetId) return '';
        return sourceId < targetId ? `${sourceId}::${targetId}` : `${targetId}::${sourceId}`;
    },

    buildRelationshipRow: function(rel, key = null) {
        const row = document.createElement('tr');
        row.dataset.relationshipKey = key || this.getRelationshipKey(rel);
        row.innerHTML = `
            <td class="clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${rel.source}')">${rel.source}</td>
            <td class="relationship-cell clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${rel.target}')">${rel.target}</td>
            <td>${rel.type}</td>
            <td>${rel.weight}</td>
            <td>${rel.distance === Infinity ? 'No path' : rel.distance.toFixed(2)}</td>
            <td>
                <button class="toolbar-btn" onclick="window.globalFunctions.showPath('${rel.source}', '${rel.target}')">Path</button>
            </td>
        `;
        return row;
    },

    // Update table statistics
    updateTableStats: function() {
        const totalCountElement = document.getElementById('totalCount');
        const filteredCountElement = document.getElementById('filteredCount');
        
        if (!totalCountElement || !filteredCountElement) return;
        
        let total, filtered;
        
        switch (window.DataManager.currentTable) {
            case 'nodeTypes':
                total = window.DataManager.graphData.nodes.length;
                // For node types table, filtered count is the number of node types
                const nodeTypes = [...new Set(window.DataManager.graphData.nodes.map(node => {
                    return (node.data ? node.data.type : node.type) || 'default';
                }))];
                filtered = nodeTypes.length;
                break;
            case 'edges':
                total = window.DataManager.graphData.edges.length;
                filtered = window.DataManager.graphData.edges.length; // All edges shown by default
                break;
            case 'relationships':
                const relationships = window.DataManager.calculateRelationships();
                total = relationships.length;
                filtered = relationships.length; // All relationships shown by default
                break;
            default:
                total = filtered = 0;
        }
        
        totalCountElement.textContent = total;
        filteredCountElement.textContent = filtered;
    },

    // Update total data table (now delegates to specific table methods)
    updateTotalDataTable: function() {

        // Initialize current data table if not set
        if (!window.DataManager.currentDataTable) {
            window.DataManager.currentDataTable = 'nodes';
        }

        // Detect the active table based on the DOM so we always refresh the
        // content the user is currently viewing, even if state got out of sync.
        let activeTable = window.DataManager.currentDataTable;
        const totalDataView = document.getElementById('totalDataView');
        if (totalDataView) {
            const activeContent = totalDataView.querySelector('.table-content.active');
            if (activeContent) {
                if (activeContent.id === 'edgesDataTable') {
                    activeTable = 'edges';
                } else if (activeContent.id === 'nodesDataTable') {
                    activeTable = 'nodes';
                }
            }
        }
        window.DataManager.currentDataTable = activeTable;

        // Always rebuild both tables so switching tabs after a load does not
        // require a manual refresh, but only the active table updates the stats.
        this.updateNodesDataTable(activeTable === 'nodes');
        this.updateEdgesDataTable(activeTable === 'edges');
    },
    
    // Format icon display for table
    formatIconDisplay: function(icon) {
        if (!icon || icon.trim() === '') {
            return '<span style="color: #999;">Shape only</span>';
        }
        
        // Check if it's a URL
        if (icon.startsWith('http://') || icon.startsWith('https://')) {
            return `<span style="color: #2196F3;">📷 <a href="${icon}" target="_blank" style="color: #2196F3; text-decoration: none;">Image URL</a></span>`;
        }
        
        // Check if it's a built-in icon
        if (window.IconConfigs && window.IconConfigs[icon]) {
            return `<span style="color: #4CAF50;">🎨 Built-in: ${icon}</span>`;
        }
        
        // Unknown icon type
        return `<span style="color: #FF9800;">❓ Unknown: ${icon}</span>`;
    },

    // Update node type property and apply to all nodes of that type
    updateNodeTypeProperty: function(nodeType, property, value) {
        
        // Update the NodeTypes configuration
        if (!window.NodeTypes[nodeType]) {
            window.NodeTypes[nodeType] = {};
        }
        window.NodeTypes[nodeType][property] = value;

        // Also update domain-specific definitions if present
        if (window.DomainLoader) {
            if (window.DomainLoader.defaultNodeTypes && window.DomainLoader.defaultNodeTypes[nodeType]) {
                window.DomainLoader.defaultNodeTypes[nodeType][property] = value;
            }
            for (const key of window.DomainLoader.activeDomains) {
                const domain = window.DomainLoader.availableDomains[key];
                if (domain && domain.types && domain.types[nodeType]) {
                    domain.types[nodeType][property] = value;
                }
            }
        }
        
        // Apply changes to all nodes of this type in the graph
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const cy = window.GraphRenderer.cy;
            const nodesOfType = cy.nodes(`[type = "${nodeType}"]`);
            
            nodesOfType.forEach(node => {
                // Update node data
                node.data(property, value);
                
                // Handle icon changes - set background image data
                if (property === 'icon') {
                    let backgroundImageData = '';
                    if (value && window.IconConfigs && window.IconConfigs[value]) {
                        backgroundImageData = `url("${window.IconConfigs[value]}")`;
                    }
                    node.data('backgroundImage', backgroundImageData);
                }
                
                // No direct styling needed - function-based styles will read from data automatically
            });
            
            // Apply changes using the SAME method as the working node editor  
            if (window.GraphRenderer && window.GraphRenderer.cy) {
                nodesOfType.forEach(node => {
                    // Use node editor approach: set data AND apply style directly
                    if (property === 'shape') {
                        node.style('shape', value);
                    } else if (property === 'color') {
                        node.style('background-color', value);
                    } else if (property === 'size') {
                        node.style({
                            'width': value,
                            'height': value
                        });
                    } else if (property === 'icon') {
                        // Icon was already set as backgroundImage data, apply it
                        const backgroundImage = node.data('backgroundImage');
                        if (backgroundImage) {
                            
                            // Lighten background color for icon visibility
                            const originalColor = node.data('color');
                            const lighterColor = window.GraphRenderer.lightenColor(originalColor, 0.4); // 40% lighter (more subtle)
                            
                            node.style({
                                'background-color': lighterColor,  // Lighter background for icon visibility
                                'background-image': backgroundImage,
                                'background-fit': 'contain',  // Show full icon, don't crop
                                'background-repeat': 'no-repeat',
                                'background-position-x': '50%',
                                'background-position-y': '50%'
                            });
                        } else {
                            node.style('background-image', 'none');
                        }
                    }
                });
                
                window.GraphRenderer.cy.style().update();
            }
            
            // Show notification
            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification(`Updated ${nodesOfType.length} nodes of type ${nodeType}`, 'success');
            }
        }
        
        // Refresh the tables to show updated values and icons
        this.updateNodeTypesTable('', true);

        // Persist node type changes to file
        if (window.DomainLoader && typeof window.DomainLoader.saveNodeType === 'function') {
            let domainKey = 'default';
            for (const key in window.DomainLoader.availableDomains) {
                const domain = window.DomainLoader.availableDomains[key];
                if (domain && domain.types && domain.types[nodeType]) {
                    domainKey = key;
                    break;
                }
            }
            if (domainKey !== 'default') {
                window.DomainLoader.saveNodeType(domainKey, nodeType);
            }
        }
    },

    // Change node type for all nodes of a specific type
    changeNodeTypeForAll: function(oldType, newType) {
        if (!window.GraphRenderer || !window.GraphRenderer.cy) return;
        const cy = window.GraphRenderer.cy;
        const nodes = cy.nodes(`[type = "${oldType}"]`);
        
        // Get the new type settings with robust fallback
        let newTypeSettings = null;
        if (window.NodeTypes && window.NodeTypes[newType]) {
            newTypeSettings = window.NodeTypes[newType];
        } else if (window.NodeTypes && window.NodeTypes.default) {
            newTypeSettings = window.NodeTypes.default;
        } else {
            // Ultimate fallback if even default doesn't exist
            newTypeSettings = {
                color: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
                size: 30,
                shape: 'round-rectangle',
                icon: ''
            };
        }
        
        nodes.forEach(node => {
            // Update the node data
            node.data('type', newType);
            node.removeClass(oldType);
            node.addClass(newType);
            
            // Handle icon if available - set as data attribute for Cytoscape styling
            let backgroundImageData = '';
            if (newTypeSettings.icon && window.IconConfigs && window.IconConfigs[newTypeSettings.icon]) {
                backgroundImageData = `url("${window.IconConfigs[newTypeSettings.icon]}")`;
            }
            
            // Update node data properties - these will be read by function-based Cytoscape styles
            node.data('color', newTypeSettings.color);
            node.data('size', newTypeSettings.size);
            node.data('shape', newTypeSettings.shape);
            node.data('icon', newTypeSettings.icon || '');
            node.data('backgroundImage', backgroundImageData);
        });
        
        // Apply changes using the SAME method as the working node editor
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            nodes.forEach(node => {
                const shape = node.data('shape');
                const color = node.data('color');
                const size = node.data('size');
                const backgroundImage = node.data('backgroundImage');
                
                // Use node editor approach: set data AND apply style directly
                if (shape) {
                    node.style('shape', shape);
                }
                
                if (color) {
                    node.style('background-color', color);
                }
                
                if (size) {
                    node.style({
                        'width': size,
                        'height': size
                    });
                }
                
                if (backgroundImage) {
                    
                    // Lighten background color for icon visibility
                    const originalColor = node.data('color');
                    const lighterColor = window.GraphRenderer.lightenColor(originalColor, 0.4); // 40% lighter (more subtle)
                    
                    node.style({
                        'background-color': lighterColor,  // Lighter background for icon visibility
                        'background-image': backgroundImage,
                        'background-fit': 'contain',  // Show full icon, don't crop
                        'background-repeat': 'no-repeat',
                        'background-position-x': '50%',
                        'background-position-y': '50%'
                    });
                }
            });
            
            window.GraphRenderer.cy.style().update();
        }
        
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`Changed type '${oldType}' to '${newType}' for ${nodes.length} nodes.`, 'success');
        }
        
        // Refresh the tables
        this.updateNodeTypesTable('');
        this.updateTotalDataTable();
    },

    // Add new custom node type
    addNewNodeType: function(domainKey) {
        // Generate a temporary unique name for the new type
        const tempName = `new_type_${Date.now()}`;

        // Create new node type with default settings
        window.NodeTypes[tempName] = {
            color: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
            size: 30,
            shape: 'round-rectangle',
            icon: ''
        };

        // Attach to domain if provided
        if (window.DomainLoader) {
            const key = domainKey || 'default';
            if (!window.DomainLoader.availableDomains[key]) {
                const folder = key.replace(/_/g, '-');
                window.DomainLoader.availableDomains[key] = {
                    name: key,
                    description: '',
                    folder,
                    loaded: true,
                    types: {},
                };
            }
            if (!window.DomainLoader.activeDomains.has(key)) {
                window.DomainLoader.activeDomains.add(key);
            }
            // Persist the temporary type name directly since a cleaned name
            // is not yet available. Using the temporary name prevents
            // `cleanTypeName` reference errors when adding new node types.
            window.DomainLoader.availableDomains[key].types[tempName] = window.NodeTypes[tempName];
            if (key === 'default' && window.DomainLoader.defaultNodeTypes) {
                window.DomainLoader.defaultNodeTypes[tempName] = window.NodeTypes[tempName];
            } else if (typeof window.DomainLoader.saveNodeType === 'function') {
                window.DomainLoader.saveNodeType(key, tempName);
            }
        }

        // Refresh the type definitions table to show the new row
        this.updateNodeTypesTable('', true);

        // Convert the newly added type entry into an editable row
        this.beginEditTypeName(tempName);
    },

    // Convert the label of a newly added type into an editable input
    beginEditTypeName: function(tempName) {
        const typeNode = document.querySelector(`.type-entry[data-type="${tempName}"]`);
        if (!typeNode) return;

        const labelSpan = typeNode.querySelector('.type-label');
        if (!labelSpan) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Type name';
        input.className = 'type-name-input';
        input.dataset.type = tempName;
        input.style.width = '80px';
        labelSpan.replaceWith(input);
        input.focus();
    },

    // Finalize editing of a new type name
    saveNewTypeName: function(input) {
        const tempName = input.dataset.type;
        const newName = input.value.trim();
        const typeNode = input.closest('.type-entry');
        const domainKey = typeNode ? typeNode.dataset.domain : 'default';

        if (!newName) {
            // Remove the temporary type if no name provided
            delete window.NodeTypes[tempName];
            if (window.DomainLoader) {
                const domain = window.DomainLoader.availableDomains[domainKey];
                if (domain && domain.types) {
                    delete domain.types[tempName];
                }
                if (domainKey === 'default' && window.DomainLoader.defaultNodeTypes) {
                    delete window.DomainLoader.defaultNodeTypes[tempName];
                }
            }
            if (typeNode && typeNode.parentElement) {
                typeNode.parentElement.remove();
            }
        this.updateNodeTypesTable(document.getElementById('tableSearch') ? document.getElementById('tableSearch').value : '', true);
            return;
        }

        if (window.NodeTypes[newName]) {
            alert('Node type already exists!');
            input.focus();
        } else {
            // Rename the temporary key to the new name
            window.NodeTypes[newName] = window.NodeTypes[tempName];
            delete window.NodeTypes[tempName];

            if (window.DomainLoader) {
                const domain = window.DomainLoader.availableDomains[domainKey];
                if (domain && domain.types) {
                    domain.types[newName] = domain.types[tempName];
                    delete domain.types[tempName];
                }
                if (domainKey === 'default' && window.DomainLoader.defaultNodeTypes) {
                    window.DomainLoader.defaultNodeTypes[newName] = window.DomainLoader.defaultNodeTypes[tempName];
                    delete window.DomainLoader.defaultNodeTypes[tempName];
                } else if (domainKey !== 'default') {
                    if (typeof window.DomainLoader.saveNodeType === 'function') {
                        window.DomainLoader.saveNodeType(domainKey, newName);
                    }
                    if (typeof window.DomainLoader.deleteNodeTypeFile === 'function') {
                        window.DomainLoader.deleteNodeTypeFile(domainKey, tempName);
                    }
                }
            }

            // Update dataset references in the row
            if (typeNode) {
                typeNode.dataset.type = newName;
                ['color-input', 'size-input', 'shape-select', 'icon-input'].forEach(cls => {
                    const el = typeNode.querySelector(`.${cls}`);
                    if (el) el.dataset.type = newName;
                });

                const label = document.createElement('span');
                label.className = 'type-label';
                label.textContent = newName;
                input.replaceWith(label);
            }

            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification(`Added new node type: ${newName}`, 'success');
            }
        }
    },

    deleteNodeType: function(typeName, domainKey) {
        if (!typeName) return;
        delete window.NodeTypes[typeName];
        if (window.DomainLoader) {
            if (!domainKey) {
                for (const key in window.DomainLoader.availableDomains) {
                    const domain = window.DomainLoader.availableDomains[key];
                    if (domain && domain.types && domain.types[typeName]) {
                        domainKey = key;
                        break;
                    }
                }
            }
            if (domainKey) {
                const domain = window.DomainLoader.availableDomains[domainKey];
                if (domain && domain.types) {
                    delete domain.types[typeName];
                }
                if (domainKey === 'default' && window.DomainLoader.defaultNodeTypes) {
                    delete window.DomainLoader.defaultNodeTypes[typeName];
                } else if (domainKey !== 'default' && typeof window.DomainLoader.deleteNodeTypeFile === 'function') {
                    window.DomainLoader.deleteNodeTypeFile(domainKey, typeName);
                }
            }
        }
        this.updateNodeTypesTable('', true);
        if (window.UI && window.UI.showNotification) {
            window.UI.showNotification(`Deleted node type: ${typeName}`, 'success');
        }
    },

    deleteDomain: async function(domainKey) {
        if (!window.DomainLoader || domainKey === 'default') return;
        const domain = window.DomainLoader.availableDomains[domainKey];
        if (!domain) return;

        if (domain.types) {
            Object.keys(domain.types).forEach(type => {
                delete window.NodeTypes[type];
                if (window.DomainLoader.defaultNodeTypes) {
                    delete window.DomainLoader.defaultNodeTypes[type];
                }
            });
        }

        delete window.DomainLoader.availableDomains[domainKey];
        window.DomainLoader.activeDomains.delete(domainKey);

        let removedFromWorkspace = false;
        if (window.DomainLoader.deleteDomainFolder) {
            try {
                removedFromWorkspace = await window.DomainLoader.deleteDomainFolder(domainKey);
            } catch (err) {
                console.error('Failed to remove domain directory', err);
            }
        }

        if (typeof window.DomainLoader.initializeUI === 'function') {
            window.DomainLoader.initializeUI();
        } else if (window.DomainLoader.updateDomainStatus) {
            window.DomainLoader.updateDomainStatus();
        }

        this.updateNodeTypesTable('', true);

        if (window.UI && window.UI.showNotification) {
            const suffix = removedFromWorkspace ? '' : ' (workspace not connected; removed from current session)';
            window.UI.showNotification(`Deleted domain: ${domain.name}${suffix}`, 'success');
        }
    },

    addNewDomain: async function() {
        const domainName = prompt('Enter new domain name:');
        if (!domainName || domainName.trim() === '') {
            return;
        }
        const cleanName = domainName.trim();
        const key = cleanName.replace(/\s+/g, '_').toLowerCase();

        if (!window.DomainLoader) {
            window.DomainLoader = { availableDomains: {}, activeDomains: new Set(['default']) };
        }

        if (window.DomainLoader.availableDomains[key]) {
            alert('Domain already exists!');
            return;
        }

        const folder = key.replace(/_/g, '-');
        window.DomainLoader.availableDomains[key] = {
            name: cleanName,
            description: '',
            folder,
            loaded: true,
            types: {}
        };
        window.DomainLoader.activeDomains.add(key);

        let persisted = false;
        if (window.DomainLoader.createDomainFolder) {
            try {
                persisted = await window.DomainLoader.createDomainFolder(key);
            } catch (err) {
                console.error('Failed to persist domain directory', err);
            }
        }

        if (window.DomainLoader.updateDomainStatus) {
            window.DomainLoader.updateDomainStatus();
        }

        // Refresh table to show new domain
        this.updateNodeTypesTable('', true);

        if (window.UI && window.UI.showNotification) {
            const suffix = persisted ? '' : ' (local only until saved to a workspace)';
            window.UI.showNotification(`Added new domain: ${cleanName}${suffix}`, 'success');
        }
    },

    // Update nodes data table (new implementation for split data table)
    updateNodesDataTable: function(updateStats = true) {
        
        const totalDataSearchElement = document.getElementById('totalDataSearch');
        const searchTerm = totalDataSearchElement ? totalDataSearchElement.value.toLowerCase() : '';
        
        const tbody = document.getElementById('nodesDataTableBody');
        if (!tbody) {
            console.error('nodesDataTableBody not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        const graphData = window.DataManager.getGraphData();
        
        // Get all available node types for dropdown
        const allNodeTypes = [...new Set([
            ...Object.keys(window.NodeTypes || {}),
            ...graphData.nodes.map(node => {
                if (!node) return 'default';
                // Support both legacy (node.data.type) and modular (node.type)
                const data = node.data || node;
                return data.type || 'default';
            })
        ])].sort();

        // Filter nodes based on search term
        const filteredNodes = graphData.nodes.filter(function(node) {
            if (!node) {
                return false;
            }
            const data = node.data || node;
            return !searchTerm ||
                   (data.id && data.id.toLowerCase().includes(searchTerm)) ||
                   (data.label && data.label.toLowerCase().includes(searchTerm)) ||
                   (data.type && data.type.toLowerCase().includes(searchTerm));
        });

        filteredNodes.forEach(function(node) {
            const data = node.data || node;
            const nodeType = data.type || 'default';

            // Get type settings with robust fallback
            let typeSettings = {};
            if (window.NodeTypes && window.NodeTypes[nodeType]) {
                typeSettings = window.NodeTypes[nodeType];
            } else if (window.NodeTypes && window.NodeTypes.default) {
                typeSettings = window.NodeTypes.default;
            } else {
                // Ultimate fallback
                typeSettings = {
                    color: window.QuantickleConfig?.defaultNodeColor || '#ffffff',
                    size: 30,
                    shape: 'round-rectangle',
                    icon: ''
                };
            }

            // Create type dropdown options
            const typeOptions = allNodeTypes.map(type =>
                `<option value="${type}" ${type === nodeType ? 'selected' : ''}>${type}</option>`
            ).join('');

            const nodeColor = data.color || typeSettings.color || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
            const nodeSize = data.size || typeSettings.size || 30;
            const nodeShape = data.shape || typeSettings.shape || 'round-rectangle';
            const nodeOpacity = data.opacity != null ? data.opacity : 1;
            const nodeIcon = data.icon || '';
            const iconOpacity = data.iconOpacity != null ? data.iconOpacity : 1;
            const borderColor = data.borderColor || typeSettings.borderColor || '#000000';
            const nodeWeight = data.weight != null ? data.weight : (typeSettings.weight != null ? typeSettings.weight : 1);
            const showLabelChecked = data.labelVisible !== false ? 'checked' : '';
            const shapeOptions = window.TableManager.buildShapeOptions(nodeShape);

            const tableRow = document.createElement('tr');
            tableRow.innerHTML = `
                <td>
                    <input type="text" class="node-id-input"
                           value="${data.id}"
                           data-original-id="${data.id}"
                           style="width: 100px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;"
                           title="Edit node ID">
                </td>
                <td>
                    <select class="node-type-select"
                            data-node-id="${data.id}"
                            style="width: 100px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;"
                            title="Select node type">
                        ${typeOptions}
                    </select>
                </td>
                <td>
                    <input type="text" class="node-label-input"
                           value="${data.label || data.id}"
                           data-node-id="${data.id}"
                           style="width: 120px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;"
                           title="Edit node label">
                </td>
                <td>
                    <input type="datetime-local" class="node-timestamp-input"
                           value="${(() => { if (!data.timestamp) return ''; const d = new Date(data.timestamp); if (isNaN(d.getTime())) return ''; const off = d.getTimezoneOffset(); const local = new Date(d.getTime() - off * 60000); return local.toISOString().slice(0,16); })()}"
                           data-node-id="${data.id}"
                           style="width: 130px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;"
                           title="Edit node timestamp">
                </td>
                <td>
                    <div class="node-properties-row" style="display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow-x: auto;">
                        <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; margin: 0; color: #e5e5e5;">
                            <input type="checkbox" class="node-show-label" data-node-id="${data.id}" ${showLabelChecked} style="margin: 0; width: 14px; height: 14px;"> Label
                        </label>
                        <span style="font-size: 11px; color: #e0e0e0;">Color</span>
                        <input type="color" class="node-color-input" data-node-id="${data.id}" value="${nodeColor}" title="Node color" style="width: 26px; height: 24px; padding: 0; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="font-size: 11px; color: #e0e0e0;">Border</span>
                        <input type="color" class="node-border-color-input" data-node-id="${data.id}" value="${borderColor}" title="Border color" style="width: 26px; height: 24px; padding: 0; border: 1px solid #ccc; border-radius: 4px;">
                        <span style="font-size: 11px; color: #e0e0e0;">Shape</span>
                        <select class="node-shape-select" data-node-id="${data.id}" style="width: 64px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;">${shapeOptions}</select>
                        <span style="font-size: 11px; color: #e0e0e0;">Size</span>
                        <input type="number" class="node-size-input node-number-input" data-node-id="${data.id}" value="${nodeSize}" min="6" step="1" style="width: 4.5ch; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; text-align: right;" title="Node size">
                        <span style="font-size: 11px; color: #e0e0e0;">Icon</span>
                        <input type="text" class="node-icon-input" data-node-id="${data.id}" value="${nodeIcon}" style="width: 140px; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px;" title="Icon name or URL">
                        <button type="button" class="node-icon-picker" data-node-id="${data.id}" title="Choose icon file" style="padding: 2px 6px; font-size: 11px;">📁</button>
                        <span style="font-size: 11px; color: #e0e0e0;">Opacity</span>
                        <input type="number" class="node-opacity-input node-number-input" data-node-id="${data.id}" value="${nodeOpacity}" min="0" max="1" step="0.1" style="width: 3.5ch; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; text-align: right;" title="Node opacity">
                        <span style="font-size: 11px; color: #e0e0e0;">Icon α</span>
                        <input type="number" class="node-icon-opacity-input node-number-input" data-node-id="${data.id}" value="${iconOpacity}" min="0" max="1" step="0.1" style="width: 3.5ch; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; text-align: right;" title="Icon opacity">
                        <span style="font-size: 11px; color: #e0e0e0;">Weight</span>
                        <input type="number" class="node-weight-input node-number-input" data-node-id="${data.id}" value="${nodeWeight}" step="0.1" style="width: 4ch; padding: 2px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; text-align: right;" title="Node weight">
                    </div>
                </td>
                <td>
                    <button class="toolbar-btn" onclick="window.globalFunctions.focusNode('${data.id}')">Focus</button>
                </td>
            `;
            tbody.appendChild(tableRow);

            // Add event listeners for the editable fields
            const idInput = tableRow.querySelector('.node-id-input');
            const typeSelect = tableRow.querySelector('.node-type-select');
            const labelInput = tableRow.querySelector('.node-label-input');
            const timestampInput = tableRow.querySelector('.node-timestamp-input');
            const showLabelToggle = tableRow.querySelector('.node-show-label');
            const colorInput = tableRow.querySelector('.node-color-input');
            const borderColorInput = tableRow.querySelector('.node-border-color-input');
            const shapeSelect = tableRow.querySelector('.node-shape-select');
            const sizeInput = tableRow.querySelector('.node-size-input');
            const iconInput = tableRow.querySelector('.node-icon-input');
            const iconPicker = tableRow.querySelector('.node-icon-picker');
            const opacityInput = tableRow.querySelector('.node-opacity-input');
            const iconOpacityInput = tableRow.querySelector('.node-icon-opacity-input');
            const weightInput = tableRow.querySelector('.node-weight-input');

            idInput.addEventListener('change', function() {
                window.TableManager.updateNodeId(this.getAttribute('data-original-id'), this.value.trim());
            });

            typeSelect.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'type', this.value);
            });

            labelInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'label', this.value);
            });

            timestampInput.addEventListener('change', function() {
                const isoValue = this.value ? new Date(this.value).toISOString() : '';
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'timestamp', isoValue);
            });

            showLabelToggle.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'labelVisible', this.checked);
            });

            colorInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'color', this.value);
            });

            borderColorInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'borderColor', this.value);
            });

            shapeSelect.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'shape', this.value);
            });

            sizeInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'size', this.value);
            });

            iconInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'icon', this.value);
            });

            if (iconPicker && window.QuantickleUtils?.pickImageFilePath) {
                iconPicker.addEventListener('click', async () => {
                    const path = await window.QuantickleUtils.pickImageFilePath({ workspaceSubdir: 'assets' });
                    if (!path) {
                        return;
                    }
                    iconInput.value = path;
                    iconInput.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }

            opacityInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'opacity', this.value);
            });

            iconOpacityInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'iconOpacity', this.value);
            });

            weightInput.addEventListener('change', function() {
                window.TableManager.updateNodeProperty(this.getAttribute('data-node-id'), 'weight', this.value);
            });
        });
        
        // Update stats for the active table only
        if (updateStats) {
            const totalCountElement = document.getElementById('totalDataCount');
            const filteredCountElement = document.getElementById('totalFilteredCount');

            if (totalCountElement && filteredCountElement) {
                totalCountElement.textContent = graphData.nodes.length;
                filteredCountElement.textContent = filteredNodes.length;
            }
        }
    },

    // Update edges data table (new implementation for split data table)
    updateEdgesDataTable: function(updateStats = true) {
        
        const totalDataSearchElement = document.getElementById('totalDataSearch');
        const searchTerm = totalDataSearchElement ? totalDataSearchElement.value.toLowerCase() : '';
        
        const tbody = document.getElementById('edgesDataTableBody');
        if (!tbody) {
            console.error('edgesDataTableBody not found');
            return;
        }
        
        tbody.innerHTML = '';
        
        const graphData = window.DataManager.getGraphData();
        
        // Filter edges based on search term
        const filteredEdges = graphData.edges.filter(function(edge) {
            const data = edge.data || edge;
            return !searchTerm ||
                   (data.id && data.id.toLowerCase().includes(searchTerm)) ||
                   (data.source && data.source.toLowerCase().includes(searchTerm)) ||
                   (data.target && data.target.toLowerCase().includes(searchTerm));
        });

        filteredEdges.forEach(function(edge) {
            const data = edge.data || edge;
            const tableRow = document.createElement('tr');
            tableRow.innerHTML = `
                <td>
                    <span style="display: inline-block; max-width: 8ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${data.id}"><strong>${data.id}</strong></span>
                </td>
                <td class="clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${data.source}')" style="max-width: 9ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${data.source}">${data.source}</td>
                <td class="clickable-cell" onclick="window.globalFunctions.selectNodeInGraph('${data.target}')" style="max-width: 9ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${data.target}">${data.target}</td>
                <td>
                    <input type="text" class="edge-label-input" data-edge-id="${data.id}" value="${(data.label || '').replace(/"/g, '&quot;')}" style="width: 40ch; max-width: 100%; padding: 2px; font-size: 12px;">
                </td>
                <td>
                    <input type="color" class="edge-color-input" data-edge-id="${data.id}" value="${window.globalFunctions?.normalizeColor ? window.globalFunctions.normalizeColor(data.color || '#cccccc') : (data.color || '#cccccc')}" title="Edge color" style="width: 36px; height: 24px; padding: 0;">
                </td>
                <td>
                    <input type="number" class="edge-width-input edge-number-input" data-edge-id="${data.id}" value="${data.width || 2}" min="0" step="0.5" style="width: 6ch; padding: 2px; font-size: 12px; text-align: right;" title="Edge thickness">
                </td>
                <td>
                    <select class="edge-style-select" data-edge-id="${data.id}" style="padding: 2px; font-size: 12px;">
                        <option value="solid" ${data.lineStyle === 'solid' ? 'selected' : ''}>Solid</option>
                        <option value="dotted" ${data.lineStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                        <option value="dashed" ${data.lineStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                    </select>
                </td>
                <td>
                    <select class="edge-shape-select" data-edge-id="${data.id}" style="padding: 2px; font-size: 12px;">
                        <option value="bezier" ${data.curveStyle === 'bezier' || !data.curveStyle ? 'selected' : ''}>Curved</option>
                        <option value="straight" ${data.curveStyle === 'straight' ? 'selected' : ''}>Straight</option>
                        <option value="unbundled-bezier" ${data.curveStyle === 'unbundled-bezier' ? 'selected' : ''}>Bundled</option>
                    </select>
                </td>
                <td>${data.weight || 1}</td>
                <td>
                    <button class="toolbar-btn" onclick="window.globalFunctions.focusEdge('${data.id}')">Focus</button>
                </td>
            `;
            tbody.appendChild(tableRow);

            const labelInput = tableRow.querySelector('.edge-label-input');
            const colorInput = tableRow.querySelector('.edge-color-input');
            const widthInput = tableRow.querySelector('.edge-width-input');
            const styleSelect = tableRow.querySelector('.edge-style-select');
            const shapeSelect = tableRow.querySelector('.edge-shape-select');

            if (labelInput) {
                labelInput.addEventListener('change', function() {
                    window.TableManager.updateEdgeProperty(this.getAttribute('data-edge-id'), 'label', this.value);
                });
            }

            if (colorInput) {
                colorInput.addEventListener('change', function() {
                    window.TableManager.updateEdgeProperty(this.getAttribute('data-edge-id'), 'color', this.value);
                });
            }

            if (widthInput) {
                widthInput.addEventListener('change', function() {
                    window.TableManager.updateEdgeProperty(this.getAttribute('data-edge-id'), 'width', this.value);
                });
            }

            if (styleSelect) {
                styleSelect.addEventListener('change', function() {
                    window.TableManager.updateEdgeProperty(this.getAttribute('data-edge-id'), 'lineStyle', this.value);
                });
            }

            if (shapeSelect) {
                shapeSelect.addEventListener('change', function() {
                    window.TableManager.updateEdgeProperty(this.getAttribute('data-edge-id'), 'curveStyle', this.value);
                });
            }
        });
        
        // Update stats for the active table only
        if (updateStats) {
            const totalCountElement = document.getElementById('totalDataCount');
            const filteredCountElement = document.getElementById('totalFilteredCount');

            if (totalCountElement && filteredCountElement) {
                totalCountElement.textContent = graphData.edges.length;
                filteredCountElement.textContent = filteredEdges.length;
            }
        }
    },

    updateNodeId: function(oldId, newId) {
        if (!newId || oldId === newId) return;
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const cy = window.GraphRenderer.cy;
            if (cy.getElementById(newId).length > 0) {
                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification(`Node ID "${newId}" already exists`, 'error');
                }
                this.updateNodesDataTable();
                return;
            }
            const node = cy.getElementById(oldId);
            if (!node || node.empty()) return;
            const position = node.position();
            const data = { ...node.data(), id: newId };
            const edges = node.connectedEdges().map(edge => {
                const ed = { ...edge.data() };
                if (ed.source === oldId) ed.source = newId;
                if (ed.target === oldId) ed.target = newId;
                ed.id = `${ed.source}-${ed.target}`;
                return ed;
            });
            node.remove();
            cy.add({ group: 'nodes', data, position });
            edges.forEach(ed => cy.add({ group: 'edges', data: ed }));

            if (window.DataManager && typeof window.DataManager.getGraphData === 'function' && typeof window.DataManager.setGraphData === 'function') {
                const graphData = window.DataManager.getGraphData();
                const nodes = graphData.nodes.map(n => {
                    const nd = n.data || n;
                    if (nd.id === oldId) {
                        return { ...n, data: { ...nd, id: newId } };
                    }
                    return n;
                });
                const edgesData = graphData.edges.map(e => {
                    const ed = e.data || e;
                    const newEdge = { ...e, data: { ...ed } };
                    if (newEdge.data.source === oldId) newEdge.data.source = newId;
                    if (newEdge.data.target === oldId) newEdge.data.target = newId;
                    newEdge.data.id = `${newEdge.data.source}-${newEdge.data.target}`;
                    return newEdge;
                });
                window.DataManager.setGraphData({ nodes, edges: edgesData }, { skipLayout: true });
            }

            if (window.UI && window.UI.showNotification) {
                window.UI.showNotification(`Node ID updated to ${newId}`, 'success');
            }
        }
        this.updateNodesDataTable();
    },

    // Update node property and apply to graph
    updateNodeProperty: function(nodeId, property, value) {

        const numericProperties = new Set(['size', 'opacity', 'iconOpacity', 'weight']);
        let sanitizedValue = value;

        if (property === 'labelVisible') {
            sanitizedValue = !!value;
        } else if (numericProperties.has(property)) {
            const parsed = parseFloat(value);
            const normalizedNumber = Number.isFinite(parsed) ? parsed : 0;
            if (property === 'opacity' || property === 'iconOpacity') {
                sanitizedValue = Math.min(1, Math.max(0, normalizedNumber));
            } else if (property === 'size') {
                sanitizedValue = Math.max(0, normalizedNumber);
            } else {
                sanitizedValue = normalizedNumber;
            }
        } else if (typeof value === 'string') {
            sanitizedValue = value.trim();
        }

        if (property === 'type') {
            if (typeof sanitizedValue !== 'string' || sanitizedValue.trim() === '') {
                sanitizedValue = 'default';
            } else {
                sanitizedValue = sanitizedValue.trim();
            }
        }

        const stringProperties = new Set(['label', 'color', 'shape', 'icon', 'borderColor']);
        if (stringProperties.has(property) && (sanitizedValue === null || sanitizedValue === undefined)) {
            sanitizedValue = '';
        }

        const updateNodeCollection = nodes => {
            if (!Array.isArray(nodes) || nodes.length === 0) {
                return null;
            }

            let hasChanges = false;
            const updatedNodes = nodes.map(node => {
                if (!node) {
                    return node;
                }

                const isLegacyFormat = node.data && typeof node.data === 'object';
                const nodeData = isLegacyFormat ? { ...node.data } : { ...node };

                if (nodeData.id !== nodeId) {
                    return node;
                }

                hasChanges = true;
                nodeData[property] = sanitizedValue;

                if (property === 'type') {
                    const typeSettings = this.resolveTypeSettings(sanitizedValue);

                    if (typeSettings.color) {
                        nodeData.color = typeSettings.color;
                    }
                    if (typeSettings.shape) {
                        nodeData.shape = typeSettings.shape;
                    }
                    if (typeSettings.size != null) {
                        nodeData.size = typeSettings.size;
                    }
                    if (typeSettings.opacity != null) {
                        nodeData.opacity = typeSettings.opacity;
                    }
                    if (typeSettings.iconOpacity != null) {
                        nodeData.iconOpacity = typeSettings.iconOpacity;
                    }
                    if (typeSettings.borderColor) {
                        nodeData.borderColor = typeSettings.borderColor;
                    }
                    if (typeSettings.weight != null) {
                        nodeData.weight = typeSettings.weight;
                    }
                    if (typeSettings.icon !== undefined) {
                        nodeData.icon = typeSettings.icon;
                        const normalizedIcon = this.normalizeIconBackground(typeSettings.icon);
                        if (normalizedIcon && normalizedIcon !== 'none') {
                            nodeData.backgroundImage = normalizedIcon;
                        } else {
                            nodeData.backgroundImage = 'none';
                        }
                    }
                }

                if (property === 'icon') {
                    const background = window.TableManager.normalizeIconBackground(sanitizedValue);
                    if (background && background !== 'none') {
                        nodeData.backgroundImage = background;
                    } else {
                        nodeData.backgroundImage = 'none';
                    }
                }

                if (isLegacyFormat) {
                    return { ...node, data: nodeData };
                }

                return { ...node, ...nodeData };
            });

            return hasChanges ? updatedNodes : null;
        };

        const syncStoredGraphData = () => {
            try {
                if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
                    const graphData = window.DataManager.getGraphData();
                    const updatedNodes = updateNodeCollection(graphData.nodes || []);

                    if (updatedNodes) {
                        const updatedGraphData = { ...graphData, nodes: updatedNodes };
                        if (typeof window.DataManager.setGraphData === 'function') {
                            window.DataManager.setGraphData(updatedGraphData, { skipLayout: true });
                        } else {
                            graphData.nodes = updatedNodes;
                        }
                    }
                }

                if (window.GraphManager && window.GraphManager.currentGraph) {
                    const graph = window.GraphManager.currentGraph;
                    const updatedNodes = updateNodeCollection(graph.nodes || []);
                    if (updatedNodes) {
                        graph.nodes = updatedNodes;
                    }
                }
            } catch (error) {
                console.error('Failed to synchronize node property update', error);
            }
        };

        // Update the node in the graph
        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const cy = window.GraphRenderer.cy;
            const cyNode = cy.getElementById(nodeId);

            if (cyNode.length > 0) {
                const oldValue = cyNode.data(property);
                cyNode.data(property, sanitizedValue);

                // Apply visual changes for type changes
                if (property === 'type') {
                    // Remove old type class and add new type class
                    if (oldValue) {
                        cyNode.removeClass(oldValue);
                    }
                    if (sanitizedValue) {
                        cyNode.addClass(sanitizedValue);
                    }

                    const typeSettings = this.resolveTypeSettings(sanitizedValue);

                    if (typeSettings.color) {
                        cyNode.data('color', typeSettings.color);
                    }
                    if (typeSettings.shape) {
                        cyNode.data('shape', typeSettings.shape);
                    }
                    if (typeSettings.size != null) {
                        cyNode.data('size', typeSettings.size);
                    }
                    if (typeSettings.opacity != null) {
                        cyNode.data('opacity', typeSettings.opacity);
                    }
                    if (typeSettings.iconOpacity != null) {
                        cyNode.data('iconOpacity', typeSettings.iconOpacity);
                    }
                    if (typeSettings.borderColor) {
                        cyNode.data('borderColor', typeSettings.borderColor);
                    }
                    if (typeSettings.weight != null) {
                        cyNode.data('weight', typeSettings.weight);
                    }
                    if (typeSettings.icon !== undefined) {
                        const normalizedIcon = this.normalizeIconBackground(typeSettings.icon);
                        cyNode.data('icon', typeSettings.icon);
                        cyNode.data('backgroundImage', normalizedIcon || 'none');
                        if (!normalizedIcon || normalizedIcon === 'none') {
                            cyNode.style('background-image', 'none');
                        }
                    }

                    this.applyNodeEditorStyles(cyNode);
                }

                if (property === 'color') {
                    const colorToApply = sanitizedValue || cyNode.data('color') || (window.QuantickleConfig?.defaultNodeColor || '#ffffff');
                    cyNode.data('color', colorToApply);
                    cyNode.style('background-color', colorToApply);
                }

                if (property === 'shape') {
                    const shapeToApply = sanitizedValue || 'round-rectangle';
                    cyNode.data('shape', shapeToApply);
                    cyNode.style('shape', shapeToApply);
                }

                if (property === 'size') {
                    cyNode.style({
                        'width': sanitizedValue,
                        'height': sanitizedValue
                    });
                }

                if (property === 'opacity') {
                    const opacityToApply = Number.isFinite(sanitizedValue) ? sanitizedValue : (cyNode.data('opacity') ?? 1);
                    cyNode.data('opacity', opacityToApply);
                    cyNode.style('opacity', opacityToApply);
                }

                if (property === 'iconOpacity') {
                    const iconOpacityToApply = Number.isFinite(sanitizedValue) ? sanitizedValue : (cyNode.data('iconOpacity') ?? 1);
                    cyNode.data('iconOpacity', iconOpacityToApply);
                    cyNode.style('background-opacity', iconOpacityToApply);
                }

                if (property === 'borderColor') {
                    const borderColor = sanitizedValue || cyNode.data('borderColor');
                    if (borderColor) {
                        cyNode.data('borderColor', borderColor);
                        cyNode.style('border-color', borderColor);
                    }
                }

                if (property === 'labelVisible') {
                    cyNode.style('text-opacity', sanitizedValue !== false ? 1 : 0);
                }

                if (property === 'icon') {
                    const backgroundImage = this.normalizeIconBackground(sanitizedValue);
                    cyNode.data('backgroundImage', backgroundImage || 'none');
                    if (!backgroundImage || backgroundImage === 'none') {
                        cyNode.style('background-image', 'none');
                    }
                }

                if (property === 'label') {
                    cyNode.style('label', sanitizedValue || '');
                }

                // Show notification
                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification(`Updated ${property} for node ${nodeId}`, 'success');
                }

                // Refresh tables if type changed
                if (property === 'type') {
                    this.updateNodeTypesTable('');
                }

                if (['color', 'shape', 'size', 'opacity', 'iconOpacity', 'borderColor', 'labelVisible', 'icon', 'label'].includes(property)) {
                    this.applyNodeEditorStyles(cyNode);
                }

                syncStoredGraphData();
                this.updateNodesDataTable();
            } else {
            console.error(`Node ${nodeId} not found in graph`);
        }
    } else {
        syncStoredGraphData();
        this.updateNodesDataTable();
    }
    },

    updateEdgeProperty: function(edgeId, property, value) {

        const numericProperties = new Set(['width', 'arrowSize', 'weight']);
        let sanitizedValue = value;

        if (numericProperties.has(property)) {
            const parsed = parseFloat(value);
            const normalizedNumber = Number.isFinite(parsed) ? parsed : 0;
            sanitizedValue = property === 'width' ? Math.max(0, normalizedNumber) : normalizedNumber;
        } else if (typeof value === 'string') {
            sanitizedValue = value.trim();
        }

        const updateEdgeCollection = edges => {
            if (!Array.isArray(edges) || edges.length === 0) {
                return null;
            }

            let hasChanges = false;
            const updatedEdges = edges.map(edge => {
                if (!edge) {
                    return edge;
                }

                const isLegacyFormat = edge.data && typeof edge.data === 'object';
                const edgeData = isLegacyFormat ? { ...edge.data } : { ...edge };

                if (edgeData.id !== edgeId) {
                    return edge;
                }

                hasChanges = true;
                edgeData[property] = sanitizedValue;

                return isLegacyFormat ? { ...edge, data: edgeData } : { ...edgeData };
            });

            return hasChanges ? updatedEdges : null;
        };

        const syncStoredGraphData = () => {
            try {
                if (window.DataManager && typeof window.DataManager.getGraphData === 'function') {
                    const graphData = window.DataManager.getGraphData();
                    const updatedEdges = updateEdgeCollection(graphData.edges || []);

                    if (updatedEdges) {
                        const updatedGraphData = { ...graphData, edges: updatedEdges };
                        if (typeof window.DataManager.setGraphData === 'function') {
                            window.DataManager.setGraphData(updatedGraphData, { skipLayout: true });
                        } else {
                            graphData.edges = updatedEdges;
                        }
                    }
                }

                if (window.GraphManager && window.GraphManager.currentGraph) {
                    const graph = window.GraphManager.currentGraph;
                    const updatedEdges = updateEdgeCollection(graph.edges || []);
                    if (updatedEdges) {
                        graph.edges = updatedEdges;
                    }
                }
            } catch (error) {
                console.error('Failed to synchronize edge property update', error);
            }
        };

        const applyCyUpdates = cyEdge => {
            cyEdge.data(property, sanitizedValue);

            if (property === 'label') {
                cyEdge.style('label', sanitizedValue);
            }

            if (property === 'color') {
                const fallbackColor = sanitizedValue || (window.QuantickleConfig?.defaultEdgeColor || '#cccccc');
                cyEdge.style({
                    'line-color': fallbackColor,
                    'target-arrow-color': fallbackColor
                });
            }

            if (property === 'width') {
                cyEdge.style('width', sanitizedValue);
            }

            if (property === 'lineStyle') {
                cyEdge.style('line-style', sanitizedValue || 'solid');
            }

            if (property === 'curveStyle') {
                cyEdge.style('curve-style', sanitizedValue || 'bezier');
            }
        };

        if (window.GraphRenderer && window.GraphRenderer.cy) {
            const cy = window.GraphRenderer.cy;
            const cyEdge = cy.getElementById(edgeId);

            if (cyEdge && cyEdge.length > 0) {
                applyCyUpdates(cyEdge);

                syncStoredGraphData();
                this.updateEdgesDataTable();

                if (window.UI && window.UI.showNotification) {
                    window.UI.showNotification(`Updated ${property} for edge ${edgeId}`, 'success');
                }
            } else {
                console.error(`Edge ${edgeId} not found in graph`);
                syncStoredGraphData();
                this.updateEdgesDataTable();
            }
        } else {
            syncStoredGraphData();
            this.updateEdgesDataTable();
        }
    }
};
