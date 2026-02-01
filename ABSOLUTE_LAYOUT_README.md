# Absolute Layout System

The Absolute Layout system allows you to place nodes at their exact coordinates in a 1000x1000x1000 3D space. Nodes without coordinates will be placed randomly within this space.

## Features

- **Fixed 3D Coordinates**: Place nodes at exact x, y, z positions
- **Random Placement**: Nodes without coordinates are placed randomly
- **Depth Effects**: Visual depth effects based on z-coordinate
- **Seeded Random**: Optional random seed for consistent random placement
- **Coordinate Validation**: Coordinates are clamped to the 1000x1000x1000 space

## CSV Format

To use absolute coordinates, add the following fields to your CSV:

### Required Fields
- `source_id`, `target_id` - Node identifiers
- `source_label`, `target_label` - Node labels
- `source_type`, `target_type` - Node types
- `source_color`, `target_color` - Node colors
- `source_size`, `target_size` - Node sizes

### Optional Coordinate Fields
- `source_x`, `target_x` - X coordinates (0-1000)
- `source_y`, `target_y` - Y coordinates (0-1000)
- `source_z`, `target_z` - Z coordinates (0-1000)

### Example CSV
```csv
source_id,source_label,source_type,source_color,source_size,source_x,source_y,source_z,target_id,target_label,target_type,target_color,target_size,target_x,target_y,target_z,edge_type,edge_weight
A,Node A,type1,#ff6b6b,25,100,100,100,B,Node B,type2,#4ecdc4,30,200,150,200,connects,1
B,Node B,type2,#4ecdc4,30,200,150,200,C,Node C,type1,#45b7d1,20,300,200,150,connects,2
K,Node K,type2,#a55eea,29,,,L,Node L,type1,#26de81,27,,,connects,1
```

## How It Works

### Nodes with Coordinates
- Nodes with `x`, `y`, `z` values are placed at those exact coordinates
- Coordinates are clamped to the 1000x1000x1000 space
- Example: `source_x=100, source_y=200, source_z=300` places the node at (100, 200, 300)

### Nodes without Coordinates
- Nodes missing `x`, `y`, or `z` values are placed randomly
- Random placement uses the full 1000x1000x1000 space
- Example: `source_x=, source_y=, source_z=` (empty values) = random placement

### Mixed Scenarios
- You can mix nodes with and without coordinates
- Nodes with coordinates maintain their exact positions
- Nodes without coordinates get random positions
- This allows for flexible graph construction

## Configuration

The Absolute Layout can be configured with the following options:

```javascript
window.AbsoluteLayout.setConfig({
    spaceWidth: 1000,      // 3D space width
    spaceHeight: 1000,     // 3D space height
    spaceDepth: 1000,      // 3D space depth
    centerX: 500,          // Center X coordinate
    centerY: 500,          // Center Y coordinate
    centerZ: 500,          // Center Z coordinate
    randomSeed: null,      // Random seed for consistent random placement
    depthEffect: true,     // Enable depth-based visual effects
    depthRange: 1000,      // Maximum depth range for effects
    saturationRange: 0.3,  // How much saturation changes with depth
    brightnessRange: 0.4,  // How much brightness changes with depth
    sizeRange: 0.5         // How much size changes with depth
});
```

## Usage

1. **Select the Layout**: Layout → Absolute - Fixed 3D Coordinates
2. **Import Data**: File → Import Data with a CSV that includes coordinate fields
3. **View Results**: Nodes will be positioned according to their coordinates or randomly

## Visual Effects

The Absolute Layout includes depth-based visual effects:

- **Closer nodes** (lower z-coordinate): Full visibility, higher z-index
- **Distant nodes** (higher z-coordinate): Reduced opacity, smaller size, desaturated colors
- **Depth calculation**: Combines z-coordinate with 2D distance from viewport center

## Examples

### Grid Pattern
```csv
source_id,source_x,source_y,source_z
A,100,100,100
B,200,100,100
C,300,100,100
D,100,200,100
E,200,200,100
F,300,200,100
```

### 3D Cube
```csv
source_id,source_x,source_y,source_z
A,100,100,100
B,900,100,100
C,100,900,100
D,900,900,100
E,100,100,900
F,900,100,900
G,100,900,900
H,900,900,900
```

### Mixed Coordinates
```csv
source_id,source_x,source_y,source_z
A,100,100,100
B,200,200,200
C,,,  # Random placement
D,400,400,400
E,,,  # Random placement
```

## Tips

1. **Coordinate Planning**: Plan your coordinate system before creating the CSV
2. **Edge Visualization**: Edges will connect nodes regardless of their 3D positions
3. **Performance**: Large numbers of nodes with coordinates are processed efficiently
4. **Validation**: Coordinates outside the 1000x1000x1000 range are automatically clamped
5. **Random Seeds**: Set a random seed for reproducible random placements

## Integration

The Absolute Layout integrates seamlessly with:
- **Depth Effects**: Automatic depth-based visual effects
- **Zoom/Pan**: Depth effects update during view changes
- **Node Styling**: Respects node colors, sizes, and other properties
- **Edge Rendering**: Edges connect nodes in 3D space

