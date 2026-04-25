import { useCallback, useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import { notifyError, notifyInfo, notifySuccess } from "../utils/appToast";
import "./MFATestPage.css";
import ApiCallDisplay from "./ApiCallDisplay";

/**
 * Collapsible per-section API call display toggle (Phase 135)
 */
function SectionApiCalls() {
	const [open, setOpen] = useState(false);
	return (
		<div className="section-api-calls">
			<button
				type="button"
				className="section-api-toggle"
				onClick={() => setOpen((o) => !o)}
			>
				{open ? "▾ Hide API Calls" : "▸ Show API Calls"}
			</button>
			{open && <ApiCallDisplay sessionId="mfa-test" />}
		</div>
	);
}

/**
 * MFATestPage — comprehensive test page for PingOne MFA functionality
 * Tests: SMS OTP, Email OTP, FIDO2/passkey, Device enrollment, Device management
 * Chase.com-style UI with test cards and fix buttons
 */
export default function MFATestPage() {
	const [config, setConfig] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	// User override — allows testing MFA for any PingOne user (userId or username)
	const [testUserId, setTestUserId] = useState("");

	// SMS OTP test state
	const [smsInitiateStatus, setSmsInitiateStatus] = useState("pending");
	const [smsInitiateError, setSmsInitiateError] = useState(null);
	const [smsDaId, setSmsDaId] = useState(null);
	const [smsDevices, setSmsDevices] = useState([]);
	const [smsOtp, setSmsOtp] = useState("");
	const [smsVerifyStatus, setSmsVerifyStatus] = useState("pending");
	const [smsVerifyError, setSmsVerifyError] = useState(null);

	// Email OTP test state
	const [emailInitiateStatus, setEmailInitiateStatus] = useState("pending");
	const [emailInitiateError, setEmailInitiateError] = useState(null);
	const [emailDaId, setEmailDaId] = useState(null);
	const [emailDevices, setEmailDevices] = useState([]);
	const [emailOtp, setEmailOtp] = useState("");
	const [emailVerifyStatus, setEmailVerifyStatus] = useState("pending");
	const [emailVerifyError, setEmailVerifyError] = useState(null);

	// FIDO2 test state (Task 5 - WebAuthn API integration placeholder)
	const [fidoInitiateStatus, setFidoInitiateStatus] = useState("pending");
	const [fidoInitiateError, setFidoInitiateError] = useState(null);
	const [fidoDaId, setFidoDaId] = useState(null);

	// Device management state
	const [devices, setDevices] = useState([]);
	const [devicesStatus, setDevicesStatus] = useState("pending");
	const [devicesError, setDevicesError] = useState(null);

	// Enrollment state
	const [enrollSmsPhone, setEnrollSmsPhone] = useState("");
	const [enrollSmsCountryCode, setEnrollSmsCountryCode] = useState("+1");
	const [enrollSmsInitStatus, setEnrollSmsInitStatus] = useState("pending");
	const [enrollSmsInitError, setEnrollSmsInitError] = useState(null);
	const [enrollSmsDeviceId, setEnrollSmsDeviceId] = useState(null);
	const [enrollSmsAlreadyActive, setEnrollSmsAlreadyActive] = useState(false);
	const [enrollSmsOtp, setEnrollSmsOtp] = useState("");
	const [enrollSmsCompleteStatus, setEnrollSmsCompleteStatus] = useState("pending");
	const [enrollSmsCompleteError, setEnrollSmsCompleteError] = useState(null);
	const [enrollEmailStatus, setEnrollEmailStatus] = useState("pending");
	const [enrollEmailError, setEnrollEmailError] = useState(null);
	const [enrollEmailInput, setEnrollEmailInput] = useState("");
	const [fidoEnrollInitStatus, setFidoEnrollInitStatus] = useState("pending");
	const [fidoEnrollInitError, setFidoEnrollInitError] = useState(null);

	// FIDO2 challenge + verify state
	const [fidoChallengeOptions, setFidoChallengeOptions] = useState(null);
	const [fidoVerifyStatus, setFidoVerifyStatus] = useState("pending");
	const [fidoVerifyError, setFidoVerifyError] = useState(null);

	// FIDO2 enrollment complete state
	const [fidoEnrollData, setFidoEnrollData] = useState(null);
	const [fidoEnrollCompleteStatus, setFidoEnrollCompleteStatus] =
		useState("pending");
	const [fidoEnrollCompleteError, setFidoEnrollCompleteError] = useState(null);

	// FIDO2 PingOne request/response debug state
	const [fidoEnrollInitPingoneReq, setFidoEnrollInitPingoneReq] = useState(null);
	const [fidoEnrollInitPingoneRes, setFidoEnrollInitPingoneRes] = useState(null);
	const [fidoEnrollCompletePingoneReq, setFidoEnrollCompletePingoneReq] = useState(null);
	const [fidoEnrollCompletePingoneRes, setFidoEnrollCompletePingoneRes] = useState(null);
	const [fidoVerifyPingoneReq, setFidoVerifyPingoneReq] = useState(null);
	const [fidoVerifyPingoneRes, setFidoVerifyPingoneRes] = useState(null);

	// Worker token state (shared with PingOne test page)
	const [workerTokenStatus, setWorkerTokenStatus] = useState(null);
	const [workerTokenError, setWorkerTokenError] = useState(null);

	// Auto-enrollment state: when challenge initiated but no device enrolled
	const [autoEnrollFido, setAutoEnrollFido] = useState(false);
	const [noFidoDeviceDetected, setNoFidoDeviceDetected] = useState(false);
	const [autoEnrollSms, setAutoEnrollSms] = useState(false);
	const [noSmsDeviceDetected, setNoSmsDeviceDetected] = useState(false);
	const [autoEnrollEmail, setAutoEnrollEmail] = useState(false);
	const [noEmailDeviceDetected, setNoEmailDeviceDetected] = useState(false);

	// Raw P1 response state — one per action
	const [rawSmsInitiate, setRawSmsInitiate] = useState(null);
	const [rawSmsVerify, setRawSmsVerify] = useState(null);
	const [rawEmailInitiate, setRawEmailInitiate] = useState(null);
	const [rawEmailVerify, setRawEmailVerify] = useState(null);
	const [rawFidoInitiate, setRawFidoInitiate] = useState(null);
	const [rawFidoVerify, setRawFidoVerify] = useState(null);
	const [rawEnrollSmsInit, setRawEnrollSmsInit] = useState(null);
	const [rawEnrollSmsComplete, setRawEnrollSmsComplete] = useState(null);
	const [rawEnrollEmail, setRawEnrollEmail] = useState(null);
	const [rawFidoEnrollInit, setRawFidoEnrollInit] = useState(null);
	const [rawFidoEnrollComplete, setRawFidoEnrollComplete] = useState(null);
	const [rawDevices, setRawDevices] = useState(null);

	const loadConfig = useCallback(async () => {
		try {
			const { data } = await apiClient.get("/api/mfa/test/config");
			if (data.success !== false) {
				setConfig(data);
				setLoading(false);
			} else {
				setError(`Failed to load config: ${data.error}`);
				setLoading(false);
			}
		} catch (err) {
			console.error("Config error:", err);
			setError(`Failed to load config: ${err.message}`);
			setLoading(false);
		}
	}, []);

	const loadDevices = useCallback(async () => {
		try {
			setDevicesStatus("pending");
			setDevicesError(null);
			const params = testUserId ? `?userId=${encodeURIComponent(testUserId)}` : "";
			const { data } = await apiClient.get(`/api/mfa/test/integration/devices${params}`);
			setRawDevices(data);
			if (data.success) {
				setDevices(data.devices || []);
				setDevicesStatus("passed");
			} else {
				setDevicesStatus("failed");
				setDevicesError(data.error);
			}
		} catch (err) {
			setRawDevices({ error: err.message });
			console.error("Devices error:", err);
			setDevicesStatus("failed");
			setDevicesError(err.message);
		}
	}, [testUserId]);

	const loadWorkerToken = useCallback(async () => {
		try {
			const { data } = await apiClient.get("/api/mfa/test/worker-token");
			if (data.success) {
				setWorkerTokenStatus("valid");
				setWorkerTokenError(null);
				notifySuccess("Worker token fetched successfully");
			} else {
				setWorkerTokenStatus("error");
				setWorkerTokenError(data.error || "Failed to fetch worker token");
				notifyError(data.error || "Failed to fetch worker token");
			}
		} catch (err) {
			setWorkerTokenStatus("error");
			setWorkerTokenError(err.message);
			notifyError(`Worker token error: ${err.message}`);
		}
	}, []);

	useEffect(() => {
		loadConfig();
		loadWorkerToken();
	}, [loadConfig, loadWorkerToken]);

	// Auto-enroll FIDO2 if challenge initiated but no device enrolled
	// (i.e., no WebAuthn options arrive after 5 seconds)
	useEffect(() => {
		if (
			fidoInitiateStatus === "passed" &&
			fidoDaId &&
			!fidoChallengeOptions &&
			!autoEnrollFido
		) {
			const timer = setTimeout(() => {
				// No options arrived — user doesn't have FIDO2 enrolled
				setNoFidoDeviceDetected(true);
				setAutoEnrollFido(true);
				notifyInfo("No FIDO2 device found. Starting automatic enrollment…");
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [fidoInitiateStatus, fidoDaId, fidoChallengeOptions, autoEnrollFido]);

	// Auto-enroll SMS if challenge initiated but no SMS device enrolled
	useEffect(() => {
		if (
			smsInitiateStatus === "passed" &&
			smsDaId &&
			smsDevices.length === 0 &&
			!autoEnrollSms
		) {
			const timer = setTimeout(() => {
				// No SMS device found
				setNoSmsDeviceDetected(true);
				setAutoEnrollSms(true);
				notifyInfo("No SMS device found. Starting automatic enrollment…");
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [smsInitiateStatus, smsDaId, smsDevices, autoEnrollSms]);

	// Auto-enroll Email if challenge initiated but no Email device enrolled
	useEffect(() => {
		if (
			emailInitiateStatus === "passed" &&
			emailDaId &&
			emailDevices.length === 0 &&
			!autoEnrollEmail
		) {
			const timer = setTimeout(() => {
				// No Email device found
				setNoEmailDeviceDetected(true);
				setAutoEnrollEmail(true);
				notifyInfo("No Email device found. Starting automatic enrollment…");
			}, 5000);
			return () => clearTimeout(timer);
		}
	}, [emailInitiateStatus, emailDaId, emailDevices, autoEnrollEmail]);

	// SMS OTP test functions
	const testSmsInitiate = useCallback(async () => {
		setSmsInitiateStatus("pending");
		setSmsInitiateError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/initiate",
				{ method: "sms", ...(testUserId && { userId: testUserId }) },
			);
			setRawSmsInitiate(data);
			if (data.success) {
				setSmsDaId(data.daId);
				setSmsDevices(data.devices || []);
				setSmsInitiateStatus("passed");
				notifySuccess("SMS OTP challenge initiated successfully");
			} else {
				setSmsInitiateStatus("failed");
				setSmsInitiateError(data.error);
				notifyError(`SMS OTP initiation failed: ${data.error}`);
			}
		} catch (err) {
			setRawSmsInitiate({ error: err.message });
			setSmsInitiateStatus("failed");
			setSmsInitiateError(err.message);
			notifyError(`SMS OTP initiation failed: ${err.message}`);
		}
	}, [testUserId]);

	const testSmsVerify = useCallback(async () => {
		if (!smsDaId || !smsOtp || smsDevices.length === 0) {
			notifyError("Please initiate SMS challenge and enter OTP code");
			return;
		}
		setSmsVerifyStatus("pending");
		setSmsVerifyError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/verify-otp",
				{
					daId: smsDaId,
					deviceId: smsDevices[0].id,
					otp: smsOtp,
					...(testUserId && { userId: testUserId }),
				},
			);
			setRawSmsVerify(data);
			if (data.success) {
				setSmsVerifyStatus(data.completed ? "passed" : "pending");
				if (data.completed) {
					notifySuccess("SMS OTP verified successfully");
				} else {
					notifyInfo("SMS OTP verification in progress");
				}
			} else {
				setSmsVerifyStatus("failed");
				setSmsVerifyError(data.error);
				notifyError(`SMS OTP verification failed: ${data.error}`);
			}
		} catch (err) {
			setRawSmsVerify({ error: err.message });
			setSmsVerifyStatus("failed");
			setSmsVerifyError(err.message);
			notifyError(`SMS OTP verification failed: ${err.message}`);
		}
	}, [smsDaId, smsDevices, smsOtp]);

	// Email OTP test functions
	const testEmailInitiate = useCallback(async () => {
		setEmailInitiateStatus("pending");
		setEmailInitiateError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/initiate",
				{ method: "email", ...(testUserId && { userId: testUserId }) },
			);
			setRawEmailInitiate(data);
			if (data.success) {
				setEmailDaId(data.daId);
				setEmailDevices(data.devices || []);
				setEmailInitiateStatus("passed");
				notifySuccess("Email OTP challenge initiated successfully");
			} else {
				setEmailInitiateStatus("failed");
				setEmailInitiateError(data.error);
				notifyError(`Email OTP initiation failed: ${data.error}`);
			}
		} catch (err) {
			setRawEmailInitiate({ error: err.message });
			setEmailInitiateStatus("failed");
			setEmailInitiateError(err.message);
			notifyError(`Email OTP initiation failed: ${err.message}`);
		}
	}, [testUserId]);

	const testEmailVerify = useCallback(async () => {
		if (!emailDaId || !emailOtp || emailDevices.length === 0) {
			notifyError("Please initiate Email challenge and enter OTP code");
			return;
		}
		setEmailVerifyStatus("pending");
		setEmailVerifyError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/verify-otp",
				{
					daId: emailDaId,
					deviceId: emailDevices[0].id,
					otp: emailOtp,
					...(testUserId && { userId: testUserId }),
				},
			);
			setRawEmailVerify(data);
			if (data.success) {
				setEmailVerifyStatus(data.completed ? "passed" : "pending");
				if (data.completed) {
					notifySuccess("Email OTP verified successfully");
				} else {
					notifyInfo("Email OTP verification in progress");
				}
			} else {
				setEmailVerifyStatus("failed");
				setEmailVerifyError(data.error);
				notifyError(`Email OTP verification failed: ${data.error}`);
			}
		} catch (err) {
			setRawEmailVerify({ error: err.message });
			setEmailVerifyStatus("failed");
			setEmailVerifyError(err.message);
			notifyError(`Email OTP verification failed: ${err.message}`);
		}
	}, [emailDaId, emailDevices, emailOtp]);

	// FIDO2 test functions
	const testFidoInitiate = useCallback(async () => {
		setFidoInitiateStatus("pending");
		setFidoInitiateError(null);
		setFidoChallengeOptions(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/initiate",
				{ method: "fido2", ...(testUserId && { userId: testUserId }) },
			);
			setRawFidoInitiate(data);
			if (data.success) {
				setFidoDaId(data.daId);
				setFidoInitiateStatus("passed");
				notifySuccess(
					"FIDO2 challenge initiated — polling for WebAuthn options…",
				);
				// Poll for publicKeyCredentialRequestOptions from challenge status
				try {
					const statusResp = await apiClient.get(
						`/api/mfa/test/integration/challenge/${data.daId}/status`,
					);
					if (statusResp.data.publicKeyCredentialRequestOptions) {
						setFidoChallengeOptions(
							statusResp.data.publicKeyCredentialRequestOptions,
						);
					}
				} catch (_e) {
					/* non-fatal — options may not be ready yet */
				}
			} else {
				setFidoInitiateStatus("failed");
				setFidoInitiateError(data.error);
				notifyError(`FIDO2 initiation failed: ${data.error}`);
			}
		} catch (err) {
			setRawFidoInitiate({ error: err.message });
			setFidoInitiateStatus("failed");
			setFidoInitiateError(err.message);
			notifyError(`FIDO2 initiation failed: ${err.message}`);
		}
	}, [testUserId]);

	const testFidoVerify = useCallback(async () => {
		if (!fidoDaId || !fidoChallengeOptions) {
			notifyError("Initiate FIDO2 challenge first, then use your passkey");
			return;
		}
		setFidoVerifyStatus("pending");
		setFidoVerifyError(null);
		try {
			if (!navigator.credentials)
				throw new Error("WebAuthn not supported in this browser");

			// Safe base64 decode helper
			const safeBase64ToBytes = (str) => {
				try {
					return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
				} catch (e) {
					// If decoding fails, try treating as UTF-8 string
					if (typeof str === "string") {
						const bytes = new Uint8Array(str.length);
						for (let i = 0; i < str.length; i++) {
							bytes[i] = str.charCodeAt(i);
						}
						return bytes;
					}
					throw e;
				}
			};

			const opts = {
				...fidoChallengeOptions,
				challenge: safeBase64ToBytes(fidoChallengeOptions.challenge),
			};
			const assertion = await navigator.credentials.get({ publicKey: opts });
			const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
			const assertionPayload = {
				id: assertion.id,
				rawId: toB64(assertion.rawId),
				type: assertion.type,
				response: {
					clientDataJSON: toB64(assertion.response.clientDataJSON),
					authenticatorData: toB64(assertion.response.authenticatorData),
					signature: toB64(assertion.response.signature),
					userHandle: assertion.response.userHandle
						? toB64(assertion.response.userHandle)
						: null,
				},
			};
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/verify-fido2",
				{
					daId: fidoDaId,
					assertion: assertionPayload,
					...(testUserId && { userId: testUserId }),
				},
			);
			setRawFidoVerify(data);
			if (data.success) {
				setFidoVerifyStatus(data.completed ? "passed" : "pending");
				if (data.pingoneRequest) setFidoVerifyPingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoVerifyPingoneRes(data.pingoneResponse);
				notifySuccess(
					data.completed
						? "FIDO2 verified ✓"
						: "FIDO2 verification in progress",
				);
			} else {
				setFidoVerifyStatus("failed");
				setFidoVerifyError(data.error);
				if (data.pingoneRequest) setFidoVerifyPingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoVerifyPingoneRes(data.pingoneResponse);
				notifyError(`FIDO2 verification failed: ${data.error}`);
			}
		} catch (err) {
			const errData = err?.response?.data;
			const detail = errData?.error || errData?.message || err.message;
			setRawFidoVerify(errData || { error: detail });
			setFidoVerifyStatus("failed");
			setFidoVerifyError(detail);
			if (errData?.pingoneRequest) setFidoVerifyPingoneReq(errData.pingoneRequest);
			if (errData?.pingoneResponse) setFidoVerifyPingoneRes(errData.pingoneResponse);
			notifyError(`FIDO2 verification error: ${detail}`);
		}
	}, [fidoDaId, fidoChallengeOptions]);

	// Device enrollment functions
	const testEnrollSmsInit = useCallback(async () => {
		if (!enrollSmsPhone.trim()) {
			notifyError("Enter your phone number");
			return;
		}
		// Build E.164: dial code + local digits (strip non-digits and leading zeros)
		const dialCode = enrollSmsCountryCode.split("-")[0];
		const localPart = enrollSmsPhone.trim().replace(/\D/g, "").replace(/^0+/, "");
		const e164 = `${dialCode}${localPart}`;
		setEnrollSmsInitStatus("pending");
		setEnrollSmsInitError(null);
		setEnrollSmsDeviceId(null);
		setEnrollSmsAlreadyActive(false);
		setEnrollSmsOtp("");
		setEnrollSmsCompleteStatus("pending");
		setEnrollSmsCompleteError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/enroll-sms-init",
				{ phone: e164, ...(testUserId && { userId: testUserId }) },
			);
			setRawEnrollSmsInit(data);
			if (data.success) {
				setEnrollSmsDeviceId(data.deviceId);
				setEnrollSmsInitStatus("passed");
				if (data.status === "ACTIVE") {
					// Management API enrolled the device directly as active — no OTP needed
					setEnrollSmsAlreadyActive(true);
					setEnrollSmsCompleteStatus("passed");
					notifySuccess(`SMS device enrolled and active for ${data.phone || e164}`);
					loadDevices();
				} else {
					notifySuccess(`SMS device created — OTP sent to ${data.phone || e164}`);
				}
			} else {
				setEnrollSmsInitStatus("failed");
				setEnrollSmsInitError(data.error);
				notifyError(`SMS enrollment failed: ${data.error}`);
			}
		} catch (err) {
			const detail =
				err?.response?.data?.error ||
				err?.response?.data?.message ||
				err.message;
			setRawEnrollSmsInit(err?.response?.data || { error: detail });
			setEnrollSmsInitStatus("failed");
			setEnrollSmsInitError(detail);
			notifyError(`SMS enrollment failed: ${detail}`);
		}
	}, [enrollSmsPhone, enrollSmsCountryCode, loadDevices]);

	const testEnrollSmsComplete = useCallback(async () => {
		if (!enrollSmsOtp || enrollSmsOtp.length !== 6) {
			notifyError("Enter the 6-digit OTP sent to your phone");
			return;
		}
		setEnrollSmsCompleteStatus("pending");
		setEnrollSmsCompleteError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/enroll-sms-complete",
				{ deviceId: enrollSmsDeviceId, otp: enrollSmsOtp, ...(testUserId && { userId: testUserId }) },
			);
			setRawEnrollSmsComplete(data);
			if (data.success) {
				setEnrollSmsCompleteStatus("passed");
				notifySuccess("SMS device activated successfully!");
				setEnrollSmsOtp("");
				loadDevices();
			} else {
				setEnrollSmsCompleteStatus("failed");
				setEnrollSmsCompleteError(data.error);
				notifyError(`SMS activation failed: ${data.error}`);
			}
		} catch (err) {
			setRawEnrollSmsComplete({ error: err.message });
			setEnrollSmsCompleteStatus("failed");
			setEnrollSmsCompleteError(err.message);
			notifyError(`SMS activation failed: ${err.message}`);
		}
	}, [enrollSmsDeviceId, enrollSmsOtp, loadDevices]);

	const testEnrollEmail = useCallback(async () => {
		if (!enrollEmailInput || !enrollEmailInput.trim()) {
			notifyError("Please enter an email address");
			return;
		}
		setEnrollEmailStatus("pending");
		setEnrollEmailError(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/enroll-email",
				{ email: enrollEmailInput.trim(), ...(testUserId && { userId: testUserId }) },
			);
			setRawEnrollEmail(data);
			if (data.success) {
				setEnrollEmailStatus("passed");
				notifySuccess("Email device enrolled successfully");
				setEnrollEmailInput("");
				loadDevices(); // Refresh device list
			} else {
				setEnrollEmailStatus("failed");
				setEnrollEmailError(data.error);
				notifyError(`Email enrollment failed: ${data.error}`);
			}
		} catch (err) {
			setRawEnrollEmail({ error: err.message });
			setEnrollEmailStatus("failed");
			setEnrollEmailError(err.message);
			notifyError(`Email enrollment failed: ${err.message}`);
		}
	}, [enrollEmailInput, loadDevices]);

	const testFidoEnrollInit = useCallback(async () => {
		setFidoEnrollInitStatus("pending");
		setFidoEnrollInitError(null);
		setFidoEnrollData(null);
		try {
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/enroll-fido2-init",
				{ ...(testUserId && { userId: testUserId }) },
			);
			setRawFidoEnrollInit(data);
			if (data.success) {
				setFidoEnrollData(data);
				setFidoEnrollInitStatus("passed");
				if (data.pingoneRequest) setFidoEnrollInitPingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoEnrollInitPingoneRes(data.pingoneResponse);
				notifySuccess(
					"FIDO2 enrollment initiated — click Complete Registration to register your device",
				);
			} else {
				setFidoEnrollInitStatus("failed");
				setFidoEnrollInitError(data.error);
				if (data.pingoneRequest) setFidoEnrollInitPingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoEnrollInitPingoneRes(data.pingoneResponse);
				notifyError(`FIDO2 enrollment initiation failed: ${data.error}`);
			}
		} catch (err) {
			const errData = err?.response?.data;
			const detail = errData?.error || errData?.message || err.message;
			setRawFidoEnrollInit(errData || { error: detail });
			setFidoEnrollInitStatus("failed");
			setFidoEnrollInitError(detail);
			if (errData?.pingoneRequest) setFidoEnrollInitPingoneReq(errData.pingoneRequest);
			if (errData?.pingoneResponse) setFidoEnrollInitPingoneRes(errData.pingoneResponse);
			notifyError(`FIDO2 enrollment initiation failed: ${detail}`);
		}
	}, []);

	// Auto-trigger FIDO2 enrollment when challenge initiated but no device enrolled
	useEffect(() => {
		if (autoEnrollFido && fidoEnrollInitStatus === "pending") {
			testFidoEnrollInit();
		}
	}, [autoEnrollFido, fidoEnrollInitStatus, testFidoEnrollInit]);

	// Auto-trigger Email enrollment when challenge initiated but no device enrolled
	useEffect(() => {
		if (autoEnrollEmail && enrollEmailStatus === "pending") {
			testEnrollEmail();
		}
	}, [autoEnrollEmail, enrollEmailStatus, testEnrollEmail]);

	// Note: SMS enrollment is automatic via PingOne profile phone number update
	// No direct enrollment endpoint, but detection alerts user to phone number configuration

	const testFidoEnrollComplete = useCallback(async () => {
		if (
			!fidoEnrollData?.deviceId ||
			!fidoEnrollData?.publicKeyCredentialCreationOptions
		) {
			notifyError("Initiate FIDO2 enrollment first");
			return;
		}
		setFidoEnrollCompleteStatus("pending");
		setFidoEnrollCompleteError(null);
		try {
			if (!navigator.credentials)
				throw new Error("WebAuthn not supported in this browser");
			// PingOne may return publicKeyCredentialCreationOptions as a JSON string
			const rawOpts = fidoEnrollData.publicKeyCredentialCreationOptions;
			const creationOpts =
				typeof rawOpts === "string" ? JSON.parse(rawOpts) : rawOpts;
			if (!creationOpts)
				throw new Error("Missing publicKeyCredentialCreationOptions");
			console.log("[FIDO2] creationOpts challenge:", creationOpts.challenge, "user.id:", creationOpts.user?.id);

			// Convert base64url or signed byte array (PingOne) → Uint8Array
			const safeBase64ToBytes = (val) => {
				if (!val)
					throw new Error(`Expected base64url but got: ${JSON.stringify(val)}`);
				if (val instanceof Uint8Array) return val;
				if (val instanceof ArrayBuffer) return new Uint8Array(val);
				// PingOne sometimes returns signed byte arrays (Java-style) — convert directly
				if (Array.isArray(val)) return new Uint8Array(val.map((b) => b & 0xff));
				// Strip whitespace, normalise base64url alphabet, re-pad
				const stripped = String(val)
					.replace(/\s/g, "")
					.replace(/-/g, "+")
					.replace(/_/g, "/")
					.replace(/=+$/, "");
				const padded = stripped + "=".repeat((4 - (stripped.length % 4)) % 4);
				try {
					return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
				} catch (e) {
					console.error("[FIDO2] atob failed — raw val:", val, "padded:", padded);
					throw new Error(`base64 decode failed (first 20: "${padded.slice(0, 20)}"): ${e.message}`);
				}
			};

			const publicKey = {
				...creationOpts,
				challenge: safeBase64ToBytes(creationOpts.challenge),
				user: {
					...creationOpts.user,
					id: safeBase64ToBytes(creationOpts.user?.id),
				},
			};
			// Convert excludeCredentials ids (PingOne sends base64url strings)
			if (Array.isArray(publicKey.excludeCredentials)) {
				publicKey.excludeCredentials = publicKey.excludeCredentials.map((c) => ({
					...c,
					id: safeBase64ToBytes(c.id),
				}));
			}
			console.log("[FIDO2] publicKey for navigator.credentials.create:", JSON.stringify({
				rpId: publicKey.rp?.id,
				rpName: publicKey.rp?.name,
				authenticatorSelection: publicKey.authenticatorSelection,
				attestation: publicKey.attestation,
				excludeCredentials: (publicKey.excludeCredentials || []).length + " entries",
				pubKeyCredParams: publicKey.pubKeyCredParams,
			}, null, 2));
			const credential = await navigator.credentials.create({ publicKey });
			// PingOne expects base64url encoding (RFC 4648 §5) — no +/= characters
			const toB64url = (buf) => {
				const bytes = new Uint8Array(buf);
				let binary = "";
				for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
				return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
			};
			const attestation = {
				id: credential.id,
				rawId: toB64url(credential.rawId),
				type: credential.type,
				response: {
					clientDataJSON: toB64url(credential.response.clientDataJSON),
					attestationObject: toB64url(credential.response.attestationObject),
				},
			};
			const { data } = await apiClient.post(
				"/api/mfa/test/integration/enroll-fido2-complete",
				{
					deviceId: fidoEnrollData.deviceId,
					attestation,
					...(testUserId && { userId: testUserId }),
				},
			);
			setRawFidoEnrollComplete(data);
			if (data.success) {
				setFidoEnrollCompleteStatus("passed");
				if (data.pingoneRequest) setFidoEnrollCompletePingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoEnrollCompletePingoneRes(data.pingoneResponse);
				notifySuccess("FIDO2 device registered ✓");
				loadDevices();
			} else {
				setFidoEnrollCompleteStatus("failed");
				setFidoEnrollCompleteError(data.error);
				if (data.pingoneRequest) setFidoEnrollCompletePingoneReq(data.pingoneRequest);
				if (data.pingoneResponse) setFidoEnrollCompletePingoneRes(data.pingoneResponse);
				notifyError(`FIDO2 registration failed: ${data.error}`);
			}
		} catch (err) {
			const errData = err?.response?.data;
			const detail = errData?.error || errData?.message || err.message;
			setRawFidoEnrollComplete(errData || { error: detail });
			setFidoEnrollCompleteStatus("failed");
			setFidoEnrollCompleteError(detail);
			if (errData?.pingoneRequest) setFidoEnrollCompletePingoneReq(errData.pingoneRequest);
			if (errData?.pingoneResponse) setFidoEnrollCompletePingoneRes(errData.pingoneResponse);
			notifyError(`FIDO2 registration error: ${detail}`);
		}
	}, [fidoEnrollData, loadDevices]);

	if (loading) {
		return (
			<div className="mfa-test-page">
				<div className="mfa-test-loading">
					<div className="spinner" />
					<p>Loading MFA test environment...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="mfa-test-page">
				<div className="mfa-test-error">
					<p className="error-message">⚠️ {error}</p>
					<button
						type="button"
						className="mfa-test-button mfa-test-button--primary"
						onClick={() => window.location.reload()}
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="mfa-test-page">
			<div className="mfa-test-header">
				<h1 className="mfa-test-title">PingOne MFA Test Page</h1>
				<div className="mfa-test-meta">
					<div className="mfa-test-status">
						<span
							className={`mfa-status-pill ${config?.mfaEnabled && workerTokenStatus === "valid" ? "mfa-status-pill--success" : "mfa-status-pill--error"}`}
						>
							{config?.mfaEnabled && workerTokenStatus === "valid"
								? "✓ Ready"
								: !config?.mfaEnabled
									? "✗ MFA Disabled"
									: "✗ Worker Token Missing"}
						</span>
					</div>
					<div className="mfa-test-actions">
						<button
							type="button"
							className="mfa-test-button mfa-test-button--secondary"
							onClick={loadWorkerToken}
						>
							Refresh Worker Token
						</button>
						<button
							type="button"
							className="mfa-test-button mfa-test-button--secondary"
							onClick={loadDevices}
						>
							Refresh Devices
						</button>
					</div>
				</div>

				{/* User override — test MFA for any PingOne user */}
				<div style={{
					display: "flex", alignItems: "center", gap: 10, margin: "0.75rem 0",
					padding: "0.5rem 0.75rem", background: "#f8fafc", border: "1px solid #e2e8f0",
					borderRadius: 8, fontSize: "0.85rem",
				}}>
					<label htmlFor="mfa-user-override" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
						Test User ID:
					</label>
					<input
						id="mfa-user-override"
						type="text"
						value={testUserId}
						onChange={(e) => setTestUserId(e.target.value.trim())}
						placeholder="Leave empty for session user (bankadmin)"
						style={{
							flex: 1, padding: "6px 10px", border: "1px solid #cbd5e1",
							borderRadius: 6, fontFamily: "monospace", fontSize: "0.85rem",
						}}
					/>
					{testUserId && (
						<button
							type="button"
							onClick={() => { setTestUserId(""); loadDevices(); }}
							style={{
								padding: "4px 10px", border: "1px solid #cbd5e1", borderRadius: 6,
								background: "#fff", cursor: "pointer", fontSize: "0.8rem",
							}}
						>
							Clear
						</button>
					)}
					{testUserId && (
						<span style={{ color: "#2563eb", fontWeight: 500 }}>
							⚠ Using override user
						</span>
					)}
				</div>

				{workerTokenError && (
					<div
						className="mfa-test-info-banner mfa-test-info-banner--error"
						role="alert"
					>
						<strong>⚠️ Worker Token Error:</strong> {workerTokenError}
					</div>
				)}
			</div>

			<div className="mfa-test-content">
				{/* Info banner when using auto-resolved default policy */}
				{config?.policySource === "auto" && (
					<div className="mfa-test-info-banner">
						<strong>ℹ️ Using default MFA policy</strong>
						<p>
							<code>PINGONE_MFA_POLICY_ID</code> is not set — the server will
							automatically resolve the default MFA policy from your PingOne
							environment at runtime.
						</p>
						<p>
							To pin a specific policy: set{" "}
							<code>PINGONE_MFA_POLICY_ID=&lt;id&gt;</code> in your{" "}
							<code>.env</code>.
						</p>
					</div>
				)}

				{/* Configuration Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">MFA Configuration</h2>
					<div className="config-display">
						<div className="config-item">
							<span className="config-label">Policy ID:</span>
							<span className="config-value">
								{config?.policyId || "Not configured"}
							</span>
						</div>
						<div className="config-item">
							<span className="config-label">ACR Value:</span>
							<span className="config-value">
								{config?.acrValue || "Not configured"}
							</span>
						</div>
						<div className="config-item">
							<span className="config-label">Threshold:</span>
							<span className="config-value">
								${config?.threshold?.toFixed(2) || "500.00"}
							</span>
						</div>
					</div>
					<SectionApiCalls />
				</section>

				{/* Device Enrollment Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">Device Enrollment</h2>
					<WhatIsHappening
						title="Device Enrollment — Registering a New MFA Device"
						steps={[
							"SMS enrollment (Step 1): POST enroll-sms-init with phone → PingOne creates SMS device and texts an OTP",
							"SMS enrollment (Step 2): POST enroll-sms-complete with deviceId + OTP → PingOne activates the device",
							"Email enrollment: POST enroll-email → PingOne creates an EMAIL device record for the user",
							"FIDO2 enrollment (Step 1): POST enroll-fido2-init → PingOne returns publicKeyCredentialCreationOptions",
							"FIDO2 enrollment (Step 2): Browser calls navigator.credentials.create() — private key stays in device secure enclave",
							"FIDO2 enrollment (Step 3): POST enroll-fido2-complete with attestation → PingOne stores the public key",
						]}
						apiFlow={[
							{ method: "POST", endpoint: "/api/mfa/test/integration/enroll-sms-init", note: "Create SMS device + send OTP" },
							{ method: "POST", endpoint: "/api/mfa/test/integration/enroll-sms-complete", note: "Activate with OTP" },
							{ method: "POST", endpoint: "/api/mfa/test/integration/enroll-email", note: "Register email device" },
							{ method: "POST", endpoint: "/api/mfa/test/integration/enroll-fido2-init", note: "Get WebAuthn creation options" },
							{ method: "POST", endpoint: "/api/mfa/test/integration/enroll-fido2-complete", note: "Submit attestation" },
						]}
					/>

					{/* ── SMS Enrollment ── */}
					<h3 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>SMS Device</h3>
					<div style={{ marginBottom: "1rem" }}>
						<label
							htmlFor="enroll-sms-phone"
							style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}
						>
							Phone Number:
						</label>
						<div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.25rem" }}>
							<select
								value={enrollSmsCountryCode}
								onChange={(e) => setEnrollSmsCountryCode(e.target.value)}
								style={{
									flexShrink: 0,
									width: "8rem",
									padding: "0.5rem",
									borderRadius: "0.375rem",
									border: "1px solid #d1d5db",
									fontSize: "0.875rem",
								}}
							>
								<option value="+1">🇺🇸 +1 US</option>
								<option value="+1-CA">🇨🇦 +1 CA</option>
								<option value="+44">🇬🇧 +44 UK</option>
								<option value="+61">🇦🇺 +61 AU</option>
								<option value="+64">🇳🇿 +64 NZ</option>
								<option value="+49">🇩🇪 +49 DE</option>
								<option value="+33">🇫🇷 +33 FR</option>
								<option value="+34">🇪🇸 +34 ES</option>
								<option value="+39">🇮🇹 +39 IT</option>
								<option value="+31">🇳🇱 +31 NL</option>
								<option value="+46">🇸🇪 +46 SE</option>
								<option value="+47">🇳🇴 +47 NO</option>
								<option value="+45">🇩🇰 +45 DK</option>
								<option value="+358">🇫🇮 +358 FI</option>
								<option value="+41">🇨🇭 +41 CH</option>
								<option value="+43">🇦🇹 +43 AT</option>
								<option value="+32">🇧🇪 +32 BE</option>
								<option value="+353">🇮🇪 +353 IE</option>
								<option value="+351">🇵🇹 +351 PT</option>
								<option value="+81">🇯🇵 +81 JP</option>
								<option value="+82">🇰🇷 +82 KR</option>
								<option value="+86">🇨🇳 +86 CN</option>
								<option value="+91">🇮🇳 +91 IN</option>
								<option value="+65">🇸🇬 +65 SG</option>
								<option value="+60">🇲🇾 +60 MY</option>
								<option value="+52">🇲🇽 +52 MX</option>
								<option value="+55">🇧🇷 +55 BR</option>
								<option value="+27">🇿🇦 +27 ZA</option>
								<option value="+971">🇦🇪 +971 AE</option>
								<option value="+966">🇸🇦 +966 SA</option>
								<option value="+972">🇮🇱 +972 IL</option>
							</select>
							<input
								id="enroll-sms-phone"
								type="tel"
								className="otp-input"
								placeholder="415 555 0100"
								value={enrollSmsPhone}
								onChange={(e) => setEnrollSmsPhone(e.target.value)}
								maxLength={15}
								style={{ flex: 1, letterSpacing: "0.05rem" }}
							/>
						</div>
						<p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "0 0 0.75rem" }}>
							Digits only, no leading zero — e.g. 415 555 0100
						</p>
					</div>
					<TestCard
						title="Enroll SMS Device"
						status={enrollSmsInitStatus}
						error={enrollSmsInitError}
						onTest={testEnrollSmsInit}
						rawResult={rawEnrollSmsInit}
					/>
					{enrollSmsDeviceId && !enrollSmsAlreadyActive && (
						<div className="otp-verify-section" style={{ marginTop: "0.5rem" }}>
							<p className="info-text" style={{ marginBottom: "0.5rem" }}>
								OTP sent — enter the code from your phone to activate:
							</p>
							<div className="otp-input-group">
								<input
									type="text"
									className="otp-input"
									placeholder="6-digit OTP"
									value={enrollSmsOtp}
									onChange={(e) => setEnrollSmsOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
									maxLength={6}
									autoFocus
								/>
								<button
									type="button"
									className="mfa-test-button mfa-test-button--primary"
									onClick={testEnrollSmsComplete}
									disabled={enrollSmsOtp.length !== 6}
								>
									Activate SMS Device
								</button>
							</div>
							<TestCard
								title="Activate SMS Device (Step 2)"
								status={enrollSmsCompleteStatus}
								error={enrollSmsCompleteError}
								rawResult={rawEnrollSmsComplete}
							/>
						</div>
					)}

					{/* ── Email Enrollment ── */}
					<h3 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>Email Device</h3>
					<div style={{ marginBottom: "1rem" }}>
						<label
							htmlFor="enroll-email-input"
							style={{
								display: "block",
								marginBottom: "0.5rem",
								fontWeight: "600",
							}}
						>
							Email to Enroll:
						</label>
						<input
							id="enroll-email-input"
							type="email"
							className="otp-input"
							placeholder="user@example.com"
							value={enrollEmailInput}
							onChange={(e) => setEnrollEmailInput(e.target.value)}
							maxLength={100}
							style={{ width: "100%", marginBottom: "0.75rem" }}
						/>
					</div>
					<TestCard
						title="Enroll Email Device"
						status={enrollEmailStatus}
						error={enrollEmailError}
						onTest={testEnrollEmail}
						rawResult={rawEnrollEmail}
					/>

					{/* ── FIDO2 Enrollment ── */}
					<h3 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>FIDO2 / Passkey</h3>
					<TestCard
						title="Initiate FIDO2 Enrollment"
						status={fidoEnrollInitStatus}
						error={fidoEnrollInitError}
						onTest={testFidoEnrollInit}
						rawResult={rawFidoEnrollInit}
					/>
					{fidoEnrollData?.publicKeyCredentialCreationOptions && (() => {
						const raw = fidoEnrollData.publicKeyCredentialCreationOptions;
						const opts = typeof raw === "string" ? JSON.parse(raw) : raw;
						const rpId = opts?.rp?.id || "—";
						const rpName = opts?.rp?.name || "—";
						const currentOrigin = window.location.origin;
						const currentHostname = window.location.hostname;
						const match = rpId === currentHostname || currentHostname.endsWith(`.${rpId}`);
						const excludeCount = (opts?.excludeCredentials || []).length;
						const authSel = opts?.authenticatorSelection;
						return (
							<div style={{
								margin: "0.5rem 0",
								padding: "0.75rem 1rem",
								background: match ? "#f0fdf4" : "#fef2f2",
								border: `1px solid ${match ? "#bbf7d0" : "#fecaca"}`,
								borderRadius: 8,
								fontSize: "0.85rem",
								fontFamily: "monospace",
							}}>
								<div style={{ fontWeight: 700, marginBottom: 4, color: match ? "#166534" : "#991b1b" }}>
									{match ? "✓" : "✗"} FIDO2 RP ID Debug
								</div>
								<div><strong>PingOne rp.id:</strong> {rpId}</div>
								<div><strong>PingOne rp.name:</strong> {rpName}</div>
								<div><strong>Browser origin:</strong> {currentOrigin}</div>
								<div><strong>Browser hostname:</strong> {currentHostname}</div>
								<div><strong>RP ID match:</strong> {match
									? <span style={{ color: "#166534" }}>✓ Hostname matches RP ID</span>
									: <span style={{ color: "#991b1b" }}>✗ MISMATCH — browser will reject or PingOne will fail attestation validation</span>
								}</div>
								<div><strong>excludeCredentials:</strong> {excludeCount} device(s){excludeCount > 0 && <span style={{ color: "#991b1b" }}> — existing passkey may block re-enrollment</span>}</div>
								{authSel && (
									<div><strong>authenticatorSelection:</strong> attachment={authSel.authenticatorAttachment || "any"}, residentKey={authSel.residentKey || "—"}, userVerification={authSel.userVerification || "—"}</div>
								)}
							</div>
						);
					})()}
					{fidoEnrollData?.publicKeyCredentialCreationOptions && (
						<TestCard
							title="Complete FIDO2 Registration"
							status={fidoEnrollCompleteStatus}
							error={fidoEnrollCompleteError}
							onTest={testFidoEnrollComplete}
							rawResult={rawFidoEnrollComplete}
						/>
					)}
				</section>

				{/* SMS OTP Test Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">SMS OTP Testing</h2>
					<WhatIsHappening
						title="SMS OTP — One-Time Password via text message"
						steps={[
							"POST /api/mfa/test/integration/initiate with method=sms → PingOne creates a device authorization (DA)",
							"PingOne sends a 6-digit OTP to the user's registered phone number",
							"User enters the OTP; POST /api/mfa/test/integration/verify-otp with the code + daId",
							"PingOne validates the OTP and marks the DA as COMPLETED",
							"The DA ID ties all steps together — it is the session reference for this MFA challenge",
						]}
						apiFlow={[
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/initiate",
								note: "method=sms",
							},
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/verify-otp",
								note: "Submit 6-digit code",
							},
						]}
					/>
					<TestCard
						title="Initiate SMS OTP Challenge"
						status={smsInitiateStatus}
						error={smsInitiateError}
						onTest={testSmsInitiate}
						rawResult={rawSmsInitiate}
					/>
					{smsDaId && (
						<div className="otp-verify-section">
							<DaResponseCard daId={smsDaId} method="sms" />
							<h3 className="otp-verify-title">Verify SMS OTP</h3>
							{noSmsDeviceDetected ? (
								<div className="otp-no-device-banner">
									<p className="info-text">
										📱 <strong>No SMS device found</strong> — this user needs an
										SMS-enabled phone number registered in PingOne.
									</p>
									<p
										className="info-text"
										style={{ fontSize: "0.9em", marginTop: "8px" }}
									>
										SMS devices are managed via the PingOne user profile phone
										number field. Update the user's phone number or enroll a
										different MFA method (Email, FIDO2).
									</p>
								</div>
							) : (
								<div className="otp-input-group">
									<input
										type="text"
										className="otp-input"
										placeholder="Enter 6-digit OTP code"
										value={smsOtp}
										onChange={(e) => setSmsOtp(e.target.value)}
										maxLength={6}
									/>
									<button
										type="button"
										className="mfa-test-button mfa-test-button--primary"
										onClick={testSmsVerify}
										disabled={!smsOtp || smsOtp.length !== 6}
									>
										Verify OTP
									</button>
								</div>
							)}
							<TestCard
								title="Verify SMS OTP"
								status={smsVerifyStatus}
								error={smsVerifyError}
								rawResult={rawSmsVerify}
							/>
						</div>
					)}
					<SectionApiCalls />
				</section>

				{/* Email OTP Test Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">Email OTP Testing</h2>
					<WhatIsHappening
						title="Email OTP — One-Time Password via email"
						steps={[
							"Identical flow to SMS but OTP is sent to the user's registered email address",
							"POST /api/mfa/test/integration/initiate with method=email → PingOne sends OTP email",
							"User retrieves OTP from email and submits via verify-otp endpoint",
						]}
						apiFlow={[
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/initiate",
								note: "method=email",
							},
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/verify-otp",
								note: "Submit 6-digit code",
							},
						]}
					/>
					<TestCard
						title="Initiate Email OTP Challenge"
						status={emailInitiateStatus}
						error={emailInitiateError}
						onTest={testEmailInitiate}
						rawResult={rawEmailInitiate}
					/>
					{emailDaId && (
						<div className="otp-verify-section">
							<DaResponseCard daId={emailDaId} method="email" />
							<h3 className="otp-verify-title">Verify Email OTP</h3>
							{noEmailDeviceDetected ? (
								<div className="otp-no-device-banner">
									<p className="info-text">
										📧 <strong>No Email device found</strong> — automatic
										enrollment started above.
									</p>
									<p
										className="info-text"
										style={{ fontSize: "0.9em", marginTop: "8px" }}
									>
										Scroll up to the <strong>Device Enrollment</strong> section
										and click "Enroll Email Device" to register an email OTP
										device. Once registered, you'll be able to verify with this
										email address.
									</p>
								</div>
							) : (
								<div className="otp-input-group">
									<input
										type="text"
										className="otp-input"
										placeholder="Enter 6-digit OTP code"
										value={emailOtp}
										onChange={(e) => setEmailOtp(e.target.value)}
										maxLength={6}
									/>
									<button
										type="button"
										className="mfa-test-button mfa-test-button--primary"
										onClick={testEmailVerify}
										disabled={!emailOtp || emailOtp.length !== 6}
									>
										Verify OTP
									</button>
								</div>
							)}
							<TestCard
								title="Verify Email OTP"
								status={emailVerifyStatus}
								error={emailVerifyError}
								rawResult={rawEmailVerify}
							/>
						</div>
					)}
					<SectionApiCalls />
				</section>

				{/* FIDO2/Passkey Test Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">FIDO2/Passkey Testing</h2>
					<WhatIsHappening
						title="FIDO2/WebAuthn — Passwordless passkey authentication"
						steps={[
							"POST /api/mfa/test/integration/initiate with method=fido2 → PingOne returns a DA ID",
							"GET /api/mfa/test/integration/challenge/:daId/status → returns publicKeyCredentialRequestOptions",
							"Browser calls navigator.credentials.get({ publicKey }) — OS/browser handles biometric/PIN prompt",
							"The authenticator signs the PingOne challenge with the private key stored on-device",
							"POST /api/mfa/test/integration/verify-fido2 with the signed assertion → PingOne validates signature",
							"No password is ever sent — the private key never leaves the device (FIDO2 security guarantee)",
						]}
						apiFlow={[
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/initiate",
								note: "method=fido2",
							},
							{
								method: "GET",
								endpoint: "/api/mfa/test/integration/challenge/:daId/status",
								note: "Get WebAuthn options",
							},
							{
								method: "POST",
								endpoint: "/api/mfa/test/integration/verify-fido2",
								note: "Submit assertion",
							},
						]}
					/>
					<TestCard
						title="Initiate FIDO2 Challenge"
						status={fidoInitiateStatus}
						error={fidoInitiateError}
						onTest={testFidoInitiate}
						rawResult={rawFidoInitiate}
					/>
					{fidoDaId && (
						<div className="fido-verify-section">
							<DaResponseCard daId={fidoDaId} method="fido2" />
							<h3 className="fido-verify-title">Verify FIDO2 Passkey</h3>
							{fidoChallengeOptions ? (
								<>
									<p className="info-text">
										WebAuthn options ready. Click below to authenticate with
										your passkey.
									</p>
									<TestCard
										title="Verify FIDO2 with Passkey"
										status={fidoVerifyStatus}
										error={fidoVerifyError}
										onTest={testFidoVerify}
										rawResult={rawFidoVerify}
									/>
								</>
							) : noFidoDeviceDetected ? (
								<div className="fido-no-device-banner">
									<p className="info-text">
										🔐 <strong>No FIDO2 device found</strong> — automatic
										enrollment started above.
									</p>
									<p
										className="info-text"
										style={{ fontSize: "0.9em", marginTop: "8px" }}
									>
										Scroll up to the <strong>Device Enrollment</strong> section
										to complete FIDO2 registration. Once registered, you'll be
										able to verify with this passkey.
									</p>
								</div>
							) : (
								<p className="info-text">
									Waiting for WebAuthn credential request options from PingOne…
								</p>
							)}
						</div>
					)}
					<SectionApiCalls />
				</section>

				{/* Device Management Section */}
				<section className="mfa-test-section">
					<h2 className="mfa-test-section-title">Device Management</h2>
					<WhatIsHappening
						title="Device Management — Listing Enrolled MFA Devices"
						steps={[
							"GET /api/mfa/test/devices → BFF calls PingOne Management API to list all MFA devices for the authenticated user",
							"Each device has: type (SMS, EMAIL, FIDO2_BIOMETRICS), nickname/email, status (ACTIVE, INACTIVE), and enrolledAt date",
							"Devices are the registered MFA factors — each one can be used to satisfy an MFA challenge",
							"Admins can disable or delete devices via PingOne console or Management API",
						]}
						apiFlow={[
							{
								method: "GET",
								endpoint: "/api/mfa/test/devices",
								note: "List enrolled MFA devices",
							},
							{
								method: "GET",
								endpoint: "/v1/environments/{envId}/users/{userId}/devices",
								note: "PingOne Management API",
							},
						]}
					/>
					<TestCard
						title="List Devices"
						status={devicesStatus}
						error={devicesError}
						onTest={loadDevices}
						rawResult={rawDevices}
					/>
					{devices.length > 0 && (
						<div className="devices-list">
							<h3 className="devices-list-title">Enrolled Devices</h3>
							<ul className="devices-items">
								{devices.map((device) => (
									<li key={device.id} className="device-item">
										<span className="device-type">{device.type}</span>
										<span className="device-nickname">
											{device.nickname || device.email || "—"}
										</span>
										<span
											className={`device-status device-status--${(device.status || "unknown").toLowerCase()}`}
										>
											{device.status || "UNKNOWN"}
										</span>
										<span className="device-meta">
											ID: {device.id?.substring(0, 12)}…
										</span>
										{device.createdAt && (
											<span className="device-meta">
												Enrolled:{" "}
												{new Date(device.createdAt).toLocaleDateString()}
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
					<SectionApiCalls />
				</section>
			</div>
		</div>
	);
}

function WhatIsHappening({ title, steps, apiFlow }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="what-is-happening">
			<button
				type="button"
				className="wih-toggle"
				onClick={() => setOpen((o) => !o)}
			>
				<span className="wih-icon">{open ? "▼" : "▶"}</span>
				<span className="wih-label">
					ℹ️ {title || "What is happening here?"}
				</span>
			</button>
			{open && (
				<div className="wih-body">
					{steps && (
						<ol className="wih-steps">
							{steps.map((s) => (
								<li key={s} className="wih-step">
									{s}
								</li>
							))}
						</ol>
					)}
					{apiFlow && (
						<div className="wih-api">
							<div className="wih-api-title">API Calls Involved</div>
							{apiFlow.map((a) => (
								<div key={`${a.method}-${a.endpoint}`} className="wih-api-row">
									<span
										className={`wih-method wih-method--${a.method?.toLowerCase()}`}
									>
										{a.method}
									</span>
									<code className="wih-endpoint">{a.endpoint}</code>
									{a.note && <span className="wih-note">{a.note}</span>}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function DaResponseCard({ daId, method }) {
	const METHOD_LABELS = {
		sms: "SMS OTP",
		email: "Email OTP",
		fido2: "FIDO2/Passkey",
	};
	return (
		<div className="da-response-card">
			<div className="da-response-card-title">
				Challenge Initiated — {METHOD_LABELS[method] || method}
			</div>
			<div className="da-response-card-row">
				<span className="da-label">DA ID</span>
				<code className="da-value">{daId}</code>
				<span className="da-desc">
					Device Authorization ID — reference for this MFA challenge session
				</span>
			</div>
			<div className="da-response-card-row">
				<span className="da-label">Status</span>
				<span className="da-value da-value--pending">PENDING</span>
				<span className="da-desc">
					PENDING = OTP sent. COMPLETED = user verified. EXPIRED = time window
					passed.
				</span>
			</div>
			<div className="da-response-card-row">
				<span className="da-label">Method</span>
				<span className="da-value">{METHOD_LABELS[method] || method}</span>
				<span className="da-desc">
					MFA method PingOne is expecting the user to satisfy
				</span>
			</div>
		</div>
	);
}

function TestCard({ title, status, error, onTest, rawResult, pingoneRequest, pingoneResponse }) {
	const [rawOpen, setRawOpen] = useState(false);
	const [reqOpen, setReqOpen] = useState(false);
	const [resOpen, setResOpen] = useState(false);
	return (
		<div className={`test-card test-card--${status}`}>
			<div className="test-card-header">
				<h4 className="test-card-title">{title}</h4>
				<span className={`status-badge status-badge--${status}`}>
					{status === "passed" && "✓ Pass"}
					{status === "failed" && "✗ Fail"}
					{status === "pending" && "○ Pending"}
					{status === "running" && "⟳ Running"}
				</span>
			</div>
			{error && <p className="test-card-error">{error}</p>}
			{onTest && (
				<button
					type="button"
					className="mfa-test-button mfa-test-button--test"
					onClick={onTest}
					disabled={status === "running"}
				>
					{status === "running" ? "Running..." : "Test"}
				</button>
			)}
			{pingoneRequest && (
				<div className="test-card-raw">
					<button
						type="button"
						className="test-card-raw-toggle"
						onClick={() => setReqOpen((o) => !o)}
					>
						{reqOpen ? "▾ Hide PingOne Request" : "▸ Show PingOne Request"}
					</button>
					{reqOpen && (
						<>
							<div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}>
								<strong>{pingoneRequest.method}</strong> {pingoneRequest.url}
								{pingoneRequest.contentType && <span> — <code>{pingoneRequest.contentType}</code></span>}
							</div>
							<pre className="test-card-raw-json">
								{JSON.stringify(pingoneRequest.body, null, 2)}
							</pre>
						</>
					)}
				</div>
			)}
			{pingoneResponse && (
				<div className="test-card-raw">
					<button
						type="button"
						className="test-card-raw-toggle"
						onClick={() => setResOpen((o) => !o)}
					>
						{resOpen ? "▾ Hide PingOne Response" : "▸ Show PingOne Response"}
					</button>
					{resOpen && (
						<pre className="test-card-raw-json">
							{JSON.stringify(pingoneResponse, null, 2)}
						</pre>
					)}
				</div>
			)}
			{!pingoneResponse && rawResult !== undefined && rawResult !== null && (
				<div className="test-card-raw">
					<button
						type="button"
						className="test-card-raw-toggle"
						onClick={() => setRawOpen((o) => !o)}
					>
						{rawOpen ? "▾ Hide P1 Response" : "▸ Show P1 Response"}
					</button>
					{rawOpen && (
						<pre className="test-card-raw-json">
							{JSON.stringify(rawResult, null, 2)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
