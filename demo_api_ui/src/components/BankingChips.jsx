import React, { useState } from "react";
import "./BankingChips.css";
import { useVertical } from '../vertical/useVertical';

const HEURISTIC_CHIPS = [
  { id: "balance", label: "Check Balance", message: "balance" },
  { id: "accounts", label: "My Accounts", message: "accounts" },
  { id: "transactions", label: "Transactions", message: "transactions" },
  { id: "transfer", label: "Transfer Funds", message: "transfer" },
  {
    id: "transfer_600",
    label: "Transfer $600 from Savings to Checking",
    message: "transfer $600 from my savings account to checking",
  },
  // Phase 267 — Path A (api-key disposition through banking_mortgage_service).
  // The NL parser maps this exact phrasing to action: 'mortgage_demo', which
  // BankingAgent dispatches → callMcpTool('show_mortgage') → /path/mortgage.
  {
    id: "mortgage",
    label: "Show Mortgage Data",
    message: "show mortgage data",
  },
  // Vertical feature chip — label overridden by manifest dashboard.chips[key=feature].
  // Message routes to vertical_feature_demo in the heuristic parser; BankingAgent
  // reads the active vertical to dispatch the correct MCP tool.
  {
    id: "feature",
    label: "Show Feature Data",
    message: "show vertical feature",
  },
];

// Overlay manifest chip LABELS by key. id + message (routing keys) are never
// changed — the chip→routing→MCP pipeline is invariant (skip-proof contract).
export function applyChipLabels(chips, manifestChips) {
  if (!Array.isArray(manifestChips)) return chips;
  const byKey = new Map(manifestChips.map((c) => [c.key, c.label]));
  return chips.map((c) => (byKey.has(c.id) ? { ...c, label: byKey.get(c.id) } : c));
}

const ADMIN_CHIPS = [
  { id: 'lookup_customer',           label: 'Look Up Customer',   message: 'look up a customer' },
  { id: 'get_customer_transactions', label: 'View Transactions',  message: 'show last 5 transactions for this customer' },
  { id: 'get_customer_profile',      label: 'View Profile',       message: 'show full profile for this customer' },
  { id: 'get_customer_accounts',     label: 'View Accounts',      message: 'show all accounts for this customer' },
  { id: 'freeze_account',            label: 'Freeze Account',     message: 'freeze this account' },
  { id: 'adjust_balance',            label: 'Adjust Balance',     message: 'adjust account balance' },
  { id: 'reset_customer_password',   label: 'Reset Password',     message: 'reset password for this customer' },
  { id: 'delete_customer',           label: 'Delete Customer',    message: 'delete this customer' },
];

const PINGONE_ADMIN_CHIPS = [
  { id: 'p1_list_apps',        label: 'List all apps',              message: 'List all applications in our PingOne environment' },
  { id: 'p1_list_envs',        label: 'List environments',          message: 'Show all environments I have access to in PingOne' },
  { id: 'p1_services_enabled', label: 'What services are enabled?', message: 'What services are enabled in our PingOne environment?' },
  { id: 'p1_identity_count',   label: 'Identity count this week',   message: 'How many identities are in our PingOne environment?' },
  { id: 'p1_ai_agent_config',  label: 'Show Demo AI Agent config',  message: 'Get the configuration for the Demo AI Agent application in PingOne' },
  { id: 'p1_verify_apps',      label: 'Verify all 8 demo apps',     message: 'Confirm all 8 demo apps exist in PingOne: Demo Admin App, Demo User App, Demo MCP Server, Demo Worker, Demo MCP Exchanger, Demo MCP Gateway, Demo Agent, Demo AI Agent' },
];

export const PINGONE_ADMIN_CHIP_IDS = new Set(PINGONE_ADMIN_CHIPS.map((c) => c.id));

const LLM_CHIPS = {
  "Time-Based": [
    {
      id: "last_30_days",
      label: "Last 30 Days",
      message: "Show me transactions from the last 30 days",
    },
    {
      id: "this_month",
      label: "This Month",
      message: "What transactions did I make this month?",
    },
    {
      id: "last_week",
      label: "Last Week",
      message: "Any purchases last week?",
    },
    {
      id: "quarter",
      label: "Quarter to Date",
      message: "Transactions this quarter",
    },
  ],
  "Amount-Based": [
    {
      id: "big_purchases",
      label: "Big Purchases",
      message: "Show me my large purchases over $100",
    },
    {
      id: "max_purchase",
      label: "Max Purchase",
      message: "What's my biggest purchase?",
    },
    {
      id: "small_txns",
      label: "Small Transactions",
      message: "Any transactions under $10?",
    },
    {
      id: "range_query",
      label: "Range Query",
      message: "Transactions between $50-150",
    },
  ],
  "Spending Analysis": [
    {
      id: "spending_summary",
      label: "Spending Summary",
      message: "How much did I spend on groceries?",
    },
    {
      id: "spending_trends",
      label: "Spending Trends",
      message: "What percentage of my spending was over $100?",
    },
    {
      id: "average_txn",
      label: "Average Transaction",
      message: "What's my average transaction amount?",
    },
    {
      id: "highest_txn",
      label: "Highest Ever",
      message: "What was my highest transaction ever?",
    },
  ],
  "Category Analysis": [
    {
      id: "grocery_spending",
      label: "Grocery Spending",
      message: "How much on groceries this month?",
    },
    {
      id: "gas_spending",
      label: "Gas Spending",
      message: "Total gas purchases this quarter?",
    },
    {
      id: "dining_out",
      label: "Dining Out",
      message: "Dining transactions over $50?",
    },
    {
      id: "retail_spending",
      label: "Retail Spending",
      message: "Retail purchases last 30 days?",
    },
  ],
  "Smart Insights": [
    {
      id: "spending_habits",
      label: "Spending Habits",
      message: "What are my top spending categories?",
    },
    {
      id: "anomalies",
      label: "Anomalies",
      message: "Any unusual transactions?",
    },
    {
      id: "compare_trends",
      label: "Compare Trends",
      message: "Am I spending more or less than last month?",
    },
    {
      id: "recommendations",
      label: "Recommendations",
      message: "How can I reduce spending?",
    },
  ],
  // Phase 267 — Path A demo (api-key disposition via banking_mortgage_service).
  // These prompts route to action: 'mortgage_demo' through either the heuristic
  // parser (preferred — zero LLM latency) or the Gemini/Helix fallback.
  "Mortgage (Path A — API-Key)": [
    {
      id: "mortgage_data",
      label: "Show Mortgage Data",
      message: "show mortgage data",
    },
    {
      id: "mortgage_my",
      label: "My Mortgage",
      message: "show my mortgage",
    },
    {
      id: "mortgage_home_loan",
      label: "Home Loan Balance",
      message: "what's my home loan balance",
    },
    {
      id: "mortgage_details",
      label: "Mortgage Details",
      message: "show mortgage details",
    },
  ],
};

export default function BankingChips({
  onChipClick,
  isLoading,
  customChips = [],
  user,
  llmAvailable = true,
}) {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const { pageManifest } = useVertical();
  const dashboard = pageManifest?.dashboard;
  const heuristicChips = applyChipLabels(HEURISTIC_CHIPS, dashboard && dashboard.chips);
  const llmChipGroups = dashboard?.llmChipGroups || LLM_CHIPS;
  // Require a non-empty array: an empty chips10 would otherwise render an empty
  // "Suggestions" header AND suppress the legacy fallback (since [] is truthy).
  const chips10 = Array.isArray(dashboard?.chips10) && dashboard.chips10.length
    ? dashboard.chips10
    : null;

  const customHeuristic = customChips.filter((c) => c.type === "heuristic");
  const customLlm = customChips.filter((c) => c.type === "llm");

  const handleChipClick = (chip, requiresLlm = false) => {
    if (onChipClick) {
      onChipClick({ message: chip.message, label: chip.label, requiresLlm, chipId: chip.id });
    }
  };

  const handleCategoryToggle = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  return (
    <div className="banking-chips-content">
      {user?.role === 'admin' && (
        <div className="banking-chips-dropdown__section">
          <div className="banking-chips-dropdown__label">Admin Actions</div>
          <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--heuristic">
            {ADMIN_CHIPS.map((chip) => (
              <button
                type="button"
                key={chip.id}
                className="banking-chips-dropdown__button banking-chips-dropdown__button--heuristic"
                onClick={() => handleChipClick(chip, false)}
                disabled={isLoading}
                title={chip.message}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {user?.role === 'admin' && (
        <div className="banking-chips-dropdown__section banking-chips-dropdown__section--pingone">
          <div className="banking-chips-dropdown__label">
            PingOne Admin <span className="banking-chips-dropdown__mcp-badge">MCP</span>
          </div>
          <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--heuristic">
            {PINGONE_ADMIN_CHIPS.map((chip) => (
              <button
                type="button"
                key={chip.id}
                className="banking-chips-dropdown__button banking-chips-dropdown__button--pingone"
                onClick={() => handleChipClick(chip, true)}
                disabled={isLoading}
                title={chip.message}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Curated 10-chip Suggestions section (vertical manifest chips10).
          Renders INSTEAD of the legacy Quick Actions + Advanced Analysis split.
          `both` chips → heuristic-eligible (requiresLlm=false). `llm` chips →
          requiresLlm=true and are disabled when no LLM provider is available. */}
      {chips10 && (
        <div className="banking-chips-dropdown__section">
          <div className="banking-chips-dropdown__label">Suggestions</div>
          <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--heuristic">
            {chips10.map((chip) => {
              const isLlm = chip.mode === "llm";
              const llmDisabled = isLlm && !llmAvailable;
              return (
                <button
                  type="button"
                  key={chip.id}
                  className={`banking-chips-dropdown__button banking-chips-dropdown__button--${isLlm ? "llm" : "heuristic"}`}
                  onClick={() =>
                    handleChipClick(
                      { id: chip.id, label: chip.label, message: chip.message },
                      isLlm,
                    )
                  }
                  disabled={isLoading || llmDisabled}
                  title={
                    llmDisabled
                      ? "Needs an LLM — switch to Helix or Claude mode"
                      : chip.message
                  }
                >
                  {chip.label}
                  {isLlm && (
                    <span className="banking-chips-dropdown__mcp-badge">LLM</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legacy two-section split — fallback for verticals without chips10. */}
      {!chips10 && (
      <>
      {/* Heuristic Chips Section */}
      <div className="banking-chips-dropdown__section">
        <div className="banking-chips-dropdown__label">Quick Actions</div>
        <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--heuristic">
          {heuristicChips.map((chip) => (
            <button
              type="button"
              key={chip.id}
              className="banking-chips-dropdown__button banking-chips-dropdown__button--heuristic"
              onClick={() => handleChipClick(chip, false)}
              disabled={isLoading}
              title={chip.message}
            >
              {chip.label}
            </button>
          ))}
          {customHeuristic.map((chip) => (
            <button
              type="button"
              key={chip.id}
              className="banking-chips-dropdown__button banking-chips-dropdown__button--heuristic"
              onClick={() => handleChipClick({ message: chip.prompt }, false)}
              disabled={isLoading}
              title={chip.prompt}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* LLM Chips Section */}
      <div className="banking-chips-dropdown__section">
        <div className="banking-chips-dropdown__label">Advanced Analysis</div>
        <div className="banking-chips-dropdown__categories">
          {Object.entries(llmChipGroups).map(([category, chips]) => (
            <div key={category} className="banking-chips-dropdown__category">
              <button
                type="button"
                className="banking-chips-dropdown__category-header"
                onClick={() => handleCategoryToggle(category)}
                disabled={isLoading}
              >
                <span className="banking-chips-dropdown__category-toggle">
                  {expandedCategory === category ? "▼" : "▶"}
                </span>
                <span className="banking-chips-dropdown__category-name">
                  {category}
                </span>
              </button>
              {expandedCategory === category && (
                <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--llm">
                  {chips.map((chip) => (
                    <button
                      type="button"
                      key={chip.id}
                      className="banking-chips-dropdown__button banking-chips-dropdown__button--llm"
                      onClick={() => handleChipClick(chip, true)}
                      disabled={isLoading}
                      title={chip.message}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {customLlm.length > 0 && (
            <div className="banking-chips-dropdown__category">
              <button
                type="button"
                className="banking-chips-dropdown__category-header"
                onClick={() => handleCategoryToggle("__custom__")}
                disabled={isLoading}
              >
                <span className="banking-chips-dropdown__category-toggle">
                  {expandedCategory === "__custom__" ? "▼" : "▶"}
                </span>
                <span className="banking-chips-dropdown__category-name">
                  Custom
                </span>
              </button>
              {expandedCategory === "__custom__" && (
                <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--llm">
                  {customLlm.map((chip) => (
                    <button
                      type="button"
                      key={chip.id}
                      className="banking-chips-dropdown__button banking-chips-dropdown__button--llm"
                      onClick={() => handleChipClick({ message: chip.prompt }, true)}
                      disabled={isLoading}
                      title={chip.prompt}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
