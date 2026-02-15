# Microbial System Design – *Machi*

## Overview

The **Microbial System** in *Machi* is designed to bring a sense of life and realism to the tile-based simulation environment. Microbes act as dynamic, semi-autonomous agents that subtly influence the terrain over time. They are essential in creating emergent behaviors and ecological balance across different biomes in the game world.

This system turns an otherwise static tilemap into a living, evolving ecosystem.

---

## Goals

- Simulate invisible life that dynamically interacts with the world.
- Enrich soil and water conditions over time, encouraging environmental evolution.
- Visualize microbes subtly, with accumulative presence forming visible hints of activity.
- Enable emergent gameplay by simulating light, temperature, terrain, and resource cycles.
- Maintain performance and visual clarity despite large-scale simulation.

---

## Microbe Characteristics

| Property             | Description |
|----------------------|-------------|
| **Type**             | `Waterborne`, `Soil-dwelling`, `Aerial`, `Photosynthetic`, `Symbiotic`, etc. |
| **Mobility**         | Microbes move tile-by-tile (pixel-aligned). No subpixel drift. |
| **Preferred Habitat**| Varies by type. Some prefer water, others underground, some require sunlight. |
| **Lifespan**         | Time-bound or perpetual, depending on energy intake and environment. |
| **Visibility**       | Rendered as translucent pixels. Densely packed microbes become visible. |
| **Behavior**         | Rule-based with optional random variation. E.g., migrate toward moisture, cluster in fertile zones. |

---

## World Interaction

### 1. Soil Enrichment
- Convert ordinary dirt into fertile soil over time.
- Boosts plant growth (future feature).
- Leaves behind organic residue that influences future microbe behavior.

### 2. Water Purification / Contamination
- Some microbes clean water; others degrade it.
- May influence aquatic growth or simulate algae blooms.

### 3. Airborne Spread
- Spread via passive diffusion or wind currents (if modeled).
- Enables colonization of new areas.

---

## Simulation Details

### Movement
- Grid-based (1px per move).
- Moves to neighboring tiles based on preferences.
- May "bounce" or die when entering inhospitable terrain.

### Replication
- Occurs when environmental thresholds are met (e.g., water + sunlight).
- Rate-limited to prevent exponential growth.

### Resource Consumption
- Consumes light, organic matter, or water.
- Competes with other microbes for limited resources.

### Visual Representation
- Rendered with low-opacity color (e.g., 10–20% alpha).
- Dense clusters become visible.
- Optional: color tinted by type or condition.

---

## Environmental Factors (Planned)

### Light System
- Supports photosynthetic microbes.
- Directional light from above; occluded by terrain.

### Temperature
- Affects metabolism and survival.
- Cold zones may inhibit growth or movement.

### Biomes
- World divided into biome zones.
- Affects viability of specific microbes.

---

## Technical Considerations

- **Memory Management:** Tile-local spatial partitioning.
- **Tick System:** Distributed updates for performance.
- **Serialization:** Microbes saved/loaded with world state.
- **Debug Tools:** Developer toggle to visualize microbe layers.

---

## Potential Expansions

- **Microbial Evolution:** Traits and generational adaptation.
- **Diseases / Plagues:** Aggressive microbes with negative effects.
- **Symbiotic AI Behavior:** Microbes altering AI agent behavior.
- **Crafting / Farming System:** Microbes affecting growth/yields.

---

## Summary

The microbial system is not just a visual flourish but a foundational simulation layer in *Machi*. It enriches the world, provides dynamic feedback to environmental changes, and sets the groundwork for complex emergent behavior. This system is intended to be extensible, efficient, and integral to Machi's identity as a simulation-driven AI-first world.
