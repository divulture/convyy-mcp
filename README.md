# Convyy MCP

`Convyy MCP` — это отдельный MCP server для работы с доской Convyy из агентных клиентов.

Пользовательский сценарий простой:

1. пользователь открывает Convyy по адресу домена;
2. пользователь подключает `Convyy MCP` в Claude, Codex, Cursor, Cline или другом MCP-клиенте;
3. агент получает доступ к board-oriented инструментам Convyy;
4. агент может работать с доской через MCP tools.

## Для чего нужен Convyy MCP

`Convyy MCP` нужен, чтобы агент мог безопасно работать с доской, а не только писать текст.

Через него агент может:

- читать page context;
- понимать, к какой странице привязан чат;
- создавать новый AI-owned контент;
- коммитить каждый AI-ответ как отдельный batch;
- заменять или откатывать только последний AI batch текущего чата;
- выбирать follow-up действие: `append`, `replace-last-batch`, `undo-last-batch`, `new-page`, `bind-page`.

## Что умеет MCP

Текущий MCP поддерживает:

- runtime state для chat-to-page bindings;
- one-active-generation gate на один board runtime;
- follow-up action resolution;
- stdio MCP transport с `initialize`, `ping`, `tools/list`, `tools/call`;
- orchestration endpoint для обычного prompt workflow;
- direct tools для диаграмм, канбана, template fill, journey map, vision summary и generic board summary.

## Ограничения MVP

Текущая модель работы намеренно ограничена:

- агент не редактирует существующие пользовательские объекты;
- агент добавляет только новый AI-owned контент;
- каждый AI-ответ становится отдельным batch;
- undo и replace работают только для последнего AI batch текущего чата;
- board-specific side effects проходят через контролируемый runtime слой Convyy.

## Основные инструменты

### `convyy_run_prompt`

Главный orchestration tool.

Что делает:

- определяет follow-up action по prompt;
- выбирает нужный tool path;
- работает с page binding;
- коммитит итоговый batch в доску.

Использовать его нужно по умолчанию, если не требуется вручную вызывать специализированный tool.

### `convyy_bind_chat`

Явно привязывает чат к странице.

Нужен, если агент должен продолжить работу на конкретной странице.

### `convyy_list_pages`

Возвращает список страниц доски.

Нужен, если клиенту нужно сначала выбрать страницу.

### `convyy_revert_last_batch`

Откатывает последний AI batch указанного чата.

### `convyy_get_runtime_state`

Возвращает текущее runtime-состояние MCP для board.

Полезно для служебных и диагностических сценариев.

## Direct tools

Эти tools доступны отдельно, но в обычном сценарии чаще всего хватает `convyy_run_prompt`.

### `convyy_create_diagram`

Строит flow / diagram payload.

Подходит для:

- auth flow;
- onboarding flow;
- architecture diagram;
- process flow.

### `convyy_create_kanban_board`

Строит kanban payload.

Подходит для:

- backlog board;
- launch board;
- task board;
- work stages.

### `convyy_fill_board_template`

Подготавливает payload для built-in template.

Подходит для:

- SWOT;
- Business Model Canvas;
- Gantt / roadmap-like template scenarios.

### `convyy_create_journey_map`

Строит journey map payload.

Подходит для:

- onboarding journey;
- customer journey;
- service flow;
- service blueprint style scenarios.

### `convyy_analyze_page_images`

Подготавливает vision-oriented payload по изображениям на странице.

### `convyy_create_board_summary`

Generic fallback tool для обычных summary / structure / draft сценариев.

## Как установить

Если `Convyy MCP` лежит в отдельном git-репозитории:

```bash
git clone https://github.com/<your-org>/convyy-mcp.git
cd convyy-mcp
npm install
npm run build
```

Проверка:

```bash
npm run typecheck
npm run test
```

## Как подключить к агентному клиенту

После сборки `Convyy MCP` подключается как обычный stdio MCP server.

Важно:

- сам MCP ставится разработчиком отдельно, из отдельного git-репозитория;
- сам Convyy открывается отдельно, по адресу домена;
- MCP не встраивает доску в клиент агента, а дает агенту инструменты для работы с уже открытым Convyy runtime.

Пример:

```json
{
  "mcpServers": {
    "convyy": {
      "command": "node",
      "args": ["./dist/server.js"]
    }
  }
}
```

Если используете опубликованный bin:

```json
{
  "mcpServers": {
    "convyy": {
      "command": "convyy-mcp",
      "args": []
    }
  }
}
```

## Как пользоваться

Рекомендуемый flow:

1. агент вызывает `convyy_list_pages`
2. при необходимости вызывает `convyy_bind_chat`
3. затем вызывает `convyy_run_prompt`
4. при необходимости вызывает `convyy_revert_last_batch`

Примеры запросов:

- `Create a kanban board for launch prep`
- `Build an onboarding journey map`
- `Create an auth flow diagram`
- `Fill a SWOT template for our product`
- `Analyze this screenshot and build a board summary`

## Что нужно для работы

Чтобы агент реально работал с доской, нужны обе части:

1. открытый Convyy в браузере по адресу домена;
2. подключенный `Convyy MCP` в агентном клиенте.

Типовой сценарий такой:

1. пользователь открывает Convyy;
2. пользователь открывает агентный чат;
3. агент вызывает MCP tools;
4. результат появляется в текущем Convyy board runtime.

## Структура репозитория

```text
src/
  application/
  contracts/
  orchestration/
  runtime/
  server/
  tools/
tests/
```

## Команды

```bash
npm install
npm run build
npm run typecheck
npm run test
```
