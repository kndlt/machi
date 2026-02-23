# World 1

Let's design our first world. 

## 0. Mission Statement

> Sprited is a digital souls company.
> Machi provides place for digital beings to flurish.

## 1. Ontology (MVP)

### 1.1 World

> A **World** is a whiteboard of **Maps**.

- Holds a collection of Maps
- Stores metadata (name, description, version)
- It also contains map placements in 2D whiteboard.

### 1.2 Map

> A **Map** is collection of **Layers**.

Map is analogous to a PSD file.

- It has collection of Layers.
- Metadata: WxH in pixels.

### 1.3 Layers

> A **Layer** is an **Image** with properties.

- Link to the Image.
- Layer types
  - Foreground
  - Matter
  - Support
  - Background
  - Sky

Layers are divided based on functionality. The separation allows for pixel level simulation.

Note about optimizations: We strive to create the most basic form in this prototype. Optimizations are not built-in at this stage.

#### 1.3.1 Foreground Layer

> Foreground layer is where character and platforms live.

Placing something in this layer will basically burn-in that something into this image.

#### 1.3.2 Matter Layer

> Composition layer holds index-map of matters

Placable items will have their own matter map, and when placed we update both the foreground layer and matter layer.

#### 1.3.3 Support Layer

> Support layers provide scaffolding such that platforms in foreground layer don't fall to ground.

Support structure often contains interior designs. So if you are inside room, it would have a interior wall.

Alternative to this naming could be "wall" layer.

Rendering Hint: Less contrast than foreground. 

#### 1.3.4 Background Layer

> Background except for the sky portion.

Rendering Hint: Less contrast and blends with sky rendering if possible.

#### 1.3.5 Sky Layer

This one can be a solid bg color.

Note about parallax: No, not at this time.

### 1.4. Matter

> One Word: Stone Age

We start with the most basic matter, **stone**.

But we all need to drink an eat so, let's add some more.

- Dirt
- Stone
- Water

That's the minimal set.

#### 1.4.1 Dirt

> Dirt is the ground. 

On the portion that gets light and water, vegetation grows.

#### 1.4.2 Stone

> Store is resource for building and sculpting

Pixel can collect and sculpt the stone to create various designs.

### 1.5 Vegetation (MVP+1)

Vegetation grows on top of dirt when it has access to water and light.

Vegetation impacts the Foreground layer to add layer of green patch for visual.

It also impacts the Support layer to show larger bushes that shouldn't get in user's way.

---

## 2. Sample Map

```
<map
  title="Pixel's Nest"
  width="1024"
  height="512"
>
  <layer
    type="foreground"
    src="foreground.webp"
  />
  <layer
    type="support"
    src="support.webp"
  />
  <layer
    type="matter"
    src="matter.webp"
  />
  <layer 
    type="background"
    src="background.webp"
  />
  <layer 
    type="sky"
    src="sky.webp"
  />
<map>
```

## 3. Simulation (MVP)

We use Cloudflare Durable Objects.

- For all CA simulations, we use the client (MVP)
- For all character movements placements, etc, we use the client (MVP)
- Durable Object is only used as an interface to efficiently store the data an resolve conflicts.
- We update directly the images.

## 4. Technology

### 4.1 World Representation

Each world map is represented as a continuous surface rendered as a large quad of size W × H in world space.

Conceptually, the world behaves as a continuous visual and simulation field. The quad serves as a carrier surface onto which world textures are sampled.

The world is rendered using virtual texturing, allowing the renderer to sample from a logical world texture space while only streaming the visible portions into GPU memory.

### 4.2 Virtual Texturing

World visual and simulation layers are stored as tiled textures (pages).

At runtime:
- The renderer determines which pages intersect the camera viewport.
- Only those pages (at appropriate LOD) are loaded to GPU memory.
- The shader samples the logical world texture space space seamlessly via page table lookup.

This enables:
- Large or unbounded worlds
- Memory-bounded rendering
- Efficient zoom with level-of-detail
- Sparse updates

### 4.3 Camera Model

The renderer uses an orthographic camera oriented perpendicular to the world surface.

The camera defines:
- Viewport dimensions
- Zoom level
- Visible world rectangle

Camera movement does not affect world state. It only changes which portions of the world are sampled and rendered.

### 4.4 Entities (Characters and Dynamic Objects)

Characters and dynamic entities are represented as quads positioned in world coordinates.

Each entity has:
- A world-space position
- A bounding box
- Optional depth/ordering value

Entities are culled on CPU if their bounding boxes does not intersect the camera viewport.

### 4.5 World Rendering Outputs

The world rendering pass produces multiple screen-space buffers.

- Color buffer - final world visual appearance
- Occlusion/depth buffer - per-pixel field describing whether world geometry occludes entities

These buffers are used during entity rendering to correctly composite characters with the world, allowing partial occlusion (e.g. characters behind foliage or structures).

### 4.6 Rendering Model

Rendering is field-based rather than tile-based.

Shaders sample world state using continuous world coordinates, allowing the renderer to treat the world as a unified surface independent of internal texture tiling.

This model supports:
- Global visual effects
- Field visualization/debugging
- Scalable world size
- Clean compositing of entities.

