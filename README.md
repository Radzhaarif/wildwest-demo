# Roguelite Match-3

Статический браузерный прототип roguelite match-3 с картой забега, data-driven событиями и отдельным боевым модулем.

## Быстрый старт

Проект не требует сборки и `package.json`. Запускайте его через любой локальный static server из корня проекта, затем открывайте `index.html`.

Пример, если в системе есть Python:

```bash
python -m http.server 5173
```

После этого открыть:

```text
http://127.0.0.1:5173/index.html
```

Для воспроизводимого забега можно добавить seed. Он фиксирует генерацию карты, игровые выборы наград/level-up и боевой RNG:

```text
http://127.0.0.1:5173/index.html?seed=A7K9M2QX4T8ZB3NC
```

## Проверки

Быстрый структурный чек проекта:

```bash
node scripts/check-project.mjs
```

Полная локальная проверка со smoke в браузере:

```bash
node scripts/check-project.mjs --with-smoke
```

Отдельный browser-smoke основного UI-пути:

```bash
node scripts/browser-smoke.mjs
```

`check-project` проверяет синтаксис, JSON/JSONC, игровые данные, ассеты, локали, CSS, battle-engine и кодировку. С флагом `--with-smoke` он после структурных проверок запускает полный `browser-smoke` через скрытую SmokeTest-карту: вводит `iddqd`, нажимает появившуюся QA-кнопку и проходит dialog, skip, shop, heal, reward, battle и boss. Сам `browser-smoke` без аргументов остается быстрым UI-путем `START -> карта -> первый бой`; ручные режимы доступны через `--start=smoke-test|battle|dialog|shop|heal|reward|level-up`. Скриншот сохраняется в `artifacts/`.

## Основные документы

- `data/README.md` - главный контекст данных, запуска, seed, cache-version, ассетов и контрактов.
- `src/architecture.md` - короткая карта ответственности модулей.
- `src/battle/README.md` - устройство боевого модуля.
- `DECISIONS.md` - архитектурные решения.
- `BUG_REVIEW.md` - ручные QA-сценарии боевого окна.
- `PROJECT_REVIEW.md` - архитектурный обзор рисков и текущих проверок.
- `AGENTS.md` - правила работы помощника с проектом.

## Важные правила

- `version.json` содержит только поле `version`; поднимать его нужно при изменении кода, данных или ассетов, которые загружает игра.
- Runtime state не публикуется в `window.context` или `window.contex`; для ручной отладки используйте `?debug=1` и `window.__wildwestDebug`.
- Карта и бой используют общий run seed и производные domain seed. Декоративная визуальная случайность боя не должна влиять на gameplay RNG.
