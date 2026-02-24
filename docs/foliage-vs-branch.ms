# Foliage vs Branch

When we think about foliage, we think green leaves.

However, what really does the heavy lifting is the branches.

Branches provide support, energy, and nutrients.

Leaves look beautiful and give us the feeling of life.

On the other hand, a tree with only branches can signal death and loss of liveliness.

But from the organism’s perspective, you can have a tree without leaves, while you cannot have a tree or plant without stems or branches.

So I think we ought to treat the foliage simulation as branch simulation rather than leaf simulation.

In each simulation iteration, we would grow branches.

Then, in the rendering pipeline, we would draw leaves on top of branches depending on energy level—or more specifically, the leaf potential value of each branch.

Rendered leaves will likely occupy more pixel space than branches, so they can cover many small branches.

So leaves become solely a rendering concern, and our task boils down to:

> build a simulation.frag that will grow branches.

