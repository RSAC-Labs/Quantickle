/**
 * Node Editor Module
 * 
 * Handles node attribute editing and temporal visualization features.
 * Self-contained module with clean external interfaces.
 * 
 * DEPENDENCIES:
 * - Cytoscape instance (passed via constructor)
 * - UI notification system (passed via constructor)
 * - Keyboard manager (passed via constructor)
 * 
 * PROVIDES:
 * - showEditor(node) - opens editor for a node
 * - hideEditor() - closes the editor
 * - updateNode(nodeData) - programmatically updates a node
 * 
 * FEATURES:
 * - Node property editing (label, color, size, type, etc.)
 * - Temporal visualization settings
 * - Bulk node updates
 * - Keyboard shortcut handling
 * - Modal UI management
 */

function normalizeColorInput(value, fallback = '#000000') {
    const fallbackValue = typeof fallback === 'string' && fallback.trim()
        ? fallback.trim()
        : '#000000';

    if (typeof value !== 'string') {
        return fallbackValue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallbackValue;
    }

    const globalNormalizer = (typeof window !== 'undefined'
        && window.globalFunctions
        && typeof window.globalFunctions.normalizeColor === 'function')
        ? window.globalFunctions.normalizeColor
        : null;

    if (globalNormalizer) {
        try {
            return globalNormalizer(trimmed);
        } catch (error) {
            console.warn('Failed to normalize color via globalFunctions.normalizeColor', error);
        }
    }

    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4) {
            return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
        }
        if (trimmed.length >= 7) {
            return trimmed.slice(0, 7).toLowerCase();
        }
        return fallbackValue;
    }

    const rgbMatch = trimmed.match(/rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (rgbMatch) {
        const clamp = (num) => {
            const parsed = parseInt(num, 10);
            if (Number.isNaN(parsed)) {
                return 0;
            }
            return Math.min(255, Math.max(0, parsed));
        };
        const r = clamp(rgbMatch[1]).toString(16).padStart(2, '0');
        const g = clamp(rgbMatch[2]).toString(16).padStart(2, '0');
        const b = clamp(rgbMatch[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    return fallbackValue;
}

if (typeof window !== 'undefined' && !window.normalizeColorInput) {
    window.normalizeColorInput = normalizeColorInput;
}

function resolveBackgroundFitValue(value, fallback = 'contain') {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return fallback;
}

function resolveBackgroundPositionValue(value, fallback = '50%') {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return fallback;
}

function resolveBackgroundFitForData(data) {
    if (!data) {
        return 'contain';
    }
    const directValue = resolveBackgroundFitValue(data.backgroundFit, '');
    if (directValue) {
        return directValue;
    }
    const type = data.type;
    const typeSettings = (window.NodeTypes && type && window.NodeTypes[type]) || null;
    const defaultSettings = window.NodeTypes && window.NodeTypes.default ? window.NodeTypes.default : null;
    const typeFit = resolveBackgroundFitValue(typeSettings?.backgroundFit, '');
    const defaultFit = resolveBackgroundFitValue(defaultSettings?.backgroundFit, 'contain');
    return typeFit || defaultFit || 'contain';
}

class NodeEditorModule {
    constructor(dependencies) {
        // Required dependencies injected via constructor
        this.cy = dependencies.cytoscape;
        this.notifications = dependencies.notifications;
        this.keyboardManager = dependencies.keyboardManager;
        this.supportsShadowStyles = typeof dependencies.supportsShadowStyles === 'boolean'
            ? dependencies.supportsShadowStyles
            : ((typeof window !== 'undefined'
                && window.GraphRenderer
                && typeof window.GraphRenderer.supportsShadowStyles === 'boolean'
                    ? window.GraphRenderer.supportsShadowStyles
                    : true));
        
        // Internal state
        this.selectedNode = null;
        this.selectedNodes = null;
        this.isVisible = false;
        this.isBulkEdit = false;
        this.pendingTextConversion = null;
        this.originalTimestamp = null; // Store original timestamp to detect changes
        this.timestampChanged = false;

        // DOM references
        this.modal = null;
        this.bulkModal = null;
        this.modalOverlay = null;
        this.textModal = null;
        
        // Configuration
        this.config = {
            modalId: 'node-editor-modal',
            overlayId: 'node-editor-modal-overlay',
            stylesId: 'node-editor-styles'
        };
        
        // Temporal settings
        this.temporalSettings = {
            enabled: false,
            timeField: 'timestamp',
            timeRange: { min: 0, max: 100 },
            colorGradient: { start: '#ff0000', end: '#00ff00' },
            positionSkew: { enabled: false, direction: 'horizontal' },
            opacityGradient: { start: 0.3, end: 1.0 }
        };
        
        // Initialize the module
        this.init();
    }
    
    /**
     * Initialize the node editor module
     */
    init() {
        this.addStyles();
        this.createNodeEditorUI();
        this.createBulkEditorUI();
        this.createTextNodeEditorUI();
        this.setupEventListeners();
        this.loadTemporalSettings();
    }
    
    /**
     * PUBLIC INTERFACE: Show editor for a specific node
     * @param {Object} node - Cytoscape node object
     */
    showEditor(node = null) {
        // Determine which node to edit
        this.isBulkEdit = false;
        if (!node && this.cy) {
            const selectedNodes = this.cy.nodes(':selected');
            if (selectedNodes.length === 1) {
                node = selectedNodes[0];
            } else if (selectedNodes.length > 1) {
                if (selectedNodes.some(n => n.data('type') === 'text')) {
                    this.notifications.show('Cannot bulk edit text nodes', 'warning');
                    return;
                }
                this.selectedNodes = selectedNodes;
                node = selectedNodes[0];
                this.selectedNode = node;
                this.isBulkEdit = true;
            } else {
                this.notifications.show('Please select a node to edit', 'warning');
                return;
            }
        }

        if (!node) return;

        if (node.data('type') === 'text') {
            this.showTextNodeEditor(node);
            return;
        }

        this.selectedNode = node;
        this.isVisible = true;

        // Store original timestamp to detect changes
        this.originalTimestamp = this.getNodeTimestamp(node) || '';
        this.timestampChanged = false;

        // Disable keyboard shortcuts that might interfere
        this.keyboardManager.disable();

        // Show the appropriate modal
        const modalToShow = this.isBulkEdit ? this.bulkModal : this.modal;
        if (modalToShow) {
            this.populateEditor();
            modalToShow.style.display = 'block';
            this.modalOverlay.style.display = 'block';

            // Focus first input
            const firstInput = modalToShow.querySelector('input[type="text"]');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }
    
    /**
     * PUBLIC INTERFACE: Hide the editor
     */
    hideEditor() {

        const nodeToFit = this.selectedNode;
        const wasBulkEdit = this.isBulkEdit;

        const layoutNameForNode = this.getLayoutNameForNode(nodeToFit);
        const isTimeLayoutActive = this.isTimeBasedLayout(layoutNameForNode);
        const scopeContainer = nodeToFit ? this.getTimelineContainerForNode(nodeToFit) : null;
        const scopeId = scopeContainer && typeof scopeContainer.id === 'function'
            ? scopeContainer.id()
            : null;
        const timelineLayoutApplied = nodeToFit
            ? this.isTimelineLayoutAppliedForScope(scopeId)
            : false;
        const isTimeLayoutActiveForNode = isTimeLayoutActive && timelineLayoutApplied;
        const hasTimestampChanged = this.timestampChanged
            || this.hasTimestampChangedSinceOpen(nodeToFit);
        const shouldReapplyFullLayout = hasTimestampChanged && isTimeLayoutActiveForNode;
        const shouldFitToTimeline = !shouldReapplyFullLayout && isTimeLayoutActiveForNode
            && this.shouldApplyTimeLayoutOnClose(nodeToFit, wasBulkEdit);

        if (this.modal) {
            this.modal.style.display = 'none';
        }
        if (this.bulkModal) {
            this.bulkModal.style.display = 'none';
        }
        if (this.textModal) {
            this.textModal.style.display = 'none';
        }
        if (this.modalOverlay) {
            this.modalOverlay.style.display = 'none';
        }

        this.isVisible = false;
        this.isBulkEdit = false;
        this.selectedNode = null;
        this.selectedNodes = null;
        this.pendingTextConversion = null;
        this.originalTimestamp = null; // Reset original timestamp
        this.timestampChanged = false;

        // Re-enable keyboard shortcuts
        this.keyboardManager.enable();

        if (shouldReapplyFullLayout) {
            const targetLayout = isTimeLayoutActive ? layoutNameForNode : 'timeline';
            const reapplyOptions = scopeContainer ? { container: scopeContainer } : {};
            this.reapplyTimeBasedLayout(targetLayout, reapplyOptions);
        } else if (shouldFitToTimeline) {
            // Always try to fit node (updates timeline connectors)
            const didFit = this.fitNodeIntoTimeLayout(nodeToFit);

            // Fall back to a full reapply only when the targeted fit fails and a timestamp changed.
            if (!didFit && hasTimestampChanged) {
                const reapplyOptions = scopeContainer ? { container: scopeContainer } : {};
                this.reapplyTimeBasedLayout(layoutNameForNode, reapplyOptions);
            }
        }

        this.maybeRestoreTimelineScaffolding();
    }

    showTextNodeEditor(node, conversion = null) {
        if (!this.textModal) {
            this.createTextNodeEditorUI();
        }

        this.selectedNode = node;
        this.isVisible = true;
        this.originalTimestamp = this.getNodeTimestamp(node) || '';
        this.timestampChanged = false;
        this.keyboardManager.disable();

        if (this.modal) {
            this.modal.style.display = 'none';
        }
        if (this.bulkModal) {
            this.bulkModal.style.display = 'none';
        }

        if (this.textModal) {
            const titleField = document.getElementById('text-node-title');
            const bodyField = document.getElementById('text-node-body');
            const widthField = document.getElementById('text-node-width');
            const heightField = document.getElementById('text-node-height');
            const ratioField = document.getElementById('text-node-preserve-ratio');
            const backgroundColorField = document.getElementById('text-node-background-color');
            const fontColorField = document.getElementById('text-node-font-color');
            const scaleField = document.getElementById('text-node-scale');
            const scaleValueField = document.getElementById('text-node-scale-value');
            const backgroundImageField = document.getElementById('text-node-background-image');
            const isExistingTextNode = node?.data('type') === 'text';
            const textDefaults = this.getTextNodeDefaults();
            const calloutUtils = window.QuantickleUtils || {};
            const readNodeData = (key) => (node && typeof node.data === 'function') ? node.data(key) : undefined;
            const storedCallout = readNodeData('callout');
            let normalizedCallout = null;
            if (storedCallout && typeof calloutUtils.normalizeCalloutPayload === 'function') {
                normalizedCallout = calloutUtils.normalizeCalloutPayload(storedCallout, { defaultFormat: 'text' });
                const hasContent = typeof calloutUtils.calloutHasContent === 'function'
                    ? calloutUtils.calloutHasContent(normalizedCallout)
                    : Boolean(normalizedCallout && (normalizedCallout.title || normalizedCallout.body));
                if (!hasContent) {
                    normalizedCallout = null;
                }
            }
            const fallbackCalloutTitle = readNodeData('calloutTitle');
            const fallbackCalloutBody = readNodeData('calloutBody');
            const legacyTitle = readNodeData('label');
            const legacyBody = readNodeData('info');
            const conversionWidth = conversion && conversion.width !== undefined
                ? conversion.width
                : undefined;
            const conversionHeight = conversion && conversion.height !== undefined
                ? conversion.height
                : undefined;
            const conversionRatio = conversion && conversion.preserveAspectRatio !== undefined
                ? conversion.preserveAspectRatio
                : undefined;
            const conversionBackgroundColor = conversion && conversion.backgroundColor !== undefined
                ? conversion.backgroundColor
                : undefined;
            const conversionBackgroundImage = conversion && conversion.backgroundImage !== undefined
                ? conversion.backgroundImage
                : undefined;
            const conversionFontColor = conversion && conversion.fontColor !== undefined
                ? conversion.fontColor
                : undefined;
            const conversionCalloutScale = conversion && conversion.calloutScale !== undefined
                ? conversion.calloutScale
                : undefined;
            const conversionTitle = conversion && conversion.title !== undefined
                ? conversion.title
                : undefined;
            const conversionBody = conversion && conversion.body !== undefined
                ? conversion.body
                : undefined;
            const resolvedDefaultTitle = (normalizedCallout && normalizedCallout.title)
                || (typeof fallbackCalloutTitle === 'string' ? fallbackCalloutTitle : '')
                || (typeof legacyTitle === 'string' ? legacyTitle : '')
                || '';
            const resolvedDefaultBody = (normalizedCallout && normalizedCallout.body)
                || (typeof fallbackCalloutBody === 'string' ? fallbackCalloutBody : '')
                || (typeof legacyBody === 'string' ? legacyBody : '')
                || '';
            if (titleField) titleField.value = conversionTitle !== undefined
                ? conversionTitle
                : resolvedDefaultTitle;
            if (bodyField) bodyField.value = conversionBody !== undefined
                ? conversionBody
                : resolvedDefaultBody;
            if (widthField) {
                if (conversionWidth !== undefined) {
                    widthField.value = conversionWidth;
                } else if (isExistingTextNode && node && node.data('width') !== undefined) {
                    widthField.value = node.data('width');
                } else if (textDefaults.width !== undefined) {
                    widthField.value = textDefaults.width;
                } else {
                    widthField.value = '';
                }
            }
            if (heightField) {
                if (conversionHeight !== undefined) {
                    heightField.value = conversionHeight;
                } else if (isExistingTextNode && node && node.data('height') !== undefined) {
                    heightField.value = node.data('height');
                } else if (textDefaults.height !== undefined) {
                    heightField.value = textDefaults.height;
                } else {
                    heightField.value = '';
                }
            }
            const fallbackBackground = textDefaults.backgroundColor || textDefaults.color || '#ffffff';
            const fallbackFontColor = textDefaults.fontColor || '#333333';
            if (backgroundColorField) {
                const backgroundValue = conversionBackgroundColor !== undefined
                    ? conversionBackgroundColor
                    : (isExistingTextNode
                        ? (node?.data('backgroundColor') || node?.data('color') || fallbackBackground)
                        : fallbackBackground);
                backgroundColorField.value = normalizeColorInput(backgroundValue, fallbackBackground);
            }
            if (fontColorField) {
                const fontColorValue = conversionFontColor !== undefined
                    ? conversionFontColor
                    : (isExistingTextNode
                        ? (node?.data('fontColor') || fallbackFontColor)
                        : fallbackFontColor);
                fontColorField.value = normalizeColorInput(fontColorValue, fallbackFontColor);
            }
            if (scaleField) {
                const defaultScale = Number.isFinite(Number(textDefaults.calloutScale))
                    ? Number(textDefaults.calloutScale)
                    : 1;
                const scaleValue = conversionCalloutScale !== undefined
                    ? Number(conversionCalloutScale)
                    : (isExistingTextNode
                        ? Number(node?.data('calloutScale'))
                        : defaultScale);
                const normalizedScale = Number.isFinite(scaleValue)
                    ? Math.max(0.5, Math.min(2, scaleValue))
                    : defaultScale;
                scaleField.value = normalizedScale.toFixed(2);
                if (scaleValueField) {
                    scaleValueField.textContent = `${Math.round(normalizedScale * 100)}%`;
                }
            }
            if (ratioField) {
                const defaultRatio = textDefaults.preserveAspectRatio !== undefined
                    ? textDefaults.preserveAspectRatio !== false
                    : true;
                const preserveAspectRatio = conversionRatio !== undefined
                    ? conversionRatio
                    : (isExistingTextNode
                        ? node?.data('preserveAspectRatio') !== false
                        : defaultRatio);
                ratioField.checked = preserveAspectRatio;
            }
            if (backgroundImageField) {
                if (conversionBackgroundImage !== undefined) {
                    backgroundImageField.value = conversionBackgroundImage;
                } else if (isExistingTextNode && node && node.data('backgroundImage') !== undefined) {
                    backgroundImageField.value = node.data('backgroundImage');
                } else if (textDefaults.backgroundImage !== undefined) {
                    backgroundImageField.value = textDefaults.backgroundImage;
                } else {
                    backgroundImageField.value = 'none';
                }
            }
            this.textModal.style.display = 'block';
            if (this.modalOverlay) this.modalOverlay.style.display = 'block';
            if (titleField) {
                setTimeout(() => titleField.focus(), 100);
            }
        }
    }

    getTextNodeDefaults() {
        const nodeTypes = window.NodeTypes || {};
        const defaults = nodeTypes.text;
        return typeof defaults === 'object' && defaults !== null ? defaults : {};
    }

    async saveTextNodeChanges() {
        if (!this.selectedNode) return;
        const titleField = document.getElementById('text-node-title');
        const bodyField = document.getElementById('text-node-body');
        const widthField = document.getElementById('text-node-width');
        const heightField = document.getElementById('text-node-height');
        const ratioField = document.getElementById('text-node-preserve-ratio');
        const backgroundColorField = document.getElementById('text-node-background-color');
        const fontColorField = document.getElementById('text-node-font-color');
        const scaleField = document.getElementById('text-node-scale');
        const backgroundImageField = document.getElementById('text-node-background-image');
        const rawTitle = titleField ? titleField.value.trim() : '';
        const rawBody = bodyField ? bodyField.value : '';
        const title = window.DOMPurify ? DOMPurify.sanitize(rawTitle) : rawTitle;
        const body = window.DOMPurify ? DOMPurify.sanitize(rawBody) : rawBody;

        const infoHtml = await this.generateTextNodeHtml(title, body);

        const existingData = this.selectedNode.data() || {};
        const wasTextNode = existingData.type === 'text';
        const textDefaults = this.getTextNodeDefaults();

        if (!wasTextNode) {
            this.selectedNode.removeData('width');
            this.selectedNode.removeData('height');
        }

        const resolve = (key, fallback) => {
            if (!wasTextNode) {
                return textDefaults[key] !== undefined ? textDefaults[key] : fallback;
            }
            if (existingData[key] !== undefined) {
                return existingData[key];
            }
            return textDefaults[key] !== undefined ? textDefaults[key] : fallback;
        };

        const resolvedColor = resolve('color', 'rgba(0,0,0,0)');
        const resolvedShape = resolve('shape', 'round-rectangle');
        const resolvedFontFamily = resolve('fontFamily', 'Arial');
        const resolvedFontSize = resolve('fontSize', 14);
        const resolvedFontColor = resolve('fontColor', '#333333');
        const resolvedBackgroundColor = resolve('backgroundColor', '#ffffff');
        const resolvedBold = resolve('bold', false);
        const resolvedItalic = resolve('italic', false);
        const resolvedBorderColor = resolve('borderColor', '#000000');
        const resolvedBorderWidth = resolve('borderWidth', 1);
        const resolvedOpacity = wasTextNode && existingData.opacity !== undefined
            ? existingData.opacity
            : 1;

        const normalizeColorInput = (value, fallback) => {
            const normalizer =
                window.globalFunctions && typeof window.globalFunctions.normalizeColor === 'function'
                    ? window.globalFunctions.normalizeColor
                    : null;
            const trimmed = typeof value === 'string' ? value.trim() : '';
            if (!trimmed) return fallback;
            let normalized = trimmed;
            if (normalizer) {
                try {
                    normalized = normalizer(trimmed) || fallback;
                } catch (error) {
                    normalized = fallback;
                }
            }
            return /^#(?:[0-9a-f]{3}){1,2}$/i.test(normalized) ? normalized : fallback;
        };

        const backgroundColorInput = backgroundColorField ? backgroundColorField.value : '';
        const fontColorInput = fontColorField ? fontColorField.value : '';
        const calloutScaleInput = scaleField ? Number(scaleField.value) : NaN;
        const appliedCalloutScale = Number.isFinite(calloutScaleInput)
            ? Math.max(0.5, Math.min(2, calloutScaleInput))
            : (Number.isFinite(Number(existingData.calloutScale)) ? Number(existingData.calloutScale) : 1);
        const appliedBackgroundColor = normalizeColorInput(backgroundColorInput, resolvedBackgroundColor);
        const appliedFontColor = normalizeColorInput(fontColorInput, resolvedFontColor);

        const baseUpdates = {
            type: 'text',
            label: title,
            info: body,
            infoHtml,
            labelVisible: false,
            color: resolvedColor,
            shape: resolvedShape,
            fontFamily: resolvedFontFamily,
            fontSize: resolvedFontSize,
            fontColor: appliedFontColor,
            bold: resolvedBold,
            italic: resolvedItalic,
            borderColor: resolvedBorderColor,
            borderWidth: resolvedBorderWidth,
            opacity: resolvedOpacity,
            backgroundColor: appliedBackgroundColor,
            calloutScale: appliedCalloutScale
        };

        const calloutUtils = window.QuantickleUtils || {};
        const calloutPayload = calloutUtils.normalizeCalloutPayload
            ? calloutUtils.normalizeCalloutPayload({ title, body, format: 'text' }, { defaultFormat: 'text' })
            : { title, body, format: 'text' };
        if (calloutUtils.syncCalloutLegacyFields) {
            calloutUtils.syncCalloutLegacyFields(baseUpdates, calloutPayload, {
                defaultFormat: 'text',
                html: infoHtml,
                syncTitle: true,
                overwriteInfo: true,
                includeDerivedFields: true
            });
        } else {
            baseUpdates.callout = calloutPayload;
        }

        const backgroundFieldValue = backgroundImageField && typeof backgroundImageField.value === 'string'
            ? backgroundImageField.value.trim()
            : '';
        const normalizedBackgroundImage = backgroundFieldValue || undefined;

        if (wasTextNode) {
            if (existingData.icon !== undefined) baseUpdates.icon = existingData.icon;
            if (normalizedBackgroundImage !== undefined) {
                baseUpdates.backgroundImage = normalizedBackgroundImage;
            } else if (existingData.backgroundImage !== undefined) {
                baseUpdates.backgroundImage = existingData.backgroundImage;
            }
            if (existingData.iconOpacity !== undefined) baseUpdates.iconOpacity = existingData.iconOpacity;
        } else {
            baseUpdates.icon = '';
            baseUpdates.backgroundImage = normalizedBackgroundImage !== undefined
                ? normalizedBackgroundImage
                : (textDefaults.backgroundImage !== undefined ? textDefaults.backgroundImage : 'none');
            baseUpdates.iconOpacity = 0;
        }

        this.selectedNode.data(baseUpdates);

        const widthVal = widthField ? parseFloat(widthField.value) : NaN;
        const heightVal = heightField ? parseFloat(heightField.value) : NaN;
        if (!isNaN(widthVal)) {
            this.selectedNode.data('width', widthVal);
            this.selectedNode.data('textWidthMode', 'fixed');
        } else {
            this.selectedNode.removeData('width');
            this.selectedNode.removeData('textWidthMode');
        }
        if (!isNaN(heightVal)) {
            this.selectedNode.data('height', heightVal);
            this.selectedNode.data('textHeightMode', 'fixed');
        } else {
            this.selectedNode.removeData('height');
            this.selectedNode.removeData('textHeightMode');
        }

        const preserveAspectRatio = ratioField ? ratioField.checked : true;
        this.selectedNode.data('preserveAspectRatio', preserveAspectRatio);
        if (preserveAspectRatio && !isNaN(widthVal) && !isNaN(heightVal) && heightVal > 0) {
            this.selectedNode.data('aspectRatio', widthVal / heightVal);
        } else if (!preserveAspectRatio) {
            this.selectedNode.removeData('aspectRatio');
        }
        this.applyNodeStyles(this.selectedNode);
        this.selectedNode.style('label', '');
        this.selectedNode.style('text-opacity', 0);
        if (window.TextCallout && typeof window.TextCallout.refresh === 'function') {
            const node = this.selectedNode;
            const schedule = typeof requestAnimationFrame === 'function'
                ? requestAnimationFrame
                : (cb) => setTimeout(cb, 0);
            schedule(() => window.TextCallout.refresh(node));
        }
        this.synchronizeGraphData();
        this.hideEditor();
    }
    
    /**
     * PUBLIC INTERFACE: Check if editor is currently visible
     */
    isEditorVisible() {
        return this.isVisible;
    }
    
    /**
     * PUBLIC INTERFACE: Programmatically update a node
     * @param {Object} nodeData - Node data to update
     */
    updateNode(nodeData) {
        if (!this.selectedNode) return;

        const node = this.selectedNode;
        if (node.data('type') === 'timeline-bar') {
            const allowed = {};
            if (nodeData.color !== undefined) allowed.color = nodeData.color;
            if (nodeData.borderColor !== undefined) allowed.borderColor = nodeData.borderColor;
            if (nodeData.size !== undefined) allowed.size = nodeData.size;
            Object.keys(allowed).forEach(key => node.data(key, allowed[key]));
            this.applyNodeStyles(node);
            this.notifications.show('Node updated successfully', 'success');
            return;
        }

        // Apply updates to the node
        Object.keys(nodeData).forEach(key => {
            node.data(key, nodeData[key]);
        });

        // Update visual styles if needed
        this.applyNodeStyles(node);
        this.synchronizeGraphData();
        this.notifications.show('Node updated successfully', 'success');
    }
    
    // === PRIVATE METHODS BELOW ===
    
    /**
     * Add CSS styles for the node editor
     */
    addStyles() {
        if (document.getElementById(this.config.stylesId)) return;
        
        const style = document.createElement('style');
        style.id = this.config.stylesId;
        style.textContent = `
            .node-editor {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 640px;
                max-width: 95vw;
                max-height: 80vh;
                background: #f8f8f2;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000;
                display: none;
                font-family: Arial, sans-serif;
                font-size: 13px;
            }
            
            .node-editor-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 999;
                display: none;
            }
            
            .editor-header {
                padding: 15px 20px;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
                border-radius: 8px 8px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .editor-title {
                margin: 0;
                font-size: 16px;
                font-weight: bold;
                color: #333;
            }
            
            .close-button {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                color: #666;
                padding: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .close-button:hover {
                color: #000;
            }
            
            .editor-content {
                padding: 12px;
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .two-column-layout {
                display: grid;
                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                gap: 12px;
                width: 100%;
            }
            
            .column {
                display: flex;
                flex-direction: column;
                min-width: 0;
                overflow: hidden;
            }
            
            .attribute-group {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }
            
            .attribute-group label {
                min-width: 50px;
                font-size: 12px;
                color: #555;
                flex-shrink: 0;
            }

            .checkbox-inline {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
            }

            .checkbox-inline input[type="checkbox"] {
                flex: none;
            }

            .input-hint {
                font-size: 11px;
                color: #6b7280;
                line-height: 1.4;
            }
            
            .attribute-group input,
            .attribute-group select,
            .attribute-group textarea {
                flex: 1;
                padding: 4px 8px;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-size: 11px;
                min-width: 0;
                background: #f8f8f2;
                box-sizing: border-box;
            }

            .attribute-group input,
            .attribute-group select {
                height: 30px;
            }

            .attribute-group input[type="text"] {
                min-width: 80px;
                max-width: 100%;
            }

            .attribute-group textarea {
                min-height: 60px;
                resize: vertical;
                height: auto;
            }

            .graph-link-fields {
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                flex-wrap: wrap;
            }

            .graph-link-fields select {
                min-width: 140px;
                flex: none;
            }

            .graph-link-fields input[type="text"] {
                flex: 1;
                min-width: 120px;
            }

            .graph-link-button {
                padding: 6px 12px;
                border: 1px solid rgba(148, 163, 184, 0.4);
                border-radius: 6px;
                background: rgba(226, 232, 240, 0.2);
                color: #1f2937;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
            }

            .graph-link-button:hover:not(.disabled) {
                background: rgba(59, 130, 246, 0.12);
                border-color: rgba(59, 130, 246, 0.35);
                color: #1e40af;
            }

            .graph-link-button.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            .graph-link-display {
                font-size: 12px;
                color: #4b5563;
                background: rgba(226, 232, 240, 0.4);
                padding: 6px 10px;
                border-radius: 6px;
                flex: 1 1 auto;
                min-width: 180px;
                max-width: 100%;
                word-break: break-word;
            }

            .graph-link-display[data-selected="false"] {
                color: #9ca3af;
                background: rgba(226, 232, 240, 0.2);
            }

            .graph-link-clear {
                border: none;
                background: rgba(239, 68, 68, 0.12);
                color: #dc2626;
                padding: 6px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s ease, color 0.2s ease;
                display: none;
            }

            .graph-link-clear:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #b91c1c;
            }

            .graph-link-hint {
                font-size: 12px;
                color: #64748b;
                margin-top: 4px;
                line-height: 1.4;
            }

            .file-input-group {
                display: flex;
                align-items: center;
                gap: 6px;
                width: 100%;
            }

            .file-input-group input[type="text"] {
                flex: 1;
                min-width: 0;
            }

            .file-input-button {
                padding: 2px 6px;
                border: 1px solid #cbd5f5;
                border-radius: 6px;
                background: #eef2ff;
                color: #4338ca;
                cursor: pointer;
                font-size: 10px;
                line-height: 1;
                white-space: nowrap;
                flex-shrink: 0;
            }

            .file-input-button:hover {
                background: #e0e7ff;
            }

            .attribute-group input[type="color"] {
                width: 30px;
                height: 30px;
                padding: 0;
                border-radius: 8px;
                flex: none;
            }

            .attribute-group input[type="range"] {
                width: 60px;
                margin: 0 6px;
                flex: none;
                height: auto;
            }

            .attribute-group input[type="checkbox"] {
                flex: none;
                width: auto;
                height: auto;
            }
            
            .editor-buttons {
                padding: 15px 20px;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
            }

            .editor-buttons button {
                padding: 8px 16px;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                background: #f8f9fa;
                color: #333;
            }

            .editor-buttons button:hover {
                background: #e2e6ea;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Create the node editor UI elements
     */
    createNodeEditorUI() {
        // Create modal overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = this.config.overlayId;
        this.modalOverlay.className = 'node-editor-overlay';
        document.body.appendChild(this.modalOverlay);
        
        // Create modal
        this.modal = document.createElement('div');
        this.modal.id = this.config.modalId;
        this.modal.className = 'node-editor';
        
        const shapeOptions = this.getShapeOptions();
        this.modal.innerHTML = `
            <div class="editor-header">
                <h3 class="editor-title">Edit Node</h3>
                <button class="close-button" onclick="window.NodeEditorModule.hideEditor()">&times;</button>
            </div>
            <div class="editor-content">
                <div class="two-column-layout">
                    <div class="column">
                        <div class="attribute-group">
                            <label>ID:</label>
                            <input type="text" id="node-id" placeholder="Node ID">
                        </div>
                        <div class="attribute-group">
                            <label>Label:</label>
                            <input type="text" id="node-label" placeholder="Node label">
                        </div>
                        <div class="attribute-group">
                            <label>Show Label:</label>
                            <input type="checkbox" id="node-show-label">
                        </div>
                        <div class="attribute-group">
                            <label>Type:</label>
                            <select id="node-type" class="node-type-select"></select>
                        </div>
                        <div class="attribute-group">
                            <label>Color:</label>
                            <input type="color" id="node-color">
                        </div>
                        <div class="attribute-group">
                            <label id="node-size-label">Size:</label>
                            <input type="range" id="node-size" min="10" max="100" value="30">
                            <span id="size-value">30</span>
                        </div>
                        <div class="attribute-group">
                            <label>Weight:</label>
                            <input type="number" id="node-weight" step="0.1" placeholder="1">
                        </div>
                    </div>
                    <div class="column">
                        <div class="attribute-group">
                            <label>Opacity:</label>
                            <input type="range" id="node-opacity" min="0" max="1" step="0.1" value="1">
                            <span id="opacity-value">1.0</span>
                        </div>
                        <div class="attribute-group">
                            <label>Icon:</label>
                            <div class="file-input-group">
                                <input type="text" id="node-icon" placeholder="icon name or URL">
                                <button type="button" class="file-input-button" data-file-target="node-icon">Browse…</button>
                            </div>
                        </div>
                        <div class="attribute-group">
                            <label>Icon Fit:</label>
                            <select id="node-background-fit">
                                <option value="contain">Contain</option>
                                <option value="cover">Cover</option>
                            </select>
                        </div>
                        <div class="attribute-group">
                            <label>Icon Opacity:</label>
                            <input type="range" id="icon-opacity" min="0" max="1" step="0.1" value="1">
                            <span id="icon-opacity-value">1.0</span>
                        </div>
                        <div class="attribute-group">
                            <label>Border:</label>
                            <input type="color" id="node-border-color">
                        </div>
                        <div class="attribute-group">
                            <label>Shape:</label>
                            <select id="node-shape">${shapeOptions}</select>
                        </div>
                        <div class="attribute-group">
                            <label>Timestamp:</label>
                            <input type="datetime-local" id="node-timestamp">
                        </div>
                    </div>
                </div>
                <div id="text-options" style="display:none;">
                    <div class="attribute-group">
                        <label>Font Family:</label>
                        <select id="node-font-family">
                            <option value="Arial">Arial</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Verdana">Verdana</option>
                        </select>
                    </div>
                    <div class="attribute-group">
                        <label>Font Size:</label>
                        <input type="number" id="node-font-size" min="8" max="72" placeholder="14">
                    </div>
                    <div class="attribute-group">
                        <label>Font Color:</label>
                        <input type="color" id="node-font-color">
                    </div>
                    <div class="attribute-group">
                        <label>Style:</label>
                        <label><input type="checkbox" id="node-font-bold"> Bold</label>
                        <label><input type="checkbox" id="node-font-italic"> Italic</label>
                    </div>
                </div>
                <div id="graph-link-options" class="attribute-group" style="display:none;">
                    <label>Graph Link:</label>
                    <div class="graph-link-fields">
                        <button type="button" id="graph-link-select" class="graph-link-button">Select graph…</button>
                        <button type="button" id="graph-link-clear" class="graph-link-clear">Clear</button>
                        <div id="graph-link-display" class="graph-link-display" data-selected="false">No graph selected</div>
                    </div>
                    <div id="graph-link-hint" class="graph-link-hint"></div>
                    <input type="hidden" id="graph-link-source">
                    <input type="hidden" id="graph-link-key">
                </div>
                <div class="attribute-group">
                    <label>Info:</label>
                    <textarea id="node-info" placeholder="Node info"></textarea>
                </div>
                <div class="attribute-group">
                    <label>Graph Link Source:</label>
                    <select id="node-graph-link-source">
                        <option value="">None</option>
                        <option value="file">File</option>
                        <option value="neo4j">Neo4j</option>
                    </select>
                </div>
                <div class="attribute-group">
                    <label>Graph Link Key:</label>
                    <input type="text" id="node-graph-link-key" placeholder="Graph identifier or path">
                </div>
            </div>
            <div class="editor-buttons">
                <button onclick="window.NodeEditorModule.hideEditor()">Close</button>
            </div>
        `;
        
        document.body.appendChild(this.modal);
        this.populateTypeOptions();
    }

    /**
     * Create bulk node editor UI (no label fields)
     */
    createBulkEditorUI() {
        // Create modal
        this.bulkModal = document.createElement('div');
        this.bulkModal.id = 'bulk-node-editor-modal';
        this.bulkModal.className = 'node-editor';

        const shapeOptions = this.getShapeOptions();
        this.bulkModal.innerHTML = `
            <div class="editor-header">
                <h3 class="editor-title">Edit Nodes</h3>
                <button class="close-button" onclick="window.NodeEditorModule.hideEditor()">&times;</button>
            </div>
            <div class="editor-content">
                <div class="two-column-layout">
                    <div class="column">
                        <div class="attribute-group">
                            <label>Type:</label>
                            <select id="bulk-node-type" class="node-type-select"></select>
                        </div>
                        <div class="attribute-group">
                            <label>Color:</label>
                            <input type="color" id="bulk-node-color">
                        </div>
                        <div class="attribute-group">
                            <label id="bulk-node-size-label">Size:</label>
                            <input type="range" id="bulk-node-size" min="10" max="100" value="30">
                            <span id="bulk-size-value">30</span>
                        </div>
                        <div class="attribute-group">
                            <label>Weight:</label>
                            <input type="number" id="bulk-node-weight" step="0.1" placeholder="1">
                        </div>
                    </div>
                    <div class="column">
                        <div class="attribute-group">
                            <label>Opacity:</label>
                            <input type="range" id="bulk-node-opacity" min="0" max="1" step="0.1" value="1">
                            <span id="bulk-opacity-value">1.0</span>
                        </div>
                        <div class="attribute-group">
                            <label>Icon:</label>
                            <div class="file-input-group">
                                <input type="text" id="bulk-node-icon" placeholder="icon name or URL">
                                <button type="button" class="file-input-button" data-file-target="bulk-node-icon">Browse…</button>
                            </div>
                        </div>
                        <div class="attribute-group">
                            <label>Icon Fit:</label>
                            <select id="bulk-node-background-fit">
                                <option value="contain">Contain</option>
                                <option value="cover">Cover</option>
                            </select>
                        </div>
                        <div class="attribute-group">
                            <label>Icon Opacity:</label>
                            <input type="range" id="bulk-icon-opacity" min="0" max="1" step="0.1" value="1">
                            <span id="bulk-icon-opacity-value">1.0</span>
                        </div>
                        <div class="attribute-group">
                            <label>Border:</label>
                            <input type="color" id="bulk-node-border-color">
                        </div>
                        <div class="attribute-group">
                            <label>Shape:</label>
                            <select id="bulk-node-shape">${shapeOptions}</select>
                        </div>
                        <div class="attribute-group">
                            <label>Timestamp:</label>
                            <input type="datetime-local" id="bulk-node-timestamp">
                        </div>
                    </div>
                </div>
                <div id="bulk-text-options" style="display:none;">
                    <div class="attribute-group">
                        <label>Font Family:</label>
                        <select id="bulk-node-font-family">
                            <option value="Arial">Arial</option>
                            <option value="Courier New">Courier New</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Verdana">Verdana</option>
                        </select>
                    </div>
                    <div class="attribute-group">
                        <label>Font Size:</label>
                        <input type="number" id="bulk-node-font-size" min="8" max="72" placeholder="14">
                    </div>
                    <div class="attribute-group">
                        <label>Font Color:</label>
                        <input type="color" id="bulk-node-font-color">
                    </div>
                    <div class="attribute-group">
                        <label>Style:</label>
                        <label><input type="checkbox" id="bulk-node-font-bold"> Bold</label>
                        <label><input type="checkbox" id="bulk-node-font-italic"> Italic</label>
                    </div>
                </div>
                <div class="attribute-group">
                    <label>Info:</label>
                    <textarea id="bulk-node-info" placeholder="Node info"></textarea>
                </div>
                <div id="bulk-graph-link-options" class="attribute-group" style="display:none;">
                    <label>Graph Link:</label>
                    <div class="graph-link-fields">
                        <button type="button" id="bulk-graph-link-select" class="graph-link-button">Select graph…</button>
                        <button type="button" id="bulk-graph-link-clear" class="graph-link-clear">Clear</button>
                        <div id="bulk-graph-link-display" class="graph-link-display" data-selected="false">No graph selected</div>
                    </div>
                    <div id="bulk-graph-link-hint" class="graph-link-hint"></div>
                    <input type="hidden" id="bulk-graph-link-source">
                    <input type="hidden" id="bulk-graph-link-key">
                </div>
            </div>
            <div class="editor-buttons">
                <button onclick="window.NodeEditorModule.hideEditor()">Close</button>
            </div>
        `;

        document.body.appendChild(this.bulkModal);
        this.populateTypeOptions('default', 'bulk-node-type');
    }

    createTextNodeEditorUI() {
        this.textModal = document.createElement('div');
        this.textModal.id = 'text-node-editor-modal';
        this.textModal.className = 'node-editor';
        this.textModal.innerHTML = `
            <div class="editor-header">
                <h3 class="editor-title">Edit Text Node</h3>
                <button class="close-button" onclick="window.NodeEditor.hideEditor()">&times;</button>
            </div>
            <div class="editor-content">
                <div class="attribute-group">
                    <label>Title:</label>
                    <input type="text" id="text-node-title" data-modal-input="true">
                </div>
                <div class="attribute-group">
                    <label>Body:</label>
                    <textarea id="text-node-body" placeholder="Text body" data-modal-input="true" style="height: 150px;"></textarea>
                </div>
                <div class="attribute-group">
                    <label>Background Color:</label>
                    <input type="color" id="text-node-background-color" data-modal-input="true" value="#ffffff">
                </div>
                <div class="attribute-group">
                    <label>Text Color:</label>
                    <input type="color" id="text-node-font-color" data-modal-input="true" value="#333333">
                </div>
                <div class="attribute-group">
                    <label>Scale:</label>
                    <input type="range" id="text-node-scale" data-modal-input="true" min="0.5" max="2" step="0.05" value="1">
                    <span id="text-node-scale-value">100%</span>
                </div>
                <div class="attribute-group">
                    <label>Width:</label>
                    <input type="number" id="text-node-width" data-modal-input="true" min="20" placeholder="auto">
                </div>
                <div class="attribute-group">
                    <label>Height:</label>
                    <input type="number" id="text-node-height" data-modal-input="true" min="20" placeholder="auto">
                </div>
                <div class="attribute-group">
                    <label class="checkbox-inline">
                        <input type="checkbox" id="text-node-preserve-ratio" data-modal-input="true" checked>
                        Preserve aspect ratio
                    </label>
                    <div class="input-hint">Keep width and height linked when zooming or resizing with the mouse.</div>
                </div>
                <input type="hidden" id="text-node-background-image" data-modal-input="true">
            </div>
            <div class="editor-buttons">
                <button onclick="window.NodeEditor.saveTextNodeChanges()">Save</button>
                <button onclick="window.NodeEditor.hideEditor()">Close</button>
            </div>
        `;
        document.body.appendChild(this.textModal);
    }

    /**
     * Generate HTML options for all supported shapes
     */
    getShapeOptions() {
        const shapes = [
            ['ellipse', 'Ellipse'],
            ['round-rectangle', 'Round Rectangle'],
            ['rectangle', 'Rectangle'],
            ['triangle', 'Triangle'],
            ['round-triangle', 'Round Triangle'],
            ['diamond', 'Diamond'],
            ['round-diamond', 'Round Diamond'],
            ['pentagon', 'Pentagon'],
            ['round-pentagon', 'Round Pentagon'],
            ['hexagon', 'Hexagon'],
            ['round-hexagon', 'Round Hexagon'],
            ['heptagon', 'Heptagon'],
            ['round-heptagon', 'Round Heptagon'],
            ['octagon', 'Octagon'],
            ['round-octagon', 'Round Octagon'],
            ['star', 'Star'],
            ['round-star', 'Round Star'],
            ['tag', 'Tag'],
            ['round-tag', 'Round Tag'],
            ['vee', 'Vee'],
            ['rhomboid', 'Rhomboid'],
            ['polygon', 'Polygon'],
            ['barrel', 'Barrel'],
            ['cut-rectangle', 'Cut Rectangle'],
            ['bottom-round-rectangle', 'Bottom Round Rectangle'],
            ['bottom-trapezoid', 'Bottom Trapezoid'],
            ['bar-rectangle', 'Bar Rectangle'],
            ['concave-hexagon', 'Concave Hexagon']
        ];
        return shapes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    }

    /**
     * Populate node type select with available types
     */
    populateTypeOptions(selectedType = 'default', elementId = 'node-type') {
        const typeSelect = document.getElementById(elementId);
        if (!typeSelect) return;

        const types = Object.keys(window.NodeTypes || {}).sort();
        typeSelect.innerHTML = '';
        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });

        // Ensure current type is available
        if (selectedType && !types.includes(selectedType)) {
            const option = document.createElement('option');
            option.value = selectedType;
            option.textContent = selectedType;
            typeSelect.appendChild(option);
        }

        typeSelect.value = selectedType;
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Close on overlay click
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', () => this.hideEditor());
        }

        const setupFor = (prefix = '', modal = this.modal) => {
            if (modal) {
                modal.addEventListener('click', (e) => e.stopPropagation());
            }

            const markUserChanged = (el) => {
                if (this.isBulkEdit && el) {
                    el.dataset.userChanged = 'true';
                }
            };

            const sizeSlider = document.getElementById(`${prefix}node-size`);
            const sizeValue = document.getElementById(`${prefix}size-value`);
            if (sizeSlider && sizeValue) {
                sizeSlider.addEventListener('input', (e) => {
                    sizeValue.textContent = e.target.value;
                    markUserChanged(sizeSlider);
                    this.saveChanges();
                });
            }

            const opacitySlider = document.getElementById(`${prefix}node-opacity`);
            const opacityValue = document.getElementById(`${prefix}opacity-value`);
            if (opacitySlider && opacityValue) {
                opacitySlider.addEventListener('input', (e) => {
                    opacityValue.textContent = parseFloat(e.target.value).toFixed(1);
                    markUserChanged(opacitySlider);
                    this.saveChanges();
                });
            }

            const iconOpacitySlider = document.getElementById(`${prefix}icon-opacity`);
            const iconOpacityValue = document.getElementById(`${prefix}icon-opacity-value`);
            if (iconOpacitySlider && iconOpacityValue) {
                iconOpacitySlider.addEventListener('input', (e) => {
                    iconOpacityValue.textContent = parseFloat(e.target.value).toFixed(1);
                    markUserChanged(iconOpacitySlider);
                    this.saveChanges();
                });
            }

            const fieldList = prefix ? [
                'node-color',
                'node-weight',
                'node-icon',
                'node-background-fit',
                'node-border-color',
                'node-shape',
                'node-timestamp',
                'node-info',
                'node-graph-link-source',
                'node-graph-link-key',
                'node-font-family',
                'node-font-size',
                'node-font-color',
                'node-font-bold',
                'node-font-italic'
            ] : [
                'node-label',
                'node-show-label',
                'node-color',
                'node-weight',
                'node-icon',
                'node-background-fit',
                'node-border-color',
                'node-shape',
                'node-timestamp',
                'node-info',
                'node-graph-link-source',
                'node-graph-link-key',
                'node-font-family',
                'node-font-size',
                'node-font-color',
                'node-font-bold',
                'node-font-italic'
            ];

            fieldList.forEach(id => {
                const el = document.getElementById(`${prefix}${id}`);
                if (el) {
                    const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'datetime-local') ? 'change' : 'input';
                    el.addEventListener(eventType, () => {
                        markUserChanged(el);
                        if (id.startsWith('graph-link')) {
                            this.refreshGraphLinkHint(prefix);
                        }
                        this.saveChanges();
                    });
                }
            });

            const graphLinkButton = document.getElementById(`${prefix}graph-link-select`);
            if (graphLinkButton) {
                graphLinkButton.addEventListener('click', async () => {
                    if (graphLinkButton.disabled || graphLinkButton.classList.contains('disabled')) {
                        return;
                    }
                    await this.openGraphLinkPicker(prefix);
                });
            }

            const graphLinkClear = document.getElementById(`${prefix}graph-link-clear`);
            if (graphLinkClear) {
                graphLinkClear.addEventListener('click', () => {
                    this.handleGraphLinkClear(prefix);
                });
            }

            const iconFileButton = modal ? modal.querySelector(`.file-input-button[data-file-target="${prefix}node-icon"]`) : null;
            if (iconFileButton) {
                iconFileButton.addEventListener('click', async () => {
                    const iconInput = document.getElementById(`${prefix}node-icon`);
                    if (!iconInput || !window.QuantickleUtils?.pickImageFilePath) {
                        return;
                    }
                    const path = await window.QuantickleUtils.pickImageFilePath({ workspaceSubdir: 'assets' });
                    if (!path) {
                        return;
                    }
                    iconInput.value = path;
                    if (this.isBulkEdit) {
                        iconInput.dataset.userChanged = 'true';
                    }
                    iconInput.dispatchEvent(new Event('input', { bubbles: true }));
                });
            }

            const typeField = document.getElementById(`${prefix}node-type`);
            if (typeField) {
                typeField.addEventListener('focus', () => {
                    typeField.dataset.previousType = typeField.value;
                });

                typeField.addEventListener('change', () => {
                    const previousType = typeField.dataset.previousType
                        || (this.selectedNode ? this.selectedNode.data('type') : 'default');
                    const newType = typeField.value;

                    // Ensure bulk edits capture the user's intent to change the type
                    if (this.isBulkEdit) {
                        typeField.dataset.userChanged = 'true';
                    }
                    this.updateInfoFieldLockState(newType, prefix);
                    this.updateGraphLinkVisibility(newType, prefix);
                    if (newType === 'graph') {
                        this.refreshGraphLinkHint(prefix);
                    } else {
                        this.clearGraphLinkFields(prefix);
                    }
                    const defaults = (window.NodeTypes && window.NodeTypes[newType]) || {};
                    const applyDefaultsToForm = () => {
                        const markBulkChanged = (id) => {
                            if (!this.isBulkEdit) return;
                            const el = document.getElementById(id);
                            if (el) {
                                el.dataset.userChanged = 'true';
                            }
                        };

                        if (defaults.color !== undefined) {
                            const colorId = `${prefix}node-color`;
                            this.setFieldValue(colorId, defaults.color);
                            markBulkChanged(colorId);
                        }
                        if (defaults.size !== undefined) {
                            const sizeId = `${prefix}node-size`;
                            this.setFieldValue(sizeId, defaults.size);
                            const sizeValueEl = document.getElementById(`${prefix}size-value`);
                            if (sizeValueEl) sizeValueEl.textContent = defaults.size;
                            markBulkChanged(sizeId);
                        }
                        if (defaults.shape !== undefined) {
                            const shapeId = `${prefix}node-shape`;
                            this.setFieldValue(shapeId, defaults.shape);
                            markBulkChanged(shapeId);
                        }
                        if (defaults.icon !== undefined) {
                            const iconId = `${prefix}node-icon`;
                            this.setFieldValue(iconId, defaults.icon);
                            markBulkChanged(iconId);
                        }
                        if (defaults.backgroundFit !== undefined) {
                            const fitId = `${prefix}node-background-fit`;
                            this.setFieldValue(fitId, defaults.backgroundFit);
                            markBulkChanged(fitId);
                        }
                        if (defaults.borderColor !== undefined) {
                            const borderColorId = `${prefix}node-border-color`;
                            this.setFieldValue(borderColorId, defaults.borderColor);
                            markBulkChanged(borderColorId);
                        }
                    };

                    const shouldOpenTextEditor = !this.isBulkEdit && newType === 'text';
                    if (shouldOpenTextEditor) {
                        const labelField = document.getElementById('node-label');
                        const infoField = document.getElementById('node-info');
                        const sanitize = value => (window.DOMPurify ? DOMPurify.sanitize(value || '') : (value || ''));
                        const conversionData = {
                            title: sanitize(labelField ? labelField.value : (this.selectedNode ? this.selectedNode.data('label') : '')),
                            body: sanitize(infoField ? infoField.value : (this.selectedNode ? this.selectedNode.data('info') : ''))
                        };
                        this.pendingTextConversion = { ...conversionData };
                        applyDefaultsToForm();

                        const node = this.selectedNode;
                        if (node) {
                            const payload = conversionData && (conversionData.title || conversionData.body)
                                ? conversionData
                                : {
                                    title: node.data('label') || '',
                                    body: node.data('info') || ''
                                };

                            if (previousType && previousType !== 'text') {
                                this.setFieldValue(`${prefix}node-type`, previousType);
                            }

                            this.showTextNodeEditor(node, payload);
                        } else {
                            this.pendingTextConversion = null;
                        }

                        typeField.dataset.previousType = previousType;
                        return;
                    }

                    this.pendingTextConversion = null;
                    applyDefaultsToForm();

                    this.saveChanges();

                    const nodes = (this.selectedNodes && this.selectedNodes.length > 0)
                        ? this.selectedNodes
                        : [this.selectedNode];

                    this.cy.batch(() => {
                        nodes.forEach(node => {
                            if (defaults.labelColor !== undefined) {
                                node.data('labelColor', defaults.labelColor);
                            }
                            if (defaults.labelPlacement !== undefined) {
                                node.data('labelPlacement', defaults.labelPlacement);
                            }
                            this.applyNodeStyles(node);
                        });
                    });


                    typeField.dataset.previousType = newType;

                });
            }
        };

        setupFor('', this.modal);
        setupFor('bulk-', this.bulkModal);
        if (this.textModal) {
            this.textModal.addEventListener('click', (e) => e.stopPropagation());
            const textScaleSlider = document.getElementById('text-node-scale');
            const textScaleDisplay = document.getElementById('text-node-scale-value');
            if (textScaleSlider && textScaleDisplay) {
                textScaleSlider.addEventListener('input', (e) => {
                    const nextScale = Number(e.target.value);
                    textScaleDisplay.textContent = Number.isFinite(nextScale)
                        ? `${Math.round(nextScale * 100)}%`
                        : '100%';
                });
            }
        }

        // Keyboard handling for inputs
        this.setupKeyboardHandling();
    }
    
    /**
     * Set up keyboard event handling for modal inputs
     */
    setupKeyboardHandling() {
        // Create a keyboard interceptor for modal inputs
        window._modalKeyInterceptor = function(e) {
            if (e.target && e.target.dataset && e.target.dataset.modalInput === 'true') {
                const ctrlCmd = e.ctrlKey || e.metaKey;

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    e.preventDefault();

                    // Manually handle the deletion
                    const input = e.target;
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const value = input.value;

                    if (start !== end) {
                        // Replace selection
                        input.value = value.slice(0, start) + value.slice(end);
                        input.setSelectionRange(start, start);
                    } else if (e.key === 'Backspace' && start > 0) {
                        // Backspace: delete character before cursor
                        input.value = value.slice(0, start - 1) + value.slice(start);
                        input.setSelectionRange(start - 1, start - 1);
                    } else if (e.key === 'Delete' && start < value.length) {
                        // Delete: delete character after cursor
                        input.value = value.slice(0, start) + value.slice(start + 1);
                        input.setSelectionRange(start, start);
                    }

                    // Trigger change event
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }

                // Prevent global shortcuts like copy/paste/cut from bubbling
                if (ctrlCmd && ['v', 'c', 'x'].includes(e.key.toLowerCase())) {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return; // Allow default browser behaviour
                }
            }
        };
        
        // Attach interceptor to capture phase
        document.addEventListener('keydown', window._modalKeyInterceptor, true);
        window.addEventListener('keydown', window._modalKeyInterceptor, true);
    }
    
    /**
     * Populate the editor with current node data
     */
    populateEditor() {
        if (!this.selectedNode) return;

        const data = this.selectedNode.data();
        const prefix = this.isBulkEdit ? 'bulk-' : '';

        const sizeLabel = document.getElementById(`${prefix}node-size-label`);
        if (sizeLabel) {
            sizeLabel.textContent = data.type === 'timeline-bar' ? 'Bar Width:' : 'Size:';
        }

        if (!this.isBulkEdit) {
            this.setFieldValue('node-id', data.id || '');
            this.setFieldValue('node-label', data.label || '');
            const showLabelField = document.getElementById('node-show-label');
            if (showLabelField) {
                showLabelField.checked = data.labelVisible !== false;
            }
        }

        this.populateTypeOptions(data.type || 'default', `${prefix}node-type`);
        const typeField = document.getElementById(`${prefix}node-type`);
        if (typeField) {
            typeField.dataset.previousType = data.type || 'default';
        }
        const set = (field, value) => this.setFieldValue(`${prefix}${field}`, value);
        const defaultNodeColor = window.QuantickleConfig?.defaultNodeColor || '#ffffff';
        set('node-color', data.color || defaultNodeColor);
        set('node-size', data.size || 30);
        set('node-opacity', data.opacity || 1);
        set('node-weight', data.weight || 1);
        set('node-icon', data.icon || '');
        set('node-background-fit', resolveBackgroundFitForData(data));
        set('icon-opacity', data.iconOpacity != null ? data.iconOpacity : 1);
        set('node-info', data.info || '');
        const nodeType = data.type || 'default';
        this.updateInfoFieldLockState(nodeType, prefix);
        const graphLink = nodeType === 'graph'
            ? this.normalizeGraphLinkPayload(
                data.graphLink,
                data.graphReference,
                data.reference,
                data.info
            )
            : null;
        if (nodeType === 'graph') {
            set('node-graph-link-source', graphLink ? graphLink.source : '');
            set('node-graph-link-key', graphLink ? graphLink.key : '');
        } else {
            set('node-graph-link-source', '');
            set('node-graph-link-key', '');
        }
        set('node-border-color', data.borderColor || '#000000');
        set('node-shape', data.shape || 'round-rectangle');
        this.updateGraphLinkVisibility(nodeType, prefix);
        if (nodeType === 'graph') {
            this.populateGraphLinkFields(data, prefix, graphLink);
            this.refreshGraphLinkHint(prefix);
        } else {
            this.clearGraphLinkFields(prefix);
        }
        if (data.timestamp) {
            const d = new Date(data.timestamp);
            if (!isNaN(d.getTime())) {
                const off = d.getTimezoneOffset();
                const local = new Date(d.getTime() - off * 60000);
                set('node-timestamp', local.toISOString().slice(0,16));
            } else {
                set('node-timestamp', '');
            }
        } else {
            set('node-timestamp', '');
        }

        // Text node specific fields
        const textContainer = document.getElementById(`${prefix}text-options`);
        if (textContainer) {
            textContainer.style.display = data.type === 'text' ? 'block' : 'none';
        }
        if (data.type === 'text') {
            set('node-font-family', data.fontFamily || 'Arial');
            set('node-font-size', data.fontSize || 14);
            set('node-font-color', data.fontColor || '#333333');
            const boldEl = document.getElementById(`${prefix}node-font-bold`);
            if (boldEl) boldEl.checked = !!data.bold;
            const italicEl = document.getElementById(`${prefix}node-font-italic`);
            if (italicEl) italicEl.checked = !!data.italic;
        }

        // Update display values
        const sizeDisplay = document.getElementById(`${prefix}size-value`);
        if (sizeDisplay) sizeDisplay.textContent = data.size || 30;
        const opacityDisplay = document.getElementById(`${prefix}opacity-value`);
        if (opacityDisplay) opacityDisplay.textContent = (data.opacity || 1).toFixed(1);
        const iconOpacityDisplay = document.getElementById(`${prefix}icon-opacity-value`);
        if (iconOpacityDisplay) iconOpacityDisplay.textContent = (data.iconOpacity != null ? data.iconOpacity : 1).toFixed(1);

        // Mark all inputs as modal inputs for keyboard handling
        const modal = this.isBulkEdit ? this.bulkModal : this.modal;
        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.dataset.modalInput = 'true';
            input.dataset.userChanged = 'false';
        });

        const disableFields = [
            'node-opacity', 'node-border-color', 'node-shape',
            'node-weight', 'node-icon', 'node-background-fit', 'icon-opacity', 'node-info',
            'node-graph-link-source', 'node-graph-link-key',
            'node-timestamp', 'node-label', 'node-show-label', 'node-type', 'node-id'
        ];
        disableFields.forEach(id => {
            const el = document.getElementById(`${prefix}${id}`);
            if (el) {
                el.disabled = data.type === 'timeline-bar';
            }
        });
    }

    updateGraphLinkVisibility(nodeType, prefix = '') {
        const isGraphNode = nodeType === 'graph';
        const resolver = window.GraphReferenceResolver;
        const hasPortalResolver = !!(resolver && typeof resolver.normalize === 'function');

        const optionsContainer = document.getElementById(`${prefix}graph-link-options`);
        if (optionsContainer) {
            optionsContainer.style.display = (isGraphNode && hasPortalResolver) ? 'block' : 'none';
        }

        const sourceField = document.getElementById(`${prefix}graph-link-source`);
        if (sourceField) {
            sourceField.disabled = !(isGraphNode && hasPortalResolver);
        }

        const keyField = document.getElementById(`${prefix}graph-link-key`);
        if (keyField) {
            keyField.disabled = !(isGraphNode && hasPortalResolver);
        }

        const toggleLegacyField = (fieldId) => {
            const field = document.getElementById(`${prefix}${fieldId}`);
            if (!field) {
                return;
            }
            const shouldShowLegacy = isGraphNode && !hasPortalResolver;
            field.disabled = !shouldShowLegacy;
            const container = field.closest('.attribute-group');
            if (container) {
                container.style.display = shouldShowLegacy ? '' : 'none';
            }
        };

        toggleLegacyField('node-graph-link-source');
        toggleLegacyField('node-graph-link-key');

        if (!isGraphNode) {
            this.clearGraphLinkFields(prefix);
        } else {
            this.updateGraphLinkDisplay(prefix, { enabled: isGraphNode && hasPortalResolver });
        }
    }

    updateInfoFieldLockState(nodeType, prefix = '') {
        const infoField = document.getElementById(`${prefix}node-info`);
        if (!infoField) {
            return;
        }

        const shouldLockInfo = nodeType === 'graph';
        infoField.readOnly = shouldLockInfo;

        if (shouldLockInfo) {
            infoField.dataset.lockedForGraphLink = 'true';
            infoField.title = 'Graph links are managed via the graph link selector.';
            infoField.classList.add('node-info-readonly');
        } else {
            delete infoField.dataset.lockedForGraphLink;
            if (infoField.classList.contains('node-info-readonly')) {
                infoField.classList.remove('node-info-readonly');
            }
            if (infoField.title === 'Graph links are managed via the graph link selector.') {
                infoField.removeAttribute('title');
            }
        }
    }

    clearGraphLinkFields(prefix = '') {
        const portalSource = document.getElementById(`${prefix}graph-link-source`);
        if (portalSource) {
            portalSource.value = '';
        }

        const portalKey = document.getElementById(`${prefix}graph-link-key`);
        if (portalKey) {
            portalKey.value = '';
        }

        const hint = document.getElementById(`${prefix}graph-link-hint`);
        if (hint) {
            hint.textContent = '';
        }

        const legacySource = document.getElementById(`${prefix}node-graph-link-source`);
        if (legacySource) {
            legacySource.value = '';
        }

        const legacyKey = document.getElementById(`${prefix}node-graph-link-key`);
        if (legacyKey) {
            legacyKey.value = '';
        }

        this.updateGraphLinkDisplay(prefix);
    }

    updateGraphLinkDisplay(prefix = '', options = {}) {
        const typeField = document.getElementById(`${prefix}node-type`);
        const resolver = window.GraphReferenceResolver;
        const resolverAvailable = !!(resolver && typeof resolver.normalize === 'function');
        const isGraphNode = typeField ? typeField.value === 'graph' : true;
        const enabled = options.enabled !== undefined
            ? options.enabled
            : (isGraphNode && resolverAvailable);

        const sourceField = document.getElementById(`${prefix}graph-link-source`);
        const keyField = document.getElementById(`${prefix}graph-link-key`);
        const source = sourceField && typeof sourceField.value === 'string'
            ? sourceField.value.trim()
            : '';
        const key = keyField && typeof keyField.value === 'string'
            ? keyField.value.trim()
            : '';
        const hasSelection = Boolean(source && key);

        const selectButton = document.getElementById(`${prefix}graph-link-select`);
        if (selectButton) {
            selectButton.disabled = !enabled;
            selectButton.classList.toggle('disabled', !enabled);
        }

        const clearButton = document.getElementById(`${prefix}graph-link-clear`);
        if (clearButton) {
            clearButton.disabled = !enabled;
            clearButton.style.display = (hasSelection && enabled) ? '' : 'none';
        }

        const display = document.getElementById(`${prefix}graph-link-display`);
        if (display) {
            display.dataset.selected = hasSelection ? 'true' : 'false';
            if (hasSelection) {
                let description = '';
                if (resolver && typeof resolver.describe === 'function') {
                    try {
                        description = resolver.describe({ source, key }) || '';
                    } catch (error) {
                        console.debug('Failed to describe graph link', error);
                        description = '';
                    }
                }
                display.textContent = description || `${source}:${key}`;
            } else {
                display.textContent = enabled ? 'No graph selected' : 'Graph link unavailable';
            }
        }
    }

    canSelectGraphFile() {
        return typeof document !== "undefined";
    }

    async resolveGraphFileKey(handle, fallbackName = '') {
        const manager = window.WorkspaceManager;
        const sanitizedFallback = typeof fallbackName === 'string'
            ? fallbackName.trim()
            : '';

        if (!manager || !manager.handle || !handle) {
            return {
                key: sanitizedFallback,
                fromWorkspace: false,
                relativePath: null
            };
        }

        const rootHandle = manager.handle;
        if (typeof rootHandle.resolve === 'function') {
            try {
                const pathParts = await rootHandle.resolve(handle);
                if (Array.isArray(pathParts) && pathParts.length) {
                    const joined = pathParts.join('/');
                    return {
                        key: joined,
                        fromWorkspace: true,
                        relativePath: joined
                    };
                }
                if (pathParts === null) {
                    return {
                        key: sanitizedFallback,
                        fromWorkspace: false,
                        relativePath: null
                    };
                }
            } catch (error) {
                console.debug('Failed to resolve selected graph file path relative to workspace', error);
            }
        }

        return {
            key: sanitizedFallback,
            fromWorkspace: false,
            relativePath: null
        };
    }

    async showStandardGraphFileDialog() {
        const extension = (window.FileManager && window.FileManager.config && window.FileManager.config.fileExtension)
            ? window.FileManager.config.fileExtension
            : '.qut';

        if (window.showOpenFilePicker) {
            try {
                let startIn;
                if (window.WorkspaceManager && window.WorkspaceManager.handle
                    && typeof window.WorkspaceManager.getSubDirHandle === 'function') {
                    try {
                        startIn = await window.WorkspaceManager.getSubDirHandle('graphs');
                    } catch (error) {
                        console.debug('Unable to resolve workspace graphs directory for file picker', error);
                    }
                }

                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    excludeAcceptAllOption: true,
                    startIn,
                    types: [{
                        description: 'Quantickle Graph',
                        accept: {
                            [window.FileManager?.config?.mimeType || 'application/quantickle-graph']:
                                [extension]
                        }
                    }],
                });

                if (!handle) {
                    return null;
                }

                const fallbackName = handle.name && typeof handle.name === 'string'
                    ? handle.name
                    : '';
                const resolution = await this.resolveGraphFileKey(handle, fallbackName);
                if (!resolution) {
                    return null;
                }

                const workspaceActive = Boolean(window.WorkspaceManager?.handle);
                const fromWorkspace = Boolean(resolution.fromWorkspace);
                const resolvedPath = typeof resolution.relativePath === 'string'
                    ? resolution.relativePath.trim()
                    : '';

                let key = typeof resolution.key === 'string'
                    ? resolution.key.trim()
                    : '';

                if (!key) {
                    return null;
                }

                if (fromWorkspace) {
                    const normalizedPath = resolvedPath.replace(/^\/+/, '');
                    if (!normalizedPath.toLowerCase().startsWith('graphs/')) {
                        this.notifications?.show?.(
                            'Graph files must be located in the workspace "graphs" folder to be linked.',
                            'warning'
                        );
                        return null;
                    }
                    key = normalizedPath.replace(/^graphs\//i, '');
                } else if (workspaceActive) {
                    this.notifications?.show?.(
                        'Please choose a graph from your workspace "graphs" folder.',
                        'warning'
                    );
                    return null;
                }

                if (!key.toLowerCase().endsWith(extension)) {
                    key += extension;
                }

                let graphData = null;
                try {
                    const file = await handle.getFile();
                    if (file) {
                        const text = await file.text();
                        if (text) {
                            const parsed = JSON.parse(text);
                            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
                                graphData = parsed;
                            }
                        }
                    }
                } catch (error) {
                    console.debug('Unable to cache selected graph file contents', error);
                }

                return {
                    key: key.replace(/^\/*graphs\//i, ''),
                    graphData,
                    fromWorkspace
                };
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    return null;
                }
                console.warn('Graph link file picker failed, falling back to legacy input element', error);
            }
        }

        return await new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = extension;
            input.style.display = 'none';

            const cleanup = () => {
                input.removeEventListener('change', changeHandler);
                input.removeEventListener('blur', cleanup);
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            };

            const changeHandler = async (event) => {
                const file = event.target && event.target.files ? event.target.files[0] : null;
                const name = file && typeof file.name === 'string' ? file.name : '';
                const trimmed = name ? name.trim() : '';
                if (!trimmed) {
                    resolve(null);
                } else {
                    const normalized = trimmed.toLowerCase().endsWith(extension)
                        ? trimmed
                        : `${trimmed}${extension}`;
                    let graphData = null;
                    if (file) {
                        try {
                            const text = await file.text();
                            if (text) {
                                const parsed = JSON.parse(text);
                                if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) {
                                    graphData = parsed;
                                }
                            }
                        } catch (err) {
                            console.debug('Failed to cache graph file from legacy input', err);
                        }
                    }
                    resolve({
                        key: normalized,
                        graphData,
                        fromWorkspace: false
                    });
                }
                cleanup();
            };

            input.addEventListener('change', changeHandler);
            input.addEventListener('blur', cleanup);
            document.body.appendChild(input);

            if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
                console.warn('File chooser dialog can only be shown with a user activation.');
                resolve(null);
                cleanup();
                return;
            }

            if (typeof input.showPicker === 'function') {
                input.showPicker();
            } else {
                input.click();
            }
        });
    }

    async pickWorkspaceGraph(prefix = "") {
        const selection = await this.showStandardGraphFileDialog();
        if (!selection || !selection.key) {
            return null;
        }
        const result = { source: 'file', key: selection.key };
        if (selection.graphData && typeof selection.graphData === 'object') {
            result.graphData = selection.graphData;
        }
        return result;
    }

    isNeo4jLinkAvailable() {
        const fileManager = window.FileManager;
        if (!fileManager) {
            return false;
        }
        const hasCredentials = typeof fileManager.hasNeo4jCredentials === 'function'
            ? fileManager.hasNeo4jCredentials()
            : false;
        return Boolean(
            hasCredentials &&
            typeof fileManager.fetchNeo4jGraphs === 'function' &&
            typeof fileManager.showNeo4jGraphSelection === 'function' &&
            typeof fileManager.getNeo4jRequestContext === 'function'
        );
    }

    async pickNeo4jGraph() {
        const fileManager = window.FileManager;
        if (!this.isNeo4jLinkAvailable() || !fileManager) {
            this.notifications?.show?.('Neo4j graph selection is not available.', 'warning');
            return null;
        }

        try {
            const context = fileManager.getNeo4jRequestContext();
            const result = await fileManager.fetchNeo4jGraphs(context);
            const graphs = Array.isArray(result?.graphs) ? result.graphs : [];
            if (!graphs.length) {
                this.notifications?.show?.('No graphs available in the Neo4j store.', 'info');
                return null;
            }

            const selection = await fileManager.showNeo4jGraphSelection(graphs, {
                title: 'Select Neo4j graph to link',
                confirmLabel: 'Link graph',
                cancelLabel: 'Cancel'
            });

            if (!selection) {
                return null;
            }

            const selectedName = typeof selection === 'string'
                ? selection
                : (selection && selection.name) ? selection.name : '';
            if (!selectedName) {
                return null;
            }

            const matchingEntry = graphs.find(item => item && item.name === selectedName);
            const savedAt = matchingEntry && matchingEntry.savedAt ? matchingEntry.savedAt : null;

            return { source: 'neo4j', key: selectedName, savedAt };
        } catch (error) {
            console.error('Failed to load Neo4j graphs', error);
            this.notifications?.show?.(`Failed to load Neo4j graphs: ${error.message}`, 'error');
            return null;
        }
    }

    promptGraphLinkSource() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #f8fafc;
                color: #0f172a;
                padding: 20px;
                border-radius: 12px;
                width: min(360px, 85vw);
                display: flex;
                flex-direction: column;
                gap: 12px;
                box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
            `;

            const heading = document.createElement('h3');
            heading.textContent = 'Choose graph source';
            heading.style.margin = '0';
            heading.style.fontSize = '18px';
            heading.style.fontWeight = '600';
            dialog.appendChild(heading);

            const description = document.createElement('p');
            description.textContent = 'Select how you want to link the associated graph.';
            description.style.margin = '0';
            description.style.fontSize = '13px';
            description.style.color = '#475569';
            dialog.appendChild(description);

            const buttons = document.createElement('div');
            buttons.style.display = 'flex';
            buttons.style.flexDirection = 'column';
            buttons.style.gap = '10px';

            const finish = value => {
                document.removeEventListener('keydown', keyHandler);
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                resolve(value);
            };

            const makeButton = (label, value, accent) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = label;
                btn.style.padding = '10px 16px';
                btn.style.borderRadius = '8px';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
                btn.style.fontSize = '14px';
                btn.style.display = 'flex';
                btn.style.alignItems = 'center';
                btn.style.justifyContent = 'center';
                if (accent) {
                    btn.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(14, 116, 144, 0.85))';
                    btn.style.color = '#f8fafc';
                } else {
                    btn.style.background = 'rgba(59, 130, 246, 0.15)';
                    btn.style.color = '#1e3a8a';
                }
                btn.addEventListener('click', () => finish(value));
                return btn;
            };

            const fileBtn = makeButton('Graph file', 'file', false);
            const neo4jBtn = makeButton('Neo4j graph', 'neo4j', true);
            const cancelBtn = makeButton('Cancel', null, false);
            cancelBtn.style.background = '#ffffff';
            cancelBtn.style.color = '#1f2937';
            cancelBtn.style.border = '1px solid rgba(148, 163, 184, 0.4)';

            buttons.appendChild(neo4jBtn);
            buttons.appendChild(fileBtn);
            buttons.appendChild(cancelBtn);
            dialog.appendChild(buttons);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const keyHandler = event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(null);
                }
            };

            document.addEventListener('keydown', keyHandler);
            overlay.addEventListener('click', event => {
                if (event.target === overlay) {
                    finish(null);
                }
            });

            setTimeout(() => {
                if (neo4jBtn) {
                    neo4jBtn.focus();
                }
            }, 20);
        });
    }

    normalizeSavedAtValue(value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Date) {
            const time = value.getTime();
            return Number.isNaN(time) ? null : value.toISOString();
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            const normalizedValue = value > 1e12 ? value : value * 1000;
            const date = new Date(normalizedValue);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return null;
            }

            const numeric = Number.parseFloat(trimmed);
            if (Number.isFinite(numeric)) {
                return this.normalizeSavedAtValue(numeric);
            }

            const date = new Date(trimmed);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        return null;
    }

    extractSavedAtFromGraphData(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return null;
        }

        const candidates = [
            graphData.savedAt,
            graphData.saved_at,
            graphData.saved_on,
            graphData.metadata && graphData.metadata.savedAt,
            graphData.metadata && graphData.metadata.saved_at
        ];

        for (const candidate of candidates) {
            const normalized = this.normalizeSavedAtValue(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    }

    resolveSelectionSavedAt(selection) {
        if (!selection || typeof selection !== 'object') {
            return null;
        }

        const directCandidates = [
            selection.savedAt,
            selection.saved_at,
            selection.timestamp
        ];

        for (const candidate of directCandidates) {
            const normalized = this.normalizeSavedAtValue(candidate);
            if (normalized) {
                return normalized;
            }
        }

        if (selection.graphData) {
            return this.extractSavedAtFromGraphData(selection.graphData);
        }

        return null;
    }

    applySavedAtToTimestampField(savedAt, prefix = '') {
        const normalized = this.normalizeSavedAtValue(savedAt);
        if (!normalized) {
            return false;
        }

        const timestampField = document.getElementById(`${prefix}node-timestamp`);
        if (!timestampField) {
            return false;
        }

        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
            return false;
        }

        const offset = date.getTimezoneOffset();
        const local = new Date(date.getTime() - offset * 60000);
        timestampField.value = local.toISOString().slice(0, 16);
        return true;
    }

    async applyGraphLinkSelection(selection, prefix = '') {
        if (!selection) {
            return;
        }

        const normalizeValue = (value) => {
            if (value == null) {
                return '';
            }
            return String(value).trim();
        };

        const normalizedSource = normalizeValue(selection.source);
        const normalizedKey = normalizeValue(selection.key);

        const sourceField = document.getElementById(`${prefix}graph-link-source`);
        if (sourceField) {
            sourceField.value = normalizedSource;
        }

        const keyField = document.getElementById(`${prefix}graph-link-key`);
        if (keyField) {
            keyField.value = normalizedKey;
        }

        const legacySourceField = document.getElementById(`${prefix}node-graph-link-source`);
        if (legacySourceField) {
            legacySourceField.value = normalizedSource;
        }

        const legacyKeyField = document.getElementById(`${prefix}node-graph-link-key`);
        if (legacyKeyField) {
            legacyKeyField.value = normalizedKey;
        }

        this.updateGraphLinkDisplay(prefix);
        this.refreshGraphLinkHint(prefix);

        try {
            await this.updateNodeLabelForGraphLink(selection);
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.warn('Failed to update graph label from selection', error);
            }
        }

        const savedAtFromSelection = this.resolveSelectionSavedAt(selection);
        if (savedAtFromSelection) {
            this.applySavedAtToTimestampField(savedAtFromSelection, prefix);
        }

        if (selection && selection.graphData && Array.isArray(selection.graphData.nodes) && normalizedKey) {
            const resolver = window.GraphReferenceResolver;
            if (resolver && typeof resolver.cacheLocalGraph === 'function') {
                try {
                    const cacheSource = normalizedSource || 'file';
                    resolver.cacheLocalGraph({ source: cacheSource, key: normalizedKey }, selection.graphData);
                } catch (cacheError) {
                    console.debug('Failed to cache selected graph data for quick loading', cacheError);
                }
            }
        }

        this.saveChanges();
    }

    async updateNodeLabelForGraphLink(selection) {
        if (this.isBulkEdit) {
            return false;
        }

        const labelField = document.getElementById('node-label');
        if (!labelField) {
            return false;
        }

        const resolvedTitle = await this.resolveGraphLinkTitle(selection);
        if (!resolvedTitle) {
            return false;
        }

        const trimmedTitle = resolvedTitle.trim();
        if (!trimmedTitle || labelField.value === trimmedTitle) {
            return false;
        }

        labelField.value = trimmedTitle;

        const labelToggle = document.getElementById('node-show-label');
        if (labelToggle && !labelToggle.checked) {
            labelToggle.checked = true;
        }

        return true;
    }

    extractGraphTitleFromData(graphData) {
        if (!graphData || typeof graphData !== 'object') {
            return '';
        }

        const candidates = [
            graphData.title,
            graphData.graphName,
            graphData.graphId,
            graphData.name,
            graphData?.metadata?.title,
            graphData?.metadata?.name
        ];

        const resolved = candidates.find(value => typeof value === 'string' && value.trim());
        return resolved ? resolved.trim() : '';
    }

    extractGraphTitleFromSelection(selection) {
        if (!selection || typeof selection !== 'object') {
            return '';
        }

        const directCandidates = [
            selection.title,
            selection.graphTitle,
            selection.name,
            selection.label
        ];

        const directMatch = directCandidates.find(value => typeof value === 'string' && value.trim());
        if (directMatch) {
            return directMatch.trim();
        }

        if (selection.graphData) {
            const extracted = this.extractGraphTitleFromData(selection.graphData);
            if (extracted) {
                return extracted;
            }
        }

        return '';
    }

    buildGraphLinkFetchOptions() {
        const fetchOptions = {};

        const neo4jCreds = window.IntegrationsManager?.getNeo4jCredentials?.() || {};
        const headers = {};
        const assignHeader = (key, value) => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    headers[key] = trimmed;
                }
            }
        };

        assignHeader('X-Neo4j-Url', neo4jCreds.url);
        assignHeader('X-Neo4j-Username', neo4jCreds.username);
        assignHeader('X-Neo4j-Password', neo4jCreds.password);
        assignHeader('X-Neo4j-Db', neo4jCreds.db);

        if (Object.keys(headers).length) {
            fetchOptions.headers = headers;
        }

        if (window.GraphRenderer && typeof window.GraphRenderer.fetchGraphStoreGraph === 'function') {
            fetchOptions.fetchGraphStoreGraph = (key, loaderOptions = {}) => {
                const base = typeof loaderOptions.base === 'string' ? loaderOptions.base : fetchOptions.base;
                const headersOverride = loaderOptions.headers || fetchOptions.headers || {};
                return window.GraphRenderer.fetchGraphStoreGraph(key, {
                    base,
                    headers: headersOverride
                });
            };
        }

        return fetchOptions;
    }

    async resolveGraphLinkTitle(selection) {
        const resolver = window.GraphReferenceResolver;
        let normalized = null;

        if (resolver && typeof resolver.normalize === 'function') {
            try {
                normalized = resolver.normalize(selection);
            } catch (error) {
                console.debug('Failed to normalize graph link selection for label resolution', error);
            }
        }

        const inferredFromNormalized = this.extractGraphNameFromReference(normalized);
        if (inferredFromNormalized) {
            return inferredFromNormalized;
        }

        const inferredFromSelection = this.extractGraphNameFromReference(selection);
        if (inferredFromSelection) {
            return inferredFromSelection;
        }

        if (!resolver || typeof resolver.normalize !== 'function') {
            return '';
        }

        if (!normalized) {
            try {
                normalized = resolver.normalize(selection);
            } catch (error) {
                console.debug('Failed to normalize graph link selection for fallback resolution', error);
                return '';
            }
            if (!normalized) {
                return '';
            }
        }

        const direct = this.extractGraphTitleFromSelection(selection);
        if (direct) {
            return direct;
        }

        let graphData = null;

        if (selection && typeof selection === 'object' && selection.graphData) {
            graphData = selection.graphData;
        }

        if (!graphData && typeof resolver.fetch === 'function') {
            try {
                const options = this.buildGraphLinkFetchOptions();
                const result = await resolver.fetch(normalized, options);
                if (result && result.graphData) {
                    graphData = result.graphData;
                }
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    console.warn('Graph link fetch failed while resolving title', error);
                }
            }
        }

        const extracted = this.extractGraphTitleFromData(graphData);
        if (extracted) {
            return extracted;
        }

        return normalized.key || '';
    }

    extractGraphNameFromReference(reference) {
        if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
            return '';
        }

        const rawSource = typeof reference.source === 'string'
            ? reference.source.trim().toLowerCase()
            : '';
        const rawKey = typeof reference.key === 'string'
            ? reference.key.trim()
            : '';

        if (!rawKey) {
            return '';
        }

        const source = rawSource || '';

        if (source === 'neo4j' || source === 'store') {
            return rawKey;
        }

        const sanitizeKey = value => {
            if (typeof value !== 'string') {
                return '';
            }
            let sanitized = value.trim();
            if (!sanitized) {
                return '';
            }
            const fragmentIndex = sanitized.indexOf('#');
            const queryIndex = sanitized.indexOf('?');
            let cutIndex = -1;
            if (fragmentIndex >= 0 && queryIndex >= 0) {
                cutIndex = Math.min(fragmentIndex, queryIndex);
            } else if (fragmentIndex >= 0) {
                cutIndex = fragmentIndex;
            } else if (queryIndex >= 0) {
                cutIndex = queryIndex;
            }
            if (cutIndex >= 0) {
                sanitized = sanitized.slice(0, cutIndex);
            }
            sanitized = sanitized.replace(/\\+/g, '/');
            sanitized = sanitized.replace(/^file:\/\//i, '');
            sanitized = sanitized.replace(/^\/+/, '');
            return sanitized;
        };

        const sanitizedKey = sanitizeKey(rawKey);
        const segments = sanitizedKey.split('/').filter(Boolean);
        let lastSegment = segments.length ? segments[segments.length - 1] : sanitizedKey;
        if (!lastSegment) {
            lastSegment = rawKey;
        }

        if (source === 'file') {
            const withoutExtension = lastSegment.replace(/\.qut$/i, '');
            return withoutExtension || lastSegment || rawKey;
        }

        const withoutExtension = lastSegment.replace(/\.qut$/i, '');
        return withoutExtension || lastSegment || rawKey;
    }

    handleGraphLinkClear(prefix = '') {
        const sourceField = document.getElementById(`${prefix}graph-link-source`);
        const keyField = document.getElementById(`${prefix}graph-link-key`);
        const hadSelection = Boolean(
            (sourceField && sourceField.value && sourceField.value.trim()) ||
            (keyField && keyField.value && keyField.value.trim())
        );
        this.clearGraphLinkFields(prefix);
        if (hadSelection) {
            this.refreshGraphLinkHint(prefix);
            this.saveChanges();
        }
    }

    async openGraphLinkPicker(prefix = '') {
        const typeField = document.getElementById(`${prefix}node-type`);
        if (typeField && typeField.value !== 'graph') {
            this.notifications?.show?.('Graph links are only available for graph nodes.', 'warning');
            return;
        }

        const resolver = window.GraphReferenceResolver;
        if (!resolver || typeof resolver.normalize !== 'function') {
            this.notifications?.show?.('Graph link selection requires the graph portal integration.', 'warning');
            return;
        }

        const neo4jAvailable = this.isNeo4jLinkAvailable();
        const fileSelectionAvailable = this.canSelectGraphFile();

        let selection = null;
        if (neo4jAvailable && fileSelectionAvailable) {
            const sourceChoice = await this.promptGraphLinkSource();
            if (!sourceChoice) {
                return;
            }
            if (sourceChoice === 'neo4j') {
                selection = await this.pickNeo4jGraph();
            } else if (sourceChoice === 'file') {
                selection = await this.pickWorkspaceGraph(prefix);
            }
        } else if (neo4jAvailable) {
            selection = await this.pickNeo4jGraph();
        } else if (fileSelectionAvailable) {
            selection = await this.pickWorkspaceGraph(prefix);
        } else {
            this.notifications?.show?.('No graph sources available. Configure Neo4j credentials or use a compatible browser.', 'warning');
            return;
        }

        if (selection && selection.key) {
            await this.applyGraphLinkSelection(selection, prefix);
        }
    }

    populateGraphLinkFields(data = {}, prefix = '', legacyLink = null) {
        const typeField = document.getElementById(`${prefix}node-type`);
        if (typeField && typeField.value !== 'graph') {
            this.clearGraphLinkFields(prefix);
            return;
        }
        const resolver = window.GraphReferenceResolver;
        const normalize = (value) => {
            if (!resolver || typeof resolver.normalize !== 'function') {
                return null;
            }
            try {
                return resolver.normalize(value);
            } catch (err) {
                console.warn('Failed to normalize graph link selection', err);
                return null;
            }
        };

        const portalLink = normalize(
            data && (data.graphLink || data.graphReference || data.reference || data.info)
        );

        const portalSource = document.getElementById(`${prefix}graph-link-source`);
        if (portalSource) {
            portalSource.value = portalLink && portalLink.source ? portalLink.source : '';
        }

        const portalKey = document.getElementById(`${prefix}graph-link-key`);
        if (portalKey) {
            portalKey.value = portalLink && portalLink.key ? portalLink.key : '';
        }

        const resolvedLegacy = legacyLink || this.normalizeGraphLinkPayload(
            data ? data.graphLink : null,
            data ? data.graphReference : null,
            data ? data.reference : null,
            data ? data.info : null
        );

        const legacySource = document.getElementById(`${prefix}node-graph-link-source`);
        if (legacySource && resolvedLegacy) {
            legacySource.value = resolvedLegacy.source || '';
        } else if (legacySource && !resolvedLegacy) {
            legacySource.value = '';
        }

        const legacyKey = document.getElementById(`${prefix}node-graph-link-key`);
        if (legacyKey && resolvedLegacy) {
            legacyKey.value = resolvedLegacy.key || resolvedLegacy.value || '';
        } else if (legacyKey && !resolvedLegacy) {
            legacyKey.value = '';
        }

        this.updateGraphLinkDisplay(prefix);
    }

    refreshGraphLinkHint(prefix = '') {
        const hint = document.getElementById(`${prefix}graph-link-hint`);
        if (!hint) {
            return;
        }

        const typeField = document.getElementById(`${prefix}node-type`);
        if (typeField && typeField.value !== 'graph') {
            hint.textContent = '';
            return;
        }

        const sourceField = document.getElementById(`${prefix}graph-link-source`);
        const keyField = document.getElementById(`${prefix}graph-link-key`);

        const rawSource = sourceField && typeof sourceField.value === 'string'
            ? sourceField.value.trim()
            : '';
        const rawKey = keyField && typeof keyField.value === 'string'
            ? keyField.value.trim()
            : '';

        if (!rawSource && !rawKey) {
            hint.textContent = 'Select a graph source and enter an identifier to link a graph.';
            return;
        }

        if (!rawSource || !rawKey) {
            hint.textContent = 'Both a source and an identifier are required to link a graph.';
            return;
        }

        const resolver = window.GraphReferenceResolver;
        if (resolver && typeof resolver.describe === 'function') {
            const description = resolver.describe({ source: rawSource, key: rawKey });
            if (description) {
                hint.textContent = description;
                return;
            }
        }

        hint.textContent = `${rawSource}:${rawKey}`;
    }

    buildGraphLinkFromForm(prefix = '') {
        const typeField = document.getElementById(`${prefix}node-type`);
        if (typeField && typeField.value !== 'graph') {
            return null;
        }
        const sourceField = document.getElementById(`${prefix}node-graph-link-source`);
        const keyField = document.getElementById(`${prefix}node-graph-link-key`);

        if (!sourceField || !keyField) {
            return null;
        }

        const sourceValue = typeof sourceField.value === 'string' ? sourceField.value.trim() : '';
        const keyValue = typeof keyField.value === 'string' ? keyField.value.trim() : '';

        if (!sourceValue || !keyValue) {
            return null;
        }

        const resolver = window.GraphReferenceResolver;
        if (resolver && typeof resolver.normalize === 'function') {
            try {
                const normalized = resolver.normalize({ source: sourceValue, key: keyValue });
                if (normalized && normalized.key) {
                    return {
                        source: normalized.source || sourceValue,
                        key: normalized.key
                    };
                }
            } catch (err) {
                console.warn('Failed to normalize graph link form values', err);
            }
        }

        return { source: sourceValue, key: keyValue };
    }
    
    /**
     * Helper to set form field values safely
     */
    setFieldValue(id, value) {
        const field = document.getElementById(id);
        if (field) {
            if (field.type === 'color') {
                const normalized = normalizeColorInput(value, '#000000');
                field.dataset.originalColor = normalized;
                field.dataset.userChanged = 'false';
                field.value = normalized;
            } else {
                field.value = value != null ? value : '';
            }
        }
    }

    isHtmlLikeString(value) {
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

    /**
     * Normalize graph link payloads into a consistent object shape.
     *
     * The node editor has historically supported both raw strings and
     * structured objects for nodes that reference external graphs. The
     * legacy implementation exposed a helper on the GraphRenderer object
     * which callers relied on when opening the editor. The GraphPortal
     * integration triggered those callers again, but the modular editor
     * never re-implemented the helper which resulted in a runtime error
     * when editing any node with a pending graph link.
     *
     * @param {string|object|null|undefined} payload Raw graph link payload.
     * @param {object} [options]
     * @param {string} [options.defaultType='text'] Default payload type.
     * @returns {object|null}
     */
    normalizeGraphLinkPayload(...args) {
        if (!args.length) {
            return null;
        }

        const candidates = [...args];
        let options = {};
        if (candidates.length) {
            const possibleOptions = candidates[candidates.length - 1];
            if (possibleOptions && typeof possibleOptions === 'object' && !Array.isArray(possibleOptions)) {
                const optionKeys = ['defaultType', 'fallbackSource'];
                const hasOptionKey = optionKeys.some(key => Object.prototype.hasOwnProperty.call(possibleOptions, key));
                const resemblesPayload = ['value', 'key', 'source', 'metadata', 'label'].some(key =>
                    Object.prototype.hasOwnProperty.call(possibleOptions, key)
                );
                if (hasOptionKey && !resemblesPayload) {
                    options = candidates.pop();
                }
            }
        }

        const settings = {
            defaultType: 'text',
            fallbackSource: 'store',
            ...options
        };

        const coerceString = (value) => {
            if (value == null) {
                return '';
            }
            return String(value).trim();
        };

        const resolver = window.GraphReferenceResolver;

        const normalizeSourceValue = (value) => {
            const trimmed = coerceString(value).toLowerCase();
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

        const inferSourceFromKey = (value) => {
            const keyValue = coerceString(value);
            if (!keyValue) {
                return settings.fallbackSource;
            }
            if (/^https?:\/\//i.test(keyValue)) {
                return 'url';
            }
            if (/[\\/]/.test(keyValue) || /\.qut$/i.test(keyValue)) {
                return 'file';
            }
            return settings.fallbackSource;
        };

        const attemptNormalize = (candidate) => {
            if (!candidate) {
                return null;
            }

            if (resolver && typeof resolver.normalize === 'function') {
                if (typeof candidate === 'string' && this.isHtmlLikeString(candidate)) {
                    return null;
                }
                const normalized = resolver.normalize(candidate);
                if (normalized && normalized.key) {
                    const resolvedSource = normalized.source
                        ? normalizeSourceValue(normalized.source)
                        : '';
                    return {
                        type: settings.defaultType,
                        value: normalized.key,
                        label: '',
                        metadata: {},
                        source: resolvedSource || inferSourceFromKey(normalized.key),
                        key: normalized.key
                    };
                }
            }

            if (typeof candidate === 'string' || typeof candidate === 'number') {
                const value = coerceString(candidate);
                if (!value) {
                    return null;
                }
                if (this.isHtmlLikeString(value)) {
                    return null;
                }
                const source = inferSourceFromKey(value);
                return {
                    type: settings.defaultType,
                    value,
                    label: '',
                    metadata: {},
                    source,
                    key: value
                };
            }

            if (typeof candidate !== 'object') {
                return null;
            }

            const normalized = {
                type: settings.defaultType,
                value: '',
                label: '',
                metadata: {},
                source: settings.fallbackSource,
                key: ''
            };

            const explicitType = coerceString(candidate.type);
            if (explicitType) {
                normalized.type = explicitType;
            }

            const label = coerceString(candidate.label);
            if (label) {
                normalized.label = label;
            }

            const keyCandidates = [
                coerceString(candidate.key),
                coerceString(candidate.graphReference),
                coerceString(candidate.reference),
                coerceString(candidate.info),
                coerceString(candidate.value),
                coerceString(candidate.graphId),
                coerceString(candidate.id),
                coerceString(candidate.url)
            ];

            const resolvedKey = keyCandidates.find(entry => entry && !this.isHtmlLikeString(entry));
            if (!resolvedKey) {
                return null;
            }

            normalized.value = resolvedKey;
            normalized.key = resolvedKey;

            const sourceValue = normalizeSourceValue(candidate.source || candidate.mode || candidate.kind || candidate.type);
            if (sourceValue) {
                normalized.source = sourceValue;
            } else {
                normalized.source = inferSourceFromKey(resolvedKey);
            }

            const metaSource = typeof candidate.metadata === 'object' && candidate.metadata !== null
                ? candidate.metadata
                : (typeof candidate.meta === 'object' && candidate.meta !== null ? candidate.meta : null);

            if (metaSource) {
                normalized.metadata = { ...metaSource };
            }

            return normalized;
        };

        for (const candidate of candidates) {
            const normalized = attemptNormalize(candidate);
            if (normalized) {
                return normalized;
            }
        }

        return null;
    }

    buildBasicTextNodeHtml(title, body) {
        if (window.QuantickleUtils && typeof window.QuantickleUtils.buildBasicCalloutHtml === 'function') {
            return window.QuantickleUtils.buildBasicCalloutHtml(title, body);
        }
        const safeTitle = title == null ? '' : String(title);
        const safeBody = body == null ? '' : String(body);
        return `<div class="text-node-title">${safeTitle}</div><div class="text-node-body">${safeBody}</div>`;
    }

    async generateTextNodeHtml(title, body) {
        if (window.wrapSummaryHtml && typeof window.wrapSummaryHtml === 'function') {
            return window.wrapSummaryHtml({ title, body });
        }
        try {
            const mod = await import('/js/rag-pipeline.js');
            const wrapSummaryHtml = mod.wrapSummaryHtml || mod.defaultWrapSummaryHtml;
            return wrapSummaryHtml({ title, body });
        } catch (err) {
            console.error('Failed to load summary template:', err);
            return this.buildBasicTextNodeHtml(title, body);
        }
    }
    
    /**
     * Save changes from the editor
     */
    saveChanges() {
        if (!this.selectedNode) return;

        const prefix = this.isBulkEdit ? 'bulk-' : '';

        const wasFieldChanged = (id) => {
            if (!this.isBulkEdit) {
                return true;
            }
            const el = document.getElementById(`${prefix}${id}`);
            return el ? el.dataset.userChanged === 'true' : false;
        };

        const getFieldValue = (id, parser) => {
            const el = document.getElementById(`${prefix}${id}`);
            if (!el) return undefined;
            if (this.isBulkEdit && el.dataset.userChanged !== 'true') {
                return undefined;
            }
            const rawValue = el.type === 'checkbox' ? el.checked : el.value;
            return parser ? parser(rawValue, el) : rawValue;
        };

        const getColorValue = id => {
            const el = document.getElementById(`${prefix}${id}`);
            if (!el) return undefined;
            const original = el.dataset.originalColor;

            // For single-node edits, always use the current value so the editor
            // applies the user's selection immediately. Bulk edits still respect
            // the "userChanged" flag to avoid unintentionally overwriting
            // multiple nodes when the field wasn't touched.
            if (!this.isBulkEdit) {
                return normalizeColorInput(el.value, original || '#000000');
            }

            const userChanged = el.dataset.userChanged === 'true';
            if (!userChanged && !original) {
                return undefined;
            }
            if (!userChanged && original) {
                return original;
            }
            return normalizeColorInput(el.value, original || '#000000');
        };

        if (!this.isBulkEdit) {
            const newId = document.getElementById('node-id').value.trim();
            const currentId = this.selectedNode.id();
            if (newId && newId !== currentId) {
                if (this.cy.getElementById(newId).length > 0) {
                    this.notifications.show(`Node ID "${newId}" already exists`, 'error');
                    return;
                }
                const renamed = this.renameNodeId(currentId, newId);
                if (!renamed) {
                    return;
                }
                this.selectedNode = renamed;
            }
        }

        const currentData = this.selectedNode ? this.selectedNode.data() : {};
        const resolver = window.GraphReferenceResolver;
        const currentInfoHtml = currentData ? currentData.infoHtml : null;
        const currentInfo = currentData ? currentData.info : null;
        const safeInfo = (currentInfoHtml && this.isHtmlLikeString(currentInfo)) ? null : currentInfo;
        const existingGraphLink = this.normalizeGraphLinkPayload(
            currentData ? currentData.graphLink : null,
            currentData ? currentData.graphReference : null,
            currentData ? currentData.reference : null,
            safeInfo
        );

        const baseUpdates = {
            type: getFieldValue('node-type', v => v),
            color: getColorValue('node-color'),
            size: getFieldValue('node-size', v => parseInt(v)),
            opacity: getFieldValue('node-opacity', v => parseFloat(v)),
            borderColor: getColorValue('node-border-color'),
            shape: getFieldValue('node-shape', v => v),
            weight: getFieldValue('node-weight', v => parseFloat(v) || 1),
            icon: getFieldValue('node-icon', v => (v || '').trim()),
            backgroundFit: getFieldValue('node-background-fit', v => resolveBackgroundFitValue(v, 'contain')),
            iconOpacity: getFieldValue('icon-opacity', v => parseFloat(v)),
            info: getFieldValue('node-info', raw => { return window.DOMPurify ? DOMPurify.sanitize(raw) : raw; }),
            fontFamily: getFieldValue('node-font-family', v => v),
            fontSize: getFieldValue('node-font-size', v => parseInt(v)),
            fontColor: (() => { const val = getColorValue('node-font-color'); return val !== undefined ? val : undefined; })(),
            bold: getFieldValue('node-font-bold', v => !!v),
            italic: getFieldValue('node-font-italic', v => !!v),
            width: getFieldValue('node-width', v => parseInt(v)),
            zoom: getFieldValue('node-zoom', v => parseFloat(v))
        };

        const effectiveType = baseUpdates.type || currentData.type || 'default';
        const isTextType = effectiveType === 'text';

        if (!isTextType) {
            delete baseUpdates.fontFamily;
            delete baseUpdates.fontSize;
            delete baseUpdates.fontColor;
            delete baseUpdates.bold;
            delete baseUpdates.italic;
        }

        const timestampValue = getFieldValue('node-timestamp', raw => raw);
        let didUpdateTimestamp = false;
        if (timestampValue !== undefined) {
            const newTimestamp = timestampValue ? new Date(timestampValue).toISOString() : '';
            baseUpdates.timestamp = newTimestamp;
            const hasChangedTimestamp = newTimestamp !== this.originalTimestamp;
            this.timestampChanged = this.timestampChanged || hasChangedTimestamp;
            didUpdateTimestamp = hasChangedTimestamp;
        }

        if (!this.isBulkEdit) {
            baseUpdates.label = document.getElementById('node-label').value;
            baseUpdates.labelVisible = document.getElementById('node-show-label').checked;
        }

        let graphLinkSelection = null;
        const graphFieldsChanged = wasFieldChanged('graph-link-source')
            || wasFieldChanged('graph-link-key')
            || wasFieldChanged('node-graph-link-source')
            || wasFieldChanged('node-graph-link-key');
        const graphChangeRequested = effectiveType === 'graph' && (graphFieldsChanged || baseUpdates.type === 'graph');

        if (graphChangeRequested) {
            const sourceEl = document.getElementById(`${prefix}graph-link-source`);
            const keyEl = document.getElementById(`${prefix}graph-link-key`);
            const sourceValue = sourceEl ? sourceEl.value.trim() : '';
            const keyValue = keyEl ? keyEl.value.trim() : '';
            if (sourceValue && keyValue) {
                const normalized = resolver && typeof resolver.normalize === 'function'
                    ? resolver.normalize({ source: sourceValue, key: keyValue })
                    : { source: sourceValue, key: keyValue };
                graphLinkSelection = normalized
                    ? { source: normalized.source || sourceValue, key: normalized.key || keyValue }
                    : { source: sourceValue, key: keyValue };
            }
            if (graphLinkSelection) {
                baseUpdates.graphLink = graphLinkSelection;
                const infoString = resolver && typeof resolver.stringify === 'function'
                    ? resolver.stringify(graphLinkSelection)
                    : `${graphLinkSelection.source}:${graphLinkSelection.key}`;
                baseUpdates.graphReference = infoString;
                if (typeof baseUpdates.info === 'string') {
                    const trimmedInfo = baseUpdates.info.trim();
                    if (!trimmedInfo) {
                        baseUpdates.info = infoString;
                    }
                }
            } else {
                delete baseUpdates.graphLink;
                delete baseUpdates.graphReference;
            }
        } else {
            delete baseUpdates.graphLink;
            delete baseUpdates.graphReference;
        }

        if (effectiveType === 'text') {
            const conversion = this.pendingTextConversion || {};
            const sanitize = value => (window.DOMPurify ? DOMPurify.sanitize(value || '') : (value || ''));
            const rawTitle = conversion.title !== undefined ? conversion.title : baseUpdates.label;
            const rawBody = conversion.body !== undefined ? conversion.body : baseUpdates.info;
            const title = sanitize(rawTitle);
            const body = sanitize(rawBody);
            baseUpdates.label = title;
            baseUpdates.info = body;
            baseUpdates.labelVisible = false;
            baseUpdates.fontFamily = baseUpdates.fontFamily
                || currentData.fontFamily
                || 'Arial';
            baseUpdates.fontSize = (!Number.isNaN(baseUpdates.fontSize) && baseUpdates.fontSize !== undefined)
                ? baseUpdates.fontSize
                : (currentData.fontSize || 14);
            baseUpdates.fontColor = baseUpdates.fontColor
                || currentData.fontColor
                || '#333333';
            baseUpdates.bold = baseUpdates.bold !== undefined
                ? baseUpdates.bold
                : (currentData.bold || false);
            baseUpdates.italic = baseUpdates.italic !== undefined
                ? baseUpdates.italic
                : (currentData.italic || false);
            baseUpdates.infoHtml = this.buildBasicTextNodeHtml(title, body);

            const calloutUtils = window.QuantickleUtils || {};
            const calloutPayload = calloutUtils.normalizeCalloutPayload
                ? calloutUtils.normalizeCalloutPayload({ title, body, format: 'text' }, { defaultFormat: 'text' })
                : { title, body, format: 'text' };
            if (calloutUtils.syncCalloutLegacyFields) {
                calloutUtils.syncCalloutLegacyFields(baseUpdates, calloutPayload, {
                    defaultFormat: 'text',
                    html: baseUpdates.infoHtml,
                    syncTitle: true,
                    overwriteInfo: true,
                    includeDerivedFields: true
                });
            } else {
                baseUpdates.callout = calloutPayload;
            }

            if (this.selectedNode) {
                const existingWidthMode = this.selectedNode.data('textWidthMode');
                if (existingWidthMode) {
                    baseUpdates.textWidthMode = existingWidthMode;
                }
                const existingHeightMode = this.selectedNode.data('textHeightMode');
                if (existingHeightMode) {
                    baseUpdates.textHeightMode = existingHeightMode;
                }

                if (existingWidthMode === 'fixed' && baseUpdates.width === undefined) {
                    const storedWidth = parseFloat(this.selectedNode.data('width'));
                    if (Number.isFinite(storedWidth) && storedWidth > 0) {
                        baseUpdates.width = storedWidth;
                    }
                }

                if (existingHeightMode === 'fixed' && baseUpdates.height === undefined) {
                    const storedHeight = parseFloat(this.selectedNode.data('height'));
                    if (Number.isFinite(storedHeight) && storedHeight > 0) {
                        baseUpdates.height = storedHeight;
                    }
                }
            }
        }

        if (graphChangeRequested) {
            const graphLinkFromForm = this.buildGraphLinkFromForm(prefix);
            if (graphLinkFromForm) {
                baseUpdates.graphLink = graphLinkFromForm;
                baseUpdates.graphReference = graphLinkFromForm.key;
                baseUpdates.info = graphLinkFromForm.key;
            } else if (existingGraphLink) {
                const keyField = document.getElementById(`${prefix}node-graph-link-key`);
                const keyValue = keyField && typeof keyField.value === 'string' ? keyField.value.trim() : '';
                if (!keyValue) {
                    baseUpdates.graphLink = null;
                    baseUpdates.graphReference = '';
                } else {
                    baseUpdates.graphReference = keyValue;
                }
            }

            if (baseUpdates.graphReference === undefined) {
                const infoString = typeof baseUpdates.info === 'string' ? baseUpdates.info.trim() : '';
                const hasInfoHtml = baseUpdates.infoHtml || currentInfoHtml;
                if (!hasInfoHtml || !this.isHtmlLikeString(infoString)) {
                    baseUpdates.graphReference = infoString;
                }
            }
        }

        const textContainer = document.getElementById(`${prefix}text-options`);
        if (textContainer) {
            textContainer.style.display = baseUpdates.type === 'text' ? 'block' : 'none';
        }

        const nodes = (this.selectedNodes && this.selectedNodes.length > 0)
            ? this.selectedNodes
            : [this.selectedNode];

        const textNodesToRefresh = [];

        this.cy.batch(() => {
            nodes.forEach(node => {
                if (node.data('type') === 'timeline-bar') {
                    const allowed = {
                        color: baseUpdates.color,
                        borderColor: baseUpdates.borderColor,
                        size: baseUpdates.size
                    };
                    Object.keys(allowed).forEach(key => node.data(key, allowed[key]));
                    this.applyNodeStyles(node);
                    return;
                }
                const updates = { ...baseUpdates };
                if (updates.type === undefined) {
                    updates.type = node.data('type');
                }
                if (node.hasClass('container')) {
                    updates.borderColor = '#000000';
                    if (updates.label !== undefined) {
                        const labelValue = updates.label;
                        if (typeof labelValue === 'string') {
                            const trimmedLabel = labelValue.replace(/\s*[\u25B6\u25BC]\s*$/, '');
                            updates.label = trimmedLabel;
                            updates.baseLabel = trimmedLabel;
                        } else {
                            updates.baseLabel = labelValue;
                        }
                    }
                }
                Object.entries(updates).forEach(([key, value]) => {
                    if (value === undefined) return;
                    if (typeof value === 'number' && Number.isNaN(value)) return;
                    node.data(key, value);
                });
                if (graphChangeRequested || (baseUpdates.type && baseUpdates.type !== 'graph')) {
                    if (updates.type === 'graph') {
                        if (!graphLinkSelection && typeof node.removeData === 'function') {
                            node.removeData('graphLink');
                            node.removeData('graphReference');
                        }
                    } else if (typeof node.removeData === 'function') {
                        node.removeData('graphLink');
                        node.removeData('graphReference');
                        node.removeData('graphLoaded');
                    }
                }
                this.applyNodeStyles(node);
                this.sanitizeBackgroundImageTarget(node);
                if (this.nodeHasTimestamp(node)) {
                    node.data('_timelineEditorTouched', true);
                } else if (typeof node.removeData === 'function') {
                    node.removeData('_timelineEditorTouched');
                } else if (typeof node.data === 'function') {
                    node.data('_timelineEditorTouched', undefined);
                }
                if (updates.type === "text" && node && typeof node.data === 'function') {
                    textNodesToRefresh.push(node);
                }
            });
        });

        if (window.TextCallout && typeof window.TextCallout.refresh === 'function') {
            textNodesToRefresh.forEach(node => window.TextCallout.refresh(node));
        }

        this.pendingTextConversion = null;

        if (graphChangeRequested) {
            this.refreshGraphLinkHint(prefix);
        } else if (baseUpdates.type && baseUpdates.type !== 'graph') {
            this.clearGraphLinkFields(prefix);
        }
        this.synchronizeGraphData();

        this.refreshDynamicNodeStyles();

        if (didUpdateTimestamp) {
            const containers = this.getTimelineContainersForNodes(nodes);
            const containersToReflow = containers.map(container => {
                const layoutName = this.getLayoutNameForNode(container);
                return { container, layoutName };
            }).filter(entry => {
                if (!entry || !entry.container) {
                    return false;
                }
                if (!this.isTimelineLayout(entry.layoutName)) {
                    return false;
                }
                const containerId = typeof entry.container.id === 'function' ? entry.container.id() : null;
                return this.isTimelineLayoutAppliedForScope(containerId);
            });

            containersToReflow.forEach(({ container, layoutName }) => {
                const targetLayout = this.isTimelineLayout(layoutName) ? layoutName : 'timeline';
                this.reapplyTimeBasedLayout(targetLayout, { container });
            });
        }
    }

    renameNodeId(oldId, newId) {
        const node = this.cy.getElementById(oldId);
        if (!node || node.empty()) return null;

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
        const newNode = this.cy.add({ group: 'nodes', data, position });
        edges.forEach(ed => this.cy.add({ group: 'edges', data: ed }));

        if (window.DataManager && typeof window.DataManager.getGraphData === 'function' && typeof window.DataManager.setGraphData === 'function') {
            const currentData = window.DataManager.getGraphData();
            const nodes = currentData.nodes.map(n => {
                const nd = n.data || n;
                if (nd.id === oldId) {
                    return { ...n, data: { ...nd, id: newId } };
                }
                return n;
            });
            const edgesData = currentData.edges.map(e => {
                const ed = e.data || e;
                const newEdge = { ...e, data: { ...ed } };
                if (newEdge.data.source === oldId) newEdge.data.source = newId;
                if (newEdge.data.target === oldId) newEdge.data.target = newId;
                newEdge.data.id = `${newEdge.data.source}-${newEdge.data.target}`;
                return newEdge;
            });
            window.DataManager.setGraphData({ nodes, edges: edgesData }, { skipLayout: true });
        }

        this.refreshSourceEditor();

        if (window.TableManager && typeof window.TableManager.updateNodesDataTable === 'function') {
            window.TableManager.updateNodesDataTable();
        }

        return newNode;
    }
    
    /**
     * Apply visual styles to the node based on its data
     */
    applyNodeStyles(node = this.selectedNode) {
        if (!node) return;

        const data = node.data();

        const baseStyles = {
            'background-color': data.color,
            'opacity': data.opacity,
            'border-color': data.borderColor,
            'border-width': data.borderWidth || 0,
            'shape': data.shape,
            'label': data.label,
            'text-opacity': data.labelVisible !== false ? 1 : 0,
            'background-opacity': data.iconOpacity != null ? data.iconOpacity : 1
        };

        const normalizeNumeric = value => {
            if (value == null || value === '') {
                return NaN;
            }

            const numeric = typeof value === 'number' ? value : parseFloat(value);
            return Number.isFinite(numeric) ? numeric : NaN;
        };

        const normalizeBackgroundImage = value => {
            if (typeof value !== 'string') {
                return null;
            }

            const trimmed = value.trim();
            if (!trimmed || trimmed.toLowerCase() === 'none') {
                return null;
            }

            if (/^url\(/i.test(trimmed)) {
                return trimmed;
            }

            const escaped = trimmed.replace(/"/g, '\\"');
            return `url("${escaped}")`;
        };
        const resolveBackgroundDimension = (value) => {
            if (value === null || value === undefined) {
                return null;
            }
            if (typeof value === 'string' && !value.trim()) {
                return null;
            }
            return value;
        };

        if (data.type === 'timeline-bar') {
            baseStyles.width = data.barLength;
            baseStyles.height = data.size;
        } else {
            baseStyles.width = data.size;
            baseStyles.height = data.size;
        }

        const isGraphLikeNode = data.type === 'graph' || data.type === 'graph-return';
        if (isGraphLikeNode) {
            const sizeValue = normalizeNumeric(data.size);
            const borderWidthValue = normalizeNumeric(data.borderWidth);

            const enforcedFill = '#ede9fe';
            const enforcedBorder = '#c4b5fd';
            const enforcedShadow = 'rgba(196, 181, 253, 0.45)';
            const enforcedTextColor = data.labelColor || data.fontColor || '#312e81';

            baseStyles['background-color'] = enforcedFill;
            baseStyles['border-color'] = enforcedBorder;
            baseStyles['border-width'] = Number.isFinite(borderWidthValue)
                ? Math.max(borderWidthValue, 4)
                : 4;
            baseStyles.width = Number.isFinite(sizeValue) ? Math.max(sizeValue, 80) : 80;
            baseStyles.height = Number.isFinite(sizeValue) ? Math.max(sizeValue, 80) : 80;
            baseStyles['color'] = enforcedTextColor;
            baseStyles['font-weight'] = data.bold !== undefined
                ? (data.bold ? 'bold' : 'normal')
                : 'bold';
            baseStyles['text-outline-width'] = 0;
            if (this.supportsShadowStyles) {
                baseStyles['shadow-blur'] = 12;
                baseStyles['shadow-color'] = enforcedShadow;
                baseStyles['shadow-offset-x'] = 0;
                baseStyles['shadow-offset-y'] = 0;
            }
            baseStyles['shape'] = 'round-rectangle';

            const graphBackgroundImage = (() => {
                const candidates = [
                    typeof data.backgroundImage === 'string' ? data.backgroundImage : null,
                    typeof data.icon === 'string' ? data.icon : null,
                    (window.NodeTypes && data.type && window.NodeTypes[data.type] && window.NodeTypes[data.type].icon)
                        ? window.NodeTypes[data.type].icon
                        : null,
                    (window.NodeTypes && window.NodeTypes.graph && window.NodeTypes.graph.icon)
                        ? window.NodeTypes.graph.icon
                        : null
                ];

                for (const candidate of candidates) {
                    const normalized = normalizeBackgroundImage(candidate);
                    if (normalized) {
                        return normalized;
                    }
                }

                return null;
            })();

            if (graphBackgroundImage) {
                const backgroundFit = resolveBackgroundFitForData(data);
                const backgroundPositionX = resolveBackgroundPositionValue(data.backgroundPositionX, '50%');
                const backgroundPositionY = resolveBackgroundPositionValue(data.backgroundPositionY, '50%');
                baseStyles['background-image'] = graphBackgroundImage;
                baseStyles['background-fit'] = backgroundFit;
                baseStyles['background-position-x'] = backgroundPositionX;
                baseStyles['background-position-y'] = backgroundPositionY;
                baseStyles['background-repeat'] = 'no-repeat';
                baseStyles['background-width'] = '70%';
                baseStyles['background-height'] = '70%';
            } else {
                baseStyles['background-image'] = 'none';
            }
        }

        if (data.fontColor) {
            baseStyles.color = data.fontColor;
        }
        if (data.labelColor) {
            baseStyles.color = data.labelColor;
        }
        if (data.fontSize) {
            baseStyles['font-size'] = data.fontSize;
        }
        if (data.fontFamily) {
            baseStyles['font-family'] = data.fontFamily;
        }
        if (data.bold !== undefined) {
            baseStyles['font-weight'] = data.bold ? 'bold' : 'normal';
        }
        if (data.italic !== undefined) {
            baseStyles['font-style'] = data.italic ? 'italic' : 'normal';
        }

        const backgroundImage = data.backgroundImage;
        if (!isGraphLikeNode && backgroundImage && backgroundImage !== 'none') {
            const backgroundFit = resolveBackgroundFitForData(data);
            const backgroundPositionX = resolveBackgroundPositionValue(data.backgroundPositionX, '50%');
            const backgroundPositionY = resolveBackgroundPositionValue(data.backgroundPositionY, '50%');
            const backgroundWidth = resolveBackgroundDimension(data.backgroundWidth);
            const backgroundHeight = resolveBackgroundDimension(data.backgroundHeight);
            baseStyles['background-image'] = backgroundImage;
            baseStyles['background-fit'] = backgroundFit;
            baseStyles['background-position-x'] = backgroundPositionX;
            baseStyles['background-position-y'] = backgroundPositionY;
            baseStyles['background-repeat'] = 'no-repeat';
            baseStyles['background-width'] = backgroundWidth || 'auto';
            baseStyles['background-height'] = backgroundHeight || 'auto';
        }

        if (data.type === 'text') {
            baseStyles.label = data.label || '';
            baseStyles['text-opacity'] = data.labelVisible !== false ? 1 : 0;

            const parseDimension = value => {
                if (value == null || value === '' || value === 'auto') {
                    return NaN;
                }
                const numeric = typeof value === 'number' ? value : parseFloat(value);
                return Number.isFinite(numeric) && numeric > 0 ? numeric : NaN;
            };

            const widthMode = node.data('textWidthMode') || data.textWidthMode;
            const heightMode = node.data('textHeightMode') || data.textHeightMode;
            const storedWidth = parseDimension(data.width);
            const storedHeight = parseDimension(data.height);
            const manualWidth = widthMode === 'fixed' && Number.isFinite(storedWidth);
            const manualHeight = heightMode === 'fixed' && Number.isFinite(storedHeight);

            const fallbackSize = Number.isFinite(data.size) && data.size > 0 ? data.size : 30;
            const computeDimensions = () => {
                if (window.GraphRenderer && typeof window.GraphRenderer.calculateTextDimensions === 'function') {
                    return window.GraphRenderer.calculateTextDimensions(
                        data.info || '',
                        data.fontFamily || 'Arial',
                        data.fontSize || 14,
                        manualWidth ? storedWidth : undefined
                    );
                }
                const fallbackWidth = manualWidth && Number.isFinite(storedWidth)
                    ? storedWidth
                    : fallbackSize;
                const fallbackHeight = manualHeight && Number.isFinite(storedHeight)
                    ? storedHeight
                    : fallbackSize;
                return { width: fallbackWidth, height: fallbackHeight };
            };

            const dims = computeDimensions() || {};
            const targetWidth = manualWidth
                ? storedWidth
                : (Number.isFinite(dims.width) && dims.width > 0 ? dims.width : fallbackSize);
            const targetHeight = manualHeight
                ? storedHeight
                : (Number.isFinite(dims.height) && dims.height > 0 ? dims.height : fallbackSize);

            baseStyles.width = targetWidth;
            baseStyles.height = targetHeight;
            baseStyles['background-opacity'] = 0;
            baseStyles['border-width'] = data.borderWidth || 1;
            baseStyles['border-color'] = data.borderColor || '#000000';
            baseStyles['text-wrap'] = 'wrap';
            if (Number.isFinite(targetWidth) && targetWidth > 0) {
                baseStyles['text-max-width'] = targetWidth;
            } else {
                delete baseStyles['text-max-width'];
            }

            if (manualWidth) {
                node.data('width', storedWidth);
                node.data('textWidthMode', 'fixed');
            } else {
                node.removeData('width');
                if (widthMode) {
                    node.removeData('textWidthMode');
                }
            }

            if (manualHeight) {
                node.data('height', storedHeight);
                node.data('textHeightMode', 'fixed');
            } else {
                node.removeData('height');
                if (heightMode) {
                    node.removeData('textHeightMode');
                }
            }

            const computedSize = Math.max(
                Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : fallbackSize,
                Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : fallbackSize
            );
            node.data('size', computedSize);
        }

        if (data.type === 'magnifier') {
            const w = data.width || data.size;
            const h = data.height || data.size;
            baseStyles.width = w;
            baseStyles.height = h;
            baseStyles['background-opacity'] = 0;
            baseStyles['border-width'] = data.borderWidth || 1;
        }

        node.style(baseStyles);

        this.applyIconStyle(node, data.icon);

        if (data.labelPlacement && data.labelPlacement !== 'dynamic') {
            let textHalign = 'center';
            let textValign = 'center';
            switch (data.labelPlacement) {
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
        } else {
            node.style({
                'text-halign': 'center',
                'text-valign': 'center'
            });
        }

        // Enforce border styling for container nodes
        if (node.hasClass('container')) {
            node.style({
                'border-width': 1,
                'border-color': '#000000'
            });
        }
    }

    /**
     * Apply icon styling to a node based on icon input
     */
    applyIconStyle(node, icon) {
        if (!node) return;

        let sanitizedIcon = typeof icon === 'string' ? icon.trim() : '';
        if (sanitizedIcon && /^data:/i.test(sanitizedIcon)) {
            sanitizedIcon = '';
            if (this.notifications && typeof this.notifications.show === 'function') {
                this.notifications.show('Embedded images are not supported for node icons. Please use an image URL instead.', 'warning');
            }
        }

        const apply = (url, storedIcon = sanitizedIcon) => {
            const bg = url ? `url("${url}")` : 'none';
            node.data('icon', url ? storedIcon : '');
            node.data('backgroundImage', bg);

            if (bg !== 'none') {
                const baseColor = node.data('color') || '#ffffff';
                const lighterColor = window.GraphRenderer && window.GraphRenderer.lightenColor
                    ? window.GraphRenderer.lightenColor(baseColor, 0.4)
                    : baseColor;
                const storedFit = typeof node.data === 'function' ? node.data('backgroundFit') : null;
                const fitValue = resolveBackgroundFitValue(storedFit, resolveBackgroundFitForData(node.data()));
                const resolveBackgroundDimension = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    if (typeof value === 'string' && !value.trim()) {
                        return null;
                    }
                    return value;
                };
                const backgroundWidth = resolveBackgroundDimension(node.data('backgroundWidth'));
                const backgroundHeight = resolveBackgroundDimension(node.data('backgroundHeight'));
                const positionX = resolveBackgroundPositionValue(node.data('backgroundPositionX'), '50%');
                const positionY = resolveBackgroundPositionValue(node.data('backgroundPositionY'), '50%');
                node.style({
                    'background-image': bg,
                    'background-color': lighterColor,
                    'background-fit': fitValue,
                    'background-repeat': 'no-repeat',
                    'background-position-x': positionX,
                    'background-position-y': positionY,
                    'background-width': backgroundWidth || 'auto',
                    'background-height': backgroundHeight || 'auto'
                });
            } else {
                node.style('background-image', 'none');
            }
        };

        const fallback = () => apply(null);

        const resolveImageUrl = async () => {
            if (!sanitizedIcon) {
                return null;
            }

            if (window.IconConfigs && window.IconConfigs[sanitizedIcon]) {
                const mapped = window.IconConfigs[sanitizedIcon];
                if (typeof mapped === 'string') {
                    const trimmedMapped = mapped.trim();
                    const isRemote = /^(https?:|file:|data:|blob:)/i.test(trimmedMapped);
                    if (!isRemote && window.WorkspaceManager && window.WorkspaceManager.handle) {
                        if (window.DomainLoader && typeof window.DomainLoader.resolveIcon === 'function') {
                            try {
                                return await window.DomainLoader.resolveIcon(sanitizedIcon);
                            } catch (err) {
                                console.warn('Failed to resolve mapped icon through DomainLoader, using mapped value', err);
                            }
                        }
                    }
                }
                return mapped;
            }

            const looksLikePath = /^(https?:|file:)/.test(sanitizedIcon) ||
                sanitizedIcon.startsWith('/') || sanitizedIcon.startsWith('./') || sanitizedIcon.startsWith('../') ||
                /\.(png|jpe?g|gif|svg|webp)$/i.test(sanitizedIcon);

            if (!looksLikePath) {
                return null;
            }

            if (window.DomainLoader && typeof window.DomainLoader.resolveIcon === 'function') {
                try {
                    return await window.DomainLoader.resolveIcon(sanitizedIcon);
                } catch (err) {
                    console.warn('Failed to resolve icon through DomainLoader, using original value', err);
                }
            }

            return sanitizedIcon;
        };

        const applyResolvedImage = (url) => {
            if (!url) {
                fallback();
                return;
            }

            if (sanitizedIcon && sanitizedIcon !== url) {
                if (!window.IconConfigs || typeof window.IconConfigs !== 'object') {
                    window.IconConfigs = {};
                }
                if (window.IconConfigs[sanitizedIcon] !== url) {
                    window.IconConfigs[sanitizedIcon] = url;
                }
            }

            if (typeof Image !== 'undefined') {
                const img = new Image();
                img.onload = () => apply(url);
                img.onerror = fallback;
                img.src = url;
            } else {
                apply(url);
            }
        };

        Promise.resolve(resolveImageUrl())
            .then(applyResolvedImage)
            .catch(err => {
                console.warn('Unexpected error resolving icon image', err);
                fallback();
            });
    }

    getIconBackgroundReference(icon) {
        if (typeof icon !== 'string') {
            return null;
        }

        const trimmedIcon = icon.trim();
        if (!trimmedIcon) {
            return null;
        }

        const candidates = [];
        if (window.IconConfigs && typeof window.IconConfigs === 'object') {
            const mapped = window.IconConfigs[trimmedIcon];
            if (typeof mapped === 'string' && mapped.trim()) {
                candidates.push(mapped.trim());
            }
        }

        const pathLike = /^(https?:|file:)/i.test(trimmedIcon) ||
            trimmedIcon.startsWith('/') ||
            trimmedIcon.startsWith('./') ||
            trimmedIcon.startsWith('../') ||
            /\.(png|jpe?g|gif|svg|webp)$/i.test(trimmedIcon);

        if (pathLike) {
            candidates.push(trimmedIcon);
        }

        for (const candidate of candidates) {
            if (typeof candidate !== 'string') {
                continue;
            }
            const normalized = candidate.trim();
            if (!normalized || /^data:/i.test(normalized)) {
                continue;
            }
            if (/^url\(/i.test(normalized)) {
                return normalized;
            }
            const escaped = normalized.replace(/"/g, '\\"');
            return `url("${escaped}")`;
        }

        return null;
    }

    refreshDynamicNodeStyles() {
        if (!this.cy) {
            return;
        }

        if (window.LayoutManager) {
            if (typeof window.LayoutManager.requestDynamicStyleRefresh === 'function') {
                window.LayoutManager.requestDynamicStyleRefresh(this.cy);
                return;
            }

            if (
                typeof window.LayoutManager.calculateOptimalSizing === 'function' &&
                typeof window.LayoutManager.updateNodeStyles === 'function'
            ) {
                try {
                    const sizing = window.LayoutManager.calculateOptimalSizing(this.cy);
                    if (sizing) {
                        window.LayoutManager.updateNodeStyles(this.cy, sizing);
                    }
                } catch (error) {
                    console.warn('[NodeEditor] Failed to refresh node styles:', error);
                }
            }
        }
    }

    sanitizeBackgroundImageTarget(target) {
        if (!target) {
            return;
        }

        const data = (typeof target.data === 'function') ? target.data() : target;
        if (!data || typeof data !== 'object') {
            return;
        }

        const dataUriPattern = /^\s*(?:url\((['"]?)\s*)?data:/i;
        const keys = ['backgroundImage', 'background-image'];

        keys.forEach(key => {
            const value = data[key];
            if (typeof value !== 'string') {
                return;
            }
            const trimmed = value.trim();
            if (!trimmed || !dataUriPattern.test(trimmed)) {
                return;
            }

            const replacement = this.getIconBackgroundReference(data.icon);

            if (replacement) {
                if (typeof target.data === 'function' && key === 'backgroundImage') {
                    target.data('backgroundImage', replacement);
                } else {
                    data[key] = replacement;
                }
                if (typeof target.style === 'function' && key === 'background-image') {
                    target.style('background-image', replacement);
                }
                return;
            }

            if (typeof target.style === 'function') {
                target.style('background-image', 'none');
            }

            if (typeof target.removeData === 'function' && key === 'backgroundImage') {
                target.removeData('backgroundImage');
                return;
            }

            if (typeof target.data === 'function' && key === 'backgroundImage') {
                target.data('backgroundImage', 'none');
                return;
            }

            delete data[key];
        });
    }

    synchronizeGraphData() {
        if (!this.cy) {
            this.refreshSourceEditor();
            return;
        }

        this.syncTimelineConnectorsToGraphData();

        if (!window.DataManager || typeof window.DataManager.setGraphData !== 'function') {
            this.refreshSourceEditor();
            return;
        }

        try {
            const layoutName = this.getCurrentLayoutName();
            const isTimelineLayout = this.isTimeBasedLayout(layoutName);

            const nodes = this.cy.nodes().map(node => {
                const json = node.json();
                const entry = {
                    group: 'nodes',
                    data: { ...json.data }
                };

                if (json.position) {
                    entry.position = { ...json.position };
                }

                if (json.classes && json.classes.length) {
                    entry.classes = Array.isArray(json.classes)
                        ? [...json.classes]
                        : json.classes;
                }

                this.sanitizeBackgroundImageTarget(entry.data);

                return entry;
            });

            const edges = this.cy.edges().map(edge => {
                const json = edge.json();
                const entry = {
                    group: 'edges',
                    data: { ...json.data }
                };

                if (json.classes && json.classes.length) {
                    entry.classes = Array.isArray(json.classes)
                        ? [...json.classes]
                        : json.classes;
                }

                return entry;
            });

            const baseGraph = (() => {
                if (isTimelineLayout && window.GraphManager && window.GraphManager.currentGraph) {
                    return window.GraphManager.currentGraph;
                }

                if (window.GraphManager && typeof window.GraphManager.getCurrentGraphData === 'function') {
                    return window.GraphManager.getCurrentGraphData();
                }

                if (typeof window.DataManager.getGraphData === 'function') {
                    return window.DataManager.getGraphData();
                }

                return {};
            })();

            const previousGraph = baseGraph && typeof baseGraph === 'object'
                ? { ...baseGraph }
                : {};

            const baseNodes = Array.isArray(previousGraph.nodes) ? [...previousGraph.nodes] : [];
            const baseEdges = Array.isArray(previousGraph.edges) ? [...previousGraph.edges] : [];

            const rehydrateTimelineFromCy = () => {
                if (!isTimelineLayout || !this.cy) {
                    return;
                }

                const addMissingEntry = (collection, entry) => {
                    const data = entry && (entry.data || entry);
                    const id = data && data.id;
                    if (!id) {
                        return;
                    }

                    const alreadyPresent = collection.some(candidate => {
                        const payload = candidate && (candidate.data || candidate);
                        return payload && payload.id === id;
                    });

                    if (!alreadyPresent) {
                        collection.push(entry);
                    }
                };

                const cloneNodeJson = node => {
                    const json = node.json();
                    const entry = { group: 'nodes', data: { ...json.data } };
                    if (json.position) {
                        entry.position = { ...json.position };
                    }
                    if (json.classes && json.classes.length) {
                        entry.classes = Array.isArray(json.classes)
                            ? [...json.classes]
                            : json.classes;
                    }
                    return entry;
                };

                const cloneEdgeJson = edge => {
                    const json = edge.json();
                    const entry = { group: 'edges', data: { ...json.data } };
                    if (json.classes && json.classes.length) {
                        entry.classes = Array.isArray(json.classes)
                            ? [...json.classes]
                            : json.classes;
                    }
                    return entry;
                };

                this.cy.nodes('[type^="timeline-"]').forEach(node => {
                    addMissingEntry(baseNodes, cloneNodeJson(node));
                });

                this.cy.edges('[type="timeline-link"]').forEach(edge => {
                    addMissingEntry(baseEdges, cloneEdgeJson(edge));
                });
            };

            rehydrateTimelineFromCy();

            const mergedNodes = [...nodes];
            const mergedNodeIds = new Set(mergedNodes.map(entry => {
                const payload = entry && (entry.data || entry);
                return payload ? payload.id : null;
            }).filter(Boolean));

            const shouldPreserveNode = entry => {
                const data = entry && (entry.data || entry);
                if (!data || typeof data !== 'object') {
                    return false;
                }
                const type = data.type;
                const isTimelineNode = typeof type === 'string' && type.startsWith('timeline-');
                const hasLockedX = Object.prototype.hasOwnProperty.call(data, 'lockedX');
                return isTimelineNode || hasLockedX;
            };

            baseNodes.forEach(entry => {
                const data = entry && (entry.data || entry);
                const id = data && data.id;
                if (!id || mergedNodeIds.has(id)) {
                    return;
                }

                if (shouldPreserveNode(entry)) {
                    mergedNodes.push(entry);
                    mergedNodeIds.add(id);
                }
            });

            const mergedEdges = [...edges];
            const mergedEdgeIds = new Set(mergedEdges.map(entry => {
                const payload = entry && (entry.data || entry);
                return payload ? payload.id : null;
            }).filter(Boolean));

            baseEdges.forEach(entry => {
                const data = entry && (entry.data || entry);
                const id = data && data.id;
                if (!id || mergedEdgeIds.has(id)) {
                    return;
                }

                if (data && data.type === 'timeline-link') {
                    mergedEdges.push(entry);
                    mergedEdgeIds.add(id);
                }
            });

            const mergedGraph = {
                ...previousGraph,
                nodes: mergedNodes,
                edges: mergedEdges
            };

            if (window.GraphManager && typeof window.GraphManager === 'object') {
                window.GraphManager.currentGraph = mergedGraph;
            }

            window.DataManager.setGraphData(mergedGraph, { skipLayout: true });
        } catch (error) {
            console.error('Failed to synchronize graph data after node edit:', error);
        }

        this.refreshSourceEditor();
    }

    syncTimelineConnectorsToGraphData() {
        if (!this.cy || !window.GraphManager || typeof window.GraphManager.syncTimelineConnectors !== 'function') {
            return;
        }

        const layoutName = this.getCurrentLayoutName();
        if (!this.isTimeBasedLayout(layoutName)) {
            return;
        }

        const scopeNode = this.selectedNode || (this.selectedNodes && this.selectedNodes[0]);
        const { container, containerId, containerApplied, rootApplied } = this.getTimelineScopeContext(scopeNode);

        const anchors = [];
        const bars = [];

        const hasExistingScaffolding = this.cy.nodes('[type^="timeline-"]').length > 0
            || this.cy.edges('[type="timeline-link"]').length > 0;

        if (!hasExistingScaffolding && window.CustomLayouts && typeof window.CustomLayouts.rebuildTimelineConnectors === 'function') {
            try {
                if (container && containerApplied && containerId) {
                    const children = typeof container.children === 'function' ? container.children() : null;
                    const rebuildOptions = {
                        scaffoldingParentId: containerId,
                        timelineScopeId: containerId
                    };
                    if (children && children.length > 0) {
                        rebuildOptions.nodes = children;
                    }
                    window.CustomLayouts.rebuildTimelineConnectors(this.cy, rebuildOptions);
                } else if (rootApplied) {
                    window.CustomLayouts.rebuildTimelineConnectors(this.cy);
                }
            } catch (error) {
                console.warn('Failed to rebuild missing timeline scaffolding:', error);
            }
        }
        this.cy.nodes('[type="timeline-anchor"]').forEach(anchor => {
            if (!anchor || typeof anchor.id !== 'function') {
                return;
            }

            const id = anchor.id();
            if (!id) {
                return;
            }

            const position = typeof anchor.position === 'function' ? anchor.position() : null;
            const data = typeof anchor.data === 'function' ? { ...anchor.data() } : {};

            anchors.push({
                id,
                position: position ? { x: position.x, y: position.y } : undefined,
                data
            });
        });

        this.cy.nodes('[type="timeline-bar"]').forEach(bar => {
            if (!bar || typeof bar.id !== 'function') {
                return;
            }

            const id = bar.id();
            if (!id) {
                return;
            }

            const position = typeof bar.position === 'function' ? bar.position() : null;
            const data = typeof bar.data === 'function' ? { ...bar.data() } : {};

            bars.push({
                id,
                position: position ? { x: position.x, y: position.y } : undefined,
                data
            });
        });

        const links = [];
        this.cy.edges('[type="timeline-link"]').forEach(edge => {
            if (!edge || typeof edge.id !== 'function') {
                return;
            }

            const id = edge.id();
            if (!id) {
                return;
            }

            const rawData = typeof edge.data === 'function' ? { ...edge.data() } : {};
            const source = rawData.source || (typeof edge.source === 'function' && edge.source() ? edge.source().id() : undefined);
            const target = rawData.target || (typeof edge.target === 'function' && edge.target() ? edge.target().id() : undefined);

            if (!source || !target) {
                return;
            }

            links.push({
                id,
                source,
                target,
                type: rawData.type || 'timeline-link',
                data: rawData
            });
        });

        const lockedTimelineRecords = [];
        this.cy.nodes().forEach(node => {
            if (!node || typeof node.data !== 'function') {
                return;
            }

            const type = node.data('type');
            if (typeof type === 'string' && type.startsWith('timeline-')) {
                return;
            }

            const lockedX = node.data('lockedX');
            if (lockedX === undefined) {
                return;
            }

            const position = typeof node.position === 'function' ? node.position() : null;
            const classes = typeof node.classes === 'function' ? node.classes() : undefined;

            const payload = { id: node.id(), lockedX };
            const dataCopy = { ...node.data() };

            if (position && position.x !== undefined && position.y !== undefined) {
                payload.position = { x: position.x, y: position.y };
            }

            if (classes) {
                payload.classes = classes;
            }

            if (dataCopy && typeof dataCopy === 'object') {
                payload.data = { ...dataCopy };
                if (Object.prototype.hasOwnProperty.call(dataCopy, 'parent')) {
                    payload.parent = dataCopy.parent;
                }
            }

            lockedTimelineRecords.push(payload);
        });

        const hasConnectorPayload = anchors.length > 0 || links.length > 0 || bars.length > 0;

        if (!hasConnectorPayload && lockedTimelineRecords.length === 0) {
            return;
        }

        try {
            if (hasConnectorPayload) {
                window.GraphManager.syncTimelineConnectors(anchors, links, bars);
            }

            if (lockedTimelineRecords.length > 0
                && typeof window.GraphManager.storeTimelineAbsolutePositions === 'function') {
                window.GraphManager.storeTimelineAbsolutePositions(lockedTimelineRecords);
            }
        } catch (error) {
            console.error('Failed to sync timeline scaffolding into graph data:', error);
        }
    }

    refreshSourceEditor() {
        if (window.SourceEditor && typeof window.SourceEditor.refresh === 'function') {
            try {
                window.SourceEditor.refresh();
            } catch (error) {
                console.warn('Failed to refresh source editor after node edit:', error);
            }
        }
    }

    /**
     * Load temporal settings from localStorage
     */
    loadTemporalSettings() {
        try {
            const saved = localStorage.getItem('quantickle_temporal_settings');
            if (saved) {
                this.temporalSettings = { ...this.temporalSettings, ...JSON.parse(saved) };
            }
        } catch (e) {
        }
    }

    shouldApplyTimeLayoutOnClose(node = this.selectedNode, isBulkEdit = this.isBulkEdit) {
        if (!node || typeof node.data !== 'function') {
            return false;
        }
        if (isBulkEdit) {
            return false;
        }

        return this.nodeHasTimestamp(node);
    }

    getCurrentLayoutName() {
        const adapterLayout = (window.LayoutManagerAdapter &&
            typeof window.LayoutManagerAdapter.getCurrentLayout === 'function')
            ? window.LayoutManagerAdapter.getCurrentLayout()
            : null;
        if (adapterLayout) {
            return adapterLayout;
        }

        if (window.LayoutManager) {
            if (typeof window.LayoutManager.getCurrentLayout === 'function') {
                const layout = window.LayoutManager.getCurrentLayout();
                if (layout) {
                    return layout;
                }
            }
            if (window.LayoutManager.currentLayout) {
                return window.LayoutManager.currentLayout;
            }
        }
        return null;
    }

    getLayoutNameForNode(node) {
        const container = this.getTimelineContainerForNode(node);
        if (container) {
            const containerLayout = container.data && typeof container.data === 'function'
                ? container.data('_layoutName')
                : null;
            if (typeof containerLayout === 'string' && containerLayout.trim()) {
                return containerLayout;
            }
            if (typeof container.scratch === 'function') {
                const scratchLayout = container.scratch('_layoutName');
                if (typeof scratchLayout === 'string' && scratchLayout.trim()) {
                    return scratchLayout;
                }
            }
        }

        return this.getCurrentLayoutName();
    }

    isTimeBasedLayout(layoutName) {
        if (!layoutName || typeof layoutName !== 'string') {
            return false;
        }
        const normalized = layoutName.toLowerCase();
        return normalized === 'timeline' || normalized === 'timeline-scatter' || normalized === 'bulbous';
    }

    isTimelineLayout(layoutName) {
        if (!layoutName || typeof layoutName !== 'string') {
            return false;
        }
        const normalized = layoutName.toLowerCase();
        return normalized === 'timeline' || normalized === 'timeline-scatter';
    }

    getTimelineContainerForNode(node) {
        if (!node) {
            return null;
        }

        if (typeof node.hasClass === 'function' && node.hasClass('container')) {
            return node;
        }

        if (typeof node.parent === 'function') {
            const directParent = node.parent();
            if (directParent && directParent.length > 0 && typeof directParent.hasClass === 'function'
                && directParent.hasClass('container')) {
                return directParent;
            }
        }

        if (typeof node.parents === 'function') {
            const ancestors = node.parents();
            if (ancestors && typeof ancestors.filter === 'function') {
                const containers = ancestors.filter(parent => parent && typeof parent.hasClass === 'function'
                    && parent.hasClass('container'));
                if (containers && containers.length > 0) {
                    return containers[0];
                }
            }
        }

        return null;
    }

    getTimelineContainersForNodes(nodes) {
        if (!nodes || typeof nodes.forEach !== 'function') {
            return [];
        }

        const seen = new Set();
        const containers = [];

        nodes.forEach(node => {
            const container = this.getTimelineContainerForNode(node);
            if (!container || typeof container.id !== 'function') {
                return;
            }
            const id = container.id();
            if (!id || seen.has(id)) {
                return;
            }
            seen.add(id);
            containers.push(container);
        });

        return containers;
    }

    isTimelineLayoutAppliedForScope(scopeId) {
        if (!this.cy) {
            return false;
        }
        const normalizedScope = (typeof scopeId === 'string' && scopeId.length > 0) ? scopeId : '__root__';
        const registry = this.cy._timelineAppliedScopes;
        if (registry && typeof registry.has === 'function') {
            if (registry.has(normalizedScope)) {
                return true;
            }
            if (normalizedScope === '__root__') {
                return false;
            }
        }

        if (window.CustomLayouts && typeof window.CustomLayouts.isTimelineLayoutApplied === 'function') {
            return window.CustomLayouts.isTimelineLayoutApplied(this.cy, normalizedScope);
        }

        return false;
    }

    getTimelineScopeContext(scopeNode) {
        const container = scopeNode ? this.getTimelineContainerForNode(scopeNode) : null;
        const containerId = container && typeof container.id === 'function' ? container.id() : null;
        const containerApplied = containerId ? this.isTimelineLayoutAppliedForScope(containerId) : false;
        const rootApplied = this.isTimelineLayoutAppliedForScope('__root__');

        return {
            container,
            containerId,
            containerApplied,
            rootApplied
        };
    }

    getCustomTimelineLayout(layoutName) {
        if (!window.CustomLayouts) {
            return null;
        }
        if (layoutName === 'timeline' && typeof window.CustomLayouts.timelineLayout === 'function') {
            return window.CustomLayouts.timelineLayout;
        }
        if (layoutName === 'timeline-scatter' && typeof window.CustomLayouts.timelineScatterLayout === 'function') {
            return window.CustomLayouts.timelineScatterLayout;
        }
        return null;
    }

    applyScopedTimelineLayout(container, layoutName) {
        if (!container || !this.cy) {
            return false;
        }

        const layoutFunc = this.getCustomTimelineLayout(layoutName);
        if (!layoutFunc) {
            return false;
        }

        const children = typeof container.children === 'function' ? container.children() : null;
        if (!children || children.length === 0) {
            return false;
        }

        const center = typeof container.position === 'function' ? container.position() : null;
        if (!center || typeof center.x !== 'number' || typeof center.y !== 'number') {
            return false;
        }

        let width = parseFloat(container.data('width'));
        let height = parseFloat(container.data('height'));
        if (!width || !height) {
            const bb = container.boundingBox();
            width = bb.w;
            height = bb.h;
            container.data('width', width);
            container.data('height', height);
        }

        const boundingBox = {
            x1: center.x - width / 2,
            y1: center.y - height / 2,
            w: width,
            h: height
        };

        const containerId = container.id();

        layoutFunc.call(this.cy, {
            eles: children,
            boundingBox,
            scaffoldingParentId: containerId,
            timelineScopeId: containerId
        });

        container.position(center);
        container.data('width', width);
        container.data('height', height);
        return true;
    }

    nodeHasTimestamp(node) {
        const getValue = key => {
            try {
                return node.data(key);
            } catch (e) {
                return undefined;
            }
        };
        const timestamp = getValue('timestamp') || getValue('time');
        if (!timestamp) {
            return false;
        }

        if (timestamp instanceof Date) {
            return !Number.isNaN(timestamp.getTime());
        }

        if (typeof timestamp === 'number') {
            return Number.isFinite(timestamp);
        }

        if (typeof timestamp === 'string') {
            return timestamp.trim().length > 0 && !Number.isNaN(Date.parse(timestamp));
        }

        return false;
    }

    hasTimestampChangedSinceOpen(node) {
        if (!node || typeof node.data !== 'function') {
            return false;
        }

        const original = this.originalTimestamp ?? '';
        const current = this.getNodeTimestamp(node) || '';

        return original !== current;
    }

    getNodeTimestamp(node) {
        if (!node || typeof node.data !== 'function') {
            return '';
        }
        const timestamp = node.data('timestamp') || node.data('time') || '';
        if (timestamp instanceof Date) {
            return timestamp.toISOString();
        }
        if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
            try {
                return new Date(timestamp).toISOString();
            } catch (e) {
                return timestamp.toString();
            }
        }
        if (typeof timestamp === 'string' && timestamp.trim()) {
            try {
                return new Date(timestamp).toISOString();
            } catch (e) {
                return timestamp;
            }
        }
        return timestamp.toString();
    }


    fitNodeIntoTimeLayout(node) {
        if (!node || typeof node.id !== 'function') {
            return false;
        }

        const context = { nodes: [node] };

        if (window.LayoutManagerAdapter && typeof window.LayoutManagerAdapter.fitToCurrentLayout === 'function') {
            try {
                if (window.LayoutManagerAdapter.fitToCurrentLayout(context)) {
                    return true;
                }
            } catch (e) {
            }
        }

        if (window.LayoutManager && typeof window.LayoutManager.fitToCurrentLayout === 'function') {
            try {
                return !!window.LayoutManager.fitToCurrentLayout(context);
            } catch (e) {
            }
        }

        return false;
    }


    captureNodeStyleState() {
        if (!this.cy || typeof this.cy.nodes !== 'function') {
            return new Map();
        }

        const preserveKeys = [
            'color',
            'borderColor',
            'borderWidth',
            'size',
            'barLength',
            'shape',
            'label',
            'labelPlacement',
            'labelVisible',
            'fontColor',
            'labelColor',
            'backgroundImage',
            'icon',
            'opacity'
        ];

        const preserveStyles = [
            'background-color',
            'border-color',
            'border-width',
            'width',
            'height',
            'text-halign',
            'text-valign',
            'text-margin-y',
            'text-margin-x',
            'font-size',
            'color',
            'background-image',
            'shape',
            'opacity',
            'text-opacity',
            'background-opacity'
        ];

        const saved = new Map();

        this.cy.nodes().forEach(node => {
            try {
                const data = node.data();
                const snapshot = { data: {}, style: {} };

                preserveKeys.forEach(key => {
                    if (data[key] !== undefined) {
                        snapshot.data[key] = data[key];
                    }
                });

                preserveStyles.forEach(styleKey => {
                    try {
                        const styleValue = typeof node.style === 'function' ? node.style(styleKey) : undefined;
                        if (styleValue !== undefined && styleValue !== null && styleValue !== '') {
                            snapshot.style[styleKey] = styleValue;
                        }
                    } catch (styleError) {
                    }
                });

                if (Object.keys(snapshot.data).length > 0 || Object.keys(snapshot.style).length > 0) {
                    saved.set(node.id(), snapshot);
                }
            } catch (error) {
                console.warn('Failed to snapshot node style state', node && node.id && node.id(), error);
            }
        });

        return saved;
    }

    restoreNodeStyleState(savedStyles) {
        if (!this.cy || !savedStyles || typeof savedStyles.forEach !== 'function') {
            this.restoreTimelineStyles();
            return;
        }

        savedStyles.forEach((props, id) => {
            const node = this.cy.getElementById(id);
            if (!node || (typeof node.empty === 'function' && node.empty()) || typeof node.data !== 'function') {
                return;
            }

            try {
                const dataProps = props && props.data ? props.data : props;
                const styleProps = props && props.style ? props.style : {};

                Object.entries(dataProps).forEach(([key, value]) => {
                    if (value !== undefined) {
                        node.data(key, value);
                    }
                });

                this.applyNodeStyles(node);

                if (styleProps && typeof node.style === 'function') {
                    node.style(styleProps);
                }
            } catch (error) {
                console.warn('Failed to restore saved node style state', id, error);
            }
        });
    }


    reapplyTimeBasedLayout(layoutName = null, options = {}) {
        const targetLayout = layoutName || this.getCurrentLayoutName();

        const savedStyles = this.captureNodeStyleState();
        const scopedContainer = options && options.container ? options.container : null;

        const attemptMenuSelection = targetLayout => {
            if (!targetLayout) {
                return false;
            }

            const invoke = (fn) => {
                try {
                    fn(targetLayout);
                    return true;
                } catch (error) {
                    return false;
                }
            };

            if (window.LayoutManagerAdapter && typeof window.LayoutManagerAdapter.selectLayout === 'function') {
                if (invoke(window.LayoutManagerAdapter.selectLayout.bind(window.LayoutManagerAdapter))) {
                    return true;
                }
            }

            if (typeof window.selectLayout === 'function') {
                if (invoke(window.selectLayout)) {
                    return true;
                }
            }

            if (window.LayoutManager && typeof window.LayoutManager.selectLayout === 'function') {
                if (invoke(window.LayoutManager.selectLayout.bind(window.LayoutManager))) {
                    return true;
                }
            }

            if (window.LayoutManager && typeof window.LayoutManager.applyLayout === 'function') {
                if (invoke(window.LayoutManager.applyLayout.bind(window.LayoutManager))) {
                    return true;
                }
            }

            return false;
        };

        const scheduleTimelineRestyle = () => {
            if (!this.cy) {
                return;
            }

            const restore = () => this.restoreNodeStyleState(savedStyles);

            const attachLayoutStop = () => {
                if (!this.cy || typeof this.cy.one !== 'function') {
                    return false;
                }

                let fallbackId = null;

                const detach = () => {
                    if (fallbackId) {
                        clearTimeout(fallbackId);
                        fallbackId = null;
                    }
                    this.cy.off('layoutstop', onStop);
                };

                const onStop = () => {
                    detach();
                    restore();
                };

                try {
                    this.cy.one('layoutstop', onStop);
                    fallbackId = setTimeout(() => {
                        detach();
                        restore();
                    }, 300);
                    return true;
                } catch (error) {
                    try {
                        detach();
                    } catch (_) {
                    }
                    return false;
                }
            };

            if (attachLayoutStop()) {
                return;
            }

            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(restore);
                return;
            }
            setTimeout(restore, 0);
        };

        if (scopedContainer && this.isTimelineLayout(targetLayout)) {
            if (this.applyScopedTimelineLayout(scopedContainer, targetLayout)) {
                scheduleTimelineRestyle();
                return;
            }
        }

        if (attemptMenuSelection(targetLayout)) {
            scheduleTimelineRestyle();
            return;
        }

        if (window.LayoutManagerAdapter && typeof window.LayoutManagerAdapter.applyLayout === 'function') {
            window.LayoutManagerAdapter.applyLayout();
            scheduleTimelineRestyle();
            return;
        }

        if (window.LayoutManager && typeof window.LayoutManager.applyLayout === 'function') {
            window.LayoutManager.applyLayout();
            scheduleTimelineRestyle();
            return;
        }

        if (window.LayoutManager && typeof window.LayoutManager.applyCurrentLayout === 'function') {
            window.LayoutManager.applyCurrentLayout();
            scheduleTimelineRestyle();
        }
    }

    restoreTimelineStyles() {
        if (!this.cy) {
            return;
        }

        const restyleCollection = (collection) => {
            if (!collection || typeof collection.forEach !== 'function') {
                return;
            }
            collection.forEach(node => {
                try {
                    this.applyNodeStyles(node);
                } catch (error) {
                    console.warn('Failed to restore timeline styling for node', node && node.id && node.id(), error);
                }
            });
        };

        restyleCollection(this.cy.nodes('[type="timeline-bar"]'));
        restyleCollection(this.cy.nodes('[type="timeline-anchor"]'));
        restyleCollection(this.cy.nodes('[lockedX]'));
    }

    maybeRestoreTimelineScaffolding() {
        if (!this.cy) {
            return;
        }

        const currentLayout = this.getCurrentLayoutName();
        if (!this.isTimeBasedLayout(currentLayout)) {
            return;
        }

        const scopeNode = this.selectedNode || (this.selectedNodes && this.selectedNodes[0]);
        const { container, containerId, containerApplied, rootApplied } = this.getTimelineScopeContext(scopeNode);

        const hasScaffolding = this.cy.nodes('[type^="timeline-"]').length > 0
            || this.cy.edges('[type="timeline-link"]').length > 0;

        if (hasScaffolding) {
            return;
        }

        if (window.CustomLayouts && typeof window.CustomLayouts.rebuildTimelineConnectors === 'function') {
            try {
                if (container && containerApplied && containerId) {
                    const children = typeof container.children === 'function' ? container.children() : null;
                    const rebuildOptions = {
                        scaffoldingParentId: containerId,
                        timelineScopeId: containerId
                    };
                    if (children && children.length > 0) {
                        rebuildOptions.nodes = children;
                    }
                    window.CustomLayouts.rebuildTimelineConnectors(this.cy, rebuildOptions);
                } else if (rootApplied) {
                    window.CustomLayouts.rebuildTimelineConnectors(this.cy);
                }
            } catch (error) {
                console.error('Failed to restore timeline scaffolding after node edit:', error);
            }
        }
    }
    
    /**
     * Save temporal settings to localStorage
     */
    saveTemporalSettings() {
        try {
            localStorage.setItem('quantickle_temporal_settings', JSON.stringify(this.temporalSettings));
        } catch (e) {
        }
    }
    
    /**
     * Cleanup method for module destruction
     */
    destroy() {
        // Remove event listeners
        if (window._modalKeyInterceptor) {
            document.removeEventListener('keydown', window._modalKeyInterceptor, true);
            window.removeEventListener('keydown', window._modalKeyInterceptor, true);
            window._modalKeyInterceptor = null;
        }
        
        // Remove DOM elements
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }

        if (this.bulkModal) {
            this.bulkModal.remove();
            this.bulkModal = null;
        }

        if (this.textModal) {
            this.textModal.remove();
            this.textModal = null;
        }

        if (this.modalOverlay) {
            this.modalOverlay.remove();
            this.modalOverlay = null;
        }
        
        // Remove styles
        const styles = document.getElementById(this.config.stylesId);
        if (styles) {
            styles.remove();
        }
        
        // Clear references
        this.selectedNode = null;
        this.selectedNodes = null;
        this.cy = null;
        this.notifications = null;
        this.keyboardManager = null;
    }
}

// Export for use
window.NodeEditorModule = NodeEditorModule;
