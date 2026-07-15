import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, get as httpGet } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultSeed = "A7K9M2QX4T8ZB3NC";
const defaultViewport = { width: 1365, height: 768 };
const defaultTimeoutMs = 45000;
const localHost = "127.0.0.1";
const smokeSettingsStorageKey = "roguelikeCurrentSettings";
const smokeAudioVolume = 0.1;
const expectedShopPurchaseItemId = "item_Knife";
const smokeTestShopItemIds = [
  "item_skull",
  "item_time",
  "item_swap",
  "red",
  "green",
  "item_granate",
  "item_granate_power",
  "item_bullet",
  "item_bullet_power",
  "item_Knife",
  "item_Knife_power",
  "item_Bandage",
  "item_Bandage_power",
  "item_Shield",
  "item_Shield_power",
];
const smokeTestShopOfferAmount = 10;
const smokeTestNodeEvents = [
  "dialog_smoke",
  "skip_smoke",
  "shop_all",
  "heal_paid",
  "reward_all",
  "battle_test",
  "boss",
];
const smokeTestGeneratedNodeEvents = [
  ...smokeTestNodeEvents,
  "dialog_lockpick_smoke",
];
const expectedFirstShopOffers = new Map([
  ["item_Knife", 50],
  ["item_bullet", 50],
  ["item_granate", 50],
  ["item_Bandage", 50],
  ["item_Shield", 50],
  ["item_Knife_power", 100],
  ["item_bullet_power", 100],
  ["item_granate_power", 100],
  ["item_Bandage_power", 100],
  ["item_Shield_power", 100],
  ["red", 200],
  ["green", 100],
]);
const knownResourceExtensions = new Set([
  ".css",
  ".gif",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".jsonc",
  ".m4a",
  ".mp3",
  ".ogg",
  ".png",
  ".svg",
  ".wav",
  ".webp",
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
};

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedVersion = await readAppVersion();
  const server = await startStaticServer(args.port);
  const chrome = await launchChrome(args);
  let cdp;

  try {
    const pageUrl = `${server.origin}/index.html?seed=${encodeURIComponent(args.seed)}&debug=1`;
    const browserWebSocketUrl = await waitForBrowserWebSocket(chrome.debugPort, args.timeoutMs);
    cdp = await CdpConnection.connect(browserWebSocketUrl);
    const page = await createPageSession(cdp, pageUrl);
    const tracker = createRuntimeTracker(cdp, page.sessionId);

    await runSmoke(page, tracker, {
      expectedVersion,
      origin: server.origin,
      pageUrl,
      screenshotPath: args.screenshot,
      startMode: args.startMode,
      timeoutMs: args.timeoutMs,
    });

    if (args.keepOpen) {
      console.log("[browser-smoke] keep-open is active; press Ctrl+C to stop Chrome and server.");
      await new Promise(() => {});
    }
  } finally {
    cdp?.close();
    await stopChrome(chrome, args.keepOpen);
    await stopServer(server);
  }
}

async function runSmoke(page, tracker, options) {
  const { expectedVersion, origin, pageUrl, startMode, timeoutMs } = options;
  console.log(`[browser-smoke] url: ${pageUrl}`);
  console.log(`[browser-smoke] app version: ${expectedVersion}`);

  await page.send("Page.navigate", { url: pageUrl });
  await waitForExpression(page, "document.readyState !== 'loading'", timeoutMs);
  await waitForExpression(
    page,
    `globalThis.__ROGUELITE_MATCH3_VERSION__ === ${JSON.stringify(expectedVersion)}`,
    timeoutMs,
  );
  await waitForExpression(
    page,
    "Boolean(document.querySelector('#startGameButton'))"
      + " && !document.querySelector('#startGameButton').disabled"
      + " && document.querySelector('#loadingOverlay')?.classList.contains('hidden')",
    timeoutMs,
  );
  await assertSmokeAudioVolume(page);
  if (startMode === "smoke-test") {
    await typeText(page, "iddqd");
    await waitForExpression(
      page,
      "Boolean(document.querySelector('#smokeTestButton'))"
        + " && !document.querySelector('#smokeTestButton').classList.contains('hidden')"
        + " && !document.querySelector('#smokeTestButton').disabled",
      timeoutMs,
    );
    await evaluate(page, "document.querySelector('#smokeTestButton').click()", { userGesture: true });
    const smokeTestSummary = await runSmokeTestMapSmoke(page, { expectedVersion, timeoutMs });
    await restartSmokeTestMap(page, { expectedVersion, pageUrl, timeoutMs });
    smokeTestSummary.smokeTest.lockpick = await runSmokeTestLockpickSmoke(page, {
      expectedVersion,
      timeoutMs,
    });
    await finishSmoke(page, tracker, {
      expectedVersion,
      origin,
      screenshotPath: options.screenshotPath,
      summary: smokeTestSummary,
    });
    return;
  }
  if (startMode === "level-up") {
    await typeText(page, "iddqd");
  }
  await evaluate(page, "document.querySelector('#startGameButton').click()", { userGesture: true });
  await waitForExpression(page, "document.querySelectorAll('#mapBoard .map-node').length > 0", timeoutMs);

  const mapSummary = await evaluateJson(page, `(() => {
    const nodes = [...document.querySelectorAll("#mapBoard .map-node")];
    return {
      total: nodes.length,
      available: nodes
        .filter((node) => !node.disabled)
        .map((node) => ({
          id: node.dataset.nodeId || "",
          eventType: node.classList.contains("dialog") ? "dialog" : "battle",
          className: node.className,
          label: node.getAttribute("aria-label") || "",
        })),
    };
  })()`);
  assert(mapSummary.total > 0, "Map did not render any nodes.");
  assert(mapSummary.available.length > 0, "Map has no available node after START.");
  assert(
    mapSummary.available.some((node) => node.eventType === "battle"),
    "Expected WildWest first level to expose a battle node.",
  );
  assert(
    mapSummary.available.some((node) => node.eventType === "dialog"),
    "Expected WildWest first level to expose a dialog node.",
  );

  if (startMode === "level-up") {
    const levelUpSummary = await runLevelUpActivitySmoke(page, {
      expectedVersion,
      clickedStartNode: null,
      dialogLinkedAnswer: null,
      timeoutMs,
    });
    await finishSmoke(page, tracker, {
      expectedVersion,
      origin,
      screenshotPath: options.screenshotPath,
      summary: levelUpSummary,
    });
    return;
  }

  if (startMode === "heal") {
    await setDebugPlayerHealth(page, { current: 50, max: 100 });
  }

  const clickedStartNode = await evaluateJson(page, `(() => {
    const battleNode = document.querySelector(".map-node.available.battle:not(:disabled)");
    const dialogNode = document.querySelector(".map-node.available.dialog:not(:disabled)");
    const preferredStartMode = ${JSON.stringify(startMode)};
    const node = ["dialog", "shop", "heal", "reward"].includes(preferredStartMode)
      ? dialogNode || battleNode
      : battleNode || dialogNode;
    if (!node) {
      return null;
    }
    const result = {
      id: node.dataset.nodeId || "",
      eventType: node.classList.contains("dialog") ? "dialog" : "battle",
      className: node.className,
      label: node.getAttribute("aria-label") || "",
    };
    node.click();
    return result;
  })()`, { userGesture: true });
  assert(clickedStartNode, "No available battle or dialog node found for smoke.");

  let dialogLinkedAnswer = null;
  if (clickedStartNode.eventType === "dialog") {
    await waitForExpression(page, "!document.querySelector('#mapDialogOverlay')?.classList.contains('hidden')", timeoutMs);
    await evaluate(page, "document.querySelector('#mapDialogOverlay')?.click()", { userGesture: true });
    await waitForExpression(
      page,
      "document.querySelector('#mapDialogAnswers')?.classList.contains('is-visible')"
        + " && document.querySelectorAll('#mapDialogAnswers button').length > 0",
      timeoutMs,
    );
    const dialogTargetByStartMode = {
      dialog: "battle_test",
      shop: "shop",
      heal: "heal",
      reward: "reward",
    };
    const dialogTargetEventName = dialogTargetByStartMode[startMode] || "battle_test";
    dialogLinkedAnswer = await evaluateJson(page, `(() => {
      const button = document.querySelector('#mapDialogAnswers button[data-dialog-event-name=${JSON.stringify(dialogTargetEventName)}]');
      if (!button) {
        return null;
      }
      const result = {
        text: button.textContent?.trim() || "",
        eventName: button.dataset.dialogEventName || "",
      };
      button.click();
      return result;
    })()`, { userGesture: true });
    assert(dialogLinkedAnswer, `Opening dialog did not render a ${dialogTargetEventName} answer for smoke.`);
  }

  if (startMode === "shop") {
    await waitForExpression(page, "!document.querySelector('#shopOverlay')?.classList.contains('hidden')", timeoutMs);
    await waitForExpression(
      page,
      `document.querySelectorAll('#shopItems .shop-item-card').length === ${expectedFirstShopOffers.size}`,
      timeoutMs,
    );
    const beforeAction = await readMapActivitySnapshot(page);
    const shopSummary = await evaluateJson(page, `(() => {
      const cards = [...document.querySelectorAll("#shopItems .shop-item-card")];
      const panel = document.querySelector(".shop-panel");
      return {
        appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
        legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
        mapNodes: document.querySelectorAll("#mapBoard .map-node").length,
        clickedStartNode: ${JSON.stringify(clickedStartNode)},
        dialogLinkedAnswer: ${JSON.stringify(dialogLinkedAnswer)},
        shop: {
          visible: !document.querySelector("#shopOverlay")?.classList.contains("hidden"),
          cards: cards.map((card) => ({
            itemId: card.dataset.itemId || "",
            amount: Number(card.dataset.itemAmount || 0),
            goldPrice: Number(card.dataset.goldPrice || 0),
            text: card.textContent?.trim() || "",
            hasImage: Boolean(card.querySelector("img")),
            hasSelectButton: Boolean(card.querySelector("button")),
          })),
          panelScrollHeight: panel?.scrollHeight || 0,
          panelClientHeight: panel?.clientHeight || 0,
        },
      };
    })()`);
    assert(shopSummary.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${shopSummary.appVersion}.`);
    assert(shopSummary.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
    assert(shopSummary.shop.visible === true, "Expected first-level shop overlay to be visible.");
    assert(shopSummary.shop.cards.length === expectedFirstShopOffers.size, `Expected ${expectedFirstShopOffers.size} shop cards, got ${shopSummary.shop.cards.length}.`);
    for (const card of shopSummary.shop.cards) {
      assert(expectedFirstShopOffers.has(card.itemId), `Unexpected first-level shop item: ${card.itemId}.`);
      assert(card.amount === 1, `Expected ${card.itemId} amount 1, got ${card.amount}.`);
      assert(card.goldPrice === expectedFirstShopOffers.get(card.itemId), `Expected ${card.itemId} price ${expectedFirstShopOffers.get(card.itemId)}, got ${card.goldPrice}.`);
      assert(card.hasImage === true, `Expected ${card.itemId} shop card to render an image.`);
      assert(card.hasSelectButton === true, `Expected ${card.itemId} shop card to render a select button.`);
    }
    for (const itemId of expectedFirstShopOffers.keys()) {
      assert(
        shopSummary.shop.cards.some((card) => card.itemId === itemId),
        `Expected first-level shop to render ${itemId}.`,
      );
    }

    const beforeGold = getSnapshotQuantity(beforeAction, "gold");
    const beforePurchasedItem = getSnapshotQuantity(beforeAction, expectedShopPurchaseItemId);
    assert(beforeGold === 100, `Expected first-level shop to start with 100 gold, got ${beforeGold}.`);
    assert(beforePurchasedItem === 0, `Expected ${expectedShopPurchaseItemId} to start at 0, got ${beforePurchasedItem}.`);

    const selectedOffer = await clickShopOffer(page, expectedShopPurchaseItemId);
    assert(selectedOffer, `Could not select ${expectedShopPurchaseItemId} in the shop.`);
    assert(selectedOffer.goldPrice === 50, `Expected ${expectedShopPurchaseItemId} price 50, got ${selectedOffer.goldPrice}.`);
    await waitForExpression(page, "document.querySelector('#shopBuyButton')?.disabled === false", timeoutMs);
    await evaluate(page, "document.querySelector('#shopBuyButton')?.click()", { userGesture: true });
    await waitForExpression(page, "!document.querySelector('#shopConfirm')?.classList.contains('hidden')", timeoutMs);
    await evaluate(page, "document.querySelector('#shopConfirmYesButton')?.click()", { userGesture: true });
    await waitForExpression(page, "document.querySelector('#shopOverlay')?.classList.contains('hidden')", timeoutMs);

    const afterAction = await readMapActivitySnapshot(page);
    const afterGold = getSnapshotQuantity(afterAction, "gold");
    const afterPurchasedItem = getSnapshotQuantity(afterAction, expectedShopPurchaseItemId);
    assert(afterGold === beforeGold - selectedOffer.goldPrice, `Expected gold ${beforeGold - selectedOffer.goldPrice}, got ${afterGold}.`);
    assert(afterPurchasedItem === beforePurchasedItem + selectedOffer.amount, `Expected ${expectedShopPurchaseItemId} ${beforePurchasedItem + selectedOffer.amount}, got ${afterPurchasedItem}.`);
    assert(getHudNumber(afterAction, "gold") === afterGold, "Gold HUD did not match player inventory after shop purchase.");
    assert(getHudNumber(afterAction, expectedShopPurchaseItemId) === afterPurchasedItem, `${expectedShopPurchaseItemId} HUD did not match player inventory after shop purchase.`);
    assertNodeCompleted(afterAction, clickedStartNode.id);
    assert(afterAction.eventLogCount > beforeAction.eventLogCount, "Expected shop purchase to add event log entries.");

    await finishSmoke(page, tracker, {
      expectedVersion,
      origin,
      screenshotPath: options.screenshotPath,
      summary: {
        ...shopSummary,
        beforeAction,
        selectedOffer,
        afterAction,
      },
    });
    return;
  }

  if (startMode === "heal") {
    await waitForExpression(page, "!document.querySelector('#healOverlay')?.classList.contains('hidden')", timeoutMs);
    const beforeAction = await readMapActivitySnapshot(page);
    const healSummary = await evaluateJson(page, `(() => {
      return {
        appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
        legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
        clickedStartNode: ${JSON.stringify(clickedStartNode)},
        dialogLinkedAnswer: ${JSON.stringify(dialogLinkedAnswer)},
        heal: {
          visible: !document.querySelector("#healOverlay")?.classList.contains("hidden"),
          title: document.querySelector("#healTitle")?.textContent?.trim() || "",
          amountText: document.querySelector("#healAmountText")?.textContent?.trim() || "",
          currentHpText: document.querySelector("#healCurrentHpText")?.textContent?.trim() || "",
          dialogText: document.querySelector("#healDialogText")?.textContent?.trim() || "",
          applyButtonText: document.querySelector("#healApplyButton")?.textContent?.trim() || "",
          leaveButtonText: document.querySelector("#healLeaveButton")?.textContent?.trim() || "",
          hasImage: Boolean(document.querySelector("#healEventImage")?.getAttribute("src")),
          errorHidden: document.querySelector("#healErrorText")?.classList.contains("hidden") || false,
        },
      };
    })()`);
    assert(healSummary.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${healSummary.appVersion}.`);
    assert(healSummary.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
    assert(healSummary.heal.visible === true, "Expected first-level heal overlay to be visible.");
    assert(healSummary.heal.amountText.length > 0, "Expected heal amount text to render.");
    assert(healSummary.heal.currentHpText.length > 0, "Expected heal current HP text to render.");
    assert(healSummary.heal.dialogText.length > 0, "Expected heal dialog text to render.");
    assert(healSummary.heal.applyButtonText.length > 0, "Expected heal apply button text to render.");
    assert(healSummary.heal.leaveButtonText.length > 0, "Expected heal leave button text to render.");
    assert(healSummary.heal.hasImage === true, "Expected heal event image to render.");
    assert(healSummary.heal.errorHidden === true, "Expected heal error to be hidden initially.");
    assert(beforeAction.health.current === 50, `Expected prepared heal current HP 50, got ${beforeAction.health.current}.`);
    assert(beforeAction.health.max === 100, `Expected prepared heal max HP 100, got ${beforeAction.health.max}.`);
    const beforeGold = getSnapshotQuantity(beforeAction, "gold");

    await evaluate(page, "document.querySelector('#healApplyButton')?.click()", { userGesture: true });
    await waitForExpression(page, "document.querySelector('#healOverlay')?.classList.contains('hidden')", timeoutMs);

    const afterAction = await readMapActivitySnapshot(page);
    assert(afterAction.health.current === 75, `Expected heal to restore HP to 75, got ${afterAction.health.current}.`);
    assert(afterAction.health.max === 100, `Expected heal max HP to remain 100, got ${afterAction.health.max}.`);
    assert(getSnapshotQuantity(afterAction, "gold") === beforeGold, "Free first-level heal should not change gold.");
    assert(getHudHealth(afterAction).current === afterAction.health.current, "Health HUD did not match player state after healing.");
    assert(getHudHealth(afterAction).max === afterAction.health.max, "Health HUD max did not match player state after healing.");
    assertNodeCompleted(afterAction, clickedStartNode.id);
    assert(afterAction.eventLogCount > beforeAction.eventLogCount, "Expected heal to add event log entries.");

    await finishSmoke(page, tracker, {
      expectedVersion,
      origin,
      screenshotPath: options.screenshotPath,
      summary: {
        ...healSummary,
        beforeAction,
        afterAction,
      },
    });
    return;
  }

  if (startMode === "reward") {
    await waitForExpression(page, "!document.querySelector('#rewardOverlay')?.classList.contains('hidden')", timeoutMs);
    await waitForExpression(page, "document.querySelectorAll('#rewardItems .reward-item').length > 0", timeoutMs);
    const beforeAction = await readMapActivitySnapshot(page);
    const rewardSummary = await evaluateJson(page, `(() => {
      const items = [...document.querySelectorAll("#rewardItems .reward-item")];
      return {
        appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
        legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
        clickedStartNode: ${JSON.stringify(clickedStartNode)},
        dialogLinkedAnswer: ${JSON.stringify(dialogLinkedAnswer)},
        reward: {
          visible: !document.querySelector("#rewardOverlay")?.classList.contains("hidden"),
          choiceMode: document.querySelector("#rewardOverlay")?.classList.contains("reward-overlay--choice") || false,
          message: document.querySelector("#rewardDialogText")?.textContent?.trim() || "",
          claimText: document.querySelector("#rewardClaimButton")?.textContent?.trim() || "",
          claimDisabled: document.querySelector("#rewardClaimButton")?.disabled || false,
          items: items.map((item) => ({
            itemId: item.dataset.itemId || "",
            amount: Number(item.dataset.itemAmount || 0),
            text: item.textContent?.trim() || "",
            hasImage: Boolean(item.querySelector("img")),
            isMaxed: item.classList.contains("reward-item--maxed"),
          })),
        },
      };
    })()`);
    assert(rewardSummary.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${rewardSummary.appVersion}.`);
    assert(rewardSummary.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
    assert(rewardSummary.reward.visible === true, "Expected first-level reward overlay to be visible.");
    assert(rewardSummary.reward.choiceMode === false, "Expected map reward overlay, not level-up choice mode.");
    assert(rewardSummary.reward.message.length > 0, "Expected reward dialog text to render.");
    assert(rewardSummary.reward.claimText.length > 0, "Expected reward claim button text to render.");
    assert(rewardSummary.reward.claimDisabled === false, "Expected map reward claim button to be enabled.");
    assert(rewardSummary.reward.items.length > 0, "Expected at least one reward item to render.");
    for (const item of rewardSummary.reward.items) {
      assert(item.text.length > 0, "Expected reward item text to render.");
      assert(item.hasImage === true, "Expected reward item image to render.");
      assert(item.itemId.length > 0, "Expected reward item data-item-id to render.");
      assert(item.amount > 0, `Expected reward item ${item.itemId} to have a positive amount.`);
      assert(item.isMaxed === false, `Expected first-level reward item ${item.itemId} to be claimable.`);
    }

    await evaluate(page, "document.querySelector('#rewardClaimButton')?.click()", { userGesture: true });
    await waitForExpression(page, "document.querySelector('#rewardOverlay')?.classList.contains('hidden')", timeoutMs);

    const afterAction = await readMapActivitySnapshot(page);
    for (const item of rewardSummary.reward.items) {
      const beforeValue = getSnapshotRewardValue(beforeAction, item.itemId);
      const afterValue = getSnapshotRewardValue(afterAction, item.itemId);
      assert(afterValue === beforeValue + item.amount, `Expected ${item.itemId} reward to increase from ${beforeValue} to ${beforeValue + item.amount}, got ${afterValue}.`);
      assertHudMatchesRewardValue(afterAction, item.itemId, afterValue);
    }
    assertNodeCompleted(afterAction, clickedStartNode.id);
    assert(afterAction.eventLogCount > beforeAction.eventLogCount, "Expected reward claim to add event log entries.");

    await finishSmoke(page, tracker, {
      expectedVersion,
      origin,
      screenshotPath: options.screenshotPath,
      summary: {
        ...rewardSummary,
        beforeAction,
        afterAction,
      },
    });
    return;
  }

  await waitForExpression(page, "Boolean(document.querySelector('.battle-scaffold-overlay'))", timeoutMs);
  await waitForExpression(
    page,
    "document.querySelectorAll('.battle-scaffold-board .battle-scaffold-cell').length === 72",
    timeoutMs,
  );
  await waitForExpression(
    page,
    "document.querySelectorAll('.battle-scaffold-board .battle-cell-icon').length === 72",
    timeoutMs,
  );

  const summary = await evaluateJson(page, `(() => {
    const board = document.querySelector(".battle-scaffold-board");
    const context = globalThis.__wildwestDebug?.battle?.context || {};
    const request = context.request || {};
    const inventorySlots = [...document.querySelectorAll('.battle-scaffold-inventory-slot:not([data-item-id="bag"])')];
    const zeroQuantitySlots = inventorySlots.filter((slot) => slot.dataset.itemQuantity === "0");
    const missingSlots = inventorySlots.filter((slot) => slot.classList.contains("is-missing"));
    const missingIconImages = missingSlots.filter((slot) => Boolean(slot.querySelector("img"))).length;
    return {
      appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
      debugEnabled: globalThis.__wildwestDebug?.enabled === true,
      legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
      mapNodes: document.querySelectorAll("#mapBoard .map-node").length,
      clickedStartNode: ${JSON.stringify(clickedStartNode)},
      dialogLinkedAnswer: ${JSON.stringify(dialogLinkedAnswer)},
      battle: {
        enemyId: request.enemyId || "",
        enemyConfigUrl: request.enemyConfigUrl || "",
        seedName: request.seedName || "",
        traceVersion: context.battleTrace?.traceVersion || 0,
        traceMoves: Array.isArray(context.battleTrace?.moves) ? context.battleTrace.moves.length : -1,
        traceSeedName: context.battleTrace?.request?.seedName || "",
        traceInitialRows: context.battleTrace?.initialState?.board?.length || 0,
        traceInitialCols: context.battleTrace?.initialState?.board?.[0]?.length || 0,
        traceDownloadButton: Boolean(document.querySelector('[data-battle-log-action="download-trace"]')),
        title: document.querySelector(".battle-scaffold-enemy-title h2")?.textContent?.trim() || "",
        cells: board?.querySelectorAll(".battle-scaffold-cell").length || 0,
        icons: board?.querySelectorAll(".battle-cell-icon").length || 0,
        iconImages: board?.querySelectorAll(".battle-cell-icon img").length || 0,
        ariaColCount: board?.getAttribute("aria-colcount") || "",
        ariaRowCount: board?.getAttribute("aria-rowcount") || "",
        inventorySlots: inventorySlots.length,
        zeroQuantitySlots: zeroQuantitySlots.length,
        missingSlots: missingSlots.length,
        missingIconImages,
        shieldCountText: document.querySelector(".battle-scaffold-meter-shield-count")?.textContent?.trim() || "",
      },
    };
  })()`);

  assert(summary.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${summary.appVersion}.`);
  assert(summary.debugEnabled === true, "Expected window.__wildwestDebug to be enabled for browser smoke.");
  assert(summary.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
  const expectedEnemyId = clickedStartNode.eventType === "dialog" ? "test" : "easy_Foxy";
  const expectedEnemyConfig = `/${expectedEnemyId}.jsonc`;
  assert(summary.battle.enemyId === expectedEnemyId, `Expected first smoke battle enemy ${expectedEnemyId}, got ${summary.battle.enemyId}.`);
  assert(
    summary.battle.enemyConfigUrl.endsWith(expectedEnemyConfig) || summary.battle.enemyConfigUrl.endsWith(expectedEnemyConfig.slice(1)),
    `Expected ${expectedEnemyId} enemy config URL, got ${summary.battle.enemyConfigUrl}.`,
  );
  assert(
    summary.battle.seedName.includes("battle:WildWest:") && summary.battle.seedName.includes(`data/enemy/${expectedEnemyId}.jsonc`),
    `Unexpected battle seed name: ${summary.battle.seedName}.`,
  );
  assert(summary.battle.traceVersion === 1, `Expected battle trace version 1, got ${summary.battle.traceVersion}.`);
  assert(summary.battle.traceMoves === 0, `Expected empty battle trace at smoke start, got ${summary.battle.traceMoves} moves.`);
  assert(summary.battle.traceSeedName === summary.battle.seedName, "Battle trace seed name does not match BattleRequest seed name.");
  assert(summary.battle.traceInitialRows === 8, `Expected trace initial board height 8, got ${summary.battle.traceInitialRows}.`);
  assert(summary.battle.traceInitialCols === 9, `Expected trace initial board width 9, got ${summary.battle.traceInitialCols}.`);
  assert(summary.battle.traceDownloadButton === true, "Battle trace download button was not rendered.");
  assert(summary.battle.cells === 72, `Expected 72 battle cells, got ${summary.battle.cells}.`);
  assert(summary.battle.icons === 72, `Expected 72 battle icons, got ${summary.battle.icons}.`);
  assert(summary.battle.iconImages === 72, `Expected 72 battle icon images, got ${summary.battle.iconImages}.`);
  assert(summary.battle.ariaColCount === "9", `Expected board aria-colcount 9, got ${summary.battle.ariaColCount}.`);
  assert(summary.battle.ariaRowCount === "8", `Expected board aria-rowcount 8, got ${summary.battle.ariaRowCount}.`);
  if (expectedEnemyId === "test") {
    assert(summary.battle.shieldCountText === "10", `Expected test enemy shield count 10, got "${summary.battle.shieldCountText}".`);
  }
  assert(summary.battle.inventorySlots > 0, "Expected battle inventory slots to render.");
  assert(summary.battle.zeroQuantitySlots > 0, "Expected at least one zero-quantity inventory slot in smoke battle.");
  assert(
    summary.battle.missingSlots === summary.battle.zeroQuantitySlots,
    `Expected zero-quantity inventory slots to be marked is-missing, got ${summary.battle.missingSlots}/${summary.battle.zeroQuantitySlots}.`,
  );
  assert(
    summary.battle.missingIconImages === summary.battle.missingSlots,
    `Expected every missing inventory slot to keep a dimmable icon, got ${summary.battle.missingIconImages}/${summary.battle.missingSlots}.`,
  );

  const playedTraceMove = await evaluateJson(page, `(() => {
    const context = globalThis.__wildwestDebug?.battle?.context;
    if (!context?.engine || !context?.battleState?.board || !context?.request?.itemCatalog) {
      return { found: false, reason: "missing-context" };
    }
    const move = context.engine.findBattleAvailableMove(
      context.battleState.board,
      context.request.itemCatalog,
      {
        walls: context.battleState.walls,
        boxes: context.battleState.boxes,
        vines: context.battleState.vines,
      },
    );
    if (!move?.from || !move?.to) {
      return { found: false, reason: "no-move" };
    }
    const clickCell = (cell) => {
      const selector = '.battle-scaffold-cell[data-row="' + cell.row + '"][data-col="' + cell.col + '"]';
      const element = document.querySelector(selector);
      if (!element) {
        return false;
      }
      element.click();
      return true;
    };
    return {
      found: true,
      from: move.from,
      to: move.to,
      clicked: clickCell(move.from) && clickCell(move.to),
    };
  })()`, { userGesture: true });
  assert(playedTraceMove.found === true, `Could not find a trace move candidate: ${playedTraceMove.reason || "unknown"}.`);
  assert(playedTraceMove.clicked === true, "Could not click the trace move candidate cells.");
  await waitForExpression(
    page,
    "(globalThis.__wildwestDebug?.battle?.context?.battleTrace?.moves?.length || 0) >= 1"
      + " && !globalThis.__wildwestDebug?.battle?.context?.battleState?.isResolving",
    timeoutMs,
  );
  const traceMoveSummary = await evaluateJson(page, `(() => {
    const context = globalThis.__wildwestDebug?.battle?.context || {};
    const moves = context.battleTrace?.moves || [];
    const lastMove = moves[moves.length - 1] || {};
    return {
      count: moves.length,
      type: lastMove.type || "",
      accepted: lastMove.accepted,
      hasStateAfter: Boolean(lastMove.stateAfter?.board?.length),
    };
  })()`);
  assert(traceMoveSummary.count >= 1, "Battle trace did not record the smoke move.");
  assert(["swap", "battery"].includes(traceMoveSummary.type), `Unexpected smoke trace move type: ${traceMoveSummary.type}.`);
  assert(traceMoveSummary.accepted === true, "Smoke trace move was not recorded as accepted.");
  assert(traceMoveSummary.hasStateAfter === true, "Smoke trace move has no stateAfter board snapshot.");

  const resourceIssues = getResourceIssues(tracker.requestUrls, expectedVersion, origin);
  assert(resourceIssues.length === 0, `Unversioned project resources:\n${resourceIssues.join("\n")}`);
  assert(tracker.responseErrors.length === 0, `HTTP errors:\n${tracker.responseErrors.join("\n")}`);
  assert(tracker.failedRequests.length === 0, `Failed requests:\n${tracker.failedRequests.join("\n")}`);
  assert(tracker.pageErrors.length === 0, `Page errors:\n${tracker.pageErrors.join("\n")}`);
  assert(tracker.consoleMessages.length === 0, `Console warnings/errors:\n${tracker.consoleMessages.join("\n")}`);

  const screenshotPath = await captureScreenshot(page, options.screenshotPath);
  console.log(JSON.stringify({
    ok: true,
    summary,
    traceMove: traceMoveSummary,
    resources: {
      requests: tracker.requestUrls.length,
      unversionedProjectResources: resourceIssues.length,
      responseErrors: tracker.responseErrors.length,
      failedRequests: tracker.failedRequests.length,
    },
    screenshot: toProjectPath(screenshotPath),
  }, null, 2));
}

async function assertSmokeAudioVolume(page) {
  const settings = await evaluateJson(page, `(() => {
    const storedSettings = JSON.parse(localStorage.getItem(${JSON.stringify(smokeSettingsStorageKey)}) || "{}");
    return {
      musicVolume: storedSettings.musicVolume,
      soundVolume: storedSettings.soundVolume,
      musicInput: Number(document.querySelector("#musicVolumeInput")?.value),
      soundInput: Number(document.querySelector("#soundVolumeInput")?.value),
    };
  })()`);
  assert(
    settings.musicVolume === smokeAudioVolume &&
      settings.soundVolume === smokeAudioVolume &&
      settings.musicInput === smokeAudioVolume &&
      settings.soundInput === smokeAudioVolume,
    `Expected browser smoke audio volume to be ${smokeAudioVolume}, got stored music=${settings.musicVolume}, stored sound=${settings.soundVolume}, input music=${settings.musicInput}, input sound=${settings.soundInput}.`,
  );
}

async function runLevelUpActivitySmoke(page, options) {
  const { expectedVersion, timeoutMs } = options;
  const beforeAction = await readMapActivitySnapshot(page);
  assert(beforeAction.debugEnabled === true, "Expected debug mode to be enabled before level-up smoke.");
  assert(beforeAction.cheatsActive === true, "Expected cheats to be active before level-up smoke.");

  await typeText(page, "lvl");
  await waitForExpression(
    page,
    "!document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
      + " && document.querySelector('#rewardOverlay')?.classList.contains('reward-overlay--choice')"
      + " && document.querySelectorAll('#rewardItems .reward-item--choice').length > 0",
    timeoutMs,
  );

  const levelUpSummary = await evaluateJson(page, `(() => {
    const choices = [...document.querySelectorAll("#rewardItems .reward-item--choice")];
    return {
      appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
      legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
      levelUp: {
        visible: !document.querySelector("#rewardOverlay")?.classList.contains("hidden"),
        choiceMode: document.querySelector("#rewardOverlay")?.classList.contains("reward-overlay--choice") || false,
        message: document.querySelector("#rewardDialogText")?.textContent?.trim() || "",
        claimText: document.querySelector("#rewardClaimButton")?.textContent?.trim() || "",
        claimDisabled: document.querySelector("#rewardClaimButton")?.disabled || false,
        choices: choices.map((choice) => ({
          itemId: choice.dataset.itemId || "",
          amount: Number(choice.dataset.itemAmount || 0),
          disabled: choice.disabled || false,
          hasImage: Boolean(choice.querySelector("img")),
          text: choice.textContent?.trim() || "",
        })),
      },
    };
  })()`);
  assert(levelUpSummary.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${levelUpSummary.appVersion}.`);
  assert(levelUpSummary.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
  assert(levelUpSummary.levelUp.visible === true, "Expected level-up reward overlay to be visible.");
  assert(levelUpSummary.levelUp.choiceMode === true, "Expected level-up reward overlay to be in choice mode.");
  assert(levelUpSummary.levelUp.claimDisabled === true, "Expected level-up claim button to be disabled before selecting a reward.");
  assert(levelUpSummary.levelUp.choices.length > 0, "Expected level-up choices to render.");
  for (const choice of levelUpSummary.levelUp.choices) {
    assert(choice.itemId.length > 0, "Expected level-up choice data-item-id to render.");
    assert(choice.amount > 0, `Expected level-up choice ${choice.itemId} to have a positive amount.`);
    assert(choice.hasImage === true, `Expected level-up choice ${choice.itemId} to render an image.`);
    assert(choice.text.length > 0, `Expected level-up choice ${choice.itemId} text to render.`);
  }

  const selectedReward = await selectFirstLevelUpReward(page);
  assert(selectedReward, "Could not select a level-up reward.");
  await waitForExpression(page, "document.querySelector('#rewardClaimButton')?.disabled === false", timeoutMs);
  await evaluate(page, "document.querySelector('#rewardClaimButton')?.click()", { userGesture: true });
  await waitForExpression(page, "document.querySelector('#rewardOverlay')?.classList.contains('hidden')", timeoutMs);

  const afterAction = await readMapActivitySnapshot(page);
  assert(afterAction.experience.total > beforeAction.experience.total, "Expected level-up cheat to increase total experience.");
  assert(afterAction.experience.level >= beforeAction.experience.level, "Expected level-up cheat not to decrease player level.");
  const beforeValue = getSnapshotRewardValue(beforeAction, selectedReward.itemId);
  const afterValue = getSnapshotRewardValue(afterAction, selectedReward.itemId);
  assert(afterValue === beforeValue + selectedReward.amount, `Expected ${selectedReward.itemId} level-up reward to increase from ${beforeValue} to ${beforeValue + selectedReward.amount}, got ${afterValue}.`);
  assertHudMatchesRewardValue(afterAction, selectedReward.itemId, afterValue);

  return {
    ...levelUpSummary,
    clickedStartNode: options.clickedStartNode,
    dialogLinkedAnswer: options.dialogLinkedAnswer,
    beforeAction,
    selectedReward,
    afterAction,
  };
}

async function runSmokeTestMapSmoke(page, options) {
  // Full smoke использует отдельную линейную QA-карту. Это контракт на
  // end-to-end поведение активностей, а не просто проверка открытия overlay.
  const { expectedVersion, timeoutMs } = options;
  await waitForExpression(page, "globalThis.__wildwestDebug?.map?.state?.mapConfig?.id === 'SmokeTest'", timeoutMs);
  await waitForExpression(page, "document.querySelectorAll('#mapBoard .map-node').length === 8", timeoutMs);

  const initialSnapshot = await assertSmokeTestMapReady(page, expectedVersion);
  const steps = [];

  const dialogNode = await clickNextSmokeTestNode(page, "dialog_smoke", timeoutMs);
  const dialogSummary = await completeVisibleMapDialogEnd(page, timeoutMs);
  const afterDialog = await waitForSmokeNodeCompleted(page, dialogNode.id, timeoutMs);
  steps.push({
    eventName: dialogNode.eventName,
    nodeId: dialogNode.id,
    answers: dialogSummary.answers,
    completed: afterDialog.completedNodeIds.length,
  });

  const skipNode = await clickNextSmokeTestNode(page, "skip_smoke", timeoutMs);
  const skipSummary = await closeEventDialog(page, timeoutMs);
  const afterSkip = await waitForSmokeNodeCompleted(page, skipNode.id, timeoutMs);
  steps.push({
    eventName: skipNode.eventName,
    nodeId: skipNode.id,
    textLength: skipSummary.text.length,
    completed: afterSkip.completedNodeIds.length,
  });

  const shopNode = await clickNextSmokeTestNode(page, "shop_all", timeoutMs);
  const shopSummary = await runSmokeTestShopStep(page, shopNode, timeoutMs);
  steps.push(shopSummary);

  const healNode = await clickNextSmokeTestNode(page, "heal_paid", timeoutMs);
  const healSummary = await runSmokeTestHealStep(page, healNode, timeoutMs);
  steps.push(healSummary);

  const rewardNode = await clickNextSmokeTestNode(page, "reward_all", timeoutMs);
  const rewardSummary = await runSmokeTestRewardStep(page, rewardNode, timeoutMs);
  steps.push(rewardSummary);

  const battleNode = await clickNextSmokeTestNode(page, "battle_test", timeoutMs);
  const battleSummary = await runSmokeTestBattleStep(page, battleNode, {
    expectedEnemyId: "test",
    timeoutMs,
  });
  steps.push(battleSummary);

  const bossNode = await clickNextSmokeTestNode(page, "boss", timeoutMs);
  const bossSummary = await runSmokeTestBattleStep(page, bossNode, {
    expectedEnemyId: "boss_Fireman",
    timeoutMs,
  });
  steps.push(bossSummary);

  await waitForExpression(
    page,
    "globalThis.__wildwestDebug?.map?.state?.completedNodeIds?.size === 7"
      + " && globalThis.__wildwestDebug?.map?.state?.availableNodeIds?.size === 0"
      + " && document.querySelector('#eventDialog')?.open === true",
    timeoutMs,
  );
  const finalSnapshot = await readMapActivitySnapshot(page);
  assert(finalSnapshot.eventDialog.text.length > 0, "Expected SmokeTest completion dialog to contain text.");
  assert(finalSnapshot.completedNodeIds.length === smokeTestNodeEvents.length, `Expected ${smokeTestNodeEvents.length} completed SmokeTest nodes, got ${finalSnapshot.completedNodeIds.length}.`);
  assert(finalSnapshot.availableNodeIds.length === 0, "Expected SmokeTest to have no available nodes after completion.");

  return {
    appVersion: expectedVersion,
    smokeTest: {
      mapId: initialSnapshot.mapId,
      nodes: initialSnapshot.generatedNodes.map((node) => ({
        id: node.id,
        eventName: node.eventName,
        eventType: node.eventType,
      })),
      steps,
      final: summarizeMapSnapshot(finalSnapshot),
      victoryDialogOpen: finalSnapshot.eventDialog.open,
    },
  };
}

async function restartSmokeTestMap(page, options) {
  const { expectedVersion, pageUrl, timeoutMs } = options;
  await page.send("Page.navigate", { url: pageUrl });
  await waitForExpression(page, "document.readyState !== 'loading'", timeoutMs);
  await waitForExpression(
    page,
    `globalThis.__ROGUELITE_MATCH3_VERSION__ === ${JSON.stringify(expectedVersion)}`,
    timeoutMs,
  );
  await waitForExpression(
    page,
    "Boolean(document.querySelector('#smokeTestButton'))"
      + " && document.querySelector('#loadingOverlay')?.classList.contains('hidden')",
    timeoutMs,
  );
  await typeText(page, "iddqd");
  await waitForExpression(
    page,
    "!document.querySelector('#smokeTestButton')?.classList.contains('hidden')"
      + " && !document.querySelector('#smokeTestButton')?.disabled",
    timeoutMs,
  );
  await evaluate(page, "document.querySelector('#smokeTestButton').click()", { userGesture: true });
}

async function runSmokeTestLockpickSmoke(page, options) {
  const { expectedVersion, timeoutMs } = options;
  await waitForExpression(page, "globalThis.__wildwestDebug?.map?.state?.mapConfig?.id === 'SmokeTest'", timeoutMs);
  await waitForExpression(page, "document.querySelectorAll('#mapBoard .map-node').length === 8", timeoutMs);
  const initialSnapshot = await assertSmokeTestMapReady(page, expectedVersion);
  const initialKeyQuantity = getSnapshotQuantity(initialSnapshot, "item_key");
  assert(initialKeyQuantity === 5, `Expected five SmokeTest keys, got ${initialKeyQuantity}.`);

  const dialogNode = await clickNextSmokeTestNode(page, "dialog_lockpick_smoke", timeoutMs);
  await waitForExpression(page, "!document.querySelector('#mapDialogOverlay')?.classList.contains('hidden')", timeoutMs);
  await evaluate(page, "document.querySelector('#mapDialogOverlay')?.click()", { userGesture: true });
  await waitForExpression(
    page,
    "document.querySelector('#mapDialogAnswers')?.classList.contains('is-visible')"
      + " && document.querySelector('#mapDialogAnswers button[data-dialog-event-name=\"lockpick_smoke\"]')",
    timeoutMs,
  );
  const dialogAnswer = await evaluateJson(page, `(() => {
    const button = document.querySelector('#mapDialogAnswers button[data-dialog-event-name="lockpick_smoke"]');
    if (!button) {
      return null;
    }
    const result = {
      text: button.textContent?.trim() || "",
      eventName: button.dataset.dialogEventName || "",
    };
    button.click();
    return result;
  })()`, { userGesture: true });
  assert(dialogAnswer?.eventName === "lockpick_smoke", "Expected dialog to launch lockpick_smoke.");

  await waitForExpression(
    page,
    "!document.querySelector('#lockpickOverlay')?.classList.contains('hidden')"
      + " && document.querySelectorAll('#lockpickRings .lockpick-ring').length === 5",
    timeoutMs,
  );
  const opened = await evaluateJson(page, `(() => {
    const state = globalThis.__wildwestDebug?.map?.state;
    const session = state?.activeLockpickSession;
    return {
      ringCount: document.querySelectorAll("#lockpickRings .lockpick-ring").length,
      lives: document.querySelectorAll("#lockpickLives .lockpick-life").length,
      ringSizes: [...document.querySelectorAll("#lockpickRings .lockpick-ring")]
        .map((ring) => ring.style.getPropertyValue("--lockpick-ring-size")),
      selectorButtons: document.querySelectorAll("#lockpickSelectOuterButton, #lockpickSelectInnerButton").length,
      outerDisabled: document.querySelector("#lockpickSelectOuterButton")?.disabled === true,
      innerDisabled: document.querySelector("#lockpickSelectInnerButton")?.disabled === true,
      settingsPresent: Boolean(document.querySelector("#lockpickSettingsButton")),
      surrenderPresent: Boolean(document.querySelector("#lockpickSurrenderButton")),
      keyQuantity: Number((state?.playerState?.inventory || [])
        .find((entry) => entry.itemId === "item_key")?.quantity || 0),
      keyEnabled: !document.querySelector("#lockpickUseKeyButton")?.disabled,
      scrambleMoveCount: Number(session?.puzzle?.scrambleMoveCount || 0),
      shortestSolutionMoves: Number(session?.puzzle?.shortestSolutionMoves || 0),
      solutionExposed: Object.hasOwn(session?.puzzle || {}, "solutionActions"),
    };
  })()`);
  assert(opened.ringCount === 5, `Expected five lockpick rings, got ${opened.ringCount}.`);
  assert(opened.lives === 4, `Expected four reserve lockpicks, got ${opened.lives}.`);
  assert(opened.ringSizes.join("|") === "100%|85%|70%|55%|40%", `Unexpected lockpick ring sizes: ${opened.ringSizes.join(", ")}.`);
  assert(opened.selectorButtons === 2, `Expected two ring selector buttons, got ${opened.selectorButtons}.`);
  assert(opened.outerDisabled === true, "Outer selector must be disabled on the outermost ring.");
  assert(opened.innerDisabled === false, "Inner selector must be enabled on the outermost ring.");
  assert(opened.settingsPresent === false, "Lockpick overlay must not contain a settings button.");
  assert(opened.surrenderPresent === false, "Lockpick overlay must not contain a surrender button.");
  assert(opened.keyQuantity === initialKeyQuantity, "Opening lockpick must not consume a key.");
  assert(opened.keyEnabled === true, "Expected key button to be enabled.");
  assert(opened.scrambleMoveCount >= 9 && opened.scrambleMoveCount <= 18, "Unexpected lockpick scramble length.");
  assert(opened.shortestSolutionMoves >= 6, "Lockpick solution must require at least six safe moves.");
  assert(opened.solutionExposed === false, "Lockpick UI session must not expose the test solution.");

  const hitZones = await evaluateJson(page, `(() => {
    const state = globalThis.__wildwestDebug?.map?.state;
    const stage = document.querySelector("#lockpickRingStage");
    const rings = document.querySelector("#lockpickRings");
    const rect = rings.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    return [0.925, 0.775, 0.625, 0.475, 0.2].map((normalizedRadius) => {
      stage.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        clientX: centerX + radius * normalizedRadius,
        clientY: centerY,
      }));
      return state?.activeLockpickSession?.selectedRingIndex ?? -1;
    });
  })()`);
  assert(hitZones.join("|") === "0|1|2|3|4", `Lockpick hit zones selected unexpected rings: ${hitZones.join(", ")}.`);

  const selectionControls = await evaluateJson(page, `(() => {
    const session = globalThis.__wildwestDebug?.map?.state?.activeLockpickSession;
    const result = { buttons: [], keyboard: [] };
    document.querySelector("#lockpickSelectOuterButton")?.click();
    result.buttons.push(session?.selectedRingIndex ?? -1);
    document.querySelector("#lockpickSelectInnerButton")?.click();
    result.buttons.push(session?.selectedRingIndex ?? -1);
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyW", key: "w" }));
    result.keyboard.push(session?.selectedRingIndex ?? -1);
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyS", key: "s" }));
    result.keyboard.push(session?.selectedRingIndex ?? -1);
    result.outerDisabled = document.querySelector("#lockpickSelectOuterButton")?.disabled === true;
    result.innerDisabled = document.querySelector("#lockpickSelectInnerButton")?.disabled === true;
    return result;
  })()`, { userGesture: true });
  assert(selectionControls.buttons.join("|") === "3|4", `Selector buttons chose unexpected rings: ${selectionControls.buttons.join(", ")}.`);
  assert(selectionControls.keyboard.join("|") === "3|4", `W/S chose unexpected rings: ${selectionControls.keyboard.join(", ")}.`);
  assert(selectionControls.outerDisabled === false, "Outer selector must be enabled on the innermost ring.");
  assert(selectionControls.innerDisabled === true, "Inner selector must be disabled on the innermost ring.");

  const clockwiseKeyboard = await evaluateJson(page, `(() => {
    const session = globalThis.__wildwestDebug?.map?.state?.activeLockpickSession;
    const before = [...(session?.positions || [])];
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyD", key: "d" }));
    return { before, after: [...(session?.positions || [])], animating: session?.isAnimating === true };
  })()`, { userGesture: true });
  assert(clockwiseKeyboard.before.join("|") !== clockwiseKeyboard.after.join("|"), "D did not rotate the selected ring.");
  assert(clockwiseKeyboard.animating === true, "D rotation did not enter animation state.");
  await waitForExpression(
    page,
    "globalThis.__wildwestDebug?.map?.state?.activeLockpickSession?.isAnimating === false",
    timeoutMs,
  );

  const counterclockwiseKeyboard = await evaluateJson(page, `(() => {
    const session = globalThis.__wildwestDebug?.map?.state?.activeLockpickSession;
    const before = [...(session?.positions || [])];
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyA", key: "a" }));
    return { before, after: [...(session?.positions || [])], animating: session?.isAnimating === true };
  })()`, { userGesture: true });
  assert(counterclockwiseKeyboard.before.join("|") !== counterclockwiseKeyboard.after.join("|"), "A did not rotate the selected ring.");
  assert(counterclockwiseKeyboard.animating === true, "A rotation did not enter animation state.");
  await waitForExpression(
    page,
    "globalThis.__wildwestDebug?.map?.state?.activeLockpickSession?.isAnimating === false",
    timeoutMs,
  );

  await evaluate(page, "document.querySelector('#lockpickUseKeyButton')?.click()", { userGesture: true });
  await waitForExpression(
    page,
    "document.querySelector('#lockpickOverlay')?.classList.contains('hidden')"
      + " && !document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
      + ` && globalThis.__wildwestDebug?.map?.state?.completedNodeIds?.has(${JSON.stringify(dialogNode.id)}) === false`,
    timeoutMs,
  );
  const beforeClaim = await readMapActivitySnapshot(page);
  assert(getSnapshotQuantity(beforeClaim, "item_key") === initialKeyQuantity - 1, "Lockpick key was not consumed before reward claim.");
  assert(beforeClaim.availableNodeIds.includes(dialogNode.id), "Lockpick dialog node must remain available before reward claim.");
  const rewardItemCount = await evaluateJson(
    page,
    "document.querySelectorAll('#rewardItems .reward-item').length",
  );
  assert(rewardItemCount === 3, `Expected three lockpick reward entries, got ${rewardItemCount}.`);

  await evaluate(page, "document.querySelector('#rewardClaimButton')?.click()", { userGesture: true });
  const afterClaim = await waitForSmokeNodeCompleted(page, dialogNode.id, timeoutMs);
  assert(afterClaim.overlays.rewardHidden === true, "Lockpick reward overlay must close after claim.");
  assert(afterClaim.availableNodeIds.length === 1, `Expected one next node after lockpick claim, got ${afterClaim.availableNodeIds.length}.`);

  return {
    dialogNodeId: dialogNode.id,
    dialogAnswer,
    opened,
    hitZones,
    selectionControls,
    clockwiseKeyboard,
    counterclockwiseKeyboard,
    beforeClaim: summarizeMapSnapshot(beforeClaim),
    afterClaim: summarizeMapSnapshot(afterClaim),
  };
}

async function assertSmokeTestMapReady(page, expectedVersion) {
  const snapshot = await readMapActivitySnapshot(page);
  assert(snapshot.appVersion === expectedVersion, `Expected app version ${expectedVersion}, got ${snapshot.appVersion}.`);
  assert(snapshot.debugEnabled === true, "Expected debug mode for SmokeTest smoke.");
  assert(snapshot.cheatsActive === true, "Expected cheats to be active for SmokeTest smoke.");
  assert(snapshot.activeTestRun === true, "Expected SmokeTest to run as a test-run.");
  assert(snapshot.legacyContextExposed === false, "Legacy window.context/window.contex must not be exposed.");
  assert(snapshot.mapId === "SmokeTest", `Expected SmokeTest map id, got ${snapshot.mapId}.`);
  assert(snapshot.generatedNodes.length === smokeTestGeneratedNodeEvents.length, `Expected ${smokeTestGeneratedNodeEvents.length} SmokeTest nodes, got ${snapshot.generatedNodes.length}.`);
  const actualEvents = snapshot.generatedNodes.map((node) => node.eventName);
  const expectedEvents = [...smokeTestGeneratedNodeEvents].sort();
  assert(
    [...actualEvents].sort().join("|") === expectedEvents.join("|"),
    `Unexpected SmokeTest node set: ${actualEvents.join(", ")}.`,
  );
  assert(snapshot.availableNodeIds.length === 2, `Expected two initial SmokeTest nodes, got ${snapshot.availableNodeIds.length}.`);
  const availableEvents = snapshot.generatedNodes
    .filter((node) => snapshot.availableNodeIds.includes(node.id))
    .map((node) => node.eventName)
    .sort();
  assert(
    availableEvents.join("|") === ["dialog_lockpick_smoke", "dialog_smoke"].sort().join("|"),
    `Unexpected SmokeTest starting events: ${availableEvents.join(", ")}.`,
  );
  return snapshot;
}

async function clickNextSmokeTestNode(page, expectedEventName, timeoutMs) {
  await waitForExpression(page, "globalThis.__wildwestDebug?.map?.state?.availableNodeIds?.size > 0", timeoutMs);
  const clickedNode = await evaluateJson(page, `(() => {
    const state = globalThis.__wildwestDebug?.map?.state;
    const availableIds = [...(state?.availableNodeIds || [])];
    const nodes = (state?.generatedMap?.levels || []).flatMap((level) => level.nodes || []);
    const node = nodes.find((item) => availableIds.includes(item.id) && item.eventName === ${JSON.stringify(expectedEventName)});
    if (!node) {
      return null;
    }
    const button = [...document.querySelectorAll("#mapBoard .map-node")]
      .find((item) => item.dataset.nodeId === node.id);
    if (!button || button.disabled) {
      return null;
    }
    const result = {
      id: node.id || "",
      level: Number(node.level || 0),
      eventName: node.eventName || "",
      eventType: node.eventType || "",
      connectedTo: Array.isArray(node.connectedTo) ? [...node.connectedTo] : [],
    };
    button.click();
    return result;
  })()`, { userGesture: true });
  assert(clickedNode, `Could not click next SmokeTest node ${expectedEventName}.`);
  assert(
    clickedNode.eventName === expectedEventName,
    `Expected next SmokeTest node ${expectedEventName}, got ${clickedNode.eventName}.`,
  );
  return clickedNode;
}

async function completeVisibleMapDialogEnd(page, timeoutMs) {
  await waitForExpression(page, "!document.querySelector('#mapDialogOverlay')?.classList.contains('hidden')", timeoutMs);
  await evaluate(page, "document.querySelector('#mapDialogOverlay')?.click()", { userGesture: true });
  await waitForExpression(
    page,
    "document.querySelector('#mapDialogAnswers')?.classList.contains('is-visible')"
      + " && document.querySelector('#mapDialogAnswers button[data-dialog-end=\"true\"]')",
    timeoutMs,
  );
  const summary = await evaluateJson(page, `(() => {
    const answers = [...document.querySelectorAll("#mapDialogAnswers button")].map((button) => ({
      text: button.textContent?.trim() || "",
      eventName: button.dataset.dialogEventName || "",
      end: button.dataset.dialogEnd === "true",
    }));
    const button = document.querySelector('#mapDialogAnswers button[data-dialog-end="true"]');
    button?.click();
    return {
      textLength: document.querySelector("#mapDialogText")?.textContent?.trim().length || 0,
      answers,
    };
  })()`, { userGesture: true });
  assert(summary.answers.some((answer) => answer.end), "Expected SmokeTest dialog to expose an end answer.");
  await waitForExpression(page, "document.querySelector('#mapDialogOverlay')?.classList.contains('hidden')", timeoutMs);
  return summary;
}

async function closeEventDialog(page, timeoutMs) {
  await waitForExpression(page, "document.querySelector('#eventDialog')?.open === true", timeoutMs);
  const summary = await evaluateJson(page, `(() => {
    const dialog = document.querySelector("#eventDialog");
    const result = {
      text: document.querySelector("#eventDialogText")?.textContent?.trim() || "",
    };
    dialog?.querySelector("button")?.click();
    return result;
  })()`, { userGesture: true });
  assert(summary.text.length > 0, "Expected event dialog text to render.");
  await waitForExpression(page, "document.querySelector('#eventDialog')?.open !== true", timeoutMs);
  return summary;
}

async function runSmokeTestShopStep(page, node, timeoutMs) {
  // На SmokeTest магазине покупаем все offer'ы сразу: проверяем amount, цену,
  // списание gold, HUD и завершение node одним сценарием.
  await waitForExpression(page, "!document.querySelector('#shopOverlay')?.classList.contains('hidden')", timeoutMs);
  await waitForExpression(
    page,
    `document.querySelectorAll('#shopItems .shop-item-card').length === ${smokeTestShopItemIds.length}`,
    timeoutMs,
  );
  const beforeAction = await readMapActivitySnapshot(page);
  const offers = await clickAllPurchasableShopOffers(page);
  assert(offers.length === smokeTestShopItemIds.length, `Expected ${smokeTestShopItemIds.length} SmokeTest shop offers, got ${offers.length}.`);
  const offerIds = offers.map((offer) => offer.itemId).sort();
  const expectedIds = [...smokeTestShopItemIds].sort();
  assert(offerIds.join("|") === expectedIds.join("|"), `Unexpected SmokeTest shop offers: ${offerIds.join(", ")}.`);
  for (const offer of offers) {
    assert(offer.amount === smokeTestShopOfferAmount, `Expected ${offer.itemId} amount ${smokeTestShopOfferAmount}, got ${offer.amount}.`);
    assert(offer.goldPrice === 5, `Expected ${offer.itemId} price 5, got ${offer.goldPrice}.`);
  }

  const total = offers.reduce((sum, offer) => sum + offer.goldPrice, 0);
  await waitForExpression(page, "document.querySelector('#shopBuyButton')?.disabled === false", timeoutMs);
  await evaluate(page, "document.querySelector('#shopBuyButton')?.click()", { userGesture: true });
  await waitForExpression(page, "!document.querySelector('#shopConfirm')?.classList.contains('hidden')", timeoutMs);
  await evaluate(page, "document.querySelector('#shopConfirmYesButton')?.click()", { userGesture: true });
  await waitForExpression(page, "document.querySelector('#shopOverlay')?.classList.contains('hidden')", timeoutMs);

  const afterAction = await waitForSmokeNodeCompleted(page, node.id, timeoutMs);
  const beforeGold = getSnapshotQuantity(beforeAction, "gold");
  const afterGold = getSnapshotQuantity(afterAction, "gold");
  assert(afterGold === beforeGold - total, `Expected SmokeTest shop gold ${beforeGold - total}, got ${afterGold}.`);
  assert(getHudNumber(afterAction, "gold") === afterGold, "Gold HUD did not match player inventory after SmokeTest shop.");
  for (const offer of offers) {
    const beforeValue = getSnapshotQuantity(beforeAction, offer.itemId);
    const afterValue = getSnapshotQuantity(afterAction, offer.itemId);
    assert(afterValue === beforeValue + offer.amount, `Expected ${offer.itemId} to increase from ${beforeValue} to ${beforeValue + offer.amount}, got ${afterValue}.`);
    assert(getHudNumber(afterAction, offer.itemId) === afterValue, `${offer.itemId} HUD did not match player inventory after SmokeTest shop.`);
  }
  assert(afterAction.eventLogCount > beforeAction.eventLogCount, "Expected SmokeTest shop to add event log entries.");

  return {
    eventName: node.eventName,
    nodeId: node.id,
    purchased: offers.map((offer) => offer.itemId),
    total,
    before: summarizeMapSnapshot(beforeAction),
    after: summarizeMapSnapshot(afterAction),
  };
}

async function clickAllPurchasableShopOffers(page) {
  const offers = [];
  for (;;) {
    const clickedOffer = await evaluateJson(page, `(() => {
      const card = [...document.querySelectorAll("#shopItems .shop-item-card")]
        .find((item) =>
          item.dataset.inventoryLimitBlocked !== "true"
          && !item.classList.contains("selected")
          && !item.querySelector("button")?.disabled
        );
      if (!card) {
        return null;
      }
      const button = card.querySelector("button");
      const result = {
        itemId: card.dataset.itemId || "",
        amount: Number(card.dataset.itemAmount || 0),
        goldPrice: Number(card.dataset.goldPrice || 0),
      };
      button.click();
      return result;
    })()`, { userGesture: true });
    if (!clickedOffer) {
      break;
    }
    offers.push(clickedOffer);
    await delay(20);
  }
  return offers;
}

async function runSmokeTestHealStep(page, node, timeoutMs) {
  await waitForExpression(page, "!document.querySelector('#healOverlay')?.classList.contains('hidden')", timeoutMs);
  const beforeAction = await readMapActivitySnapshot(page);
  const beforeGold = getSnapshotQuantity(beforeAction, "gold");
  const expectedHealAmount = beforeAction.health.max;
  const expectedHealth = Math.min(beforeAction.health.max, beforeAction.health.current + expectedHealAmount);

  await evaluate(page, "document.querySelector('#healApplyButton')?.click()", { userGesture: true });
  await waitForExpression(page, "document.querySelector('#healOverlay')?.classList.contains('hidden')", timeoutMs);
  const afterAction = await waitForSmokeNodeCompleted(page, node.id, timeoutMs);

  assert(afterAction.health.current === expectedHealth, `Expected SmokeTest heal HP ${expectedHealth}, got ${afterAction.health.current}.`);
  assert(afterAction.health.max === beforeAction.health.max, "SmokeTest heal should not change max HP.");
  assert(getSnapshotQuantity(afterAction, "gold") === beforeGold - 40, `Expected SmokeTest heal to cost 40 gold.`);
  assert(getHudHealth(afterAction).current === afterAction.health.current, "Health HUD did not match player state after SmokeTest heal.");
  assert(getHudHealth(afterAction).max === afterAction.health.max, "Health HUD max did not match player state after SmokeTest heal.");
  assert(afterAction.eventLogCount > beforeAction.eventLogCount, "Expected SmokeTest heal to add event log entries.");

  return {
    eventName: node.eventName,
    nodeId: node.id,
    healAmount: expectedHealAmount,
    goldSpent: 40,
    before: summarizeMapSnapshot(beforeAction),
    after: summarizeMapSnapshot(afterAction),
  };
}

async function runSmokeTestRewardStep(page, node, timeoutMs) {
  await waitForExpression(
    page,
    "!document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
      + " && !document.querySelector('#rewardOverlay')?.classList.contains('reward-overlay--choice')",
    timeoutMs,
  );
  const claimSummary = await claimVisibleMapReward(page, timeoutMs);
  const afterAction = await waitForSmokeNodeCompleted(page, node.id, timeoutMs);
  return {
    eventName: node.eventName,
    nodeId: node.id,
    reward: claimSummary.reward.items,
    levelUps: claimSummary.levelUps,
    before: claimSummary.before,
    afterReward: claimSummary.afterReward,
    after: summarizeMapSnapshot(afterAction),
  };
}

async function runSmokeTestBattleStep(page, node, options) {
  const { expectedEnemyId, timeoutMs } = options;
  await waitForExpression(page, "Boolean(document.querySelector('.battle-scaffold-overlay'))", timeoutMs);
  await waitForExpression(
    page,
    "document.querySelectorAll('.battle-scaffold-board .battle-scaffold-cell').length === 72"
      + " && document.querySelectorAll('.battle-scaffold-board .battle-cell-icon').length === 72",
    timeoutMs,
  );
  const battleSummary = await evaluateJson(page, `(() => {
    const context = globalThis.__wildwestDebug?.battle?.context || {};
    const request = context.request || {};
    return {
      enemyId: request.enemyId || "",
      enemyConfigUrl: request.enemyConfigUrl || "",
      seedName: request.seedName || "",
      cells: document.querySelectorAll(".battle-scaffold-board .battle-scaffold-cell").length,
      icons: document.querySelectorAll(".battle-scaffold-board .battle-cell-icon").length,
      traceVersion: context.battleTrace?.traceVersion || 0,
    };
  })()`);
  assert(battleSummary.enemyId === expectedEnemyId, `Expected SmokeTest battle enemy ${expectedEnemyId}, got ${battleSummary.enemyId}.`);
  assert(battleSummary.enemyConfigUrl.endsWith(`/data/enemy/${expectedEnemyId}.jsonc`) || battleSummary.enemyConfigUrl.endsWith(`/enemy/${expectedEnemyId}.jsonc`) || battleSummary.enemyConfigUrl.endsWith(`${expectedEnemyId}.jsonc`), `Unexpected SmokeTest enemy config URL: ${battleSummary.enemyConfigUrl}.`);
  assert(battleSummary.seedName.includes(`battle:SmokeTest:${node.id}:data/enemy/${expectedEnemyId}.jsonc`), `Unexpected SmokeTest battle seed name: ${battleSummary.seedName}.`);
  assert(battleSummary.cells === 72, `Expected 72 SmokeTest battle cells, got ${battleSummary.cells}.`);
  assert(battleSummary.icons === 72, `Expected 72 SmokeTest battle icons, got ${battleSummary.icons}.`);
  assert(battleSummary.traceVersion === 1, `Expected SmokeTest battle trace version 1, got ${battleSummary.traceVersion}.`);

  await typeText(page, "win");
  await waitForExpression(
    page,
    "!document.querySelector('.battle-scaffold-overlay')"
      + " && !document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
      + " && !document.querySelector('#rewardOverlay')?.classList.contains('reward-overlay--choice')",
    timeoutMs,
  );
  const claimSummary = await claimVisibleMapReward(page, timeoutMs);
  const afterAction = await waitForSmokeNodeCompleted(page, node.id, timeoutMs);
  assert(afterAction.eventLogCount > claimSummary.before.eventLogCount, "Expected SmokeTest battle reward to add event log entries.");

  return {
    eventName: node.eventName,
    nodeId: node.id,
    battle: battleSummary,
    reward: claimSummary.reward.items,
    levelUps: claimSummary.levelUps,
    before: claimSummary.before,
    afterReward: claimSummary.afterReward,
    after: summarizeMapSnapshot(afterAction),
  };
}

async function claimVisibleMapReward(page, timeoutMs) {
  await waitForExpression(
    page,
    "!document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
      + " && !document.querySelector('#rewardOverlay')?.classList.contains('reward-overlay--choice')"
      + " && document.querySelectorAll('#rewardItems .reward-item').length > 0",
    timeoutMs,
  );
  const beforeAction = await readMapActivitySnapshot(page);
  const reward = await readRewardOverlaySummary(page);
  assert(reward.hidden === false, "Expected map reward overlay to be visible.");
  assert(reward.choiceMode === false, "Expected map reward overlay, not level-up choice mode.");
  assert(reward.claimDisabled === false, "Expected map reward claim button to be enabled.");
  assert(reward.items.length > 0, "Expected map reward to render items.");
  for (const item of reward.items) {
    assert(item.itemId.length > 0, "Expected reward data-item-id to render.");
    assert(item.amount > 0, `Expected reward ${item.itemId} to have a positive amount.`);
    assert(item.hasImage === true, `Expected reward ${item.itemId} to render an image.`);
  }

  await evaluate(page, "document.querySelector('#rewardClaimButton')?.click()", { userGesture: true });
  await waitForExpression(page, "globalThis.__wildwestDebug?.map?.state?.pendingReward === null", timeoutMs);
  const afterReward = await readMapActivitySnapshot(page);
  assertRewardItemsApplied(beforeAction, afterReward, reward.items);
  const levelUps = await resolveVisibleLevelUpChoices(page, timeoutMs);
  const afterAction = await readMapActivitySnapshot(page);

  return {
    reward,
    levelUps,
    before: summarizeMapSnapshot(beforeAction),
    afterReward: summarizeMapSnapshot(afterReward),
    after: summarizeMapSnapshot(afterAction),
  };
}

async function resolveVisibleLevelUpChoices(page, timeoutMs) {
  const resolved = [];
  for (let guard = 0; guard < 8; guard += 1) {
    const overlay = await readRewardOverlaySummary(page);
    if (overlay.hidden || !overlay.choiceMode) {
      return resolved;
    }
    assert(overlay.items.length > 0, "Expected level-up choices to render.");
    const beforeAction = await readMapActivitySnapshot(page);
    const selectedReward = await selectFirstLevelUpReward(page);
    assert(selectedReward, "Could not select SmokeTest level-up reward.");
    await waitForExpression(page, "document.querySelector('#rewardClaimButton')?.disabled === false", timeoutMs);
    await evaluate(page, "document.querySelector('#rewardClaimButton')?.click()", { userGesture: true });
    await waitForExpression(
      page,
      "document.querySelector('#rewardOverlay')?.classList.contains('hidden')"
        + " || document.querySelector('#rewardOverlay')?.classList.contains('reward-overlay--choice')",
      timeoutMs,
    );
    const afterAction = await readMapActivitySnapshot(page);
    const beforeValue = getSnapshotRewardValue(beforeAction, selectedReward.itemId);
    const afterValue = getSnapshotRewardValue(afterAction, selectedReward.itemId);
    assert(afterValue === beforeValue + selectedReward.amount, `Expected ${selectedReward.itemId} level-up reward to increase from ${beforeValue} to ${beforeValue + selectedReward.amount}, got ${afterValue}.`);
    assertHudMatchesRewardValue(afterAction, selectedReward.itemId, afterValue);
    resolved.push({
      selectedReward,
      before: summarizeMapSnapshot(beforeAction),
      after: summarizeMapSnapshot(afterAction),
    });
  }
  throw new Error("Too many consecutive SmokeTest level-up overlays.");
}

async function readRewardOverlaySummary(page) {
  return evaluateJson(page, `(() => {
    const overlay = document.querySelector("#rewardOverlay");
    return {
      hidden: overlay?.classList.contains("hidden") !== false,
      choiceMode: overlay?.classList.contains("reward-overlay--choice") || false,
      message: document.querySelector("#rewardDialogText")?.textContent?.trim() || "",
      claimDisabled: document.querySelector("#rewardClaimButton")?.disabled || false,
      items: [...document.querySelectorAll("#rewardItems .reward-item")].map((item) => ({
        itemId: item.dataset.itemId || "",
        amount: Number(item.dataset.itemAmount || 0),
        index: Number(item.dataset.rewardIndex || 0),
        choice: item.classList.contains("reward-item--choice"),
        disabled: item.disabled || false,
        hasImage: Boolean(item.querySelector("img")),
        isMaxed: item.classList.contains("reward-item--maxed"),
        text: item.textContent?.trim() || "",
      })),
    };
  })()`);
}

async function waitForSmokeNodeCompleted(page, nodeId, timeoutMs) {
  await waitForExpression(
    page,
    `globalThis.__wildwestDebug?.map?.state?.completedNodeIds?.has(${JSON.stringify(nodeId)}) === true`,
    timeoutMs,
  );
  const snapshot = await readMapActivitySnapshot(page);
  assertNodeCompleted(snapshot, nodeId);
  return snapshot;
}

function assertRewardItemsApplied(beforeSnapshot, afterSnapshot, items) {
  for (const item of items) {
    const beforeValue = getSnapshotRewardValue(beforeSnapshot, item.itemId);
    const afterValue = getSnapshotRewardValue(afterSnapshot, item.itemId);
    const expectedValue = getExpectedRewardValueAfterReward(beforeSnapshot, item);
    assert(afterValue === expectedValue, `Expected ${item.itemId} reward to change from ${beforeValue} to ${expectedValue}, got ${afterValue}.`);
    assertHudMatchesRewardValue(afterSnapshot, item.itemId, expectedValue);
  }
}

function getExpectedRewardValueAfterReward(snapshot, item) {
  const beforeValue = getSnapshotRewardValue(snapshot, item.itemId);
  if (item.itemId === "health") {
    return Math.min(Number(snapshot?.health?.max) || 0, beforeValue + item.amount);
  }
  return beforeValue + item.amount;
}

function summarizeMapSnapshot(snapshot) {
  return {
    currentNodeId: snapshot.currentNodeId,
    completed: snapshot.completedNodeIds.length,
    available: snapshot.availableNodeIds.length,
    health: snapshot.health,
    experience: snapshot.experience,
    gold: getSnapshotQuantity(snapshot, "gold"),
    eventLogCount: snapshot.eventLogCount,
  };
}

async function finishSmoke(page, tracker, options) {
  const { expectedVersion, origin, screenshotPath: requestedScreenshotPath, summary } = options;
  const resourceIssues = getResourceIssues(tracker.requestUrls, expectedVersion, origin);
  assert(resourceIssues.length === 0, `Unversioned project resources:\n${resourceIssues.join("\n")}`);
  assert(tracker.responseErrors.length === 0, `HTTP errors:\n${tracker.responseErrors.join("\n")}`);
  assert(tracker.failedRequests.length === 0, `Failed requests:\n${tracker.failedRequests.join("\n")}`);
  assert(tracker.pageErrors.length === 0, `Page errors:\n${tracker.pageErrors.join("\n")}`);
  assert(tracker.consoleMessages.length === 0, `Console warnings/errors:\n${tracker.consoleMessages.join("\n")}`);

  const screenshotPath = await captureScreenshot(page, requestedScreenshotPath);
  console.log(JSON.stringify({
    ok: true,
    summary,
    resources: {
      requests: tracker.requestUrls.length,
      unversionedProjectResources: resourceIssues.length,
      responseErrors: tracker.responseErrors.length,
      failedRequests: tracker.failedRequests.length,
    },
    screenshot: toProjectPath(screenshotPath),
  }, null, 2));
}

async function readMapActivitySnapshot(page) {
  return evaluateJson(page, `(() => {
    const debugState = globalThis.__wildwestDebug?.map?.state || null;
    const playerState = debugState?.playerState || {};
    const generatedNodes = (debugState?.generatedMap?.levels || [])
      .flatMap((level) => (level.nodes || []).map((node) => ({
        id: node.id || "",
        level: Number(node.level || level.level || 0),
        eventName: node.eventName || "",
        eventType: node.eventType || "",
        connectedTo: Array.isArray(node.connectedTo) ? [...node.connectedTo] : [],
      })));
    const inventory = Object.fromEntries(
      (Array.isArray(playerState.inventory) ? playerState.inventory : [])
        .map((entry) => [entry.itemId, Number(entry.quantity) || 0]),
    );
    const hud = Object.fromEntries(
      [...document.querySelectorAll("#mapHud .hud-item[data-item-id]")]
        .map((item) => [
          item.dataset.itemId || "",
          {
            value: item.dataset.hudValue || item.querySelector("span")?.textContent?.trim() || "",
            text: item.textContent?.trim() || "",
          },
        ])
        .filter(([itemId]) => itemId),
    );
    const toArray = (value) => {
      if (value instanceof Set) {
        return [...value];
      }
      return Array.isArray(value) ? value : [];
    };
    return {
      appVersion: globalThis.__ROGUELITE_MATCH3_VERSION__ || "",
      debugEnabled: globalThis.__wildwestDebug?.enabled === true,
      legacyContextExposed: Object.hasOwn(globalThis, "context") || Object.hasOwn(globalThis, "contex"),
      cheatsActive: debugState?.cheatsActive === true,
      activeTestRun: debugState?.activeTestRun === true,
      mapId: debugState?.mapConfig?.id || "",
      currentNodeId: debugState?.currentNodeId || "",
      completedNodeIds: toArray(debugState?.completedNodeIds),
      availableNodeIds: toArray(debugState?.availableNodeIds),
      generatedNodes,
      health: {
        current: Number(playerState.health?.current) || 0,
        max: Number(playerState.health?.max) || 0,
      },
      experience: {
        level: Number(playerState.experience?.level) || 0,
        total: Number(playerState.experience?.total) || 0,
      },
      inventory,
      hud,
      eventLogCount: document.querySelectorAll("#eventLog li").length,
      overlays: {
        rewardHidden: document.querySelector("#rewardOverlay")?.classList.contains("hidden") || false,
        shopHidden: document.querySelector("#shopOverlay")?.classList.contains("hidden") || false,
        healHidden: document.querySelector("#healOverlay")?.classList.contains("hidden") || false,
      },
      eventDialog: {
        open: document.querySelector("#eventDialog")?.open === true,
        text: document.querySelector("#eventDialogText")?.textContent?.trim() || "",
      },
      mapNodes: [...document.querySelectorAll("#mapBoard .map-node")].map((node) => ({
        id: node.dataset.nodeId || "",
        completed: node.classList.contains("completed"),
        available: node.classList.contains("available"),
        disabled: node.disabled || false,
        className: node.className,
      })),
    };
  })()`);
}

async function clickShopOffer(page, itemId) {
  return evaluateJson(page, `(() => {
    const card = [...document.querySelectorAll("#shopItems .shop-item-card")]
      .find((item) => item.dataset.itemId === ${JSON.stringify(itemId)});
    const button = card?.querySelector("button");
    if (!card || !button || button.disabled) {
      return null;
    }
    const result = {
      itemId: card.dataset.itemId || "",
      amount: Number(card.dataset.itemAmount || 0),
      goldPrice: Number(card.dataset.goldPrice || 0),
    };
    button.click();
    return result;
  })()`, { userGesture: true });
}

async function selectFirstLevelUpReward(page) {
  return evaluateJson(page, `(() => {
    const choice = [...document.querySelectorAll("#rewardItems .reward-item--choice")]
      .find((item) => !item.disabled);
    if (!choice) {
      return null;
    }
    const result = {
      itemId: choice.dataset.itemId || "",
      amount: Number(choice.dataset.itemAmount || 0),
      index: Number(choice.dataset.rewardIndex || 0),
    };
    choice.click();
    return result;
  })()`, { userGesture: true });
}

async function setDebugPlayerHealth(page, health) {
  const result = await evaluateJson(page, `(() => {
    const state = globalThis.__wildwestDebug?.map?.state;
    if (!state?.playerState?.health) {
      return null;
    }
    state.playerState.health.baseMax = ${JSON.stringify(health.max)};
    state.playerState.health.max = ${JSON.stringify(health.max)};
    state.playerState.health.current = ${JSON.stringify(health.current)};
    return {
      current: state.playerState.health.current,
      max: state.playerState.health.max,
    };
  })()`);
  assert(result, "Could not prepare player health through debug map state.");
  assert(result.current === health.current, `Expected prepared current HP ${health.current}, got ${result.current}.`);
  assert(result.max === health.max, `Expected prepared max HP ${health.max}, got ${result.max}.`);
}

async function typeText(page, text) {
  for (const character of text) {
    const keyCode = character.length === 1 ? character.toUpperCase().charCodeAt(0) : 0;
    await page.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: character,
      text: character,
      unmodifiedText: character,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await page.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: character,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await delay(20);
  }
}

function getSnapshotQuantity(snapshot, itemId) {
  return Number(snapshot?.inventory?.[itemId]) || 0;
}

function getSnapshotRewardValue(snapshot, itemId) {
  if (itemId === "health") {
    return Number(snapshot?.health?.current) || 0;
  }
  if (itemId === "exp") {
    return Number(snapshot?.experience?.total) || 0;
  }
  return getSnapshotQuantity(snapshot, itemId);
}

function getHudNumber(snapshot, itemId) {
  const value = snapshot?.hud?.[itemId]?.value;
  if (value === undefined) {
    return 0;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getHudHealth(snapshot) {
  const value = String(snapshot?.hud?.health?.value || "");
  const match = value.match(/^(\d+)\/(\d+)$/);
  return {
    current: match ? Number(match[1]) : 0,
    max: match ? Number(match[2]) : 0,
  };
}

function assertHudMatchesRewardValue(snapshot, itemId, expectedValue) {
  if (itemId === "health") {
    assert(getHudHealth(snapshot).current === expectedValue, `Expected health HUD current ${expectedValue}.`);
    return;
  }
  if (itemId === "exp") {
    assert(getHudNumber(snapshot, "exp") === expectedValue, `Expected experience HUD total ${expectedValue}.`);
    return;
  }
  assert(getHudNumber(snapshot, itemId) === expectedValue, `Expected ${itemId} HUD value ${expectedValue}.`);
}

function assertNodeCompleted(snapshot, nodeId) {
  assert(snapshot.completedNodeIds.includes(nodeId), `Expected node ${nodeId} to be completed in map state.`);
  const node = snapshot.mapNodes.find((item) => item.id === nodeId);
  assert(node?.completed === true, `Expected node ${nodeId} to have completed DOM class.`);
}

function createRuntimeTracker(cdp, sessionId) {
  const tracker = {
    consoleMessages: [],
    failedRequests: [],
    pageErrors: [],
    requestUrls: [],
    responseErrors: [],
  };

  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    const type = event.params?.type || "";
    if (!["error", "warning"].includes(type)) {
      return;
    }
    const argsText = (event.params?.args || [])
      .map((arg) => arg.value ?? arg.description ?? "")
      .filter(Boolean)
      .join(" ");
    tracker.consoleMessages.push(`${type}: ${argsText}`);
  });

  cdp.on("Runtime.exceptionThrown", (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    const details = event.params?.exceptionDetails;
    tracker.pageErrors.push(details?.text || details?.exception?.description || "Runtime exception");
  });

  cdp.on("Network.requestWillBeSent", (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    const url = event.params?.request?.url;
    if (url) {
      tracker.requestUrls.push(url);
    }
  });

  cdp.on("Network.responseReceived", (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    const response = event.params?.response;
    if (response?.status >= 400) {
      tracker.responseErrors.push(`${response.status} ${response.url}`);
    }
  });

  cdp.on("Network.loadingFailed", (event) => {
    if (event.sessionId !== sessionId) {
      return;
    }
    if (event.params?.canceled) {
      return;
    }
    tracker.failedRequests.push(`${event.params?.errorText || "failed"} ${event.params?.requestId || ""}`.trim());
  });

  return tracker;
}

async function createPageSession(cdp, pageUrl) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = {
    sessionId,
    async send(method, params = {}) {
      return cdp.send(method, params, sessionId);
    },
  };
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Network.enable");
  await page.send("Log.enable");
  await installSmokeRuntimeDefaults(page);
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: defaultViewport.width,
    height: defaultViewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send("Page.bringToFront");
  await page.send("Page.navigate", { url: pageUrl });
  return page;
}

async function installSmokeRuntimeDefaults(page) {
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      try {
        const settingsKey = ${JSON.stringify(smokeSettingsStorageKey)};
        const rawSettings = localStorage.getItem(settingsKey);
        const settings = rawSettings ? JSON.parse(rawSettings) : {};
        localStorage.setItem(settingsKey, JSON.stringify({
          ...settings,
          musicVolume: ${JSON.stringify(smokeAudioVolume)},
          soundVolume: ${JSON.stringify(smokeAudioVolume)},
        }));
      } catch {
        localStorage.setItem(${JSON.stringify(smokeSettingsStorageKey)}, ${JSON.stringify(JSON.stringify({
          musicVolume: smokeAudioVolume,
          soundVolume: smokeAudioVolume,
        }))});
      }
    `,
  });
}

async function evaluateJson(page, expression, options = {}) {
  const value = await evaluate(page, expression, options);
  return value ?? null;
}

async function evaluate(page, expression, options = {}) {
  const response = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: options.userGesture === true,
  });
  if (response.exceptionDetails) {
    throw new Error(formatExceptionDetails(response.exceptionDetails));
  }
  return response.result?.value;
}

async function waitForExpression(page, expression, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(page, `Boolean(${expression})`)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}${lastError ? `\nLast error: ${lastError.message}` : ""}`);
}

async function captureScreenshot(page, requestedPath) {
  const screenshotPath = requestedPath
    ? resolve(rootDir, requestedPath)
    : resolve(rootDir, "artifacts", `browser-smoke-${timestampForFileName()}.png`);
  mkdirSync(dirname(screenshotPath), { recursive: true });
  const result = await page.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(screenshotPath, Buffer.from(result.data, "base64"));
  return screenshotPath;
}

function getResourceIssues(requestUrls, expectedVersion, origin) {
  const issues = [];
  for (const requestUrl of requestUrls) {
    let parsed;
    try {
      parsed = new URL(requestUrl);
    } catch {
      continue;
    }
    if (`${parsed.protocol}//${parsed.host}` !== origin) {
      continue;
    }
    const extension = extname(parsed.pathname).toLowerCase();
    const isProjectResource = (
      (parsed.pathname.startsWith("/src/") || parsed.pathname.startsWith("/data/"))
      && knownResourceExtensions.has(extension)
    );
    if (!isProjectResource) {
      continue;
    }
    if (parsed.searchParams.get("v") !== expectedVersion) {
      issues.push(requestUrl);
    }
  }
  return issues;
}

async function startStaticServer(preferredPort) {
  const server = createServer((request, response) => {
    void serveStaticFile(request, response);
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(preferredPort, localHost, () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });
  const address = server.address();
  const origin = `http://${localHost}:${address.port}`;
  console.log(`[browser-smoke] static server: ${origin}`);
  return {
    origin,
    server,
  };
}

async function serveStaticFile(request, response) {
  try {
    const requestUrl = new URL(request.url || "/", `http://${localHost}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    let filePath = resolve(rootDir, relativePath);
    if (!isInsideRoot(filePath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Cache-Control": "no-store",
    });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error?.message || String(error));
  }
}

async function stopServer(serverHandle) {
  if (!serverHandle?.server) {
    return;
  }
  await new Promise((resolvePromise) => {
    serverHandle.server.close(() => resolvePromise());
  });
}

async function launchChrome(options) {
  const chromePath = options.chromePath || findChromeExecutable();
  if (!chromePath) {
    throw new Error("Chrome executable was not found. Pass --chrome=<path> or set BROWSER_SMOKE_CHROME.");
  }
  const debugPort = await getFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "roguelite-browser-smoke-"));
  const chromeArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${defaultViewport.width},${defaultViewport.height}`,
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-features=Translate,Vulkan,DefaultANGLEVulkan,VulkanFromANGLE,DawnGraphite",
    "--disable-gpu-compositing",
    "--disable-popup-blocking",
    "--disable-setuid-sandbox",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-sandbox",
    "--use-angle=swiftshader",
  ];
  if (!options.headed) {
    chromeArgs.push("--headless=new", "--disable-gpu");
  }
  chromeArgs.push("about:blank");

  const processHandle = spawn(chromePath, chromeArgs, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const stderr = [];
  processHandle.stderr?.on("data", (chunk) => {
    stderr.push(String(chunk));
  });
  processHandle.once("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[browser-smoke] Chrome exited early: code=${code} signal=${signal}`);
      if (stderr.length > 0) {
        console.error(stderr.join("").trim());
      }
    }
  });
  console.log(`[browser-smoke] chrome: ${chromePath}`);
  return {
    debugPort,
    processHandle,
    userDataDir,
  };
}

async function stopChrome(chrome, keepOpen) {
  if (!chrome) {
    return;
  }
  if (!keepOpen && chrome.processHandle && !chrome.processHandle.killed) {
    chrome.processHandle.kill();
  }
  if (!keepOpen && chrome.userDataDir) {
    await delay(200);
    rmSync(chrome.userDataDir, { recursive: true, force: true });
  }
}

async function waitForBrowserWebSocket(debugPort, timeoutMs) {
  const startedAt = Date.now();
  const versionUrl = `http://${localHost}:${debugPort}/json/version`;
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const version = await readJsonUrl(versionUrl);
      if (version.webSocketDebuggerUrl) {
        return version.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Chrome DevTools at ${versionUrl}${lastError ? `: ${lastError.message}` : ""}`);
}

function readJsonUrl(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpGet(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
    request.on("error", rejectPromise);
    request.setTimeout(2000, () => {
      request.destroy(new Error(`Timeout reading ${url}`));
    });
  });
}

class CdpConnection {
  static async connect(webSocketUrl) {
    const connection = new CdpConnection(webSocketUrl);
    await connection.open();
    return connection;
  }

  constructor(webSocketUrl) {
    this.webSocketUrl = new URL(webSocketUrl);
    this.buffer = Buffer.alloc(0);
    this.eventHandlers = new Map();
    this.handshakeComplete = false;
    this.id = 0;
    this.pending = new Map();
    this.socket = null;
  }

  open() {
    return new Promise((resolvePromise, rejectPromise) => {
      const key = randomBytes(16).toString("base64");
      const expectedAccept = createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");

      this.socket = net.createConnection(
        Number(this.webSocketUrl.port),
        this.webSocketUrl.hostname,
        () => {
          this.socket.write([
            `GET ${this.webSocketUrl.pathname}${this.webSocketUrl.search} HTTP/1.1`,
            `Host: ${this.webSocketUrl.host}`,
            "Upgrade: websocket",
            "Connection: Upgrade",
            `Sec-WebSocket-Key: ${key}`,
            "Sec-WebSocket-Version: 13",
            "",
            "",
          ].join("\r\n"));
        },
      );

      const failOpen = (error) => {
        rejectPromise(error);
      };

      this.socket.once("error", failOpen);
      this.socket.on("data", (chunk) => {
        try {
          if (!this.handshakeComplete) {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) {
              return;
            }
            const header = this.buffer.slice(0, headerEnd).toString("utf8");
            const acceptMatch = header.match(/sec-websocket-accept:\s*(.+)\r?/i);
            if (!/^HTTP\/1\.1 101/i.test(header) || acceptMatch?.[1]?.trim() !== expectedAccept) {
              throw new Error(`WebSocket handshake failed:\n${header}`);
            }
            this.handshakeComplete = true;
            this.socket.off("error", failOpen);
            this.socket.on("error", (error) => this.rejectAll(error));
            this.socket.on("close", () => this.rejectAll(new Error("CDP socket closed")));
            this.buffer = this.buffer.slice(headerEnd + 4);
            resolvePromise();
            this.processFrames();
            return;
          }
          this.buffer = Buffer.concat([this.buffer, chunk]);
          this.processFrames();
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, new Set());
    }
    this.eventHandlers.get(method).add(handler);
  }

  async send(method, params = {}, sessionId = null) {
    const id = this.id + 1;
    this.id = id;
    const message = sessionId
      ? { id, method, params, sessionId }
      : { id, method, params };
    const promise = new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
    });
    this.sendFrame(JSON.stringify(message));
    return promise;
  }

  close() {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    this.socket.destroy();
  }

  processFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;
      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }
        const bigLength = this.buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("WebSocket frame is too large.");
        }
        payloadLength = Number(bigLength);
        offset += 8;
      }

      const masked = Boolean(secondByte & 0x80);
      const maskOffset = masked ? 4 : 0;
      if (this.buffer.length < offset + maskOffset + payloadLength) {
        return;
      }

      let payload = this.buffer.slice(offset + maskOffset, offset + maskOffset + payloadLength);
      if (masked) {
        const mask = this.buffer.slice(offset, offset + 4);
        payload = unmaskPayload(payload, mask);
      }
      this.buffer = this.buffer.slice(offset + maskOffset + payloadLength);

      if (opcode === 0x1) {
        this.handleMessage(payload.toString("utf8"));
      } else if (opcode === 0x8) {
        this.close();
      } else if (opcode === 0x9) {
        this.sendFrame(payload, 0xA);
      }
    }
  }

  handleMessage(source) {
    const message = JSON.parse(source);
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    const handlers = this.eventHandlers.get(message.method);
    if (handlers) {
      for (const handler of handlers) {
        handler({
          method: message.method,
          params: message.params || {},
          sessionId: message.sessionId || null,
        });
      }
    }
  }

  sendFrame(payload, opcode = 0x1) {
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const length = payloadBuffer.length;
    const headerLength = length < 126 ? 2 : length <= 0xffff ? 4 : 10;
    const header = Buffer.alloc(headerLength);
    header[0] = 0x80 | opcode;
    if (length < 126) {
      header[1] = 0x80 | length;
    } else if (length <= 0xffff) {
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    const mask = randomBytes(4);
    const maskedPayload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      maskedPayload[index] = payloadBuffer[index] ^ mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function unmaskPayload(payload, mask) {
  const result = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    result[index] = payload[index] ^ mask[index % 4];
  }
  return result;
}

function parseArgs(argv) {
  const result = {
    chromePath: process.env.BROWSER_SMOKE_CHROME || process.env.CHROME_PATH || "",
    headed: false,
    keepOpen: false,
    port: 0,
    screenshot: "",
    seed: defaultSeed,
    startMode: "battle",
    timeoutMs: defaultTimeoutMs,
  };

  for (const arg of argv) {
    if (arg === "--headed") {
      result.headed = true;
    } else if (arg === "--keep-open") {
      result.keepOpen = true;
      result.headed = true;
    } else if (arg.startsWith("--chrome=")) {
      result.chromePath = arg.slice("--chrome=".length);
    } else if (arg.startsWith("--port=")) {
      result.port = Number(arg.slice("--port=".length)) || 0;
    } else if (arg.startsWith("--screenshot=")) {
      result.screenshot = arg.slice("--screenshot=".length);
    } else if (arg.startsWith("--seed=")) {
      result.seed = arg.slice("--seed=".length) || defaultSeed;
    } else if (arg.startsWith("--start=")) {
      const startMode = arg.slice("--start=".length);
      if (!["battle", "dialog", "shop", "heal", "reward", "level-up", "smoke-test"].includes(startMode)) {
        throw new Error(`Unsupported --start value: ${startMode}`);
      }
      result.startMode = startMode;
    } else if (arg.startsWith("--timeout=")) {
      result.timeoutMs = Math.max(1000, Number(arg.slice("--timeout=".length)) || defaultTimeoutMs);
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function printHelpAndExit() {
  console.log([
    "Usage: node scripts/browser-smoke.mjs [options]",
    "",
    "Options:",
    "  --seed=<seed>          Run seed to use. Default: A7K9M2QX4T8ZB3NC",
    "  --start=<mode>         Smoke mode: smoke-test, battle, dialog, shop, heal, reward, or level-up. Default: battle",
    "  --headed               Run Chrome with a visible window.",
    "  --keep-open            Keep Chrome and the static server open after the smoke.",
    "  --chrome=<path>        Chrome/Edge executable path.",
    "  --port=<port>          Static server port. Default: random free port.",
    "  --screenshot=<path>    Screenshot output path. Default: artifacts/browser-smoke-*.png",
    "  --timeout=<ms>         Step timeout. Default: 45000",
  ].join("\n"));
  process.exit(0);
}

async function readAppVersion() {
  const source = await readFile(resolve(rootDir, "version.json"), "utf8");
  const manifest = JSON.parse(source);
  if (!manifest || typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new Error("version.json must contain a non-empty version string.");
  }
  return manifest.version.trim();
}

function findChromeExecutable() {
  const candidates = [
    process.env.BROWSER_SMOKE_CHROME,
    process.env.CHROME_PATH,
  ].filter(Boolean);

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    candidates.push(
      join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }

  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, localHost, () => {
      server.off("error", rejectPromise);
      resolvePromise();
    });
  });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

function getMimeType(filePath) {
  return mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isInsideRoot(filePath) {
  const relativePath = relative(rootDir, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function toProjectPath(filePath) {
  const relativePath = relative(rootDir, filePath).split(sep).join("/");
  return relativePath || ".";
}

function formatExceptionDetails(details) {
  return [
    details.text,
    details.exception?.description,
    details.url ? `${details.url}:${details.lineNumber || 0}:${details.columnNumber || 0}` : "",
  ].filter(Boolean).join("\n");
}

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function delay(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
