// AI Input Manager for Quantickle
// Handles AI-powered data generation and visualization

window.AIInputManager = {
    isInitialized: false,
    
    // Configuration
    config: {
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4',
        maxTokens: 2000,
        temperature: 0.7,
        systemPrompt: `You are a data generation expert. Your task is to create Python scripts that gather data and output it in CSV format compatible with Quantickle's network graph visualization.

QUANTICKLE SUPPORTS TWO CSV FORMATS - CHOOSE THE APPROPRIATE ONE:

1. RELATIONSHIP FORMAT (8+ columns) - Use for data with connections/relationships:
   - source_id: unique identifier for source node
   - source_type: category/type of source node
   - source_label: display name for source node
   - target_id: unique identifier for target node
   - target_type: category/type of target node
   - target_label: display name for target node
   - edge_type: relationship type between nodes
   - edge_label: relationship label (optional)
   - edge_weight: numeric weight (optional)
   - source_color, target_color: hex color codes (optional)
   - source_size, target_size: numeric sizes (optional)
   - source_shape, target_shape: node shapes (optional)
   - source_icon, target_icon: icon names (optional)
   - source_x, source_y, source_z, target_x, target_y, target_z: 3D coordinates (optional)

2. NODE-ONLY FORMAT (3+ columns) - Use for standalone entities without relationships:
   - id: unique identifier for the node
   - label: display name for the node
   - type: category/type of the node
   - size: numeric value for node size (optional)
   - shape: node shape (ellipse, square, triangle, diamond, etc.) (optional)
   - color: hex color code (optional)
   - icon: icon name (optional)
   - x, y, z: 3D coordinates (optional)

FORMAT SELECTION RULES:
- Use NODE-ONLY FORMAT for: stars, cities, companies, people, concepts, etc. (standalone entities)
- Use RELATIONSHIP FORMAT for: social networks, business relationships, collaborations, etc. (connected entities)
- ALWAYS include the required fields: id/label/type for nodes, or source_id/target_id/edge_type for relationships
- ALWAYS include size, shape, color for visual appeal
- ALWAYS include x,y,z coordinates for 3D positioning

COORDINATE SYSTEM REQUIREMENTS:
- Use coordinates in the range 0-1000 for all axes (X, Y, Z)
- X-axis: 0 = leftmost, 1000 = rightmost
- Y-axis: 0 = bottom, 1000 = top  
- Z-axis: 0 = farthest back, 1000 = closest to viewer
- For depth perception, vary Z coordinates (don't use same Z for all nodes)
- Higher Z values = closer to viewer = appear in front
- Lower Z values = farther from viewer = appear behind

EXAMPLE OUTPUT FORMATS:
For stars (NODE-ONLY): id,label,type,size,shape,color,x,y,z
For collaborations (RELATIONSHIP): source_id,source_type,source_label,target_id,target_type,target_label,edge_type,edge_weight,source_color,target_color,source_size,target_size,source_x,source_y,source_z,target_x,target_y,target_z

Generate ONLY the Python script code. Do not include explanations, comments about the code, or instructions on how to run it. Output clean, executable Python code that produces CSV data in the specified format.`,
        
        // Template-based generation prompt
        templatePrompt: `You are a data generation expert. Given a CSV template with headers, generate realistic data that fits the template structure.

QUANTICKLE CSV FORMATS:
- RELATIONSHIP FORMAT: Creates both nodes and edges (source_id, target_id, etc.)
- NODE FORMAT: Creates only nodes (id, label, type, etc.)

Rules:
1. Generate exactly the number of rows requested
2. Ensure all data is realistic and contextually appropriate
3. Use diverse values to create interesting visualizations
4. For numeric fields, use reasonable ranges
5. For colors, use valid hex codes (#RRGGBB)
6. For coordinates, use values that create good spatial distribution
7. Make relationships logical and meaningful
8. For relationship format, ensure source_id and target_id are unique and consistent

COORDINATE SYSTEM REQUIREMENTS:
- Use coordinates in the range 0-1000 for all axes (X, Y, Z)
- For depth perception, vary Z coordinates (don't use same Z for all nodes)
- Higher Z values = closer to viewer = appear in front
- Lower Z values = farther from viewer = appear behind
- Spread nodes across the available space for better visualization

Generate only the CSV data, no explanations or code.`,

        // Supported CSV formats (matching actual Quantickle implementation)
        csvFormats: {
            'relationship-full': {
                name: 'Full Relationship',
                description: 'Complete relationship format that creates both nodes and edges with all properties',
                template: 'source_id,source_type,source_label,target_id,target_type,target_label,edge_type,edge_label,edge_weight,source_color,target_color,source_size,target_size,source_shape,target_shape,source_x,source_y,source_z,target_x,target_y,target_z\nnode1,Person,John Doe,node2,Company,Acme Corp,works_for,Employee,1,#ff0000,#00ff00,30,25,ellipse,square,100,200,300,400,500,600',
                fields: ['source_id', 'source_type', 'source_label', 'target_id', 'target_type', 'target_label', 'edge_type', 'edge_label', 'edge_weight', 'source_color', 'target_color', 'source_size', 'target_size', 'source_shape', 'target_shape', 'source_x', 'source_y', 'source_z', 'target_x', 'target_y', 'target_z']
            },
            'relationship-basic': {
                name: 'Basic Relationship',
                description: 'Simple relationship format with essential fields',
                template: 'source_id,source_type,source_label,target_id,target_type,target_label,edge_type\nnode1,Person,John Doe,node2,Company,Acme Corp,works_for',
                fields: ['source_id', 'source_type', 'source_label', 'target_id', 'target_type', 'target_label', 'edge_type']
            },
            'nodes-3d': {
                name: '3D Nodes',
                description: 'Node format with 3D coordinates for spatial visualization',
                template: 'id,label,type,size,shape,color,x,y,z\nnode1,Example Node,Category,30,ellipse,#ff0000,100,200,300',
                fields: ['id', 'label', 'type', 'size', 'shape', 'color', 'x', 'y', 'z']
            },
            'nodes-basic': {
                name: 'Basic Nodes',
                description: 'Simple node format with essential properties',
                template: 'id,label,type,size,shape,color\nnode1,Example Node,Category,30,ellipse,#ff0000',
                fields: ['id', 'label', 'type', 'size', 'shape', 'color']
            },
            'nodes-minimal': {
                name: 'Minimal Nodes',
                description: 'Minimal node format with just id, label, and type',
                template: 'id,label,type\nnode1,Example Node,Category',
                fields: ['id', 'label', 'type']
            }
        }
    },

    // Initialize the AI Input Manager
    init: async function() {
        this.isInitialized = true;
        await this.loadSettings();
    },

    // Show the AI input interface in the tab
    showInTab: async function() {
        // The AI Input panel is rendered inside a div with id="aiInputManager" in index.html.
        // Previously this function looked for an element with the outdated id
        // "aiInputEditorContent", which no longer exists in the DOM. This caused
        // runtime errors when attempting to display the AI input UI because the
        // container could not be found.
        const tabContainer = document.getElementById('aiInputManager');
        if (!tabContainer) {
            console.error('AI Input tab container not found');
            return;
        }

        const aiInputHTML = `
            <div style="padding: 15px; background: #f8f9fa; border-radius: 8px; margin-bottom: 15px;">
                <h4 style="margin-top: 0; color: #333; text-align: center; font-size: 16px;">AI Data Generation</h4>
                
                <!-- API Configuration -->
                <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
                    <h5 style="margin-top: 0; color: #555; border-bottom: 1px solid #eee; padding-bottom: 4px; font-size: 13px; margin-bottom: 8px;">API Configuration</h5>
                    
                    <form style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;" onsubmit="return false;">
                        <label style="color: #666; font-weight: bold; font-size: 11px; min-width: 80px;">API Key:</label>
                        <input type="password" id="openaiApiKey" placeholder="Enter your OpenAI API key" style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px;">
                        <button type="button" id="saveApiKey" style="padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Save</button>
                    </form>
                    
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <label style="color: #666; font-weight: bold; font-size: 11px; min-width: 80px;">Model:</label>
                        <select id="aiModel" style="width: 120px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px;">
                            <option value="gpt-4">GPT-4</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        </select>
                        <label style="color: #666; font-weight: bold; font-size: 11px; min-width: 80px;">Temperature:</label>
                        <input type="range" id="aiTemperature" min="0" max="1" step="0.1" value="0.7" style="width: 120px;">
                        <span id="temperatureValue" style="color: #666; font-size: 10px; min-width: 20px;">0.7</span>
                    </div>
                </div>

                <!-- Data Generation Request -->
                <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
                    <h5 style="margin-top: 0; color: #555; border-bottom: 1px solid #eee; padding-bottom: 4px; font-size: 13px; margin-bottom: 8px;">Data Generation Request</h5>
                    
                    <!-- Generation Mode Tabs -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; gap: 2px; background: #f8f9fa; border-radius: 4px; padding: 2px;">
                            <button id="scriptModeBtn" class="mode-tab active" style="flex: 1; padding: 6px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold;">Script Generation</button>
                            <button id="templateModeBtn" class="mode-tab" style="flex: 1; padding: 6px; background: transparent; color: #666; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold;">Template Filler</button>
                        </div>
                    </div>
                    
                    <!-- Script Generation Mode -->
                    <div id="scriptMode" class="generation-mode active">
                        <div style="margin-bottom: 8px;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; display: block; margin-bottom: 4px;">Describe the data you want to generate:</label>
                            <textarea id="aiPrompt" placeholder="e.g., 'Create a dataset of scientific collaborations between researchers, including their institutions, research areas, and collaboration networks. Include at least 50 researchers and 100 collaborations.'" style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px; resize: vertical;"></textarea>
                        </div>
                        
                                                 <div style="display: flex; gap: 10px;">
                             <button id="generateData" style="flex: 1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">Generate Data Script</button>
                             <button id="generateSample" style="flex: 1; padding: 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">Generate Sample</button>
                         </div>
                    </div>
                    
                    <!-- Template Filler Mode -->
                    <div id="templateMode" class="generation-mode" style="display: none;">
                        <!-- CSV Format Selector -->
                        <div style="margin-bottom: 12px; padding: 10px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e0e0e0;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; display: block; margin-bottom: 6px;">Select CSV Format:</label>
                            <select id="csvFormatSelect" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px; margin-bottom: 6px;">
                                <option value="relationship-full">🔗 Full Relationship - Complete format that creates both nodes and edges</option>
                                <option value="relationship-basic">➡️ Basic Relationship - Simple relationship format with essential fields</option>
                                <option value="nodes-3d">🌍 3D Nodes - Node format with 3D coordinates for spatial visualization</option>
                                <option value="nodes-basic">🔵 Basic Nodes - Simple node format with essential properties</option>
                                <option value="nodes-minimal">⚡ Minimal Nodes - Minimal node format with just id, label, and type</option>
                            </select>
                            <div id="formatDescription" style="font-size: 10px; color: #666; font-style: italic; margin-bottom: 6px;">
                                Simple node format with essential properties
                            </div>
                            <button id="loadFormatTemplate" style="padding: 4px 8px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">Load Template</button>
                        </div>
                        
                        <div style="margin-bottom: 8px;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; display: block; margin-bottom: 4px;">CSV Template (with headers):</label>
                            <textarea id="csvTemplate" placeholder="source_id,source_type,source_label,target_id,target_type,target_label,edge_type,edge_label,edge_weight,source_color,target_color,source_size,target_size,source_x,source_y,source_z,target_x,target_y,target_z&#10;node1,Person,John Doe,node2,Company,Acme Corp,works_for,Employee,1,#ff0000,#00ff00,30,25,100,200,300,400,500,600" style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px; resize: vertical; font-family: 'Courier New', monospace;"></textarea>
                        </div>
                        
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; min-width: 80px;">Number of rows:</label>
                            <input type="number" id="rowCount" min="1" max="1000" value="50" style="width: 80px; padding: 4px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; min-width: 80px;">Context:</label>
                            <input type="text" id="templateContext" placeholder="e.g., 'scientific researchers'" style="flex: 1; padding: 4px; border: 1px solid #ddd; border-radius: 3px; font-size: 11px;">
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="generateFromTemplate" style="flex: 1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">Fill Template</button>
                            <button id="loadPresetTemplate" style="flex: 1; padding: 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">Load Preset</button>
                        </div>
                    </div>
                </div>

                <!-- Generated Content -->
                <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
                    <h5 style="margin-top: 0; color: #555; border-bottom: 1px solid #eee; padding-bottom: 4px; font-size: 13px; margin-bottom: 8px;">Generated Content</h5>
                    
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <button id="copyScript" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Script</button>
                            <button id="downloadScript" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Download Script</button>
                            <button id="runScript" style="padding: 6px 12px; background: #ffc107; color: #212529; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Run Script</button>
                        </div>
                        
                        <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                            <button id="copyData" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Data</button>
                            <button id="downloadData" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Download Data</button>
                            <button id="loadData" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Load & Visualize</button>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <div style="flex: 1;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; display: block; margin-bottom: 4px;">Generated Script:</label>
                            <textarea id="generatedScript" placeholder="Generated Python script will appear here..." style="width: 100%; height: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 10px; font-family: 'Courier New', monospace; resize: vertical; background: #f8f9fa;"></textarea>
                        </div>
                        <div style="flex: 1;">
                            <label style="color: #666; font-weight: bold; font-size: 11px; display: block; margin-bottom: 4px;">Generated Data:</label>
                            <textarea id="generatedData" placeholder="Generated CSV data will appear here..." style="width: 100%; height: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 3px; font-size: 10px; font-family: 'Courier New', monospace; resize: vertical; background: #f8f9fa;"></textarea>
                        </div>
                    </div>
                </div>

                                 <!-- Status and Logs -->
                 <div style="margin-bottom: 15px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
                     <h5 style="margin-top: 0; color: #555; border-bottom: 1px solid #eee; padding-bottom: 4px; font-size: 13px; margin-bottom: 8px;">Status & Logs</h5>
                     
                     <div id="aiStatus" style="color: #666; font-size: 11px; margin-bottom: 8px;">Ready to generate data</div>
                     
                     <div id="aiLogs" style="max-height: 150px; overflow-y: auto; padding: 8px; background: #f8f9fa; border-radius: 3px; font-size: 10px; font-family: 'Courier New', monospace; color: #333;">
                         <!-- Logs will appear here -->
                     </div>
                 </div>

                 <!-- Coordinate System Help -->
                 <div style="margin-bottom: 15px; padding: 12px; background: #e8f4fd; border-radius: 6px; border: 1px solid #b3d9ff;">
                     <h5 style="margin-top: 0; color: #0056b3; border-bottom: 1px solid #b3d9ff; padding-bottom: 4px; font-size: 13px; margin-bottom: 8px;">📐 Coordinate System Guide</h5>
                     
                     <div style="font-size: 11px; color: #333; line-height: 1.4;">
                         <div style="margin-bottom: 6px;"><strong>Range:</strong> 0-1000 for all axes (X, Y, Z)</div>
                         <div style="margin-bottom: 6px;"><strong>X-axis:</strong> 0 = left, 1000 = right</div>
                         <div style="margin-bottom: 6px;"><strong>Y-axis:</strong> 0 = bottom, 1000 = top</div>
                                                   <div style="margin-bottom: 6px;"><strong>Z-axis:</strong> 0 = back, 1000 = front (viewer)</div>
                          <div style="margin-bottom: 6px;"><strong>Depth:</strong> Higher Z = closer to viewer = in front</div>
                         <div style="margin-bottom: 6px;"><strong>Tip:</strong> Vary Z coordinates for depth perception!</div>
                         
                         <details style="margin-top: 8px;">
                             <summary style="cursor: pointer; color: #0056b3; font-weight: bold; font-size: 10px;">📖 View Full Documentation</summary>
                             <div style="margin-top: 6px; padding: 8px; background: white; border-radius: 3px; font-size: 10px;">
                                 <div style="margin-bottom: 4px;"><strong>Recommended ranges:</strong></div>
                                 <div style="margin-bottom: 2px;">• Small networks: X/Y 100-900, Z 100-500</div>
                                 <div style="margin-bottom: 2px;">• Medium networks: X/Y 50-950, Z 50-800</div>
                                 <div style="margin-bottom: 2px;">• Large networks: X/Y/Z 0-1000</div>
                                 <div style="margin-top: 6px; margin-bottom: 4px;"><strong>Avoid:</strong></div>
                                                                   <div style="margin-bottom: 2px;">• All nodes at same Z coordinate</div>
                                  <div style="margin-bottom: 2px;">• All nodes at Z=500 (flat visualization)</div>
                                  <div style="margin-bottom: 2px;">• Coordinates outside 0-1000 range</div>
                             </div>
                         </details>
                     </div>
                 </div>
            </div>
        `;

        tabContainer.innerHTML = aiInputHTML;
        await this.setupEventListeners();
    },

    // Setup event listeners for the AI input interface
    setupEventListeners: async function() {
        // API Key save button
        const saveApiKeyBtn = document.getElementById('saveApiKey');
        if (saveApiKeyBtn) {
            saveApiKeyBtn.addEventListener('click', async () => {
                const apiKey = document.getElementById('openaiApiKey').value;
                if (apiKey) {
                    this.config.apiKey = apiKey;
                    await this.saveSettings();
                    this.log('API key saved');
                }
            });
        }

        // Temperature slider
        const temperatureSlider = document.getElementById('aiTemperature');
        if (temperatureSlider) {
            temperatureSlider.addEventListener('input', (e) => {
                this.config.temperature = parseFloat(e.target.value);
                document.getElementById('temperatureValue').textContent = this.config.temperature;
            });
        }

        // Model selector
        const modelSelect = document.getElementById('aiModel');
        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                this.config.model = e.target.value;
            });
        }

        // Generate data button
        const generateDataBtn = document.getElementById('generateData');
        if (generateDataBtn) {
            generateDataBtn.addEventListener('click', () => {
                this.generateDataScript();
            });
        }

        // Generate sample button
        const generateSampleBtn = document.getElementById('generateSample');
        if (generateSampleBtn) {
            generateSampleBtn.addEventListener('click', () => {
                this.generateSampleData();
            });
        }

        // Mode switching buttons
        const scriptModeBtn = document.getElementById('scriptModeBtn');
        const templateModeBtn = document.getElementById('templateModeBtn');
        if (scriptModeBtn && templateModeBtn) {
            scriptModeBtn.addEventListener('click', () => {
                this.switchMode('script');
            });
            templateModeBtn.addEventListener('click', () => {
                this.switchMode('template');
            });
        }

        // Template generation button
        const generateFromTemplateBtn = document.getElementById('generateFromTemplate');
        if (generateFromTemplateBtn) {
            generateFromTemplateBtn.addEventListener('click', () => {
                this.generateFromTemplate();
            });
        }

        // Load preset template button
        const loadPresetTemplateBtn = document.getElementById('loadPresetTemplate');
        if (loadPresetTemplateBtn) {
            loadPresetTemplateBtn.addEventListener('click', () => {
                this.showPresetTemplates();
            });
        }

        // CSV format selector
        const csvFormatSelect = document.getElementById('csvFormatSelect');
        if (csvFormatSelect) {
            csvFormatSelect.addEventListener('change', (e) => {
                this.updateFormatDescription(e.target.value);
            });
        }

        // Load format template button
        const loadFormatTemplateBtn = document.getElementById('loadFormatTemplate');
        if (loadFormatTemplateBtn) {
            loadFormatTemplateBtn.addEventListener('click', () => {
                this.loadSelectedFormatTemplate();
            });
        }

        // Copy script button
        const copyScriptBtn = document.getElementById('copyScript');
        if (copyScriptBtn) {
            copyScriptBtn.addEventListener('click', () => {
                this.copyToClipboard('generatedScript');
            });
        }

        // Download script button
        const downloadScriptBtn = document.getElementById('downloadScript');
        if (downloadScriptBtn) {
            downloadScriptBtn.addEventListener('click', async () => {
                await this.downloadFile('generated_script.py', 'generatedScript');
            });
        }

        // Run script button
        const runScriptBtn = document.getElementById('runScript');
        if (runScriptBtn) {
            runScriptBtn.addEventListener('click', () => {
                this.runGeneratedScript();
            });
        }

        // Copy data button
        const copyDataBtn = document.getElementById('copyData');
        if (copyDataBtn) {
            copyDataBtn.addEventListener('click', () => {
                this.copyToClipboard('generatedData');
            });
        }

        // Download data button
        const downloadDataBtn = document.getElementById('downloadData');
        if (downloadDataBtn) {
            downloadDataBtn.addEventListener('click', async () => {
                await this.downloadFile('generated_data.csv', 'generatedData');
            });
        }

        // Load data button
        const loadDataBtn = document.getElementById('loadData');
        if (loadDataBtn) {
            loadDataBtn.addEventListener('click', async () => {
                const textarea = document.getElementById('generatedData');
                if (textarea.value.trim()) {
                    this.loadGeneratedData();
                    return;
                }

                if (window.showOpenFilePicker) {
                    try {
                        const [handle] = await window.showOpenFilePicker({
                            types: [{
                                description: 'CSV Files',
                                accept: {
                                    'text/csv': ['.csv'],
                                    'text/plain': ['.csv', '.txt']
                                }
                            }]
                        });
                        const file = await handle.getFile();
                        textarea.value = await file.text();
                        this.loadGeneratedData();
                    } catch (_) {
                        this.log('File selection cancelled');
                    }
                } else {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv,.txt';
                    input.addEventListener('change', async e => {
                        const file = e.target.files[0];
                        if (file) {
                            textarea.value = await file.text();
                            this.loadGeneratedData();
                        }
                    });
                    input.click();
                }
            });
        }

        // Load saved settings
        await this.loadSettings();
    },

    // Generate data script using AI
    generateDataScript: async function() {
        const prompt = document.getElementById('aiPrompt').value;
        if (!prompt.trim()) {
            this.log('Please enter a description of the data you want to generate', 'error');
            return;
        }

        if (!this.config.apiKey) {
            this.log('Please enter your OpenAI API key first', 'error');
            return;
        }

        this.updateStatus('Generating data script...', 'loading');
        this.log('Sending request to OpenAI...');

        try {
            const requestBody = {
                model: this.config.model,
                messages: [
                    {
                        role: 'system',
                        content: this.config.systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            };
            console.log('OpenAI request body:', requestBody);
            const response = await fetch(this.config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('OpenAI response:', data);
            let generatedScript = data.choices[0].message.content;

            // Clean up the generated script
            generatedScript = this.cleanGeneratedScript(generatedScript);

            document.getElementById('generatedScript').value = generatedScript;
            this.log('Script generated and cleaned successfully');
            this.updateStatus('Script generated successfully', 'success');

        } catch (error) {
            this.log(`Error generating script: ${error.message}`, 'error');
            this.updateStatus('Error generating script', 'error');
        }
    },

    // Clean up generated script by removing unnecessary comments and explanations
    cleanGeneratedScript: function(script) {
        if (!script || typeof script !== 'string') {
            return script;
        }

        this.log('Cleaning generated script...');

        // Split into lines
        let lines = script.split('\n');
        let cleanedLines = [];
        let inCodeBlock = false;
        let foundCodeStart = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Skip empty lines at the beginning
            if (cleanedLines.length === 0 && !line) {
                continue;
            }

            // Check for code block markers
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    foundCodeStart = true;
                    // Skip the opening ``` line
                    continue;
                } else {
                    inCodeBlock = false;
                    // Skip the closing ``` line
                    continue;
                }
            }

            // If we're in a code block, include the line
            if (inCodeBlock) {
                cleanedLines.push(lines[i]); // Keep original line with indentation
                continue;
            }

            // Skip explanatory text before code
            if (!foundCodeStart) {
                // Skip lines that are clearly explanations
                if (line.toLowerCase().includes('here is') || 
                    line.toLowerCase().includes('this script') ||
                    line.toLowerCase().includes('to accomplish') ||
                    line.toLowerCase().includes('your task') ||
                    line.toLowerCase().includes('python script') ||
                    line.toLowerCase().includes('will need') ||
                    line.toLowerCase().includes('rough script') ||
                    line.toLowerCase().includes('guide you') ||
                    line.toLowerCase().includes('note that') ||
                    line.toLowerCase().includes('may require') ||
                    line.toLowerCase().includes('specific limitations') ||
                    line.toLowerCase().includes('requirements') ||
                    line.toLowerCase().includes('you can run') ||
                    line.toLowerCase().includes('command line') ||
                    line.toLowerCase().includes('using python') ||
                    line.toLowerCase().includes('make sure') ||
                    line.toLowerCase().includes('install it') ||
                    line.toLowerCase().includes('using pip') ||
                    line.toLowerCase().includes('please make sure')) {
                    continue;
                }
            }

            // Skip lines that are clearly post-code explanations
            if (line.toLowerCase().includes('you can run') ||
                line.toLowerCase().includes('command line') ||
                line.toLowerCase().includes('using python') ||
                line.toLowerCase().includes('make sure') ||
                line.toLowerCase().includes('install it') ||
                line.toLowerCase().includes('using pip') ||
                line.toLowerCase().includes('please make sure') ||
                line.toLowerCase().includes('this script fetches') ||
                line.toLowerCase().includes('the sun is included') ||
                line.toLowerCase().includes('all data is written') ||
                line.toLowerCase().includes('note that the coordinates') ||
                line.toLowerCase().includes('you can run this script') ||
                line.toLowerCase().includes('please make sure you have')) {
                continue;
            }

            // Include the line if it's not an explanation
            cleanedLines.push(lines[i]);
        }

        // Remove trailing empty lines
        while (cleanedLines.length > 0 && !cleanedLines[cleanedLines.length - 1].trim()) {
            cleanedLines.pop();
        }

        const cleanedScript = cleanedLines.join('\n');
        this.log(`Script cleaned: ${lines.length} lines → ${cleanedLines.length} lines`);
        
        return cleanedScript;
    },

    // Generate sample data (without API call)
    generateSampleData: function() {
        this.log('Generating sample data...');
        
        const sampleScript = `import pandas as pd
import random
import numpy as np

# Generate sample scientific collaboration network
def generate_collaboration_data():
    # Create researchers
    researchers = []
    institutions = ['MIT', 'Stanford', 'Harvard', 'Caltech', 'UC Berkeley', 'CMU', 'Princeton', 'Yale']
    fields = ['Computer Science', 'Physics', 'Biology', 'Chemistry', 'Mathematics', 'Engineering']
    
    for i in range(50):
        researcher = {
            'id': f'researcher_{i+1}',
            'label': f'Dr. {chr(65 + (i % 26))}{chr(97 + (i % 26))}',
            'type': random.choice(fields),
            'size': random.randint(20, 50),
            'shape': random.choice(['ellipse', 'square', 'triangle']),
            'color': f'#{random.randint(0, 0xFFFFFF):06x}',
            'x': random.uniform(0, 1000),
            'y': random.uniform(0, 1000),
            'z': random.uniform(0, 1000)
        }
        researchers.append(researcher)
    
    # Create collaborations
    collaborations = []
    for i in range(100):
        source = random.choice(researchers)
        target = random.choice(researchers)
        if source['id'] != target['id']:
            collaboration = {
                'source': source['id'],
                'target': target['id'],
                'type': 'collaboration',
                'weight': random.randint(1, 10),
                'color': '#666666'
            }
            collaborations.append(collaboration)
    
    # Save to CSV
    pd.DataFrame(researchers).to_csv('researchers.csv', index=False)
    pd.DataFrame(collaborations).to_csv('collaborations.csv', index=False)
    print("Generated researchers.csv and collaborations.csv")

if __name__ == "__main__":
    generate_collaboration_data()`;

        const sampleData = `id,label,type,size,shape,color,x,y,z
researcher_1,Dr. Aa,Computer Science,35,ellipse,#ff6b6b,200,400,100
researcher_2,Dr. Bb,Physics,42,square,#4ecdc4,800,100,500
researcher_3,Dr. Cc,Biology,28,triangle,#45b7d1,150,700,200
researcher_4,Dr. Dd,Chemistry,38,ellipse,#96ceb4,700,300,800
researcher_5,Dr. Ee,Mathematics,31,square,#ffeaa7,300,900,600`;

        document.getElementById('generatedScript').value = sampleScript;
        document.getElementById('generatedData').value = sampleData;
        
        this.log('Sample data generated');
        this.updateStatus('Sample data generated', 'success');
    },



    // Switch between generation modes
    switchMode: function(mode) {
        const scriptMode = document.getElementById('scriptMode');
        const templateMode = document.getElementById('templateMode');
        const scriptModeBtn = document.getElementById('scriptModeBtn');
        const templateModeBtn = document.getElementById('templateModeBtn');
        
        if (mode === 'script') {
            scriptMode.style.display = 'block';
            templateMode.style.display = 'none';
            scriptModeBtn.style.background = '#007bff';
            scriptModeBtn.style.color = 'white';
            templateModeBtn.style.background = 'transparent';
            templateModeBtn.style.color = '#666';
        } else {
            scriptMode.style.display = 'none';
            templateMode.style.display = 'block';
            scriptModeBtn.style.background = 'transparent';
            scriptModeBtn.style.color = '#666';
            templateModeBtn.style.background = '#007bff';
            templateModeBtn.style.color = 'white';
        }
    },

    // Generate data from template
    generateFromTemplate: async function() {
        const template = document.getElementById('csvTemplate').value;
        const rowCount = document.getElementById('rowCount').value;
        const context = document.getElementById('templateContext').value;
        
        if (!template.trim()) {
            this.log('Please enter a CSV template with headers', 'error');
            return;
        }
        
        if (!this.config.apiKey) {
            this.log('Please enter your OpenAI API key first', 'error');
            return;
        }
        
        this.updateStatus('Generating data from template...', 'loading');
        this.log('Sending template to OpenAI...');

        try {
            const prompt = `Template: ${template}\n\nGenerate ${rowCount} rows of realistic data for this template. Context: ${context || 'general data'}`;

            const requestBody = {
                model: this.config.model,
                messages: [
                    {
                        role: 'system',
                        content: this.config.templatePrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature
            };
            console.log('OpenAI template request:', requestBody);

            const response = await fetch(this.config.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('OpenAI template response:', data);
            const generatedData = data.choices[0].message.content;
            
            document.getElementById('generatedData').value = generatedData;
            this.log('Template data generated successfully');
            this.updateStatus('Template data generated successfully', 'success');
            
        } catch (error) {
            this.log(`Error generating template data: ${error.message}`, 'error');
            this.updateStatus('Error generating template data', 'error');
        }
    },

    // Show preset templates
    showPresetTemplates: function() {
        const presets = [
            {
                name: 'Scientific Researchers',
                template: 'id,label,type,size,shape,color,x,y,z\nresearcher1,Dr. Smith,Physics,35,ellipse,#ff6b6b,0,0,0',
                context: 'scientific researchers and their collaborations'
            },
            {
                name: 'Social Network',
                template: 'id,label,type,size,shape,color,x,y,z\nperson1,John Doe,Friend,30,ellipse,#4ecdc4,0,0,0',
                context: 'social network of friends and family'
            },
            {
                name: 'Business Network',
                template: 'id,label,type,size,shape,color,x,y,z\ncompany1,Tech Corp,Technology,40,square,#45b7d1,0,0,0',
                context: 'business companies and their relationships'
            },
            {
                name: 'Knowledge Graph',
                template: 'id,label,type,size,shape,color,x,y,z\nconcept1,AI,Machine Learning,35,triangle,#96ceb4,0,0,0',
                context: 'knowledge graph of concepts and relationships'
            },
            {
                name: 'Geographic Network',
                template: 'id,label,type,size,shape,color,x,y,z\ncity1,New York,Metropolis,45,diamond,#ffeaa7,0,0,0',
                context: 'cities and their connections'
            }
        ];
        
        let presetHTML = '<div style="padding: 10px;"><h6 style="margin-top: 0; color: #555; font-size: 12px;">Select a preset template:</h6>';
        presets.forEach(preset => {
            presetHTML += `<div style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; cursor: pointer;" onclick="window.AIInputManager.loadPreset('${preset.name}')">
                <div style="font-weight: bold; font-size: 11px; color: #333;">${preset.name}</div>
                <div style="font-size: 10px; color: #666; margin-top: 2px;">${preset.context}</div>
            </div>`;
        });
        presetHTML += '</div>';
        
        // Create modal or update existing content
        const templateTextarea = document.getElementById('csvTemplate');
        if (templateTextarea) {
            templateTextarea.placeholder = 'Click "Load Preset" to see available templates...';
        }
        
        this.log('Preset templates available - click "Load Preset" to select');
    },

    // Load a specific preset
    loadPreset: function(presetName) {
        const presets = {
            'Scientific Researchers': {
                template: 'id,label,type,size,shape,color,x,y,z\nresearcher1,Dr. Smith,Physics,35,ellipse,#ff6b6b,0,0,0',
                context: 'scientific researchers and their collaborations'
            },
            'Social Network': {
                template: 'id,label,type,size,shape,color,x,y,z\nperson1,John Doe,Friend,30,ellipse,#4ecdc4,0,0,0',
                context: 'social network of friends and family'
            },
            'Business Network': {
                template: 'id,label,type,size,shape,color,x,y,z\ncompany1,Tech Corp,Technology,40,square,#45b7d1,0,0,0',
                context: 'business companies and their relationships'
            },
            'Knowledge Graph': {
                template: 'id,label,type,size,shape,color,x,y,z\nconcept1,AI,Machine Learning,35,triangle,#96ceb4,0,0,0',
                context: 'knowledge graph of concepts and relationships'
            },
            'Geographic Network': {
                template: 'id,label,type,size,shape,color,x,y,z\ncity1,New York,Metropolis,45,diamond,#ffeaa7,0,0,0',
                context: 'cities and their connections'
            }
        };
        
        const preset = presets[presetName];
        if (preset) {
            document.getElementById('csvTemplate').value = preset.template;
            document.getElementById('templateContext').value = preset.context;
            this.log(`Loaded preset: ${presetName}`);
        }
    },

    // Update format description when selection changes
    updateFormatDescription: function(formatKey) {
        const format = this.config.csvFormats[formatKey];
        if (format) {
            const descriptionElement = document.getElementById('formatDescription');
            if (descriptionElement) {
                descriptionElement.textContent = format.description;
            }
        }
    },

    // Load the selected format template
    loadSelectedFormatTemplate: function() {
        const formatSelect = document.getElementById('csvFormatSelect');
        const formatKey = formatSelect.value;
        const format = this.config.csvFormats[formatKey];
        
        if (format) {
            document.getElementById('csvTemplate').value = format.template;
            this.log(`Loaded ${format.name} template`);
            
            // Update context based on format type
            const contextInput = document.getElementById('templateContext');
            if (formatKey.includes('edges')) {
                contextInput.value = 'network relationships and connections';
            } else {
                contextInput.value = 'network nodes and entities';
            }
        }
    },

    // Run the generated script (actual execution)
    runGeneratedScript: function() {
        const script = document.getElementById('generatedScript').value;
        if (!script.trim()) {
            this.log('No script to run', 'error');
            return;
        }

        this.log('Running generated script...');
        this.updateStatus('Running script...', 'loading');
        
        // Create a temporary file with the script
        const scriptBlob = new Blob([script], { type: 'text/plain' });
        const scriptUrl = URL.createObjectURL(scriptBlob);
        
        // Create a download link for the script
        const downloadLink = document.createElement('a');
        downloadLink.href = scriptUrl;
        downloadLink.download = 'generated_script.py';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Download the script
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(scriptUrl);
        
        this.log('Script downloaded as generated_script.py');
        this.log('Please run the script manually and paste the output in the "Generated Data" field');
        this.updateStatus('Script downloaded - run manually and paste output', 'info');
        
        // Show instructions to user
        const instructions = `The script has been downloaded as 'generated_script.py'.
        
To run it:
1. Open a terminal/command prompt
2. Navigate to the download directory
3. Run: python generated_script.py
4. Copy the output and paste it in the "Generated Data" field above

Note: You may need to install required packages (e.g., pip install requests pandas astroquery)`;
        
        this.log(instructions);
    },

    // Load generated data into the graph
    loadGeneratedData: function() {
        const data = document.getElementById('generatedData').value;
        if (!data.trim()) {
            this.log('No data to load', 'error');
            return;
        }

        this.log('Loading data into graph...');
        this.updateStatus('Loading data...', 'loading');

        try {
            // Parse CSV data
            const lines = data.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV data must have at least a header row and one data row');
            }
            
            const headers = lines[0].split(',').map(h => h.trim());
            this.log(`Headers: ${headers.join(', ')}`);
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] ? values[index].trim() : '';
                });
                rows.push(row);
            }

            this.log(`Parsed ${rows.length} rows`);

            // Determine if this is node data or edge data
            const isNodeData = headers.includes('id') && headers.includes('label');
            const isEdgeData = headers.includes('source') && headers.includes('target');

            this.log(`Is node data: ${isNodeData}, Is edge data: ${isEdgeData}`);

            let quantickleData = { nodes: [], edges: [] };

            if (isNodeData) {
                // Process node data
                const validNodes = rows.filter(node => {
                    const isValid = node && node.id && node.label;
                    if (!isValid) {
                        this.log(`Skipping invalid node: ${JSON.stringify(node)}`);
                    }
                    return isValid;
                });
                
                this.log(`Found ${validNodes.length} valid nodes out of ${rows.length} rows`);
                
                // Scale coordinates to fit Absolute Layout's 1000x1000x1000 space
                const scaleCoordinates = (coord, minRange = -100, maxRange = 100, targetMin = 0, targetMax = 1000) => {
                    // If coordinate is already in the target range (0-1000), don't scale it
                    if (coord >= 0 && coord <= 1000) {
                        this.log(`Coordinate ${coord} already in target range (0-1000), using as-is`);
                        return coord;
                    }
                    
                    if (coord === 0) return targetMax / 2; // Center if coordinate is 0
                    const normalized = (coord - minRange) / (maxRange - minRange);
                    const scaled = targetMin + (normalized * (targetMax - targetMin));
                    this.log(`Scaling coordinate ${coord} (range ${minRange}-${maxRange}) to ${scaled} (range ${targetMin}-${targetMax})`);
                    return scaled;
                };

                quantickleData.nodes = validNodes.map(node => {
                    const x = parseFloat(node.x) || 0;
                    const y = parseFloat(node.y) || 0;
                    const z = parseFloat(node.z) || 0;
                    
                    // Scale coordinates to Absolute Layout space
                    const scaledX = scaleCoordinates(x);
                    const scaledY = scaleCoordinates(y);
                    const scaledZ = scaleCoordinates(z, -100, 100, 0, 1000);
                    
                    return {
                        data: {
                            id: node.id,
                            label: node.label,
                            type: node.type || 'default',
                            size: parseInt(node.size) || 30,
                            shape: node.shape || 'ellipse',
                            color: node.color || '#666666',
                            icon: node.icon || '',
                            x: scaledX,
                            y: scaledY,
                            z: scaledZ
                        },
                        position: {
                            x: scaledX,
                            y: scaledY
                        }
                    };
                });
                this.log(`Processed ${quantickleData.nodes.length} nodes`);
            }

            if (isEdgeData) {
                // Process edge data
                const validEdges = rows.filter(edge => {
                    const isValid = edge && edge.source && edge.target;
                    if (!isValid) {
                        this.log(`Skipping invalid edge: ${JSON.stringify(edge)}`);
                    }
                    return isValid;
                });
                
                this.log(`Found ${validEdges.length} valid edges out of ${rows.length} rows`);
                
                quantickleData.edges = validEdges.map(edge => ({
                    data: {
                        source: edge.source,
                        target: edge.target,
                        type: edge.type || 'connection',
                        weight: parseFloat(edge.weight) || 1,
                        color: edge.color || '#666666'
                    }
                }));
                this.log(`Processed ${quantickleData.edges.length} edges`);
            }

            // Validate data before loading
            if (quantickleData.nodes.length === 0 && quantickleData.edges.length === 0) {
                throw new Error('No valid data found to load');
            }

            this.log(`Final data: ${quantickleData.nodes.length} nodes, ${quantickleData.edges.length} edges`);

            // Load into graph using the proper data loading system
            if (window.DataManager) {
                this.log('Loading data with automatic layout detection...');
                this.log(`Data contains ${quantickleData.nodes.length} nodes with coordinates`);
                
                // Use the standard data loading system which includes automatic layout detection
                window.DataManager.setGraphData(quantickleData);
                
                // Render graph with new data
                if (window.GraphRenderer) {
                    this.log('Rendering graph with new data...');
                    window.GraphRenderer.renderGraph();
                    
                    // Force a refresh after a short delay to ensure everything is rendered
                    setTimeout(() => {
                        if (window.GraphRenderer && window.GraphRenderer.cy) {
                            this.log('Forcing final graph refresh...');
                            window.GraphRenderer.cy.fit();
                            window.GraphRenderer.cy.center();
                        }
                    }, 500);
                } else {
                    this.log('GraphRenderer not available', 'error');
                }
                
                this.log(`Data loaded successfully: ${quantickleData.nodes.length} nodes, ${quantickleData.edges.length} edges`);
                this.updateStatus('Data loaded successfully', 'success');
                
                // Switch to graph view
                setTimeout(() => {
                    window.globalFunctions.switchView('graph');
                }, 500);
            } else {
                throw new Error('DataManager not available');
            }

        } catch (error) {
            this.log(`Error loading data: ${error.message}`, 'error');
            this.updateStatus('Error loading data', 'error');
        }
    },

    // Copy text to clipboard
    copyToClipboard: function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.select();
            document.execCommand('copy');
            this.log('Copied to clipboard');
        }
    },

    // Download file using File System Access API when available
    downloadFile: async function(filename, elementId) {
        const element = document.getElementById(elementId);
        if (!element || !element.value) return;

        const data = element.value;
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Text file',
                        accept: { 'text/plain': ['.txt', '.py', '.csv'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(data);
                await writable.close();
                this.log(`Saved ${filename}`);
                return;
            } catch (_) {
                // fall back to download method
            }
        }

        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.log(`Downloaded ${filename}`);
    },

    // Update status
    updateStatus: function(message, type = 'info') {
        const statusElement = document.getElementById('aiStatus');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `ai-status-${type}`;
        }
    },

    // Add log message
    log: function(message, type = 'info') {
        const logsElement = document.getElementById('aiLogs');
        if (logsElement) {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.style.color = type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#666';
            logEntry.textContent = `[${timestamp}] ${message}`;
            logsElement.appendChild(logEntry);
            logsElement.scrollTop = logsElement.scrollHeight;
        }
    },

    // Save settings including API key to localStorage
    saveSettings: async function() {
        const encryptedKey = this.config.apiKey
            ? await SecureStorage.encrypt(this.config.apiKey)
            : '';
        localStorage.setItem(
            'quantickle_ai_settings',
            JSON.stringify({
                model: this.config.model,
                temperature: this.config.temperature,
                apiKey: encryptedKey
            })
        );
    },

    // Load settings from localStorage
    loadSettings: async function() {
        const saved = localStorage.getItem('quantickle_ai_settings');
        const modelSelect = document.getElementById('aiModel');
        const temperatureSlider = document.getElementById('aiTemperature');
        const temperatureValue = document.getElementById('temperatureValue');
        const apiKeyInput = document.getElementById('openaiApiKey');

        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.apiKey) {
                await SecureStorage.ensurePassphrase();
            }
            this.config.model = settings.model || this.config.model;
            this.config.temperature =
                settings.temperature !== undefined
                    ? settings.temperature
                    : this.config.temperature;
            this.config.apiKey = settings.apiKey
                ? await SecureStorage.decrypt(settings.apiKey)
                : '';

            // Update UI
            if (modelSelect) {
                modelSelect.value = this.config.model;
            }
            if (temperatureSlider) {
                temperatureSlider.value = this.config.temperature;
            }
            if (temperatureValue) {
                temperatureValue.textContent = this.config.temperature;
            }
            if (apiKeyInput) {
                apiKeyInput.value = this.config.apiKey;
            }
        } else {
            // No saved settings, ensure fields are clear
            if (apiKeyInput) {
                apiKeyInput.value = '';
            }
            this.config.apiKey = '';
        }
    },

    // Expose AIInputManager globally
    exposeGlobally: function() {
        window.AIInputManager = this;
    }
};

// Expose AIInputManager globally when script loads
if (typeof window !== 'undefined') {
    window.AIInputManager = window.AIInputManager || {};
    window.AIInputManager.exposeGlobally = window.AIInputManager.exposeGlobally || function() {
    };
}
