# The Librarian 2.0 — 3D Art Bible

## North star

The library should feel like a handcrafted miniature that becomes hilariously difficult to keep tidy: warm from across the room, readable at a glance, and packed with tactile reactions up close.

The visual shorthand is **storybook diorama**, not realism and not generic low-poly. Forms are chunky and intentionally designed, edges catch warm light, materials are painted rather than photographed, and every moving object has a clear silhouette.

Three words govern every asset:

1. **Cozy** — pools of lamplight, warm wood, parchment, cloth, and evidence that people use this place.
2. **Legible** — strong silhouettes, controlled values, genre color plus icon, and restrained surface detail.
3. **Reactive** — books tumble and snap, signs wobble, dust catches light, furniture and characters visibly respond to rising Chaos.

## Camera and composition

- Gameplay uses a locked three-quarter orthographic camera looking from the open side of the diorama toward the back wall.
- The normal play camera does not rotate. Cinematic pushes may change framing, never orientation.
- The front wall is removed. Side walls terminate early to create a theatrical cutaway.
- Tall shelves fade to roughly 22% visibility when they sit between camera and librarian.
- Important actors always retain a floor marker, high-value edge cue, or silhouette outline.
- Vertical details face the established camera side. Signs are not scattered at arbitrary angles simply because the world is 3D.

The fixed camera is a production constraint and an advantage: model only what can be seen, hand-compose rooms like sets, and spend geometry on silhouettes and interaction points.

## Scale language

One world unit is approximately one meter.

| Element | Target scale |
|---|---:|
| Librarian | 1.55–1.7 units tall |
| Kid | 1.05–1.3 units tall |
| Standard shelf | 3.7–4.25 units tall |
| Shelf depth | 1.1–1.8 units |
| Loose book | 0.28–0.4 units tall |
| Reading table | 0.95–1.05 units tall |
| Door | 4.2–4.5 units tall, intentionally theatrical |

Characters should use roughly 2.5-head proportions with large hands, feet, and readable props. Books are oversized relative to reality so their genre and motion remain visible at gameplay zoom.

## Shape language

### Grand Reading Room

- Rounded, welcoming silhouettes.
- Broad walnut shelving with brass bands and crown trim.
- Circular rugs, curved circulation cues, soft cushions, storybook trees, and green-shaded lamps.
- Slightly exaggerated doors and windows so the room reads like a stage set.
- Repeated arches and circles communicate public, social, welcoming space.

### Midnight Archives

- Taller, narrower, more angular silhouettes.
- Desaturated teal-gray rolling stacks, exposed brass rails, card catalogs, crates, and a vault door.
- Rectangular floor inlays and strong crossing lines reinforce route pressure.
- Moonlit glass and cold metal are punctuated by small warm task lights.
- Repeated grids and verticals communicate restricted, mechanical space.

Do not solve the second map by recoloring the first. They share modular construction standards but must differ in navigation silhouette, landmark language, light temperature, and prop density.

## Palette

### Shared gameplay colors

| Purpose | Color |
|---|---|
| Parchment highlight | `#F0DFBA` |
| Ink / deepest neutral | `#1E2630` |
| Walnut | `#4C2F24` |
| Dark walnut | `#2D201C` |
| Brass | `#C89B52` |
| Warm light | `#FFD396` |
| Moonlight | `#8FC4D6` |

Genre colors are gameplay data and must remain consistent across book covers, shelf plaques, carry slots, map cues, and UI:

| Genre | Base | Emissive accent | Shape |
|---|---|---|---|
| Adventure | `#B9483B` | `#E46A52` | Triangle |
| Science | `#356F8C` | `#60B2D1` | Star |
| Nature | `#477A54` | `#78B47D` | Diamond |
| Mystery | `#674E82` | `#9E79BD` | Circle |
| History | `#A56A35` | `#D49855` | Square |
| Poetry | `#A75069` | `#DF7895` | Wave |

Never use genre color alone to communicate the correct shelf. Every production shelf plaque and loose book needs the matching shape family.

The current procedural build renders these as geometry rather than text decals: Adventure is a triangle, Science a four-point sparkle, Nature a diamond, Mystery a ring, History a square, and Poetry a wave. This keeps sorting readable at distance, in color-blind modes, and under either map's lighting.

## Character casting and silhouettes

The cast should read by outline before clothing color. Character accessories are oversized stage props, not realistic costume detail.

| Character | Silhouette anchors | Motion signature |
|---|---|---|
| Mara Voss | High bun, round glasses, broad lapels | Precise stride and firm reach |
| Elias Finch | Flat cap, bow tie, diagonal satchel | Forward lean and brisk recovery |
| June Bell | Twin hair puffs, long scarf, star pin | Springier step and welcoming gestures |
| Browser | Round glasses and an open book | Wanders while reading, then looks up late |
| Sprinter | Backward cap and oversized shoes | Crouch, lean, then explosive dash |
| Twins | Side bun, bow, and crossing sash | Mirrored feints before splitting |
| Hider | Hood and short cape | Shrinks low before slipping behind cover |
| Snacker | Crinkled snack bag and visible crumbs | Guards the bag, then drops a sticky patch |
| Paper-plane kid | Angular paper plane and satchel | Winds up the throwing arm before release |
| Fort builder | Paper crown and book belt | Plants feet wide before building |
| Tornado | Radial hair spikes and spiral emblem | Compresses, winds up, then spins |

Every disruptive kid uses a readable pre-action pose. Warning, flee, steal, calm, and special-action reactions have distinct body language; a player should be able to anticipate trouble without reading a label.

## Materials

Surfaces should look painted and tactile, with modest roughness variation and no photographic noise.

- Wood: broad value blocks, subtle painted grain, soft edge wear only where hands would touch.
- Brass: muted rather than mirror-polished; reserve the brightest highlights for interactive edges.
- Fabric: matte, slightly rounded, no fine weave at gameplay distance.
- Paper: warm off-white; page edges can carry a single darker line.
- Stone and metal: restrained cool reflections so characters remain the highest-contrast moving shapes.
- Glass: readable as a colored light source, not a transparent hole in the wall.

Unique 2K textures should be exceptional. The default is a shared 512–1024 px trim sheet plus material tinting. Small props should use atlases.

## Modular environment kit

Every final Blender kit should replace a corresponding procedural primitive without changing its pivot or collision footprint.

| Kit family | Required pieces |
|---|---|
| Shelves | 2 m, 4 m, 7 m, and 10 m runs; front/back end caps; crown; plinth; rolling base |
| Walls | Straight panel, pilaster, inside corner, cutaway termination, baseboard, picture rail |
| Openings | Warm window, archive window, staff door, public door, vault frame |
| Furniture | Circulation desk segments, rectangular table, round table, three chair silhouettes |
| Library props | Return chute, cart, card catalog, crates, coat rack, notice board, clock |
| Story props | Rug sets, cushions, story tree, rare-book display, children’s bins |
| Set dressing | Book clusters, papers, signs, lamps, plants, ropes, small desk objects |

### Pivots and export

- Use Y-up and meters in Blender; export glTF/GLB with transforms applied.
- Static props pivot at floor center. Wall pieces pivot at floor-center of their back face.
- Shelf modules pivot at bottom center. Their local forward direction points toward the readable book face.
- Names use `environment_family_variant_lod`, for example `shelf_public_07m_lod0`.
- Collision proxies use the suffix `_collision` and must be simpler than render geometry.
- Emissive sign meshes use `_emissive`; occlusion groups use `_occluder`.
- Merge geometry by material where it does not prevent interaction or occlusion.

## Shelf contract

A shelf is both architecture and a gameplay target. Every shelf must provide:

- A stable collision rectangle.
- A root node that the occlusion system can fade as one unit.
- A genre index and readable genre plaque.
- A separate emissive plaque mesh so urgency can pulse without tinting the full shelf.
- Clear book-facing orientation.
- Enough negative space around the plaque that it remains visible under clutter.

Production shelves may swap procedural books for instanced book clusters. They should not bake the genre color into a unique texture; the game must be able to retint the same model.

## Lighting

Lighting tells the map story and makes urgency visible.

### Grand Reading Room

- Warm sunset directional key.
- Soft peach hemispheric fill.
- Green-shaded desk lamps create localized amber pools.
- Dark walnut grounds the edges of the diorama.
- Chaos raises contrast and introduces restrained red practical accents; it does not simply cover the screen in red.

### Midnight Archives

- Cool moon directional key with deeper blue-green ambient fill.
- Sparse warm task lamps identify safe working areas.
- Shelf plaques and vault elements provide controlled cyan emission.
- Fog is slightly denser, but never dense enough to hide route information.

Shadows should be soft and directional. Limit dynamic shadow casters to characters, major props, shelf frames, and active books. Tiny set dressing receives shadows but does not cast them.

## Animation and physicality

Motion should communicate intent before spectacle.

- Librarian locomotion: 6–8 frame-equivalent stride, strong anticipations, carried stack visibly changes balance.
- Kid interactions: look, crouch or reach, commit, then recover. Every disruption has a readable anticipation window.
- Pickup: short magnet arc into the visible carry stack, not instant disappearance.
- Return: genre-colored travel arc, shelf plaque response, firm snap, then a brief dust or paper punctuation.
- Shush Wave: expanding translucent pressure ring, sign and dust reaction, one clear pose from affected kids.
- Rolling Cart: strong lean, wheel squash, small paper wake, readable braking pose.
- Chaos: crooked books, restless papers, flickering task lights, and busier character idles accumulate in stages.

Avoid continuous idle bobbing on every object. Reduced-motion mode removes camera pushes, lamp flicker, floating dust, and large environmental motion while keeping essential telegraphs.

## Finale presentation

Each map has its own three-beat escalation. Finale dressing is additive, appears only once per stage, and preserves the playable floor and collision contract.

### Grand Reading Room — the public spectacle

1. **Field Trip Arrival:** a warm entry banner, genre pennants, and floor chevrons turn the front door into an unmistakable arrival lane.
2. **Storytime Surge:** footprint trails and loose paper make the room feel suddenly overrun while keeping hazards legible.
3. **Final Bell · Perfect Sort:** a modeled brass bell and six floating, genre-coded golden books create a celebratory last stand around the event center.

### Midnight Archives — the catalog emergency

1. **Catalog Lockdown:** shelf-end beacons and cyan/red floor rails switch the archive from quiet storage to containment mode.
2. **Index Search Active:** route chevrons and a scanning beam turn navigation into an active search pattern.
3. **Restore the Gold Index:** a rotating vault/catalog dial and floating index cards frame the last objective as a mechanical restoration ritual.

Reduced-motion mode retains every sign, marker, prop, and color cue but freezes floating, scanning, spinning, swaying, and pulsing dressing. Gameplay telegraphs remain visible through pose and shape rather than continuous motion.

## VFX hierarchy

1. **Critical:** theft anticipation, objective threat, Last Call, player danger.
2. **Action:** Shush Wave, cart sweep, return chute, tool evolution.
3. **Reward:** perfect sort, combo tier, level-up, objective completion.
4. **Ambient:** dust, lamp glow, papers, environmental movement.

If the screen is noisy, remove lower levels before weakening critical information. Emissive effects should occupy small, controlled surfaces; a fully glowing character or room destroys the hierarchy.

## Performance budgets

Target 60 fps at 1080p on a modern integrated-GPU laptop, with an automatic reduced-quality path.

| Budget | Target |
|---|---:|
| Static environment triangles | ≤ 180k visible |
| Character triangles | ≤ 8k each at LOD0 |
| Materials visible per room | ≤ 32 |
| Simultaneous shadow-casting lights | 1 |
| Local non-shadow point lights | ≤ 4 |
| Dynamic loose books | 150 target, 250 stress |
| Transparent particles | ≤ 500 typical |
| Initial compressed 3D payload | ≤ 12 MB |

Use mesh instances for repeated books, chairs, lamps, and trim. Prefer baked ambient detail to extra geometry. Final textures should use KTX2/Basis compression and production GLBs should use Meshopt or Draco only after measuring decode cost.

## Current procedural implementation

`src/v2/game/WorldBuilder.ts` is the executable procedural production set and replacement contract. It already supplies:

- Orthographic diorama camera and responsive projection.
- Warm/cool map-specific lighting, ACES tone mapping, fog, shadows, and controlled glow.
- Cutaway walls, windows, doors, floor treatment, modular shelves, geometry-based genre plaques, and books.
- Grand Reading Room circulation, reading, children’s, and returns landmarks.
- Midnight Archives rails, rare-book table, crates, card catalog, vault, clock, and night return.
- A prop-rich book cart and archive rolling ladder with matching collision bounds.
- Distinct librarian and kid silhouettes with state-driven anticipation and reaction poses.
- Three-stage, map-specific finale staging for both rooms.
- Collision bounds, spawn anchors, event-zone anchors, and per-shelf metadata.
- Camera-to-player shelf occlusion fading.
- Reduced-motion handling for dust, flicker, and transition speed.

This procedural set is intentionally replaceable. A production asset is accepted only when it preserves or improves the same gameplay readability, scale contract, collision footprint, and performance budget.

## Asset acceptance checklist

- Silhouette reads at gameplay zoom without texture detail.
- Scale and pivot follow this document.
- Collision proxy matches the route players perceive.
- Important color is backed by shape or icon.
- Materials remain inside the map palette.
- Asset works under both warm and cool light.
- Occludable components share a clean root.
- LOD or instancing strategy is defined for repeated objects.
- No essential information relies on animation that reduced-motion mode removes.
- Asset is tested in a crowded 60 fps stress scene before replacing the procedural version.
