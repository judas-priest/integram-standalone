/**
 * SSH SOCKS5 Tunnel Service
 *
 * Управляет SSH туннелем для SOCKS5 прокси.
 * Автоматически запускает и поддерживает туннель для парсеров и других сервисов.
 *
 * @example
 * import { SSHTunnelService } from './SSHTunnelService.js'
 *
 * const tunnel = new SSHTunnelService({
 *   host: 'YOUR_SERVER_IP',
 *   port: 22,
 *   username: 'root',
 *   password: 'CHANGEME_SSH_PASSWORD',
 *   localPort: 9050
 * })
 *
 * await tunnel.start()
 * console.log('Tunnel status:', await tunnel.getStatus())
 *
 * // Для остановки
 * await tunnel.stop()
 */

import { spawn, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class SSHTunnelService {
  /**
   * @param {Object} config - Конфигурация туннеля
   * @param {string} config.host - SSH хост
   * @param {number} config.port - SSH порт (по умолчанию 22)
   * @param {string} config.username - SSH пользователь
   * @param {string} config.password - SSH пароль
   * @param {number} config.localPort - Локальный порт для SOCKS5 (по умолчанию 9050)
   * @param {boolean} config.autoRestart - Автоматически перезапускать при падении (по умолчанию true)
   */
  constructor(config) {
    this.config = {
      port: 22,
      localPort: 9050,
      autoRestart: true,
      ...config
    }

    this.process = null
    this.isRunning = false
    this.startTime = null
    this.restartCount = 0
    this.maxRestarts = 5
    this.restartDelay = 5000 // 5 секунд
  }

  /**
   * Запустить SSH туннель
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.log('[SSHTunnel] Туннель уже запущен')
      return
    }

    try {
      // Проверяем, свободен ли порт
      const portInUse = await this._isPortInUse(this.config.localPort)
      if (portInUse) {
        console.log(`[SSHTunnel] Порт ${this.config.localPort} уже используется, пытаемся освободить...`)
        await this._killProcessOnPort(this.config.localPort)
        await this._sleep(1000)
      }

      console.log('[SSHTunnel] Запускаем SSH туннель...')
      console.log(`[SSHTunnel] ${this.config.username}@${this.config.host}:${this.config.port} -> localhost:${this.config.localPort}`)

      // Команда: sshpass -p 'password' ssh -D localPort -N -o StrictHostKeyChecking=no username@host
      const args = [
        '-p', this.config.password,
        'ssh',
        '-D', this.config.localPort.toString(),
        '-N', // Не выполнять команды
        '-o', 'StrictHostKeyChecking=no', // Не проверять ключи хоста
        '-o', 'ServerAliveInterval=60', // Keepalive каждые 60 секунд
        '-o', 'ServerAliveCountMax=3', // Максимум 3 пропущенных keepalive
        '-p', this.config.port.toString(),
        `${this.config.username}@${this.config.host}`
      ]

      this.process = spawn('sshpass', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.process.stdout.on('data', (data) => {
        console.log(`[SSHTunnel] stdout: ${data}`)
      })

      this.process.stderr.on('data', (data) => {
        const message = data.toString()
        // Игнорируем некоторые безобидные сообщения SSH
        if (!message.includes('Warning: Permanently added') &&
            !message.includes('debug')) {
          console.error(`[SSHTunnel] stderr: ${message}`)
        }
      })

      this.process.on('close', (code) => {
        console.log(`[SSHTunnel] Процесс завершился с кодом ${code}`)
        this.isRunning = false
        this.process = null

        // Автоматический перезапуск
        if (this.config.autoRestart && this.restartCount < this.maxRestarts) {
          this.restartCount++
          console.log(`[SSHTunnel] Перезапуск туннеля (попытка ${this.restartCount}/${this.maxRestarts})...`)
          setTimeout(() => this.start(), this.restartDelay)
        } else if (this.restartCount >= this.maxRestarts) {
          console.error('[SSHTunnel] Превышено максимальное количество перезапусков')
        }
      })

      this.process.on('error', (err) => {
        console.error('[SSHTunnel] Ошибка процесса:', err)
        this.isRunning = false
      })

      // Ждем несколько секунд для установки туннеля
      await this._sleep(3000)

      // Проверяем, что туннель работает
      const status = await this._checkTunnelConnection()
      if (status) {
        this.isRunning = true
        this.startTime = new Date()
        this.restartCount = 0 // Сбрасываем счетчик при успешном запуске
        console.log('[SSHTunnel] ✅ Туннель успешно запущен')
      } else {
        throw new Error('Туннель запущен, но соединение не установлено')
      }
    } catch (error) {
      console.error('[SSHTunnel] Ошибка запуска туннеля:', error)
      this.isRunning = false
      throw error
    }
  }

  /**
   * Остановить SSH туннель
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.process) {
      console.log('[SSHTunnel] Туннель не запущен')
      return
    }

    console.log('[SSHTunnel] Останавливаем туннель...')

    // Отключаем автоперезапуск
    this.config.autoRestart = false

    return new Promise((resolve) => {
      this.process.once('close', () => {
        this.isRunning = false
        this.process = null
        console.log('[SSHTunnel] ✅ Туннель остановлен')
        resolve()
      })

      this.process.kill('SIGTERM')

      // Принудительная остановка через 5 секунд
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
          resolve()
        }
      }, 5000)
    })
  }

  /**
   * Перезапустить туннель
   * @returns {Promise<void>}
   */
  async restart() {
    console.log('[SSHTunnel] Перезапуск туннеля...')
    await this.stop()
    await this._sleep(2000)
    await this.start()
  }

  /**
   * Получить статус туннеля
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const connectionOk = this.isRunning ? await this._checkTunnelConnection() : false

    return {
      running: this.isRunning,
      connected: connectionOk,
      host: this.config.host,
      localPort: this.config.localPort,
      uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      restartCount: this.restartCount,
      pid: this.process ? this.process.pid : null
    }
  }

  /**
   * Получить URL прокси для использования
   * @returns {string}
   */
  getProxyUrl() {
    return `socks5://127.0.0.1:${this.config.localPort}`
  }

  /**
   * Проверить, используется ли порт
   * @private
   */
  async _isPortInUse(port) {
    try {
      const { stdout } = await execAsync(`lsof -i :${port} -t`)
      return stdout.trim().length > 0
    } catch (error) {
      // lsof возвращает код 1 если порт не используется
      return false
    }
  }

  /**
   * Убить процесс на порту
   * @private
   */
  async _killProcessOnPort(port) {
    try {
      const { stdout } = await execAsync(`lsof -i :${port} -t`)
      const pids = stdout.trim().split('\n').filter(p => p)

      for (const pid of pids) {
        console.log(`[SSHTunnel] Останавливаем процесс ${pid} на порту ${port}`)
        await execAsync(`kill -9 ${pid}`)
      }
    } catch (error) {
      // Игнорируем ошибки, если процесс не найден
    }
  }

  /**
   * Проверить соединение через туннель
   * @private
   */
  async _checkTunnelConnection() {
    try {
      // Проверяем, что порт слушается
      const { stdout } = await execAsync(`netstat -tlnp 2>/dev/null | grep :${this.config.localPort} || ss -tlnp 2>/dev/null | grep :${this.config.localPort}`)
      return stdout.includes(this.config.localPort.toString())
    } catch (error) {
      return false
    }
  }

  /**
   * Вспомогательная функция задержки
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton instance для использования по умолчанию
let defaultTunnelInstance = null

/**
 * Получить инстанс туннеля по умолчанию
 * @returns {SSHTunnelService}
 */
export function getDefaultTunnel() {
  if (!defaultTunnelInstance) {
    defaultTunnelInstance = new SSHTunnelService({
      host: process.env.SOCKS_TUNNEL_HOST || 'YOUR_SERVER_IP',
      port: parseInt(process.env.SOCKS_TUNNEL_PORT || '22'),
      username: process.env.SOCKS_TUNNEL_USER || 'root',
      password: process.env.SOCKS_TUNNEL_PASSWORD || 'CHANGEME_SSH_PASSWORD',
      localPort: parseInt(process.env.SOCKS_TUNNEL_LOCAL_PORT || '9050')
    })
  }
  return defaultTunnelInstance
}

/**
 * Быстрый запуск туннеля с дефолтными настройками
 * @returns {Promise<SSHTunnelService>}
 */
export async function startDefaultTunnel() {
  const tunnel = getDefaultTunnel()
  await tunnel.start()
  return tunnel
}
