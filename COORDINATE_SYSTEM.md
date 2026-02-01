# Quantickle Coordinate System Documentation

## Overview

Quantickle uses a 3D coordinate system for positioning nodes in space. Understanding this system is crucial for creating data that visualizes correctly.

## Coordinate Space

### Absolute Layout Coordinate System
- **Range**: 0 to 1000 for all axes (X, Y, Z)
- **Origin**: (0, 0, 0) is at the bottom-left-back corner
- **Center**: (500, 500, 500) is the center of the 3D space
- **Containers**: Each container node uses the same 1000×1000×1000 space with its origin fixed at (500, 500, 500)
- **Sun Position**: The sun is always positioned at the center of the viewport
  - **X, Y**: Dynamically calculated as `(cy.width() / 2, cy.height() / 2)`
  - **Z**: Fixed at 300 for depth consistency with existing star data

### Coordinate Axes
- **X-axis**: Left to right (0 = leftmost, 1000 = rightmost)
- **Y-axis**: Bottom to top (0 = bottom, 1000 = top)
- **Z-axis**: Back to front (0 = farthest back, 1000 = closest to viewer)

## Input Coordinate Processing

### Automatic Coordinate Detection
Quantickle automatically detects the coordinate range of your input data and applies appropriate normalization:

1. **Coordinates in 0-1000 range**: Used as-is (no scaling)
2. **Coordinates in -100 to 100 range**: Scaled to 0-1000 range
3. **Other ranges**: Normalized to 0-1000 range

### Coordinate Normalization Rules

```javascript
// If coordinate is already in target range (0-1000), don't scale it
if (coord >= 0 && coord <= 1000) {
    return coord; // Use as-is
}

// For other ranges, normalize to 0-1000
const normalized = (coord - minRange) / (maxRange - minRange);
const scaled = targetMin + (normalized * (targetMax - targetMin));
```

### Special Cases
- **Zero coordinates (0, 0, 0)**: Automatically centered to (500, 500, 500)
- **Missing coordinates**: Default to (500, 500, 500)

## Z-Ordering and Depth Perception

### Depth Priority Calculation
```javascript
// For general 3D data (non-star data)
const depthPriority = zCoordinate; // Higher Z = closer to viewer = higher priority

// For star data (when sun is present)
const sunZ = 300; // Sun is at Z=300 (fixed for consistency)
const depthPriority = sunZ - zCoordinate; // Relative to sun position
```

### Z-Index Assignment
- **Higher Z values**: Closer to viewer, higher z-index (appears in front)
- **Lower Z values**: Farther from viewer, lower z-index (appears behind)
- **For star data**: Z=300 is the sun's depth, Z<300 appears in front of sun, Z>300 appears behind sun

### Z-Index Range
- **Range**: 1 to 1000
- **Normalization**: Based on the actual depth range of your data

## Recommended Coordinate Ranges

### For Best Visualization

#### Small Networks (5-20 nodes)
```
X: 100-900
Y: 100-900  
Z: 100-500 (for good depth separation)
```

#### Medium Networks (20-100 nodes)
```
X: 50-950
Y: 50-950
Z: 50-800
```

#### Large Networks (100+ nodes)
```
X: 0-1000
Y: 0-1000
Z: 0-1000
```

### Avoiding Common Issues

#### Don't Use These Ranges
- **All nodes at same Z**: No depth perception
- **All nodes at Z=500**: Creates flat visualization (center)
- **Coordinates outside 0-1000**: May cause unexpected scaling

#### Good Practices
- **Spread Z coordinates**: Use different Z values for depth
- **Center important nodes**: Place key nodes near Z=500 (center)
- **Use full range**: Distribute nodes across the available space

## CSV Format Examples

### Basic 3D Node Format
```csv
id,label,type,size,shape,color,x,y,z
```

### Scientific Collaboration Example
```csv
id,label,type,size,shape,color,x,y,z
researcher_2,Dr. Jones,Chemistry,42,square,#4ecdc4,800,100,500
researcher_3,Dr. Brown,Biology,28,triangle,#45b7d1,150,700,200
node1,Central Hub,Hub,40,ellipse,#ff0000,500,500,300
node2,Front Node,Front,30,ellipse,#00ff00,300,400,100
node3,Back Node,Back,30,ellipse,#0000ff,700,600,800
researcher_5,Dr. Davis,Engineering,31,square,#ffeaa7,300,900,600
```

## Coordinate System in Different Layouts

### Absolute Layout
- **Uses**: Explicit X, Y, Z coordinates from your data
- **Best for**: Data with known spatial relationships
- **Auto-selection**: Triggered when nodes have X, Y, Z coordinates

### 3D Globe Layout
- **Uses**: Latitude/longitude data (converted to 3D sphere)
- **Best for**: Geographic data
- **Auto-selection**: Triggered when nodes have lat/lon coordinates

### Other Layouts
- **Grid Layout**: Ignores coordinates, arranges in 2D grid
- **Force Layout**: Ignores coordinates, uses force simulation

## Troubleshooting

### Common Issues

#### Nodes Stacked in Corner
**Cause**: All nodes have same or very similar coordinates
**Solution**: Use diverse X, Y, Z values

#### No Depth Perception
**Cause**: All Z coordinates are the same
**Solution**: Vary Z coordinates between 0-1000

#### Nodes Appear Behind Expected Position
**Cause**: Z coordinates too low
**Solution**: Use higher Z values for nodes that should appear in front

#### Unexpected Scaling
**Cause**: Coordinates outside expected ranges
**Solution**: Use coordinates in 0-1000 range or document your range

### Debug Information
Check the browser console for coordinate processing logs:
```
Coordinate 200 already in target range (0-1000), using as-is
Scaling coordinate -50 (range -100-100) to 250 (range 0-1000)
```

## Best Practices Summary

1. **Use 0-1000 range** for predictable results
2. **Vary Z coordinates** for depth perception
3. **Center important nodes** around Z=300
4. **Spread nodes** across the available space
5. **Test with small datasets** first
6. **Check console logs** for coordinate processing
7. **Document your coordinate system** if using custom ranges

## API Reference

### Data Structure
```javascript
{
  data: {
    id: "node1",
    label: "Node Label",
    x: 500,  // 0-1000
    y: 500,  // 0-1000
    z: 300   // 0-1000
  },
  position: {
    x: 500,  // Cytoscape.js position
    y: 500   // Cytoscape.js position
  }
}
```

### Coordinate Processing Functions
- `scaleCoordinates(coord, minRange, maxRange, targetMin, targetMax)`: Normalizes coordinates
- `applyZIndexToNodes()`: Applies depth-based z-index
- `autoDetectAndSelectLayout()`: Chooses appropriate layout based on data
researcher_4,Dr. Wilson,Math,38,ellipse,#96ceb4,700,300,800
researcher_1,Dr. Smith,Physics,35,ellipse,#ff6b6b,200,400,100
