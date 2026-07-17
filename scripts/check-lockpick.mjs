import assert from "node:assert/strict";
import { createSeededRandom } from "../src/seeded-random.js";
import {
  LOCKPICK_MIN_SOLUTION_MOVES,
  LOCKPICK_SCRAMBLE_MAX_MOVES,
  LOCKPICK_SCRAMBLE_MIN_MOVES,
  applyLockpickAction,
  findShortestSafeLockpickSolutionDistance,
  generateLockpickPuzzle,
  getLockpickActionDeltas,
  hasLockpickDanger,
  isLockpickSolved,
  validateLockpickRelations,
} from "../src/map/map-lockpick-engine.js";

const checks = [];

run("direct relations do not cascade", () => {
  const relations = [
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 2, direction: "opposite" },
  ];
  const positions = applyLockpickAction([0, 0, 0, 0, 0], relations, {
    master: 0,
    direction: 1,
  });
  assert.deepEqual(positions, [1, 1, 0, 0, 0]);
});

run("mutual relations keep independent directions", () => {
  const relations = [
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 0, direction: "opposite" },
  ];
  assert.deepEqual(getLockpickActionDeltas(relations, { master: 0, direction: 1 }), [1, 1, 0, 0, 0]);
  assert.deepEqual(getLockpickActionDeltas(relations, { master: 1, direction: 1 }), [-1, 1, 0, 0, 0]);
});

run("generated puzzles satisfy graph, safety, and solution constraints", () => {
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    const puzzle = generateLockpickPuzzle({
      random: createSeededRandom(`lockpick-check-${seedIndex}`),
      includeSolution: true,
    });
    const relationValidation = validateLockpickRelations(puzzle.relations, puzzle.ringCount);
    assert.equal(relationValidation.valid, true, relationValidation.issues.join(", "));
    assert.ok(
      puzzle.scrambleMoveCount >= LOCKPICK_SCRAMBLE_MIN_MOVES
        && puzzle.scrambleMoveCount <= LOCKPICK_SCRAMBLE_MAX_MOVES,
    );
    assert.equal(Number.isFinite(puzzle.shortestSolutionMoves), true);
    assert.ok(puzzle.shortestSolutionMoves >= LOCKPICK_MIN_SOLUTION_MOVES);
    assert.equal(isLockpickSolved(puzzle.startPositions), false);
    assert.equal(hasLockpickDanger(puzzle.startPositions, puzzle.bumpOffsets), false);
    for (const bumpOffset of puzzle.bumpOffsets) {
      assert.ok(bumpOffset >= 2 && bumpOffset <= puzzle.sectorCount - 2);
    }

    let positions = puzzle.startPositions;
    for (const action of puzzle.solutionActions) {
      positions = applyLockpickAction(
        positions,
        puzzle.relations,
        action,
        puzzle.sectorCount,
      );
      assert.equal(hasLockpickDanger(positions, puzzle.bumpOffsets, puzzle.sectorCount), false);
    }
    assert.equal(isLockpickSolved(positions), true);
    assert.equal(
      findShortestSafeLockpickSolutionDistance({
        positions: puzzle.startPositions,
        relations: puzzle.relations,
        bumpOffsets: puzzle.bumpOffsets,
        sectorCount: puzzle.sectorCount,
        maxDepth: puzzle.scrambleMoveCount,
      }),
      puzzle.shortestSolutionMoves,
    );
  }
});

run("same seed produces the same hidden puzzle", () => {
  const first = generateLockpickPuzzle({ random: createSeededRandom("repeatable-lock") });
  const second = generateLockpickPuzzle({ random: createSeededRandom("repeatable-lock") });
  assert.deepEqual(first, second);
});

for (const check of checks) {
  try {
    check.test();
    console.log(`ok - ${check.name}`);
  } catch (error) {
    console.error(`not ok - ${check.name}`);
    throw error;
  }
}

console.log(`[lockpick-check] ${checks.length} checks passed`);

function run(name, test) {
  checks.push({ name, test });
}
