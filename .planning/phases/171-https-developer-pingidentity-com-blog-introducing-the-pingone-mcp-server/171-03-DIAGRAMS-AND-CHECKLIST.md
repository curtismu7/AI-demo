# Diagrams and Publication Checklist

## Diagram Sourcing List

The final blog uses ASCII diagrams inline. For publication on developer.pingidentity.com, these should be converted to polished graphics. Below is the inventory with suggested tooling.

| ID | Description | Location in Blog | Suggested Format |
|----|-------------|-----------------|-----------------|
| D1 | Three-layer mental model (MCP / OAuth / RFC 8693) | "What is MCP" section | Simple table graphic or 3-row diagram |
| D2 | PKCE login flow | Auth Flows → Flow 1 | Sequence diagram (draw.io or Mermaid rendered to PNG) |
| D3 | CIBA backchannel flow | Auth Flows → Flow 2 | Sequence diagram |
| D4 | HITL inline consent flow | Auth Flows → Flow 3 | Sequence diagram |
| D5 | 1-Exchange token flow | RFC 8693 → Pattern 1 | Flow diagram |
| D6 | 2-Exchange token flow | RFC 8693 → Pattern 2 | Flow diagram |
| D7 | BX Finance three-tier architecture | Case Study → Architecture | Architecture diagram |

### Diagram Notes

- All diagrams are currently ASCII art in the markdown. They are readable and functional for developer audiences.
- For the PingIdentity blog platform, convert to SVG or PNG with consistent branding.
- The user preference is draw.io XML format for any diagram files.
- Consider using PingIdentity brand colors for PingOne components.

---

## Publication Checklist

### Content Review

- [ ] **Word count check:** Target 3,000-4,000 words. Current estimate: ~3,500 words in FINAL-BLOG.md.
- [ ] **Technical accuracy:** All code snippets verified against actual codebase
- [ ] **Link validation:** All GitHub links, RFC links, and PingOne doc links are active
- [ ] **Consistent terminology:** "BFF" not "backend", "MCP server" not "tool server", "PingOne" not "Ping"
- [ ] **Tone:** Developer-to-developer, not marketing. Technical but accessible.

### Code Snippets

- [ ] All snippets reference real files in the repository with file path comments
- [ ] Snippets are simplified for readability but functionally accurate
- [ ] No secrets, tokens, or environment-specific values in any snippet
- [ ] Language hints on all code fences (```javascript, ```typescript, ```bash, ```json)

### Diagrams

- [ ] ASCII diagrams render correctly in markdown preview
- [ ] Diagram descriptions are self-contained (understandable without the diagram)
- [ ] Consider converting to draw.io for publication (see sourcing list above)

### Repository Readiness

- [ ] `README.md` in repo root matches the "Quick start" instructions in the blog
- [ ] `.env.example` exists and is documented
- [ ] `run-bank.sh` works from clean clone
- [ ] Demo PingOne environment is accessible (or setup instructions are clear)

### Publication Platform

- [ ] Format compatible with developer.pingidentity.com/blog CMS
- [ ] Author bio and headshot available
- [ ] Tags: MCP, OAuth 2.0, RFC 8693, AI Agents, Banking, PingOne, CIBA, PKCE
- [ ] SEO: Title includes "PingOne MCP Server" and "AI Agent"
- [ ] Social preview image / OG image prepared

### Post-Publication

- [ ] Share on PingIdentity developer community channels
- [ ] Cross-post link to GitHub repo README
- [ ] Monitor GitHub issues for questions from blog readers
- [ ] Update blog if any code patterns change in future releases
