import React, { useState } from "react";
import "./BankingChips.css";

const HEURISTIC_CHIPS = [
  { id: "balance", label: "Check Balance", message: "balance" },
  { id: "accounts", label: "My Accounts", message: "accounts" },
  { id: "transactions", label: "Transactions", message: "transactions" },
  { id: "transfer", label: "Transfer Funds", message: "transfer" },
  { id: "transfer_600", label: "Transfer $600 from Savings to Checking", message: "transfer $600 from my savings account to checking" },
];

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
};

export default function BankingChips({ onChipClick, isLoading }) {
  const [expandedCategory, setExpandedCategory] = useState(null);

  const handleChipClick = (chip) => {
    if (onChipClick) {
      onChipClick(chip.message);
    }
  };

  const handleCategoryToggle = (category) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  return (
    <div className="banking-chips-content">
          {/* Heuristic Chips Section */}
          <div className="banking-chips-dropdown__section">
            <div className="banking-chips-dropdown__label">Quick Actions</div>
            <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--heuristic">
              {HEURISTIC_CHIPS.map((chip) => (
                <button
                  type="button"
                  key={chip.id}
                  className="banking-chips-dropdown__button banking-chips-dropdown__button--heuristic"
                  onClick={() => handleChipClick(chip)}
                  disabled={isLoading}
                  title={chip.message}
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
              {Object.entries(LLM_CHIPS).map(([category, chips]) => (
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
                    <span className="banking-chips-dropdown__category-name">{category}</span>
                  </button>
                  {expandedCategory === category && (
                    <div className="banking-chips-dropdown__grid banking-chips-dropdown__grid--llm">
                      {chips.map((chip) => (
                        <button
                          type="button"
                          key={chip.id}
                          className="banking-chips-dropdown__button banking-chips-dropdown__button--llm"
                          onClick={() => handleChipClick(chip)}
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
            </div>
          </div>
    </div>
  );
}
