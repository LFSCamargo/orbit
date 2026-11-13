# UI sources

The earlier refraction implementation of `apps/desktop/src/components/ui/liquid-glass.tsx` was installed from Aceternity UI's authenticated [Liquid Glass registry](https://ui.aceternity.com/registry/liquid-glass.json), by Manu Arora / Aceternity. [Component and browser-support documentation](https://ui.aceternity.com/components/liquid-glass), [terms](https://ui.aceternity.com/terms).

The current implementation replaces the refraction renderer with a shared compositor surface and Rust-generated material texture. This attribution records the earlier component’s provenance.

# Settings UI components

`animated-settings-nav.tsx` adapts the shared-layout selection indicator from
[Aceternity UI Tabs](https://ui.aceternity.com/components/tabs), by Manu Arora /
Aceternity ([source registry](https://ui.aceternity.com/registry/tabs.json),
[terms](https://ui.aceternity.com/terms)). Orbit retains stable ordering and adds
controller focus and reduced-motion support; the stacked-card effect is omitted.

`switch.tsx` adapts [shadcn/ui Switch](https://ui.shadcn.com/docs/components/radix/switch)
to Orbit's theme tokens. Copyright (c) 2023 shadcn. MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Managed Windows compatibility download

Orbit's optional macOS compatibility setup downloads the unmodified
`wine-stable-11.0_1-osx64.tar.xz` archive directly from the official
[Gcenx macOS Wine builds release](https://github.com/Gcenx/macOS_Wine_builds/releases/tag/11.0_1)
and verifies SHA-256 `b50dc50ec7f41d58b115a6b685d4d1315ba3c797bd3aa0f49213f2703cb82388`.
The archive is not bundled in Orbit or mirrored by the project. Wine is licensed
under [LGPL-2.1-or-later](https://github.com/wine-mirror/wine/blob/master/LICENSE);
its source and bundled-library terms remain available from the upstream project.

Apple Game Porting Toolkit 3.0 and 4.0 beta 3 packages, plus their evaluation
environment payloads, are mirrored under `runtime-packages/gptk/` with their
original license and acknowledgement documents. Their use and redistribution are
governed by Apple's included terms. These DMGs are catalog inputs and are not
Tauri application bundle resources. DXVK-macOS, DXMT, and MoltenVK release
metadata is read from their official public GitHub release feeds; selecting a
catalog version does not activate that backend.

# Bundled game theme artwork

Logos and hero images under `apps/desktop/src-tauri/assets/bundled-themes/` were
retrieved from SteamGridDB for Devil May Cry 5, God of War, Cyberpunk 2077,
The Legend of Zelda: Ocarina of Time, Grand Theft Auto V, Grand Theft Auto VI,
The Legend of Zelda: Breath of the Wild, and Super Mario Odyssey.
Game names and artwork belong to their respective owners. SteamGridDB hosting
does not itself grant redistribution rights.
