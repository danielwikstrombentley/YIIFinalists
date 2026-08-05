# Globe texture delivery contract

The cinematic globe renders with local procedural day/night, cloud, and atmosphere shaders until
approved event artwork is supplied. Curated assets must be committed or provisioned at the local
paths declared in [textures.ts](../../src/renderers/globe/textures.ts), never fetched from a CDN.

The `event` profile uses mipmapped 4K/2K assets and remains below the 512 MiB R14 texture budget.
The `mip-capped` profile is its approved lower-memory fallback for the event playback PC.
