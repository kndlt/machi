# World 1 — Phase 2 Foliage Simulation (Shader Model)

## World Model

World is set of layers

- Foreground: visual + collision
- Support: interior of a building, functions as support for floating foreground pixels.
- Matter: Material index
- Background: Visual background
- Sky: Sky

## Shader Model

In this phase, we introduce a very basic shader.

```
Layers (at time t) -> shader -> Layers (at time t)
```

It can simulate certain bounding box (or the whole resolution if bounding box covers the whole image).

In the future, we want to support non-regular mask where we can make the simulation faster in just a little area (i.e. regeneration magic).

We use full bounding box as a default.

## Foliage Layer

Foliage is its own layer.

Foliage layer is in-between foreground and the user.

You can imagine that foliage grows out from the foreground but is contained within their own layer.

This is done so that it does not get in the way of user in collisions but still harvestable.

## Simulation Mechanic

If soil is adjacent to sky pixel, at random chance, we introduce foliage pixel with proximity=1

If soil is adjacent to foliage pixel, at lower random chance, we introduce foliage pixel proximity=2

If foliage is farther away, they also die off. 

If foliage is surrounded by other foliages the chance of dying increases.

Instead of looking just at 3x3, it can be configured to look at 5x5 or even 7x7.

```
# # # # # # # #
# # # # # # # #
# # # # # # # #
---------------
#F#F# #F# # #F#
# # # #F# # # #
# # # # # # # #
---------------
#F#F#F#F#F#F#F#
# #F# #F#F# # #
# # # #F# # # #
```

## Rendering of foliage pixels.

I think they will be rendered with some outline. 

To prevent very pointy ends, we make the simulation mechanic favor slightly rounded edges.

## Alternative

Just have bunch different pixel art sprites and just instantiate them as needed.

Perhaps above ground ones can be entities.

simple grass near the boundaries of dirt tiles can be just a shader rendering trickery.

## Verdict

Let's create some sprites for the foliages and instantiate then as entities.

The tile grass texture can be shader trick.

## Getting Started

Get started with a very basic shader that adds a 1px worth of green foliage layer on top dirt tiles.
