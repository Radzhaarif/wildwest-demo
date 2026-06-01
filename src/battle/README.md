# Battle Module

This folder contains the isolated battle module. The map can call `startBattle()` for `battle` nodes. The current view is still a safe scaffold, but it already hosts the first interactive match-3 board.

## Files

- `battle-contract.js` - public request/result contract.
- `battle-module.js` - public entry point through `startBattle(request, options)`.
- `battle-data.js` - battle data loading boundary.
- `battle-engine.js` - pure battle and match-3 logic without DOM.
- `battle-view.js` - DOM view boundary for the temporary battle screen.
- `data/settings/battle-ui.jsonc` - battle-screen presentation config: UI text keys, icon paths, top-button icon sizes, battle-window background, board size, progress bar colors, hint priority, and animation timings.
- `data/settings/battle-ui.example.jsonc` - commented example that explains each battle UI config field.

## Current Match-3 Engine

`battle-engine.js` currently provides pure functions only:

- `createBattleBoard(itemCatalog, options)` creates a configurable board from `category: "match-3"` items and avoids starting matches. The battle view passes `data/settings/battle-ui.jsonc` `board.width` and `board.height`; default is 12x9.
- `createBattleReserveBoard(itemCatalog, options)` creates the invisible upper refill board from regular `category: "match-3"` items. This board is pseudo-real: it stores items that can fall into the visible board, but matches are never resolved on it.
- `createBattleWalls(board, options)` creates wall edges between neighboring cells. Enemy JSON can define `wall` on the enemy or current stage; the view stores generated edges in `battleState.walls`. `options.boxes` excludes edges touching boxed cells from generation.
- `createBattleBoxes(board, options)` creates boxed cells. Enemy JSON can define `box` on the enemy or current stage; the view stores generated cells in `battleState.boxes`.
- `createBattleVines(board, options)` creates vined cells. Enemy JSON can define `vines` on the enemy or current stage; the view stores generated cells in `battleState.vines`. Vines avoid boxed cells and do not split gravity columns.
- Board creation and refill accept `options.playerState`; inventory items with `transform_chance`, `transform_from_itemId`, and `transform_to_itemId` can upgrade newly generated drops before they enter the visible or reserve board. They also accept `options.enemyConvertEffects`; current-stage `convert` entries can give newly generated drops a fractional chance, such as `0.2`, to become one of the configured target `itemId`s. Stage convert has priority: if it transforms a new drop, player inventory transforms are not checked for that drop; if it fails or does not match, player transforms can still apply.
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
- `applyBattleMatchEffects(battleState, matches, itemCatalog)` applies item `damage`, `heal`, `aggression`, and `calm`. Before applying the values, it adds inventory-driven `modificate` bonuses from the player's current inventory. Enemy `shield` is resolved per damaging activated item: one damaging item removes one shield point, and only items left after shield absorption contribute their full `damage` to enemy HP.
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

- enemy name and `enemyId`;
- a 12x9 match-3 board generated from `category: "match-3"` items, while created `rare_match-3` items can still join matches by shared `type`;
- battle UI icons and labels loaded from `data/settings/battle-ui.jsonc`;
- battle-window background loaded from `data/settings/battle-ui.jsonc`;
- top-level battle buttons outside the battle panel: `ui.surrender`, `menu.settings`, and `ui.eventLog`; their icons and `iconSizePx` are configured in `topButtons`;
- a battle log button outside the battle panel, placed like the map log button; short battle messages are no longer shown inside the enemy info panel;
- settings pause the battle runtime while the settings overlay is open;
- click-to-select and adjacent-cell swap;
- animated swap for two selected cells, with duration from `data/settings/battle-ui.jsonc`;
- invalid-swap shake animation before the pieces return to their old places;
- invalid swap rollback when no match appears;
- idle move hint: after 5 seconds without player input, the first cell of an available move shakes;
- no-move fallback: if there are no available moves, the board shows a localized warning for `animations.noMovesMessageMs` without entering `isResolving`, so the manual shuffle button remains usable while the warning is visible;
- manual shuffle button: the enemy info panel shows a localized shuffle button under the ultimate/rage description. It deals enemy attack damage to the player, then uses the visible current-board shuffle during `animations.noMovesShuffleMs`;
- defeat restart: battle start stores a runtime JSON snapshot in `battleState.initialPlayerState`; pressing `Start over` after defeat restarts the same battle, restores player health/healing/inventory from that snapshot, creates a fresh attempt token, rebuilds the board, and restarts rage/idle timers;
- enemy walls: `wall > 0` creates cell-sized visual blockers between cells and prevents ordinary swaps across those edges; when a blocked swap is attempted, the selected item icon and the blocking wall shake. Walls are generated once at battle start and stay fixed until the battle ends;
- enemy boxes: `box > 0` creates cell-sized covers over random cells; a boxed cell cannot be selected, swapped, matched, used as a battery target, suggested as an available move, counted for passive `dmgperturn`, transformed by an ultimate, or counted for ultimate damage, while the item under the box remains fixed in the board matrix. Boxes are generated once at battle start and stay fixed until the battle ends. Items filling cells below a box animate from the box position instead of the top edge of the field;
- enemy vines: `vines > 0` creates cell-sized covers over random non-box cells; a vined cell cannot be selected for ordinary swap, used as a battery target, suggested as an available move, or moved by manual shuffle. Items still fall under vines, can be activated by ordinary combinations, skull can activate the covered item, and glove can freely move it out so it becomes normal again outside the vined cell;
- match removal, gravity, refill, and automatic cascades;
- an invisible reserve board above the visible field: when visible items disappear, lower reserve items fall into the visible board and the reserve board receives new random items for future falls;
- item icons are detached from square cells: cells and icons are separate direct children of the same board grid, with icons placed in the same grid row/column above the square backgrounds; the square visual is drawn by `.battle-scaffold-cell::before`, while the cell itself stays transparent and unfiltered so static icons remain above the square layer;
- cascade movement keeps the square board backgrounds fixed and animates only item icons; the active fall-speed setting is `animations.boardDropMs` in milliseconds per board row, and `animations.newItemSpawnOffsetPx` controls how many pixels above the visible board the first new item starts;
- activated match items shake, then fly toward their item `Leave_side`, scale to x2, and fade during `death_time`;
- activated match items can play an optional `sound_effect` from their item config; missing `sound_effect` means silence, and playback uses the global `soundVolume`;
- basic battle effects from item config: `damage`, `heal`, `aggression`, and `calm`;
- visible enemy/player stats that update after a processed move;
- enemy aggression damage on threshold overflow;
- a ticking rage countdown with a visual rage event; after the opening wave, supported ultimate effects such as `convertItems`, `damagePlayerByBoardItems`, `HealingEnemyByBoardItems`, `RestoreEnemyShieldByBoardItems`, and `kamikaze` are applied one by one in JSON order. Conversion re-renders the intermediate board before the next effect, damage sends red light projectiles from matched board items to the player HP icon before the health feedback animation, enemy healing sends green light projectiles from matched board items to the enemy HP icon before the `+N` feedback, shield restore sends blue light projectiles from matched board items to the enemy shield icon before the shield `+N` feedback, kamikaze sends red lights from enemy HP to player HP and then bursts red lights outward from enemy HP before self-damage feedback, and final match-3 cascades are checked only after the whole ultimate chain ends;
- rage countdown pauses while the board is resolving a swap, fall, refill, shuffle, cascade, or rage animation; this prevents the enemy ultimate from firing inside the player's current move;
- clickable `item_time` clock inventory slot that consumes one clock, pauses the rage countdown for `battleTimeStopSeconds`, darkens while active, and shows the remaining freeze time over the slot;
- clickable `item_skull` slot that consumes one skull and activates a cursor marker; clicking the skull again cancels it and refunds the item, while clicking the board activates the target cell plus the surrounding 3x3 area without charging enemy aggression from those cells;
- clickable `item_swap` slot that consumes one glove and activates a cursor marker; clicking the glove again cancels it and refunds the item, while two board clicks freely swap any two cells even if the swap creates no match;
- while skull or glove is active, the other special slots and the clock show unavailable feedback instead of activating;
- floating localized “unavailable” feedback when the player clicks the clock while it is active or when quantity is `0`;
- powered item creation for 4 activated cells when `createsOnFour` is configured;
- special item creation for 5+ activated cells when `createsOnFive` is configured;
- battery behavior for `battleUse: "battery"` items created by 5+: adjacent battery + item activates all items of that type, and battery + battery activates the whole visible board, both without aggression;
- inventory `modificate` bonuses: each owned inventory item can add `damage`, `heal`, `aggression`, or `calm` to configured match-3 item ids;
- inventory drop transforms: each owned inventory item can add a percent chance to replace a newly generated match-3 item with another configured item;
- enemy convert transforms: current-stage `convert` can passively replace newly generated items by exact `itemId`/`itemIds` or by `itemTypes` with a fractional chance from 0 to 1;
- when the enemy changes stage, the invisible reserve board is regenerated for the new stage so hidden future drops do not keep using the previous stage's `convert`;
- passive inventory health modifiers: `red` can increase effective max HP through `max_hp_modif`, and `green` can increase HP restored by the heal meter through `heal_hp_modif`;
- automatic victory when the enemy reaches `isDefeated`;
- a localized victory banner for `outcomeBannerMs`, then `victory` and `enemyConfig.reward` are returned to the map;
- a localized defeat banner when player HP reaches `0`, with `ui.surrender` and `battle.outcome.restart` buttons. Restart stays inside the same battle scaffold but cancels async work from the defeated attempt so old animations cannot mutate the new attempt.

This screen intentionally does not run enemy AI or implement every possible ultimate yet. Rage ultimates are being added in small effects; currently `convertItems`, `damagePlayerByBoardItems`, `HealingEnemyByBoardItems`, `RestoreEnemyShieldByBoardItems`, and `kamikaze` are supported.

## Current Map Integration

`src/map-module.js` builds a `BattleRequest` for `battle` nodes and calls `startBattle()`.

During active MVP work, `map-module.js` loads `battle-module.js` dynamically, and `battle-module.js` loads `battle-engine.js` plus `battle-view.js` dynamically. This prevents stale browser ES-module cache from breaking the main menu while the battle files change quickly.

The map marks a battle node completed only after `victory`. If the enemy has a `reward` payload, the map first shows the shared reward overlay and completes the node only after the player clicks `ui.claimReward`.

