---
status: accepted
---

# Three.js on WebGPU, with a WebGL2 fallback

The game runs in the browser using Three.js, rendering through WebGPU where available and falling back to WebGL2. The performance target is 60fps on a mid-range laptop, with a small initial download and assets streamed afterwards. Three.js was chosen over heavier engines for its ecosystem and because the realism budget (how much creature and environment detail we can afford) is set by this target, so it must be fixed up front.
