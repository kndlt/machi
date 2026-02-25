# Branch Simulator v0.3

Let's discuss how to simulate branches in Machi.

The basic thesis is that if we are able to produce grow and maintain a pixel map of branches, we should be able to render leaves on top without much difficulties.

## Current State

So far, in `simulation.frag` we have decided the following simulation model.

```
Input       Shader        Output
Layers ->    Model     -> Layers
          (simulator)
```

Input Layers (each has WxH dimensions):

- u_light: light field texture (8-dir nibbles)
  - first 4 bits: light strength in top direction
  - second 4 bits: light strength in top-right direction
- u_matter: matter texture (color coded)
- u_branches: branch texture
  - R: energy
  - G: nutrients
  - B: structure
  - A: mode
- u_noise: slowly evolving noise (evolving fertility map)
  - grayscale

Output Layers:
- branches: updated branches texture.

This produces interesting trees.
```
································
································
······················11········
··················111·1·········
················1111··1·1·······
3················111111·1·······
3··············12111··111134····
5·····5555·······515····55·55··5
```

It does seem to create branches somehow, but they are all kinda clobbed together.

## Ideal Image of a Branch

```  
   #     #
    #   #
   #####
    #     
    ###
    #
    #
```

Properties we want to capture:

1. **ELONGATION**: Tree branch elongates pushing all its downstream nodes.
2. **GROWTH**: Tip of the branch usually grows.
3. **BRANCHING**: Tip of the branch sometimes divide into two, creating a branch.
4. **THICKENING**: Branch thickens to provide more support.

Let's assume elongation is solved, and we just need to build GROWTH and BRANCHING.

For GROWTH, we will likely need a DIRECTIONAL vector which tells the orientation of the current branch cell.

- A DIRECTIONAL map is used to tell which direction the next cell should be placed.
- It also helps tell which cell is a growth cell.
- If a cell has a top-left direction and yet there isn't a cell in that direction, then it would imply a growth cell.

For BRANCHING, we don't worry about it because once we have a branch growing in a consistent direction, BRANCHING may be easy to implement.

## Goal for this phase.

Implement branch simulation shader.

- Inputs
  - u_noise_map: stable noise map that evolves over long time.
  - u_branch_map
    - R: 255 if branch else 0. 
    - G: branch direction. Top is 0, right is 63, bottom is 127.
    - B: unused
    - A: unused
  - u_gaussian: gaussian noise that changes every step.
- Outputs
  - u_branch

Goal: After seeding, the tip just grows indefinitely toward the direction. 

How?

Given current cell:

1. Make sure I am empty cell.
2. Check all 8 directions for neighboring branch cell.
3. If there are more than one neighboring branch cell, early return.
4. Check the embedded direction of that neighboring branch cell.
  - If that branch cell has non-zero chance of growing into my cell.
  - Compute the likelihood = alignment
  - If likelihood < u_gaussian * u_noise, create a branch on mycell.

How Seeding works.

Seeding works similarly:

`likelihood = is neighboring dirt tile`

if `likelihood < u_gaussian * u_noise`, create a branch.

something like that.

--- 

## Next Phase

We need to implement the BRANCHING.