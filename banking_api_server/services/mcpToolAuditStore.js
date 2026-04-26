// banking_api_server/services/mcpToolAuditStore.js
/**
 * In-memory audit store for local (in-process) MCP tool calls.
 * Populated by agentBuilder.js toolNode; read by tokenChainService.getMCPToolCalls().
 * Matches the event shape expected by getMCPToolCalls().
 */

const MAX_EVENTS = 200;
const _events = [];

let _chainIndex = 0;

/**
 * Record a tool call event.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.toolName
 * @param {boolean} opts.success
 * @param {number} opts.duration  ms
 * @param {any} [opts.resultJson]
 * @param {string} [opts.summary]
 * @param {object} [opts.userToken]  decoded token payload (sub, scope)
 * @param {boolean} [opts.isDelegated]
 */
function recordToolCall({ userId, toolName, success, duration, resultJson, summary, userToken, isDelegated }) {
	const eventId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	const event = {
		eventId,
		timestamp: new Date().toISOString(),
		userId,
		details: {
			toolName,
			chainIndex: _chainIndex++,
			exchangedToken: isDelegated ? {} : null,
			userToken: userToken
				? { sub: userToken.sub || userId, scope: userToken.scope || [] }
				: { sub: userId, scope: [] },
			result: {
				success,
				duration,
				resultJson: resultJson ?? null,
				summary: summary || (success ? `${toolName} completed` : `${toolName} failed`),
			},
		},
	};
	_events.unshift(event);
	if (_events.length > MAX_EVENTS) _events.length = MAX_EVENTS;
}

/**
 * Return all events, optionally filtered by userId.
 * @param {string} [userId]
 * @returns {object[]}
 */
function getToolCalls(userId) {
	if (!userId) return _events.slice();
	return _events.filter(
		(e) => e.userId === userId || e.details?.userToken?.sub === userId,
	);
}

function clearToolCalls() {
	_events.length = 0;
}

module.exports = { recordToolCall, getToolCalls, clearToolCalls };
