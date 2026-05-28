/*
 * PingOne Authorize — Decision Endpoints API filter.
 *
 * Replicates the Node gateway's PingOneAuthorizeClient.evaluate() call so
 * PingGateway enforces the same P1AZ policy before token exchange.
 *
 * Called after McpValidationFilter (body already parsed by MCP layer) and
 * before OAuth2TokenExchangeFilter (token exchange only for permitted requests).
 *
 * Env vars required:
 *   P1AZ_DECISION_ENDPOINT_URL     — full URL including decision endpoint ID,
 *                                    e.g. https://api.pingone.com/v1/environments/{envId}/decisionEndpoints/{id}
 *   PINGONE_TOKEN_ENDPOINT          — PingOne AS token endpoint for client_credentials grant
 *   P1AZ_WORKER_CLIENT_ID           — client_id of the worker app
 *   P1AZ_WORKER_CLIENT_SECRET       — client_secret of the worker app
 *   PG_GATEWAY_RESOURCE_URI         — inbound audience (e.g. mcpgateway.ping.demo)
 *
 * Token lifecycle:
 *   The script caches the worker token in a script-level binding. On first call
 *   (or after expiry/401), it fetches a fresh token via client_credentials grant.
 *   On 401 from P1AZ, it refreshes once and retries.
 *
 * Decision outcomes:
 *   PERMIT        — allow, continue filter chain
 *   DENY          — 403 Forbidden
 *   INDETERMINATE — 403 Forbidden (HITL not supported at this layer)
 *   error/timeout — 403 Forbidden (fail closed)
 */

import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import org.forgerock.http.protocol.Request
import org.forgerock.http.protocol.Response
import org.forgerock.http.protocol.Status

// ── Read env vars ─────────────────────────────────────────────────────────────
def decisionEndpointUrl  = System.getenv('P1AZ_DECISION_ENDPOINT_URL') ?: ''
def tokenEndpoint        = System.getenv('PINGONE_TOKEN_ENDPOINT') ?: ''
def workerClientId       = System.getenv('P1AZ_WORKER_CLIENT_ID') ?: ''
def workerClientSecret   = System.getenv('P1AZ_WORKER_CLIENT_SECRET') ?: ''
def gatewayResourceUri   = System.getenv('PG_GATEWAY_RESOURCE_URI') ?: ''

// If not configured, pass through (mirrors Node gateway behaviour when P1AZ not wired)
if (!decisionEndpointUrl) {
    logger.info('[P1AZ] Decision endpoint not configured — passing through')
    return next.handle(context, request)
}

// ── Token cache (script-level binding — persists across invocations) ──────────
// PingGateway compiles each Groovy script once per instance; the binding survives
// across requests. We store {token, expiresAt} here to avoid re-fetching every call.
if (!binding.hasVariable('_p1azTokenCache')) {
    binding._p1azTokenCache = [token: null, expiresAt: 0L]
}

def fetchWorkerToken = {
    if (!tokenEndpoint || !workerClientId || !workerClientSecret) {
        logger.warn('[P1AZ] Worker client credentials not configured — cannot obtain token')
        return null
    }
    try {
        def tokenReq = new Request()
        tokenReq.method = 'POST'
        tokenReq.uri = new URI(tokenEndpoint)
        tokenReq.headers.put('Content-Type', 'application/x-www-form-urlencoded')
        def encoded = java.net.URLEncoder.encode(workerClientId, 'UTF-8') + ':' +
                      java.net.URLEncoder.encode(workerClientSecret, 'UTF-8')
        tokenReq.headers.put('Authorization', 'Basic ' + encoded.bytes.encodeBase64().toString())
        tokenReq.entity.setString('grant_type=client_credentials')

        def resp = http.send(context, tokenReq).get()
        def body = new JsonSlurper().parseText(resp.entity.string)
        if (resp.status.code == 200 && body.access_token) {
            def expiresIn = (body.expires_in as long) ?: 3600L
            // Refresh 60 seconds before actual expiry
            binding._p1azTokenCache = [
                token    : body.access_token as String,
                expiresAt: System.currentTimeMillis() + ((expiresIn - 60) * 1000L)
            ]
            logger.info('[P1AZ] Obtained fresh worker token (expires in ' + expiresIn + 's)')
            return body.access_token as String
        } else {
            logger.warn('[P1AZ] Failed to obtain worker token: HTTP ' + resp.status.code + ' ' + body)
            return null
        }
    } catch (Exception e) {
        logger.warn('[P1AZ] Exception fetching worker token: ' + e.message)
        return null
    }
}

def getWorkerToken = {
    def cache = binding._p1azTokenCache
    if (cache.token && System.currentTimeMillis() < cache.expiresAt) {
        return cache.token
    }
    return fetchWorkerToken()
}

// ── Extract validated token claims from introspection context ─────────────────
def tokenInfo   = context.attributes['oauth2AccessToken'] ?: [:]
def sub         = tokenInfo['sub'] ?: ''
def actSub      = tokenInfo['act']?.sub ?: ''
def scope       = tokenInfo['scope'] ?: ''
def tokenScopes = scope.tokenize(' ').join(' ')

// ── Parse JSON-RPC body to extract MCP method and tool info ──────────────────
def mcpMethod         = ''
def toolName          = ''
def transactionAmount = ''
def transactionType   = ''
def toAccountId       = ''

try {
    def bodyBytes = request.entity.string
    if (bodyBytes) {
        def parsed = new JsonSlurper().parseText(bodyBytes)
        mcpMethod = parsed?.method ?: ''
        if (mcpMethod == 'tools/call') {
            toolName          = parsed?.params?.name ?: ''
            def args          = parsed?.params?.arguments ?: [:]
            def amt           = args?.amount
            transactionAmount = amt != null ? String.valueOf(amt) : ''
            transactionType   = args?.transaction_type ?: toolName
            toAccountId       = args?.to_account_id ?: ''
        }
    }
} catch (Exception e) {
    logger.warn('[P1AZ] Failed to parse request body: ' + e.message)
}

def decisionContext = (mcpMethod == 'tools/call') ? 'McpToolCall' : 'McpRequest'

// ── Build parameters block — identical shape to Node gateway ─────────────────
def parameters = [
    DecisionContext   : decisionContext,
    McpMethod         : mcpMethod,
    ToolName          : toolName,
    ClientId          : sub,
    ActClientId       : actSub,
    TokenScopes       : tokenScopes,
    TokenAudience     : gatewayResourceUri,
    TransactionAmount : transactionAmount,
    TransactionType   : transactionType,
    ToAccountId       : toAccountId,
]

def requestBody = JsonOutput.toJson([parameters: parameters])

// ── Call Decision Endpoints API (with 401-triggered token refresh) ─────────────
def callP1AZ = { String token ->
    def p1azRequest = new Request()
    p1azRequest.method = 'POST'
    p1azRequest.uri = new URI(decisionEndpointUrl)
    p1azRequest.headers.put('Content-Type', 'application/json')
    if (token) {
        p1azRequest.headers.put('Authorization', "Bearer ${token}")
    }
    p1azRequest.entity.setString(requestBody)
    return http.send(context, p1azRequest).get()
}

def outcome = 'DENY'
try {
    def workerToken = getWorkerToken()
    def p1azResponse = callP1AZ(workerToken)

    // On 401, clear cache and retry once with a fresh token
    if (p1azResponse.status.code == 401) {
        logger.info('[P1AZ] 401 from decision endpoint — refreshing worker token and retrying')
        binding._p1azTokenCache = [token: null, expiresAt: 0L]
        workerToken = fetchWorkerToken()
        p1azResponse = callP1AZ(workerToken)
    }

    def responseBody = p1azResponse.entity.string
    logger.debug('[P1AZ] Response status: ' + p1azResponse.status.code + ' body: ' + responseBody)

    def parsed = new JsonSlurper().parseText(responseBody)
    outcome = parsed?.decision ?: 'DENY'
} catch (Exception e) {
    logger.warn('[P1AZ] Decision endpoint call failed — failing closed: ' + e.message)
    outcome = 'DENY'
}

logger.info('[P1AZ] Decision: ' + outcome + ' | sub=' + sub + ' | tool=' + toolName + ' | method=' + mcpMethod)

if (outcome == 'PERMIT') {
    return next.handle(context, request)
}

// DENY or INDETERMINATE — fail closed
def denied = new Response(Status.FORBIDDEN)
denied.headers.put('Content-Type', 'application/json')
denied.entity.setString(JsonOutput.toJson([
    error      : 'access_denied',
    decision   : outcome,
    tool       : toolName,
    mcp_method : mcpMethod,
]))
return Promises.newResultPromise(denied)
