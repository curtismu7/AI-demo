// banking_api_ui/src/utils/__tests__/authUi.test.js
import {
  errorMessageSuggestsLogin,
  navigateToCustomerOAuthLogin,
  navigateToAdminOAuthLogin,
} from '../authUi';

describe('authUi', () => {
  describe('errorMessageSuggestsLogin', () => {
    it('returns true for session / login prompts', () => {
      expect(errorMessageSuggestsLogin('Your session has expired. Please log in again.')).toBe(true);
      expect(errorMessageSuggestsLogin('Please log in to access your account')).toBe(true);
      expect(errorMessageSuggestsLogin('Sign in again to continue')).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(errorMessageSuggestsLogin('Failed to load your account information')).toBe(false);
      expect(errorMessageSuggestsLogin('You do not have permission')).toBe(false);
      expect(errorMessageSuggestsLogin(null)).toBe(false);
      expect(errorMessageSuggestsLogin(undefined)).toBe(false);
    });
  });

  describe('navigateToOAuthLogin', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      delete window.location;
      window.location = { ...originalLocation, href: '' };
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('navigateToCustomerOAuthLogin sets user OAuth URL', () => {
      delete window.location;
      window.location = { href: '', assign: jest.fn(), replace: jest.fn(), reload: jest.fn() };

      navigateToCustomerOAuthLogin();

      expect(window.location.href).toMatch(/\/api\/auth\/oauth\/user\/login$/);
    });

    it('navigateToAdminOAuthLogin sets admin OAuth URL', () => {
      delete window.location;
      window.location = { href: '', assign: jest.fn(), replace: jest.fn(), reload: jest.fn() };

      navigateToAdminOAuthLogin();

      expect(window.location.href).toMatch(/\/api\/auth\/oauth\/login$/);
      expect(window.location.href).not.toMatch(/\/oauth\/user\/login/);
    });
  });
});
