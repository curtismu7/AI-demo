# Phase 167 Context — MCP Tools Education Page

## Goal
Create an interactive, educational page/panel that displays all available MCP tools from the BankingToolRegistry with descriptions, required scopes, input schemas, and categorization.

## Vision
Developers and API consumers should be able to browse and understand what the AI agent can do. The page should show:
- All available banking tools (read-only, write, public)
- Purpose and description of each tool
- Required OAuth scopes for each tool
- Input parameters and schemas
- Whether the tool requires user authentication
- Examples or integration guidance

## Key Tools to Display
From BankingToolRegistry.ts:

**Read-Only (Safe):**
- `get_my_accounts` - banking:accounts:read
- `get_account_balance` - banking:accounts:read
- `get_my_transactions` - banking:transactions:read
- `sequential_think` - no auth required

**Write Operations:**
- `get_sensitive_account_details` - banking:sensitive:read
- `create_deposit` - banking:transactions:write
- `create_withdrawal` - banking:transactions:write
- `create_transfer` - banking:transactions:write

**Public (No Auth):**
- `query_user_by_email` - no auth required

## Success Criteria
1. All 10 MCP tools are displayed with full details
2. Tools are grouped by category (read-only, write, public)
3. Each tool shows: name, description, required scopes, auth requirement, parameter schema
4. The page/panel is accessible from the UI (likely linked from Admin Config or as a separate route)
5. The component is reusable for future tool additions
6. Styling is consistent with existing education panels (ActorTokenEducation pattern)
