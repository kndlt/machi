# Branch Simulator v0.10

In v0.10, we added branch-inhibition. And works like a charm.
Also in v0.8 or something, we added individualization to be able to select instances with same identifier.

Right now there can be 255 of different ids. and let's assume there won't be any collision.

Next, I want to make possible ELONGATION.

But here is a stop gate.

Let's think about whether this work is necessary.

This work is much harder than cell growth in stable environment.

It requires moving multiple cells at the same time.

- Select a "particular cell" to elongate.
- Select all downstream nodes.
- Accumulate movement vector for all downstream nodes.
- Wait until accumulation happens across the board.
- Apply the accumulated movement vector.

This arguably still uses local rules but at the same time, it requires alternating phases.

- accumulation phase.
- move phase.

and it is hard to work on.

Let's revisit the reason why I want to do this.

is it Aestetics?

Not really, the premise of SOUP is to grow super large trees (Super Organism Upbringing Project) where we can grow "giant" trees out of thin air.

But at this point we just need a world that is livable. 

The super trees are more like a phase 100.




