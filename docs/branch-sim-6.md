# Branch Simulator v0.6

In 0.6, we want to do some prep work for ELONGATION.

ELONGATION is one of the hardest problem to solve in Machi because elongation means we have to push all the downstream texels.

Is that even possible? I think it is, but it will require quite a bit of prep work.

For one, I think there should be a way to mask individual trees.

That is, if two trees touch each other the whole tree becomes just one large piece.

So, we introduce a channel or layer that individualizes the trees.

I'm thinking of using R channel in u_branch.

R channel will be zero if no tree exists,
but it will be nonzero R value which indicates an identifier for the tree.

So, R:1 and R:2 will be considered different trees.

that way, we can quickly pick out the whole of the r2 tree.

What happens if we have more than 256 trees, let's not worry about it now. It may not be a bad thing to have the ids reused. They may appear in far away places and things won't matter that much when they are far away.

## So the problem we are solving now.

We are solving individualization. 





