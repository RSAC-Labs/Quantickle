window.EdgeEditor = {
    selectedEdges: [],

    init: function() {
        this.addStyles();
        this.createEditorUI();
        this.setupEventListeners();
    },

    addStyles: function() {
        if (document.getElementById('edge-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'edge-editor-styles';
        style.textContent = `
            .edge-editor {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 360px;
                max-width: 95vw;
                background: white;
                border: 2px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000;
                display: none;
                font-family: Arial, sans-serif;
            }
            .edge-editor .editor-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
                border-radius: 8px 8px 0 0;
            }
            .edge-editor .editor-header h3 {
                margin: 0;
                color: #333;
            }
            .edge-editor .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #666;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .edge-editor .close-btn:hover { color: #333; }
            .edge-editor .editor-content { padding: 20px; }
            .edge-editor .attribute-group { margin-bottom: 15px; }
            .edge-editor .attribute-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #555;
            }
            .edge-editor .attribute-group input,
            .edge-editor .attribute-group select {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
            .edge-editor .attribute-group input[type="color"] {
                width: auto;
                min-width: 70px;
                max-width: 120px;
                padding: 0;
                height: 36px;
                border-radius: 4px;
                cursor: pointer;
            }
            .edge-editor .button-row {
                text-align: right;
                margin-top: 20px;
            }
            .edge-editor .primary-btn,
            .edge-editor .secondary-btn {
                padding: 8px 16px;
                margin-left: 8px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .edge-editor .primary-btn {
                background: #007bff;
                color: white;
            }
            .edge-editor .secondary-btn {
                background: #e0e0e0;
                color: #333;
            }
        `;
        document.head.appendChild(style);
    },

    createEditorUI: function() {
        if (document.getElementById('edge-editor')) return;
        const editor = document.createElement('div');
        editor.id = 'edge-editor';
        editor.className = 'edge-editor';
        editor.innerHTML = `
            <div class="editor-header">
                <h3>Edit Edge</h3>
                <button class="close-btn" onclick="window.EdgeEditor.hideEditor()">&times;</button>
            </div>
            <div class="editor-content">
                <div class="attribute-group">
                    <label for="edgeLabelInput">Label</label>
                    <input type="text" id="edgeLabelInput">
                </div>
                <div class="attribute-group">
                    <label for="edgeColorInput">Color</label>
                    <input type="color" id="edgeColorInput" value="#cccccc">
                </div>
                <div class="attribute-group">
                    <label for="edgeWidthInput">Thickness</label>
                    <input type="number" id="edgeWidthInput" min="1" max="10" step="1" value="1">
                </div>
                <div class="attribute-group">
                    <label for="edgeStyleSelect">Style</label>
                    <select id="edgeStyleSelect">
                        <option value="solid">Solid</option>
                        <option value="dotted">Dotted</option>
                        <option value="dashed">Dashed</option>
                    </select>
                </div>
                <div class="attribute-group">
                    <label for="edgeShapeSelect">Shape</label>
                    <select id="edgeShapeSelect">
                        <option value="bezier">Curved</option>
                        <option value="straight">Straight</option>
                        <option value="unbundled-bezier">Bundled</option>
                        <option value="taxi">Taxi</option>
                        <option value="round-taxi">Rounded Taxi</option>
                    </select>
                </div>
                <div class="attribute-group">
                    <label><input type="checkbox" id="edgeArrowCheckbox"> Show Arrows</label>
                </div>
                <div class="attribute-group">
                    <label for="edgeArrowSizeInput">Arrow Size</label>
                    <input type="number" id="edgeArrowSizeInput" min="1" max="20" step="1" value="6">
                </div>
                <div class="button-row">
                    <button class="primary-btn" onclick="window.EdgeEditor.hideEditor()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(editor);
    },

    markEdgeCustomization: function(edge, properties = []) {
        if (!edge || typeof edge.data !== 'function' || !properties.length) {
            return;
        }

        const overrides = { ...(edge.data('customStyleOverrides') || {}) };
        let changed = false;

        properties.forEach(prop => {
            if (!overrides[prop]) {
                overrides[prop] = true;
                changed = true;
            }
        });

        if (changed) {
            edge.data('customStyleOverrides', overrides);
        }
    },

    setupEventListeners: function() {
        document.getElementById('edgeLabelInput').addEventListener('input', (e) => {
            const value = e.target.value;
            this.selectedEdges.forEach(edge => {
                edge.data('label', value);
                edge.style('label', value);
            });
        });

        document.getElementById('edgeColorInput').addEventListener('change', (e) => {
            const color = e.target.value || '#cccccc';
            this.selectedEdges.forEach(edge => {
                edge.data('color', color);
                edge.style({
                    'line-color': color,
                    'target-arrow-color': color
                });
                this.markEdgeCustomization(edge, ['color']);
            });
        });

        document.getElementById('edgeWidthInput').addEventListener('input', (e) => {
            const width = parseInt(e.target.value) || 1;
            this.selectedEdges.forEach(edge => {
                edge.data('width', width);
                edge.style('width', width);
                this.markEdgeCustomization(edge, ['width']);
            });
        });

        document.getElementById('edgeStyleSelect').addEventListener('change', (e) => {
            const style = e.target.value;
            this.selectedEdges.forEach(edge => {
                edge.data('lineStyle', style);
                edge.style('line-style', style);
                this.markEdgeCustomization(edge, ['lineStyle']);
            });
        });

        document.getElementById('edgeShapeSelect').addEventListener('change', (e) => {
            const shape = e.target.value;
            this.selectedEdges.forEach(edge => {
                edge.data('curveStyle', shape);
                edge.style({
                    'curve-style': shape
                });
                this.markEdgeCustomization(edge, ['curveStyle']);
            });
        });

        document.getElementById('edgeArrowCheckbox').addEventListener('change', (e) => {
            const show = e.target.checked;
            this.selectedEdges.forEach(edge => {
                edge.data('showArrows', show);
                edge.style('target-arrow-shape', show ? 'triangle' : 'none');
                this.markEdgeCustomization(edge, ['showArrows']);
            });
        });

        document.getElementById('edgeArrowSizeInput').addEventListener('input', (e) => {
            const size = parseInt(e.target.value) || 6;
            this.selectedEdges.forEach(edge => {
                edge.data('arrowSize', size);
                edge.style('arrow-scale', size / 6);
                this.markEdgeCustomization(edge, ['arrowSize']);
            });
        });
    },

    showEditor: function(edges) {
        if (!edges || edges.length === 0) return;
        this.selectedEdges = edges;
        const edge = edges[0];
        const labelInput = document.getElementById('edgeLabelInput');
        const colorInput = document.getElementById('edgeColorInput');
        const widthInput = document.getElementById('edgeWidthInput');
        const styleSelect = document.getElementById('edgeStyleSelect');
        const shapeSelect = document.getElementById('edgeShapeSelect');
        const arrowCheckbox = document.getElementById('edgeArrowCheckbox');
        const arrowSizeInput = document.getElementById('edgeArrowSizeInput');

        labelInput.value = edge.data('label') || '';
        colorInput.value = edge.data('color') || edge.style('line-color') || '#cccccc';
        widthInput.value = edge.data('width') || parseInt(edge.style('width')) || 1;
        styleSelect.value = edge.data('lineStyle') || edge.style('line-style') || 'solid';
        let shapeValue = edge.data('curveStyle') || edge.style('curve-style') || 'bezier';
        if (shapeValue === 'segments') shapeValue = 'bezier';
        shapeSelect.value = shapeValue;
        const showArrows = edge.data('showArrows');
        arrowCheckbox.checked = showArrows != null ? showArrows : edge.style('target-arrow-shape') !== 'none';
        const scale = edge.data('arrowSize') ? edge.data('arrowSize') / 6 : parseFloat(edge.style('arrow-scale'));
        arrowSizeInput.value = !isNaN(scale) ? Math.round(scale * 6) : 6;

        document.getElementById('edge-editor').style.display = 'block';
    },

    hideEditor: function() {
        const editor = document.getElementById('edge-editor');
        if (editor) editor.style.display = 'none';
        this.selectedEdges = [];
    }
};
