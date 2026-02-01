# Depth Field Support for 3D Positioning

Quantickle now supports depth-based 3D positioning through CSV data with depth fields. This allows for true 3D visualization where nodes can be positioned at different depths in 3D space.

## CSV Format with Depth Fields

### Supported Depth Fields

When importing CSV data, you can include depth information using these fields:

- `source_depth` - Depth value for source nodes
- `target_depth` - Depth value for target nodes
- `depth` - General depth value (for node-only CSV format)

### CSV Format Examples

#### Relationship Format (Recommended)
```csv
source_id,source_label,source_type,source_color,source_size,source_depth,target_id,target_label,target_type,target_color,target_size,target_depth,edge_type,edge_weight
node-1,Server A,server,#4CAF50,30,-150.5,node-2,Client B,client,#2196F3,25,75.3,connection,2.3
node-2,Client B,client,#2196F3,25,75.3,node-3,Database C,database,#FF9800,35,-25.4,connection,1.8
```

#### Node-Only Format
```csv
id,label,type,color,size,depth
node-1,Server A,server,#4CAF50,30,-150.5
node-2,Client B,client,#2196F3,25,75.3
node-3,Database C,database,#FF9800,35,-25.4
```

### Depth Values

- **Positive values**: Nodes appear "closer" to the viewer
- **Negative values**: Nodes appear "further away" from the viewer
- **Zero values**: Nodes are at the default depth (2D positioning)
- **Range**: Typically between -200 and +200 for best visual effect

## 3D Globe Effects

When depth data is present, the 3D Globe Effects system will:

1. **Use actual depth data** for positioning instead of spherical projection
2. **Apply depth-based visual effects**:
   - Nodes further away become grayer and lighter
   - Nodes closer become darker and more saturated
   - Size and opacity change based on depth
   - Z-index ordering for proper layering

### Enabling 3D Effects

1. Load data with depth fields
2. Select any layout (Grid, Circle, Force, etc.)
3. Open **View → Toggle Depth Effects** to enable the depth-based rendering
4. Optionally enable **View → Toggle Auto-Rotation** for dynamic rotation

## Test Data Generation

Load the bundled sample data to explore the depth effects quickly:

1. Navigate to **File → Import Data**
2. Select `globular_example.csv` (or another sample CSV with depth fields)
3. Import the file to visualize the preconfigured 3D dataset

## Visual Effects

### With Depth Data
- Nodes use their actual depth values for 3D positioning
- Depth-based color modifications (saturation, brightness)
- Size and opacity changes based on distance
- Proper Z-index layering

### Without Depth Data (2D Mode)
- Nodes are projected onto a sphere for 3D effect
- Spherical distribution creates depth illusion
- All 3D effects still apply but use calculated positions

## Performance Considerations

- **Large datasets**: Depth calculations are optimized for performance
- **Real-time updates**: Depth effects update smoothly during interaction
- **Memory efficient**: 3D positions are calculated on-demand

## Example Use Cases

1. **Network Topology**: Servers at different depths based on network layers
2. **Social Networks**: People positioned by relationship strength or hierarchy
3. **Geographic Data**: Locations with actual elevation or importance depth
4. **System Architecture**: Components at different abstraction levels
5. **Scientific Visualization**: Data points with actual 3D coordinates

## File Examples

- `globular_example.csv` - Sample data with depth fields
- Generated data includes 8 color-coded clusters with varying depths

## Tips for Best Results

1. **Use meaningful depth ranges**: -200 to +200 works well
2. **Group related nodes**: Similar depths for related entities
3. **Enable 3D effects**: Turn on "3D Globe Effects" for full experience
4. **Try different layouts**: Each layout works differently with depth
5. **Adjust zoom and pan**: Explore the 3D space interactively

