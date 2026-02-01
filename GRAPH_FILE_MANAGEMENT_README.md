# Graph File Management System

## Overview

Quantickle supports persistent graph files with the `.qut` extension, providing client-side storage and file management capabilities. This system allows users to create, open, save, and manage graph files locally without any server-side data storage.

## Key Features

### ✅ **Persistent Graph Files**
- **File Extension**: `.qut` (Quantickle Graph Files)
- **Format**: JSON-based graph data structure
- **Client-side Storage**: No user data stored on server
- **Cross-platform**: Works on any modern web browser

### ✅ **File Management UI**
- **📂 File → Set workspace**: Select local directory for `.qut` persistence (when supported)
- **📁 File → Open Graph File**: Standard file dialog for opening `.qut` files
- **📥 File → Import Data**: Load additional data sources into the current graph
- **💾 File → Save Graph As…**: Save current graph to new file
- **🗃️ File → Graph Store → Search**: Find graphs in Neo4j by matching node labels
- **📦 File → Graph Store → Load**: Retrieve a stored graph from Neo4j
- **🗄️ File → Graph Store → Save**: Persist current graph to Neo4j database

> ℹ️ The Graph Store actions remain disabled until you configure Neo4j credentials.
> Use **File → Graph Store → Neo4j Setup Guide** for installation and configuration
> instructions.
- **🆕 File → New Graph**: Create empty graph with custom name

## File Structure

### `.qut` File Format
```json
{
  "metadata": {
    "name": "Graph title",
    "source": "Manually added",
    "version": 1
  },
  "nodes": [
    {
      "id": "node-id",
      "label": "Node Label",
      "type": "node-type",
      "size": 20,
      "shape": "ellipse",
      "color": "#667eea",
      "info": "",
      "properties": {
        "custom": "properties"
      },
      "x": 120,
      "y": 340,
      "locked": false
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "Edge Label",
      "type": "edge-type",
      "weight": 1,
      "properties": {
        "custom": "properties"
      }
    }
  ],
  "layoutSettings": {
    "currentLayout": "absolute",
    "zoom": 1,
    "pan": { "x": 0, "y": 0 }
  }
}
```

This flattened structure matches what `exportCurrentGraph()` returns. Legacy
files that still wrap nodes and edges in a `data` property (Cytoscape style) are
automatically normalized on load—position, classes, and container metadata are
preserved. If a `graphId` property exists it is retained as the title while a new
UUID is generated for persistence bookkeeping.

Node `info` fields store optional markdown-formatted text.

### File Organization
```
quantickle/
├── assets/examples/example.qut    # Pre-created example graph
├── js/features/file-manager/      # File management module
│   └── file-manager-module.js
├── js/graph-manager.js            # Graph data operations
├── index.html                     # Main application
└── GRAPH_FILE_MANAGEMENT_README.md
```

## Usage Guide

> **Note:** When the browser supports the File System Access API, set a workspace via **File → Set workspace** to enable local `.qut` persistence.

### 1. **Opening Graph Files**
```javascript
// Via UI
// Use File menu: File → Open Graph File
// Select .qut file from file dialog

// Via API
window.FileManager.openFileDialog();
```

### 2. **Creating New Graphs**
```javascript
// Via UI
// Use File menu: File → New Graph
// Enter graph name in prompt

// Via API
window.FileManager.createNewGraph();
```

### 3. **Saving Graph Files**
```javascript
// Via UI
// Use File menu: File → Save Graph As…
// Choose location and filename

// Via API
window.FileManager.saveFileDialog();
```

### CSV Import Header Reference

When importing CSV data from **File → Import Data**, Quantickle accepts several
header aliases:

- **Node sections** (node rows first, then a blank line, then edge rows):
  - Required: `node_id`, `node_label`
  - Optional: `node_type`, `node_color`, `node_size`, `node_x` / `node_y` (node positions)
- **Edge sections** (following the node section) and **edge-only CSVs**:
  - Required: either `source`/`target` or `source_id`/`target_id` (aliases `from`/`to` are also recognized)
  - Optional: `edge_type`/`type`, `edge_label`/`label`, `edge_weight`/`weight`
  - Edge styles: `edge_type` values of `solid`, `dotted`, or `dashed` populate the edge line style; unrecognized values fall back to solid

Column order inside each section is flexible because headers are normalized and
matched case-insensitively. Use the two-section layout (nodes first, blank line,
then edges) when you want to supply explicit node attributes like colors; the
edge-only format infers nodes from the edge list.

## API Reference

### FileManager Module

#### `FileManager.init()`
Initialize the file management system.

#### `FileManager.openFileDialog()`
Open file dialog for selecting `.qut` files.

#### `FileManager.saveFileDialog()`
Save current graph to file with custom name.

#### `FileManager.createNewGraph()`
Create new empty graph with user-defined name.

#### `FileManager.exportGraph(format)`
Export graph in different formats:
- `'qut'` - Quantickle graph format (default)
- `'json'` - JSON format
- `'csv'` - CSV format
- `'png'` - PNG image
- `'pdf'` - PDF document


### GraphManager Module

#### `GraphManager.loadGraphData(graphData)`
Load graph data into the application.

#### `GraphManager.getCurrentGraphData()`
Get current graph data.

#### `GraphManager.addNode(nodeData)`
Add node to current graph.

#### `GraphManager.addEdge(edgeData)`
Add edge to current graph.

#### `GraphManager.clearCurrentGraph()`
Clear all data from current graph.

#### `GraphManager.exportGraph(format)`
Export current graph in specified format.

## Example Graph Structure

The `example.qut` file demonstrates:

### **Node Types**
- **Server**: Web servers, database servers
- **Network**: Load balancers, routers
- **Monitoring**: Monitoring systems
- **Storage**: Backup servers
- **Client**: User endpoints

### **Node Shapes**
- **Circle**: Standard nodes
- **Diamond**: Database nodes
- **Hexagon**: Network nodes
- **Triangle**: Monitoring nodes
- **Rectangle**: Storage nodes

### **Edge Types**
- **HTTP**: Web traffic
- **Database**: Database connections
- **Cache**: Cache access
- **Monitoring**: Health checks
- **Backup**: Backup operations
- **Access**: User access

## Integration with Existing Systems

### **API Integration**
The file management system integrates with existing API functionality:
- Graph data can be loaded from files
- API operations work with file-loaded graphs
- Export capabilities support multiple formats

### **Auto-Refresh**
File-loaded graphs support auto-refresh functionality:
- Real-time updates from API
- File changes trigger UI updates
- Seamless integration with existing refresh system

## Security Features

### **Client-Side Storage**
- ✅ No user data stored on server
- ✅ Files remain on user's local system
- ✅ Privacy maintained
- ✅ No server-side data persistence

### **File Validation**
- ✅ JSON structure validation
- ✅ Graph data format checking
- ✅ Error handling for invalid files
- ✅ Graceful failure recovery

## Browser Compatibility

### **Supported Browsers**
- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+

### **Required Features**
- ✅ File API support
- ✅ Blob API support
- ✅ JSON parsing
- ✅ Local storage

## Error Handling

### **Common Scenarios**
```javascript
// Invalid file format
if (!FileManager.validateGraphData(data)) {
    alert('Invalid graph file format');
    return;
}

// File read error
try {
    const graphData = JSON.parse(fileContent);
} catch (error) {
    alert('Error reading graph file: ' + error.message);
}

// Missing dependencies
if (!window.GraphManager) {
    console.error('GraphManager not available');
    return;
}
```

## Future Enhancements

### **Planned Features**
- **Graph Versioning**: Track changes and versions
- **Auto-Save**: Automatic file saving
- **Cloud Storage**: Optional cloud backup
- **Collaboration**: Multi-user editing
- **Templates**: Pre-built graph templates

### **Advanced Export Options**
- **SVG**: Image export
- **PDF**: Document export
- **Network Analysis**: Graph metrics export
- **Custom Formats**: Plugin-based export

## Troubleshooting

### **Common Issues**

#### **File Won't Open**
- Check file extension is `.qut`
- Verify JSON format is valid
- Ensure browser supports File API

#### **Save Not Working**
- Check browser permissions
- Verify sufficient disk space
- Ensure graph data is valid

#### **Example Graph Missing**
- Refresh page to recreate example
- Check localStorage is enabled
- Verify JavaScript is running

### **Debug Information**
```javascript
// Check file manager status
console.log('FileManager:', window.FileManager);

// Check current file
console.log('Current file:', window.FileManager.getCurrentFile());

// Check graph data
console.log('Current graph:', window.GraphManager.getCurrentGraphData());
```

## Conclusion

The graph file management system provides a complete solution for persistent graph storage with client-side file handling. Users can now create, save, and manage their graphs as local files while maintaining full privacy and control over their data.

The system integrates seamlessly with existing Quantickle functionality while providing a foundation for future enhancements and advanced features. 
