// jest-dom matchers (toBeInTheDocument, etc.)
import "@testing-library/jest-dom";

// react-router-dom v7 uses TextEncoder/TextDecoder which jsdom doesn't provide globally.
// Polyfill from Node's built-in 'util' so all tests that import react-router-dom work.
import { TextEncoder, TextDecoder } from "util";

// jsdom does not implement scrollIntoView — mock it globally
window.HTMLElement.prototype.scrollIntoView = jest.fn();
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
