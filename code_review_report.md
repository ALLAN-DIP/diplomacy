# Diplomacy Codebase Review — Improvement Opportunities

*Generated: April 16, 2026*

---

## Python Backend

### Security

**CORS origin validation is too permissive** — `connection_handler.py` defaults `PERMISSIVE_CLIENT_ORIGIN=True`, bypassing origin checks for localhost. A wildcard `"*"` in `ALLOWED_ORIGINS` disables validation entirely, opening the door to CSRF on self-hosted deployments.

**No schema validation on incoming JSON** — `connection_handler.py` (lines 136–147) deserializes with `json.loads()` followed only by a dict type check, then passes the result directly to `requests.parse_dict()`. There's no size limit or structural validation, risking DoS via deeply nested payloads.

**No rate limiting** — The connection handler accepts unlimited requests per connection with no backpressure. The Tornado queue has no max-size guard.

### Error Handling

**Silent failures in request processing** — `request_managers.py` (lines 1584–1589) catches only `DiplomacyException`; unexpected exceptions crash silently without logging. None of the 41 `on_*` handler functions have internal try/catch blocks.

**Fire-and-forget async operations** — Server methods like `schedule_game()` and `save_server()` are called without awaiting results. If disk I/O or notification delivery fails, the failure goes unnoticed.

**No logging on parse errors** — `connection_handler.py` catches `ValueError` during JSON parsing but never writes to `LOGGER`, making it very difficult to debug malformed client messages.

### Performance

**Widespread `deepcopy` usage (33+ instances)** — Found throughout `engine/game.py` and utility modules. Game objects are large and complex, making this O(n) operation expensive at scale with no snapshot caching strategy.

**Blocking I/O on the event loop** — `server.py` serializes entire game state with `json.dumps()` synchronously. No async file I/O is used, which can block the Tornado event loop during saves and backups.

**Legacy coroutine pattern** — The codebase uses Tornado's `@gen.coroutine` decorator (Tornado 4.x era) rather than native `async/await`. This limits interoperability with modern Python async libraries.

### Code Quality

**God classes** — `Server` (server.py, 1040 lines) manages game lifecycle, user auth, notifications, scheduling, and file I/O in one class. `Game` (engine/game.py) has a `# pylint: disable=too-many-lines` comment at the top, confirming it's excessively large. Both need decomposition.

**Incomplete type hints** — `server.py` uses old-style `# type:` comments. `request_managers.py` has zero type hints across 41 handler functions. Modern PEP 484/585 annotations would greatly help IDE support and static analysis.

**Magic constants** — `engine/game.py` (lines 58–67) defines `UNDETERMINED=0`, `POWER=1`, etc. as plain integers. These should be Python `Enum` types for type safety.

**Scattered configuration** — `settings.py` has only 4 settings while `SERVER_GAME_RULES` is hardcoded in `request_managers.py` and timeout values (30/60 seconds) are hardcoded in `integration/base_api.py`. No centralized config management.

### API Design

**No middleware/pipeline pattern** — All requests funnel through a single `handle_request()` with a MAPPING dict (request_managers.py:1566). There's no interceptor chain for cross-cutting concerns like auth, logging, or validation.

**Inconsistent request validation** — `clear_orders` validates that the phase matches the server; other requests don't. There's no centralized request schema validation layer.

**Broadcast-only notifications** — The notifier broadcasts to all connected users, filtering only by token. There are no subscription channels or targeted delivery mechanisms.

### Observability

**Zero logging in request handlers** — `request_managers.py` has no `LOGGER` calls in any handler. User actions cannot be audited and failures can't be diagnosed without adding instrumentation.

---

## JavaScript Frontend

### Architecture

**3,300-line god component** — `content_game.jsx` is a single React class component with 56+ `setState` calls managing orders, messages, game state, and UI tabs. This causes unnecessary full-tree re-renders and violates single-responsibility. It should be decomposed into OrderPanel, MapContainer, ChatPanel, and StatsPanel sub-components.

**Mixed paradigms** — `MessageInputArea` correctly uses functional components with hooks, but the main game view still uses `React.Component`. The codebase should migrate to functional components throughout.

**Zero memoization** — No instances of `React.memo`, `useMemo`, or `shouldComponentUpdate`. Every state change in the game view forces a re-render of all children, including the complex SVG map.

### WebSocket & API Client

**No exponential backoff on reconnection** — `channel.js` (lines 67–72) uses a fixed `REQUEST_TIMEOUT_SECONDS`. Rapid reconnection attempts after failures could overload the server.

**Stale closure risk** — `connection.js` (lines 38–44) captures a `reconnection` object in a closure. If `reconnect()` is called twice before the first completes, a race condition can occur.

**Silent order loss** — Phase-dependent requests (line 104) silently discard stale requests without notifying the user that their submitted orders may have been lost.

### Forms & Validation

**Array index used as React key** — `power_order_creation_form.jsx` (line 52) and `forms.jsx` (line 146) use array indices as keys. If lists are reordered or filtered, React will misidentify elements, causing subtle UI bugs.

**No field-level validation** — `forms.jsx` creates inline callbacks without debouncing. Rapid changes bypass validation entirely.

### Map Rendering

**Unmemoized SVG handlers** — `SvgStandard.js` (lines 42–49) creates new onClick/onHover function references on every render. With frequent game updates, this causes unnecessary re-binds.

**`var` instead of `let/const`** — `SvgStandard.js` (lines 61, 69, 78) uses `var` and re-declares loop variables, creating scope confusion in callbacks.

**No lazy loading** — Large SVG map files (e.g., `SvgAncMed.js` at 1,112 lines) embed all coordinate data inline with no code splitting or lazy loading.

### Security & Storage

**Passwords stored in plaintext** — `dipStorage.jsx` saves the connection object (including `password`) to `localStorage` without encryption. Should use session tokens only.

**No try/catch around localStorage** — `dipStorage.jsx` (lines 37–38, 56–57) calls `JSON.parse`/`JSON.stringify` without error handling. If storage is full or disabled, user data is silently lost.

### Dependencies & Config

**Two CSS frameworks** — `package.json` includes both Bootstrap 4 and MUI 6, risking style conflicts. The custom row/col divs in `layouts.jsx` duplicate Bootstrap's grid.

**ESLint rules too permissive** — `.eslintrc` sets `jsx-key`, `no-prototype-builtins`, and `prop-types` to "warn" rather than "error". CI doesn't enforce these.

**Outdated dependency** — `react-shortcut` v1.0.6 is from 2019 and misses modern keyboard event handling patterns.

### Accessibility

**Missing ARIA labels** — SVG map elements in `SvgStandard` have no `role` or `aria-label` attributes. Form labels in `forms.jsx` are inconsistently linked to inputs. No keyboard navigation paths exist for the order-building UI.
