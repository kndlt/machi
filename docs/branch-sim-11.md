# Branch Simulator v0.11

Now that we have branches being built, we need to constrain the growth.

I think constraining the growth by using roots may be a good idea.

We first need to differentiate branch type.

- BRANCH
- ROOT

Right now the channels:
```
//   R = tree ID (0.0 = empty; non-zero identifies a tree)
//   G = packed direction+error (5 bits dir, 3 bits error)
//   B = branch-event inhibition map (0...255)
//   A = occupancy alpha
```

We've used all spaces.

Let's just create additional texture to store more data.

we now have branchTex1.
Let's add branchTex2.

then use first bit to tell whether it is root or branch. 