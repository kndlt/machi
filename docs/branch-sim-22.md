# Branch Sim 22: Energy Grid

Just like Nutrient map branch2.png's Green channel.

I need energy map.

With great simplification, the energies and nutrients are the full part of the growth equation.

- nutrients are from roots
- energies are from light

We already have 8 directional light map (32bit, nibble pointing each direction).

assume the branches also double as approximation of leaves.

Then, we can compute the contribution of light into the branch cell and collect energy.

energy field is going to use B channel of branch2.png texture.

energy gets absorbed in branches. and that means that amount of energy needs to be depleted in the light map as well.



