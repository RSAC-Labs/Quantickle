
(function() {
    let cy;
    let updating = false;
    let calloutLayer = null;
    let calloutLayerOwner = null;
    let fallbackLayer = null;
    let pendingViewportSync = false;
    const DIMENSION_BASELINE_ZOOM = 1;
    const DIMENSION_SOURCE = 'text-callout';
    const PREVIOUS_TYPE_KEY = '_calloutPrevType';
    const PREVIOUS_STYLE_KEY = '_calloutPrevStyle';
    const CALLOUT_SCALE_MIN = 0.1;
    const CALLOUT_SCALE_MAX = 6;

    const DEFAULT_TEXT_TOKENS = {
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fontColor: '#333333',
        borderColor: 'rgba(15, 23, 42, 0.28)',
        borderWidth: 1,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        lineHeight: 1.5,
        paddingInline: 16,
        paddingBlock: 12,
        maxWidth: 400
    };

    let lastTokenSignature = null;

    const STRUCTURED_ALLOWED_TAGS = new Set([
        'A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'P', 'SPAN', 'STRONG', 'SUB', 'SUP', 'UL', 'OL', 'LI', 'PRE'
    ]);

    const STRUCTURED_ALLOWED_ATTRS = {
        A: new Set(['href', 'title', 'target', 'rel'])
    };

    function normalizeString(value) {
        if (value == null) return '';
        return String(value);
    }

    function escapeHtml(value) {
        const input = normalizeString(value);
        if (!input) return '';
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function extractPlainText(html) {
        if (!html) return '';
        const input = normalizeString(html);
        if (!input) return '';
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return input
                .replace(/<\s*br\s*\/?\s*>/gi, '\n')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        const template = document.createElement('template');
        template.innerHTML = input;
        return (template.content && typeof template.content.textContent === 'string')
            ? template.content.textContent.replace(/\s+/g, ' ').trim()
            : '';
    }

    function sanitizeStructuredHtml(html) {
        const input = normalizeString(html).trim();
        if (!input) return '';
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return input.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
        }
        const template = document.createElement('template');
        template.innerHTML = input;

        const sanitizeNode = node => {
            if (!node) return;
            let child = node.firstChild;
            while (child) {
                const next = child.nextSibling;
                const nodeType = child.nodeType;
                if (nodeType === 1) { // Element
                    const tag = child.tagName;
                    if (!STRUCTURED_ALLOWED_TAGS.has(tag)) {
                        while (child.firstChild) {
                            node.insertBefore(child.firstChild, child);
                        }
                        node.removeChild(child);
                    } else {
                        const allowedAttrs = STRUCTURED_ALLOWED_ATTRS[tag] || new Set();
                        Array.from(child.attributes).forEach(attr => {
                            const name = attr.name.toLowerCase();
                            if (name.startsWith('on')) {
                                child.removeAttribute(attr.name);
                                return;
                            }
                            if (!allowedAttrs.has(name)) {
                                child.removeAttribute(attr.name);
                                return;
                            }
                            if (tag === 'A' && name === 'href') {
                                const value = attr.value.trim();
                                if (!value || /^javascript:/i.test(value)) {
                                    child.removeAttribute(attr.name);
                                    child.removeAttribute('target');
                                    child.removeAttribute('rel');
                                }
                            }
                        });
                        if (tag === 'A') {
                            if (child.hasAttribute('target')) {
                                const target = child.getAttribute('target');
                                if (target && target.toLowerCase() === '_blank') {
                                    child.setAttribute('rel', 'noopener noreferrer');
                                } else {
                                    child.removeAttribute('target');
                                    child.removeAttribute('rel');
                                }
                            }
                        }
                        sanitizeNode(child);
                    }
                } else if (nodeType === 8) { // Comment
                    node.removeChild(child);
                } else if (nodeType === 3) {
                    // text node - keep as is
                } else {
                    node.removeChild(child);
                }
                child = next;
            }
        };

        sanitizeNode(template.content);
        return template.innerHTML;
    }

    function convertTextBodyToHtml(bodyText) {
        const normalized = normalizeString(bodyText).replace(/\r\n/g, '\n').trim();
        if (!normalized) return '';
        const blocks = normalized.split(/\n{2,}/);
        const parts = [];
        blocks.forEach(block => {
            const trimmed = block.trim();
            if (!trimmed) {
                return;
            }
            const unorderedMatch = /^(?:\s*[-*]\s+.+\n?)+$/m.test(trimmed) && trimmed.split('\n').every(line => /^(\s*[-*]\s+.+|\s*)$/.test(line));
            const orderedMatch = !unorderedMatch && /^(?:\s*\d+\.\s+.+\n?)+$/m.test(trimmed) && trimmed.split('\n').every(line => /^(\s*\d+\.\s+.+|\s*)$/.test(line));
            if (unorderedMatch || orderedMatch) {
                const tag = unorderedMatch ? 'ul' : 'ol';
                const items = trimmed.split('\n')
                    .map(line => line.replace(unorderedMatch ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/, '').trim())
                    .filter(Boolean)
                    .map(item => `<li>${escapeHtml(item)}</li>`)
                    .join('');
                if (items) {
                    parts.push(`<${tag}>${items}</${tag}>`);
                }
            } else {
                const paragraph = escapeHtml(trimmed).replace(/\n/g, '<br>');
                parts.push(`<p>${paragraph}</p>`);
            }
        });
        return parts.join('');
    }

    function getStructuredCalloutData(node) {
        if (!node || typeof node.data !== 'function') return null;
        const fromObject = node.data('callout');
        let title;
        let body;
        let format;
        if (fromObject && typeof fromObject === 'object') {
            if (typeof fromObject.title === 'string') {
                title = fromObject.title;
            }
            if (typeof fromObject.body === 'string') {
                body = fromObject.body;
            } else if (typeof fromObject.html === 'string') {
                body = fromObject.html;
                format = 'html';
            }
            if (typeof fromObject.format === 'string') {
                format = fromObject.format;
            } else if (typeof fromObject.bodyFormat === 'string') {
                format = fromObject.bodyFormat;
            }
        }
        if (title == null) {
            const directTitle = node.data('calloutTitle');
            if (typeof directTitle === 'string') {
                title = directTitle;
            }
        }
        if (body == null) {
            const directBody = node.data('calloutBody');
            if (typeof directBody === 'string') {
                body = directBody;
            }
        }
        if (!format) {
            const directFormat = node.data('calloutFormat') || node.data('calloutBodyFormat');
            if (typeof directFormat === 'string') {
                format = directFormat;
            }
        }
        const hasTitle = typeof title === 'string' && title.trim().length > 0;
        const hasBody = typeof body === 'string' && body.trim().length > 0;
        if (!hasTitle && !hasBody) {
            return null;
        }
        return {
            title: hasTitle ? title : '',
            body: hasBody ? body : '',
            format: typeof format === 'string' ? format : null
        };
    }

    function buildStructuredCalloutContent(structured) {
        const title = normalizeString(structured.title).trim();
        const format = normalizeString(structured.format).toLowerCase();
        const bodyRaw = normalizeString(structured.body);
        let bodyHtml = '';
        let plainBody = '';
        if (bodyRaw) {
            if (format === 'html') {
                bodyHtml = sanitizeStructuredHtml(bodyRaw);
                plainBody = extractPlainText(bodyHtml);
            } else {
                bodyHtml = convertTextBodyToHtml(bodyRaw);
                plainBody = bodyRaw.replace(/\r\n/g, '\n').trim();
            }
        }
        const headerHtml = title
            ? `<header class="text-callout__header"><h3 class="text-callout__title">${escapeHtml(title)}</h3></header>`
            : '';
        const bodySection = bodyHtml
            ? `<section class="text-callout__body">${bodyHtml}</section>`
            : '';
        const article = `<article class="text-callout__article" role="note">${headerHtml}${bodySection}</article>`;
        const plainParts = [];
        if (title) {
            plainParts.push(title);
        }
        if (plainBody) {
            plainParts.push(plainBody);
        }
        return {
            mode: 'structured',
            html: article,
            plainText: plainParts.join('\n\n').trim(),
            signature: ['structured', title, plainBody, bodySection.length].join('|')
        };
    }

    function buildCalloutContent(node) {
        const structured = getStructuredCalloutData(node);
        if (structured) {
            return buildStructuredCalloutContent(structured);
        }
        const rawHtml = node && typeof node.data === 'function' ? node.data('infoHtml') : null;
        const html = typeof rawHtml === 'string' ? rawHtml : '';
        if (html && html.trim()) {
            const trimmedHtml = html.trim();
            const sanitizedHtml = sanitizeStructuredHtml(trimmedHtml);
            return {
                mode: 'legacy-html',
                html: sanitizedHtml,
                plainText: extractPlainText(sanitizedHtml),
                signature: 'legacy-html|' + sanitizedHtml
            };
        }
        const rawInfo = node && typeof node.data === 'function' ? node.data('info') : '';
        const info = normalizeString(rawInfo);
        return {
            mode: 'legacy-text',
            html: escapeHtml(info),
            plainText: info.trim(),
            signature: 'legacy-text|' + info
        };
    }

    function toNumber(value) {
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric : NaN;
    }

    function isTransparent(color) {
        if (!color) return true;
        const normalized = String(color).trim().toLowerCase();
        if (!normalized || normalized === 'transparent') return true;
        if (!normalized.startsWith('rgba')) return false;
        const alpha = parseFloat(normalized.split(',').pop());
        return Number.isFinite(alpha) ? alpha === 0 : false;
    }

    function getSharedTextTokens() {
        const tokens = (window.NodeTypes && window.NodeTypes.text) || {};
        const resolved = { ...DEFAULT_TEXT_TOKENS };

        if (tokens.fontFamily) {
            resolved.fontFamily = tokens.fontFamily;
        }

        const fontSize = toNumber(tokens.fontSize);
        if (Number.isFinite(fontSize) && fontSize > 0) {
            resolved.fontSize = fontSize;
        }

        if (tokens.fontColor) {
            resolved.fontColor = tokens.fontColor;
        }

        if (tokens.borderColor) {
            resolved.borderColor = tokens.borderColor;
        }

        const borderWidth = toNumber(tokens.borderWidth);
        if (Number.isFinite(borderWidth) && borderWidth >= 0) {
            resolved.borderWidth = borderWidth;
        }

        const borderRadius = toNumber(tokens.borderRadius);
        if (Number.isFinite(borderRadius) && borderRadius >= 0) {
            resolved.borderRadius = borderRadius;
        }

        const lineHeight = toNumber(tokens.lineHeight);
        if (Number.isFinite(lineHeight) && lineHeight > 0) {
            resolved.lineHeight = lineHeight;
        }

        if (tokens.color && !isTransparent(tokens.color)) {
            resolved.backgroundColor = tokens.color;
        }

        const configuredMaxWidth = toNumber(window.QuantickleConfig?.summaryNodeMaxWidth);
        if (Number.isFinite(configuredMaxWidth) && configuredMaxWidth > 0) {
            resolved.maxWidth = configuredMaxWidth;
        }

        resolved.paddingInline = Math.max(Math.round(resolved.fontSize * 0.85), 12);
        resolved.paddingBlock = Math.max(Math.round(resolved.fontSize * 0.6), 10);

        return resolved;
    }

    function ensureSharedTokenVariables(providedTokens) {
        if (typeof document === 'undefined') return;
        const tokens = providedTokens || getSharedTextTokens();
        const signature = [
            tokens.fontFamily,
            tokens.fontSize,
            tokens.fontColor,
            tokens.borderColor,
            tokens.borderWidth,
            tokens.borderRadius,
            tokens.backgroundColor,
            tokens.lineHeight,
            tokens.paddingInline,
            tokens.paddingBlock,
            tokens.maxWidth
        ].join('|');

        if (signature === lastTokenSignature) {
            return;
        }
        lastTokenSignature = signature;

        const root = document.documentElement;
        if (!root || !root.style) return;

        root.style.setProperty('--text-node-font-family', tokens.fontFamily);
        root.style.setProperty('--text-node-font-size', tokens.fontSize + 'px');
        root.style.setProperty('--text-node-line-height', String(tokens.lineHeight));
        root.style.setProperty('--text-node-font-color', tokens.fontColor);
        root.style.setProperty('--text-node-border-color', tokens.borderColor);
        root.style.setProperty('--text-node-border-width', tokens.borderWidth + 'px');
        root.style.setProperty('--text-node-border-radius', tokens.borderRadius + 'px');
        root.style.setProperty('--text-callout-background', tokens.backgroundColor);
        root.style.setProperty('--text-callout-padding-inline', tokens.paddingInline + 'px');
        root.style.setProperty('--text-callout-padding-block', tokens.paddingBlock + 'px');
        root.style.setProperty('--text-callout-max-width', tokens.maxWidth + 'px');
    }

    ensureSharedTokenVariables();

    function getComputedFontSizePx(el) {
        if (!el || typeof window.getComputedStyle !== 'function') return NaN;
        let computed;
        try {
            computed = window.getComputedStyle(el);
        } catch (err) {
            return NaN;
        }
        if (!computed) return NaN;

        const raw = (computed.fontSize || '').trim().toLowerCase();
        if (!raw) return NaN;

        const numeric = parseFloat(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return NaN;
        }

        if (raw.endsWith('px')) {
            return numeric;
        }

        if (raw.endsWith('rem')) {
            const root = window.document && window.document.documentElement
                ? getComputedFontSizePx(window.document.documentElement)
                : NaN;
            return Number.isFinite(root) && root > 0 ? numeric * root : NaN;
        }

        if (raw.endsWith('em')) {
            const parent = el.parentElement;
            const parentSize = parent ? getComputedFontSizePx(parent) : NaN;
            return Number.isFinite(parentSize) && parentSize > 0 ? numeric * parentSize : NaN;
        }

        if (raw.endsWith('%')) {
            const parent = el.parentElement;
            const parentSize = parent ? getComputedFontSizePx(parent) : NaN;
            return Number.isFinite(parentSize) && parentSize > 0 ? parentSize * (numeric / 100) : NaN;
        }

        if (raw.endsWith('pt')) {
            return numeric * (96 / 72);
        }

        return numeric;
    }

    function scaleInnerFonts(div, scale) {
        const walk = (el, parentBase) => {
            for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
                const tag = child.tagName;
                if (tag === 'STYLE' || tag === 'SCRIPT') {
                    continue;
                }

                let base = child.dataset.baseFontSize;
                if (base !== undefined) {
                    base = parseFloat(base);
                    if (!Number.isFinite(base) || base <= 0) {
                        delete child.dataset.baseFontSize;
                        base = undefined;
                    }
                }

                if (base === undefined) {
                    let size = getComputedFontSizePx(child);
                    if (!Number.isFinite(size) || size <= 0) {
                        if (Number.isFinite(parentBase) && parentBase > 0) {
                            size = parentBase * scale;
                        }
                    }
                    if (Number.isFinite(size) && size > 0) {
                        base = size / scale;
                        if (base * scale < 2 && Number.isFinite(parentBase) && parentBase > 0) {
                            base = parentBase;
                        }
                        child.dataset.baseFontSize = base;
                    } else if (Number.isFinite(parentBase) && parentBase > 0) {
                        base = parentBase;
                    }
                }

                if (Number.isFinite(base) && base > 0) {
                    child.style.fontSize = (base * scale) + 'px';
                } else {
                    child.style.removeProperty('font-size');
                }

                walk(child, base);

            }
        };

        const rootSize = getComputedFontSizePx(div);
        const rootBase = Number.isFinite(rootSize) && rootSize > 0 ? rootSize / scale : undefined;
        walk(div, rootBase);
    }

    function parseFontSize(value, fallback = 14) {
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function clampSize(value, limit, fallback) {
        if (!Number.isFinite(value) || value <= 0) {
            value = fallback;
        }
        if (Number.isFinite(limit) && limit > 0) {
            value = Math.min(value, limit);
        }
        return value;
    }

    function approximateContentSize(div, baseFontSize, sharedTokens) {
        const text = (div.textContent || '').trim();
        const tokens = sharedTokens || getSharedTextTokens();
        if (!text) {
            const minimum = Math.max(baseFontSize * 4, 24);
            return { width: minimum, height: minimum * 0.6 };
        }

        const lines = text.split(/\n+/).length;
        const chars = Math.max(text.replace(/\s+/g, ' ').length, 1);
        const horizontalPadding = Math.max(tokens.paddingInline * 2, baseFontSize);
        const verticalPadding = Math.max(tokens.paddingBlock * 2, Math.round(baseFontSize * 0.75));
        const width = chars * (baseFontSize * 0.55) + horizontalPadding;
        const height = lines * (baseFontSize * tokens.lineHeight) + verticalPadding;
        return {
            width: Math.max(width, baseFontSize * 4),
            height: Math.max(height, baseFontSize * tokens.lineHeight + verticalPadding)
        };

    }

    function setPreviousType(node, type) {
        if (!node || typeof node.scratch !== 'function') return;
        try {
            node.scratch(PREVIOUS_TYPE_KEY, type);
        } catch (err) {
            // ignore
        }
    }

    function getPreviousType(node) {
        if (!node || typeof node.scratch !== 'function') return undefined;
        try {
            return node.scratch(PREVIOUS_TYPE_KEY);
        } catch (err) {
            return undefined;
        }
    }

    function cachePreviousStyle(node) {
        if (!node || typeof node.scratch !== 'function' || typeof node.style !== 'function') return;
        let existing;
        try {
            existing = node.scratch(PREVIOUS_STYLE_KEY);
        } catch (err) {
            existing = undefined;
        }
        if (existing) return;

        const keys = [
            'label',
            'background-color',
            'background-opacity',
            'border-width',
            'border-opacity',
            'text-opacity',
            'opacity'
        ];
        const style = {};
        for (const key of keys) {
            try {
                const value = node.style(key);
                if (value !== undefined) {
                    style[key] = value;
                }
            } catch (err) {
                // ignore unsupported property lookups
            }
        }
        try {
            node.scratch(PREVIOUS_STYLE_KEY, style);
        } catch (err) {
            // ignore
        }
    }

    function restorePreviousStyle(node) {
        if (!node || typeof node.scratch !== 'function' || typeof node.style !== 'function') return;
        let style;
        try {
            style = node.scratch(PREVIOUS_STYLE_KEY);
        } catch (err) {
            style = null;
        }
        if (!style || typeof style !== 'object') return;

        const keys = Object.keys(style);
        if (keys.length) {
            const toRestore = {};
            for (const key of keys) {
                const value = style[key];
                if (value !== undefined) {
                    toRestore[key] = value;
                }
            }
            if (Object.keys(toRestore).length) {
                try {
                    node.style(toRestore);
                } catch (err) {
                    // ignore restore errors
                }
            }
        }

        try {
            node.removeScratch(PREVIOUS_STYLE_KEY);
        } catch (err) {
            // ignore
        }
    }

    function scheduleDeferredMeasurement(node, data) {
        if (!node || !data) return;
        if (data.layoutScheduled) return;
        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : fn => setTimeout(fn, 16);
        data.layoutScheduled = true;
        schedule(() => {
            data.layoutScheduled = false;
            if (!data.div) return;
            data.needsLayout = false;
            update(node);
        });
    }

    function applyTransparentCalloutStyle(node) {
        if (!node || typeof node.style !== 'function') return;
        try {
            node.style({
                label: '',
                'background-color': 'transparent',
                'background-opacity': 0,
                'border-width': 0,
                'border-opacity': 0,
                'text-opacity': 0,
                opacity: 0
            });
        } catch (err) {
            try {
                node.style({
                    label: '',
                    'background-color': 'transparent',
                    'background-opacity': 0,
                    'border-width': 0,
                    'border-opacity': 0,
                    'text-opacity': 0,
                    opacity: 0
                });
            } catch (err2) {
                // ignore
            }
        }
    }

    function update(node) {
        if (updating) return;
        const data = node.scratch('_callout');
        if (!data || !data.div) return;
        const div = data.div;
        const layer = data.layer;

        applyTransparentCalloutStyle(node);

        const sharedTokens = getSharedTextTokens();
        ensureSharedTokenVariables(sharedTokens);

        const calloutContent = buildCalloutContent(node);
        const preserveAspectRatio = node.data('preserveAspectRatio') !== false;

        if (data.lastContentSignature !== calloutContent.signature) {
            div.innerHTML = calloutContent.html;
            data.lastContentSignature = calloutContent.signature;
            data.lastPlainText = calloutContent.plainText;
            data.lastContentMode = calloutContent.mode;
            if (calloutContent.mode) {
                div.dataset.calloutMode = calloutContent.mode;
            } else {
                delete div.dataset.calloutMode;
            }
            div.querySelectorAll('*').forEach(el => {
                delete el.dataset.baseFontSize;
            });
            if (preserveAspectRatio) {
                data.baseWidth = undefined;
                data.baseHeight = undefined;
            }
            data.needsLayout = true;
            data.layoutRetryCount = 0;
        }

        const zoom = cy.zoom();

        const nodeFontSize = parseFontSize(node.data('fontSize'), data.baseFontSize || sharedTokens.fontSize);
        if (nodeFontSize !== data.baseFontSize) {
            data.baseFontSize = nodeFontSize;
        }

        const baseFontSize = data.baseFontSize || sharedTokens.fontSize;

        const widthMode = node.data('textWidthMode');
        const heightMode = node.data('textHeightMode');
        const userWidth = widthMode === 'fixed' ? parseFloat(node.data('width')) : NaN;
        const userHeight = heightMode === 'fixed' ? parseFloat(node.data('height')) : NaN;

        const finiteBaseline = value => Number.isFinite(value) && value > 0;
        let baselineChanged = false;

        if (preserveAspectRatio) {
            if (Number.isFinite(userWidth) && finiteBaseline(data.baseWidth)) {
                const widthDelta = Math.abs(userWidth - data.baseWidth);
                if (widthDelta > 0.5) {
                    data.baseWidth = userWidth;
                    baselineChanged = true;
                }
            }

            if (Number.isFinite(userHeight) && finiteBaseline(data.baseHeight)) {
                const heightDelta = Math.abs(userHeight - data.baseHeight);
                if (heightDelta > 0.5) {
                    data.baseHeight = userHeight;
                    baselineChanged = true;
                }
            }
        }

        if (baselineChanged) {
            delete div.dataset.baseFontSize;
            div.querySelectorAll('*').forEach(el => {
                delete el.dataset.baseFontSize;
            });
        }

        const computeNodeScale = () => {
            let widthScale = 1;
            let heightScale = 1;
            if (finiteBaseline(data.baseWidth) && Number.isFinite(userWidth)) {
                widthScale = userWidth / data.baseWidth;
            }
            if (finiteBaseline(data.baseHeight) && Number.isFinite(userHeight)) {
                heightScale = userHeight / data.baseHeight;
            }
            return Math.min(widthScale, heightScale);
        };

        let nodeScale = preserveAspectRatio ? computeNodeScale() : 1;
        if (baselineChanged) {
            nodeScale = computeNodeScale();
        }

        const rawCalloutScale = parseFloat(node.data('calloutScale'));
        const calloutScale = Number.isFinite(rawCalloutScale) && rawCalloutScale > 0
            ? Math.max(CALLOUT_SCALE_MIN, Math.min(CALLOUT_SCALE_MAX, rawCalloutScale))
            : 1;

        const rawScaleFactor = zoom * nodeScale * calloutScale;
        const scaleFactor = Number.isFinite(rawScaleFactor)
            ? Math.max(rawScaleFactor, 0)
            : 1;

        scaleInnerFonts(div, scaleFactor);

        // Allow box to grow to fit the content before measuring
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordBreak = 'break-word';
        div.style.overflowX = 'hidden';
        div.style.overflowY = 'hidden';
        if (!Number.isFinite(data.basePaddingInline) || data.basePaddingInline <= 0
            || data.basePaddingInlineSource !== sharedTokens.paddingInline) {
            data.basePaddingInline = sharedTokens.paddingInline;
            data.basePaddingInlineSource = sharedTokens.paddingInline;
        }
        if (!Number.isFinite(data.basePaddingBlock) || data.basePaddingBlock <= 0
            || data.basePaddingBlockSource !== sharedTokens.paddingBlock) {
            data.basePaddingBlock = sharedTokens.paddingBlock;
            data.basePaddingBlockSource = sharedTokens.paddingBlock;
        }

        const scaledPaddingInline = (data.basePaddingInline || sharedTokens.paddingInline) * scaleFactor;
        const scaledPaddingBlock = (data.basePaddingBlock || sharedTokens.paddingBlock) * scaleFactor;
        div.style.padding = `${scaledPaddingBlock}px ${scaledPaddingInline}px`;
        div.style.setProperty('--text-callout-padding-inline', scaledPaddingInline + 'px');
        div.style.setProperty('--text-callout-padding-block', scaledPaddingBlock + 'px');
        div.style.lineHeight = String(sharedTokens.lineHeight);

        // Use any user-defined dimensions if present
        let containerEl = cy && typeof cy.container === 'function' ? cy.container() : null;
        let wrapperEl = layer && layer.isConnected ? layer : null;
        if (!wrapperEl || wrapperEl === containerEl) {
            wrapperEl = containerEl && containerEl.parentElement ? containerEl.parentElement : wrapperEl;
        }

        if (!wrapperEl && typeof document !== 'undefined') {
            wrapperEl = document.getElementById && document.getElementById('cy-wrapper')
                ? document.getElementById('cy-wrapper')
                : document.body;
        }
        if (!containerEl) {
            containerEl = wrapperEl;
        }
        if (layer && layer.dataset && layer.dataset.calloutFallback === 'true' && containerEl && typeof containerEl.getBoundingClientRect === 'function') {
            const rect = containerEl.getBoundingClientRect();
            layer.style.left = rect.left + 'px';
            layer.style.top = rect.top + 'px';
            layer.style.width = rect.width + 'px';
            layer.style.height = rect.height + 'px';
        }
        if (!wrapperEl) {
            return;
        }
        const wrapperRect = (wrapperEl && typeof wrapperEl.getBoundingClientRect === 'function')
            ? wrapperEl.getBoundingClientRect()
            : null;
        const containerRect = (containerEl && typeof containerEl.getBoundingClientRect === 'function')
            ? containerEl.getBoundingClientRect()
            : null;
        const widthCandidates = [
            wrapperRect ? wrapperRect.width : 0,
            containerRect ? containerRect.width : 0,
            containerEl ? containerEl.clientWidth : 0,
            containerEl ? containerEl.offsetWidth || 0 : 0,
            window.innerWidth || 0
        ].filter(value => Number.isFinite(value) && value > 0);
        const heightCandidates = [
            wrapperRect ? wrapperRect.height : 0,
            containerRect ? containerRect.height : 0,
            containerEl ? containerEl.clientHeight : 0,
            containerEl ? containerEl.offsetHeight || 0 : 0,
            window.innerHeight || 0
        ].filter(value => Number.isFinite(value) && value > 0);
        const fallbackWidthLimit = widthCandidates.length ? Math.min(...widthCandidates) : 0;
        const fallbackHeightLimit = heightCandidates.length ? Math.min(...heightCandidates) : 0;
        const maxWidth = fallbackWidthLimit > 0 ? fallbackWidthLimit * 0.9 : Infinity;
        const maxHeight = fallbackHeightLimit > 0 ? fallbackHeightLimit * 0.9 : Infinity;

        const approxSize = approximateContentSize(div, baseFontSize, sharedTokens);

        div.style.fontFamily = node.data('fontFamily') || sharedTokens.fontFamily;
        div.style.fontSize = (data.baseFontSize * scaleFactor) + 'px';
        div.style.fontWeight = node.data('bold') ? 'bold' : 'normal';
        div.style.fontStyle = node.data('italic') ? 'italic' : 'normal';

        const fontColor = node.data('fontColor');
        div.style.color = fontColor && fontColor !== 'rgba(0,0,0,0)'
            ? fontColor
            : sharedTokens.fontColor;

        const borderColor = node.data('borderColor');

        const normalizedBorderColor = typeof borderColor === 'string'
            ? borderColor.trim().toLowerCase()
            : '';
        const hasBorderColor = normalizedBorderColor &&
            normalizedBorderColor !== 'rgba(0,0,0,0)' &&
            normalizedBorderColor !== 'transparent';
        div.style.borderColor = hasBorderColor ? borderColor : '#000000';
        const borderWidth = parseFloat(node.data('borderWidth'));
        const resolvedBorderWidth = Number.isFinite(borderWidth) ? Math.max(0, borderWidth) : 1;
        div.style.borderWidth = resolvedBorderWidth + 'px';
        div.style.borderStyle = 'solid';
        if (resolvedBorderWidth === 0) {
            div.style.borderColor = 'transparent';
        }
        const cornerRadius = parseFloat(node.data('cornerRadius'));
        div.style.borderRadius = Number.isFinite(cornerRadius)
            ? Math.max(0, cornerRadius) + 'px'
            : '8px';

        const backgroundColor = node.data('backgroundColor') || node.data('color');
        const normalizedBackground = typeof backgroundColor === 'string'
            ? backgroundColor.trim().toLowerCase()
            : '';
        if (normalizedBackground && normalizedBackground !== 'rgba(0,0,0,0)' && normalizedBackground !== 'transparent') {

            div.style.backgroundColor = backgroundColor;
        } else {
            div.style.backgroundColor = sharedTokens.backgroundColor;
        }

        const padding = parseFloat(node.data('padding'));
        if (Number.isFinite(padding)) {
            const resolvedPadding = Math.max(0, padding);
            if (!Number.isFinite(data.baseCustomPadding)
                || data.baseCustomPaddingSource !== resolvedPadding) {
                data.baseCustomPadding = resolvedPadding;
                data.baseCustomPaddingSource = resolvedPadding;
            }
            const scaledCustomPadding = (data.baseCustomPadding || resolvedPadding) * scaleFactor;
            div.style.setProperty('--text-callout-padding', scaledCustomPadding + 'px');
        } else {
            delete data.baseCustomPadding;
            delete data.baseCustomPaddingSource;
            div.style.removeProperty('--text-callout-padding');
        }

        const boxShadow = node.data('boxShadow');
        if (boxShadow) {
            div.style.setProperty('--text-callout-shadow', boxShadow);
        } else {
            div.style.removeProperty('--text-callout-shadow');
        }

        const opacity = parseFloat(node.data('backgroundOpacity'));
        if (Number.isFinite(opacity)) {
            div.style.opacity = Math.max(0, Math.min(1, opacity));
        } else {
            const legacyOpacity = parseFloat(node.data('opacity'));
            div.style.opacity = Number.isFinite(legacyOpacity) ? Math.max(0, Math.min(1, legacyOpacity)) : 1;
        }

        if (data.needsLayout) {
            div.style.width = 'auto';
            div.style.height = 'auto';
            scheduleDeferredMeasurement(node, data);
            return;
        }

        let measuredWidth, measuredHeight;
        let rawWidth = NaN;
        let rawHeight = NaN;
        let shouldEnforceAspectRatio = false;
        let resolvedAspectRatio = NaN;

        if (!isNaN(userWidth)) {
            // Width is locked by the user
            measuredWidth = clampSize(userWidth * zoom, maxWidth, approxSize.width);
            div.style.width = measuredWidth + 'px';

            if (!isNaN(userHeight)) {
                // Height also locked
                measuredHeight = clampSize(userHeight * zoom, maxHeight, approxSize.height);
                div.style.height = measuredHeight + 'px';
                shouldEnforceAspectRatio = preserveAspectRatio;
                resolvedAspectRatio = parseFloat(node.data('aspectRatio'));
                if (!Number.isFinite(resolvedAspectRatio) || resolvedAspectRatio <= 0) {
                    resolvedAspectRatio = userWidth / userHeight;
                }
            } else {
                // Height should adapt to content within fixed width
                div.style.height = 'auto';
                rawHeight = div.offsetHeight || div.scrollHeight || (div.getBoundingClientRect().height || 0);
                measuredHeight = clampSize(rawHeight, maxHeight, approxSize.height);
                div.style.height = measuredHeight + 'px';
            }
        } else {
            // No user-defined width/height - auto measure both
            div.style.width = 'auto';
            div.style.height = 'auto';
            rawWidth = div.offsetWidth || div.scrollWidth || (div.getBoundingClientRect().width || 0);
            rawHeight = div.offsetHeight || div.scrollHeight || (div.getBoundingClientRect().height || 0);
            measuredWidth = clampSize(rawWidth, maxWidth, approxSize.width);
            measuredHeight = clampSize(rawHeight, maxHeight, approxSize.height);
            div.style.width = measuredWidth + 'px';
            div.style.height = measuredHeight + 'px';
        }

        if (shouldEnforceAspectRatio && Number.isFinite(resolvedAspectRatio) && resolvedAspectRatio > 0
            && Number.isFinite(measuredWidth) && measuredWidth > 0
            && Number.isFinite(measuredHeight) && measuredHeight > 0) {
            const widthFromHeight = measuredHeight * resolvedAspectRatio;
            const heightFromWidth = measuredWidth / resolvedAspectRatio;
            const widthDelta = Math.abs(widthFromHeight - measuredWidth);
            const heightDelta = Math.abs(heightFromWidth - measuredHeight);
            if (widthDelta < heightDelta) {
                measuredWidth = widthFromHeight;
            } else {
                measuredHeight = heightFromWidth;
            }
            div.style.width = measuredWidth + 'px';
            div.style.height = measuredHeight + 'px';
        }

        let measurementValid = Number.isFinite(measuredWidth) && measuredWidth > 0
            && Number.isFinite(measuredHeight) && measuredHeight > 0;

        if (isNaN(userWidth)) {
            measurementValid = measurementValid && Number.isFinite(rawWidth) && rawWidth > 0;
        }
        if (isNaN(userHeight)) {
            measurementValid = measurementValid && Number.isFinite(rawHeight) && rawHeight > 0;
        }

        if (!measurementValid) {
            const fallbackMeasuredWidth = measuredWidth;
            const fallbackMeasuredHeight = measuredHeight;
            div.style.width = 'auto';
            div.style.height = 'auto';
            data.needsLayout = true;
            data.layoutRetryCount = (data.layoutRetryCount || 0) + 1;
            if (data.layoutRetryCount <= 10) {
                scheduleDeferredMeasurement(node, data);
                return;
            }
            data.needsLayout = false;
            if (Number.isFinite(fallbackMeasuredWidth) && fallbackMeasuredWidth > 0) {
                div.style.width = fallbackMeasuredWidth + 'px';
            }
            if (Number.isFinite(fallbackMeasuredHeight) && fallbackMeasuredHeight > 0) {
                div.style.height = fallbackMeasuredHeight + 'px';
            }
        } else {
            data.layoutRetryCount = 0;
        }

        const visibleHeight = measuredHeight;
        const contentHeight = Number.isFinite(rawHeight) && rawHeight > 0
            ? rawHeight
            : measuredHeight;

        if (Number.isFinite(contentHeight) && Number.isFinite(visibleHeight) && contentHeight > visibleHeight) {
            div.style.overflowY = 'auto';
            div.style.maxHeight = visibleHeight + 'px';
        } else {
            div.style.overflowY = 'hidden';
            div.style.maxHeight = '';
        }

        // Update node style dimensions using graph-space values.
        const width = measuredWidth / zoom;
        const height = contentHeight / zoom;
        node.style({ width, height });

        // Persist dimensions in a stable baseline space with calibration metadata
        // so load-time normalization can recover graph-space sizes regardless of save zoom.
        const authoredWidthByCallout = widthMode !== 'fixed';
        const authoredHeightByCallout = heightMode !== 'fixed';
        const dimensionUpdates = {};
        const baselineWidth = measuredWidth / DIMENSION_BASELINE_ZOOM;
        const baselineHeight = contentHeight / DIMENSION_BASELINE_ZOOM;

        if (authoredWidthByCallout && Number.isFinite(baselineWidth) && baselineWidth > 0) {
            dimensionUpdates.width = baselineWidth;
        }
        if (authoredHeightByCallout && Number.isFinite(baselineHeight) && baselineHeight > 0) {
            dimensionUpdates.height = baselineHeight;
        }
        if (Number.isFinite(dimensionUpdates.width) || Number.isFinite(dimensionUpdates.height)) {
            if (Number.isFinite(dimensionUpdates.width) && Number.isFinite(dimensionUpdates.height)) {
                dimensionUpdates.size = Math.max(dimensionUpdates.width, dimensionUpdates.height);
            }
            if (preserveAspectRatio
                && Number.isFinite(dimensionUpdates.width) && dimensionUpdates.width > 0
                && Number.isFinite(dimensionUpdates.height) && dimensionUpdates.height > 0) {
                dimensionUpdates.aspectRatio = dimensionUpdates.width / dimensionUpdates.height;
            }
            dimensionUpdates.calloutDimensionZoom = zoom;
            dimensionUpdates.calloutDimensionSource = DIMENSION_SOURCE;
            Object.keys(dimensionUpdates).forEach(key => {
                const nextValue = dimensionUpdates[key];
                const currentValue = node.data(key);
                if (typeof nextValue === 'number' && Number.isFinite(nextValue)) {
                    const currentNumeric = typeof currentValue === 'number' ? currentValue : parseFloat(currentValue);
                    if (!Number.isFinite(currentNumeric) || Math.abs(currentNumeric - nextValue) > 0.001) {
                        node.data(key, nextValue);
                    }
                    return;
                }
                if (currentValue !== nextValue) {
                    node.data(key, nextValue);
                }
            });
        }

        if (preserveAspectRatio) {
            if ((data.baseWidth == null || data.baseWidth <= 0) && Number.isFinite(width) && width > 0) {
                data.baseWidth = width;
            }
            if ((data.baseHeight == null || data.baseHeight <= 0) && Number.isFinite(height) && height > 0) {
                data.baseHeight = height;
            }
        }

        const pos = node.renderedPosition();
        const rect = containerRect || { left: 0, top: 0 };
        const wrapperLeft = wrapperRect ? wrapperRect.left : 0;
        const wrapperTop = wrapperRect ? wrapperRect.top : 0;
        div.style.left = rect.left - wrapperLeft + pos.x - measuredWidth / 2 + 'px';
        div.style.top  = rect.top  - wrapperTop  + pos.y - measuredHeight / 2 + 'px';

        // If the size changed, ensure another update runs after layout settles
        if (data.lastWidth !== measuredWidth || data.lastHeight !== measuredHeight) {
            data.lastWidth = measuredWidth;
            data.lastHeight = measuredHeight;
            if (!data.pendingUpdate) {
                data.pendingUpdate = true;
                const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
                schedule(() => {
                    data.pendingUpdate = false;
                    update(node);
                });
            }
        }
    }

    function getCyContainer() {
        return cy && typeof cy.container === 'function' ? cy.container() : null;
    }

    function getLayerOwner(container) {
        if (!container) return null;
        if (container.parentElement && container.parentElement.appendChild) {
            return container.parentElement;
        }
        return container;
    }

    function destroyCalloutLayer() {
        if (calloutLayer && typeof calloutLayer.remove === 'function') {
            try {
                calloutLayer.remove();
            } catch (err) {
                // ignore removal failures
            }
        }
        calloutLayer = null;
        calloutLayerOwner = null;
    }

    function destroyFallbackLayer() {
        if (fallbackLayer && typeof fallbackLayer.remove === 'function') {
            try {
                fallbackLayer.remove();
            } catch (err) {
                // ignore removal failures
            }
        }
        fallbackLayer = null;
    }

    function ensureFallbackLayer() {
        if (typeof document === 'undefined') return null;
        if (fallbackLayer && fallbackLayer.isConnected) {
            return fallbackLayer;
        }
        try {
            const layer = document.createElement('div');
            layer.className = 'text-callout-layer';
            layer.dataset.calloutFallback = 'true';
            layer.style.position = 'absolute';
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = '0px';
            layer.style.height = '0px';
            layer.style.pointerEvents = 'none';
            document.body.appendChild(layer);
            fallbackLayer = layer;
        } catch (err) {
            fallbackLayer = null;
        }
        return fallbackLayer;
    }

    function ensureCalloutLayerRoot() {
        if (typeof document === 'undefined') return null;
        const container = getCyContainer();
        const owner = getLayerOwner(container);
        if (!owner || !owner.appendChild) {
            return ensureFallbackLayer();
        }
        if (calloutLayer && calloutLayerOwner === owner && calloutLayer.isConnected) {
            return calloutLayer;
        }

        destroyCalloutLayer();

        let layer = null;
        try {
            layer = owner.ownerDocument && owner.ownerDocument.createElement
                ? owner.ownerDocument.createElement('div')
                : document.createElement('div');
            layer.className = 'text-callout-layer';
            layer.dataset.calloutFallback = 'false';
            layer.style.position = 'absolute';
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            owner.appendChild(layer);
            calloutLayer = layer;
            calloutLayerOwner = owner;
            destroyFallbackLayer();
        } catch (err) {
            destroyCalloutLayer();
            layer = ensureFallbackLayer();
        }
        return layer;
    }

    function ensureCallout(evtOrNode) {
        const potentialTarget = evtOrNode && evtOrNode.target;
        const node = potentialTarget && typeof potentialTarget === 'object' && typeof potentialTarget.data === 'function'
            ? potentialTarget
            : evtOrNode;
        if (!node || typeof node.data !== 'function' || node.data('type') !== 'text') return null;

        let layer = ensureCalloutLayerRoot();
        if (!layer || !layer.appendChild) return null;

        let data = node.scratch('_callout');
        if (!data) {
            cachePreviousStyle(node);
        }
        if (data && data.div) {
            if (data.layer !== layer) {
                data.layer = layer;
            }
            let parent = data.div.parentElement;
            const isConnected = typeof data.div.isConnected === 'boolean'
                ? data.div.isConnected
                : !!parent;
            if ((!isConnected || parent !== layer) && layer && layer.appendChild) {
                try {
                    layer.appendChild(data.div);
                    parent = data.div.parentElement;
                } catch (err) {
                    parent = null;
                }
            }
            if (parent === layer) {
                node.style('label', '');
                return node;
            }
            try {
                data.div.remove();
            } catch (err) {
                // ignore
            }
            data.div = null;
        }


        try {
            const div = document.createElement('div');
            div.className = 'text-callout';
            if (!div.style.position) {
                div.style.position = 'absolute';
            }
            if (!div.style.pointerEvents) {
                div.style.pointerEvents = 'none';
            }
            layer.appendChild(div);

            node.scratch('_callout', {
                div,
                layer,
                baseFontSize: parseFontSize(node.data('fontSize'), 14),
                lastContentSignature: null,
                lastPlainText: '',
                lastContentMode: null,
                baseWidth: null,
                baseHeight: null,
                needsLayout: false,
                layoutScheduled: false,
                layoutRetryCount: 0
            });
            setPreviousType(node, 'text');
            node.style('label', '');
            return node;
        } catch (err) {
            return null;
        }
    }

    function scheduleCalloutRetry(node) {
        if (!node || typeof node.scratch !== 'function') return;
        let state = node.scratch('_calloutRetryState');
        if (!state) {
            state = { count: 0, pending: false };
            node.scratch('_calloutRetryState', state);
        }
        if (state.pending) return;
        if (state.count >= 5) return;
        state.pending = true;
        state.count += 1;
        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : fn => setTimeout(fn, 16);
        schedule(() => {
            state.pending = false;
            refresh(node);
        });

    }

    function addCallout(evtOrNode) {
        const node = ensureCallout(evtOrNode);
        if (node) {
            update(node);
        }
    }

    function removeCallout(evtOrNode) {
        const node = evtOrNode.target ? evtOrNode.target : evtOrNode;
        const data = node.scratch('_callout');
        if (data && data.div) {
            data.div.remove();
        }
        restorePreviousStyle(node);
        node.removeScratch('_callout');
    }

    function handleData(evtOrNode) {
        const potentialTarget = evtOrNode && evtOrNode.target;
        const node = potentialTarget && typeof potentialTarget === 'object' && typeof potentialTarget.data === 'function'
            ? potentialTarget
            : evtOrNode;
        if (!node || typeof node.data !== 'function') return;

        const currentType = node.data('type');
        const previousType = getPreviousType(node);
        const data = node.scratch('_callout');

        if (currentType === 'text') {
            if (!data || !data.div || previousType !== 'text') {
                const ensured = ensureCallout(node);
                if (ensured && ensured.scratch('_callout') && ensured.scratch('_callout').div) {
                    update(ensured);
                } else {
                    scheduleCalloutRetry(node);
                }
            } else {
                update(node);
            }
        }

        if (currentType !== previousType) {
            setPreviousType(node, currentType);
        }
    }

    function refresh(node) {
        if (!node || typeof node.data !== 'function') return;
        const ensured = ensureCallout(node);
        if (ensured && ensured.scratch('_callout')) {
            if (typeof ensured.removeScratch === 'function') {
                ensured.removeScratch('_calloutRetryState');
            }
            update(node);
        } else if (node.data('type') === 'text') {

            restorePreviousStyle(node);

            const calloutContent = buildCalloutContent(node);
            const plain = calloutContent && typeof calloutContent.plainText === 'string'
                ? calloutContent.plainText.trim()
                : '';
            const fallbackLabel = plain || node.data('label') || '';
            const rawOpacity = parseFloat(node.data('opacity'));
            let fallbackOpacity = Number.isFinite(rawOpacity)
                ? Math.max(0, Math.min(1, rawOpacity))
                : 1;
            if (fallbackOpacity <= 0) {
                fallbackOpacity = 1;
            }

            const sharedTokens = getSharedTextTokens();
            ensureSharedTokenVariables(sharedTokens);
            const fallbackBorderWidth = toNumber(node.data('borderWidth'));
            const fallbackFontSize = toNumber(node.data('fontSize'));
            const fallbackBorderRadius = toNumber(node.data('borderRadius'));
            const fallbackBorderColor = node.data('borderColor');
            const fallbackFontColor = node.data('fontColor');
            const fallbackBackground = node.data('color') && node.data('color') !== 'rgba(0,0,0,0)'
                ? node.data('color')
                : sharedTokens.backgroundColor;

            node.style({
                label: fallbackLabel,
                'text-opacity': 1,
                'background-opacity': 1,

                opacity: fallbackOpacity,
                'background-color': fallbackBackground,
                'border-width': Number.isFinite(fallbackBorderWidth) ? fallbackBorderWidth : sharedTokens.borderWidth,
                'border-color': fallbackBorderColor && fallbackBorderColor !== 'rgba(0,0,0,0)'
                    ? fallbackBorderColor
                    : sharedTokens.borderColor,
                'font-size': Number.isFinite(fallbackFontSize) ? fallbackFontSize : sharedTokens.fontSize,
                'font-family': node.data('fontFamily') || sharedTokens.fontFamily,
                'font-weight': node.data('bold') ? 'bold' : 'normal',
                'font-style': node.data('italic') ? 'italic' : 'normal',
                'border-radius': Number.isFinite(fallbackBorderRadius) && fallbackBorderRadius >= 0
                    ? fallbackBorderRadius
                    : sharedTokens.borderRadius,
                color: fallbackFontColor && fallbackFontColor !== 'rgba(0,0,0,0)'
                    ? fallbackFontColor
                    : sharedTokens.fontColor
            });

        }
    }

    function updateAll() {
        if (!cy) return;
        cy.nodes('node[type="text"]').forEach(update);
    }

    function scheduleViewportSync(options = {}) {
        if (!cy) {
            return;
        }

        const immediate = options && options.immediate === true;
        if (immediate) {
            pendingViewportSync = false;
            updateAll();
            return;
        }

        if (pendingViewportSync) {
            return;
        }

        pendingViewportSync = true;
        const schedule = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (fn => setTimeout(fn, 16));
        schedule(() => {
            pendingViewportSync = false;
            updateAll();
        });
    }

    function syncViewport(options = {}) {
        scheduleViewportSync(options);
    }

    function init(instance) {
        cy = instance;
        if (!cy) return;
        destroyCalloutLayer();
        destroyFallbackLayer();
        ensureCalloutLayerRoot();
        cy.nodes().forEach(node => setPreviousType(node, node.data('type')));
        cy.nodes('node[type="text"]').forEach(addCallout);
        cy.on('position', 'node[type="text"]', e => update(e.target));
        cy.on('data', 'node', handleData);
        cy.on('zoom pan viewport render', () => scheduleViewportSync());
        cy.on('add', 'node[type="text"]', addCallout);
        cy.on('remove', 'node[type="text"]', removeCallout);
        scheduleViewportSync({ immediate: true });
    }

    window.TextCallout = { init, refresh, syncViewport };
})();
