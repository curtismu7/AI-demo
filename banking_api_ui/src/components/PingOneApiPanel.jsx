/**
 * PingOneApiPanel — shared collapsible PingOne API request + response panels.
 *
 * Props:
 *   request  — { method, url, contentType?, body } — the outgoing PingOne API call
 *   response — any JSON-serialisable value         — the raw PingOne response body
 *
 * Usage:
 *   <PingOneApiPanel request={pingoneRequest} response={pingoneResponse} />
 */
import React, { useState } from "react";
import "./PingOneApiPanel.css";

export default function PingOneApiPanel({ request, response }) {
	const [reqOpen, setReqOpen] = useState(false);
	const [resOpen, setResOpen] = useState(false);

	if (!request && !response) return null;

	return (
		<>
			{request && (
				<div className="p1-api-panel">
					<button
						type="button"
						className="p1-api-panel-toggle"
						onClick={() => setReqOpen((o) => !o)}
					>
						{reqOpen ? "▾ Hide PingOne Request" : "▸ Show PingOne Request"}
					</button>
					{reqOpen && (
						<>
							<div className="p1-api-panel-meta">
								<strong>{request.method}</strong> {request.url}
								{request.contentType && (
									<span>
										{" "}— <code>{request.contentType}</code>
									</span>
								)}
							</div>
							<pre className="p1-api-panel-body">
								{JSON.stringify(request.body, null, 2)}
							</pre>
						</>
					)}
				</div>
			)}
			{response && (
				<div className="p1-api-panel">
					<button
						type="button"
						className="p1-api-panel-toggle"
						onClick={() => setResOpen((o) => !o)}
					>
						{resOpen ? "▾ Hide PingOne Response" : "▸ Show PingOne Response"}
					</button>
					{resOpen && (
						<pre className="p1-api-panel-body">
							{JSON.stringify(response, null, 2)}
						</pre>
					)}
				</div>
			)}
		</>
	);
}
