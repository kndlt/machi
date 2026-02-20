
# Pixel's World Sprite Sheet Index

## Sprites

<img class="sprite" src="pixel-idle-04.png">
<img class="sprite" src="brick-s-01.png">
<img class="sprite" src="brick-m-01.png">
<img class="sprite" src="brick-l-01.png">
<img class="sprite" src="brick-xl-01.png">
<img class="sprite" src="brick-xxl-01.png">
<img class="sprite" src="brick-xxxl-01.png">
<br>
<img class="sprite" src="land-01.png">
<br>
<img class="sprite" src="pixel-05.png">
<img class="sprite" src="sculpt-s-01.png">
<img class="sprite" src="fountain-xl-01.png">
<img class="sprite" src="sculpt-xxl-01.png">
<img class="sprite" src="pillar-s-01.png">
<img class="sprite" src="pillar-m-01.png">
<img class="sprite" src="pillar-l-01.png">
<br>
<img class="sprite" src="land-01.png">
<br><br><br><br><br><br><br><br><br>
<img class="sprite" src="land-01.png">

## Pixel's Abilities (MVP)

- **DIG**: Pixel can modify the world by digging.
- **GATHER**: Pixel can obtain resources by digging.
- **SCULPT**: Pixel can carve sculptures given a stone brick.
- **MERGE**: Pixel can merge bricks into bigger solid.
- **FLY**: Pixel can fly to a location.
- **CARRY**: Pixel can lift a small brick and fly to a location.
- **PLACE**: Pixel can put the currently holding brick in current location

## Cellular Automata as a Feature

Previously there was an effort to create cellular automata to be central building piece, but we have pivoted to start with human design. We do plan on adding cellular automata at some point to simulate things like erosion, tree growth and time passing, etc, but at this time, we consider it as a future feature rather than a blocker.


<style>
    .sprite {
        zoom:2;
        max-width: none;
        image-rendering: pixelated;
    }
</style>
