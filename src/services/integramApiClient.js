/**
 * Direct Integram API Client
 *
 * Issue #3554: Updated to use Unified Authentication Service
 *
 * This client communicates directly with the Integram API without using the backend/monolith proxy.
 * Based on the API documentation in backend/integram/api.csv
 *
 * API Structure:
 * - Base URL: {INTEGRAM_API_URL}/api/{database}/
 * - Authentication: Now through unified auth service (or direct POST /api/{database}/auth as fallback)
 * - All requests need X-Authorization header with token
 * - All POST requests need _xsrf parameter
 *
 * Token retrieval priority:
 * 1. Unified auth session (via loadSessionFromUnifiedAuth)
 * 2. localStorage integram_session
 *
 * Commands:
 * - _d_* : DDL operations (data structure changes)
 * - _m_* : DML operations (data modifications)
 * - Other commands: Return JSON data for UI rendering
 */

import axios from 'axios'
import { unifiedAuthService } from './unifiedAuthService'

/**
 * Format requisite value for Integram API
 *
 * CRITICAL: Integram PHP's date handling is specific!
 * - "YYYYMMDD" (compact without dashes) is interpreted as Unix timestamp → WRONG dates!
 * - "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" (ISO format with dashes) → WORKS correctly!
 *
 * SOLUTION: Use ISO format "YYYY-MM-DD HH:MM:SS" (with dashes, always with time).
 *
 * @param {any} value - The value to format
 * @returns {any} - Formatted value (dates in YYYY-MM-DD HH:MM:SS format for Integram PHP)
 */
function formatRequisiteValue(value) {
  if (value === null || value === undefined || value === '') {
    return value
  }

  // Handle JavaScript Date objects (from Calendar/DatePicker components)
  // Check both instanceof and duck-typing for cross-realm compatibility
  const isDateObject = value instanceof Date ||
    (value && typeof value.getFullYear === 'function' && typeof value.getMonth === 'function')

  if (isDateObject) {
    // Check for Invalid Date
    if (isNaN(value.getTime())) {
      console.warn('[formatRequisiteValue] Invalid Date object received:', value)
      return value
    }

    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    const hours = String(value.getHours()).padStart(2, '0')
    const minutes = String(value.getMinutes()).padStart(2, '0')
    const seconds = String(value.getSeconds()).padStart(2, '0')

    const formatted = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    console.log('[formatRequisiteValue] Date object formatted:', { original: value, formatted })
    return formatted
  }

  const strValue = String(value)

  // Check if value looks like a date string (ISO format)
  // Patterns: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY-MM-DDTHH:MM, YYYY-MM-DDTHH:MM:SS
  const isoDateRegex = /^(\d{4})[-\/.](\d{2})[-\/.](\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  const match = strValue.match(isoDateRegex)

  if (match) {
    const [, year, month, day, hours, minutes, seconds] = match

    // Convert to ISO format YYYY-MM-DD HH:MM:SS (Integram PHP compatible)
    // IMPORTANT: Dashes are required! YYYYMMDD without dashes is interpreted as Unix timestamp
    const formattedHours = hours !== undefined ? hours : '00'
    const formattedMinutes = minutes !== undefined ? minutes : '00'
    const formattedSeconds = seconds !== undefined ? seconds : '00'
    return `${year}-${month}-${day} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`
  }

  // Check for Russian/European date format: DD.MM.YYYY
  const ruDateRegex = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  const ruMatch = strValue.match(ruDateRegex)

  if (ruMatch) {
    const [, day, month, year, hours, minutes, seconds] = ruMatch
    // Convert to ISO format YYYY-MM-DD HH:MM:SS (Integram PHP compatible)
    const formattedHours = hours !== undefined ? hours : '00'
    const formattedMinutes = minutes !== undefined ? minutes : '00'
    const formattedSeconds = seconds !== undefined ? seconds : '00'
    return `${year}-${month}-${day} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`
  }

  return value
}

class IntegramApiClient {
  constructor() {
    // Direct Integram API URL (not through backend proxy)
    // Load from localStorage or use default
    const savedServer = localStorage.getItem('integram_server')

    // Fix CORS: Use current origin if no saved server or env variable
    // This allows the app to work on any domain (интеграм.рф, dronedoc.ru, etc.)
    const defaultURL = (typeof window !== 'undefined' && window.location)
      ? window.location.origin
      : 'https://app.integram.io'

    let initialURL = savedServer || import.meta.env.VITE_INTEGRAM_API_URL || defaultURL

    // Fix: Clean up incorrectly saved server URLs that include database path
    // Remove trailing slash
    initialURL = initialURL.replace(/\/$/, '')
    // Remove database path if accidentally included (e.g., "https://dronedoc.ru/a2025" -> "https://dronedoc.ru")
    const dbMatch = initialURL.match(/^(https?:\/\/[^/]+)\/([a-zA-Z0-9_]+)$/)
    if (dbMatch) {
      initialURL = dbMatch[1]
      console.warn(`Cleaned up integram_server from localStorage. Removed database path: ${dbMatch[2]}`)
      // Save corrected URL back to localStorage
      localStorage.setItem('integram_server', initialURL)
    }

    this.baseURL = initialURL

    // Issue #5112: Multi-database authorization support
    // Store sessions for multiple databases simultaneously
    this.databases = {}  // Map: database → { token, xsrf, userId, userName, userRole, ownedDatabases }
    this.currentDatabase = null  // Currently active database

    // Legacy properties (maintained for backward compatibility)
    this.database = null
    this.token = null
    this.xsrfToken = null
    this.userId = null
    this.userRole = null
    this.userName = null

    // Issue #3811: Track which database the user authenticated to
    // This determines which header to use ('my' header vs 'X-Authorization')
    this.authDatabase = null

    // Load session from localStorage on initialization
    this.loadSession()
  }

  /**
   * Set server URL (e.g., https://app.integram.io, https://dronedoc.ru, etc.)
   */
  setServer(serverURL) {
    // Remove trailing slash if present
    let cleanURL = serverURL.replace(/\/$/, '')

    // Fix: Remove database path from server URL if accidentally included
    // This prevents issues where server URL is saved as "https://dronedoc.ru/a2025"
    // instead of just "https://dronedoc.ru"
    const dbMatch = cleanURL.match(/^(https?:\/\/[^/]+)\/([a-zA-Z0-9_]+)$/)
    if (dbMatch) {
      // Extract just the protocol+host portion
      cleanURL = dbMatch[1]
      console.warn(`Removed database path from server URL. Using: ${cleanURL}`)
    }

    this.baseURL = cleanURL
    // Save to localStorage
    localStorage.setItem('integram_server', this.baseURL)
  }

  /**
   * Get current server URL
   */
  getServer() {
    return this.baseURL
  }

  /**
   * Issue #3793: Set credentials from existing token (no auth request needed)
   * Use this when you already have a valid token from localStorage
   *
   * Issue #3811: Added authDatabase parameter to track which database user authenticated to.
   * This determines which header to use:
   * - If authDatabase = 'my', use 'my' header for ALL requests (even to other databases)
   * - If authDatabase != 'my', use 'X-Authorization' header
   *
   * @param {string} database - Target database for requests
   * @param {string} token - Auth token
   * @param {string} xsrf - XSRF token (optional)
   * @param {string} authDatabase - Database user authenticated to (defaults to database param)
   */
  setCredentials(database, token, xsrf = null, authDatabase = null) {
    this.database = database
    this.token = token
    this.xsrfToken = xsrf || token
    // Issue #3811: Track authentication database for header selection
    this.authDatabase = authDatabase || database
  }

  /**
   * Save session to localStorage
   * Issue #5112: Updated to support multi-database sessions
   * Stores all authenticated databases and current active database
   * Maintains backward compatibility with legacy single-database format
   */
  saveSession() {
    // Issue #5112: Save multi-database session if databases map exists
    if (Object.keys(this.databases).length > 0) {
      const sessionData = {
        version: 2,  // Multi-database format version
        server: this.baseURL,
        currentDatabase: this.currentDatabase,
        databases: this.databases
      }
      localStorage.setItem('integram_session', JSON.stringify(sessionData))
      return
    }

    // Legacy format (backward compatibility)
    if (this.token && this.xsrfToken && this.database) {
      const sessionData = {
        database: this.database,
        token: this.token,
        xsrfToken: this.xsrfToken,
        userId: this.userId,
        userName: this.userName,
        userRole: this.userRole,
        authServer: this.baseURL,  // Issue #3756: Save authentication server URL
        authDatabase: this.authDatabase  // Issue #3811: Save authentication database
      }
      localStorage.setItem('integram_session', JSON.stringify(sessionData))
    } else {
      localStorage.removeItem('integram_session')
    }
  }

  /**
   * Load session from localStorage
   * Issue #5112: Updated to support both multi-database (v2) and legacy (v1) formats
   * Automatically migrates legacy sessions to new format
   */
  loadSession() {
    try {
      // First try to load from unified auth
      if (unifiedAuthService.isAuthenticated()) {
        this.loadSessionFromUnifiedAuth()
        return
      }

      const stored = localStorage.getItem('integram_session')
      if (stored) {
        const sessionData = JSON.parse(stored)

        // Issue #5112: Check for multi-database format (version 2)
        if (sessionData.version === 2 && sessionData.databases) {
          // New format: multi-database session
          this.baseURL = sessionData.server
          this.databases = sessionData.databases
          this.currentDatabase = sessionData.currentDatabase

          // Set legacy properties from current database for backward compatibility
          if (this.currentDatabase && this.databases[this.currentDatabase]) {
            const currentDBSession = this.databases[this.currentDatabase]
            this.database = this.currentDatabase
            this.token = currentDBSession.token
            this.xsrfToken = currentDBSession.xsrfToken
            this.userId = currentDBSession.userId
            this.userName = currentDBSession.userName
            this.userRole = currentDBSession.userRole
            this.authDatabase = this.currentDatabase

            // Issue #5112: Load owned databases if 'my' and not yet loaded
            if (this.currentDatabase === 'my' && this.userId && (!currentDBSession.ownedDatabases || currentDBSession.ownedDatabases.length === 0)) {
              this.getOwnedDatabases(this.userId).then(ownedDatabases => {
                this.databases['my'].ownedDatabases = ownedDatabases
                this.saveSession()
              }).catch(err => {
                console.warn('[integramApiClient] Failed to load owned databases on restore:', err)
              })
            }
          }

          localStorage.setItem('integram_server', this.baseURL)
          return
        }

        // Legacy format: single database session
        // Migrate to new format automatically
        this.database = sessionData.database
        this.token = sessionData.token
        this.xsrfToken = sessionData.xsrfToken
        this.userId = sessionData.userId
        this.userName = sessionData.userName
        this.userRole = sessionData.userRole
        this.authDatabase = sessionData.authDatabase || sessionData.database

        // Issue #5112: Migrate legacy session to multi-database format
        if (this.database && this.token) {
          this.databases[this.database] = {
            token: this.token,
            xsrfToken: this.xsrfToken,
            userId: this.userId,
            userName: this.userName,
            userRole: this.userRole,
            ownedDatabases: []  // Will be loaded below if database is 'my'
          }
          this.currentDatabase = this.database

          // Issue #5112: Load owned databases if migrating 'my' database
          if (this.database === 'my' && this.userId) {
            this.getOwnedDatabases(this.userId).then(ownedDatabases => {
              this.databases['my'].ownedDatabases = ownedDatabases
              this.saveSession()
            }).catch(err => {
              console.warn('[integramApiClient] Failed to load owned databases on migration:', err)
            })
          } else {
            // Save migrated session for non-my databases
            this.saveSession()
          }
        }

        // Issue #3756: Restore authentication server URL if available
        if (sessionData.authServer) {
          this.baseURL = sessionData.authServer
          localStorage.setItem('integram_server', sessionData.authServer)
        }

        return
      }

      // Issue #3778: Fallback to 'my' database token from main site authentication
      // This allows users who logged in via the main site to use Integram features
      // without needing to re-authenticate
      this.loadSessionFromMyToken()
    } catch (error) {
      console.error('Failed to load session from localStorage:', error)
      localStorage.removeItem('integram_session')
    }
  }

  /**
   * Issue #3778: Load session from 'my' database token (main site authentication)
   * This provides fallback authentication when no Integram-specific session exists
   * but user has logged in via the main site to 'my' database
   * Issue #3811: Set authDatabase = 'my' when loading from my_token
   */
  loadSessionFromMyToken() {
    try {
      // Check for 'my' database token from main site authentication
      const myToken = localStorage.getItem('my_token')
      const myXsrf = localStorage.getItem('my_xsrf')
      const myUser = localStorage.getItem('my_user')
      const myUserId = localStorage.getItem('my_id')
      const currentDb = localStorage.getItem('db')

      // Issue #65: Use current origin instead of hardcoded dronedoc.ru
      const currentOrigin = (typeof window !== 'undefined' && window.location)
        ? window.location.origin
        : 'https://dronedoc.ru'

      // If 'my' token exists, use it
      if (myToken && myXsrf) {
        this.database = 'my'
        this.token = myToken
        this.xsrfToken = myXsrf
        this.userId = myUserId
        this.userName = myUser
        this.baseURL = currentOrigin
        this.authDatabase = 'my'  // Issue #3811: User authenticated to 'my' database
        console.log('[integramApiClient] Loaded session from my_token (Issue #3778)')
        return true
      }

      // Fallback: Try legacy token keys (token, _xsrf) if database is 'my'
      const legacyToken = localStorage.getItem('token')
      const legacyXsrf = localStorage.getItem('_xsrf')
      const legacyUser = localStorage.getItem('user')
      const legacyUserId = localStorage.getItem('id')

      if (legacyToken && legacyXsrf && currentDb === 'my') {
        this.database = 'my'
        this.token = legacyToken
        this.xsrfToken = legacyXsrf
        this.userId = legacyUserId
        this.userName = legacyUser
        this.baseURL = currentOrigin
        this.authDatabase = 'my'  // Issue #3811: User authenticated to 'my' database
        console.log('[integramApiClient] Loaded session from legacy token (db=my) (Issue #3778)')
        return true
      }

      return false
    } catch (error) {
      console.error('[integramApiClient] Failed to load session from my token:', error)
      return false
    }
  }

  /**
   * Load session from unified auth service for current database
   * This is the preferred method when unified auth is available
   *
   * Issue #3691: XSRF token is ALWAYS from 'my' database for all databases
   */
  async loadSessionFromUnifiedAuth() {
    if (!unifiedAuthService.isAuthenticated()) {
      console.warn('[integramApiClient] Unified auth not available')
      return false
    }

    try {
      const database = this.database || localStorage.getItem('db') || 'A2025'
      const tokenData = await unifiedAuthService.getTokenForDatabase(database)

      if (tokenData) {
        this.token = tokenData.token
        this.userId = tokenData.userId
        this.userName = tokenData.userName
        this.userRole = tokenData.userRole
        this.database = tokenData.database

        // Issue #3691: ALWAYS use XSRF token from 'my' database for ALL databases
        const myTokenData = await unifiedAuthService.getTokenForDatabase('my')
        if (myTokenData && myTokenData.xsrf) {
          this.xsrfToken = myTokenData.xsrf
          console.log('[integramApiClient] Using XSRF token from "my" database for', database)
        } else {
          // Fallback to current database XSRF if 'my' is unavailable
          this.xsrfToken = tokenData.xsrf
          console.warn('[integramApiClient] Could not get XSRF from "my", using', database, 'XSRF')
        }

        // Save to localStorage for backward compatibility
        this.saveSession()

        // Session loaded from unified auth successfully
        return true
      }
    } catch (error) {
      console.error('[integramApiClient] Failed to load session from unified auth:', error)
    }

    return false
  }

  /**
   * Switch to a different database using unified auth token
   * @param {string} database - Target database name
   * @returns {Promise<boolean>} True if successful
   *
   * Issue #3691: XSRF token is ALWAYS from 'my' database for all databases
   */
  async switchToDatabase(database) {
    if (!unifiedAuthService.isAuthenticated()) {
      console.warn('[integramApiClient] Cannot switch database - unified auth not available')
      return false
    }

    try {
      const tokenData = await unifiedAuthService.getTokenForDatabase(database)

      if (tokenData) {
        this.database = database
        this.token = tokenData.token
        this.userId = tokenData.userId
        this.userName = tokenData.userName
        this.userRole = tokenData.userRole

        // Issue #3691: ALWAYS use XSRF token from 'my' database for ALL databases
        const myTokenData = await unifiedAuthService.getTokenForDatabase('my')
        if (myTokenData && myTokenData.xsrf) {
          this.xsrfToken = myTokenData.xsrf
          console.log('[integramApiClient] Using XSRF token from "my" database for', database)
        } else {
          // Fallback to current database XSRF if 'my' is unavailable
          this.xsrfToken = tokenData.xsrf
          console.warn('[integramApiClient] Could not get XSRF from "my", using', database, 'XSRF')
        }

        // Save to localStorage
        this.saveSession()

        // Switched to database successfully
        return true
      }
    } catch (error) {
      console.error('[integramApiClient] Failed to switch database:', error)
    }

    return false
  }

  /**
   * Clear session from localStorage
   */
  clearSession() {
    localStorage.removeItem('integram_session')
  }

  /**
   * Set database context
   */
  setDatabase(database) {
    this.database = database
  }

  /**
   * Get current database
   */
  getDatabase() {
    return this.database
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.token && !!this.xsrfToken
  }

  /**
   * Issue #5100: Validate session with server and refresh tokens if needed
   * This helps prevent premature "session expired" messages
   * @returns {Promise<boolean>} True if session is valid
   */
  async validateSession() {
    if (!this.token || !this.xsrfToken) {
      return false
    }

    try {
      // Try to get xsrf endpoint - this validates the session
      const response = await this.get('xsrf')

      // If we get here, session is valid - update tokens
      if (response.token) {
        this.token = response.token
      }
      if (response._xsrf) {
        this.xsrfToken = response._xsrf
      }
      if (response.id) {
        this.userId = response.id
      }
      if (response.user) {
        this.userName = response.user
      }
      if (response.role) {
        this.userRole = response.role
      }

      // Save refreshed session
      this.saveSession()
      return true
    } catch (error) {
      console.warn('[integramApiClient] Session validation failed:', error.message)
      return false
    }
  }

  /**
   * Issue #5100: Try to restore session from all available sources
   * Called when session appears to be expired
   * @returns {boolean} True if session was restored
   */
  tryRestoreSession() {
    // Already authenticated
    if (this.isAuthenticated()) {
      return true
    }

    // Try loading from localStorage
    const stored = localStorage.getItem('integram_session')
    if (stored) {
      try {
        const sessionData = JSON.parse(stored)
        if (sessionData.token && sessionData.xsrfToken) {
          this.database = sessionData.database
          this.token = sessionData.token
          this.xsrfToken = sessionData.xsrfToken
          this.userId = sessionData.userId
          this.userName = sessionData.userName
          this.userRole = sessionData.userRole
          this.authDatabase = sessionData.authDatabase || sessionData.database

          if (sessionData.authServer) {
            this.baseURL = sessionData.authServer
          }

          console.log('[integramApiClient] Session restored from localStorage')
          return true
        }
      } catch (e) {
        console.warn('[integramApiClient] Failed to parse stored session:', e)
      }
    }

    // Try my_token fallback
    if (this.loadSessionFromMyToken()) {
      return true
    }

    return false
  }

  /**
   * Get authentication info
   */
  getAuthInfo() {
    return {
      token: this.token,
      xsrf: this.xsrfToken,
      userId: this.userId,
      userName: this.userName,
      userRole: this.userRole,
      database: this.database
    }
  }

  /**
   * Build API URL
   *
   * Different servers have different URL structures:
   * - app.integram.io: https://app.integram.io/api/{database}/{endpoint}
   * - dronedoc.ru, интеграм.рф, sakhwings.ru: https://domain.ru/{database}/{endpoint}?JSON_KV
   * - IP addresses: http://IP/{database}/{endpoint}
   */
  buildURL(endpoint) {
    if (!this.database) {
      throw new Error('Database not set. Call setDatabase() first.')
    }

    // Remove trailing slash from baseURL to prevent double slashes
    let cleanBaseURL = this.baseURL.replace(/\/$/, '')

    // Check if we're using dronedoc.ru, sakhwings.ru, or интеграм.рф server (same URL structure)
    // Also treat IP addresses (e.g., YOUR_SERVER_IP) the same way (no /api/ prefix)
    const isIPAddress = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(cleanBaseURL)
    const isDronedoc = cleanBaseURL.includes('dronedoc.ru') ||
                       cleanBaseURL.includes('sakhwings.ru') ||
                       cleanBaseURL.includes('xn--80afflxcxn.xn--p1ai') || // интеграм.рф (Punycode)
                       cleanBaseURL.includes('интеграм.рф') ||
                       isIPAddress

    if (isDronedoc) {
      // Fix: Check if baseURL already contains the database path
      // This prevents double database path like: /a2025//a2025/
      const dbPathRegex = new RegExp(`/${this.database}$`)
      if (dbPathRegex.test(cleanBaseURL)) {
        // Database already in baseURL, just append endpoint
        return `${cleanBaseURL}/${endpoint}`
      }

      // Check if endpoint already starts with database name (e.g., "my/report/app_menu")
      // This prevents duplication like: /my/my/report/app_menu
      const endpointStartsWithDb = endpoint.startsWith(`${this.database}/`)
      if (endpointStartsWithDb) {
        // Endpoint already includes database, don't add it again
        return `${cleanBaseURL}/${endpoint}`
      }

      // For dronedoc.ru/sakhwings.ru/интеграм.рф/IP addresses, use direct database path (no /api/ prefix)
      // Note: JSON_KV is added via params in get/post methods, not in URL
      return `${cleanBaseURL}/${this.database}/${endpoint}`
    }

    // Default format for app.integram.io and other servers
    return `${cleanBaseURL}/api/${this.database}/${endpoint}`
  }

  /**
   * Authenticate with Integram API
   * @param {string} database - Database name
   * @param {string} login - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} Authentication result with token and xsrf
   */
  async authenticate(database, login, password) {
    try {
      this.database = database
      const url = this.buildURL('auth')

      const formData = new URLSearchParams()
      formData.append('login', login)
      formData.append('pwd', password)

      // Issue #4097: Add JSON_KV parameter to authentication request
      // This is required for proper Integram API format
      const response = await axios.post(url, formData, {
        params: {
          JSON_KV: ''
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (response.data.failed) {
        throw new Error('Неверный логин или пароль')
      }

      // Issue #4140: Validate that the token is not the password
      // A valid token should be a long hex string (32+ characters), not the password
      const receivedToken = response.data.token
      if (!receivedToken) {
        throw new Error('Сервер не вернул токен авторизации')
      }

      // Check if the server mistakenly returned the password as the token
      if (receivedToken === password) {
        console.error('[integramApiClient] CRITICAL: Server returned password as token!', {
          database,
          login,
          tokenReceived: receivedToken,
          tokenLength: receivedToken.length
        })
        throw new Error('Ошибка сервера: получен некорректный токен авторизации')
      }

      // Warn if token looks suspicious (too short or same as password)
      if (receivedToken.length < 16) {
        console.warn('[integramApiClient] Warning: Received token is suspiciously short', {
          tokenLength: receivedToken.length,
          token: receivedToken
        })
      }

      // Issue #5112: Save to multi-database structure
      this.databases[database] = {
        token: receivedToken,
        xsrfToken: response.data._xsrf,
        userId: response.data.id,
        userName: login,
        userRole: response.data.role || 'user',
        ownedDatabases: []  // Will be loaded if database is 'my'
      }

      // Set current database
      this.currentDatabase = database

      // Legacy properties (backward compatibility)
      this.token = receivedToken
      this.xsrfToken = response.data._xsrf
      this.userId = response.data.id
      this.userName = login
      this.userRole = response.data.role || 'user'
      this.database = database
      this.authDatabase = database

      // Issue #5112: If authenticated to 'my' database, load owned databases
      if (database === 'my' && this.userId) {
        try {
          const ownedDatabases = await this.getOwnedDatabases(this.userId)
          this.databases[database].ownedDatabases = ownedDatabases
        } catch (error) {
          console.warn('[integramApiClient] Failed to load owned databases:', error.message)
          this.databases[database].ownedDatabases = []
        }
      }

      // Save session to localStorage
      this.saveSession()

      return {
        success: true,
        database,
        token: receivedToken,
        xsrf: response.data._xsrf,
        userId: this.userId,
        userName: this.userName,
        userRole: this.userRole,
        ownedDatabases: this.databases[database].ownedDatabases
      }
    } catch (error) {
      console.error('Integram authentication error:', error)
      throw new Error(error.response?.data?.message || error.message || 'Ошибка авторизации')
    }
  }

  /**
   * Issue #5112: Get owned databases for user
   * Queries table DB (object 271) with filter F_U=userId
   * Parses second column "DB" to get list of accessible databases
   *
   * @param {string} userId - User ID from 'my' database
   * @returns {Promise<string[]>} Array of database names
   */
  async getOwnedDatabases(userId) {
    try {
      // Save current database to restore later
      const originalDatabase = this.database

      // Switch to 'my' database to query object 271
      this.database = 'my'

      // Query object 271 with filter F_U=userId
      // URL: /my/object/271/?F_U={userId}&JSON_KV
      const response = await this.get('object/271/', { F_U: userId })

      // Restore original database
      this.database = originalDatabase

      // Parse response to extract database names
      const databases = []

      if (response && response.object && Array.isArray(response.object)) {
        // Response structure: { object: [...], reqs: {...} }
        // Database name is stored in obj.val field
        // Example: {"id":"197308","val":"ddadmin","base":"271"}

        for (const obj of response.object) {
          // Database name is in the 'val' field
          if (obj.val && typeof obj.val === 'string') {
            // Validate it looks like a database name (alphanumeric, underscore, 2-20 chars)
            const dbMatch = obj.val.match(/^[a-zA-Z0-9_]{2,20}$/)
            if (dbMatch) {
              databases.push(obj.val)
            }
          }
        }
      }

      // Remove duplicates and sort
      const uniqueDatabases = [...new Set(databases)].sort()

      console.log('[integramApiClient] Owned databases loaded:', uniqueDatabases)
      return uniqueDatabases
    } catch (error) {
      console.error('[integramApiClient] Failed to load owned databases:', error)
      return []
    }
  }

  /**
   * Issue #5112: Switch to a different database
   * Updates current database and legacy properties
   *
   * @param {string} database - Target database name
   * @returns {boolean} Success status
   */
  async switchDatabase(database) {
    try {
      // Check if we have a session for this database
      if (!this.databases[database]) {
        // Check if we can access via 'my' token
        if (this.databases['my']?.ownedDatabases?.includes(database)) {
          // Database is owned but not authenticated yet
          // We can use 'my' token to access it
          console.log(`[integramApiClient] Switching to owned database: ${database}`)
        } else {
          throw new Error(`No session for database: ${database}. Please authenticate first.`)
        }
      }

      // Update current database
      this.currentDatabase = database

      // Update legacy properties from database session (if exists)
      if (this.databases[database]) {
        const dbSession = this.databases[database]
        this.database = database
        this.token = dbSession.token
        this.xsrfToken = dbSession.xsrfToken
        this.userId = dbSession.userId
        this.userName = dbSession.userName
        this.userRole = dbSession.userRole
        this.authDatabase = database
      } else {
        // Using 'my' token for owned database
        const mySession = this.databases['my']
        this.database = database
        this.token = mySession.token
        this.xsrfToken = mySession.xsrfToken
        this.userId = mySession.userId
        this.userName = mySession.userName
        this.userRole = mySession.userRole
        this.authDatabase = 'my'  // Auth is from 'my'
      }

      // Save updated session
      this.saveSession()

      return true
    } catch (error) {
      console.error('[integramApiClient] Failed to switch database:', error)
      throw error
    }
  }

  /**
   * Issue #5112: Get authorization headers for request
   * Determines which header to use based on auth database and target database
   *
   * Logic:
   * - Same database as auth → X-Authorization (direct access)
   * - Different database via 'my' auth → 'my' header (kernel routing)
   * - Otherwise → error
   *
   * @param {string} targetDatabase - Database for the request (defaults to currentDatabase)
   * @returns {Object} Headers object
   */
  getAuthHeaders(targetDatabase = null) {
    const database = targetDatabase || this.currentDatabase || this.database

    if (!database) {
      throw new Error('No database specified for request')
    }

    const headers = {}

    // CRITICAL FIX: For non-'my' databases, ALWAYS use 'my' token via 'my' header
    // According to Integram API docs: use 'my' header with 'my' token to access other databases
    if (database === 'my') {
      // Direct access to 'my' database
      if (this.databases['my']) {
        headers['X-Authorization'] = this.databases['my'].token
      } else if (this.token) {
        headers['X-Authorization'] = this.token
      }
    } else {
      // Access to other databases (a2025, etc.) - ALWAYS use 'my' token
      if (this.databases['my']) {
        console.log('[DEBUG] Using my token for', database, 'database access (will use "my" header)')
        headers['my'] = this.databases['my'].token
      } else {
        console.warn('[integramApiClient] No "my" session found for accessing other databases')
        // Fallback to legacy auth
        if (this.token && this.authDatabase === 'my') {
          headers['my'] = this.token
        } else {
          headers['X-Authorization'] = this.token
        }
      }
    }

    return headers
  }

  /**
   * Fetch session information
   */
  async fetchSessionInfo() {
    try {
      const response = await this.get('xsrf')
      this.userId = response.id
      this.userName = response.user
      this.userRole = response.role
      this.xsrfToken = response._xsrf
      this.token = response.token
      return response
    } catch (error) {
      console.error('Failed to fetch session info:', error)
      throw error
    }
  }

  /**
   * Logout and clear tokens
   */
  logout() {
    this.token = null
    this.xsrfToken = null
    this.userId = null
    this.userName = null
    this.userRole = null
    this.database = null

    // Clear session from localStorage
    this.clearSession()
  }

  /**
   * Execute GET request
   * Issue #5112: Uses getAuthHeaders() for multi-database authorization
   */
  async get(endpoint, params = {}) {
    try {
      if (!this.isAuthenticated() && endpoint !== 'xsrf') {
        throw new Error('Not authenticated. Call authenticate() first.')
      }

      const url = this.buildURL(endpoint)

      // Issue #5112: Get authorization headers based on multi-database logic
      // CRITICAL FIX: Pass this.database to ensure correct headers for target database
      const headers = this.getAuthHeaders(this.database)

      // Issue #4102: Add JSON_KV parameter to all requests
      const allParams = {
        JSON_KV: '',
        ...params
      }

      const response = await axios.get(url, {
        params: allParams,
        headers,
        timeout: 30000 // 30 second timeout
      })

      return response.data
    } catch (error) {
      console.error('Integram GET error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Execute POST request
   * Issue #5112: Uses getAuthHeaders() for multi-database authorization
   */
  async post(endpoint, data = {}, options = {}) {
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Not authenticated. Call authenticate() first.')
      }

      const url = this.buildURL(endpoint)

      // Add XSRF token to data
      const postData = new URLSearchParams()
      postData.append('_xsrf', this.xsrfToken)

      // Add other data fields
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          postData.append(key, value)
        }
      }

      // Issue #5112: Get authorization headers based on multi-database logic
      // CRITICAL FIX: Pass this.database to ensure correct headers for target database
      const authHeaders = this.getAuthHeaders(this.database)

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...authHeaders
      }

      // Issue #4102: Add JSON_KV parameter to all requests
      const response = await axios.post(url, postData, {
        params: {
          JSON_KV: ''
        },
        headers,
        timeout: 30000, // 30 second timeout
        ...options
      })

      return response.data
    } catch (error) {
      console.error('Integram POST error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Handle API errors
   * Issue #4630: Improved error handling for timeout and aborted requests
   * Issue #5100: Try to restore session before showing expired message
   */
  handleError(error) {
    // Handle timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn('Request timeout:', error.message)
      return new Error('Превышено время ожидания ответа от сервера.')
    }

    // Handle network errors
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      console.warn('Network error:', error.message)
      return new Error('Ошибка сети. Проверьте подключение к интернету.')
    }

    if (error.response) {
      const { status, data } = error.response

      if (status === 401) {
        // Issue #5100: Try to restore session before showing expired message
        console.warn('[integramApiClient] 401 error - attempting session restore')

        // Try to restore from localStorage or my_token
        if (this.tryRestoreSession()) {
          console.log('[integramApiClient] Session restored, retry the request')
          // Return a special error that indicates retry is possible
          const retryError = new Error('SESSION_RESTORED_RETRY')
          retryError.canRetry = true
          return retryError
        }

        // Issue #5001: Don't immediately logout on 401
        // Instead, mark session as potentially invalid and let the UI handle re-auth
        console.warn('[integramApiClient] Session could not be restored')
        // Don't call this.logout() here - it causes unnecessary session resets
        // The UI will redirect to login page if needed
        return new Error('Сессия истекла. Обновите страницу или войдите заново.')
      }

      if (status === 403) {
        return new Error('Доступ запрещен.')
      }

      if (status === 404) {
        return new Error('Ресурс не найден.')
      }

      if (status === 500) {
        return new Error('Ошибка сервера: ' + (data.message || data.error || 'Internal server error'))
      }

      return new Error(data.message || data.error || `HTTP ${status}`)
    }

    if (error.request) {
      return new Error('Нет ответа от сервера. Проверьте подключение к сети.')
    }

    return error
  }

  // ==================== DDL Operations (_d_*) ====================
  //
  // IMPORTANT USAGE PATTERNS:
  //
  // 1. REFERENCE COLUMNS (Foreign Keys / Lookup Dropdowns):
  //    To create a reference column that links to another table, use addRequisite()
  //    with the TARGET TABLE ID as requisiteTypeId (not a standard type like 3/8/13).
  //
  //    Example: Add "Category" column linking to Categories table (ID: 994769):
  //      await client.addRequisite(productsTableId, 994769) // 994769 = Categories table ID
  //      await client.saveRequisiteAlias(newRequisiteId, "Category")
  //
  // 2. RELATED/SUBORDINATE TABLES:
  //    Table relationships in Integram are implemented via REFERENCE COLUMNS,
  //    NOT via parentId parameter. parentId is only for hierarchy within ONE table.
  //
  //    CORRECT: Create a reference column in child table pointing to parent table
  //    WRONG: Using parentId to link different tables
  //
  // 3. REQUISITE TYPES:
  //    - 3 = SHORT, 8 = CHARS, 2 = LONG, 13 = NUMBER, 4 = DATETIME, 7 = BOOL
  //    - For references: use target table ID as requisiteTypeId
  //

  /**
   * Create new type (table)
   * @param {string} name - Type name
   * @param {number} baseTypeId - Base type ID
   * @param {boolean} unique - First column is unique
   */
  async createType(name, baseTypeId, unique = false) {
    const data = {
      val: name,
      t: baseTypeId
    }
    if (unique) {
      data.unique = 1
    }
    return this.post('_d_new', data)
  }

  /**
   * Save type properties
   */
  async saveType(typeId, name, baseTypeId, unique = false) {
    const data = {
      val: name,
      t: baseTypeId
    }
    if (unique) {
      data.unique = 1
    }
    return this.post(`_d_save/${typeId}`, data)
  }

  /**
   * Delete type
   */
  async deleteType(typeId) {
    return this.post(`_d_del/${typeId}`)
  }

  /**
   * Add requisite (column) to type
   *
   * For standard columns, use requisiteTypeId values:
   * - 3 = SHORT (short text), 8 = CHARS (text), 2 = LONG (long text)
   * - 13 = NUMBER, 14 = SIGNED, 4 = DATETIME, 9 = DATE, 7 = BOOL
   *
   * For REFERENCE columns (foreign keys/lookups), pass the TARGET TABLE ID
   * as requisiteTypeId instead of a standard type.
   *
   * @param {number} typeId - Type ID to add requisite to
   * @param {number} requisiteTypeId - Standard type ID OR target table ID for references
   * @returns {Promise<Object>} Created requisite with id
   *
   * @example
   * // Add text column
   * const textCol = await client.addRequisite(tableId, 3) // SHORT text
   * await client.saveRequisiteAlias(textCol.id, "Description")
   *
   * @example
   * // Add reference column to link to another table
   * const refCol = await client.addRequisite(productsTableId, categoriesTableId)
   * await client.saveRequisiteAlias(refCol.id, "Category")
   */
  async addRequisite(typeId, requisiteTypeId) {
    return this.post(`_d_req/${typeId}`, { t: requisiteTypeId })
  }

  /**
   * Delete requisite
   * @param {number|string} requisiteId - Requisite ID to delete
   * @param {boolean} forced - If true, delete even if requisite has data (default: true)
   *
   * Backend returns error [{"error":"message"}] if:
   * - Requisite has data and forced is not set
   * - Requisite is used in reports or roles
   */
  async deleteRequisite(requisiteId, forced = true) {
    const data = forced ? { forced: '1' } : {}
    return this.post(`_d_del_req/${requisiteId}`, data)
  }

  /**
   * Save requisite alias
   */
  async saveRequisiteAlias(requisiteId, alias) {
    return this.post(`_d_alias/${requisiteId}`, { val: alias })
  }

  /**
   * Save requisite attributes (default value)
   */
  async saveRequisiteAttributes(requisiteId, attributes) {
    return this.post(`_d_attrs/${requisiteId}`, { val: attributes })
  }

  /**
   * Toggle requisite null flag
   */
  async toggleRequisiteNull(requisiteId) {
    return this.post(`_d_null/${requisiteId}`)
  }

  /**
   * Toggle requisite multi-select flag
   */
  async toggleRequisiteMulti(requisiteId) {
    return this.post(`_d_multi/${requisiteId}`)
  }

  /**
   * Create reference to type
   */
  async createTypeReference(requisiteId) {
    return this.post(`_d_ref/${requisiteId}`)
  }

  /**
   * Save requisite default value (supports macros like [TODAY], [NOW], [USER_ID])
   * POST /{database}/_d_save/{requisiteId}/
   * @param {number} requisiteId - Requisite ID
   * @param {string} value - Default value or macro (e.g., '[TODAY]', '[NOW]', '[USER_ID]')
   * @returns {Promise<Object>} Result
   */
  async saveRequisiteDefaultValue(requisiteId, value) {
    return this.post(`_d_save/${requisiteId}/`, { val: value })
  }

  /**
   * Move requisite up in order
   */
  async moveRequisiteUp(requisiteId) {
    return this.post(`_d_up/${requisiteId}`)
  }

  /**
   * Add reference column to a table that links to another table (lookup/dropdown)
   *
   * This is a convenience wrapper around addRequisite + saveRequisiteAlias.
   * Creates a foreign key column that displays as a dropdown selector.
   *
   * @param {number} typeId - Table ID to add the reference column to
   * @param {number} targetTableId - ID of the table to reference (the lookup table)
   * @param {string} alias - Column alias/name (e.g., "Category", "Status")
   * @returns {Promise<Object>} Created requisite with id
   *
   * @example
   * // Add "Category" reference column to Products table
   * const refCol = await client.addReferenceColumn(productsTableId, categoriesTableId, "Category")
   */
  async addReferenceColumn(typeId, targetTableId, alias) {
    // Create reference column by passing target table ID as requisiteTypeId
    const result = await this.addRequisite(typeId, targetTableId)

    // Set alias if requisite was created
    if (result && result.id) {
      await this.saveRequisiteAlias(result.id, alias)
    }

    return result
  }

  // ==================== DML Operations (_m_*) ====================
  //
  // IMPORTANT: Working with reference (foreign key) fields:
  //
  // - When READING: Reference fields return the display name (e.g., "Smartphones")
  // - When WRITING: Pass the TARGET OBJECT ID as string (e.g., "994770")
  //
  // Example: Create object with reference to category:
  //   await client.createObject(productsTableId, "iPhone 15", {
  //     "994766": "994770"  // Category ref column -> Category object ID
  //   })
  //
  // For reliable saving of reference fields, use setObjectRequisites() after creation.
  //

  /**
   * Create new object
   *
   * For reference fields (foreign keys), pass the TARGET OBJECT ID as string value.
   * Note: parentId is for hierarchy within ONE table, not for table relationships!
   * Use reference columns to link objects from different tables.
   *
   * @param {number} typeId - Object type ID (table ID)
   * @param {string} value - Object name/value (main field)
   * @param {Object} requisites - Requisites as { requisiteId: value }. For references, pass object ID.
   * @param {number} parentId - Parent ID for hierarchy within same table (NOT for linking tables!)
   *
   * @example
   * // Create object with reference field
   * const product = await client.createObject(productsTableId, "iPhone 15", {
   *   "994766": "994770"  // Reference column -> Category object ID
   * })
   */
  async createObject(typeId, value, requisites = {}, parentId = null) {
    const data = {
      [`t${typeId}`]: value
    }

    // up=1 for independent objects, or parentId for subordinate objects
    // This is required by Integram API - without up=1, independent objects won't be saved correctly
    data.up = parentId || 1

    // Add requisites with date formatting
    for (const [reqId, reqValue] of Object.entries(requisites)) {
      data[`t${reqId}`] = formatRequisiteValue(reqValue)
    }

    return this.post(`_m_new/${typeId}`, data)
  }

  /**
   * Save object value and requisites
   * @param {number} objectId - Object ID
   * @param {number} typeId - Object type ID
   * @param {string} value - Object value
   * @param {Object} requisites - Requisites as { requisiteId: value }
   */
  async saveObject(objectId, typeId, value, requisites = {}) {
    const data = {
      [`t${typeId}`]: value
    }

    // Add requisites with date formatting
    for (const [reqId, reqValue] of Object.entries(requisites)) {
      const formatted = formatRequisiteValue(reqValue)
      data[`t${reqId}`] = formatted !== null && formatted !== undefined ? formatted : ''
    }

    return this.post(`_m_save/${objectId}`, data)
  }

  /**
   * Set object requisites (create/update/delete)
   *
   * RECOMMENDED method for updating fields, especially reference fields.
   * Uses _m_set endpoint which reliably saves all field types including references.
   * Only updates specified requisites, leaves others unchanged.
   *
   * @param {number} objectId - Object ID to update
   * @param {Object} requisites - Requisites as { requisiteId: value }. For references, pass object ID.
   *
   * @example
   * // Update reference field
   * await client.setObjectRequisites(productId, {
   *   "994766": "994771"  // Change category to different object
   * })
   */
  async setObjectRequisites(objectId, requisites = {}) {
    const data = {}

    // Apply date formatting for PHP compatibility
    for (const [reqId, reqValue] of Object.entries(requisites)) {
      const formatted = formatRequisiteValue(reqValue)
      data[`t${reqId}`] = formatted !== null && formatted !== undefined ? formatted : ''
    }

    return this.post(`_m_set/${objectId}`, data)
  }

  /**
   * Upload file as requisite value (for FILE and PATH types)
   *
   * Uploads file to server and sets it as value of the specified requisite.
   * Uses _m_save endpoint with multipart/form-data.
   *
   * @param {number} objectId - Object ID to update
   * @param {number} requisiteTypeId - Requisite type ID (e.g., 10 for FILE, 17 for PATH)
   * @param {File} file - File object to upload
   * @returns {Promise<Object>} Response with upload result
   *
   * @example
   * // Upload file to FILE requisite
   * const fileInput = document.querySelector('input[type="file"]')
   * await client.uploadRequisiteFile(objectId, 10, fileInput.files[0])
   */
  async uploadRequisiteFile(objectId, requisiteTypeId, file) {
    const formData = new FormData()
    formData.append(`t${requisiteTypeId}`, file, file.name)
    formData.append('_xsrf', this.xsrfToken)

    const url = this.buildURL(`_m_save/${objectId}`)
    const headers = {}

    // Issue #3811, #4203, #4950: Authorization header selection
    if (this.database === 'my' || this.authDatabase === this.database) {
      headers['X-Authorization'] = this.token
    } else {
      headers['my'] = this.token
    }

    const response = await axios.post(url, formData, {
      params: { JSON_KV: '' },
      headers
    })

    return response.data
  }

  /**
   * Delete object
   */
  async deleteObject(objectId) {
    return this.post(`_m_del/${objectId}`)
  }

  /**
   * Move object up in order
   */
  async moveObjectUp(objectId) {
    return this.post(`_m_up/${objectId}`)
  }

  /**
   * Move subordinate object to another parent
   */
  async moveObjectToParent(objectId, newParentId) {
    return this.post(`_m_move/${objectId}`, { up: newParentId })
  }

  // ==================== Query Operations ====================

  /**
   * Get dictionary (list of independent types)
   */
  async getDictionary() {
    return this.get('dict')
  }

  /**
   * Get type metadata
   */
  async getTypeMetadata(typeId) {
    const stack = new Error().stack.split('\n')[2].trim()
    console.log(`[getTypeMetadata] typeId=${typeId}, caller: ${stack}`)
    return this.get(`metadata/${typeId}`)
  }

  /**
   * Get object list for type
   */
  async getObjectList(typeId, params = {}) {
    // DEBUG: Log all getObjectList calls to track metadata requests
    const limit = params.LIMIT || 'all'
    const stack = new Error().stack.split('\n')[2].trim()
    console.log(`[getObjectList] typeId=${typeId}, LIMIT=${limit}, caller: ${stack}`)
    return this.get(`object/${typeId}`, params)
  }

  /**
   * Get object edit form data
   */
  async getObjectEditData(objectId) {
    return this.get(`edit_obj/${objectId}`)
  }

  /**
   * Get type editor data
   */
  async getTypeEditorData() {
    return this.get('edit_types')
  }

  /**
   * Execute report
   */
  async executeReport(reportId, params = {}) {
    if (params._m_confirmed) {
      // POST for modifications
      return this.post(`report/${reportId}`, params)
    } else {
      // GET for viewing
      return this.get(`report/${reportId}`, params)
    }
  }

  /**
   * Delete objects matching filter
   */
  async deleteObjectsByFilter(typeId, filterParams = {}) {
    return this.post(`object/${typeId}`, {
      _m_del_select: 1,
      ...filterParams
    })
  }

  /**
   * Get directory admin data
   */
  async getDirAdmin(path = '') {
    return this.get('dir_admin', { path })
  }

  /**
   * Upload file to directory
   * Issue #3811, #4203: Header selection based on TARGET database
   * - database === 'my' → X-Authorization (direct access)
   * - database !== 'my' → 'my' header (kernel routing)
   */
  async uploadFile(file, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    formData.append('_xsrf', this.xsrfToken)

    const url = this.buildURL('dir_admin')
    const headers = {
      'Content-Type': 'multipart/form-data'
    }

    // Issue #3811, #4203, #4950: Authorization header selection
    if (this.database === 'my' || this.authDatabase === this.database) {
      headers['X-Authorization'] = this.token
    } else {
      headers['my'] = this.token
    }

    // Issue #4102: Add JSON_KV parameter to all requests
    const response = await axios.post(url, formData, {
      params: {
        JSON_KV: ''
      },
      headers
    })

    return response.data
  }

  /**
   * Create backup
   */
  async createBackup() {
    return this.post('backup')
  }

  /**
   * Restore database from backup file
   * GET /api/{database}/restore/?backup_file={filename}
   * @param {string} backupFile - Name of the backup file (e.g., "backup_2025-12-14.dmp.zip")
   * @returns {Promise<Object>} Response with restore status
   */
  async restoreBackup(backupFile) {
    return this.get('restore', { backup_file: backupFile })
  }

  /**
   * Get reference options (for select dropdowns)
   * GET /api/{database}/_ref_reqs/{requisiteId}?id={objectId}&r={restrict}&type=query
   * @param {number} requisiteId - Requisite ID
   * @param {number} objectId - Object ID being edited
   * @param {number} restrict - Optional restriction filter
   * @param {string} query - Optional search query
   * @returns {Promise<Object>} Object with id:text pairs
   */
  async getReferenceOptions(requisiteId, objectId, restrict = null, query = null) {
    const params = { id: objectId }

    if (restrict) {
      params.r = restrict
    }

    if (query) {
      params.type = 'query'
      params.q = query
    }

    return this.get(`_ref_reqs/${requisiteId}`, params)
  }

  // ==================== Multiselect Operations ====================

  /**
   * Add item to multiselect field
   * POST /api/{database}/_m_set/{objectId}?JSON&t{reqId}={value}
   * @param {number} objectId - Object ID being edited
   * @param {number} requisiteId - Requisite ID of the multiselect field
   * @param {number|string} value - ID of the item to add
   * @returns {Promise<Object>} Response with the multiselect item ID
   */
  async addMultiselectItem(objectId, requisiteId, value) {
    return this.post(`_m_set/${objectId}`, {
      [`t${requisiteId}`]: value
    })
  }

  /**
   * Remove item from multiselect field
   * POST /api/{database}/_m_del/{itemId}?JSON
   * @param {number} itemId - Multiselect item ID (NOT the referenced object ID)
   * @returns {Promise<Object>} Response confirming deletion
   */
  async removeMultiselectItem(itemId) {
    return this.post(`_m_del/${itemId}`)
  }

  /**
   * Get multiselect items for an object's field
   * GET /api/{database}/_ref_reqs/{requisiteId}?id={objectId}
   * @param {number} objectId - Object ID to get multiselect items from
   * @param {number} requisiteId - Requisite ID of multiselect field
   * @returns {Promise<Array>} Array of {id, value} for each selected item
   */
  async getMultiselectItems(objectId, requisiteId) {
    const editData = await this.getObjectEditData(objectId)

    // Find multiselect items in the requisites
    if (editData && editData.reqs && editData.reqs[requisiteId]) {
      const reqData = editData.reqs[requisiteId]
      if (Array.isArray(reqData)) {
        return reqData.map(item => ({
          id: item.id,
          value: item.val || item.value
        }))
      }
    }

    return []
  }

  // ==================== Report Operations ====================

  /**
   * Create a new report/query (Запрос, typeId=22)
   * @param {string} name - Report name
   * @param {Object} options - Report options
   * @param {string} [options.where] - WHERE clause
   * @param {string} [options.having] - HAVING clause
   * @param {string} [options.orderBy] - ORDER BY clause
   * @param {string} [options.limit] - LIMIT value
   * @param {boolean} [options.execute] - Execute flag
   * @returns {Promise<Object>} Created report with id
   */
  async createReport(name, options = {}) {
    const REPORT_TYPE_ID = 22
    const result = await this.createObject(REPORT_TYPE_ID, name)
    const reportId = result.id

    if (reportId && Object.keys(options).length > 0) {
      const requisites = {}

      // Map options to requisite IDs (standard report requisites)
      if (options.where) requisites['262'] = options.where      // WHERE
      if (options.having) requisites['263'] = options.having    // HAVING
      if (options.orderBy) requisites['264'] = options.orderBy  // ORDER BY
      if (options.limit) requisites['134'] = options.limit      // LIMIT
      if (options.execute) requisites['228'] = '1'              // EXECUTE flag

      if (Object.keys(requisites).length > 0) {
        await this.setObjectRequisites(reportId, requisites)
      }
    }

    return { id: reportId, name }
  }

  /**
   * Add a column to an existing report (typeId=28)
   * @param {number} reportId - Report ID (parent)
   * @param {Object} column - Column configuration
   * @param {number} column.fieldId - Field ID from rep_col_list (use 0 for computed columns)
   * @param {string} [column.nameInReport] - Column display name (requisite 100)
   * @param {string} [column.formula] - Formula or alias (requisite 101)
   * @param {number} [column.functionId] - Function ID (requisite 104)
   * @param {boolean} [column.hide] - Hide column (requisite 107)
   * @param {string} [column.alias] - Column ALIAS (requisite 58)
   * @param {string} [column.set] - SET expression for calculated columns (requisite 132)
   * @param {number} [column.sort] - Sort order (requisite 109)
   * @param {number} [column.total] - Total/aggregate function ID (requisite 72)
   * @param {number} [column.format] - Display format ID (requisite 84)
   * @returns {Promise<Object>} Created column with id
   */
  async addReportColumn(reportId, column) {
    const COLUMN_TYPE_ID = 28
    const columnName = column.nameInReport || column.alias || `Column ${column.fieldId}`

    // Create column as subordinate object of report
    const result = await this.createObject(COLUMN_TYPE_ID, columnName, {}, reportId)
    const columnId = result.id

    if (columnId) {
      const requisites = {}

      // Field ID (req 91) - the actual field reference
      if (column.fieldId !== undefined) requisites['91'] = String(column.fieldId)

      // Standard column requisites
      if (column.nameInReport) requisites['100'] = column.nameInReport
      if (column.formula) requisites['101'] = column.formula
      if (column.functionId) requisites['104'] = String(column.functionId)
      if (column.hide) requisites['107'] = '1'
      if (column.alias) requisites['58'] = column.alias
      if (column.set) requisites['132'] = column.set
      if (column.sort) requisites['109'] = String(column.sort)
      if (column.total) requisites['72'] = String(column.total)
      if (column.format) requisites['84'] = String(column.format)

      if (Object.keys(requisites).length > 0) {
        await this.setObjectRequisites(columnId, requisites)
      }
    }

    return { id: columnId, ...column }
  }

  /**
   * Add a FROM table to an existing report (typeId=44)
   * @param {number} reportId - Report ID (parent)
   * @param {number} tableId - Table type ID to add to FROM clause
   * @param {string} [alias] - Table alias in the query (requisite 265)
   * @param {string} [joinOn] - JOIN ON condition (requisite 266)
   * @returns {Promise<Object>} Created FROM entry with id
   */
  async addReportFrom(reportId, tableId, alias = null, joinOn = null) {
    const FROM_TYPE_ID = 44

    // Get table name for the FROM entry value
    let tableName = `Table ${tableId}`
    try {
      const metadata = await this.getTypeMetadata(tableId)
      if (metadata && metadata.type) {
        tableName = metadata.type.val || metadata.type.name || tableName
      }
    } catch (e) {
      // Use default name if metadata fails
    }

    // Create FROM entry as subordinate object of report
    const result = await this.createObject(FROM_TYPE_ID, tableName, {}, reportId)
    const fromId = result.id

    if (fromId) {
      const requisites = {
        '91': String(tableId)  // Table reference
      }

      if (alias) requisites['265'] = alias
      if (joinOn) requisites['266'] = joinOn

      await this.setObjectRequisites(fromId, requisites)
    }

    return { id: fromId, tableId, alias, joinOn }
  }

  /**
   * Clone an existing report with all its FROM tables and columns
   * @param {number} sourceReportId - Source report ID to clone
   * @param {string} newName - Name for the cloned report
   * @param {boolean} [setExecute=false] - Set EXECUTE flag on cloned report
   * @returns {Promise<Object>} Cloned report with id
   */
  async cloneReport(sourceReportId, newName, setExecute = false) {
    // Get source report structure
    const structure = await this.getReportStructure(sourceReportId)

    if (!structure || !structure.report) {
      throw new Error(`Report ${sourceReportId} not found`)
    }

    // Create new report
    const newReport = await this.createReport(newName, {
      where: structure.report.where,
      having: structure.report.having,
      orderBy: structure.report.orderBy,
      limit: structure.report.limit,
      execute: setExecute
    })

    // Clone FROM tables
    if (structure.fromTables && structure.fromTables.length > 0) {
      for (const from of structure.fromTables) {
        await this.addReportFrom(newReport.id, from.tableId, from.alias, from.joinOn)
      }
    }

    // Clone columns
    if (structure.columns && structure.columns.length > 0) {
      for (const col of structure.columns) {
        await this.addReportColumn(newReport.id, col)
      }
    }

    return newReport
  }

  /**
   * Get complete structure of a report including FROM tables and columns
   * @param {number} reportId - Report ID to get structure for
   * @returns {Promise<Object>} Report structure with fromTables and columns
   */
  async getReportStructure(reportId) {
    const editData = await this.getObjectEditData(reportId)

    if (!editData || !editData.obj) {
      return null
    }

    const report = {
      id: reportId,
      name: editData.obj.val,
      where: editData.reqs?.['262']?.value || null,
      having: editData.reqs?.['263']?.value || null,
      orderBy: editData.reqs?.['264']?.value || null,
      limit: editData.reqs?.['134']?.value || null,
      execute: editData.reqs?.['228']?.value === '1'
    }

    // Get subordinate FROM tables (typeId=44) and columns (typeId=28)
    const fromTables = []
    const columns = []

    // Get subordinate objects
    if (editData['&object_reqs']) {
      const objectReqs = editData['&object_reqs']

      // Parse FROM tables
      if (objectReqs['44']) {
        const fromData = objectReqs['44']
        if (Array.isArray(fromData)) {
          for (const item of fromData) {
            fromTables.push({
              id: item.id,
              tableId: parseInt(item.reqs?.['91']?.value) || 0,
              alias: item.reqs?.['265']?.value || null,
              joinOn: item.reqs?.['266']?.value || null
            })
          }
        }
      }

      // Parse columns
      if (objectReqs['28']) {
        const colData = objectReqs['28']
        if (Array.isArray(colData)) {
          for (const item of colData) {
            columns.push({
              id: item.id,
              fieldId: parseInt(item.reqs?.['91']?.value) || 0,
              nameInReport: item.reqs?.['100']?.value || null,
              formula: item.reqs?.['101']?.value || null,
              functionId: parseInt(item.reqs?.['104']?.value) || null,
              hide: item.reqs?.['107']?.value === '1',
              alias: item.reqs?.['58']?.value || null,
              set: item.reqs?.['132']?.value || null,
              sort: parseInt(item.reqs?.['109']?.value) || null,
              total: parseInt(item.reqs?.['72']?.value) || null,
              format: parseInt(item.reqs?.['84']?.value) || null
            })
          }
        }
      }
    }

    return { report, fromTables, columns }
  }

  // ==================== Account Management Operations ====================

  /**
   * Register new user account
   * Issue #4177: Account registration implementation
   * POST /register.asp or /api/register
   * @param {Object} registrationData - Registration data
   * @param {string} registrationData.email - User email
   * @param {string} registrationData.password - User password
   * @param {boolean} registrationData.agree - Terms accepted
   * @returns {Promise<Object>} Registration response
   */
  async register(registrationData) {
    try {
      // Registration endpoint doesn't require authentication
      const url = `${this.baseURL}/register.asp`

      const postData = new URLSearchParams()
      postData.append('email', registrationData.email)
      postData.append('password', registrationData.password)
      postData.append('agree', registrationData.agree ? '1' : '0')

      const response = await axios.post(url, postData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      return {
        success: true,
        message: 'Registration successful. Please check your email to confirm.',
        data: response.data
      }
    } catch (error) {
      console.error('Registration error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Request password reset
   * Issue #4177: Password reset implementation
   * POST /reset.asp or /api/reset-password
   * @param {Object} resetData - Password reset data
   * @param {string} resetData.database - Database name (optional)
   * @param {string} resetData.login - User login or email
   * @returns {Promise<Object>} Reset response
   */
  async resetPassword(resetData) {
    try {
      // Password reset endpoint doesn't require authentication
      const url = `${this.baseURL}/reset.asp`

      const postData = new URLSearchParams()
      if (resetData.database) {
        postData.append('db', resetData.database)
      }
      postData.append('login', resetData.login)

      const response = await axios.post(url, postData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      return {
        success: true,
        message: 'Password reset email sent. Please check your inbox.',
        data: response.data
      }
    } catch (error) {
      console.error('Password reset error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Handle Google OAuth callback
   * Issue #4177: Google OAuth implementation
   * GET /auth.asp?code={code}&state={database}
   * @param {string} code - OAuth authorization code from Google
   * @param {string} database - Database name from state parameter
   * @returns {Promise<Object>} Authentication result
   */
  async handleGoogleOAuthCallback(code, database = 'my') {
    try {
      const url = `${this.baseURL}/auth.asp`

      const params = new URLSearchParams()
      params.append('code', code)
      if (database) {
        params.append('state', database)
      }

      const response = await axios.get(`${url}?${params.toString()}`)

      // Parse response (format depends on backend implementation)
      // Expected: redirect with token set in cookies, or JSON response
      if (response.data.success || response.data.token) {
        const authData = response.data
        this.database = database
        this.token = authData.token
        this.xsrfToken = authData.xsrf || authData.token
        this.userId = authData.userId
        this.userName = authData.userName || authData.email
        this.userRole = authData.userRole
        this.authDatabase = database

        this.saveSession()

        return {
          success: true,
          token: this.token,
          xsrf: this.xsrfToken,
          userId: this.userId,
          userName: this.userName,
          userRole: this.userRole
        }
      } else {
        throw new Error('OAuth authentication failed')
      }
    } catch (error) {
      console.error('Google OAuth callback error:', error)
      throw this.handleError(error)
    }
  }

  // ==================== Service Operations ====================

  /**
   * Set exact object order
   * POST /{database}/_m_ord/{objectId}?order={order}
   * @param {number} objectId - Object ID to reorder
   * @param {number} order - New order position (1-based)
   * @returns {Promise<Object>} Result
   */
  async setObjectOrder(objectId, order) {
    if (!Number.isInteger(order) || order < 1) {
      throw new Error('Invalid order: must be a positive integer')
    }
    return this.post(`_m_ord/${objectId}`, { order })
  }

  /**
   * Change object ID
   * POST /{database}/_m_id/{objectId}?new_id={newId}
   * WARNING: This changes the permanent ID of an object. Use with caution!
   * @param {number} objectId - Current object ID
   * @param {number} newId - New ID to assign
   * @returns {Promise<Object>} Result
   */
  async setObjectId(objectId, newId) {
    if (!Number.isInteger(newId) || newId < 1) {
      throw new Error('Invalid new_id: must be a positive integer')
    }
    return this.post(`_m_id/${objectId}`, { new_id: newId })
  }

  /**
   * Set exact requisite order within a type
   * POST /{database}/_d_ord/{requisiteId}?order={order}
   * @param {number} requisiteId - Requisite ID to reorder
   * @param {number} order - New order position (1-based)
   * @returns {Promise<Object>} Result
   */
  async setRequisiteOrder(requisiteId, order) {
    if (!Number.isInteger(order) || order < 1) {
      throw new Error('Invalid order: must be a positive integer')
    }
    return this.post(`_d_ord/${requisiteId}`, { order })
  }

  /**
   * Get object metadata in alternative format
   * GET /{database}/obj_meta/{objectId}
   * @param {number} objectId - Object ID
   * @returns {Promise<Object>} Object metadata with requisites info
   */
  async getObjectMeta(objectId) {
    return this.get(`obj_meta/${objectId}`)
  }

  /**
   * Get all references to an object (what objects reference this object)
   * GET /{database}/_references/{objectId}
   * @param {number} objectId - Object ID to find references for
   * @returns {Promise<Object>} Object with references list
   */
  async getReferences(objectId) {
    return this.get(`_references/${objectId}`)
  }

  /**
   * Get list of all independent types (terms)
   * Alternative to getDictionary() with different format
   * GET /{database}/terms
   * @returns {Promise<Array>} Array of {id, type, name}
   */
  async getTerms() {
    return this.get('terms')
  }

  // ==================== Alternative Authentication ====================

  /**
   * Authenticate using JWT token
   * POST /{database}/jwt
   * @param {string} jwtToken - JWT token to verify
   * @returns {Promise<Object>} Authentication result
   */
  async authenticateJWT(jwtToken) {
    try {
      const url = this.buildURL('jwt')

      const formData = new URLSearchParams()
      formData.append('jwt', jwtToken)

      const response = await axios.post(url, formData, {
        params: { JSON_KV: '' },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (response.data.error) {
        throw new Error(response.data.error)
      }

      // Save tokens from JWT auth response
      if (response.data.token) {
        this.token = response.data.token
        this.xsrfToken = response.data._xsrf || response.data.xsrf
        this.userId = response.data.id || response.data.userId
        this.userName = response.data.user || response.data.userName
        this.userRole = response.data.role
        this.authDatabase = this.database
        this.saveSession()
      }

      return {
        success: true,
        token: this.token,
        xsrf: this.xsrfToken,
        userId: this.userId,
        userName: this.userName,
        userRole: this.userRole
      }
    } catch (error) {
      console.error('JWT authentication error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Request OTP code via email
   * POST /{database}/getcode?u={email}
   * @param {string} email - User email to send OTP to
   * @returns {Promise<Object>} {msg: 'ok'} or {msg: 'new'} for new users
   */
  async getOTPCode(email) {
    try {
      const url = this.buildURL('getcode')

      const formData = new URLSearchParams()
      formData.append('u', email)

      // Add timezone for session
      formData.append('tzone', Date.now())

      const response = await axios.post(url, formData, {
        params: { JSON_KV: '' },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      return response.data
    } catch (error) {
      console.error('OTP request error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Verify OTP code and authenticate
   * POST /{database}/checkcode?u={email}&c={code}
   * @param {string} email - User email
   * @param {string} code - 4-character OTP code
   * @returns {Promise<Object>} {token, _xsrf} on success
   */
  async checkOTPCode(email, code) {
    try {
      if (!code || code.length !== 4) {
        throw new Error('OTP code must be exactly 4 characters')
      }

      const url = this.buildURL('checkcode')

      const formData = new URLSearchParams()
      formData.append('u', email)
      formData.append('c', code.toLowerCase())

      const response = await axios.post(url, formData, {
        params: { JSON_KV: '' },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })

      if (response.data.error) {
        throw new Error(response.data.error)
      }

      // Save tokens
      if (response.data.token) {
        this.token = response.data.token
        this.xsrfToken = response.data._xsrf
        this.userName = email
        this.authDatabase = this.database
        this.saveSession()
      }

      return {
        success: true,
        token: response.data.token,
        xsrf: response.data._xsrf
      }
    } catch (error) {
      console.error('OTP verification error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Confirm user registration
   * GET /{database}/confirm?u={login}&o={oldPassword}&p={newPassword}
   * @param {string} login - User login
   * @param {string} oldPassword - Temporary/confirmation password
   * @param {string} newPassword - New password to set
   * @returns {Promise<Object>} Confirmation result
   */
  async confirmRegistration(login, oldPassword, newPassword) {
    try {
      const url = this.buildURL('confirm')

      const response = await axios.get(url, {
        params: {
          JSON_KV: '',
          u: login,
          o: oldPassword,
          p: newPassword
        }
      })

      return {
        success: true,
        data: response.data
      }
    } catch (error) {
      console.error('Registration confirmation error:', error)
      throw this.handleError(error)
    }
  }

  // ==================== Database Management ====================

  /**
   * Create a new database (only from 'my' database)
   * POST /my/_new_db?db={dbName}&template={template}
   * @param {string} dbName - New database name (3-15 latin letters/digits, starts with letter)
   * @param {string} template - Template to use ('ru', 'en', etc.)
   * @param {string} description - Database description
   * @returns {Promise<Object>} {status: 'Ok', id: newDbId}
   */
  async createDatabase(dbName, template = 'ru', description = '') {
    try {
      // Validate database name
      const dbNameRegex = /^[a-z][a-z0-9]{2,14}$/i
      if (!dbNameRegex.test(dbName)) {
        throw new Error('Недопустимое имя базы (3-15 латинских букв и цифр, начиная с буквы)')
      }

      // This operation is only available from 'my' database
      const originalDatabase = this.database
      this.database = 'my'

      try {
        const response = await this.post('_new_db', {
          db: dbName.toLowerCase(),
          template: template.toLowerCase(),
          descr: description
        })

        return response
      } finally {
        // Restore original database
        this.database = originalDatabase
      }
    } catch (error) {
      console.error('Database creation error:', error)
      throw this.handleError(error)
    }
  }

  /**
   * Connect to external data source
   * POST /{database}/_connect
   * @param {Object} connectionData - Connection parameters
   * @param {string} connectionData.type - Connection type
   * @param {string} connectionData.url - External URL
   * @param {Object} connectionData.params - Additional parameters
   * @returns {Promise<Object>} Connection result
   */
  async connect(connectionData) {
    return this.post('_connect', connectionData)
  }

  // ==================== Session & User Management ====================

  /**
   * Exit session and invalidate token
   * POST /{database}/exit
   * @returns {Promise<void>}
   */
  async exit() {
    try {
      await this.post('exit')
    } catch (error) {
      // Ignore errors on exit
      console.warn('Exit error (ignored):', error)
    } finally {
      this.logout()
    }
  }

  /**
   * Get all metadata for all types in database
   * GET /{database}/metadata
   * @returns {Promise<Array>} Array of type metadata
   */
  async getAllTypesMetadata() {
    return this.get('metadata')
  }

  // ==================== High-Level Operations ====================
  //
  // These methods combine multiple API calls for common operations.
  // Ported from MCP server for feature parity.
  //

  /**
   * Get ALL objects for type with automatic pagination and deduplication.
   * Fetches all pages until no more data available.
   *
   * @param {number} typeId - Type ID
   * @param {number} pageSize - Objects per page (default: 100)
   * @param {number} maxPages - Maximum pages to fetch (default: 50)
   * @returns {Promise<Object>} { totalCount, object, reqs }
   */
  async getAllObjects(typeId, pageSize = 100, maxPages = 50) {
    let allObjects = []
    let allReqs = {}
    let page = 1
    let hasMore = true
    let typeInfo = null
    const seenIds = new Set()

    while (hasMore && page <= maxPages) {
      const pageResult = await this.get(`object/${typeId}`, {
        LIMIT: pageSize,
        pg: page
      })

      if (page === 1) {
        typeInfo = pageResult.type
      }

      const pageObjects = pageResult.object || []
      if (pageObjects.length === 0) {
        hasMore = false
      } else {
        for (const obj of pageObjects) {
          const objId = obj.id || obj.ID
          if (objId && !seenIds.has(objId)) {
            seenIds.add(objId)
            allObjects.push(obj)
          }
        }

        if (pageResult.reqs) {
          for (const [objId, reqData] of Object.entries(pageResult.reqs)) {
            if (seenIds.has(objId) && !allReqs[objId]) {
              allReqs[objId] = reqData
            }
          }
        }

        if (pageObjects.length < pageSize) {
          hasMore = false
        }
      }
      page++
    }

    return {
      type: typeInfo,
      totalCount: allObjects.length,
      pagesLoaded: page - 1,
      object: allObjects,
      reqs: allReqs
    }
  }

  /**
   * Get count of objects in a type without fetching all data.
   *
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} { typeId, count }
   */
  async getObjectCount(typeId) {
    const result = await this.get(`object/${typeId}`, { _count: '' })
    return {
      typeId,
      count: parseInt(result.count, 10) || 0
    }
  }

  /**
   * Create complete table with columns in one operation.
   *
   * @param {string} tableName - Table name
   * @param {Array} columns - Array of { requisiteTypeId, alias, allowNull?, multiSelect? }
   * @param {number} baseTypeId - Base type ID (default: 3)
   * @param {boolean} unique - First column is unique
   * @returns {Promise<Object>} { typeId, columns }
   */
  async createTableWithColumns(tableName, columns = [], baseTypeId = 3, unique = false) {
    // Create type
    const typeResult = await this.createType(tableName, baseTypeId, unique)
    const typeId = typeResult.obj || typeResult.id

    if (!typeId) {
      throw new Error(`Failed to create table: ${JSON.stringify(typeResult)}`)
    }

    const createdColumns = []

    for (const column of columns) {
      const reqResult = await this.addRequisite(typeId, column.requisiteTypeId)
      const requisiteId = reqResult.id

      if (requisiteId) {
        await this.saveRequisiteAlias(requisiteId, column.alias)

        if (column.allowNull === false) {
          await this.toggleRequisiteNull(requisiteId)
        }
        if (column.multiSelect === true) {
          await this.toggleRequisiteMulti(requisiteId)
        }

        createdColumns.push({
          requisiteId,
          alias: column.alias,
          requisiteTypeId: column.requisiteTypeId
        })
      }
    }

    return { typeId, tableName, columns: createdColumns }
  }

  /**
   * Delete table and all its data (cascade).
   *
   * @param {number} typeId - Type ID to delete
   * @param {boolean} confirm - Must be true to proceed
   * @returns {Promise<Object>}
   */
  async deleteTableCascade(typeId, confirm = false) {
    if (!confirm) {
      throw new Error('Confirmation required: set confirm=true to delete')
    }

    // Delete all objects first
    const objects = await this.getObjectList(typeId, { LIMIT: 1000 })
    for (const obj of (objects.object || [])) {
      await this.deleteObject(obj.id || obj.ID)
    }

    // Delete type
    return this.deleteType(typeId)
  }

  /**
   * Get complete table structure including metadata and columns.
   *
   * @param {number} typeId - Type ID
   * @returns {Promise<Object>} { type, columns, objectCount }
   */
  async getTableStructure(typeId) {
    const [metadata, objects] = await Promise.all([
      this.getTypeMetadata(typeId),
      this.getObjectCount(typeId)
    ])

    return {
      type: metadata.type || metadata,
      columns: metadata.reqs || [],
      objectCount: objects.count
    }
  }

  /**
   * Clone table structure (create new table with same columns).
   *
   * @param {number} sourceTypeId - Source type ID
   * @param {string} newTableName - New table name
   * @param {number} baseTypeId - Base type ID (default: 3)
   * @returns {Promise<Object>} { typeId, columns }
   */
  async cloneTableStructure(sourceTypeId, newTableName, baseTypeId = 3) {
    const source = await this.getTypeMetadata(sourceTypeId)
    const columns = (source.reqs || []).map(req => ({
      requisiteTypeId: req.requisite_type_id || req.t,
      alias: req.alias || req.val
    }))

    return this.createTableWithColumns(newTableName, columns, baseTypeId)
  }

  /**
   * Rename existing table.
   *
   * @param {number} typeId - Type ID
   * @param {string} newName - New name
   * @returns {Promise<Object>}
   */
  async renameTable(typeId, newName) {
    const metadata = await this.getTypeMetadata(typeId)
    const baseTypeId = metadata.type?.t || 3
    return this.saveType(typeId, newName, baseTypeId)
  }

  /**
   * Add multiple columns to existing table.
   *
   * @param {number} typeId - Type ID
   * @param {Array} columns - Array of { requisiteTypeId, alias, allowNull?, multiSelect? }
   * @returns {Promise<Object>} { columns }
   */
  async addColumnsToTable(typeId, columns = []) {
    const createdColumns = []

    for (const column of columns) {
      const reqResult = await this.addRequisite(typeId, column.requisiteTypeId)
      const requisiteId = reqResult.id

      if (requisiteId) {
        await this.saveRequisiteAlias(requisiteId, column.alias)

        if (column.allowNull === false) {
          await this.toggleRequisiteNull(requisiteId)
        }
        if (column.multiSelect === true) {
          await this.toggleRequisiteMulti(requisiteId)
        }

        createdColumns.push({ requisiteId, alias: column.alias })
      }
    }

    return { typeId, columns: createdColumns }
  }

  /**
   * Create lookup/reference table with initial values.
   *
   * @param {string} tableName - Table name
   * @param {Array} values - Initial values
   * @param {boolean} unique - Make values unique (default: true)
   * @returns {Promise<Object>} { typeId, objects }
   */
  async createLookupTable(tableName, values = [], unique = true) {
    const typeResult = await this.createType(tableName, 3, unique)
    const typeId = typeResult.obj || typeResult.id

    const createdObjects = []
    for (const value of values) {
      const obj = await this.createObject(typeId, value)
      if (obj.id) {
        createdObjects.push({ id: obj.id, value })
      }
    }

    return { typeId, tableName, objects: createdObjects }
  }

  /**
   * Create lookup table AND add it as reference column to another table.
   *
   * @param {number} targetTableId - Table to add reference column to
   * @param {string} lookupTableName - Name for new lookup table
   * @param {string} columnAlias - Alias for reference column
   * @param {Array} values - Initial lookup values
   * @param {boolean} multiSelect - Enable multi-select
   * @returns {Promise<Object>} { lookupTypeId, referenceColumn }
   */
  async createLookupWithReference(targetTableId, lookupTableName, columnAlias, values = [], multiSelect = false) {
    // Create lookup table
    const lookup = await this.createLookupTable(lookupTableName, values)

    // Add reference column to target table
    const refResult = await this.addRequisite(targetTableId, lookup.typeId)
    const requisiteId = refResult.id

    if (requisiteId) {
      await this.saveRequisiteAlias(requisiteId, columnAlias || lookupTableName)
      if (multiSelect) {
        await this.toggleRequisiteMulti(requisiteId)
      }
    }

    return {
      lookupTypeId: lookup.typeId,
      lookupObjects: lookup.objects,
      referenceColumn: { requisiteId, alias: columnAlias || lookupTableName }
    }
  }

  /**
   * Create multiple objects in batch.
   *
   * @param {number} typeId - Type ID
   * @param {Array} objects - Array of { value, requisites? }
   * @param {number} parentId - Optional parent ID
   * @returns {Promise<Object>} { created }
   */
  async createObjectsBatch(typeId, objects = [], parentId = null) {
    const created = []

    for (const obj of objects) {
      // Format requisites dates before passing to createObject
      const formattedRequisites = {}
      for (const [reqId, reqValue] of Object.entries(obj.requisites || {})) {
        formattedRequisites[reqId] = formatRequisiteValue(reqValue)
      }
      const result = await this.createObject(typeId, obj.value, formattedRequisites, parentId)
      if (result.id) {
        created.push({ id: result.id, value: obj.value })
      }
    }

    return { typeId, created }
  }

  /**
   * Create parent object with child objects.
   *
   * @param {number} parentTypeId - Parent type ID
   * @param {string} parentValue - Parent value
   * @param {Object} parentRequisites - Parent requisites
   * @param {number} childTypeId - Child type ID
   * @param {Array} children - Array of { value, requisites? }
   * @returns {Promise<Object>} { parent, children }
   */
  async createParentWithChildren(parentTypeId, parentValue, parentRequisites = {}, childTypeId, children = []) {
    // Format parent requisites dates
    const formattedParentReqs = {}
    for (const [reqId, reqValue] of Object.entries(parentRequisites)) {
      formattedParentReqs[reqId] = formatRequisiteValue(reqValue)
    }

    // Create parent
    const parentResult = await this.createObject(parentTypeId, parentValue, formattedParentReqs)
    const parentId = parentResult.id

    if (!parentId) {
      throw new Error('Failed to create parent object')
    }

    // Create children with formatted requisites
    const createdChildren = []
    for (const child of children) {
      const formattedChildReqs = {}
      for (const [reqId, reqValue] of Object.entries(child.requisites || {})) {
        formattedChildReqs[reqId] = formatRequisiteValue(reqValue)
      }
      const childResult = await this.createObject(childTypeId, child.value, formattedChildReqs, parentId)
      if (childResult.id) {
        createdChildren.push({ id: childResult.id, value: child.value })
      }
    }

    return {
      parent: { id: parentId, value: parentValue },
      children: createdChildren
    }
  }

  /**
   * Rename requisite (column).
   *
   * @param {number} requisiteId - Requisite ID
   * @param {string} newName - New name
   * @param {number} requisiteTypeId - Requisite type ID
   * @returns {Promise<Object>}
   */
  async renameRequisite(requisiteId, newName, requisiteTypeId) {
    return this.post(`_d_save/${requisiteId}`, {
      val: newName,
      t: requisiteTypeId
    })
  }

  /**
   * Get database schema optimized for LLM context.
   *
   * @param {string} filter - Optional filter for table names
   * @param {boolean} includeSystemTables - Include system tables
   * @returns {Promise<Array>} Array of { id, name, fields }
   */
  async getSchema(filter = null, includeSystemTables = false) {
    const dict = await this.getDictionary()
    const types = dict.type || dict.types || []

    const SYSTEM_TYPES = [1, 6, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 42, 44]
    const TYPE_NAMES = {
      2: 'LONG', 3: 'SHORT', 4: 'DATETIME', 7: 'BOOL',
      8: 'CHARS', 9: 'DATE', 10: 'FILE', 13: 'NUMBER'
    }

    const schema = []

    for (const type of types) {
      const typeId = type.id || type.ID

      if (!includeSystemTables && SYSTEM_TYPES.includes(typeId)) continue
      if (filter && !type.val?.toLowerCase().includes(filter.toLowerCase())) continue

      const metadata = await this.getTypeMetadata(typeId)
      const fields = (metadata.reqs || []).map(req => {
        const field = {
          id: req.id,
          name: req.alias || req.val,
          type: TYPE_NAMES[req.requisite_type_id] || 'REF'
        }
        if (!TYPE_NAMES[req.requisite_type_id]) {
          field.ref = req.requisite_type_id
        }
        return field
      })

      schema.push({
        id: typeId,
        name: type.val,
        fields
      })
    }

    return schema
  }
}

// Export singleton instance
export default new IntegramApiClient()
