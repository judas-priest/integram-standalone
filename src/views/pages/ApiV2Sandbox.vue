<template>
  <div :class="['api-sandbox', { 'dark-theme': isDarkTheme }]">
    <div class="sandbox-header">
      <div class="header-content">
        <div>
          <h1>🚀 API v2 Песочница</h1>
          <p>Интерактивное тестирование Integram Standalone API v2</p>
        </div>
        <div class="header-controls">
          <button @click="toggleTheme" class="theme-toggle" :title="isDarkTheme ? 'Светлая тема' : 'Темная тема'">
            {{ isDarkTheme ? '☀️' : '🌙' }}
          </button>
          <button @click="showKeyboardShortcuts = true" class="shortcuts-btn" title="Горячие клавиши (?)">
            ⌨️
          </button>
        </div>
      </div>
    </div>

    <div class="sandbox-content">
      <!-- Left Panel: Auth & Endpoints -->
      <div class="left-panel">
        <!-- Authentication Section -->
        <div class="auth-section collapsible-section">
          <div class="section-header" @click="toggleSection('auth')">
            <h3>🔐 Авторизация</h3>
            <span class="collapse-icon">{{ collapsedSections.auth ? '▼' : '▲' }}</span>
          </div>

          <div v-show="!collapsedSections.auth" class="section-content">
            <div class="auth-hint">
              ℹ️ Пользователи хранятся в <code>/{{authForm.database}}/object/18</code> (старый API)
            </div>

            <div :class="['auth-status', authState.isAuthenticated ? 'connected' : 'disconnected']">
              {{ authState.isAuthenticated
                ? `✅ Авторизован: ${authState.login}@${authState.database}`
                : '❌ Не авторизован'
              }}
            </div>

            <div class="auth-input-group">
              <label>Server URL</label>
              <input
                v-model="authForm.serverUrl"
                type="text"
                placeholder="https://YOUR_SERVER_IP"
                readonly
              />
            </div>

            <div class="auth-input-group">
              <label>База данных</label>
              <input
                v-model="authForm.database"
                type="text"
                placeholder="my, a2025, ru, fm..."
              />
              <div class="quick-db-buttons">
                <button @click="authForm.database = 'my'">my</button>
                <button @click="authForm.database = 'a2025'">a2025</button>
                <button @click="authForm.database = 'ru'">ru</button>
                <button @click="authForm.database = 'fm'">fm</button>
              </div>
            </div>

            <div class="auth-input-group">
              <label>Логин</label>
              <input
                v-model="authForm.login"
                type="text"
                placeholder="Ваш логин"
              />
            </div>

            <div class="auth-input-group">
              <label>Пароль</label>
              <input
                v-model="authForm.password"
                type="password"
                placeholder="Ваш пароль"
              />
            </div>

            <button
              class="btn-auth"
              @click="authenticate"
              :disabled="authState.isAuthenticating"
            >
              {{ authState.isAuthenticating ? '⏳ Авторизация...' : '🔓 Войти' }}
            </button>

            <div v-if="authState.session" class="token-display-wrapper">
              <div class="token-label">Токен:</div>
              <div class="token-display">{{ authState.session }}</div>
            </div>
          </div>
        </div>

        <!-- Endpoints -->
        <div class="endpoint-group">
          <h3>📋 Discovery & Info</h3>
          <div
            v-for="endpoint in endpoints.discovery"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>📊 Integram Types</h3>
          <div
            v-for="endpoint in endpoints.types"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>

        <div class="endpoint-group">
          <h3>📦 Integram Objects</h3>
          <div
            v-for="endpoint in endpoints.objects"
            :key="endpoint.path"
            :class="['endpoint', { active: selectedEndpoint === endpoint }]"
            @click="selectEndpoint(endpoint)"
          >
            <span :class="['method', endpoint.method.toLowerCase()]">{{ endpoint.method }}</span>
            <span class="path">{{ endpoint.name }}</span>
          </div>
        </div>

        <!-- Request History -->
        <div class="history-section collapsible-section">
          <div class="section-header" @click="toggleSection('history')">
            <h3>📜 История запросов</h3>
            <span class="collapse-icon">{{ collapsedSections.history ? '▼' : '▲' }}</span>
          </div>

          <div v-show="!collapsedSections.history" class="section-content">
            <div v-if="requestHistory.length === 0" class="history-empty">
              Нет сохраненных запросов
            </div>
            <div v-else class="history-list">
              <div
                v-for="(item, index) in requestHistory"
                :key="index"
                class="history-item"
                @click="loadFromHistory(item)"
                :title="item.url"
              >
                <span :class="['method', item.method.toLowerCase()]">{{ item.method }}</span>
                <span class="history-url">{{ truncateUrl(item.url) }}</span>
                <span class="history-time">{{ formatTime(item.timestamp) }}</span>
              </div>
            </div>
            <button v-if="requestHistory.length > 0" @click="clearHistory" class="btn-clear-history">
              🗑️ Очистить
            </button>
          </div>
        </div>
      </div>

      <!-- Right Panel: Request & Response -->
      <div class="right-panel">
        <!-- Request Section -->
        <div class="request-section collapsible-section">
          <div class="section-header" @click="toggleSection('request')">
            <h4>🔧 Параметры запроса</h4>
            <span class="collapse-icon">{{ collapsedSections.request ? '▼' : '▲' }}</span>
          </div>

          <div v-show="!collapsedSections.request" class="section-content">
            <div class="input-group">
              <label>Метод</label>
              <input v-model="request.method" type="text" readonly />
            </div>

            <div class="input-group">
              <label>URL</label>
              <input v-model="request.url" type="text" />
            </div>

            <div v-if="needsBody" class="input-group">
              <label>Request Body (JSON)</label>
              <textarea
                v-model="request.body"
                placeholder='{"data": {"type": "...", "attributes": {...}}}'
                rows="8"
              ></textarea>
            </div>
          </div>

          <button
            class="btn-primary"
            @click="sendRequest"
            :disabled="isLoading"
          >
            {{ isLoading ? '⏳ Отправка...' : '▶️ Отправить запрос' }}
          </button>
        </div>

        <!-- Response Section -->
        <div v-if="response.data" class="response-section">
          <div class="response-header">
            <div class="response-info">
              <h4>📥 Ответ</h4>
              <span :class="['response-status', response.ok ? 'success' : 'error']">
                {{ response.status }} {{ response.statusText }}
              </span>
              <span class="response-time">⏱️ {{ response.duration }}ms</span>
            </div>
            <div class="response-actions">
              <button @click="searchInJson = !searchInJson" class="action-btn" title="Поиск (Ctrl+F)">
                🔍
              </button>
              <button @click="copyResponse" class="action-btn" title="Копировать (Ctrl+C)">
                📋
              </button>
              <button @click="downloadResponse" class="action-btn" title="Скачать">
                💾
              </button>
              <button @click="toggleExpandResponse" class="action-btn" title="Развернуть (Ctrl+E)">
                {{ isResponseExpanded ? '🗕' : '🗖' }}
              </button>
            </div>
          </div>

          <!-- Search in JSON -->
          <div v-if="searchInJson" class="json-search">
            <input
              ref="searchInput"
              v-model="jsonSearchQuery"
              type="text"
              placeholder="Поиск в JSON..."
              @input="highlightSearchResults"
            />
            <button @click="searchInJson = false" class="close-search">✕</button>
          </div>

          <!-- Response Container -->
          <div
            :class="['response-container', { expanded: isResponseExpanded }]"
            @click="handleResponseClick"
          >
            <div v-if="viewMode === 'tree'" class="json-tree">
              <json-tree-node
                :data="response.data"
                :key-name="'root'"
                :level="0"
                :search-query="jsonSearchQuery"
              />
            </div>
            <pre v-else ref="jsonPre">{{ formatJSON(response.data) }}</pre>
          </div>

          <!-- View Mode Toggle -->
          <div class="view-mode-toggle">
            <button
              :class="{ active: viewMode === 'raw' }"
              @click="viewMode = 'raw'"
            >
              Raw JSON
            </button>
            <button
              :class="{ active: viewMode === 'tree' }"
              @click="viewMode = 'tree'"
            >
              Tree View
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard Shortcuts Dialog -->
    <div v-if="showKeyboardShortcuts" class="modal-overlay" @click="showKeyboardShortcuts = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>⌨️ Горячие клавиши</h3>
          <button @click="showKeyboardShortcuts = false" class="close-modal">✕</button>
        </div>
        <div class="modal-body">
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
            <span>Отправить запрос</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>F</kbd>
            <span>Поиск в JSON</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>C</kbd>
            <span>Копировать ответ</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>E</kbd>
            <span>Развернуть/свернуть ответ</span>
          </div>
          <div class="shortcut-item">
            <kbd>?</kbd>
            <span>Показать это окно</span>
          </div>
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>Закрыть модальное окно</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// JSON Tree Component
const JsonTreeNode = {
  name: 'JsonTreeNode',
  props: ['data', 'keyName', 'level', 'searchQuery'],
  data() {
    return {
      isExpanded: this.level < 2 // Auto-expand first 2 levels
    };
  },
  computed: {
    isObject() {
      return typeof this.data === 'object' && this.data !== null && !Array.isArray(this.data);
    },
    isArray() {
      return Array.isArray(this.data);
    },
    isPrimitive() {
      return !this.isObject && !this.isArray;
    },
    formattedValue() {
      if (this.data === null) return 'null';
      if (this.data === undefined) return 'undefined';
      if (typeof this.data === 'string') return `"${this.data}"`;
      return String(this.data);
    },
    valueType() {
      if (this.data === null) return 'null';
      if (Array.isArray(this.data)) return 'array';
      return typeof this.data;
    },
    childEntries() {
      if (this.isObject) return Object.entries(this.data);
      if (this.isArray) return this.data.map((item, index) => [index, item]);
      return [];
    },
    matchesSearch() {
      if (!this.searchQuery) return false;
      const query = this.searchQuery.toLowerCase();
      const keyMatch = this.keyName && this.keyName.toString().toLowerCase().includes(query);
      const valueMatch = this.isPrimitive && this.formattedValue.toLowerCase().includes(query);
      return keyMatch || valueMatch;
    }
  },
  template: `
    <div class="tree-node" :style="{ paddingLeft: (level * 20) + 'px' }">
      <div
        v-if="!isPrimitive"
        class="tree-key-line"
        :class="{ highlighted: matchesSearch }"
        @click="isExpanded = !isExpanded"
      >
        <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
        <span class="tree-key">{{ keyName }}</span>
        <span class="tree-type">{{ isArray ? '[' + data.length + ']' : '{...}' }}</span>
      </div>
      <div
        v-else
        class="tree-value-line"
        :class="{ highlighted: matchesSearch }"
      >
        <span class="tree-key">{{ keyName }}:</span>
        <span :class="['tree-value', 'type-' + valueType]">{{ formattedValue }}</span>
      </div>
      <div v-if="isExpanded && !isPrimitive">
        <json-tree-node
          v-for="[key, value] in childEntries"
          :key="key"
          :data="value"
          :key-name="key"
          :level="level + 1"
          :search-query="searchQuery"
        />
      </div>
    </div>
  `
};

export default {
  name: 'ApiV2Sandbox',
  components: {
    JsonTreeNode
  },

  data() {
    return {
      authForm: {
        serverUrl: window.location.origin,
        database: 'my',
        login: 'admin',
        password: ''
      },

      authState: {
        isAuthenticated: false,
        isAuthenticating: false,
        session: null,
        token: null,
        database: null,
        login: null
      },

      endpoints: {
        discovery: [
          { method: 'GET', path: '/api/v2', name: '/api/v2', description: 'API Discovery' },
          { method: 'GET', path: '/api/v2/health', name: '/api/v2/health', description: 'Health Check' }
        ],
        types: [
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types', name: '.../types', description: 'List Tables' },
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types/{typeId}/metadata', name: '.../types/{typeId}/metadata', description: 'Get Metadata' }
        ],
        objects: [
          { method: 'GET', path: '/api/v2/integram/databases/{database}/types/{typeId}/objects', name: '.../types/{typeId}/objects', description: 'List Objects' },
          { method: 'POST', path: '/api/v2/integram/databases/{database}/types/{typeId}/objects', name: '.../types/{typeId}/objects', description: 'Create Object' },
          { method: 'GET', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Get Object' },
          { method: 'PATCH', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Update Object' },
          { method: 'DELETE', path: '/api/v2/integram/databases/{database}/objects/{objectId}', name: '.../objects/{objectId}', description: 'Delete Object' }
        ]
      },

      selectedEndpoint: null,

      request: {
        method: 'GET',
        url: 'https://YOUR_SERVER_IP/api/v2',
        body: ''
      },

      response: {
        data: null,
        status: null,
        statusText: null,
        ok: false,
        duration: 0
      },

      isLoading: false,

      bodyExamples: {
        'POST /api/v2/integram/databases/{database}/types/{typeId}/objects': {
          data: {
            type: 'integram-object',
            attributes: {
              requisites: {
                req_name: 'ООО Тестовая Компания',
                req_email: 'test@example.com'
              }
            }
          }
        },
        'PATCH /api/v2/integram/databases/{database}/objects/{objectId}': {
          data: {
            type: 'integram-object',
            id: '{objectId}',
            attributes: {
              requisites: {
                req_name: 'ООО Обновленная Компания'
              }
            }
          }
        }
      },

      // New features
      collapsedSections: {
        auth: false,
        request: false,
        history: true
      },

      isDarkTheme: false,
      isResponseExpanded: false,
      viewMode: 'raw', // 'raw' or 'tree'

      searchInJson: false,
      jsonSearchQuery: '',

      requestHistory: [],
      maxHistoryItems: 10,

      showKeyboardShortcuts: false
    };
  },

  computed: {
    needsBody() {
      return ['POST', 'PATCH', 'PUT'].includes(this.request.method);
    }
  },

  mounted() {
    // Load theme preference
    const savedTheme = localStorage.getItem('api-sandbox-theme');
    if (savedTheme === 'dark') {
      this.isDarkTheme = true;
    }

    // Load request history
    const savedHistory = localStorage.getItem('api-sandbox-history');
    if (savedHistory) {
      try {
        this.requestHistory = JSON.parse(savedHistory);
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }

    // Add keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyboardShortcuts);
  },

  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeyboardShortcuts);
  },

  methods: {
    async authenticate() {
      let { serverUrl, database, login, password } = this.authForm;

      if (!serverUrl || !database || !login || !password) {
        this.$toast.add({ severity: 'error', summary: 'Ошибка', detail: 'Заполните все поля', life: 3000 });
        return;
      }

      if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
        serverUrl = 'https://' + serverUrl;
        this.authForm.serverUrl = serverUrl;
      }

      this.authState.isAuthenticating = true;

      try {
        const response = await fetch(`${serverUrl}/api/v2/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.api+json' },
          body: JSON.stringify({
            data: {
              type: 'auth',
              attributes: { login, password, database }
            }
          })
        });

        const data = await response.json();

        if (response.ok && data.data) {
          this.authState.isAuthenticated = true;
          this.authState.session = data.data.attributes.session;
          this.authState.token = data.data.attributes.token;
          this.authState.database = database;
          this.authState.login = login;

          this.request.url = `${serverUrl}/api/v2`;

          this.$toast.add({
            severity: 'success',
            summary: 'Успешно',
            detail: `Авторизован как ${login}@${database}`,
            life: 3000
          });
        } else {
          throw new Error(data.errors?.[0]?.detail || 'Authentication failed');
        }
      } catch (error) {
        this.$toast.add({
          severity: 'error',
          summary: 'Ошибка авторизации',
          detail: error.message,
          life: 5000
        });
      } finally {
        this.authState.isAuthenticating = false;
      }
    },

    selectEndpoint(endpoint) {
      this.selectedEndpoint = endpoint;
      this.request.method = endpoint.method;

      let path = endpoint.path;
      if (this.authState.database) {
        path = path.replace('{database}', this.authState.database);
      }

      const baseUrl = this.request.url.split('/api/v2')[0];
      this.request.url = baseUrl + path;

      if (this.needsBody) {
        const exampleKey = `${endpoint.method} ${endpoint.path}`;
        const example = this.bodyExamples[exampleKey];
        this.request.body = example ? JSON.stringify(example, null, 2) : '';
      } else {
        this.request.body = '';
      }

      this.response.data = null;
    },

    async sendRequest() {
      this.isLoading = true;

      const options = {
        method: this.request.method,
        headers: { 'Content-Type': 'application/vnd.api+json' }
      };

      if (this.authState.session) {
        options.headers['Authorization'] = `Bearer ${this.authState.session}`;
      }

      if (this.needsBody && this.request.body) {
        try {
          JSON.parse(this.request.body);
          options.body = this.request.body;
        } catch (e) {
          this.$toast.add({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Невалидный JSON в теле запроса',
            life: 3000
          });
          this.isLoading = false;
          return;
        }
      }

      const startTime = performance.now();

      try {
        const response = await fetch(this.request.url, options);
        const duration = Math.round(performance.now() - startTime);

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        this.response = {
          data,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          duration
        };

        // Add to history
        this.addToHistory({
          method: this.request.method,
          url: this.request.url,
          body: this.request.body,
          timestamp: Date.now()
        });

        // Auto-expand request section if collapsed
        if (this.collapsedSections.request) {
          this.collapsedSections.request = false;
        }
      } catch (error) {
        this.response = {
          data: `Error: ${error.message}`,
          status: 0,
          statusText: 'Error',
          ok: false,
          duration: 0
        };
      } finally {
        this.isLoading = false;
      }
    },

    formatJSON(data) {
      if (typeof data === 'string') return data;
      return JSON.stringify(data, null, 2);
    },

    toggleSection(section) {
      this.collapsedSections[section] = !this.collapsedSections[section];
    },

    toggleTheme() {
      this.isDarkTheme = !this.isDarkTheme;
      localStorage.setItem('api-sandbox-theme', this.isDarkTheme ? 'dark' : 'light');
    },

    toggleExpandResponse() {
      this.isResponseExpanded = !this.isResponseExpanded;
    },

    copyResponse() {
      const text = this.formatJSON(this.response.data);
      navigator.clipboard.writeText(text).then(() => {
        this.$toast.add({
          severity: 'success',
          summary: 'Скопировано',
          detail: 'JSON скопирован в буфер обмена',
          life: 2000
        });
      });
    },

    downloadResponse() {
      const text = this.formatJSON(this.response.data);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `response-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.$toast.add({
        severity: 'success',
        summary: 'Скачано',
        detail: 'JSON сохранен в файл',
        life: 2000
      });
    },

    highlightSearchResults() {
      // Highlighting is handled by the tree view component
      if (this.viewMode === 'raw' && this.$refs.jsonPre) {
        // Simple text-based highlighting for raw mode
        this.$nextTick(() => {
          // This would require a more sophisticated implementation
          // For now, the tree view handles search highlighting
        });
      }
    },

    addToHistory(item) {
      this.requestHistory.unshift(item);
      if (this.requestHistory.length > this.maxHistoryItems) {
        this.requestHistory = this.requestHistory.slice(0, this.maxHistoryItems);
      }
      localStorage.setItem('api-sandbox-history', JSON.stringify(this.requestHistory));
    },

    loadFromHistory(item) {
      this.request.method = item.method;
      this.request.url = item.url;
      this.request.body = item.body || '';

      this.$toast.add({
        severity: 'info',
        summary: 'Загружено',
        detail: 'Запрос загружен из истории',
        life: 2000
      });
    },

    clearHistory() {
      this.requestHistory = [];
      localStorage.removeItem('api-sandbox-history');

      this.$toast.add({
        severity: 'success',
        summary: 'Очищено',
        detail: 'История запросов очищена',
        life: 2000
      });
    },

    truncateUrl(url) {
      if (url.length > 40) {
        return url.substring(0, 37) + '...';
      }
      return url;
    },

    formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    },

    handleKeyboardShortcuts(e) {
      // Ctrl + Enter: Send request
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!this.isLoading) {
          this.sendRequest();
        }
      }

      // Ctrl + F: Search in JSON
      if (e.ctrlKey && e.key === 'f' && this.response.data) {
        e.preventDefault();
        this.searchInJson = true;
        this.$nextTick(() => {
          this.$refs.searchInput?.focus();
        });
      }

      // Ctrl + C: Copy response
      if (e.ctrlKey && e.key === 'c' && this.response.data && !window.getSelection().toString()) {
        // Only if nothing is selected
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.copyResponse();
        }
      }

      // Ctrl + E: Expand/collapse response
      if (e.ctrlKey && e.key === 'e' && this.response.data) {
        e.preventDefault();
        this.toggleExpandResponse();
      }

      // ?: Show keyboard shortcuts
      if (e.key === '?' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          e.preventDefault();
          this.showKeyboardShortcuts = true;
        }
      }

      // Esc: Close modals
      if (e.key === 'Escape') {
        this.showKeyboardShortcuts = false;
        this.searchInJson = false;
        if (this.isResponseExpanded) {
          this.isResponseExpanded = false;
        }
      }
    },

    handleResponseClick(e) {
      // Allow text selection in response
    }
  }
};
</script>

<style scoped>
.api-sandbox {
  min-height: calc(100vh - 80px);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  transition: background 0.3s;
}

.api-sandbox.dark-theme {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.sandbox-header {
  background: white;
  padding: 20px 30px;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.dark-theme .sandbox-header {
  background: #1e1e1e;
  color: #e0e0e0;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sandbox-header h1 {
  margin: 0 0 5px;
  font-size: 2em;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.dark-theme .sandbox-header h1 {
  background: linear-gradient(135deg, #667eea 0%, #a78bfa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.sandbox-header p {
  margin: 0;
  color: #6c757d;
  font-size: 0.95em;
}

.dark-theme .sandbox-header p {
  color: #9ca3af;
}

.header-controls {
  display: flex;
  gap: 10px;
}

.theme-toggle,
.shortcuts-btn {
  padding: 8px 16px;
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  font-size: 1.2em;
  cursor: pointer;
  transition: all 0.2s;
}

.dark-theme .theme-toggle,
.dark-theme .shortcuts-btn {
  background: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.theme-toggle:hover,
.shortcuts-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.sandbox-content {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 0;
  background: white;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  min-height: 700px;
}

.dark-theme .sandbox-content {
  background: #1e1e1e;
}

.left-panel {
  background: #f8f9fa;
  padding: 20px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
  border-right: 2px solid #dee2e6;
  border-radius: 0 0 0 12px;
}

.dark-theme .left-panel {
  background: #2d2d2d;
  border-right-color: #404040;
}

.right-panel {
  padding: 20px 30px;
  background: white;
  border-radius: 0 0 12px 0;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.dark-theme .right-panel {
  background: #1e1e1e;
}

/* Collapsible Sections */
.collapsible-section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 10px;
  border-radius: 6px;
  transition: background 0.2s;
}

.section-header:hover {
  background: rgba(102, 126, 234, 0.05);
}

.dark-theme .section-header:hover {
  background: rgba(102, 126, 234, 0.1);
}

.section-header h3,
.section-header h4 {
  margin: 0;
  font-size: 1.1em;
  color: #495057;
}

.dark-theme .section-header h3,
.dark-theme .section-header h4 {
  color: #e0e0e0;
}

.collapse-icon {
  color: #667eea;
  font-size: 0.8em;
  transition: transform 0.2s;
}

.section-content {
  padding: 10px 0;
}

/* Auth Section */
.auth-section {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.08) 0%, rgba(118, 75, 162, 0.08) 100%);
  border: 2px solid #667eea;
  border-radius: 8px;
  padding: 15px;
}

.dark-theme .auth-section {
  background: rgba(102, 126, 234, 0.1);
  border-color: #667eea;
}

.auth-hint {
  background: #e7f3ff;
  border-left: 3px solid #2196f3;
  padding: 8px 12px;
  margin-bottom: 15px;
  font-size: 0.85em;
  color: #0d47a1;
  border-radius: 4px;
}

.dark-theme .auth-hint {
  background: rgba(33, 150, 243, 0.15);
  color: #64b5f6;
}

.auth-hint code {
  background: rgba(33, 150, 243, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-weight: 600;
}

.auth-status {
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 15px;
  font-size: 0.9em;
  font-weight: 500;
}

.auth-status.connected {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.dark-theme .auth-status.connected {
  background: rgba(40, 167, 69, 0.2);
  color: #68d391;
  border-color: #68d391;
}

.auth-status.disconnected {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.dark-theme .auth-status.disconnected {
  background: rgba(220, 53, 69, 0.2);
  color: #fc8181;
  border-color: #fc8181;
}

.auth-input-group {
  margin-bottom: 12px;
}

.auth-input-group label {
  display: block;
  font-size: 0.85em;
  font-weight: 600;
  color: #495057;
  margin-bottom: 5px;
}

.dark-theme .auth-input-group label {
  color: #e0e0e0;
}

.auth-input-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9em;
  background: white;
  color: #212529;
}

.dark-theme .auth-input-group input {
  background: #3d3d3d;
  border-color: #555;
  color: #e0e0e0;
}

.auth-input-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.quick-db-buttons {
  display: flex;
  gap: 5px;
  margin-top: 5px;
}

.quick-db-buttons button {
  padding: 4px 10px;
  font-size: 0.75em;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.dark-theme .quick-db-buttons button {
  background: #3d3d3d;
  border-color: #555;
  color: #e0e0e0;
}

.quick-db-buttons button:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.btn-auth {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 10px;
}

.btn-auth:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
}

.btn-auth:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.token-display-wrapper {
  margin-top: 15px;
}

.token-label {
  font-size: 0.85em;
  font-weight: 600;
  color: #495057;
  margin-bottom: 5px;
}

.dark-theme .token-label {
  color: #e0e0e0;
}

.token-display {
  background: #282c34;
  color: #98c379;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.75em;
  word-break: break-all;
  max-height: 80px;
  overflow-y: auto;
}

/* Endpoints */
.endpoint-group {
  margin-bottom: 25px;
}

.endpoint-group h3 {
  color: #495057;
  margin: 0 0 10px;
  font-size: 1em;
  padding-bottom: 8px;
  border-bottom: 2px solid #dee2e6;
}

.dark-theme .endpoint-group h3 {
  color: #e0e0e0;
  border-bottom-color: #404040;
}

.endpoint {
  padding: 10px 12px;
  margin: 8px 0;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s;
  background: white;
  border-left: 3px solid transparent;
}

.dark-theme .endpoint {
  background: #3d3d3d;
}

.endpoint:hover {
  background: #e9ecef;
  border-left-color: #667eea;
  transform: translateX(5px);
}

.dark-theme .endpoint:hover {
  background: #4d4d4d;
}

.endpoint.active {
  background: rgba(102, 126, 234, 0.08);
  border-left-color: #667eea;
}

.dark-theme .endpoint.active {
  background: rgba(102, 126, 234, 0.2);
}

.method {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.75em;
  margin-right: 8px;
}

.method.get { background: #28a745; color: white; }
.method.post { background: #007bff; color: white; }
.method.patch { background: #ffc107; color: #212529; }
.method.delete { background: #dc3545; color: white; }

.path {
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  color: #495057;
}

.dark-theme .path {
  color: #e0e0e0;
}

/* History Section */
.history-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
}

.dark-theme .history-section {
  background: #2d2d2d;
}

.history-empty {
  text-align: center;
  padding: 20px;
  color: #6c757d;
  font-size: 0.9em;
}

.dark-theme .history-empty {
  color: #9ca3af;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  padding: 8px 10px;
  margin: 5px 0;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
}

.dark-theme .history-item {
  background: #3d3d3d;
}

.history-item:hover {
  background: #e9ecef;
  transform: translateX(3px);
}

.dark-theme .history-item:hover {
  background: #4d4d4d;
}

.history-url {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-theme .history-url {
  color: #e0e0e0;
}

.history-time {
  color: #6c757d;
  font-size: 0.75em;
}

.dark-theme .history-time {
  color: #9ca3af;
}

.btn-clear-history {
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85em;
}

.dark-theme .btn-clear-history {
  background: #3d3d3d;
  border-color: #555;
  color: #e0e0e0;
}

.btn-clear-history:hover {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
}

/* Request Section */
.request-section {
  margin-bottom: 30px;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: #495057;
}

.dark-theme .input-group label {
  color: #e0e0e0;
}

.input-group input,
.input-group textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  font-size: 1em;
  font-family: 'Courier New', monospace;
  background: white;
  color: #212529;
}

.dark-theme .input-group input,
.dark-theme .input-group textarea {
  background: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.input-group input:focus,
.input-group textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input-group textarea {
  resize: vertical;
}

.btn-primary {
  padding: 14px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

/* Response Section */
.response-section {
  margin-top: 30px;
}

.response-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.response-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.response-info h4 {
  margin: 0;
  color: #495057;
}

.dark-theme .response-info h4 {
  color: #e0e0e0;
}

.response-status {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9em;
}

.response-status.success { background: #28a745; color: white; }
.response-status.error { background: #dc3545; color: white; }

.response-time {
  color: #6c757d;
  font-size: 0.9em;
}

.dark-theme .response-time {
  color: #9ca3af;
}

.response-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1.1em;
}

.dark-theme .action-btn {
  background: #2d2d2d;
  border-color: #404040;
}

.action-btn:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
  transform: translateY(-2px);
}

/* JSON Search */
.json-search {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  align-items: center;
}

.json-search input {
  flex: 1;
  padding: 10px;
  border: 2px solid #667eea;
  border-radius: 6px;
  font-size: 0.95em;
}

.dark-theme .json-search input {
  background: #2d2d2d;
  border-color: #667eea;
  color: #e0e0e0;
}

.close-search {
  padding: 8px 12px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

/* Response Container */
.response-container {
  background: #282c34;
  color: #abb2bf;
  padding: 20px;
  border-radius: 6px;
  overflow: auto;
  font-size: 0.9em;
  line-height: 1.5;
  max-height: 500px;
  margin-bottom: 15px;
  transition: all 0.3s;
}

.response-container.expanded {
  position: fixed;
  top: 20px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  max-height: calc(100vh - 40px);
  z-index: 1000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.response-container pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', Consolas, Monaco, monospace;
}

/* JSON Tree View */
.json-tree {
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.tree-node {
  margin: 2px 0;
}

.tree-key-line,
.tree-value-line {
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.2s;
}

.tree-key-line:hover,
.tree-value-line:hover {
  background: rgba(255, 255, 255, 0.05);
}

.tree-key-line.highlighted,
.tree-value-line.highlighted {
  background: rgba(255, 235, 59, 0.2);
}

.expand-icon {
  display: inline-block;
  width: 15px;
  color: #61afef;
  font-size: 0.8em;
}

.tree-key {
  color: #e06c75;
  font-weight: 600;
}

.tree-type {
  color: #98c379;
  font-size: 0.85em;
  margin-left: 5px;
}

.tree-value {
  margin-left: 5px;
}

.tree-value.type-string {
  color: #98c379;
}

.tree-value.type-number {
  color: #d19a66;
}

.tree-value.type-boolean {
  color: #61afef;
}

.tree-value.type-null {
  color: #c678dd;
}

/* View Mode Toggle */
.view-mode-toggle {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.view-mode-toggle button {
  flex: 1;
  padding: 10px;
  background: #f8f9fa;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
}

.dark-theme .view-mode-toggle button {
  background: #2d2d2d;
  border-color: #404040;
  color: #e0e0e0;
}

.view-mode-toggle button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.view-mode-toggle button:hover:not(.active) {
  background: #e9ecef;
  border-color: #667eea;
}

.dark-theme .view-mode-toggle button:hover:not(.active) {
  background: #3d3d3d;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dark-theme .modal-content {
  background: #1e1e1e;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 25px;
  border-bottom: 2px solid #dee2e6;
}

.dark-theme .modal-header {
  border-bottom-color: #404040;
}

.modal-header h3 {
  margin: 0;
  color: #495057;
}

.dark-theme .modal-header h3 {
  color: #e0e0e0;
}

.close-modal {
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: #6c757d;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.dark-theme .close-modal {
  color: #9ca3af;
}

.close-modal:hover {
  background: #f8f9fa;
  color: #dc3545;
}

.dark-theme .close-modal:hover {
  background: #2d2d2d;
}

.modal-body {
  padding: 25px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  margin: 8px 0;
  background: #f8f9fa;
  border-radius: 6px;
}

.dark-theme .shortcut-item {
  background: #2d2d2d;
}

kbd {
  display: inline-block;
  padding: 4px 8px;
  background: white;
  border: 2px solid #dee2e6;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  font-size: 0.9em;
  color: #495057;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.dark-theme kbd {
  background: #3d3d3d;
  border-color: #555;
  color: #e0e0e0;
}

.shortcut-item span {
  color: #495057;
}

.dark-theme .shortcut-item span {
  color: #e0e0e0;
}

/* Responsive */
@media (max-width: 768px) {
  .sandbox-content {
    grid-template-columns: 1fr;
  }

  .left-panel {
    max-height: 400px;
    border-right: none;
    border-bottom: 2px solid #dee2e6;
    border-radius: 0;
  }

  .dark-theme .left-panel {
    border-bottom-color: #404040;
  }

  .right-panel {
    border-radius: 0 0 12px 12px;
  }

  .response-container.expanded {
    top: 10px;
    left: 10px;
    right: 10px;
    bottom: 10px;
  }

  .header-content {
    flex-direction: column;
    gap: 15px;
  }

  .sandbox-header h1 {
    font-size: 1.5em;
  }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.dark-theme ::-webkit-scrollbar-track {
  background: #2d2d2d;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
