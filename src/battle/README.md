# Battle Module

This folder contains the isolated battle module. The map can call `startBattle()` for `battle` nodes. The current view is still a safe scaffold, but it already hosts the first interactive match-3 board.

## Files

- `battle-contract.js` - public request/result contract.
- `battle-module.js` - public entry point through `startBattle(request, options)`.
- `battle-data.js` - battle data loading boundary.
- `battle-engine.js` - pure battle and match-3 logic without DOM.
- `battle-config.js` - battle UI config access layer: defaults, board/layout/animation/sound getters, clock-warning parsing, and asset path cache busting.
- `battle-formatters.js` - battle text helpers: locale lookup, battle text-key lookup, status template formatting, numeric display formatting, time formatting, and tooltip labels.
- `battle-player-items.js` - player item/inventory helpers: item labels, item descriptions, configured hand slots, inventory quantity lookup, and quantity mutation.
- `battle-state.js` - battle state/stage layer: state shape initialization, attempt board setup, reserve board, current stage index, stage convert effects, and walls/boxes/vines sync.
- `battle-trace.js` - battle attempt trace model: JSON-safe snapshots, player action records, final outcome capture, and trace download payload.
- `battle-scaffold-view.js` - battle screen scaffold: modal DOM shell, renderTargets, viewport scale, resize handling, and DOM cleanup.
- `battle-runtime.js` - battle lifecycle, attempt tokens, rage/idle runtime timers, pause/resume helpers.
- `battle-animations.js` - low-level board DOM animations: swap, shake, blocked click, shuffle, cell lookup, and shared animation state helpers.
- `battle-board-view.js` - board DOM rendering: cells, icons, walls, boxes, vines, board messages, gold target preview, and board layout variables.
- `battle-board-actions.js` - board input/action layer: ordinary swap, skull, glove, gold, battery, boxed/vined blocked clicks, and passive turn damage after accepted swaps.
- `battle-stats-view.js` - enemy/player stat HUD rendering: enemy visual, HP/aggression/shield/damage/rage timer, player health/heal meters, and rage warning icon state.
- `battle-inventory-view.js` - battle inventory and active-item HUD rendering: skull/glove/clock/gold/bag slots, header mini-menu button, clock cooldown display, active special cursor, and unavailable float messages.
- `battle-shuffle-flow.js` - idle/no-moves/manual shuffle flow: idle move hint, no-moves board message, manual shuffle damage, board reshuffle, and shuffle button language/state.
- `battle-outcome-flow.js` - settings/surrender/outcome flow: settings pause/resume, surrender callbacks, victory/defeat banners, restart, scaffold result, and finish cleanup handoff.
- `battle-rage-flow.js` - enemy rage scenario flow: countdown tick, pending rage, ultimate effect order, kamikaze handling, rage cascade handoff, and rage-effect classifiers.
- `battle-popovers.js` - battle popover layer: mini-menu, inventory bag, battle log, and shared battle tooltip.
- `battle-feedback-view.js` - feedback state and basic stat-change visuals: suppression, pending deltas, icon shake, and floating numbers.
- `battle-projectiles-view.js` - projectile and rage visual layer: stat-change lights, rage target lights, transform target highlights, and kamikaze burst visuals.
- `battle-resolution.js` - cascade/death/drop resolution layer: match cascade loop, activated-item death animation, reserve refill movement, and item activation sounds.
- `battle-view.js` - battle-screen facade: scenario orchestration, engine calls, and thin wrappers for extracted flow/view layers.
- `data/settings/battle-ui.jsonc` - battle-screen presentation config: UI text keys, icon paths, top-button icon sizes, battle-window background, virtual layout size and scaling, board size, progress bar colors, hint priority, and animation timings. This is the only runtime battle UI config path; the battle loader does not fall back to `data/battle/battle-ui.jsonc`.
- `data/settings/battle-ui.example.jsonc` - commented example that explains each battle UI config field.

## Current Match-3 Engine

`battle-engine.js` currently provides pure functions only:

- `createBattleBoard(itemCatalog, options)` creates a configurable board from `category: "match-3"` items and avoids starting matches. The battle view passes `data/settings/battle-ui.jsonc` `board.width` and `board.height`; default is 12x9.
- `createBattleReserveBoard(itemCatalog, options)` creates the invisible upper refill board from regular `category: "match-3"` items. This board is pseudo-real: it stores items that can fall into the visible board, but matches are never resolved on it.
- `createBattleWalls(board, options)` creates wall edges between neighboring cells. Enemy JSON can define `wall` on the enemy or current stage; the view stores generated edges in `battleState.walls`. `options.boxes` excludes edges touching boxed cells from generation.
- `createBattleBoxes(board, options)` creates boxed cells. Enemy JSON can define `box` on the enemy or current stage; the view stores generated cells in `battleState.boxes`.
- `createBattleVines(board, options)` creates vined cells. Enemy JSON can define `vines` on the enemy or current stage; the view stores generated cells in `battleState.vines`. Vines avoid boxed cells and do not split gravity columns.
- Board creation and refill accept `options.playerState`; inventory items with `transform_chance`, `transform_from_itemId`, and `transform_to_itemId` can upgrade newly generated drops before they enter the visible or reserve board. They also accept `options.enemyConvertEffects`; current-stage `convert` entries can give newly generated drops a fractional chance, such as `0.2`, to become one of the configured target `itemId`s. Stage convert has priority: if it transforms a new drop, player inventory transforms are not checked for that drop; if it fails or does not match, player transforms can still apply.
- Battle gameplay randomness is driven by `request.seed`. The battle module creates a deterministic RNG and `battle-state.js` passes it into board creation, reserve creation, stage obstacles, refill, shuffle, gold loot replacement, and random-target ultimate effects. Visual projectile jitter remains outside this gameplay RNG.
- `hasBattleMatches(board, itemCatalog)` checks whether matches exist.
- `findBattleMatches(board, itemCatalog, options)` finds horizontal, vertical, and 2x2 square matches by item `type`; spawned `match-3` items and created `rare_match-3` items can match together when their `type` is the same. `options.boxes` excludes covered cells from match detection; vines do not block active matches.
- Items with `battleUse: "battery"` are excluded from regular match detection. A battery can be combined with an adjacent item to activate all visible items of that type without aggression, or with another battery to activate the whole visible board without aggression.
- `findBattleAvailableMove(board, itemCatalog, options)` checks adjacent swaps from the bottom row upward and returns the first move that would create a match, or `null` when the board is stuck. `options.typeGroups` can prioritize match types: each inner array is searched together, and the next group is used only when no move exists in the previous group. Use `"*"` as a fallback group for any remaining type. `options.walls` blocks candidate swaps that cross a wall, `options.boxes` blocks candidate swaps that touch a covered cell, and `options.vines` blocks ordinary move hints for tangled cells. The result includes `hintCell`: the original cell of the item that should be moved into the match, so idle hints shake the useful item instead of merely the first swap cell.
- `swapBattleCells(board, firstCell, secondCell)` returns a new board with two cells swapped.
- `removeBattleMatches(board, matches, options)` returns a new board with matched cells set to `null`; `options.boxes` protects covered cells. Vines do not protect cells because items under vines can now be activated by ordinary combinations.
- `dropBattleBoard(board, options)` returns a new board after items fall down inside each column; `options.boxes` keeps covered cells fixed and splits the column into gravity segments.
- `refillBattleBoard(board, itemCatalog, options)` returns a new board with empty cells filled only from regular `category: "match-3"` items. Covered cells are not overwritten when `options.boxes` is provided.
- `refillBattleBoardFromReserve(board, reserveBoard, itemCatalog, options)` refills the visible board from the invisible reserve board above it and returns `{ board, reserveBoard, movement }` for the view animation. Covered cells stay fixed when `options.boxes` is provided.
- `getBattleDropPool(itemCatalog)` returns item ids allowed to spawn on the board; bonus-only `rare_match-3` items are intentionally excluded from random drops.
- `collectBattleMatchCells(matches)` merges match cells without duplicates.
- `applyBattleMatchEffects(battleState, matches, itemCatalog)` applies item `damage`, `heal`, `aggression`, and `calm`. Before applying the values, it adds inventory-driven `modificate` bonuses from the player's current inventory, applies current-stage enemy `itemStatModifiers` multipliers, then rounds final item stats down to tenths. Enemy `shield` is resolved per damaging activated item: one damaging item removes one shield point, and only items left after shield absorption contribute their full `damage` to enemy HP.
- `applyBattleTurnDamage(battleState, itemCatalog, options)` applies passive `dmgperturn` damage from visible board items. The battle view calls it only after an accepted ordinary swap, not during skull/glove/battery actions, manual shuffle, or cascade resolution. `options.boxes` excludes covered cells from this scan, so an item under a box is inactive; vines stay active. Its player HP feedback uses the damaging board item icons as projectile sources and disables the generic enemy-damage fallback for this case.
- `getBattlePlayerMaxHealth(playerState, itemCatalog)` and `getBattleHealHealth(playerState, itemCatalog)` compute effective battle stats from base player state plus inventory items with `max_hp_modif` and `heal_hp_modif`.
- `tickBattleRage(enemyState, elapsedSeconds)` decreases the enemy rage countdown and reports when the rage event fires.
- `applyBattleUltimateEffects(battleState, itemCatalog, stageOrEffects, options)` applies supported enemy ultimate effects. `convertItems` replaces board items matched by `from.itemTypes` or exact `from.itemId`/`from.itemIds` with `to.itemId`, or picks a random target per converted cell from `to.itemIds`; `damagePlayerByBoardItems` counts board items from `count.itemTypes` or exact `count.itemId`/`count.itemIds`, multiplies that count by `modifier`, and damages the player; `HealingEnemyByBoardItems` uses the same count selector and heals enemy HP by `count * modifier`; `RestoreEnemyShieldByBoardItems` restores enemy shield by the same count rule and caps it with `options.enemyShieldMax`/`options.enemyShieldCap` up to the hard limit `99`; `kamikaze` damages the player by current enemy HP, then damages the enemy by that same amount without shield absorption. `options.boxes` excludes covered cells from ultimate conversion, damage scans, healing scans, and shield-restore scans, while vines stay active. Type selectors intentionally include powered items with the same `type`; item-id selectors do not.
- `createBattleMatchBonuses(board, matches, itemCatalog, options)` creates powered item or generator placeholders from configured item links. During a player move the view passes the moved-to cell as `preferredCell`, so a 4/5-match bonus appears at the cell where the player moved the piece when that cell belongs to the match.
- `placeBattleBonuses(board, bonuses)` puts created bonus items back on the board before gravity.

Enemy shield starts from the current stage. `createBattleEnemyState()` initializes it from the first stage, and stage transition resets it from the next stage. Shield uses item count, not damage amount: five damaging items against three shield points means three absorbed hits and two HP-damaging hits. Rage shield restore can raise shield above the stage starting value, but not above the battle UI cap.

Aggression now behaves as an enemy threshold: when match effects push it to the maximum, the enemy deals `aggression.damage` to the player and the aggression value resets to `0`. Damage is resolved before aggression, so a move that defeats the enemy does not keep charging aggression afterward. Rage counts down while the enemy is alive, fires when it reaches `0`, runs the configured visual scene, applies supported ultimate effects one by one in JSON order, resolves any final cascades, then restarts from the stage value.

The engine does not update the map, touch DOM, animate anything, run enemy AI, or execute generator effects yet.

## Current Battle View

`battle-view.js` currently shows a temporary modal with:

- battle scaffold DOM, render target creation, viewport scaling and DOM cleanup delegated to `battle-scaffold-view.js`; `battle-view.js` keeps thin wrappers because outcome, popovers and other layers still use the old scaffold helper names;
- enemy name and file-backed `enemyId`;
- a 12x9 match-3 board generated from `category: "match-3"` items, while created `rare_match-3` items can still join matches by shared `type`;
- battle UI icons and labels loaded from `data/settings/battle-ui.jsonc`;
- battle UI defaults and config getters are delegated to `battle-config.js`; `battle-view.js` keeps only scenario orchestration and passes those getters to extracted layers;
- battle text formatting is delegated to `battle-formatters.js`; numeric battle values are displayed through `formatBattleNumber()` so floating point tails such as `56.199999999999996` are shown as tenths; `battle-language-flow.js` owns localized UI refresh after language changes; `battle-view.js` keeps thin wrappers because extracted layers still use the old formatter names through deps;
- player item and inventory helpers are delegated to `battle-player-items.js`; `battle-view.js` keeps thin wrappers for the old helper names used by board, popover and inventory layers;
- battle state/stage helpers are delegated to `battle-state.js`; `battle-view.js` no longer owns attempt board setup, reserve-board refresh, stage convert lookup, or walls/boxes/vines sync;
- battle-window background loaded from `data/settings/battle-ui.jsonc`;
- battle window layout uses `battle-ui.layout`: the screen is built inside a stable virtual size and scaled as one panel in cover mode, so the battle panel fills the browser viewport instead of leaving a framed window. `.battle-scaffold-frame` owns the scaled layout size, while `.battle-scaffold-panel` owns the unscaled virtual contents. The current battle scaffold uses a cinematic layout: the board is anchored left, the enemy art/background fills the scene and sits to the right of the board, enemy HP/aggression meters sit directly above the board with HP wider than the centered aggression meter, fractional enemy HP and aggression values are right-aligned with enough reserved width before their bars, the enemy stat icons are locked to their meter columns during feedback, the enemy damage badge sits smaller to their left with separated value-left/icon-right layout, the rage timer sits to the right of the aggression row with its value backing aligned to the board's right edge, player heal/HP meters are equal-length vertical meters on the board's left side without panel backing, their icons align to the board's bottom edge, the bag sits below those meters, active battle tools are a row below the board, and the shuffle button is aligned to the board's right edge;
- battle menu buttons `ui.surrender`, `menu.settings`, and `ui.eventLog` are opened from the compact top-right `little_menu` button; their icons and `iconSizePx` are configured in `topButtons`;
- while the mini menu is open, the battle window is heavily dimmed and the battle runtime is paused; clicking the menu button area again or any empty dimmed area closes the menu and resumes the runtime;
- the battle log button now lives in the mini menu; short battle messages are no longer shown inside the enemy info panel;
- the battle log modal has a JSON download button for the current `battleTrace`. The trace records app version, battle seed/name/config URL, enemy `enemyId`/`baseEnemyId`, initial board/reserve/obstacles, player actions, final outcome and final state. It is debug/replay input data, not a full replay player yet;
- the enemy ultimate/rage description is localized rich text in a compact corner panel. It preserves line breaks, supports inline item icons via `{item:itemId}`, and currently uses separate `Rage:` and `Special:` lines. `Special:` should expose non-standard objects that can appear, starting shields/obstacles, and item stat modifiers, but should not spell out exact passive conversion sources or upgrade chains. For this UI text, non-standard means items outside the regular `category: "match-3"` drop pool, such as `rare_match-3` powered items and hazard barrels. The ultimate panel owns a fixed inline icon size and max size so published builds, local `current-settings.json`, and saved `localStorage` do not render enemy descriptions at different icon scales;
- settings pause the battle runtime while the settings overlay is open;
- runtime lifecycle, attempt tokens, pause/resume, rage interval and idle hint timer are delegated to `battle-runtime.js`; `battle-view.js` keeps view-specific callbacks only as thin facade wrappers;
- click-to-select and adjacent-cell swap;
- animated swap for two selected cells, with duration from `data/settings/battle-ui.jsonc`;
- low-level board animations are delegated to `battle-animations.js`; `battle-view.js` still owns when player/battle scenarios ask for those animations. Swap, manual-shuffle and cascade-drop translations use local grid coordinates rather than viewport rectangles, so the fullscreen/cover scale of `.battle-scaffold-panel` does not push icons away from their cells. Manual shuffle renders the target board first, then moves its icons from the old cells through deterministic two-segment cubic Bezier paths; the JavaScript `easeOutCubic` profile starts quickly, slows near the end and reaches `translate(0, 0)` in the real target cell before the animation resolves;
- board DOM rendering is delegated to `battle-board-view.js`; board click actions are delegated to `battle-board-actions.js`, while `battle-view.js` keeps thin wrappers and the higher-level scaffold orchestration;
- enemy/player stat HUD rendering is delegated to `battle-stats-view.js`; `battle-view.js` keeps thin wrappers because runtime, rage and resolution layers still call the old stat update names;
- inventory/special-item HUD rendering is delegated to `battle-inventory-view.js`; `battle-view.js` keeps thin wrappers for the old inventory names because popovers, board actions, runtime and cleanup still call that facade contract;
- idle hint, no-moves warning and manual shuffle flow are delegated to `battle-shuffle-flow.js`; `battle-view.js` keeps thin wrappers because runtime and scaffold code still call the old flow names;
- settings, surrender, victory/defeat, restart and final scaffold result are delegated to `battle-outcome-flow.js`; `battle-view.js` keeps thin wrappers because board/rage helpers still call the old outcome names;
- rage countdown, pending rage, ultimate effect order, kamikaze handling, rage cascade handoff and rage-effect classifiers are delegated to `battle-rage-flow.js`; `battle-view.js` keeps thin wrappers because runtime, projectiles and scaffold code still call the old rage names;
- rage helper wrappers in `battle-view.js` are intentionally only delegation points now; old unreachable fallback bodies after wrapper `return` were removed, and wrappers/imports with no callsites were deleted so `battle-rage-flow.js` stays the single source of truth for rage effect classification and current rage/stage lookups;
- mini-menu, bag inventory, battle log and battle tooltip are delegated to `battle-popovers.js`; `battle-view.js` passes only action callbacks and runtime dependencies;
- health/aggression/heal feedback state and floating-number/icon-shake animation are delegated to `battle-feedback-view.js`; source-cell matching for feedback is delegated to `battle-match-feedback.js`; stat-change projectiles, rage-specific projectile sequences, transform target highlights and kamikaze burst visuals are delegated to `battle-projectiles-view.js`; repeated effect summary helpers live in `battle-effect-summary.js`;
- `battle-view.js` caches its dependency objects for extracted layers, so thin wrappers preserve old call signatures without rebuilding deps on every click/tick/render call;
- invalid-swap shake animation before the pieces return to their old places;
- invalid swap rollback when no match appears;
- idle move hint: after 5 seconds without player input, the first cell of an available move shakes;
- no-move fallback: if there are no available moves, the board shows a localized warning for `animations.noMovesMessageMs` without entering `isResolving`, so the manual shuffle button remains usable while the warning is visible;
- manual shuffle button: the lower battle HUD shows a localized shuffle button. It deals enemy attack damage to the player, then uses the visible current-board shuffle during `animations.noMovesShuffleMs`;
- defeat restart: battle start stores a runtime JSON snapshot in `battleState.initialPlayerState`; pressing `Start over` after defeat restarts the same battle, restores player health/healing/inventory from that snapshot, creates a fresh attempt token, rebuilds the board, and restarts rage/idle timers. Persistent battle controls resolve the current render targets at click time, so manual shuffle, the log, settings, and surrender do not keep the cancelled token from the defeated attempt;
- enemy walls: `wall > 0` creates cell-sized visual blockers between cells and prevents ordinary swaps across those edges; when a blocked swap is attempted, the selected item icon and the blocking wall shake. Walls are generated once at battle start and stay fixed until the battle ends;
- enemy boxes: `box > 0` creates cell-sized covers over random cells; a boxed cell cannot be selected, swapped, matched, used as a battery target, suggested as an available move, counted for passive `dmgperturn`, transformed by an ultimate, or counted for ultimate damage, while the item under the box remains fixed in the board matrix. Boxes are generated once at battle start and stay fixed until the battle ends. Items filling cells below a box animate from the box position instead of the top edge of the field;
- enemy vines: `vines > 0` creates cell-sized covers over random non-box cells; a vined cell cannot be selected for ordinary swap, used as a battery target, suggested as an available move, or moved by manual shuffle. Items still fall under vines, can be activated by ordinary combinations, skull can activate the covered item, and glove can freely move it out so it becomes normal again outside the vined cell;
- match removal, gravity, refill, activated-item death animations, item activation sounds, and automatic cascade resolution are delegated to `battle-resolution.js`;
- an invisible reserve board above the visible field: when visible items disappear, lower reserve items fall into the visible board and the reserve board receives new random items for future falls;
- item icons are detached from square cells: cells and icons are separate direct children of the same board grid, with icons placed in the same grid row/column above the square backgrounds; the square visual is drawn by `.battle-scaffold-cell::before`, while the cell itself stays transparent and unfiltered so static icons remain above the square layer;
- cascade movement keeps the square board backgrounds fixed and animates only item icons; the active fall-speed setting is `animations.boardDropMs` in milliseconds per board row, and `animations.newItemSpawnOffsetPx` controls how many pixels above the visible board the first new item starts;
- activated match items shake, then fly toward their item `Leave_side`, scale to x2, and fade during `death_time`;
- activated match items can play an optional `sound_effect` from their item config; missing `sound_effect` means silence, and playback uses the global `soundVolume`;
- basic battle effects from item config: `damage`, `heal`, `aggression`, and `calm`;
- visible enemy/player stats that update after a processed move;
- enemy aggression damage on threshold overflow;
- a ticking rage countdown with a visual rage event; after the opening wave, supported ultimate effects such as `convertItems`, `damagePlayerByBoardItems`, `HealingEnemyByBoardItems`, `RestoreEnemyShieldByBoardItems`, and `kamikaze` are applied one by one in JSON order. Conversion re-renders the intermediate board before the next effect, damage sends red light projectiles from matched board items to the player HP icon before the health feedback animation, enemy healing sends green light projectiles from matched board items to the enemy HP icon before the `+N` feedback, shield restore sends blue light projectiles from matched board items to the enemy shield icon before the shield `+N` feedback, kamikaze sends red lights from enemy HP to player HP and then bursts red lights outward from enemy HP before self-damage feedback, and final match-3 cascades are checked only after the whole ultimate chain ends;
- rage countdown keeps ticking during player board actions. If it reaches `0` while a swap, fall, refill, shuffle, cascade, or other board animation is still resolving, the timer stays at `0`, marks the rage action as pending, and runs the enemy ultimate only after the board becomes calm;
- clickable `item_time` clock inventory slot that consumes one clock, pauses the rage countdown for `battleTimeStopSeconds`, darkens while active, and shows the remaining freeze time over the slot;
- clickable `item_skull` slot that consumes one skull and activates a cursor marker; clicking the skull again cancels it and refunds the item, while clicking the board activates the target cell plus the surrounding 3x3 area without charging enemy aggression from those cells;
- clickable `item_swap` slot that consumes one glove and activates a cursor marker; clicking the glove again cancels it and refunds the item, while two board clicks freely swap any two cells even if the swap creates no match;
- while skull or glove is active, the other special slots and the clock show unavailable feedback instead of activating;
- floating localized “unavailable” feedback when the player clicks the clock while it is active or when quantity is `0`;
- battle inventory slots stay visible at quantity `0`, but their item icon is dimmed with `is-missing` so the player can distinguish an absent item from an available one without hiding the slot layout;
- powered item creation for 4 activated cells when `createsOnFour` is configured;
- special item creation for 5+ activated cells when `createsOnFive` is configured;
- battery behavior for `battleUse: "battery"` items created by 5+: adjacent battery + item activates all items of that type, and battery + battery activates the whole visible board, both without aggression;
- inventory `modificate` bonuses: each owned inventory item can add `damage`, `heal`, `aggression`, or `calm` to configured match-3 item ids;
- enemy item stat modifiers: current-stage `itemStatModifiers` can multiply activated item `damage`, `heal`, `aggression`, or `calm` by exact `itemId`/`itemIds` or by shared `itemTypes`; this happens after inventory `modificate` bonuses, final item stats are rounded down to tenths, and passive `dmgperturn` or enemy ultimate board counters are not affected;
- inventory drop transforms: each owned inventory item can add a percent chance to replace a newly generated match-3 item with another configured item;
- enemy convert transforms: current-stage `convert` can passively replace newly generated items by exact `itemId`/`itemIds` or by `itemTypes` with a fractional chance from 0 to 1;
- when the enemy changes stage, the invisible reserve board is regenerated for the new stage so hidden future drops do not keep using the previous stage's `convert`;
- passive inventory health modifiers: `red` can increase effective max HP through `max_hp_modif`, and `green` can increase HP restored by the heal meter through `heal_hp_modif`;
- automatic victory when the enemy reaches `isDefeated`;
- a localized victory banner for `outcomeBannerMs`, then `victory` and `enemyConfig.reward` are returned to the map;
- a localized defeat banner when player HP reaches `0`, with `ui.surrender` and `battle.outcome.restart` buttons. Restart stays inside the same battle scaffold but cancels async work from the defeated attempt so old animations cannot mutate the new attempt.

This screen intentionally does not run enemy AI or implement every possible ultimate yet. Rage ultimates are being added in small effects; currently `convertItems`, `damagePlayerByBoardItems`, `HealingEnemyByBoardItems`, `RestoreEnemyShieldByBoardItems`, and `kamikaze` are supported.

## Current Map Integration

`src/map-module.js` builds a `BattleRequest` for `battle` nodes and calls `startBattle()`. The request includes `seed`, `seedName`, and `enemyConfigUrl`; the map logs the seed as `battle:<mapId>:<nodeId>:data/enemy/<enemyId>.jsonc:<attempt>` before opening the battle, and the battle log records the same seed inside the battle overlay.

If cheat commands are active, the map also passes a battle-scoped `cheats` object derived from `data/player/cheats.json`. The battle scaffold listens only for those typed commands, currently `autoWin`, and removes the key listener during scaffold cleanup.

`BattleResult` now also carries `battleTrace`. The map can keep or inspect this machine-readable trace for debugging, but route progress still depends only on `outcome` and reward handling. Human log lines remain in `logMessages`.

During active MVP work, `index.html` reads the root `version.json` and installs a versioned import map before loading `map-module.js`. `map-module.js` then loads `battle-module.js` dynamically with the same `?v=<version>` value. After START, the map calls `preloadBattleModule()` before showing the run map, so `battle-contract.js`, `battle-data.js`, `battle-engine.js`, `battle-view.js`, and their static dependencies are already fetched and parsed before the first battle click. The version stays stable for the build, so prewarm and real battle entry reuse the same ES modules while a changed `version.json` forces the browser to request updated code.

The map marks a battle node completed only after `victory`. If the enemy has a `reward` payload, the map first shows the shared reward overlay and completes the node only after the player clicks `ui.claimReward`.

