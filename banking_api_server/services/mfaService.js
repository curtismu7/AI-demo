const axios = require("axios");
const configStore = require("./configStore");
const { getTokenEndpoint, getIssuer } = require("./oauthEndpointResolver");

function _authBaseUrl() {
	return getIssuer();
}

function _apiBaseUrl() {
	const region = configStore.getEffective("pingone_region") || "com";
	const envId = configStore.getEffective("pingone_environment_id");
	return `https://api.pingone.${region}/v1/environments/${envId}`;
}

async function _getWorkerToken() {
	const envId = configStore.getEffective("pingone_environment_id");
	// Use PINGONE_WORKER_TOKEN credentials, falling back to management credentials
	const clientId =
		process.env.PINGONE_WORKER_TOKEN_CLIENT_ID ||
		configStore.getEffective("pingone_worker_token_client_id") ||
		configStore.getEffective("pingone_mgmt_client_id") ||
		configStore.getEffective("PINGONE_MANAGEMENT_CLIENT_ID");
	const clientSecret =
		process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET ||
		configStore.getEffective("pingone_worker_token_client_secret") ||
		configStore.getEffective("pingone_mgmt_client_secret") ||
		configStore.getEffective("PINGONE_MANAGEMENT_CLIENT_SECRET");
	const authMethod = (
		process.env.PINGONE_WORKER_TOKEN_AUTH_METHOD || "basic"
	).toLowerCase();
	if (!envId || !clientId || !clientSecret)
		throw new Error(
			"PingOne worker credentials not configured. Set PINGONE_WORKER_TOKEN_CLIENT_ID/SECRET or pingone_mgmt_client_id/secret via the Worker App tab at /config.",
		);
	const tokenUrl = getTokenEndpoint();
	const body = new URLSearchParams({ grant_type: "client_credentials" });
	const reqConfig = {
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		timeout: 10000,
	};
	if (authMethod === "post") {
		body.set("client_id", clientId);
		body.set("client_secret", clientSecret);
	} else {
		reqConfig.auth = { username: clientId, password: clientSecret };
	}
	const resp = await axios.post(tokenUrl, body.toString(), reqConfig);
	return resp.data.access_token;
}

let _cachedDefaultPolicyId = null;

async function _getDefaultMfaPolicy() {
	if (_cachedDefaultPolicyId) return _cachedDefaultPolicyId;
	const workerToken = await _getWorkerToken();
	const { data } = await axios.get(`${_apiBaseUrl()}/mfaPolicies`, {
		headers: { Authorization: `Bearer ${workerToken}` },
		timeout: 10000,
	});
	const policies = data._embedded?.mfaPolicies || [];
	const def = policies.find((p) => p.default === true) || policies[0];
	if (!def) throw new Error("No MFA policies found in PingOne environment");
	console.log("[MFA] resolved default policy id=%s name=%s", def.id, def.name);
	_cachedDefaultPolicyId = def.id;
	return def.id;
}

function _wrapError(fnName, err) {
	const pingErr = err.response?.data;
	console.error(`[MFA] ${fnName} failed:`, pingErr || err.message);
	const e = new Error(
		pingErr?.message || pingErr?.detail || "MFA operation failed",
	);
	e.status = err.response?.status || 500;
	e.pingError = pingErr;
	if (err._debug) e._debug = err._debug;
	// Attach semantic code for challenge lifecycle errors
	const status = err.response?.status;
	if (status === 401) e.code = "token_expired";
	else if (status === 404 || status === 410) e.code = "challenge_expired";
	return e;
}

/**
 * Initiate PingOne deviceAuthentications for a user.
 * Uses the user's own access token (not worker token).
 * Returns { id (daId), status, _embedded: { devices[] } }
 * Status at this point: DEVICE_SELECTION_REQUIRED
 */
async function initiateDeviceAuth(userId, userAccessToken) {
	let policyId = configStore.getEffective("pingone_mfa_policy_id");
	if (!policyId) {
		console.log(
			"[MFA] PINGONE_MFA_POLICY_ID not set — resolving default policy from PingOne",
		);
		try {
			policyId = await _getDefaultMfaPolicy();
		} catch (resolveErr) {
			const e = new Error(
				"PINGONE_MFA_POLICY_ID is not configured and default policy could not be resolved: " +
					resolveErr.message,
			);
			e.status = 503;
			e.code = "mfa_not_configured";
			throw e;
		}
	}
	const url = `${_authBaseUrl()}/deviceAuthentications`;
	const reqBody = { user: { id: userId }, policy: { id: policyId } };
	const debugRequest = {
		method: "POST",
		url: url,
		body: reqBody,
		contentType: "application/json",
	};
	try {
		let data;
		try {
			const resp = await axios.post(url, reqBody, {
				headers: {
					Authorization: `Bearer ${userAccessToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		console.log("[MFA] initiated deviceAuth daId=%s status=%s", data.id, data.status);
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		throw _wrapError("initiateDeviceAuth", err);
	}
}

/**
 * Select a device to use for authentication.
 * Body: { selectedDevice: { id: deviceId } }
 * Returns updated device authentication status.
 * Status transitions: DEVICE_SELECTION_REQUIRED → OTP_REQUIRED | ASSERTION_REQUIRED | PUSH_CONFIRMATION_REQUIRED
 */
async function selectDevice(daId, deviceId, userAccessToken) {
	const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
	const reqBody = { selectedDevice: { id: deviceId } };
	const debugRequest = {
		method: "PUT",
		url: url,
		body: reqBody,
		contentType: "application/json",
	};
	try {
		let data;
		try {
			const resp = await axios.put(url, reqBody, {
				headers: {
					Authorization: `Bearer ${userAccessToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		throw _wrapError("selectDevice", err);
	}
}

/**
 * Submit an OTP or TOTP code for verification.
 * Body: { selectedDevice: { id: deviceId, otp: "123456" } }
 * Status transitions: OTP_REQUIRED → COMPLETED | FAILED
 */
async function submitOtp(daId, deviceId, otp, userAccessToken) {
	const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
	const reqBody = { selectedDevice: { id: deviceId, otp: String(otp) } };
	const debugRequest = {
		method: "PUT",
		url: url,
		body: reqBody,
		contentType: "application/json",
	};
	try {
		let data;
		try {
			const resp = await axios.put(url, reqBody, {
				headers: {
					Authorization: `Bearer ${userAccessToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		throw _wrapError("submitOtp", err);
	}
}

/**
 * Poll or fetch the current device authentication status.
 * Used for:
 *   - Push: poll until COMPLETED or PUSH_CONFIRMATION_TIMED_OUT
 *   - FIDO2: retrieve publicKeyCredentialRequestOptions (status: ASSERTION_REQUIRED)
 */
async function getDeviceAuthStatus(daId, userAccessToken) {
	try {
		const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
		const { data } = await axios.get(url, {
			headers: { Authorization: `Bearer ${userAccessToken}` },
			timeout: 10000,
		});
		return data;
	} catch (err) {
		throw _wrapError("getDeviceAuthStatus", err);
	}
}

/**
 * Submit a FIDO2/WebAuthn assertion.
 * Body: { assertion: { ... } } — base64-encoded fields from navigator.credentials.get()
 * Status transitions: ASSERTION_REQUIRED → COMPLETED | FAILED
 */
async function submitFido2Assertion(daId, assertion, userAccessToken, origin) {
	try {
		const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
		// PingOne requires the assertion field to be a JSON string (not an object).
		// Ref: PingOne docs "Check Assertion (FIDO Device)" — assertion type: String
		const assertionStr = typeof assertion === 'string' ? assertion : JSON.stringify(assertion);
		const body = {
			origin: origin || "",
			assertion: assertionStr,
			compatibility: "FULL",
		};
		const debugUrl = url;
		const debugRequest = {
			method: "POST",
			url: debugUrl,
			body: { ...body, assertion: "<base64-encoded WebAuthn assertion>" },
			contentType: "application/vnd.pingidentity.assertion.check+json",
		};
		console.log(
			"[MFA] submitFido2Assertion: POST %s origin=%s",
			url,
			body.origin || "(none)",
		);
		let data;
		try {
			const resp = await axios.post(url, body, {
				headers: {
					Authorization: `Bearer ${userAccessToken}`,
					"Content-Type": "application/vnd.pingidentity.assertion.check+json",
				},
				timeout: 15000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		return {
			...data,
			_debug: { request: debugRequest, response: data },
		};
	} catch (err) {
		throw _wrapError("submitFido2Assertion", err);
	}
}

/**
 * List active MFA devices for a user via Management API (worker token).
 * Used for device management UI — NOT required for the step-up challenge flow
 * (deviceAuthentications already returns devices at DEVICE_SELECTION_REQUIRED).
 */
async function listMfaDevices(userId) {
	try {
		const workerToken = await _getWorkerToken();
		const url = `${_apiBaseUrl()}/users/${userId}/devices?filter=(status eq "ACTIVE")`;
		const { data } = await axios.get(url, {
			headers: { Authorization: `Bearer ${workerToken}` },
			timeout: 10000,
		});
		return data._embedded?.devices || [];
	} catch (err) {
		throw _wrapError("listMfaDevices", err);
	}
}

/**
 * Enroll an email OTP device for a user via Management API (worker token).
 * @param {string} userId
 * @param {string} email   - User's email address to enroll
 * Returns { id, type, email, status }
 */
async function enrollEmailDevice(userId, email) {
	try {
		const workerToken = await _getWorkerToken();
		const url = `${_apiBaseUrl()}/users/${userId}/devices`;
		const reqBody = { type: "EMAIL", email };
		const debugRequest = {
			method: "POST",
			url: url,
			body: reqBody,
			contentType: "application/json",
		};
		let data;
		try {
			const resp = await axios.post(url, reqBody, {
				headers: {
					Authorization: `Bearer ${workerToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		console.log("[MFA] enrolled email device userId=%s deviceId=%s", userId, data.id);
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		throw _wrapError("enrollEmailDevice", err);
	}
}

/**
 * Enroll an SMS OTP device for a user.
 * When called with the user's own access token, PingOne uses the user-facing enrollment
 * flow which sends an OTP and returns ACTIVATION_REQUIRED (phone verification required).
 * When called with a worker token only, PingOne creates the device as ACTIVE immediately.
 * @param {string} userId
 * @param {string} phone  - E.164 format e.g. +15551234567
 * @param {string} [userAccessToken] - user's OIDC access token; if provided, forces OTP flow
 * Returns { id, type, phone, status }
 */
async function enrollSmsDevice(userId, phone, userAccessToken) {
	try {
		// Prefer user token — PingOne will send OTP and return ACTIVATION_REQUIRED.
		// Fall back to worker token only when no session token is available.
		const token = userAccessToken || (await _getWorkerToken());
		const url = `${_apiBaseUrl()}/users/${userId}/devices`;
		const reqBody = { type: "SMS", phone };
		const debugRequest = {
			method: "POST",
			url: url,
			body: reqBody,
			contentType: "application/json",
		};
		let data;
		try {
			const resp = await axios.post(url, reqBody, {
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		console.log(
			"[MFA] enrolled SMS device userId=%s deviceId=%s status=%s (token-source=%s)",
			userId, data.id, data.status, userAccessToken ? "user" : "worker",
		);
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		// If user token cannot access device enrollment, retry with worker token.
		// PingOne may return 401 or 403 for this path depending on app/resource setup.
		const status = err.response?.status;
		const pingMsg = String(
			err.response?.data?.message || err.response?.data?.error || err.message || "",
		).toLowerCase();
		const accessDenied =
			status === 401 ||
			status === 403 ||
			pingMsg.includes("do not have access") ||
			pingMsg.includes("insufficient") ||
			pingMsg.includes("scope");
		if (userAccessToken && accessDenied) {
			console.warn(
				"[MFA] enrollSmsDevice: user token denied (status=%s), retrying with worker token",
				status,
			);
			return enrollSmsDevice(userId, phone);
		}
		throw _wrapError("enrollSmsDevice", err);
	}
}

/**
 * Complete SMS device enrollment by submitting the OTP sent to the phone.
 * @param {string} userId
 * @param {string} deviceId - from enrollSmsDevice
 * @param {string} otp      - 6-digit code texted to the phone
 * Returns { id, status }
 */
async function completeSmsEnrollment(userId, deviceId, otp) {
	try {
		const workerToken = await _getWorkerToken();
		const url = `${_apiBaseUrl()}/users/${userId}/devices/${deviceId}`;
		const reqBody = { otp };
		const debugRequest = {
			method: "PUT",
			url: url,
			body: reqBody,
			contentType: "application/json",
		};
		let data;
		try {
			const resp = await axios.put(url, reqBody, {
				headers: {
					Authorization: `Bearer ${workerToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			});
			data = resp.data;
		} catch (err) {
			err._debug = { request: debugRequest, response: err.response?.data || null };
			throw err;
		}
		console.log(
			"[MFA] completed SMS enrollment userId=%s deviceId=%s status=%s",
			userId, data.id, data.status,
		);
		return { ...data, _debug: { request: debugRequest, response: data } };
	} catch (err) {
		throw _wrapError("completeSmsEnrollment", err);
	}
}

/**
 * Initiate FIDO2/passkey device registration for a user via Management API.
 * Returns { deviceId, publicKeyCredentialCreationOptions, _debug }
 */
async function initFido2Registration(userId, allowCleanupRetry = true) {
	const workerToken = await _getWorkerToken();
	try {
		const url = `${_apiBaseUrl()}/users/${userId}/devices`;
		const reqBody = { type: "FIDO2", nickname: "My Passkey" };
		const { data } = await axios.post(
			url,
			reqBody,
			{
				headers: {
					Authorization: `Bearer ${workerToken}`,
					"Content-Type": "application/json",
				},
				timeout: 10000,
			},
		);
		console.log(
			"[MFA] initiated FIDO2 registration userId=%s deviceId=%s",
			userId,
			data.id,
		);
		return {
			deviceId: data.id,
			publicKeyCredentialCreationOptions:
				data.publicKeyCredentialCreationOptions,
			_debug: {
				request: { method: "POST", url: url, body: reqBody, contentType: "application/json" },
				response: data,
			},
		};
	} catch (err) {
		const pingErr = err.response?.data;
		const limitReached =
			pingErr?.code === "REQUEST_LIMITED" ||
			(pingErr?.details || []).some((d) => d?.code === "LIMIT_EXCEEDED");
		if (allowCleanupRetry && limitReached) {
			try {
				const active = await listMfaDevices(userId);
				const fidoDevices = active.filter((d) =>
					String(d?.type || "").toUpperCase().startsWith("FIDO2"),
				);
				if (fidoDevices.length > 0) {
					const deviceToRemove = fidoDevices[0];
					const delUrl = `${_apiBaseUrl()}/users/${userId}/devices/${deviceToRemove.id}`;
					await axios.delete(delUrl, {
						headers: { Authorization: `Bearer ${workerToken}` },
						timeout: 10000,
					});
					console.warn(
						"[MFA] initFido2Registration: removed deviceId=%s due to LIMIT_EXCEEDED, retrying",
						deviceToRemove.id,
					);
					return initFido2Registration(userId, false);
				}
			} catch (cleanupErr) {
				console.error(
					"[MFA] initFido2Registration cleanup retry failed:",
					cleanupErr.response?.data || cleanupErr.message,
				);
			}
		}
		throw _wrapError("initFido2Registration", err);
	}
}

/**
 * Complete FIDO2/passkey device registration by sending the WebAuthn attestation.
 * @param {string} userId
 * @param {string} deviceId  - from initFido2Registration
 * @param {object} attestation - base64-encoded fields from navigator.credentials.create()
 *   Must include: id, rawId, type, response.attestationObject, response.clientDataJSON
 *   Origin is appended server-side from PINGONE_FIDO2_ORIGIN env or auth base URL.
 * Returns { id, status }
 */
async function completeFido2Registration(userId, deviceId, attestation, requestOrigin) {
	try {
		const workerToken = await _getWorkerToken();
		const url = `${_apiBaseUrl()}/users/${userId}/devices/${deviceId}`;

		// Origin must match the RP origin where navigator.credentials.create() ran (browser origin).
		// requestOrigin comes from the client (window.location.origin) and takes precedence.
		const origin =
			requestOrigin ||
			configStore.getEffective("pingone_fido2_origin") ||
			process.env.PINGONE_FIDO2_ORIGIN ||
			process.env.REACT_APP_CLIENT_URL ||
			'https://api.pingdemo.com:4000';

		// PingOne requires fido2 to be a JSON string (same convention as assertion field).
		const fido2Str = typeof attestation === 'string' ? attestation : JSON.stringify(attestation);
		const body = {
			fido2: fido2Str,
			origin,
		};

		const debugUrl = url;
		const debugRequest = {
			method: "POST",
			url: debugUrl,
			body,
			contentType: "application/vnd.pingidentity.device.activate+json",
		};
		let data;
		try {
			const resp = await axios.post(url, body, {
				headers: {
					Authorization: `Bearer ${workerToken}`,
					"Content-Type": "application/vnd.pingidentity.device.activate+json",
				},
				timeout: 15000,
			});
			data = resp.data;
		} catch (err) {
			const pingErr = err.response?.data;
			console.error(
				"[MFA] completeFido2Registration failed: status=%s code=%s details=%j",
				err.response?.status,
				pingErr?.code,
				pingErr?.details || pingErr?.message,
			);
			// Attach debug so the route can surface request/response even on failure
			err._debug = { request: debugRequest, response: pingErr || null };
			throw err;
		}

		console.log(
			"[MFA] completed FIDO2 registration userId=%s deviceId=%s status=%s",
			userId,
			deviceId,
			data.status,
		);
		return {
			...data,
			_debug: {
				request: debugRequest,
				response: data,
			},
		};
	} catch (err) {
		throw _wrapError("completeFido2Registration", err);
	}
}

module.exports = {
	initiateDeviceAuth,
	selectDevice,
	submitOtp,
	getDeviceAuthStatus,
	submitFido2Assertion,
	listMfaDevices,
	enrollEmailDevice,
	enrollSmsDevice,
	completeSmsEnrollment,
	initFido2Registration,
	completeFido2Registration,
	getWorkerToken: _getWorkerToken,
	// Test helper — resets the cached default policy ID (used in unit tests)
	_resetDefaultPolicyCache() {
		_cachedDefaultPolicyId = null;
	},
};
