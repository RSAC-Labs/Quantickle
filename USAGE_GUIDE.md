# Quantickle Usage Guide

This guide provides detailed instructions on how to use Quantickle's features effectively.

## Table of Contents

- [Getting Started](#getting-started)
- [Data Management](#data-management)
- [Graph Visualization](#graph-visualization)
- [Layout Options](#layout-options)
- [Interaction Tools](#interaction-tools)
- [Advanced Features](#advanced-features)
- [Tips and Tricks](#tips-and-tricks)

## Getting Started

### First Time Setup

1. Launch Quantickle in your browser. The menu bar runs along the top with File, View, Layout, and Tools controls, and the view tabs let you show or hide supporting panels around the main graph.
2. Choose **File → Set workspace** and pick the folder that holds the graph files you want to work with.
3. Use the view tabs to toggle panels such as Graph, Tables, and Console so the layout matches the task at hand.

### Quick Start Tutorial

1. **Import data**
   - Go to **File → Import Data**.
   - Select a CSV or `.edges` file, or choose one of the sample graphs from the menu.
   - Alternatively, place some nodes manually by pasting text or selecting "Add node" in the dropdown menu. 
     Any pasted text will become a node, which you then can change into a type of your choice.

2. **Choose Layout**
   - Layout → Dagre - Changes the node layout to a hierarchical structure. Play around with different layouts - they can also often be combined
     Eg. circular + euler layouts creates a relatively globular cluster, but wide tree + euler creates a drawn out cluster. 


3. **Explore**
   - Drag nodes to reposition.
   - Scroll to zoom.
   - Click nodes to inspect details and double-click a node to focus the camera.

## Data Management

### Importing Data

Quantickle’s importer handles CSV and `*.edges` files.
Use **File → Import Data** and choose the appropriate source:

- **CSV** – Supply either:
  - A node section followed by an edge section (Quantickle’s export layout).
    Headers such as `node_id`, `Node Label`, `nodeType`, `source`, `target`, and
    `label` are matched case-insensitively. Blank rows separate the sections.
  - A flat edge list with at least `source` and `target`. Optional columns like
    `source_type`, `target_label`, `weight`, or `color` are merged into the
    generated graph.

- **Edge list (`.edges`)** – Plain whitespace-delimited pairs. Quantickle creates
  any missing nodes automatically.


After importing, the notification banner summarises how many nodes and edges were
added. Use **File → Save Graph As…** to persist the result as a `.qut` file.

### Data Tables

1. **Node Table**
   - View all nodes
   - Sort by columns
   - Filter data
   - Edit properties

2. **Edge Table**
   - View relationships
   - Manage connections
   - Edit edge properties

3. **Search and Filter**
   - Use search box
   - Apply filters
   - Save filter presets

## Graph Visualization

### Node Styling

1. **Colors**
   ```javascript
   // Set node color
   node.style({
     'background-color': '#667eea',
     'border-color': '#ffffff'
   });
   ```

2. **Shapes**
   - ellipse (default)
   - rectangle
   - triangle
   - diamond
   - hexagon
   - octagon
   - star

3. **Sizes**
   ```javascript
   // Set node size
   node.style({
     'width': 30,
     'height': 30
   });
   ```

4. **Icons**
   ```javascript
   // Add icon to node
   node.style({
     'background-image': 'url(assets/icons/server.png)',
     'background-fit': 'cover'
   });
   ```

### Edge Styling

1. **Line Styles**
   ```javascript
   // Set edge style
   edge.style({
     'line-color': '#333333',
     'width': 2,
     'line-style': 'solid' // or 'dashed', 'dotted'
   });
   ```

2. **Arrows**
   ```javascript
   // Configure arrows
   edge.style({
     'target-arrow-shape': 'triangle',
     'source-arrow-shape': 'none',
     'arrow-scale': 1.5
   });
   ```

3. **Labels**
   ```javascript
   // Add edge label
   edge.style({
     'label': 'connects to',
     'text-rotation': 'autorotate'
   });
   ```

## Layout Options

### Built-in Layouts

1. **Force Layout**
   ```javascript
   // Apply force layout
   cy.layout({
     name: 'force',
     animate: true,
     randomize: false,
     infinite: false
   }).run();
   ```

2. **Grid Layout**
   ```javascript
   // Apply grid layout
   cy.layout({
     name: 'grid',
     rows: undefined,
     cols: undefined,
     animate: true
   }).run();
   ```

3. **Circle Layout**
   ```javascript
   // Apply circle layout
   cy.layout({
     name: 'circle',
     radius: undefined,
     animate: true
   }).run();
   ```

4. **Temporal Attraction (time-weighted force)**
   ```javascript
   // Group nodes by timestamp proximity
   cy.layout({
     name: 'temporal-attraction',
     timeMode: 'gaussian',           // or 'bucket'
     timeSigma: 60 * 60 * 1000,      // 1 hour sigma for Gaussian mode
     repulsionStrength: 12
   }).run();
   ```

### Custom Layouts

1. **Hierarchical**
   ```javascript
   // Apply hierarchical layout
   cy.layout({
     name: 'dagre',
     rankDir: 'TB',
     align: 'UL'
   }).run();
   ```

2. **Clustering**
   ```javascript
   // Apply clustering layout
   cy.layout({
     name: 'cose-bilkent',
     quality: 'default',
     nodeRepulsion: 4500
   }).run();
   ```

## Interaction Tools

### Selection Tools

1. **Single Selection**
   - Click node/edge
   - View properties
   - Edit attributes

2. **Multiple Selection**
   - Shift + Click
   - Box selection
   - Select by type

3. **Selection Actions**
   - Delete selected
   - Hide selected
   - Group selected

### Navigation

1. **Zoom Controls**
   - Scroll to zoom
   - Double-click to focus
   - Fit to screen

2. **Pan Controls**
   - Drag background
   - Arrow keys
   - Center view

3. **History**
   - Undo/Redo
   - Reset view
   - Save views

## Advanced Features

### Graph Analysis

1. **Metrics**
   - Node degree
   - Centrality
   - Path length

2. **Filtering**
   ```javascript
   // Filter nodes by type
   cy.nodes().filter(node => 
     node.data('type') === 'server'
   );
   ```

3. **Grouping**
   ```javascript
   // Group nodes by type
   const groups = {};
   cy.nodes().forEach(node => {
     const type = node.data('type');
     if (!groups[type]) groups[type] = [];
     groups[type].push(node);
   });
   ```

### Performance Optimization

1. **Large Graphs**
   - Enable WebGL
   - Use simple layouts
   - Disable animations

2. **Memory Management**
   - Clear unused data
   - Batch operations
   - Use pagination

## Tips and Tricks

### Keyboard Shortcuts

- `Ctrl + A`: Select all
- `Ctrl + C`: Copy selected
- `Ctrl + V`: Paste nodes or images (pasted images become nodes with file path icons)
- `Delete`: Remove selected
- `Space`: Fit to screen
- `Esc`: Clear selection

### Best Practices

1. **Data Organization**
   - Use consistent naming
   - Group related nodes
   - Document relationships

2. **Visual Clarity**
   - Use distinct colors
   - Size by importance
   - Clear labels

3. **Performance**
   - Limit visible nodes
   - Use simple layouts
   - Batch updates

### Common Issues

1. **Graph Not Rendering**
   - Check data format
   - Verify WebGL support
   - Clear browser cache

2. **Poor Performance**
   - Reduce node count
   - Simplify layout
   - Enable WebGL

3. **Layout Issues**
   - Try different layouts
   - Adjust parameters
   - Check node connections

## Examples

## Additional Resources

- [API Reference](./API_REFERENCE.md)
- [Performance Guide](./PERFORMANCE.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Cytoscape.js Documentation](https://js.cytoscape.org)

