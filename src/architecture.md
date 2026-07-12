# Архитектура src

Короткая карта ответственности модулей. Это не замена `data/README.md`, а рабочая шпаргалка для рефакторинга крупных файлов.

## Карта

- `src/map-module.js` - composition root карты: единый `state`, DOM `elements`, создание controller-модулей, wiring обработчиков и финальный `boot().catch(...)`.
- `src/asset-preloader.js` - общий предзагрузчик и RAM-кэш локальных ассетов из `data/Assets`; скачивает ассеты в blob/object URL, держит декодированные изображения в памяти и используется стартовым экраном загрузки и прогревом ассетов кампании перед START.
- `data/settings/load.jsonc` - настройки первого loading-screen: логотип, белый фон, волна по логотипу, нижний progress bar, подпись и минимальное время показа.
- `src/map/map-generation.js` - чистая генерация графа карты: уровни, выбор событий, payload-варианты, связи между точками и защита от лишних пересечений дорог.
- `src/map/map-items.js` - item/inventory слой карты: lookup предметов, количество в инвентаре, ограничения, иконки, названия, описания и нормализация здоровья.
- `src/map/map-dom.js`, `src/map/map-media.js`, `src/map/map-tooltips.js` - DOM/media helpers карты: разрешенные DOM-поиски, event images и item tooltip. Внутри `src/map/*` только `map-dom.js` должен использовать `querySelector`.
- `src/map/map-ui-scale.js`, `src/map/map-loading-ui.js`, `src/map/map-data-preload.js` и `src/map/map-boot-controller.js` - инфраструктура запуска: масштабирование карты/оверлеев, loading-screen, загрузка/валидация данных, preload ассетов и boot/reload flow.
- `src/map/map-shell-ui.js`, `src/map/map-cheats.js`, `src/map/map-audio.js` и `src/map/map-settings.js` - shell карты: главное меню, настройки, audio entrypoints, surrender, event log, простой dialog, скрытая SmokeTest-кнопка и typed-sequence cheats.
- `src/map/map-layout.js`, `src/map/map-renderer.js`, `src/map/map-scroll.js`, `src/map/map-animations.js` - визуальный слой карты: координаты узлов, дороги и кнопки, автопрокрутка, drag-scroll и декоративные эффекты.
- `src/map/map-rewards.js` - activity-контроллер reward/level-up: выбор наград по gameplay RNG, pending reward, начисление золота/опыта/HP/предметов, level-up выбор и reward overlay.
- `src/map/map-shop-heal.js` - activity-контроллер shop/heal: оверлеи магазина и лекаря, выбор товаров, подтверждение покупки, проверка золота, лечение и inventory view внутри магазина.
- `src/map/map-dialog.js` - activity-контроллер dialog: печать текста, ответы, переходы в linked events и возврат завершения dialog-точки в фасад карты.
- `src/map/map-hud.js` - DOM-рендер HUD карты: здоровье, опыт и предметы из текущего playerState и каталога предметов.
- `src/map/map-battle-controller.js`, `src/map/map-node-flow.js`, `src/map/map-run-controller.js`, `src/map/map-completion.js` - orchestration карты: BattleRequest и результат боя, маршрутизация типов узлов, завершение карты, старт обычного run и SmokeTest run.
- `src/seeded-random.js` - общий deterministic RNG для debug-воспроизводимости. Карта получает производный `map:<mapId>:<campaignIndex>` seed, а бой - `battle:<mapId>:<nodeId>:data/enemy/<enemyId>.jsonc:<attempt>`; оба значения идут в лог и передаются в gameplay RNG.
- `src/debug-hooks.js` - явный dev/debug-хук `window.__wildwestDebug`, включаемый через debug-флаг. Runtime state не должен утекать в старые `window.context` / `window.contex`.
- `src/data-validation.js` - публичный фасад проверки данных перед стартом; `src/data-validation/core.js` теперь только оркестрирует загрузку и порядок проверок, а доменные правила живут во внутренних `src/data-validation/*` модулях: common helpers, items, cheats, map/battle UI, enemy, campaign, map config, player/locales.
- `src/jsonc-utils.js` - общий helper для JSONC-комментариев отдельной строкой; используется runtime loader и project checks.

## Бой

- `src/battle/battle-module.js` - публичный вход `startBattle(request, options)`; создает deterministic battle RNG из `request.seed`.
- `src/battle/battle-engine.js` - чистая match-3 логика без DOM.
- `src/battle/battle-config.js` - слой доступа к battle UI config: fallback-значения, board/layout/animation/sound getters, clock-warning parsing и asset path resolution через общий RAM-кэш ассетов.
- `src/battle/battle-formatters.js` - текстовый слой боя: lookup локалей, battle text keys, форматирование статусных шаблонов, времени и tooltip labels.
- `src/battle/battle-player-items.js` - слой предметов игрока в бою: подписи/описания предметов, боевые hand slots, чтение и изменение количества в инвентаре.
- `src/battle/battle-state.js` - слой состояния и стадии боя: форма `battleState`, подготовка попытки, reserve board, текущая стадия, stage convert effects, доступ к battle RNG и sync стен/коробок/лоз.
- `src/battle/battle-scaffold-view.js` - DOM-каркас боевого окна: сборка scaffold, renderTargets, viewport-scale, resize и cleanup DOM-ресурсов.
- `src/battle/battle-runtime.js` - lifecycle боя, attempt-token, runtime-таймер ярости, idle hint timer и pause/resume.
- `src/battle/battle-animations.js` - низкоуровневые DOM-анимации поля: swap, shake, blocked click, shuffle и общие cell-animation helpers.
- `src/battle/battle-board-view.js` - DOM-слой поля боя: клетки, иконки, стены, коробки, лозы, board message, gold preview и layout-переменные поля.
- `src/battle/battle-board-actions.js` - слой действий по полю: обычный swap, череп, перчатка, золото, батарея, клики по коробкам/лозам и пассивный урон после обычного хода.
- `src/battle/battle-stats-view.js` - DOM-слой показателей боя: окно врага, HP/агрессия/щит/урон/ярость, здоровье/лечение игрока и visual state предупреждения ярости.
- `src/battle/battle-inventory-view.js` - DOM-слой инвентаря и активных предметов боя: слоты черепа/перчатки/часов/золота/сумки, кнопка mini-menu в заголовке, cooldown часов, active cursor и всплывающие сообщения недоступности.
- `src/battle/battle-shuffle-flow.js` - сценарный слой простоя и перемешивания поля: idle-подсказка, сообщение "нет ходов", ручное перемешивание, урон за перемешивание и состояние кнопки shuffle.
- `src/battle/battle-outcome-flow.js` - сценарный слой исходов и внешних пауз боя: настройки, сдача, победа, поражение, restart, outcome banner и финальный результат scaffold.
- `src/battle/battle-rage-flow.js` - сценарный слой ярости врага: тик таймера, pending-ярость, порядок эффектов ульты, камикадзе, финальные каскады после превращений и классификаторы rage effects.
- `src/battle/battle-popovers.js` - всплывающие слои боя: mini-menu, сумка, лог и общий battle tooltip.
- `src/battle/battle-feedback-view.js` - состояние feedback, подавление лишних delta и базовая анимация изменения показателей: тряска и всплывающие числа.
- `src/battle/battle-projectiles-view.js` - визуальный слой светлячков и ярости: stat-change projectiles, rage projectiles, transform target lights и kamikaze burst; порядок эффектов ярости здесь не живет.
- `src/battle/battle-resolution.js` - слой обработки каскадов: цикл match/remove/bonus/refill, death/drop-анимации и звуки активации предметов.
- `src/battle/battle-effect-summary.js`, `src/battle/battle-match-feedback.js`, `src/battle/battle-language-flow.js` - небольшие helper/flow-модули боя: накопление summary эффектов, источники health feedback и синхронизация UI после смены языка.
- `src/battle/battle-view.js` - фасад боевого экрана: orchestration боя, engine calls, cached deps и thin wrappers для вынесенных слоев. Scaffold/layout/cleanup, board actions, stat HUD, inventory HUD, shuffle/idle flow, outcome flow, rage flow, cascade/death/drop, projectile/rage visuals, feedback summary и language refresh вынесены отдельно, чтобы визуальные правки не лезли в порядок боя.
- `src/battle/battle-data.js` - загрузка enemy/items/battle-ui для боя.

## Правило рефакторинга

Крупные модули надо уменьшать слоями: сначала чистая логика, потом layout helpers, потом UI-события и анимации. Один перенос не должен менять JSON-формат, баланс или пользовательское поведение, иначе рефакторинг превращается в ловушку с красивой вывеской.
