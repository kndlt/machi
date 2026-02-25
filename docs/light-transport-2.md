
# Directional Light Field Layers

For each color channel (R G B), I want to create a layer (a texture).

The texture is 32bit and I want to divvy it up into bands.

```
UP:         first 4 bits.
UP_RIGHT:   next 4 bits.
RIGHT:      next 4 bits. 
DOWN_RIGHT: next 4 bits. 
DOWN:       next 4 bits. 
DOWN_LEFT:  next 4 bits. 
LEFT:       next 4 bits. 
UP_LEFT:    last 4 bits.
```

Bits:
```
0 = no light intensity (*) => 0.0
…
15 = full light intensity (*) => 1.0

* gamma adjusted
```

For each direction, we store the luminance in that direction.

Initially, the texture starts with 1.0 in every band.
On every iteration of light-transport simulation (shader with render texture):

- Cell that is a solid loses the value immediately.
- then air tiles that are adjacent to world boundaries always gets 1.0 in every band.
- For each band b in the cell: 
  - Copy over the light intensity from adjacent air cell that is in the backwards direction to the the band's direction.


For MVP, there is no light bouncing. 

And for MVP, there is light is just single color WHITE. There is no 3 channels.