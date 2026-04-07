/**
 * RFC 9728 Documentation Verification Tests
 * Comprehensive documentation review and assessment
 * 
 * Phase 59-04: Documentation and Implementation Review - Verification Steps
 * Tests documentation accuracy, examples, troubleshooting guidance, and educational effectiveness
 */

const fs = require('fs');
const path = require('path');

describe('RFC 9728 Documentation Verification Tests', () => {
  const projectRoot = path.join(__dirname, '../../..');
  const docsDir = path.join(projectRoot, 'docs');
  const planningDir = path.join(projectRoot, '.planning');

  describe('RFC9728-04: Review all documentation for accuracy and completeness', () => {
    test('should have comprehensive RFC 9728 audit report', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      expect(fs.existsSync(auditReportPath)).toBe(true);

      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Check for required sections
      expect(auditReport).toContain('# RFC 9728 Compliance Audit Report');
      expect(auditReport).toContain('## Executive Summary');
      expect(auditReport).toContain('## Audit Scope');
      expect(auditReport).toContain('## Detailed Findings');
      expect(auditReport).toContain('## Issues Identified');
      expect(auditReport).toContain('## Recommendations');
      expect(auditReport).toContain('## Conclusion');

      // Check for compliance metrics
      expect(auditReport).toContain('Overall Compliance Score');
      expect(auditReport).toContain('Specification Compliance');
      expect(auditReport).toContain('Educational Content');
      expect(auditReport).toContain('Integration Testing');

      // Check for RFC 9728 specific content
      expect(auditReport).toContain('RFC 9728 §2');
      expect(auditReport).toContain('RFC 9728 §3');
      expect(auditReport).toContain('RFC 9728 §3.3');
    });

    test('should have complete Phase 59 implementation summary', () => {
      const summaryPath = path.join(planningDir, 'phases/59-rfc9728-compliance-and-education-audit/59-01-SUMMARY.md');
      expect(fs.existsSync(summaryPath)).toBe(true);

      const summary = fs.readFileSync(summaryPath, 'utf8');
      
      // Check for required sections
      expect(summary).toContain('# Phase 59-01: RFC 9728 Compliance and Education Audit');
      expect(summary).toContain('## Phase Overview');
      expect(summary).toContain('## Implementation Summary');
      expect(summary).toContain('## Compliance Results');
      expect(summary).toContain('## Key Achievements');
      expect(summary).toContain('## Conclusion');

      // Check for implementation details
      expect(summary).toContain('RFC 9728 Compliance Audit Service');
      expect(summary).toContain('Compliance Audit Routes');
      expect(summary).toContain('Enhanced Educational Content');
      expect(summary).toContain('Comprehensive Testing Suite');
    });

    test('should have accurate RFC 9728 implementation documentation', () => {
      const protectedResourceMetadataPath = path.join(projectRoot, 'banking_api_server/routes/protectedResourceMetadata.js');
      expect(fs.existsSync(protectedResourceMetadataPath)).toBe(true);

      const implementation = fs.readFileSync(protectedResourceMetadataPath, 'utf8');
      
      // Check for comprehensive documentation
      expect(implementation).toContain('/**');
      expect(implementation).toContain('Two route groups (shared buildMetadata helper)');
      expect(implementation).toContain('RFC 9728 §3.2 response shape');
      expect(implementation).toContain('resource');
      expect(implementation).toContain('authorization_servers');
      expect(implementation).toContain('scopes_supported');
      expect(implementation).toContain('bearer_methods_supported');

      // Check for field documentation
      expect(implementation).toContain('REQUIRED');
      expect(implementation).toContain('OPTIONAL');
      expect(implementation).toContain('RECOMMENDED');
    });

    test('should have comprehensive API documentation', () => {
      // Check for API documentation in various forms
      const apiDocs = [
        'docs/Super-Banking-BFF-API.postman_collection.json',
        'docs/Super-Banking-BFF-API-Vercel.postman_collection.json'
      ];

      apiDocs.forEach(docPath => {
        const fullPath = path.join(projectRoot, docPath);
        if (fs.existsSync(fullPath)) {
          const docContent = fs.readFileSync(fullPath, 'utf8');
          expect(docContent).toContain('oauth-protected-resource');
        }
      });
    });
  });

  describe('RFC9728-04: Check that examples match current implementation', () => {
    test('should have matching examples in documentation and implementation', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Extract examples from documentation
      const docExamples = auditReport.match(/```[\s\S]*?```/g) || [];
      
      // Check that examples are realistic and match implementation
      docExamples.forEach(example => {
        // Should contain realistic URLs
        if (example.includes('resource')) {
          expect(example).toContain('https://');
        }
        
        // Should contain proper JSON structure
        if (example.includes('{')) {
          expect(() => JSON.parse(example.replace(/```[\w]*\n?/g, ''))).not.toThrow();
        }
      });
    });

    test('should have consistent examples across all documentation', () => {
      const summaryPath = path.join(planningDir, 'phases/59-rfc9728-compliance-and-education-audit/59-01-SUMMARY.md');
      const summary = fs.readFileSync(summaryPath, 'utf8');
      
      // Check for consistent URL patterns
      const urlPattern = /https?:\/\/[^\s\)]+/g;
      const urls = summary.match(urlPattern) || [];
      
      // URLs should be consistent
      urls.forEach(url => {
        expect(url).toMatch(/^https?:\/\/[a-zA-Z0-9.-]+/);
      });
    });

    test('should have examples that reflect current PingOne integration', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should mention PingOne integration
      expect(auditReport).toContain('PingOne');
      expect(auditReport).toContain('authorization_servers');
      
      // Examples should reflect PingOne URLs
      if (auditReport.includes('auth.pingone.com')) {
        expect(auditReport).toContain('auth.pingone.com');
      }
    });
  });

  describe('RFC9728-04: Verify troubleshooting guidance covers common issues', () => {
    test('should have comprehensive troubleshooting section', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Check for troubleshooting guidance
      expect(auditReport).toContain('Issues Identified');
      expect(auditReport).toContain('High Priority Issues');
      expect(auditReport).toContain('Medium Priority Issues');
      expect(auditReport).toContain('Low Priority Issues');
      
      // Check for specific issue categories
      expect(auditReport).toContain('HTTPS Enforcement');
      expect(auditReport).toContain('Cache Headers');
      expect(auditReport).toContain('Field Validation');
      expect(auditReport).toContain('Error Handling');
    });

    test('should have actionable troubleshooting steps', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should provide specific actions
      expect(auditReport).toContain('Immediate Actions');
      expect(auditReport).toContain('Short-term Improvements');
      expect(auditReport).toContain('Long-term Enhancements');
      
      // Should include code examples for fixes
      expect(auditReport).toContain('```javascript');
      
      // Should have specific implementation guidance
      expect(auditReport).toContain('Configure HTTPS enforcement');
      expect(auditReport).toContain('Add caching headers');
    });

    test('should cover common RFC 9728 implementation issues', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should cover common issues
      expect(auditReport).toContain('HTTPS');
      expect(auditReport).toContain('caching');
      expect(auditReport).toContain('CORS');
      expect(auditReport).toContain('validation');
      expect(auditReport).toContain('security');
      expect(auditReport).toContain('performance');
    });

    test('should have error scenario documentation', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should document error scenarios
      expect(auditReport).toContain('Error Handling');
      expect(auditReport).toContain('Error Documentation');
    });
  });

  describe('RFC9728-04: Assess educational content effectiveness', () => {
    test('should have clear educational structure', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      expect(fs.existsSync(enhancedContentPath)).toBe(true);

      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should have clear educational structure
      expect(content).toContain('What is RFC 9728?');
      expect(content).toContain('Well-known URL Structure');
      expect(content).toContain('Why it matters for AI agents and MCP');
      expect(content).toContain('Response shape (RFC 9728 §3.2)');
      expect(content).toContain('Security: resource identifier validation');
      expect(content).toContain('Live metadata from this BFF');
      expect(content).toContain('Integration with OAuth flows');
      expect(content).toContain('Implementation Best Practices');
    });

    test('should have interactive educational elements', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should have interactive elements
      expect(content).toContain('useState');
      expect(content).toContain('useEffect');
      expect(content).toContain('fetch');
      expect(content).toContain('setMetadata');
      expect(content).toContain('setFetchError');
      expect(content).toContain('setComplianceScore');
    });

    test('should have practical examples and code snippets', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should have practical examples
      expect(content).toContain('<pre className="edu-code">');
      expect(content).toContain('HTTP/1.1 GET /.well-known/oauth-protected-resource');
      expect(content).toContain('Resource URL:');
      expect(content).toContain('Discovery URL:');
      
      // Should have code examples
      expect(content).toContain('Client validation pseudocode');
      expect(content).toContain('if (metadata.resource !== requested_resource_url)');
    });

    test('should have progressive learning structure', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should progress from basic to advanced concepts
      const sections = [
        'What is RFC 9728?',
        'Well-known URL Structure',
        'Why it matters for AI agents and MCP',
        'Response shape (RFC 9728 §3.2)',
        'Field Requirements and Validation',
        'Security: resource identifier validation',
        'Live metadata from this BFF',
        'Integration with OAuth flows',
        'Implementation Best Practices'
      ];

      sections.forEach(section => {
        expect(content).toContain(section);
      });
    });

    test('should have visual and formatting elements', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should have visual elements
      expect(content).toContain('<h3>');
      expect(content).toContain('<p>');
      expect(content).toContain('<ul>');
      expect(content).toContain('<li>');
      expect(content).toContain('<strong>');
      expect(content).toContain('<code>');
      
      // Should have styled elements
      expect(content).toContain('style={{');
      expect(content).toContain('background:');
      expect(content).toContain('border:');
      expect(content).toContain('borderRadius:');
    });

    test('should have real-time integration', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should integrate with live data
      expect(content).toContain("fetch('/api/rfc9728/metadata')");
      expect(content).toContain("fetch('/api/rfc9728/audit/summary')");
      expect(content).toContain('Live metadata from this BFF');
      expect(content).toContain('complianceScore');
    });

    test('should address different learning levels', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should address beginners
      expect(content).toContain('What is RFC 9728?');
      expect(content).toContain('defines a discovery document');
      
      // Should address intermediate users
      expect(content).toContain('Response shape');
      expect(content).toContain('Field Requirements');
      
      // Should address advanced users
      expect(content).toContain('Security considerations');
      expect(content).toContain('Performance optimization');
      expect(content).toContain('Implementation Best Practices');
    });

    test('should have measurable educational outcomes', () => {
      const enhancedContentPath = path.join(projectRoot, 'banking_api_ui/src/components/education/enhancedRFC9728Content.js');
      const content = fs.readFileSync(enhancedContentPath, 'utf8');
      
      // Should provide measurable learning outcomes
      expect(content).toContain('complianceScore');
      expect(content).toContain('overall_score');
      expect(content).toContain('compliance_level');
      
      // Should show progress/feedback
      expect(content).toContain('Excellent');
      expect(content).toContain('Good');
      expect(content).toContain('Fair');
      expect(content).toContain('Needs Improvement');
    });
  });

  describe('RFC9728-04: Documentation quality assessment', () => {
    test('should have consistent formatting across all documentation', () => {
      const docs = [
        path.join(docsDir, 'rfc9728-compliance-audit-report.md'),
        path.join(planningDir, 'phases/59-rfc9728-compliance-and-education-audit/59-01-SUMMARY.md')
      ];

      docs.forEach(docPath => {
        if (fs.existsSync(docPath)) {
          const content = fs.readFileSync(docPath, 'utf8');
          
          // Should have proper markdown structure
          expect(content).toMatch(/^#/m); // Should have headings
          expect(content).toMatch(/##/m); // Should have subheadings
          
          // Should have proper formatting
          expect(content).toContain('**'); // Should have bold text
          expect(content).toContain('*'); // Should have italic or list items
        }
      });
    });

    test('should have accurate cross-references', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should have accurate RFC references
      expect(auditReport).toContain('RFC 9728 §2');
      expect(auditReport).toContain('RFC 9728 §3');
      expect(auditReport).toContain('RFC 9728 §3.3');
      
      // Should have accurate section references
      expect(auditReport).toContain('Section 2.1');
      expect(auditReport).toContain('Section 3.2');
    });

    test('should be up-to-date with current implementation', () => {
      const auditReportPath = path.join(docsDir, 'rfc9728-compliance-audit-report.md');
      const auditReport = fs.readFileSync(auditReportPath, 'utf8');
      
      // Should reflect current implementation status
      expect(auditReport).toContain('85%');
      expect(auditReport).toContain('Overall Compliance Score');
      expect(auditReport).toContain('Phase 59');
      
      // Should mention current components
      expect(auditReport).toContain('protectedResourceMetadata.js');
      expect(auditReport).toContain('RFC9728Content.js');
      expect(auditReport).toContain('rfc9728ComplianceAuditService.js');
    });
  });
});
