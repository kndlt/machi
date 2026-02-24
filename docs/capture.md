# Record button

I want a little button to record the map.

Record button will record the currently visible canvas

If nothing changed between interval, skip that frame (extend the duration).

then once you press done, it will download the animated webp file

Idea is that you can use @jsquash/webp and do something like:

```
import { encode } from "@jsquash/webp";

const frames = [
  { data: imageData1, delay: 100 },
  { data: imageData2, delay: 100 },
];

const webpBuffer = await encode(frames, {
  quality: 90,
  loop: 0,
});

const blob = new Blob([webpBuffer], { type: "image/webp" });
const url = URL.createObjectURL(blob);
```