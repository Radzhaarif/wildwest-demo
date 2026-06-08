# Архитектура src

Короткая карта ответственности модулей. Это не замена `data/README.md`, а рабочая шпаргалка для рефакторинга крупных файлов.

## Карта

- `src/map-module.js` - фасад карты: загрузка сессии, экран карты, обработка событий, вход в бой, HUD и верхние кнопки. До показа стартового меню загружает и проверяет игровые данные, прогревает RAM-кэш ассетов и код боевого модуля, чтобы START и первый клик по battle-точке не ждали тяжелую загрузку.
- `src/asset-preloader.js` - общий предзагрузчик и RAM-кэш локальных ассетов из `data/Assets`; скачивает ассеты в blob/object URL, держит декодированные изображения в памяти и используется стартовым экраном загрузки и прогревом ассетов кампании перед START.
- `data/settings/load.jsonc` - настройки первого loading-screen: логотип, белый фон, волна по логотипу, нижний progress bar, подпись и минимальное время показа.
- `src/map/map-generation.js` - чистая генерация графа карты: уровни, выбор событий, payload-варианты, связи между точками и защита от лишних пересечений дорог.
- `src/data-validation.js` - фасад проверки данных перед стартом. Его можно дробить дальше на доменные валидаторы, но формат ошибок должен остаться прежним.

## Бой

- `src/battle/battle-module.js` - публичный вход `startBattle(request, options)`.
- `src/battle/battle-engine.js` - чистая match-3 логика без DOM.
- `src/battle/battle-config.js` - слой доступа к battle UI config: fallback-значения, board/layout/animation/sound getters, clock-warning parsing и asset path resolution через общий RAM-кэш ассетов.
- `src/battle/battle-formatters.js` - текстовый слой боя: lookup локалей, battle text keys, форматирование статусных шаблонов, времени и tooltip labels.
- `src/battle/battle-player-items.js` - слой предметов игрока в бою: подписи/описания предметов, боевые hand slots, чтение и изменение количества в инвентаре.
- `src/battle/battle-state.js` - слой состояния и стадии боя: форма `battleState`, подготовка попытки, reserve board, текущая стадия, stage convert effects и sync стен/коробок/лоз.
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
- `src/battle/battle-view.js` - фасад боевого экрана: orchestration боя, engine calls и thin wrappers для вынесенных слоев. Scaffold/layout/cleanup, board actions, stat HUD, inventory HUD, shuffle/idle flow, outcome flow, rage flow, cascade/death/drop и projectile/rage visuals вынесены отдельно, чтобы визуальные правки не лезли в порядок боя. Старые недостижимые тела rage helper wrappers после `return` и wrappers/imports без callsite-ов удалены; source of truth для этих правил - `battle-rage-flow.js`.
- `src/battle/battle-data.js` - загрузка enemy/items/battle-ui для боя.

## Правило рефакторинга

Крупные модули надо уменьшать слоями: сначала чистая логика, потом layout helpers, потом UI-события и анимации. Один перенос не должен менять JSON-формат, баланс или пользовательское поведение, иначе рефакторинг превращается в ловушку с красивой вывеской.
