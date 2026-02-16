# Machi - Semantic Tile 1

In this blog post we explore various strategies for designing Semantic Tiles.

## What is Semantic Tile?

We had bunch of versions but let's do some trials to find the best wording.

> **Trial 1**: A Semantic Tile is the **smallest world unit** that **encodes** not only visual appearance but also **meaning**, behavior, and relationships within the environment.

> **Trial 2**: A Semantic Tile is a fundamental unit of world representation that carries semantic meaning, environmental properties, and interaction rules, allowing the world to be simulated rather than merely rendered.

> **Trial 3**: A Semantic Tile is the smallest meaningful unit of the world - a block that knows what it is, how it behaves, and how it relates to its surroundings.

This one is the best one so far, but I wanted something that has DNA, and cellular automata vibe.

> **Trial 4**: A Semantic Tile is **indivisible unit** of the world that encodes the **genotypes** or the **latents** of that location.

Let's refine it further

> **Trial 5**: A Semantic Tile is an indivisible unit of the world that encodes the latent representation of a location.

> **Trial 6**: A Semantic Tile is an **indivisible unit** of the world that **encodes** the latent **identity of a location** -- its underlying properties, behaviors, and potential interactions.

Okay, let's go with this one.

## Single Source, Dual Phenotype Model

Each Semantic Tile is backed by a single latent representation that gives rise to multiple observable phenotypes.


From the same underlying statem the tile can express:

- A visual phenotype used for rendering and appearance generation
- A physical phenotype used for simulation properties such as wetness, density and viscosity.

This ensures the world remains coherent - how something looks and how it behaves emerge from the same source rather than separate systems.

## Prior Art - Minecraft

Minecraft is perhaps the most influential example of a block-based world simulation. It demonstrated that complex and emergent environments can arise from simple discrete units.

In Minecraft, the world is composed of blocks that encode both visual appearance and gameplay behavior. Each block type - such as grass, water, stone, or sand - has predefined properties that determine how it looks and interacts with the environment.

This model introduced several powerful ideas:

- A world build from discrete atomic units
- Emergent gameplay from simple local rules
- Simulation driven by block interactions
- Procedural generation of large environments

Minecraft showed that a world does not need continuous geometry to fell alive - discrete blocks are enough to create rich systems.

**Limitation of the Traditional Block Model:** However, Minecraft's block system is fundamentally type-based rather than representation-based. each block belongs to a predefined category with hardcoded behavior:

- Grass is always grass
- Water is always water
- Sand always follows the same physics
- Visual appearance and simulation rules are tightly coupled to block type

This makes the system powerful but rigid. Extending behavior often requires introducing entirely new block types rather than evolving existing ones.

The world is expressive, but not deeply semantic.


**Transition to Semantic Tiles:**  Semantic Tiles build on the core insight of Minecraft - that discrete units can form a living world - but replace fixed block types with latent representations.

Instead of blocks being defined by static categories, tiles encode underlying properties that can express multiple phenotypes, allowing appearance and behavior to emerge from a shared substrate.

If Minecraft blocks are predefined materials, Semantic Tiles are programmable matter.

## Latents - Continuous vs Discrete vs Tokenized

**Continuous latents**: Values exist on a continous spectrum.

Examples:
- temperature: 0.731
- density: 0.412
- latent vector = R^d

Smooth transitions
interpolation possible
gradient-based learning
natural modeling of physical processes

**Discrete Latents**: Values belong to a finite set of states.

Examples:

- state in {solid, liquid, gas}
- type in {grass, water, stone}
- integer categories

**Tokenized latents**: Tokenization is a specific way of making something discrete by mapping continuous space into a finite codebook.

That is what happens in:

- VQ-VAE
- LLM tokens
- semantic codebooks
- quantized embeddings

**Implications**: Semantic Tiles can leverage continuous latents as the underlying source of truth while using discrete or tokenized projections for interaction, storage, or rendering. This allows the world to maintain smooth internal dynamics while still supporting stable symbolic representations.

---

## Design of Semantic Tiles

Semantic Tiles are designed as the fundamental substrate of the world -- the smallest units that carry state, meaning, and potential behavior. Rather than treating tiles as fixed types, the system models each tile as a latent-driven entity whoes observable properties emerge through projections.

This design allows the world to remain both expressive and coherent, supporting smooth environmental variation while maintaining clear interaction rules.

### Core Principles

The design of semantic tiles is guided by several principle:

- Latent-first representation - The underlying source of truth is a continuos latent vector capturing the intrinsic state of the tile.
- Phenotypic projection - Observable properties such as appearance and physics emerge from projections of the latent state.
- Contextual interaction - Tile behavior depends not only on its own state but also on neighboring tiles.
- Composable semantics - Tiles can represent mixtures of materials rather than belonging to rigid categories.
- Interpretability layer - Discrete labels and types exist as projections for interaction and reasoning, not as the ground truth.

### Tile Structure

Conceptually, a semantic tile can be thought of as a layered representation:

```
Semantic Tile
- Latent State (continuous vector)
- Physical Phenotype
- Visual Phenotype
- Semantic Projections
- Interaction Interfaces
```

### Latent State

The latent state is a continuous d-dimensional vector that encodes the intrinsic properties of the tile. This representation captures the underlying identity of the location, allowing smooth variation and interpolation across the world.

Because latent space is continuous, tiles can represent subtle differences in composition, environment, and history without requiring categorical definitions.

### Phenotypic Projections

From the latent state emerge observable phenotypes.

Visual Phenotype

The visual phenotype determines how the tile appears when rendered. A neural renderer or procedural system can use both the tile’s latent state and its neighborhood context to generate coherent visuals with smooth transitions.

Physical Phenotype

The physical phenotype defines simulation properties such as density, wetness, viscosity, temperature, and elasticity. These parameters govern interactions with agents and neighboring tiles.

### Semantic Projections

Semantic projections provide interpretable labels derived from the latent state. These may include material classes, biome associations, or interaction categories.

Unlike traditional tile systems, these labels are descriptive rather than prescriptive — they summarize the underlying state rather than defining it.

### Interaction Model

Tiles interact through local rules operating on their physical and semantic projections. Because the underlying representation is continuous, interactions can produce gradual changes such as diffusion, erosion, growth, or mixing.

This enables the environment to evolve naturally rather than switching between discrete states.

### Material Decomposition

When tiles are modified or collected by agents, their latent composition can be projected into material vectors representing accumulated resources. This allows conservation-like behavior where matter is transformed rather than simply removed.

### Why This Design Matters

By grounding tiles in a continuous latent substrate while exposing discrete projections for interaction, the system achieves a balance between realism and usability.

The world can evolve smoothly at the simulation level while remaining interpretable and controllable at the gameplay level. This hybrid approach enables richer emergent behavior without sacrificing clarity.

### Proposal Trials

#### Trial 1

Latent: d-dimensional vector. Trained by training VAE on visual images of 2D tile map. 

Dataset:
Visual map is annotated with some of these key properties.
- wetness
- density
- ...
- conductivity
- other phenotypes in Minecraft

Question:
How to diffuse water?

#### Trial 2

Input/Output Channels
- R
- G
- B
- A
- Density
- Porosity
- Permeability
- Nutrients
- Organic Content

Latent Vector
- d-dim vector

Problem:
- RGBA space is 32x32
- Semantics are 1x1

#### Trial 3

In trial 3, we use pre-trained VAEs for visual representation.

**Input/Output Channels**

- 4 by 4 VAE latent compatible with Flux/SD VAE (4x4x4 channels)
- Density
- Porosity
- Permeability
- Nutrients
- Organic Content

Latent vector
- d-dim vector

Problem: Too much channels are used for visual representation.

#### Trial 4

Input:
- Occupancy: solid_fraction in [0, 1]
- Surface Planes: "walkable plane" with height normal, material_id
- micro-geometry tag: flat, slope, step, railing, opening
- heightfield per tile
- material_mix: spares vector like {concrete 0.6 steel 0.2, glass 0.2}
- built-natural in [0 1]
- function tags: road, sidewalk, wall, window, floor, roof, support, railing ,door
- structural_role: {load_bearing, facade, decorative, utility}
- era-hint {preware 0.8, postwar: 0.2}
- style-embedding: learned vector of tags: art-deco, brutalist, modern, etc.
- provencance: human industrial organic geological
- walkable, swimable, climbable, breakable, transparent, enterable, 
- costs: movement costm noise, visiblity occulsion.

#### Trial 5

- Material Composition
- Density
- Porosity
- Organic Activity
- Structural Cohesion
- Origin (natrual <-> artificial)
- Surface irregularity
- Vertical Continuity
- Affordances - walkable, climbable, penetrable, support


## Strategy v11

1. Collect several representative game levels that shows:

- Climbing
- Flat land
- grass
- moss
- ice
- water
- stairs
- door
- city buildings
- walkable areas
- even mix is artificial and natural 

Or just focus on natural world first.

2. Do foreground background separation to select the walkable map.
(Pixel suggests that we create interaction masks instead.)

3. Break them into a grid.
4. then try to annotate with keywords and properties.

This exercise will reveal bunch of problems and we will document them first.




