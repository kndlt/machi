# Sun Light System Design Document

## Overview

The Sun Light System is a photon-based lighting simulation that will serve as the foundation for future microbial simulation features. This system simulates realistic light transport through a tile-based environment, creating dynamic lighting, shadows, and heat distribution.

## Objectives

- **Primary**: Implement a photon-based lighting system that creates realistic light distribution and shadows
- **Secondary**: Establish foundation for microbial simulation that depends on light and heat
- **Tertiary**: Provide visual debugging capabilities for development and testing

## Core Requirements

### Light Source Configuration
- **Position**: Top-left corner, 30° angle from Y-axis
- **Type**: Line light source perpendicular to sun direction
- **Coverage**: Wide enough to illuminate the entire tile map
- **Scope**: Positioned outside the visible tile map boundaries

### Photon Simulation
- **Generation**: Photons spawn from the light source and travel as discrete particles
- **Movement**: One tile per tick movement toward the tile map
- **Visualization**: Rendered as short lines in debug mode
- **Lifecycle**: Continue until absorbed by tiles or exit the map

### Tile Interactions

#### Material Properties
| Tile Type | Behavior |
|-----------|----------|
| **Air** | Complete transparency - photons pass through |
| **Water** | Partial transmission with refraction |
| **Dirt** | Complete absorption |
| **Stone** | Complete absorption with diffuse reflection |

#### Light Absorption
- Tiles accumulate heat/energy when absorbing photons
- Absorption rate varies by material type
- Accumulated energy affects tile brightness rendering

### Reflection and Bouncing
- **Solid Tiles**: Photons reflect off Dirt and Stone surfaces
- **Reflection Type**: Diffuse (random direction) rather than specular
- **Energy Loss**: Each bounce reduces photon intensity
- **Convergence**: System reaches stable state over time

## Technical Specifications

### Performance Characteristics
- **Update Frequency**: Infrequent, non-real-time computation
- **Priority**: Accuracy over performance
- **Convergence**: Gradual stabilization similar to 3D rendering exposure averaging
- **Orthogonality**: Independent of existing water simulation and promiser systems

### Rendering System
- **Normal Mode**: Enhanced tile brightness based on accumulated light
- **Debug Mode**: Visible photon particles as moving line segments
- **Shadow Rendering**: Natural shadow creation from light occlusion
- **Brightness Range**: Darker unlit areas (not completely black) to brighter lit areas

### System Stability
- **Convergence**: Light distribution stabilizes over time
- **Energy Conservation**: Consideration for light energy normalization per tick
- **Steady State**: System reaches equilibrium where light input equals absorption/exit

## Implementation Phases

### Phase 1: Core System
1. Light source implementation outside tile map
2. Basic photon generation and movement
3. Simple absorption by solid tiles
4. Debug visualization mode

### Phase 2: Material Interactions
1. Differential absorption rates by tile type
2. Water refraction mechanics
3. Diffuse reflection from solid surfaces
4. Tile brightness rendering

### Phase 3: Optimization & Polish
1. Performance optimization for convergence
2. Energy normalization systems
3. Enhanced visual effects
4. System stability improvements

## Future Considerations

### Configurable Parameters
- Light source position and angle adjustment
- Intensity and color temperature controls
- Material property customization

### Integration Points
- **Microbial Simulation**: Heat and light distribution affecting organism behavior
- **Dynamic Environment**: Moving objects affecting light paths
- **Weather System**: Variable light conditions and atmospheric effects

### Advanced Features
- **Multiple Light Sources**: Support for additional light sources
- **Atmospheric Scattering**: More realistic light transport
- **Temporal Variation**: Day/night cycles and seasonal changes

## Success Criteria

1. **Visual Quality**: Realistic shadows and lighting gradients
2. **Performance**: Stable convergence without frame rate impact
3. **Accuracy**: Physically plausible light distribution
4. **Debuggability**: Clear visualization of light transport
5. **Extensibility**: Foundation ready for microbial simulation integration
