<?php
class OAuthHandler {
    private $providers = [];

    public function __construct(array $config) {
        foreach ($config as $provider => $settings) {
            $this->providers[$provider] = new OAuthProvider($settings);
        }
    }

    public function handleAuthorization() {
        if (!isset($_GET['provider']) || empty($_GET['provider'])) {
            die('Нет выбранного провайдера.');
        }

        $providerName = $_GET['provider'];
        if (!array_key_exists($providerName, $this->providers)) {
            die('Провайдер не поддерживается.');
        }

        $provider = $this->providers[$providerName];
        if (isset($_GET['code'])) {
            return $provider->processCode($_GET['code']);
        } else {
            return $provider->startAuthentication();
        }
    }
}

class OAuthProvider {
    protected $clientId;
    protected $clientSecret;
    protected $redirectUri;
    protected $baseUrl;
    protected $tokenEndpoint;
    protected $authEndpoint;

    public function __construct($settings) {
        $this->clientId = $settings['client_id'];
        $this->clientSecret = $settings['client_secret'];
        $this->redirectUri = $settings['redirect_uri'];
        $this->baseUrl = isset($settings['base_url']) ? $settings['base_url'] : '';
        $this->tokenEndpoint = isset($settings['token_endpoint']) ? $settings['token_endpoint'] : '';
        $this->authEndpoint = isset($settings['auth_endpoint']) ? $settings['auth_endpoint'] : '';
    }

    public function startAuthentication() {
        $authUrl = $this->buildAuthUrl();
        header("Location: $authUrl");
        exit;
    }

    public function processCode($code) {
        $params = [
            'client_id' => $this->clientId,
            'client_secret' => $this->clientSecret,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirectUri
        ];

        $ch = curl_init($this->tokenEndpoint);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Отключаем проверку SSL (для тестирования)
        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        if (isset($data['access_token'])) {
            echo "Авторизация пройдена. Доступный токен: {$data['access_token']}<br>";
            return $data['access_token']; // Вы можете сохранить токен в сессии или БД
        } else {
            die('Ошибка авторизации.');
        }
    }

    protected function buildAuthUrl() {
        $params = [
            'client_id' => $this->clientId,
            'redirect_uri' => $this->redirectUri,
            'response_type' => 'code'
        ];
        return $this->authEndpoint . '?' . http_build_query($params);
    }
}

// Конфигурация провайдеров
$config = [
    'yandex' => [
        'client_id' => '9a7b699e9e0f465d85e4329053a71771',
        'client_secret' => 'CHANGEME_OAUTH_SECRET',
        'redirect_uri' => 'https://app.integram.io/auth.php',
        'base_url' => 'https://oauth.yandex.ru/',
        'token_endpoint' => 'https://oauth.yandex.ru/token',
        'auth_endpoint' => 'https://oauth.yandex.ru/authorize'
    ],
    'vk' => [
        'client_id' => 'YOUR_VK_CLIENT_ID',
        'client_secret' => 'YOUR_VK_SECRET',
        'redirect_uri' => 'http://example.com/auth.php',
        'base_url' => 'https://oauth.vk.com/',
        'token_endpoint' => 'https://oauth.vk.com/access_token',
        'auth_endpoint' => 'https://oauth.vk.com/authorize'
    ],
    'mailru' => [
        'client_id' => 'YOUR_MAILRU_CLIENT_ID',
        'client_secret' => 'YOUR_MAILRU_SECRET',
        'redirect_uri' => 'http://example.com/auth.php',
        'base_url' => 'https://connect.mail.ru/',
        'token_endpoint' => 'https://connect.mail.ru/oauth/token',
        'auth_endpoint' => 'https://connect.mail.ru/oauth/authorize'
    ]
];

// Создание обработчика
$handler = new OAuthHandler($config);

// Начало обработки авторизации
try {
    $handler->handleAuthorization();
} catch(Exception $ex) {
    die('Ошибка: ' . $ex->getMessage());
}