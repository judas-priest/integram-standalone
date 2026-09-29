/**
 * DYNAMIC INTEGRAM API CLIENT
 *
 * ⚠️ WARNING: This axios client is ONLY for legacy Integram backend API calls.
 *
 * Issue #3554: Updated to use Unified Authentication tokens
 *
 * Use this client ONLY for:
 * - Traditional CRUD operations (fields, harvests, observations, etc.)
 * - Endpoints served by Integram backend (dronedoc.ru, localhost, etc.)
 * - Base URL is dynamically determined from localStorage (apiBase, db)
 *
 * Token retrieval priority:
 * 1. Unified auth session (if available)
 * 2. integram_session from localStorage
 * 3. Legacy token from localStorage
 *
 * DO NOT use this client for:
 * - Monolithic backend APIs (ai-tokens, youtube, recording, etc.)
 * - For those, use @/orchestratorAxios instead
 *
 * Base URL: Determined by getBaseURL() based on localStorage settings
 */

import axios from 'axios'
import { installApiInterceptors } from './services/apiInterceptor'
import { remapData } from './services/apiRemapper'
import { clearUserCache } from './router'

let activeRequests = 0
const loaders = new Map()

export const registerLoaderCallbacks = (show, hide, loaderId) => {
  loaders.set(loaderId, { show, hide })
  return () => loaders.delete(loaderId)
}

const updateLoaders = isLoading => {
  loaders.forEach(loader => {
    isLoading ? loader.show() : loader.hide()
  })
}

// Функция для получения базового URL с учетом apiBase из localStorage
// Issue #3848: Support custom database per request via config.targetDatabase
// Issue #INTEGRAM_STANDALONE: Auto-detect server from window.location for standalone deployment
const getBaseURL = (targetDatabase = null) => {
  const apiBase = localStorage.getItem('apiBase')
  const db = targetDatabase || localStorage.getItem('db') || 'a2025'

  // Если выбран localhost, используем локальный адрес
  if (apiBase === 'localhost') return `http://localhost/${db}/`

  // Используем apiBase если указан, иначе автоопределение по текущему хосту
  // Issue #3924: Changed from sim.sakhwings.ru to dronedoc.ru to avoid CORS errors
  // Issue #INTEGRAM_STANDALONE: Auto-detect current hostname for standalone deployments
  // This allows the same build to work on any server (YOUR_SERVER_IP, dronedoc.ru, etc.)
  let baseHost = apiBase

  if (!baseHost) {
    // Auto-detect from current location
    const hostname = window.location.hostname
    const protocol = window.location.protocol // http: or https:

    // Remove /app or other paths from the base URL
    baseHost = hostname

    // For IP addresses or non-standard servers, use the detected protocol
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || hostname === 'localhost') {
      // IP address or localhost - use detected protocol
      return `${protocol}//${baseHost}/${db}/`
    }

    // For named domains (dronedoc.ru, dev.drondoc.ru), default to https
    baseHost = hostname
  }

  // Named domains always use https, custom apiBase uses https unless it's IP/localhost
  return `https://${baseHost}/${db}/`
}

const apiClient = axios.create({
  baseURL: getBaseURL(), // Используем функцию для получения базового URL
  timeout: 5000000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Get token and authentication database
 * Issue #3848: Simplified authorization token storage system
 *
 * Simplified token storage system:
 * 1. Single 'token' in localStorage for all databases ('my' and others)
 * 2. authDb determined from localStorage 'db' key (the database user logged into)
 * 3. integram_session is ONLY for /integram routes, not used here
 *
 * Authorization logic:
 * - If logged into 'my':
 *   - Requests to /my/ → X-Authorization header
 *   - Requests to other DBs → 'my' header (kernel routing)
 * - If logged into other DB (e.g., a2025):
 *   - All requests → X-Authorization header
 *
 * Issue #4140: Use localStorage token for 'my' header (not cookie)
 * The 'my' cookie may contain password instead of token, so always use localStorage token
 */

function getTokenForCurrentDb() {
  const token = localStorage.getItem('token')
  const authDb = localStorage.getItem('db') || 'a2025'
  return { token, db: authDb }
}

// Перехватчик для обновления baseURL перед каждым запросом
// Issue #3848: Simplified authorization with single token
// Issue #4140: Use localStorage token for 'my' header (not cookie)
apiClient.interceptors.request.use(
  config => {
    // Issue #3848: Support custom target database per request
    // Components can specify targetDatabase in config to override localStorage.db
    // Example: apiClient.get('/report/123', { targetDatabase: 'a2025' })
    config.baseURL = getBaseURL(config.targetDatabase)

    // Get token and authentication database (the database user logged into)
    // Issue #4140: Use localStorage token only (removed myCookieToken)
    const { token, db: authDb } = getTokenForCurrentDb()

    // Issue #3848: Simplified authorization header selection
    // Issue #4140: Use localStorage token for 'my' header (not cookie)
    //
    // Logic:
    // 1. If logged into 'my':
    //    - Requests to /my/ → X-Authorization header
    //    - Requests to other databases (e.g., /a2025/) → 'my' header with localStorage token
    // 2. If logged into other database (e.g., a2025):
    //    - All requests → X-Authorization header
    // Extract target database from baseURL
    // baseURL format: https://server/database/ or https://server/database
    // Issue #3848: Extract database name from URL path (first segment after domain)
    const baseUrl = config.baseURL || ''
    let targetDb = authDb.toLowerCase()

    try {
      // Try to parse as full URL
      const urlObj = new URL(baseUrl)
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0)
      if (pathParts.length > 0) {
        targetDb = pathParts[0].toLowerCase()
      }
    } catch {
      // If not a valid URL, try regex fallback for relative paths
      const dbMatch = baseUrl.match(/\/([^/]+)\/?$/)
      if (dbMatch) {
        targetDb = dbMatch[1].toLowerCase()
      }
    }

    // Issue #3848: Determine which header to use based on auth database and target database
    const authDbLower = authDb.toLowerCase()
    const targetDbLower = targetDb.toLowerCase()

    if (authDbLower === 'my') {
      // Logged into 'my' database
      if (targetDbLower === 'my') {
        // Request to /my/ → X-Authorization
        if (token) {
          config.headers['X-Authorization'] = token
        }
      } else {
        // Request to other database (e.g., /a2025/) → 'my' header (kernel routing)
        // Issue #4140: Use localStorage token (not cookie) as it contains the actual token
        if (token) {
          config.headers['my'] = token
        }
      }
    } else if (token) {
      // Logged into specific database (not 'my') → always X-Authorization
      config.headers['X-Authorization'] = token
    }

    // Issue #4140: Add debug logging to help diagnose token issues
    if (!token) {
      console.warn('[axios2] No token found in localStorage!', {
        authDb: authDb,
        url: config.url,
        localStorageKeys: Object.keys(localStorage)
      })
    } else {
      // Log token usage for debugging (only first/last 4 chars for security)
      const tokenPreview = token.length > 8
        ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}`
        : '***'

      // Debug logging disabled by default to avoid console pollution
      // Uncomment for debugging auth issues:
      // console.warn('[axios2] Request', {
      //   url: config.url,
      //   authDb: authDbLower,
      //   targetDb: targetDbLower,
      //   tokenLength: token.length,
      //   tokenPreview,
      //   headerUsed: authDbLower === 'my' && targetDbLower !== 'my' ? 'my' : 'X-Authorization'
      // })
    }
    // Note: X-Api-Base and xsrf headers are NOT sent to direct API calls
    // (dronedoc.ru, sim.sakhwings.ru, etc.)
    // These headers were only used by proxy.php which we're no longer using
    // Sending them causes CORS errors:
    // - "header 'x-api-base' is not allowed according to header 'Access-Control-Allow-Headers'"
    // - "header 'xsrf' is not allowed according to header 'Access-Control-Allow-Headers'"

    // Add JSON_KV parameter to all requests (unless JSON_RICH is explicitly set)
    // This replaces the /api/ path component
    // Issue #3872: Allow JSON_RICH as alternative format
    if (!config.params) {
      config.params = {}
    }

    // Issue #3872: Debug logging for JSON_KV/JSON_RICH parameter logic
    // Issue #3920: Don't add JSON_KV for /report endpoints - they work better with JSON_RICH
    // Issue #3922: Explicitly add JSON_RICH for /report endpoints to ensure correct format
    const isReportEndpoint = config.url && config.url.includes('/report')

    if (isReportEndpoint) {
      // Report endpoints need JSON_RICH format explicitly
      config.params.JSON_RICH = true
    } else if (!config.params.JSON_RICH) {
      // Other endpoints use JSON_KV by default
      config.params.JSON_KV = true
    }

    // Автоматически устанавливаем multipart/form-data для FormData объектов
    if (config.data instanceof FormData) {
      config.headers['Content-Type'] = 'multipart/form-data'
    }

    activeRequests++
    if (activeRequests === 1) updateLoaders(true)
    return config
  },
  error => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Handle request error
    if (window.errorHandler) {
      window.errorHandler.handle(error, { source: 'axios2-request' })
    }

    return Promise.reject(error)
  },
)

apiClient.interceptors.response.use(
  async response => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Apply remapping for /object/ endpoints
    // This transforms raw Integram API data into Table.vue-compatible format
    const url = response.config.url || ''
    const isObjectEndpoint = url.includes('/object/')

    if (isObjectEndpoint && response.data) {
      try {
        // Apply remapping without edit types to avoid extra requests
        const types = { edit_types: {} }

        // Apply remapping to transform Integram format to Table format
        const remapped = remapData(response.data, types, {})

        // Wrap in expected format
        response.data = {
          status: 200,
          response: remapped
        }
      } catch (error) {
        console.error('Error remapping response:', error)
        // If remapping fails, try to use original data
        // Wrap in expected format if not already wrapped
        if (!response.data.response) {
          response.data = {
            status: 200,
            response: response.data
          }
        }
      }
    }

    return response
  },
  error => {
    activeRequests = Math.max(0, activeRequests - 1)
    if (activeRequests === 0) updateLoaders(false)

    // Handle 401 Unauthorized - but be careful about clearing sessions
    // Issue #3700: Only clear session if the 401 is from a critical auth endpoint
    // Don't clear on random API failures which might be transient
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || ''
      const isCriticalAuthEndpoint = url.includes('/auth') || url.includes('/user') || url.includes('/login')

      if (isCriticalAuthEndpoint) {
        console.warn('⚠️ 401 Unauthorized on auth endpoint - clearing session')
        // Clear both legacy and new format tokens
        localStorage.removeItem('token')
        localStorage.removeItem('_xsrf')
        localStorage.removeItem('integram_session')

        // Issue #3700: Clear router user cache to prevent stale data
        clearUserCache()

        // Show error message to user
        if (window.errorHandler) {
          window.errorHandler.handle(new Error('Сессия истекла. Пожалуйста, войдите в систему заново.'), {
            source: 'axios2-auth-expired',
            url: error.config?.url,
            method: error.config?.method
          })
        }
      } else {
        // Non-critical endpoint returned 401 - log but don't clear session
        // This might be a permission issue on a specific resource, not session expiry
        console.warn('⚠️ 401 Unauthorized on non-auth endpoint:', url, '- not clearing session')
      }
    }

    // Handle response error
    if (window.errorHandler) {
      window.errorHandler.handle(error, {
        source: 'axios2-response',
        url: error.config?.url,
        method: error.config?.method
      })
    }

    return Promise.reject(error)
  },
)

// Install API interceptors for proxy-style endpoint transformation
// This allows direct API calls while maintaining compatibility with Vue components
installApiInterceptors(apiClient)

export default apiClient