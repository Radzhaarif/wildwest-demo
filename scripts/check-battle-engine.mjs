import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const engineSource = readFileSync(resolve(rootDir, "src/battle/battle-engine.js"), "utf8");
const engineUrl = `data:text/javascript;base64,${Buffer.from(engineSource).toString("base64")}`;
const engine = await import(engineUrl);
const formatterSource = readFileSync(resolve(rootDir, "src/battle/battle-formatters.js"), "utf8");
const formatterUrl = `data:text/javascript;base64,${Buffer.from(formatterSource).toString("base64")}`;
const formatters = await import(formatterUrl);
const tutorialSource = readFileSync(resolve(rootDir, "src/battle/battle-tutorial-flow.js"), "utf8");
const tutorialUrl = `data:text/javascript;base64,${Buffer.from(tutorialSource).toString("base64")}`;
const tutorialFlow = await import(tutorialUrl);

const itemCatalog = {
  items: [
    createMatchItem("bullet", "bullet", { createsOnFour: "bullet_power", createsOnFive: "battary" }),
    createMatchItem("bullet_power", "bullet", { category: "rare_match-3" }),
    createMatchItem("granate", "granate", { createsOnFour: "granate_power", createsOnFive: "battary" }),
    createMatchItem("granate_power", "granate", { category: "rare_match-3" }),
    createMatchItem("Knife", "Knife"),
    createMatchItem("Bandage", "Bandage"),
    createMatchItem("Bandage_power", "Bandage", { category: "rare_match-3" }),
    createMatchItem("Shield", "Shield"),
    createMatchItem("Shield_power", "Shield", { category: "rare_match-3" }),
    createMatchItem("junk_1", "junk_1"),
    createMatchItem("trash_1", "trash_1"),
    createMatchItem("trash_2", "trash_2"),
    createMatchItem("radioactive", "radioactive", { category: "rare_match-3", dmgperturn: 1 }),
    createMatchItem("tire", "tire"),
    createMatchItem("battary", "utility", { category: "rare_match-3", battleUse: "battery", damage: 0 }),
    {
      itemId: "item_Shield",
      category: "item",
      modificate: [
        { itemId: "Shield", damage: 0, heal: 0, aggression: 0, calm: 1 },
        { itemId: "Shield_power", damage: 0, heal: 0, aggression: 0, calm: 2 },
      ],
    },
    {
      itemId: "item_Shield_power",
      category: "item",
      transform_chance: 1,
      transform_from_itemId: "Shield",
      transform_to_itemId: "Shield_power",
    },
    { itemId: "red", category: "item", max_hp_modif: 10 },
    { itemId: "green", category: "item", heal_hp_modif: 1 },
    { itemId: "gold", category: "currency" },
  ],
};

run("formatBattleNumber hides floating point tails and floors to tenths", () => {
  assert.equal(formatters.formatBattleNumber(56.199999999999996), "56.2");
  assert.equal(formatters.formatBattleNumber(4.15), "4.1");
  assert.equal(formatters.formatBattleNumber(100), "100");
  assert.equal(formatters.formatBattleNumber(-6.1000000000000005), "-6.1");
});

run("formatText formats numeric values but preserves string values", () => {
  assert.equal(
    formatters.formatText("hp {hp}, rage {rage}", { hp: 56.199999999999996, rage: "0:45" }),
    "hp 56.2, rage 0:45",
  );
});

run("createBattleBoard uses configured size and avoids starting matches", () => {
  const board = engine.createBattleBoard(itemCatalog, {
    width: 6,
    height: 5,
    random: createRandom(7),
  });

  assert.equal(board.length, 5);
  assert.equal(board[0].length, 6);
  assert.equal(engine.findBattleMatches(board, itemCatalog).length, 0);
});

run("createBattleBoard reports too few generated match-3 types", () => {
  const smallCatalog = {
    items: [
      createMatchItem("one", "single"),
      createMatchItem("two", "single"),
    ],
  };

  assert.throws(
    () => engine.createBattleBoard(smallCatalog, { width: 3, height: 3 }),
    /Too few match-3 types for battle board/,
  );
});

run("createBattleBoard checks inventory transforms that collapse drop types", () => {
  const transformedCatalog = {
    items: [
      createMatchItem("a", "a"),
      createMatchItem("b", "b"),
      createMatchItem("c", "c"),
      createMatchItem("same_power", "same", { category: "rare_match-3" }),
      { itemId: "transform_a", category: "item", transform_chance: 100, transform_from_itemId: "a", transform_to_itemId: "same_power" },
      { itemId: "transform_b", category: "item", transform_chance: 100, transform_from_itemId: "b", transform_to_itemId: "same_power" },
      { itemId: "transform_c", category: "item", transform_chance: 100, transform_from_itemId: "c", transform_to_itemId: "same_power" },
    ],
  };
  const playerState = {
    inventory: [
      { itemId: "transform_a", quantity: 1 },
      { itemId: "transform_b", quantity: 1 },
      { itemId: "transform_c", quantity: 1 },
    ],
  };

  assert.throws(
    () => engine.createBattleBoard(transformedCatalog, { width: 3, height: 3, playerState }),
    /inventory transform_chance/,
  );
});

run("drop pool contains only category match-3 items", () => {
  const dropPool = engine.getBattleDropPool(itemCatalog);

  assert(dropPool.includes("bullet"));
  assert(dropPool.includes("granate"));
  assert(!dropPool.includes("bullet_power"));
  assert(!dropPool.includes("battary"));
  assert(!dropPool.includes("gold"));
});

run("matches use type, so normal and powered items can match together", () => {
  const board = [
    ["bullet", "bullet_power", "bullet", "granate"],
    ["granate", "Knife", "Bandage", "Shield"],
    ["Knife", "Bandage", "Shield", "granate"],
  ];

  const bulletMatch = engine.findBattleMatches(board, itemCatalog).find((match) => match.type === "bullet");

  assert(bulletMatch);
  assert.equal(bulletMatch.kind, "horizontal");
  assert.equal(bulletMatch.cells.length, 3);
});

run("findBattleMatches detects horizontal, vertical, and 2x2 square groups", () => {
  const board = [
    ["bullet", "bullet", "bullet", "granate"],
    ["Knife", "Bandage", "Shield", "granate"],
    ["Knife", "Bandage", "Shield", "granate"],
    ["tire", "tire", "Bandage", "Shield"],
    ["tire", "tire", "Shield", "Bandage"],
  ];
  const matches = engine.findBattleMatches(board, itemCatalog);

  assert(matches.some((match) => match.kind === "horizontal" && match.type === "bullet"));
  assert(matches.some((match) => match.kind === "vertical" && match.type === "granate"));
  assert(matches.some((match) => match.kind === "square" && match.type === "tire"));
});

run("battery does not create regular matches", () => {
  const board = [
    ["battary", "battary", "battary", "granate"],
    ["Knife", "Bandage", "Shield", "bullet"],
    ["granate", "Knife", "Bandage", "Shield"],
  ];

  const matches = engine.findBattleMatches(board, itemCatalog);

  assert(!matches.some((match) => match.type === "utility"));
});

run("battery activates all items of adjacent type without aggression", () => {
  const board = [
    ["battary", "bullet", "granate", "bullet_power"],
    ["Knife", "bullet", "Bandage", "Shield"],
    ["granate", "Knife", "Bandage", "Shield"],
  ];
  const battleState = createTestBattleState(board);
  const activation = engine.findBattleBatteryActivation(
    board,
    itemCatalog,
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  );
  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "bullet", kind: "battery-type", cells: activation.cells }],
    itemCatalog,
    { suppressAggression: true },
  );

  assert.equal(activation.targetType, "bullet");
  assert.deepEqual(activation.cells, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 3 },
    { row: 1, col: 1 },
  ]);
  assert.equal(effects.damage, 3);
  assert.equal(effects.aggression, 0);
  assert.equal(battleState.enemyState.aggression.current, 0);
});

run("battery on battery activates the whole board without aggression", () => {
  const board = [
    ["battary", "battary", "granate"],
    ["Knife", "bullet", "Shield"],
  ];
  const battleState = createTestBattleState(board);
  const activation = engine.findBattleBatteryActivation(
    board,
    itemCatalog,
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  );
  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "battery", kind: "battery-all", cells: activation.cells }],
    itemCatalog,
    { suppressAggression: true },
  );

  assert.equal(activation.kind, "battery-all");
  assert.equal(activation.cells.length, 6);
  assert.equal(effects.activatedCells, 6);
  assert.equal(effects.aggression, 0);
});

run("inventory modificate applies item stat bonuses per owned quantity", () => {
  const board = [
    ["Shield", "Shield_power"],
  ];
  const battleState = createTestBattleState(board);
  battleState.playerState.inventory = [
    { itemId: "item_Shield", quantity: 3 },
  ];
  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "Shield", kind: "manual", cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] }],
    itemCatalog,
  );

  assert.equal(effects.calm, 9);
  assert.equal(effects.damage, 2);
});

run("enemy stage itemStatModifiers scale activated item stats after inventory bonuses", () => {
  const localCatalog = {
    items: [
      createMatchItem("Bandage", "Bandage", { damage: 0, heal: 5 }),
      createMatchItem("Bandage_power", "Bandage", { category: "rare_match-3", damage: 0, heal: 10 }),
      createMatchItem("granate", "granate", { damage: 5, aggression: 5 }),
      createMatchItem("granate_power", "granate", { category: "rare_match-3", damage: 10, aggression: 5 }),
      {
        itemId: "item_granate_toolkit",
        category: "item",
        modificate: [
          { itemId: "granate", damage: 5, heal: 0, aggression: 0, calm: 0 },
        ],
      },
    ],
  };
  const board = [
    ["Bandage", "Bandage_power", "granate", "granate_power"],
  ];
  const battleState = createTestBattleState(board);
  battleState.enemyConfig.stages[0].itemStatModifiers = [
    {
      itemTypes: ["Bandage"],
      multipliers: {
        heal: 0.8,
      },
    },
    {
      itemTypes: ["granate"],
      multipliers: {
        damage: 0.8,
        aggression: 1.2,
      },
    },
  ];
  battleState.enemyState.aggression.max = 100;
  battleState.playerState.inventory = [
    { itemId: "item_granate_toolkit", quantity: 1 },
  ];

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [
      {
        type: "manual",
        kind: "manual",
        cells: board[0].map((_, col) => ({ row: 0, col })),
      },
    ],
    localCatalog,
  );

  assert.equal(effects.heal, 12);
  assert.equal(effects.damage, 16);
  assert.equal(effects.aggression, 12);
});

run("enemy stage itemStatModifiers itemId selector matches exact item only", () => {
  const localCatalog = {
    items: [
      createMatchItem("Bandage", "Bandage", { damage: 0, heal: 5 }),
      createMatchItem("Bandage_power", "Bandage", { category: "rare_match-3", damage: 0, heal: 10 }),
    ],
  };
  const board = [
    ["Bandage", "Bandage_power"],
  ];
  const battleState = createTestBattleState(board);
  battleState.enemyConfig.stages[0].itemStatModifiers = [
    {
      itemId: "Bandage",
      multipliers: {
        heal: 0.5,
      },
    },
  ];

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [
      {
        type: "manual",
        kind: "manual",
        cells: board[0].map((_, col) => ({ row: 0, col })),
      },
    ],
    localCatalog,
  );

  assert.equal(effects.heal, 12.5);
});

run("enemy stage itemStatModifiers round final item stats down to tenths", () => {
  const localCatalog = {
    items: [
      createMatchItem("Bandage", "Bandage", { damage: 0, heal: 5 }),
      createMatchItem("granate", "granate", { damage: 5, aggression: 5 }),
    ],
  };
  const board = [
    ["Bandage", "granate"],
  ];
  const battleState = createTestBattleState(board);
  battleState.enemyConfig.stages[0].itemStatModifiers = [
    {
      itemTypes: ["Bandage"],
      multipliers: {
        heal: 0.83,
      },
    },
    {
      itemTypes: ["granate"],
      multipliers: {
        damage: 0.83,
        aggression: 1.23,
      },
    },
  ];
  battleState.enemyState.aggression.max = 100;

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [
      {
        type: "manual",
        kind: "manual",
        cells: board[0].map((_, col) => ({ row: 0, col })),
      },
    ],
    localCatalog,
  );

  assert.equal(effects.heal, 4.1);
  assert.equal(effects.damage, 4.1);
  assert.equal(effects.aggression, 6.1);
});

run("enemy shield absorbs damaging activated items by item count", () => {
  const localCatalog = {
    items: [
      createMatchItem("bullet", "bullet", { damage: 4 }),
    ],
  };
  const board = [
    ["bullet", "bullet", "bullet", "bullet", "bullet"],
  ];
  const cells = board[0].map((_, col) => ({ row: 0, col }));
  const battleState = createTestBattleState(board);
  battleState.enemyState.shield = {
    current: 3,
    max: 3,
  };

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "bullet", kind: "manual", cells }],
    localCatalog,
  );

  assert.equal(effects.shieldDamage, 3);
  assert.equal(effects.damage, 8);
  assert.equal(battleState.enemyState.shield.current, 0);
  assert.equal(battleState.enemyState.health.current, 92);
  assert.deepEqual(effects.shieldSourceCells, cells.slice(0, 3));
  assert.deepEqual(effects.damageSourceCells, cells.slice(3));
});

run("enemy shield resets from the next stage when stage changes", () => {
  const board = [["bullet"]];
  const battleState = createTestBattleState(board);
  battleState.enemyConfig = {
    stages: [
      {
        health: 1,
        shield: 0,
        aggression: { threshold: 10, damage: 3 },
        rage: { secondsToUltimate: 10 },
      },
      {
        health: 20,
        shield: 2,
        aggression: { threshold: 10, damage: 3 },
        rage: { secondsToUltimate: 10 },
      },
    ],
  };
  battleState.enemyState = engine.createBattleEnemyState(battleState.enemyConfig);

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "bullet", kind: "manual", cells: [{ row: 0, col: 0 }] }],
    itemCatalog,
  );

  assert.equal(effects.stageChanged, true);
  assert.equal(battleState.enemyState.stageIndex, 1);
  assert.equal(battleState.enemyState.health.current, 20);
  assert.equal(battleState.enemyState.shield.current, 2);
});

run("inventory transform chance upgrades generated drops per owned quantity", () => {
  const localCatalog = {
    items: [
      createMatchItem("Shield", "Shield"),
      createMatchItem("Shield_power", "Shield", { category: "rare_match-3" }),
      {
        itemId: "item_Shield_power",
        category: "item",
        transform_chance: 1,
        transform_from_itemId: "Shield",
        transform_to_itemId: "Shield_power",
      },
    ],
  };
  const playerState = {
    inventory: [
      { itemId: "item_Shield_power", quantity: 3 },
    ],
  };

  const transformed = engine.createBattleReserveBoard(localCatalog, {
    width: 1,
    height: 1,
    playerState,
    random: createSequenceRandom([0, 0.02]),
  });
  const unchanged = engine.createBattleReserveBoard(localCatalog, {
    width: 1,
    height: 1,
    playerState,
    random: createSequenceRandom([0, 0.04]),
  });

  assert.equal(transformed[0][0], "Shield_power");
  assert.equal(unchanged[0][0], "Shield");
});

run("gold loot picks goldloot items and applies inventory transforms", () => {
  const localCatalog = {
    items: [
      createMatchItem("Knife", "Knife", { goldloot: 1 }),
      createMatchItem("Knife_power", "Knife", { category: "rare_match-3" }),
      createMatchItem("trash_1", "trash_1"),
      {
        itemId: "item_Knife_power",
        category: "item",
        transform_chance: 50,
        transform_from_itemId: "Knife",
        transform_to_itemId: "Knife_power",
      },
    ],
  };
  const playerState = {
    inventory: [
      { itemId: "item_Knife_power", quantity: 1 },
    ],
  };

  const transformed = engine.pickBattleGoldLootItem(localCatalog, {
    playerState,
    random: createSequenceRandom([0, 0.4]),
  });
  const unchanged = engine.pickBattleGoldLootItem(localCatalog, {
    playerState,
    random: createSequenceRandom([0, 0.6]),
  });

  assert.equal(transformed, "Knife_power");
  assert.equal(unchanged, "Knife");
});

run("gold loot never returns the source item id", () => {
  const localCatalog = {
    items: [
      createMatchItem("granate", "granate", { goldloot: 1 }),
      createMatchItem("Knife", "Knife", { goldloot: 1 }),
      createMatchItem("Knife_power", "Knife", { category: "rare_match-3" }),
      {
        itemId: "item_Knife_power",
        category: "item",
        transform_chance: 100,
        transform_from_itemId: "Knife",
        transform_to_itemId: "Knife_power",
      },
    ],
  };

  assert.equal(
    engine.pickBattleGoldLootItem(localCatalog, {
      sourceItemId: "granate",
      random: createSequenceRandom([0]),
    }),
    "Knife",
  );

  assert.equal(
    engine.pickBattleGoldLootItem(localCatalog, {
      sourceItemId: "Knife_power",
      playerState: {
        inventory: [
          { itemId: "item_Knife_power", quantity: 1 },
        ],
      },
      random: createSequenceRandom([0, 0, 0.7]),
    }),
    "granate",
  );
});

run("enemy convert chance transforms newly generated drops by exact itemId", () => {
  const localCatalog = {
    items: [
      createMatchItem("trash_1", "trash_1"),
      createMatchItem("radioactive", "radioactive", { category: "rare_match-3" }),
    ],
  };
  const board = [[null, null]];
  const nextBoard = engine.refillBattleBoard(board, localCatalog, {
    enemyConvertEffects: [
      {
        type: "convertItems",
        chance: 0.2,
        from: { itemId: ["trash_1"] },
        to: { itemId: ["radioactive"] },
      },
    ],
    random: createSequenceRandom([
      0, 0.1, 0,
      0, 0.3,
    ]),
  });

  assert.deepEqual(nextBoard, [["radioactive", "trash_1"]]);
});

run("enemy convert is checked before player inventory transforms", () => {
  const localCatalog = {
    items: [
      createMatchItem("granate", "granate"),
      createMatchItem("granate_power", "granate", { category: "rare_match-3" }),
      createMatchItem("trash_1", "trash_1", { category: "rare_match-3" }),
      {
        itemId: "item_granate_power",
        category: "item",
        transform_chance: 1,
        transform_from_itemId: "granate",
        transform_to_itemId: "granate_power",
      },
    ],
  };
  const playerState = {
    inventory: [
      { itemId: "item_granate_power", quantity: 50 },
    ],
  };
  const board = [[null, null, null]];
  const nextBoard = engine.refillBattleBoard(board, localCatalog, {
    playerState,
    enemyConvertEffects: [
      {
        type: "convertItems",
        chance: 0.5,
        from: { itemId: ["granate"] },
        to: { itemId: ["trash_1"] },
      },
    ],
    random: createSequenceRandom([
      0, 0.49, 0,
      0, 0.51, 0.49,
      0, 0.51, 0.51,
    ]),
  });

  assert.deepEqual(nextBoard, [["trash_1", "granate_power", "granate"]]);
});

run("dmgperturn damages player by unboxed item count", () => {
  const board = [
    ["radioactive", "bullet", "radioactive"],
    ["trash_1", "radioactive", "Bandage"],
  ];
  const battleState = createTestBattleState(board);
  battleState.boxes = [{ row: 1, col: 1 }];
  const result = engine.applyBattleTurnDamage(battleState, itemCatalog);

  assert.equal(result.playerDamage, 2);
  assert.equal(battleState.playerState.health.current, 98);
  assert.deepEqual(result.sourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
  ]);
});

run("red and green inventory items modify battle health and heal recovery", () => {
  const localCatalog = {
    items: [
      createMatchItem("Bandage", "Bandage", { damage: 0, heal: 1 }),
      { itemId: "red", category: "item", max_hp_modif: 10 },
      { itemId: "green", category: "item", heal_hp_modif: 1 },
    ],
  };
  const battleState = createTestBattleState([["Bandage"]]);
  battleState.playerState.health.current = 118;
  battleState.playerState.health.max = 100;
  battleState.playerState.heal.current = 9;
  battleState.playerState.heal.max = 10;
  battleState.playerState.heal.health = 2;
  battleState.playerState.inventory = [
    { itemId: "red", quantity: 2 },
    { itemId: "green", quantity: 3 },
  ];

  assert.equal(engine.getBattlePlayerMaxHealth(battleState.playerState, localCatalog), 120);
  assert.equal(engine.getBattleHealHealth(battleState.playerState, localCatalog), 5);

  const effects = engine.applyBattleMatchEffects(
    battleState,
    [{ type: "Bandage", kind: "manual", cells: [{ row: 0, col: 0 }] }],
    localCatalog,
  );

  assert.equal(effects.heal, 1);
  assert.equal(effects.healthRecovered, 2);
  assert.equal(battleState.playerState.health.current, 120);
  assert.equal(battleState.playerState.heal.current, 0);
});

run("ultimate convertItems changes matching item types into target item", () => {
  const battleState = {
    board: [
      ["junk_1", "bullet", "tire"],
      ["granate", "junk_1", "Shield"],
    ],
  };
  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          effectId: "convertItems",
          type: "convertItems",
          from: {
            itemTypes: ["junk_1"],
          },
          to: {
            itemId: "Bandage",
          },
          scope: "all",
        },
      ],
    },
  });

  assert.equal(summary.convertedItems, 2);
  assert.deepEqual(battleState.board, [
    ["Bandage", "bullet", "tire"],
    ["granate", "Bandage", "Shield"],
  ]);
});

run("ultimate convertItems can pick random targets from to.itemIds per cell", () => {
  const battleState = {
    board: [
      ["junk_1", "junk_1", "junk_1"],
    ],
  };

  const summary = engine.applyBattleUltimateEffects(
    battleState,
    itemCatalog,
    {
      ultimate: {
        effects: [
          {
            type: "convertItems",
            from: {
              itemTypes: ["junk_1"],
            },
            to: {
              itemIds: ["Bandage", "granate"],
            },
          },
        ],
      },
    },
    {
      random: createSequenceRandom([0, 0.99, 0.25]),
    },
  );

  assert.equal(summary.convertedItems, 3);
  assert.deepEqual(battleState.board, [
    ["Bandage", "granate", "Bandage"],
  ]);
});

run("ultimate itemId selector matches exact item ids, not shared types", () => {
  const battleState = createTestBattleState([
    ["granate", "granate_power", "bullet"],
  ]);
  battleState.playerState.health.current = 20;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "damagePlayerByBoardItems",
          count: {
            itemId: ["granate"],
          },
          modifier: 1,
        },
        {
          type: "convertItems",
          from: {
            itemId: ["granate"],
          },
          to: {
            itemId: ["trash_1", "trash_2"],
          },
        },
      ],
    },
  }, {
    random: createSequenceRandom([0.99]),
  });

  assert.equal(summary.playerDamage, 1);
  assert.deepEqual(summary.damageSourceCells, [
    { row: 0, col: 0 },
  ]);
  assert.deepEqual(battleState.board, [
    ["trash_2", "granate_power", "bullet"],
  ]);
  assert.equal(battleState.playerState.health.current, 19);
});

run("ultimate damagePlayerByBoardItems damages player by matching board item count", () => {
  const battleState = createTestBattleState([
    ["granate", "bullet", "granate_power"],
    ["Bandage", "granate", "Shield"],
  ]);
  battleState.playerState.health.current = 20;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          effectId: "damagePlayerByBoardItems",
          type: "damagePlayerByBoardItems",
          count: {
            itemTypes: ["granate"],
          },
          modifier: 2,
        },
      ],
    },
  });

  assert.equal(summary.playerDamage, 6);
  assert.deepEqual(summary.damageSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
    { row: 1, col: 1 },
  ]);
  assert.equal(battleState.playerState.health.current, 14);
});

run("ultimate damagePlayerFixed applies configured flat damage", () => {
  const battleState = createTestBattleState([["bullet"]]);

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "damagePlayerFixed",
          amount: 10,
        },
      ],
    },
  });

  assert.equal(summary.fixedDamage, 10);
  assert.equal(summary.playerDamage, 10);
  assert.equal(battleState.playerState.health.current, 90);
});

run("clock tutorial consumes one item without restoring it on the next step", () => {
  const context = {
    request: {
      locale: "en",
      tutorial: {
        enabled: true,
        playerInventoryQuantities: { item_time: 5 },
        steps: [
          { id: "clock", action: "clock", requiredItemId: "item_time", textKey: "clock" },
          { id: "swap", action: "swap", textKey: "swap", board: [["Knife"]] },
        ],
      },
    },
    battleState: {
      board: [["bullet"]],
      playerState: { inventory: [{ itemId: "item_time", quantity: 0 }] },
      enemyState: {},
    },
  };
  const deps = {
    renderBattleBoard() {},
    renderBattleInventory() {},
    renderBattleStats() {},
    setBattleStatus() {},
    translate(_locale, key) { return key; },
  };

  tutorialFlow.prepareBattleTutorialAttemptState(context);
  assert.equal(context.battleState.playerState.inventory[0].quantity, 5);
  context.battleState.playerState.inventory[0].quantity -= 1;
  const result = tutorialFlow.advanceBattleTutorialAfterInventoryAction(
    deps,
    context,
    "item_time",
    {},
  );

  assert.equal(result.advanced, true);
  assert.equal(context.battleState.tutorial.stepIndex, 1);
  assert.equal(context.battleState.playerState.inventory[0].quantity, 4);
});

run("ultimate HealingEnemyByBoardItems heals enemy by matching item type count", () => {
  const battleState = createTestBattleState([
    ["Bandage", "Bandage_power", "granate"],
    ["Bandage", "bullet", "Shield"],
  ]);
  battleState.enemyState.health.current = 90;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          effectId: "HealingEnemyByBoardItems",
          type: "HealingEnemyByBoardItems",
          count: {
            itemTypes: ["Bandage"],
          },
          modifier: 4,
        },
      ],
    },
  });

  assert.equal(summary.enemyHealing, 12);
  assert.equal(summary.enemyHealthRecovered, 10);
  assert.deepEqual(summary.healingSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
  ]);
  assert.equal(battleState.enemyState.health.current, 100);
});

run("ultimate HealingEnemyByBoardItems exact itemId excludes powered items", () => {
  const battleState = createTestBattleState([
    ["Bandage", "Bandage_power", "Bandage"],
  ]);
  battleState.enemyState.health.current = 50;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "HealingEnemyByBoardItems",
          count: {
            itemId: ["Bandage"],
          },
          modifier: 2,
        },
      ],
    },
  });

  assert.equal(summary.enemyHealing, 4);
  assert.equal(summary.enemyHealthRecovered, 4);
  assert.deepEqual(summary.healingSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
  ]);
  assert.equal(battleState.enemyState.health.current, 54);
});

run("ultimate RestoreEnemyShieldByBoardItems restores enemy shield by matching item type count", () => {
  const battleState = createTestBattleState([
    ["Shield", "Shield_power", "granate"],
    ["Shield", "bullet", "Bandage"],
  ]);
  battleState.enemyState.shield = { current: 4, max: 10 };

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          effectId: "RestoreEnemyShieldByBoardItems",
          type: "RestoreEnemyShieldByBoardItems",
          count: {
            itemTypes: ["Shield"],
          },
          modifier: 3,
        },
      ],
    },
  });

  assert.equal(summary.enemyShieldHealing, 9);
  assert.equal(summary.enemyShieldRecovered, 9);
  assert.deepEqual(summary.shieldHealingSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
  ]);
  assert.equal(battleState.enemyState.shield.current, 13);
});

run("ultimate RestoreEnemyShieldByBoardItems exact itemId excludes powered shield", () => {
  const battleState = createTestBattleState([
    ["Shield", "Shield_power", "Shield"],
  ]);
  battleState.enemyState.shield = { current: 1, max: 10 };

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "RestoreEnemyShieldByBoardItems",
          count: {
            itemId: ["Shield"],
          },
          modifier: 2,
        },
      ],
    },
  });

  assert.equal(summary.enemyShieldHealing, 4);
  assert.equal(summary.enemyShieldRecovered, 4);
  assert.deepEqual(summary.shieldHealingSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
  ]);
  assert.equal(battleState.enemyState.shield.current, 5);
});

run("ultimate RestoreEnemyShieldByBoardItems can create shield and respects configured cap", () => {
  const battleState = createTestBattleState([
    ["Shield", "Shield_power", "Shield"],
  ]);
  battleState.enemyState.shield = { current: 0, max: 0 };

  const summary = engine.applyBattleUltimateEffects(
    battleState,
    itemCatalog,
    {
      ultimate: {
        effects: [
          {
            type: "RestoreEnemyShieldByBoardItems",
            count: {
              itemTypes: ["Shield"],
            },
            modifier: 50,
          },
        ],
      },
    },
    { enemyShieldMax: 99 },
  );

  assert.equal(summary.enemyShieldHealing, 150);
  assert.equal(summary.enemyShieldRecovered, 99);
  assert.equal(battleState.enemyState.shield.current, 99);
  assert.equal(battleState.enemyState.shield.max, 99);
});

run("ultimate kamikaze damages player by enemy HP and then damages enemy by the same amount", () => {
  const battleState = createTestBattleState([
    ["bullet", "granate", "Bandage"],
  ]);
  battleState.enemyState.health.current = 35;
  battleState.playerState.health.current = 80;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "kamikaze",
        },
      ],
    },
  });

  assert.equal(summary.kamikazeDamage, 35);
  assert.equal(summary.playerDamage, 35);
  assert.equal(summary.enemySelfDamage, 35);
  assert.equal(summary.enemyDefeated, true);
  assert.equal(battleState.playerState.health.current, 45);
  assert.equal(battleState.enemyState.health.current, 0);
  assert.equal(battleState.enemyState.isDefeated, true);
});

run("kamikaze phase helpers keep enemy damage after player damage for UI sequencing", () => {
  const battleState = createTestBattleState([
    ["bullet", "granate", "Bandage"],
  ]);
  battleState.enemyState.health.current = 25;
  battleState.playerState.health.current = 90;

  const playerPhase = engine.applyBattleKamikazePlayerDamage(battleState);
  assert.equal(playerPhase.kamikazeDamage, 25);
  assert.equal(playerPhase.playerDamage, 25);
  assert.equal(battleState.playerState.health.current, 65);
  assert.equal(battleState.enemyState.health.current, 25);

  const enemyPhase = engine.applyBattleKamikazeEnemySelfDamage(battleState, playerPhase.kamikazeDamage);
  assert.equal(enemyPhase.enemySelfDamage, 25);
  assert.equal(enemyPhase.enemyDefeated, true);
  assert.equal(battleState.enemyState.health.current, 0);
});

run("ultimate effects ignore boxed cells but keep vines active", () => {
  const battleState = createTestBattleState([
    ["granate", "granate_power", "granate"],
    ["granate", "bullet", "granate"],
  ]);
  battleState.playerState.health.current = 20;
  battleState.boxes = [{ row: 0, col: 2 }];
  battleState.vines = [{ row: 1, col: 0 }];

  const summary = engine.applyBattleUltimateEffects(
    battleState,
    itemCatalog,
    {
      ultimate: {
        effects: [
          {
            type: "damagePlayerByBoardItems",
            count: {
              itemTypes: ["granate"],
            },
            modifier: 1,
          },
          {
            type: "convertItems",
            from: {
              itemId: ["granate"],
            },
            to: {
              itemId: "trash_1",
            },
          },
        ],
      },
    },
    { boxes: battleState.boxes },
  );

  assert.equal(summary.playerDamage, 4);
  assert.deepEqual(summary.damageSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 2 },
  ]);
  assert.deepEqual(battleState.board, [
    ["trash_1", "granate_power", "granate"],
    ["trash_1", "bullet", "trash_1"],
  ]);
  assert.equal(battleState.playerState.health.current, 16);
});

run("ultimate effects apply in JSON order before final cascades", () => {
  const battleState = createTestBattleState([
    ["Bandage", "granate", "bullet"],
  ]);
  battleState.playerState.health.current = 20;

  const summary = engine.applyBattleUltimateEffects(battleState, itemCatalog, {
    ultimate: {
      effects: [
        {
          type: "convertItems",
          from: { itemTypes: ["Bandage"] },
          to: { itemId: "granate" },
        },
        {
          type: "damagePlayerByBoardItems",
          count: { itemTypes: ["granate"] },
          modifier: 1,
        },
        {
          type: "convertItems",
          from: { itemTypes: ["granate"] },
          to: { itemId: "trash_1" },
        },
      ],
    },
  });

  assert.equal(summary.convertedItems, 3);
  assert.equal(summary.playerDamage, 2);
  assert.deepEqual(summary.damageSourceCells, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ]);
  assert.deepEqual(battleState.board, [
    ["trash_1", "trash_1", "bullet"],
  ]);
  assert.equal(battleState.playerState.health.current, 18);
});

run("createBattleMatchBonuses creates powered item for 4 and generator for 5+", () => {
  const fourBoard = [
    ["bullet", "bullet", "bullet", "bullet"],
    ["granate", "Knife", "Bandage", "Shield"],
  ];
  const fiveBoard = [
    ["granate", "granate", "granate", "granate", "granate"],
    ["bullet", "Knife", "Bandage", "Shield", "tire"],
  ];

  const powered = engine.createBattleMatchBonuses(
    fourBoard,
    engine.findBattleMatches(fourBoard, itemCatalog),
    itemCatalog,
    { preferredCell: { row: 0, col: 2 } },
  );
  const generator = engine.createBattleMatchBonuses(
    fiveBoard,
    engine.findBattleMatches(fiveBoard, itemCatalog),
    itemCatalog,
    { preferredCell: { row: 0, col: 3 } },
  );

  assert.deepEqual(powered, [{ cell: { row: 0, col: 2 }, itemId: "bullet_power", kind: "powered", type: "bullet" }]);
  assert.deepEqual(generator, [{ cell: { row: 0, col: 3 }, itemId: "battary", kind: "generator", type: "granate" }]);
});

run("findBattleAvailableMove scans bottom-up and respects typeGroups priority", () => {
  const board = [
    ["bullet", "bullet", "Bandage", "bullet", "Shield"],
    ["Bandage", "granate", "Shield", "junk_1", "bullet"],
    ["granate", "junk_1", "Bandage", "Knife", "Shield"],
    ["Shield", "junk_1", "bullet", "Bandage", "granate"],
    ["bullet", "Bandage", "junk_1", "granate", "Shield"],
  ];

  const bottomMove = engine.findBattleAvailableMove(board, itemCatalog);
  const priorityMove = engine.findBattleAvailableMove(board, itemCatalog, {
    typeGroups: [["bullet"], ["*"]],
  });

  assert.deepEqual(bottomMove.from, { row: 4, col: 1 });
  assert.deepEqual(bottomMove.to, { row: 4, col: 2 });
  assert.deepEqual(bottomMove.hintCell, { row: 4, col: 2 });
  assert.deepEqual(priorityMove.from, { row: 0, col: 2 });
  assert.deepEqual(priorityMove.to, { row: 0, col: 3 });
  assert.deepEqual(priorityMove.hintCell, { row: 0, col: 3 });
});

run("findBattleAvailableMove can hint battery activations by target type", () => {
  const board = [
    ["Knife", "Bandage", "Shield", "granate"],
    ["granate", "Knife", "Bandage", "Shield"],
    ["battary", "bullet", "Knife", "Bandage"],
  ];

  const move = engine.findBattleAvailableMove(board, itemCatalog, {
    typeGroups: [["bullet"], ["*"]],
  });

  assert.deepEqual(move.from, { row: 2, col: 0 });
  assert.deepEqual(move.to, { row: 2, col: 1 });
  assert.deepEqual(move.hintCell, { row: 2, col: 0 });
  assert.equal(move.batteryActivation.targetType, "bullet");
});

run("battle walls are unique edges and block ordinary available moves", () => {
  const smallBoard = [
    ["bullet", "granate"],
    ["Knife", "Shield"],
  ];
  const walls = engine.createBattleWalls(smallBoard, { count: 10, random: createRandom(17) });
  const wallsAvoidingBoxes = engine.createBattleWalls(smallBoard, {
    count: 10,
    boxes: [{ row: 0, col: 0 }],
    random: createRandom(18),
  });

  assert.equal(walls.length, 4);
  assert.equal(wallsAvoidingBoxes.length, 2);
  assert(wallsAvoidingBoxes.every((wall) => (
    !engine.hasBattleBoxAt([{ row: 0, col: 0 }], wall.from)
    && !engine.hasBattleBoxAt([{ row: 0, col: 0 }], wall.to)
  )));
  assert.equal(new Set(walls.map((wall) => `${wall.from.row}:${wall.from.col}|${wall.to.row}:${wall.to.col}`)).size, 4);
  assert(engine.hasBattleWallBetween(walls, walls[0].to, walls[0].from));
  assert(!engine.hasBattleWallBetween(walls, { row: 0, col: 0 }, { row: 1, col: 1 }));

  const moveBoard = [
    ["Knife", "Bandage", "Shield", "granate"],
    ["Bandage", "Shield", "Knife", "Bandage"],
    ["bullet", "bullet", "granate", "bullet"],
  ];
  const blockingWall = [{ from: { row: 2, col: 2 }, to: { row: 2, col: 3 } }];
  const openMove = engine.findBattleAvailableMove(moveBoard, itemCatalog, { typeGroups: [["bullet"]] });
  const blockedMove = engine.findBattleAvailableMove(moveBoard, itemCatalog, {
    typeGroups: [["bullet"]],
    walls: blockingWall,
  });

  assert.deepEqual(openMove.from, { row: 2, col: 2 });
  assert.deepEqual(openMove.to, { row: 2, col: 3 });
  assert.equal(blockedMove, null);
});

run("battle boxes cover cells and block matches, moves, and gravity", () => {
  const board = [
    ["bullet", "bullet", "bullet"],
    ["granate", null, "Knife"],
    ["Shield", "Bandage", "Shield"],
  ];
  const boxes = [{ row: 0, col: 1 }];
  const generatedBoxes = engine.createBattleBoxes(board, { count: 20, random: createRandom(19) });
  const matches = engine.findBattleMatches(board, itemCatalog, { boxes });
  const move = engine.findBattleAvailableMove([
    ["Knife", "Bandage", "Shield"],
    ["Bandage", "Shield", "Knife"],
    ["bullet", "bullet", "granate"],
  ], itemCatalog, {
    typeGroups: [["bullet"]],
    boxes: [{ row: 2, col: 2 }],
  });
  const dropped = engine.dropBattleBoard(board, { boxes });
  const refilled = engine.refillBattleBoard(dropped, itemCatalog, {
    boxes,
    random: createRandom(23),
  });

  assert.equal(generatedBoxes.length, 8);
  assert.equal(engine.hasBattleBoxAt(boxes, { row: 0, col: 1 }), true);
  assert.equal(engine.hasBattleBoxAt(boxes, { row: 2, col: 1 }), false);
  assert.equal(matches.length, 0);
  assert.equal(move, null);
  assert.equal(dropped[0][1], "bullet");
  assert.equal(refilled[0][1], "bullet");
  assert.notEqual(refilled[1][1], null);
});

run("battle vines cover cells, block moves, but allow matches and gravity", () => {
  const board = [
    ["bullet", "bullet", "bullet"],
    ["granate", null, "Knife"],
    ["Shield", "Bandage", "Shield"],
  ];
  const boxes = [{ row: 1, col: 0 }];
  const vines = [{ row: 0, col: 1 }];
  const generatedVines = engine.createBattleVines(board, {
    count: 20,
    boxes,
    random: createRandom(31),
  });
  const matches = engine.findBattleMatches(board, itemCatalog, { vines });
  const manualMatches = [{ type: "manual", kind: "special", cells: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
  ] }];
  const comboRemoval = engine.removeBattleMatches(board, manualMatches, { vines });
  const moveBoard = [
    ["Knife", "Bandage", "Shield", "granate"],
    ["Bandage", "Shield", "Knife", "Bandage"],
    ["bullet", "bullet", "granate", "bullet"],
  ];
  const openMove = engine.findBattleAvailableMove(moveBoard, itemCatalog, {
    typeGroups: [["bullet"]],
  });
  const blockedMove = engine.findBattleAvailableMove(moveBoard, itemCatalog, {
    typeGroups: [["bullet"]],
    vines: [{ row: 2, col: 2 }],
  });
  const dropped = engine.dropBattleBoard([
    ["bullet"],
    [null],
    ["Knife"],
  ], {
    vines: [{ row: 1, col: 0 }],
  });
  const shuffled = engine.shuffleBattleBoardWithMovement([
    ["bullet", "granate", "Knife"],
  ], {
    vines: [{ row: 0, col: 1 }],
    random: createRandom(37),
  });

  assert.equal(generatedVines.length, 7);
  assert(!generatedVines.some((vine) => vine.row === 1 && vine.col === 0));
  assert.equal(engine.hasBattleVineAt(vines, { row: 0, col: 1 }), true);
  assert.equal(engine.hasBattleVineAt(vines, { row: 2, col: 1 }), false);
  assert(matches.some((match) => match.kind === "horizontal" && match.type === "bullet"));
  assert(openMove);
  assert.equal(blockedMove, null);
  assert.deepEqual(comboRemoval[0], [null, null, null]);
  assert.deepEqual(dropped.map((row) => row[0]), [null, "bullet", "Knife"]);
  assert.equal(shuffled.board[0][1], "granate");
});

run("shuffleBattleBoardWithMovement prefers distant moves instead of moving chunks", () => {
  const board = [
    ["a0", "a1", "a2", "a3"],
    ["b0", "b1", "b2", "b3"],
    ["c0", "c1", "c2", "c3"],
    ["d0", "d1", "d2", "d3"],
  ];
  const result = engine.shuffleBattleBoardWithMovement(board, { random: createRandom(41) });
  const totalDistance = result.movement.reduce((sum, move) => {
    return sum + Math.abs(move.from.row - move.to.row) + Math.abs(move.from.col - move.to.col);
  }, 0);
  const sameRowMoves = result.movement.filter((move) => move.from.row === move.to.row).length;
  const neighboringSourcePairs = countMovementNeighboringSourcePairs(result.movement);

  assert.equal(result.movement.length, 16);
  assert(totalDistance >= 48, `expected stronger shuffle distance, got ${totalDistance}`);
  assert(sameRowMoves <= 3, `expected most items to change rows, got ${sameRowMoves} same-row moves`);
  assert(neighboringSourcePairs <= 5, `expected fewer preserved source chunks, got ${neighboringSourcePairs}`);
});

run("items below a box animate as falling from the box", () => {
  const board = [
    ["bullet"],
    [null],
    [null],
  ];
  const reserveBoard = [
    ["Knife"],
    ["Bandage"],
    ["Shield"],
  ];
  const result = engine.refillBattleBoardFromReserve(board, reserveBoard, itemCatalog, {
    boxes: [{ row: 0, col: 0 }],
    random: createRandom(29),
  });
  const boxMoves = result.movement.filter((move) => move.source === "box");

  assert.deepEqual(result.board.map((row) => row[0]), ["bullet", "Bandage", "Shield"]);
  assert.equal(boxMoves.length, 2);
  assert(boxMoves.every((move) => move.fromRow === 0));
  assert(boxMoves.every((move) => move.isNew === false));
});

run("remove, drop, and refill keep board dimensions and fill empty cells", () => {
  const board = [
    ["bullet", "bullet", "bullet", "granate"],
    ["Knife", "Bandage", "Shield", "tire"],
    ["granate", "Knife", "Bandage", "Shield"],
  ];
  const matches = engine.findBattleMatches(board, itemCatalog);
  const removed = engine.removeBattleMatches(board, matches);
  const dropped = engine.dropBattleBoard(removed);
  const refilled = engine.refillBattleBoard(dropped, itemCatalog, { random: createRandom(11) });

  assert.equal(refilled.length, board.length);
  assert.equal(refilled[0].length, board[0].length);
  assert(refilled.every((row) => row.every(Boolean)));
});

run("reserve board refills visible board from its lower cells without matching in reserve", () => {
  const board = [
    [null, "bullet"],
    [null, null],
    ["Knife", null],
  ];
  const reserveBoard = [
    ["reserve_top_a", "reserve_top_b"],
    ["reserve_mid_a", "reserve_mid_b"],
    ["reserve_bottom_a", "reserve_bottom_b"],
  ];
  const localCatalog = {
    items: [
      ...itemCatalog.items,
      createMatchItem("reserve_top_a", "same"),
      createMatchItem("reserve_mid_a", "same"),
      createMatchItem("reserve_bottom_a", "same"),
      createMatchItem("reserve_top_b", "same"),
      createMatchItem("reserve_mid_b", "same"),
      createMatchItem("reserve_bottom_b", "same"),
    ],
  };

  const result = engine.refillBattleBoardFromReserve(board, reserveBoard, localCatalog, { random: createRandom(13) });

  assert.deepEqual(result.board.map((row) => row[0]), ["reserve_mid_a", "reserve_bottom_a", "Knife"]);
  assert.deepEqual(result.board.map((row) => row[1]), ["reserve_mid_b", "reserve_bottom_b", "bullet"]);
  assert.equal(result.reserveBoard.length, board.length);
  assert.equal(result.reserveBoard[0].length, board[0].length);
  assert(result.reserveBoard.every((row) => row.every(Boolean)));
  assert(result.movement.some((move) => move.source === "reserve" && move.fromRow < 0));
});

console.log("battle-engine checks passed");

function createMatchItem(itemId, type, overrides = {}) {
  return {
    itemId,
    category: "match-3",
    type,
    damage: 1,
    heal: 0,
    aggression: 0,
    calm: 0,
    ...overrides,
  };
}

function createRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function createSequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

function countMovementNeighboringSourcePairs(movement) {
  const sourceByTarget = new Map();
  for (const move of movement) {
    sourceByTarget.set(`${move.to.row}:${move.to.col}`, move.from);
  }

  let count = 0;
  for (const move of movement) {
    count += isNeighboringSourcePair(
      move.from,
      sourceByTarget.get(`${move.to.row}:${move.to.col + 1}`),
    ) ? 1 : 0;
    count += isNeighboringSourcePair(
      move.from,
      sourceByTarget.get(`${move.to.row + 1}:${move.to.col}`),
    ) ? 1 : 0;
  }
  return count;
}

function isNeighboringSourcePair(firstSource, secondSource) {
  if (!firstSource || !secondSource) {
    return false;
  }
  return Math.abs(firstSource.row - secondSource.row) + Math.abs(firstSource.col - secondSource.col) === 1;
}

function createTestBattleState(board) {
  return {
    board,
    enemyConfig: {
      stages: [
        {
          health: 100,
          aggression: {
            threshold: 10,
            damage: 3,
          },
          rage: {
            secondsToUltimate: 10,
          },
        },
      ],
    },
    enemyState: {
      stageIndex: 0,
      stageCount: 1,
      health: {
        current: 100,
        max: 100,
      },
      shield: {
        current: 0,
        max: 0,
      },
      aggression: {
        current: 0,
        max: 10,
        damage: 3,
      },
      rage: {
        current: 10,
        max: 10,
      },
      isDefeated: false,
    },
    playerState: {
      health: {
        current: 100,
        max: 100,
      },
      heal: {
        current: 0,
        max: 10,
        health: 2,
      },
    },
  };
}

function run(name, test) {
  try {
    test();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
