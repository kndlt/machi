# Branch Simulator v0.9

Let's work on branch-event inhibition.

We will add branch inhibition layer (a texture channel).

Current texture channel usage:
```
R = tree ID (0.0 = empty; non-zero identifies a tree)
G = packed direction+error (5 bits dir, 3 bits error)
B = unused
A = unused
```

We will use first 4 bits in B for branch inhibition.

4 bits = 16 values.

When branching happen at location A, we will set a the branch inhibition to 15 there.

Then, it will diffuse spatially and decay temporally.


