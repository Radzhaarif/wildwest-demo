# Полное ревью проекта

🟢 РАБОТАЕТ
🔴 БАГ
⚫ НЕ ПРОВЕРЕНО

Дата ревью: 2026-06-06. Актуализировано: 2026-06-11.

Цель: проверить проект на ошибки, баги, недоработки, отсутствующие ключи локалей, слабые места архитектуры/UI/данных и потенциальные уязвимости. В этом проходе код и данные не исправлялись.

Живые игровые проверки и ручной QA боевого окна вынесены в `BUG_REVIEW.md`, чтобы `PROJECT_REVIEW.md` оставался архитектурным ревью, а не списком мест, куда надо тыкать мышкой.

## Executive Summary

Проект сейчас запускается как статический браузерный прототип с сильной data-driven частью. Автоматические проверки дали хороший базовый результат: JS/MJS синтаксис чистый, JSON/JSONC парсятся, активная кампания проходит `validateGameData()`, локали синхронизированы, реальные ссылки на ассеты из данных существуют, `battle-engine` тесты проходят.

Главный риск не в битом JSON, а в хрупкости сопровождения: `map-module.js` всё еще слишком крупный, `battle-view.js` уже стал фасадом, но остается сценарно важным узлом, legacy-файлы лежат рядом с активными, а часть контрактов всё еще держится на договоренности, а не на явной проверке. Browser-smoke теперь автоматизирован и включается в общий чекер через `node scripts/check-project.mjs --with-smoke`.

P0-блокеров на момент ревью не найдено. Но есть P1/P2, которые легко превращаются в P0 при следующей визуальной или боевой правке.

## Проверки, которые выполнены

- `node scripts/check-project.mjs`: пройдено.
- JS/MJS syntax через `node --check`: `37` файлов, пройдено.
- `version.json`: валиден, только поле `version`, текущая app-version `2026.06.11.4`.
- Парсинг данных: `7` JSON и `44` JSONC, пройдено.
- `validateGameData()` на активной кампании и языках `en`, `ru`, `new_ru`: `1` карта, `7` врагов, `3` локали, пройдено.
- Asset-scan: `124` уникальные ссылки, `0` отсутствующих файлов.
- Locale-scan по `en`, `ru`, `new_ru`: `283` ключа, `0` отсутствующих ключей.
- CSS braces check для `src/styles.css`: пройдено.
- `node scripts/check-battle-engine.mjs`: пройдено.
- `node scripts/check-encoding.mjs`: пройдено.
- `node scripts/check-project.mjs --with-smoke`: пройдено. После структурных проверок запускает browser-smoke; сценарий `START -> карта -> первая battle-точка` открывает бой с `easy_Foxy`, проверяет battle seed, `enemyConfigUrl`, доску `9x8`, 72 клетки/иконки, отсутствие `window.context/window.contex`, отсутствие console/page/network ошибок и `0` unversioned запросов к `src/` и `data/`.

Не покрыто автоматикой:

- Mobile/responsive smoke, длинный прогон кампании, reward/level-up выборы, поражение/restart и специальные боевые сценарии с каждым типом ярости.

## Findings

### P1 - `battle-view.js` остается главным runtime-risk файлом

- Файл/строка: `src/battle/battle-view.js`; весь файл около `1443` строк.
- Что не так: исторически это был главный боевой монолит. Сейчас DOM-слои, runtime, state, board actions, rage, shuffle, outcome, projectiles и formatters вынесены, но фасад всё еще собирает deps, координирует бой и остается сценарием повышенного риска.
- Чем опасно: любая визуальная правка может зацепить таймеры, блокировку поля, lifecycle-token или async-анимации. История проекта уже показывала зависания поля и проблемы после restart/ярости.
- Маленькое исправление: выносить не все сразу, а слоями: `battle-runtime.js`, `battle-animations.js`, `battle-board-view.js`. Сначала только runtime/cleanup, без изменения поведения.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** первый runtime-слой вынесен в `src/battle/battle-runtime.js`: lifecycle боя, attempt-token, runtime-таймер ярости, idle hint timer и pause/resume больше не определяются внутри `battle-view.js`. `battle-view.js` оставляет view-specific `tickBattleRuntime()` и `handleBattleIdle()` как callbacks, поэтому поведение боя не менялось. Finding остается частично открытым до отдельных выносов `battle-animations.js` и `battle-board-view.js`.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** низкоуровневые анимации поля вынесены в `src/battle/battle-animations.js`: swap, shake, blocked click, shuffle, cell lookup, `runCellAnimation()`, `getBattleElementAnimationState()` и `wait()` больше не определяются внутри `battle-view.js`. `battle-view.js` продолжает решать, когда запускать эти анимации. На момент этого среза context-heavy death/drop, rage visuals, projectiles, health feedback и board-view оставались следующими отдельными срезами; последующие блоки ниже уже закрывают board-view, popovers, feedback и projectile visuals.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** выполнен фасадный разрез `battle-view.js`. Добавлены `src/battle/battle-board-view.js`, `src/battle/battle-popovers.js` и `src/battle/battle-feedback-view.js`. Из `battle-view.js` вынесены прямой DOM-рендер поля, стены/коробки/лозы, board message, gold preview, mini-menu, сумка, лог боя, battle tooltip, feedback state, suppression и базовая анимация изменения показателей. `battle-view.js` теперь заметно ближе к фасаду: он собирает scaffold и координирует порядок боя, но больше не строит каждую клетку и не держит весь popover/tooltip слой внутри себя.

Почему тогда это было не полное `ИСПРАВЛЕНО`: на момент фасадного среза rage-specific projectiles и light-projectile source selection еще оставались в `battle-view.js`. Этот подпункт закрыт следующим блоком через `battle-projectiles-view.js`; после него в фасаде все еще остаются death/drop-анимации, `resolveBattleCascades()` и часть cascade orchestration.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** projectile/rage visuals вынесены в `src/battle/battle-projectiles-view.js`. Теперь обычные светлячки изменения показателей, rage projectiles, transform target lights и kamikaze burst не определяются внутри `battle-view.js`. В фасаде оставлены только тонкие wrappers со старыми именами, чтобы не перепахивать callsite-ы, и сохранен порядок ярости: `runBattleRageAction()`, `handleBattleUltimateKamikazeEffect()`, engine calls, lifecycle-проверки и переход к cascade остаются в `battle-view.js`.

Почему finding все еще не закрыт полностью: death/drop-анимации, `resolveBattleCascades()` и часть board-click orchestration остаются в фасаде. Это уже следующий срез, а не повод запихивать всё в один героический коммит с посмертной запиской.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** cascade/death/drop слой вынесен в `src/battle/battle-resolution.js`. Теперь `resolveBattleCascades()`, death-анимация активированных предметов, drop/refill-анимация через reserve board и звуки `sound_effect` больше не определяются внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами, а также board click orchestration, victory/defeat, restart, ярость и порядок применения эффектов.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть обработчиками кликов по полю, skull/glove/gold/battery сценариями, исходами боя и runtime-сценариями. Это уже заметно меньше, но файл все еще остается координатором боя, а не “маленьким экранным компонентом”. И да, это нормально: фасад должен координировать, иначе он будет просто очередной коробкой с проводами.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** слой действий по боевому полю вынесен в `src/battle/battle-board-actions.js`. Теперь обычный swap, invalid swap, wall/box/vine blocked click, череп, перчатка, золото, батарея и пассивный `dmgperturn` после принятого обычного хода больше не определяются внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleBoardActionsDeps()`, чтобы не менять DOM-контракт `battle-board-view.js`.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть scaffold, enemy/player render, victory/defeat, restart, ручным shuffle, runtime callbacks и порядком ярости. Это уже ближе к нормальному фасаду, но файл все еще крупный и сценарно важный.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** stat HUD боя вынесен в `src/battle/battle-stats-view.js`. Теперь окно врага, портрет/задник, HP, агрессия, щит, урон, таймер ярости, warning-анимация ярости и бары HP/heal игрока больше не строятся внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleStatsViewDeps()`, потому что runtime, rage, resolution и board-action слои все еще вызывают общий контракт обновления статов.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть inventory/special items, ручным shuffle/no-moves, victory/defeat/restart, настройками/сдачей и порядком ярости. Это уже не монолит уровня “один файл правит всем”, но фасад все еще крупный и сценарно опасный.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** inventory/special HUD боя вынесен в `src/battle/battle-inventory-view.js`. Теперь слоты черепа, перчатки, часов, золота, сумки, кнопка mini-menu в заголовке, cooldown часов, active special cursor, pointer tracker и всплывающие сообщения недоступности больше не определяются внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleInventoryViewDeps()`, потому что popover, board-action, runtime и cleanup слои все еще вызывают общий контракт инвентаря.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть ручным shuffle/no-moves, victory/defeat/restart, настройками/сдачей/scaffold и порядком ярости. Инвентарь вынесен, но фасад всё еще сценарно важен и требует следующих срезов, а не победной музыки на весь город.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-06:** shuffle/idle/no-moves flow вынесен в `src/battle/battle-shuffle-flow.js`. Теперь idle-подсказка доступного хода, сообщение "нет ходов", ручное перемешивание, урон за перемешивание, пересборка reserve board после shuffle и состояние/локализация кнопки shuffle больше не определяются внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleShuffleFlowDeps()`, потому что runtime и scaffold все еще вызывают общий flow-контракт.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть victory/defeat/restart, настройками/сдачей/scaffold и порядком ярости. Shuffle-flow вынесен, но главный фасад еще держит outcome и rage orchestration - две зоны, где баги обычно любят селиться с мебелью и пропиской.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** outcome/settings flow вынесен в `src/battle/battle-outcome-flow.js`. Теперь настройки, сдача, победа, поражение, restart, outcome banner, `finishBattle()`, `createScaffoldResult()` и `closeScaffold()` больше не определяются внутри `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleOutcomeFlowDeps()`, потому что board/rage/scaffold helper-слои еще вызывают общий outcome-контракт.

Почему finding все еще не закрыт полностью: `battle-view.js` продолжает владеть scaffold/layout, cleanup, runtime tick callbacks и порядком ярости. Outcome вынесен, но rage orchestration всё еще главный токсичный узел; трогать его надо отдельным срезом, а не радостно запихивать в этот же перенос.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** rage flow вынесен в `src/battle/battle-rage-flow.js`. Теперь тик таймера ярости, pending-ожидание, запуск ульты, порядок ultimate effects, камикадзе, финальные каскады после превращений и классификаторы rage effects больше не являются активной логикой `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleRageFlowDeps()`, потому что runtime, projectiles и scaffold продолжают вызывать прежний контракт.

Почему finding всё еще не закрыт полностью: `battle-view.js` продолжает владеть scaffold/layout, cleanup, нормализацией render targets и частью общих helper-обвязок. Кроме того, из-за старых битых строк с русскими alias-ами в фасаде остались недостижимые строки после wrapper-return в нескольких rage helper-функциях; это не активное поведение, но это хороший кандидат на отдельную санитарную чистку после прохождения smoke.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** scaffold/layout/cleanup вынесены в `src/battle/battle-scaffold-view.js`. Теперь сборка DOM-каркаса боя, `renderTargets`, viewport-scale, resize handling, нормализация render targets и cleanup DOM-ресурсов больше не являются активной логикой `battle-view.js`. В фасаде оставлены thin wrappers со старыми именами и `createBattleScaffoldViewDeps()`, потому что outcome, popovers, inventory и другие слои продолжают вызывать прежний scaffold-контракт.

Почему finding почти закрыт, но не полностью: `battle-view.js` всё ещё содержит общие deps/wrappers, часть config/helper-обвязки и недостижимые старые строки в нескольких rage helper wrappers после прошлого среза. Это уже не главный runtime-risk узел, но нужен финальный cleanup-проход. Да, последний слой пыли обычно самый липкий.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** config-слой боя вынесен в `src/battle/battle-config.js`. Теперь fallback-значения `battle-ui`, top-button config, board/layout/animation/sound getters, tooltip timing, enemy shield cap, clock-warning parsing и asset path cache-busting больше не определяются внутри `battle-view.js`. В фасаде оставлен только тонкий wrapper `getBattleGenerationConfig()`, потому что он должен добавить текущие stage `convert` эффекты из состояния боя.

Почему finding всё ещё закрыт не полностью: `battle-view.js` теперь уже ближе к фасаду, но в нем остаются общие deps/wrappers, state helpers, stage helpers и санитарный долг после предыдущих переносов. Следующий логичный срез - `battle-state.js` для состояния попытки, текущей стадии, reserve board, walls/boxes/vines sync и мелких stat/state helpers.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** state/stage слой боя вынесен в `src/battle/battle-state.js`. Теперь форма `battleState`, подготовка новой попытки, reserve board, текущий индекс стадии, stage `convert` effects и sync стен/коробок/лоз больше не определяются внутри `battle-view.js`. Фасад продолжает передавать эти helpers в deps других слоев под прежними именами, чтобы не менять поведение.

Почему finding всё ещё закрыт не полностью: `battle-view.js` теперь держит в основном deps/wrappers, перевод/форматирование, item/inventory helper-ы и общую orchestration-обвязку. Следующий cleanup-срез можно делать по мелким helper-ам и недостижимым строкам после wrapper-return, но главный state-mutating слой уже вынесен.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** text/formatter слой боя вынесен в `src/battle/battle-formatters.js`. Теперь lookup локалей, battle text-key lookup, форматирование статуса хода, формат времени и tooltip labels больше не определяются как активная логика внутри `battle-view.js`. Фасад оставляет тонкие wrappers со старыми именами, потому что extracted layers продолжают получать эти callbacks через deps.

Почему finding всё ещё закрыт не полностью: `battle-view.js` всё ещё содержит item/inventory helper-ы, общую deps-обвязку и санитарный долг после wrapper-return в нескольких старых rage helpers. Следующий маленький срез - вынести item/inventory helpers или сделать санитарную чистку unreachable-кода.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** player item/inventory helper слой вынесен в `src/battle/battle-player-items.js`. Теперь подписи и описания предметов, `handItemIds` из `battle-ui`, чтение количества предметов и изменение количества в инвентаре больше не определяются как активная логика внутри `battle-view.js`. Фасад оставляет thin wrappers, потому что board/popover/inventory/action слои продолжают получать эти callbacks через deps.

Почему finding всё ещё закрыт не полностью: `battle-view.js` теперь почти весь состоит из deps/wrappers, orchestration-helpers и нескольких мелких utility. Открытый остаток - санитарная чистка недостижимых строк после wrapper-return в rage helpers и решение, какие wrappers можно удалить после обновления deps-контрактов вынесенных слоев.

**ИСПРАВЛЕНО ЧАСТИЧНО 2026-06-07:** выполнена санитарная чистка rage helper wrappers в `src/battle/battle-view.js`. Удалены недостижимые старые строки после `return` в wrappers для классификации rage effects, получения текущей rage/stage конфигурации, расчета ожидания damage feedback и `normalizeStringList`. Также удалены wrappers/imports без callsite-ов: `handleBattleUltimateKamikazeEffect`, `getBattleUltimateDamageFeedbackWaitMs` и `getCurrentBattleStageConfig`. Фасад оставляет только те wrappers, которые еще нужны deps-контракту projectiles/rage слоев, а источник правды для этих правил теперь только `src/battle/battle-rage-flow.js`.

Почему finding всё ещё закрыт не полностью: `battle-view.js` уже сильно меньше и чище, но в нем всё еще есть deps-фабрики, фасадные wrappers и несколько orchestration helpers. Следующий санитарный шаг - проверять, какие wrappers можно убрать только после обновления deps-контрактов вынесенных слоев, а не рубить их по принципу "кажется лишним" и потом удивляться, почему проект снова делает вид, что он современное искусство.

### P1 - `map-module.js` слишком большой и держит слишком много сценариев карты

- Файл/строка: `src/map-module.js`; весь файл около `3564` строк.
- Что не так: в одном фасаде живут boot, настройки, карта, HUD, диалоги, reward/level-up, shop/heal, сдача, лог, сохранения, музыка и вход/выход из боя.
- Чем опасно: исправление одного overlay легко ломает другой; завершение карты, награды и возврат из боя пересекаются через общий runtime state.
- Маленькое исправление: продолжить уже начатый разбор: вынести `map-dialog`, `map-rewards`, `map-shop-heal`, `map-hud`, оставив `map-module.js` фасадом.

### P2 - Browser-smoke встроен в `check-project` за флагом

- Файл/строка: `scripts/browser-smoke.mjs`, `scripts/check-project.mjs`.
- Что изменилось: no-dependency browser-smoke добавлен и подключен к `check-project` через `--with-smoke`. Он сам поднимает static server, запускает Chrome/Edge через DevTools Protocol, проходит `START -> карта -> первый бой` и проверяет debug hook, battle seed, `enemyConfigUrl`, доску и versioned resources.
- Что остается не так: быстрый `node scripts/check-project.mjs` намеренно не запускает браузер. Перед релизом или крупной UI-правкой нужно запускать `node scripts/check-project.mjs --with-smoke`, иначе UI-регрессия может спокойно пройти мимо с видом человека в деловом костюме.
- Маленькое исправление: если `--with-smoke` начнут забывать, добавить короткий release-script/батник, который вызывает именно полный режим.

### P1 - Legacy fallback для `battle-ui` может скрыть битую активную конфигурацию

- Файл/строка: `src/battle/battle-data.js:2`, `src/battle/battle-data.js:3`, `src/battle/battle-data.js:12`.
- Что было не так: бой сначала грузил `data/settings/battle-ui.jsonc`, но при `Failed to load` молча падал назад на `data/battle/battle-ui.jsonc`.
- Чем было опасно: если активный файл переименован, удален или сервер вернул 404, игра могла продолжить жить на старой конфигурации. Визуально это выглядело бы как "я поменял JSON, а игра не меняется".
- Статус: исправлено 2026-06-11. Runtime fallback удален из `src/battle/battle-data.js`; бой использует только активный `data/settings/battle-ui.jsonc`, а `scripts/check-project.mjs` теперь отдельно проверяет, что legacy fallback-маркеры не вернулись.

### P2 - В проекте рядом лежат активные и старые JSONC-файлы

- Файл/строка: `data/items.jsonc`, `data/campaign.jsonc`, `data/experience-table.jsonc`, `data/battle/battle-ui.jsonc`, `data/maps/123.jsonc`, `data/enemy/test.jsonc`.
- Что не так: активные файлы переехали в `data/settings` и `data/player`, но старые копии остались в `data`.
- Чем опасно: легко править не тот файл. Это уже происходило с `battle-ui` и музыкой/иконками: симптомы выглядят как кэш или баг загрузчика.
- Маленькое исправление: перенести legacy-файлы в отдельную папку `data/_legacy` или удалить после отдельного подтверждения; в README оставить только активные пути.

### P2 - Глобальные `window.context` и `window.contex` раскрывали runtime state

- Файл/строка: раньше `src/map-module.js`, `src/battle/battle-module.js`, `src/battle/battle-view.js`.
- Что было не так: карта и бой клали управляемое состояние в глобальный `window`, включая старую опечатку `contex`.
- Чем опасно: любой код в странице или консоли может мутировать состояние боя/карты. Для прототипа это удобно, но для будущего desktop/Steam-направления это слабый контракт и источник трудно воспроизводимых багов.
- Статус: исправлено; runtime state доступен только через `window.__wildwestDebug` при явном debug-флаге, а `window.context/window.contex` удаляются helper-ом.

### P2 - Статус после battle содержал mojibake-разделитель

- Файл/строка: `src/map-module.js`, `activateNode()`.
- Что было не так: после battle в `selectionStatus` выставлялся mojibake-разделитель вместо нормального символа `·`, а соседние ветки уже использовали корректный символ.
- Чем опасно: маленький визуальный баг, но он показывает, что точечные строковые артефакты могут проходить `check-encoding`.
- Статус: исправлено; `check-encoding.mjs` расширен проверкой распространенных mojibake-фрагментов, включая сломанный middle-dot.

### P2 - Активная кампания использует один `mapId` дважды

- Файл/строка: `data/settings/campaign.jsonc:4`, `src/map-module.js:3362`.
- Что не так: `WildWest` указан дважды с одним config, но разным `onComplete`. Код ищет следующий `mapId` после текущего индекса, потом падает назад на первый.
- Чем опасно: это работает сейчас, но контракт неочевиден. Любая сортировка, дедупликация или внешний редактор кампании может сломать переходы.
- Маленькое исправление: либо явно документировать повторное использование `mapId`, либо ввести уникальный `campaignEntryId` при сохранении текущей логики.

### P2 - Внутренний `enemyId` часто не совпадает с именем файла

- Файл/строка: `data/enemy/easy_Foxy.jsonc:2`, аналогично `easy_Candy`, `easy_Sweety`, `easy_Boom`, `boss_Fireman` и другим.
- Что не так: карта грузит врага по имени файла из `enemyId`, а внутри JSON указан базовый id без префикса сложности.
- Чем опасно: валидатор это терпит, но отладка, логи, будущие редакторы и reward/stat tracking могут смешать `easy_Foxy` и `Foxy`.
- Маленькое исправление: принять правило: либо `fileId` и `enemyId` разные осознанно, либо внутренний `enemyId` должен совпадать с именем файла. Для текущего проекта лучше добавить отдельное поле `baseEnemyId`, если нужно.

### P2 - `current-player-state.json` существует, но не используется как сохранение

- Файл/строка: `data/player/current-player-state.json`, `src/map-module.js:525`, `data/README.md:52`.
- Что не так: файл выглядит как текущее состояние игрока, но игра каждый новый старт берет `default-player-state.json` и хранит изменения только в памяти.
- Чем опасно: можно править `current-player-state.json` и не понимать, почему игра игнорирует изменения. Для баланса и QA это особенно коварно.
- Маленькое исправление: либо переименовать файл в `player-state.example/runtime-note`, либо добавить явный UI/dev-mode загрузки current-state.

### P3 - В корне отсутствовал `README.md`

- Файл/строка: `README.md`.
- Что было не так: `AGENTS.md` и план ревью ожидали корневой README, но актуальная карта проекта находилась только в `data/README.md`.
- Чем опасно: новый разработчик сначала открывает корень и не видит главной инструкции по запуску/структуре.
- Статус: исправлено; корневой `README.md` теперь служит короткой входной точкой и ведет к `data/README.md`, `src/architecture.md`, `DECISIONS.md`, `BUG_REVIEW.md` и проверкам.

### P3 - `validateGameData()` не имеет явного success/failure shape

- Файл/строка: `src/data-validation.js:81`, `src/data-validation.js:130`.
- Что не так: при ошибках функция бросает `Error`, при успехе возвращает caches. Поля `ok` или `issues` в успешном результате нет.
- Чем опасно: внешние smoke-скрипты легко ошибаются, ожидая `{ ok, issues }`. В ревью это уже всплыло: wrapper получил `issueCount: 0`, но не нашел `ok`.
- Маленькое исправление: оставить throw-поведение для runtime, но добавить маленький wrapper `runValidationCheck()` для scripts или документировать return shape.

### P3 - `alert()` остается fallback для простого dialog

- Файл/строка: `src/map-module.js:3373`, `src/map-module.js:3382`.
- Что не так: если `HTMLDialogElement.showModal` недоступен, используется browser `alert`.
- Чем опасно: для будущей desktop-оболочки и стилизованного UI это выбивается из игрового интерфейса. Риск низкий, потому что fallback.
- Маленькое исправление: заменить fallback на обычный overlay без native dialog.

### P3 - Эффекты ярости поддерживают русские alias в коде

- Файл/строка: `src/battle/battle-engine.js:885`, `src/data-validation.js:1119`, `src/battle/battle-view.js:3581`.
- Что не так: типы эффектов принимают строки вроде `преобразование`, `урон`, `лечение`, `щит`.
- Чем опасно: data API смешивает технические type-id и локализованные слова. Это удобно руками, но усложняет редактор, документацию и будущую миграцию.
- Маленькое исправление: оставить alias временно, но в `rage.example.jsonc` и README продвигать только канонические английские ids.

## Missing Checks

Сейчас есть:

- `scripts/check-project.mjs`: syntax, version manifest, JSON/JSONC, `validateGameData()`, asset-scan, locale-scan, CSS braces, battle-engine и encoding.
- `scripts/check-project.mjs --with-smoke`: все проверки выше плюс browser-smoke.
- `scripts/browser-smoke.mjs`: отдельный запуск boot -> START -> карта -> первая battle-точка.
- `validateGameData()` перед стартом игры.

Не хватает:

- Тестов `map-generation`: развилки, отсутствие длинных одиночных коридоров, отсутствие лишних пересечений, корректная привязка eventName -> payload.
- Тестов `data-validation`: битый enemy, отсутствующий asset, отсутствующий locale key, неправильный battle-ui board size.
- Расширенного UI-regression smoke для scale/popover: battle mini-menu, bag, map overlays, settings, reward, tooltip, defeat/restart и mobile/responsive.

## Locale And Data Gaps

Хорошее:

- Все активные локали имеют одинаковый набор ключей: `0` missing.
- Все asset-ссылки из JSON/JSONC/локалей существуют: `0` missing.
- Все JSON/JSONC парсятся.
- Активная кампания проходит `validateGameData()`.

Риски:

- Legacy-файлы лежат рядом с активными и могут быть случайно отредактированы.
- Внутренние `enemyId` не совпадают с file id у многих врагов.
- Legacy-файлы все еще лежат рядом с активными и могут быть случайно отредактированы, но `data/battle/battle-ui.jsonc` больше не используется runtime fallback-ом.
- `data/maps/123.jsonc` и копия WildWest парсятся, но не являются активной кампанией; их статус неочевиден.

## Fix Plan

### Batch 1 - Зафиксировать проверки и убрать неоднозначные P1/P2

- `scripts/check-project.mjs` создан; asset-scan, locale-scan, battle-engine и encoding включены.
- `scripts/browser-smoke.mjs` создан как отдельная UI-проверка.
- `scripts/check-project.mjs --with-smoke` добавлен как единый полный локальный чек со smoke.
- Mojibake-разделитель в `selectionStatus` исправлен, `check-encoding.mjs` расширен.
- Fallback `data/battle/battle-ui.jsonc` убран из runtime-загрузки и закреплен проверкой `scripts/check-project.mjs`.
- Задокументировать или разрулить duplicate `mapId` в кампании.

### Batch 2 - Снизить риск battle runtime

- Вынести из `battle-view.js` runtime/таймеры/attempt-token в отдельный модуль.
- После этого вынести анимационные helpers, не меняя поведение.
- Добавить smoke-сценарии для pending rage, defeat restart, bag/mini-menu и обычного swap.

### Batch 3 - Снизить риск map runtime

- Вынести из `map-module.js` reward/level-up, shop/heal, map-dialog и HUD.
- Добавить тесты или smoke для dialog-linked events, terminal node completion и перехода между campaign entries.
- Уточнить контракт `current-player-state.json`.

### Batch 4 - Почистить legacy и улучшить документацию

- Root `README.md` создан.
- Перенести или удалить устаревшие `data/*.jsonc`, `data/battle/*`, тестовые карты и врагов после подтверждения.
- Привести enemy file id/internal id к явному правилу.
- Перевести `src/battle/README.md` комментарии/описания на единый язык проекта или хотя бы зафиксировать смешение как временное.

## Regression Checklist

После каждого batch:

- `node scripts/check-project.mjs`.
- `node scripts/check-project.mjs --with-smoke` перед релизом, крупной UI-правкой или изменением загрузки/seed/cache.
- При точечных изменениях боя дополнительно смотреть `BUG_REVIEW.md` и проходить нужные ручные сценарии.

Живые игровые проверки, ручной smoke боя, UI-overlay проверки и сценарии регрессии перенесены в `BUG_REVIEW.md`.

## Do Not Touch Without Separate Decision

- Формат JSON/JSONC карт, enemy, items, battle-ui и map-ui.
- Семантику `eventName -> payload`.
- Правило накопительного опыта без обнуления `experience.total`.
- Порядок обработки match-3: найти совпадения -> эффекты -> бонусы -> удалить -> падение -> добор -> каскады.
- Поведение щита врага по количеству активированных damage-предметов.
- Отложенную ярость: таймер может дойти до нуля во время действий поля, но эффект должен сработать после завершения действий.
- Локальный статический формат проекта: без обязательного внешнего сервера/CDN/API.
