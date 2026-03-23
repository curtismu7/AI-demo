// banking_api_ui/src/services/bffAxios.js
import axios from 'axios';

/**
 * Same-origin API calls that rely on the BFF session cookie only.
 * Intentionally no Authorization / refresh interceptors — those can break
 * admin routes when the SPA does not send Bearer tokens (session fallback).
 */
const bffAxios = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  withCredentials: true,
  timeout: 30000,
});

export default bffAxios;
