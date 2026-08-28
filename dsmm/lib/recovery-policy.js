const REQUEST_HEADER_REASONS = new Set(["initial", "resume", "change"]);
const TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);
const GOAL_OPERATIONS = new Set(["create", "edit", "pause", "resume", "complete", "block"]);
const GOAL_PHASES = new Set(["active", "paused", "blocked", "complete"]);
const LOWER_KEBAB_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SNAPSHOT_EVENT_KEYS = ["createdAt", "goal", "kind", "operation", "roundsStarted", "updatedAt", "version"];
const CLEAR_EVENT_KEYS = ["cleared", "clearedAt", "kind", "operation", "version"];
const BLOCKED_GOAL_KEYS = ["blockedReason", "id", "maxGoalRounds", "objective", "phase", "revision"];
const UNBLOCKED_GOAL_KEYS = ["id", "maxGoalRounds", "objective", "phase", "revision"];
const CLEAR_REF_KEYS = ["id", "revision"];
const BLOCKED_REASON_KEYS = ["code", "message"];
export function classifyRecoveryFailure(failure, settings) {
    if (!isRecord(failure))
        return { kind: "ignored" };
    const status = failure.status;
    if (typeof status === "number" && Number.isInteger(status) && settings.retryOnStatusCodes.includes(status)) {
        return { kind: "retryable", matchedBy: "status" };
    }
    const code = failure.code;
    if (typeof code === "string" && settings.retryOnCodes.includes(code.toLowerCase())) {
        return { kind: "retryable", matchedBy: "code" };
    }
    return { kind: "ignored" };
}
export function foldAttemptedRecoveryRoutes(events, turn, step) {
    const routes = [];
    let inheritedRoute;
    let targetStarted = false;
    for (const event of events) {
        if (!targetStarted) {
            if (isTargetStepStart(event, turn, step)) {
                targetStarted = true;
                if (inheritedRoute !== undefined)
                    appendUniqueRoute(routes, inheritedRoute);
                continue;
            }
            const route = readHeaderRoute(event);
            if (route !== undefined)
                inheritedRoute = route;
            continue;
        }
        if (endsTargetScope(event))
            break;
        const route = readHeaderRoute(event);
        if (route !== undefined)
            appendUniqueRoute(routes, route);
    }
    return routes;
}
export function foldDurableRecoveryWork(events) {
    let latestTurnStart = -1;
    for (let index = 0; index < events.length; index += 1) {
        if (isTurnStart(events[index]))
            latestTurnStart = index;
    }
    let incompleteTodo = false;
    if (latestTurnStart >= 0) {
        for (let index = latestTurnStart + 1; index < events.length; index += 1) {
            const todos = readTodos(events[index]);
            if (todos !== undefined)
                incompleteTodo = todos.some((todo) => todo.status === "pending" || todo.status === "in_progress");
        }
    }
    let activeGoal = false;
    for (const event of events) {
        const nextActiveGoal = readGoalActivity(event);
        if (nextActiveGoal !== undefined)
            activeGoal = nextActiveGoal;
    }
    return { incompleteTodo, activeGoal };
}
export function selectFallbackRoute({ failedRoute, attemptedRoutes, fallbackRoutes, maxFallbackAttempts }) {
    const cap = Number.isFinite(maxFallbackAttempts) ? Math.floor(maxFallbackAttempts) : 0;
    if (cap <= 0)
        return undefined;
    const attempts = uniqueRoutes(attemptedRoutes);
    if (attempts.slice(1).length >= cap)
        return undefined;
    for (const fallbackRoute of fallbackRoutes) {
        const route = readRoute(fallbackRoute);
        if (route === undefined || sameRoute(route, failedRoute) || attempts.some((attempt) => sameRoute(attempt, route)))
            continue;
        return { ...route };
    }
    return undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}
function isNormalizedNonEmptyString(value) {
    return typeof value === "string" && value !== "" && value === value.trim();
}
function isPositiveSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
function isNonnegativeSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hasExactKeys(value, expectedKeys) {
    const keys = Object.keys(value);
    return keys.length === expectedKeys.length && keys.every((key) => expectedKeys.includes(key));
}
function readRoute(value) {
    if (!isRecord(value) || !isNonEmptyString(value.provider) || !isNonEmptyString(value.model))
        return undefined;
    return { provider: value.provider, model: value.model };
}
function sameRoute(left, right) {
    return left.provider === right.provider && left.model === right.model;
}
function appendUniqueRoute(routes, route) {
    if (!routes.some((candidate) => sameRoute(candidate, route)))
        routes.push({ ...route });
}
function uniqueRoutes(routes) {
    const unique = [];
    for (const candidate of routes) {
        const route = readRoute(candidate);
        if (route !== undefined)
            appendUniqueRoute(unique, route);
    }
    return unique;
}
function eventType(event) {
    return isRecord(event) && typeof event.type === "string" ? event.type : undefined;
}
function eventData(event) {
    return isRecord(event) ? event.data : undefined;
}
function readStepCoordinates(value) {
    if (!isRecord(value) || !isPositiveSafeInteger(value.turn) || !isPositiveSafeInteger(value.step))
        return undefined;
    return { turn: value.turn, step: value.step };
}
function isTargetStepStart(event, turn, step) {
    if (eventType(event) !== "step/start")
        return false;
    const coordinates = readStepCoordinates(eventData(event));
    return coordinates?.turn === turn && coordinates.step === step;
}
function readHeaderRoute(event) {
    if (eventType(event) !== "request/header")
        return undefined;
    const data = eventData(event);
    if (!isRecord(data) || typeof data.reason !== "string" || !REQUEST_HEADER_REASONS.has(data.reason))
        return undefined;
    if (!isRecord(data.header) || !isRecord(data.header.config))
        return undefined;
    return readRoute(data.header.config);
}
function endsTargetScope(event) {
    const type = eventType(event);
    if (type === "step/start" || type === "step/end") {
        const coordinates = readStepCoordinates(eventData(event));
        if (coordinates === undefined)
            return false;
        return true;
    }
    if (type !== "turn/start" && type !== "turn/end")
        return false;
    const data = eventData(event);
    return isRecord(data) && isPositiveSafeInteger(data.turn);
}
function isTurnStart(event) {
    if (eventType(event) !== "turn/start")
        return false;
    const data = eventData(event);
    return isRecord(data) && isPositiveSafeInteger(data.turn);
}
function readTodos(event) {
    if (eventType(event) !== "todo/write")
        return undefined;
    const data = eventData(event);
    if (!isRecord(data) || !Array.isArray(data.todos))
        return undefined;
    const todos = [];
    for (const todo of data.todos) {
        if (!isRecord(todo) || typeof todo.content !== "string" || typeof todo.status !== "string" || !TODO_STATUSES.has(todo.status))
            return undefined;
        todos.push({ status: todo.status });
    }
    return todos;
}
function readGoalActivity(event) {
    if (eventType(event) !== "goal/change")
        return undefined;
    const data = eventData(event);
    if (!isRecord(data) || data.kind !== "goal/change" || data.version !== 1)
        return undefined;
    if (data.operation === "clear") {
        return hasExactKeys(data, CLEAR_EVENT_KEYS) && isValidGoalClear(data) ? false : undefined;
    }
    if (typeof data.operation !== "string" || !hasExactKeys(data, SNAPSHOT_EVENT_KEYS) || !GOAL_OPERATIONS.has(data.operation) || !isValidGoalSnapshot(data))
        return undefined;
    return data.goal.phase === "active";
}
function isValidGoalClear(data) {
    return isRecord(data.cleared)
        && hasExactKeys(data.cleared, CLEAR_REF_KEYS)
        && typeof data.cleared.id === "string"
        && data.cleared.id !== ""
        && isPositiveSafeInteger(data.cleared.revision)
        && isNonnegativeSafeInteger(data.clearedAt);
}
function isValidGoalSnapshot(data) {
    if (!isRecord(data.goal) || typeof data.goal.phase !== "string" || !GOAL_PHASES.has(data.goal.phase))
        return false;
    const expectedGoalKeys = data.goal.phase === "blocked" ? BLOCKED_GOAL_KEYS : UNBLOCKED_GOAL_KEYS;
    if (!hasExactKeys(data.goal, expectedGoalKeys) || typeof data.goal.id !== "string" || data.goal.id === "")
        return false;
    if (!isPositiveSafeInteger(data.goal.revision) || !isNormalizedNonEmptyString(data.goal.objective) || !isPositiveSafeInteger(data.goal.maxGoalRounds))
        return false;
    if (data.goal.phase === "blocked" && !isValidBlockedReason(data.goal.blockedReason))
        return false;
    const roundsStarted = data.roundsStarted;
    const createdAt = data.createdAt;
    const updatedAt = data.updatedAt;
    return isNonnegativeSafeInteger(roundsStarted)
        && isNonnegativeSafeInteger(createdAt)
        && isNonnegativeSafeInteger(updatedAt)
        && updatedAt >= createdAt;
}
function isValidBlockedReason(value) {
    return isRecord(value)
        && hasExactKeys(value, BLOCKED_REASON_KEYS)
        && typeof value.code === "string"
        && LOWER_KEBAB_CODE.test(value.code)
        && isNormalizedNonEmptyString(value.message);
}
//# sourceMappingURL=recovery-policy.js.map