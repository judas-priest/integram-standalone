/**
 * API v2 Integram Routes - REAL DATA
 *
 * Современные endpoints для работы с Integram в формате JSON:API
 * Использует реальный Integram API через IntegramApiService
 */

const express = require('express');
const router = express.Router();
const { createResource, createPaginationLinks } = require('../middleware/jsonapi.cjs');
const { IntegramApiService } = require('../../../services/IntegramApiService.cjs');

/**
 * Создать сервис для работы с Integram
 */
function createApiService(req) {
  const serverUrl = process.env.INTEGRAM_BASE_URL || 'https://YOUR_SERVER_IP';
  const database = req.params.database || 'my';

  return new IntegramApiService({
    serverUrl,
    database
  });
}

/**
 * POST /api/v2/integram/databases/:database/auth
 * Аутентификация пользователя
 */
router.post('/databases/:database/auth', async (req, res) => {
  try {
    const { database } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.jsonApi.error({
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation failed',
        detail: 'Fields "username" and "password" are required'
      }, 400);
    }

    const api = createApiService(req);
    const authResult = await api.authenticate(username, password);

    if (!authResult.success) {
      return res.jsonApi.error({
        status: 401,
        code: 'AUTHENTICATION_ERROR',
        title: 'Authentication failed',
        detail: 'Invalid username or password'
      }, 401);
    }

    const responseData = createResource('integram-auth', authResult.userId, {
      token: authResult.token,
      userId: authResult.userId,
      xsrf: authResult.xsrf,
      database: database,
      authenticated: true
    });

    res.jsonApi.success(responseData, {
      meta: {
        source: 'integram-api',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error authenticating user:', error);
    res.jsonApi.error({
      status: 401,
      code: 'AUTHENTICATION_ERROR',
      title: 'Authentication failed',
      detail: error.message
    }, 401);
  }
});

/**
 * GET /api/v2/integram/databases/:database/types
 * Получить список таблиц (dictionary)
 */
router.get('/databases/:database/types', async (req, res) => {
  try {
    const { database } = req.params;
    const api = createApiService(req);

    // Авторизуемся системным пользователем
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    // Получаем словарь типов
    const types = await api.getDictionary();

    // Преобразуем в JSON:API формат
    const data = types.map(type =>
      createResource('integram-type', type.id, {
        typeId: type.id,
        typeName: type.name,
        typeAlias: type.id.toString(),
        description: type.description || '',
        objectCount: type.count || 0,
        isSystem: false,
        isDeleted: false
      }, {
        links: {
          self: `/api/v2/integram/databases/${database}/types/${type.id}`,
          metadata: `/api/v2/integram/databases/${database}/types/${type.id}/metadata`,
          objects: `/api/v2/integram/databases/${database}/types/${type.id}/objects`
        }
      })
    );

    res.jsonApi.success(data, {
      meta: {
        total: types.length,
        database: database,
        source: 'integram-api',
        requestId: req.id
      },
      links: {
        self: `/api/v2/integram/databases/${database}/types`
      }
    });
  } catch (error) {
    console.error('Error fetching types:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch types',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/types/:typeId/metadata
 * Получить структуру таблицы
 */
router.get('/databases/:database/types/:typeId/metadata', async (req, res) => {
  try {
    const { database, typeId } = req.params;
    const api = createApiService(req);

    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    // Получаем метаданные типа
    const metadata = await api.getTypeMetadata(typeId);

    // Преобразуем структуру
    const typeInfo = {
      typeId: metadata.id || typeId,
      typeName: metadata.name || `Type ${typeId}`,
      typeAlias: (metadata.id || typeId).toString()
    };

    const requisites = [];
    if (metadata.requisites && Array.isArray(metadata.requisites)) {
      metadata.requisites.forEach(req => {
        requisites.push({
          requisiteId: req.id,
          requisiteName: req.name || `Requisite ${req.id}`,
          requisiteAlias: req.alias || req.name || `field_${req.id}`,
          dataType: req.type || 'string',
          typeId: req.typeId,
          isRequired: req.notNull || false,
          isUnique: req.unique || false,
          isMulti: req.multi || false
        });
      });
    }

    const responseData = createResource('integram-type-metadata', typeId, {
      typeInfo,
      requisites,
      rawMetadata: metadata
    }, {
      meta: {
        source: 'integram-api'
      }
    });

    res.jsonApi.success(responseData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch metadata',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/types/:typeId/objects
 * Получить список объектов
 */
router.get('/databases/:database/types/:typeId/objects', async (req, res) => {
  try {
    const { database, typeId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const api = createApiService(req);
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    // Получаем объекты
    const objects = await api.getObjects(typeId, { page, limit });

    // Преобразуем в JSON:API формат
    const data = objects.map(obj => {
      return createResource('integram-object', obj.id, {
        objectId: obj.id,
        typeId: parseInt(typeId),
        value: obj.value,
        requisites: obj.requisites || {},
        displayName: obj.value || `Object ${obj.id}`,
        isDeleted: false
      }, {
        links: {
          self: `/api/v2/integram/databases/${database}/objects/${obj.id}`
        }
      });
    });

    res.jsonApi.success(data, {
      meta: {
        pagination: {
          page,
          limit,
          total: objects.length,
          totalPages: Math.ceil(objects.length / limit)
        },
        source: 'integram-api',
        timestamp: new Date().toISOString()
      },
      links: createPaginationLinks(
        `/api/v2/integram/databases/${database}/types/${typeId}/objects`,
        { page, limit, total: objects.length }
      )
    });
  } catch (error) {
    console.error('Error fetching objects:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch objects',
      detail: error.message
    }, 500);
  }
});

/**
 * POST /api/v2/integram/databases/:database/types/:typeId/objects
 * Создать новый объект
 */
router.post('/databases/:database/types/:typeId/objects', async (req, res) => {
  try {
    const { database, typeId } = req.params;
    const { value, requisites } = req.body;

    if (!value) {
      return res.jsonApi.error({
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation failed',
        detail: 'Field "value" is required'
      }, 400);
    }

    const api = createApiService(req);
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    const result = await api.createObject(typeId, value, requisites || {});

    const responseData = createResource('integram-object', result.id, {
      objectId: result.id,
      typeId: parseInt(typeId),
      value,
      requisites: requisites || {},
      displayName: value,
      isDeleted: false
    }, {
      links: {
        self: `/api/v2/integram/databases/${database}/objects/${result.id}`
      }
    });

    res.jsonApi.success(responseData, {
      meta: {
        source: 'integram-api',
        created: true
      }
    });
  } catch (error) {
    console.error('Error creating object:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to create object',
      detail: error.message
    }, 500);
  }
});

/**
 * PATCH /api/v2/integram/databases/:database/objects/:objectId
 * Обновить объект
 */
router.patch('/databases/:database/objects/:objectId', async (req, res) => {
  try {
    const { database, objectId } = req.params;
    const { requisites } = req.body;

    if (!requisites || typeof requisites !== 'object') {
      return res.jsonApi.error({
        status: 400,
        code: 'VALIDATION_ERROR',
        title: 'Validation failed',
        detail: 'Field "requisites" is required and must be an object'
      }, 400);
    }

    const api = createApiService(req);
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    await api.updateObject(objectId, requisites);

    const responseData = createResource('integram-object', objectId, {
      objectId: parseInt(objectId),
      requisites,
      updated: true
    });

    res.jsonApi.success(responseData, {
      meta: {
        source: 'integram-api',
        updated: true
      }
    });
  } catch (error) {
    console.error('Error updating object:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to update object',
      detail: error.message
    }, 500);
  }
});

/**
 * DELETE /api/v2/integram/databases/:database/objects/:objectId
 * Удалить объект
 */
router.delete('/databases/:database/objects/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;

    const api = createApiService(req);
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    await api.deleteObject(objectId);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting object:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to delete object',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/reports/:reportName
 * Выполнить отчёт (запрос)
 */
router.get('/databases/:database/reports/:reportName', async (req, res) => {
  try {
    const { database, reportName } = req.params;

    const api = createApiService(req);
    await api.authenticate(
      process.env.INTEGRAM_SYSTEM_USERNAME || 'd',
      process.env.INTEGRAM_SYSTEM_PASSWORD || 'd'
    );

    // Вызываем report напрямую через старый API формат
    const reportData = await api.get(`report/${reportName}`, { JSON_KV: true });

    // Возвращаем в JSON:API формате
    res.jsonApi.success(reportData, {
      meta: {
        reportName,
        database,
        source: 'integram-api'
      }
    });
  } catch (error) {
    console.error('Error executing report:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to execute report',
      detail: error.message
    }, 500);
  }
});

/**
 * GET /api/v2/integram/databases/:database/user/current
 * Получить данные текущего пользователя
 */
router.get('/databases/:database/user/current', async (req, res) => {
  try {
    const { database } = req.params;
    const token = req.headers['x-authorization'];

    if (!token) {
      return res.jsonApi.error({
        status: 401,
        code: 'UNAUTHORIZED',
        title: 'Authentication required',
        detail: 'X-Authorization header is required'
      }, 401);
    }

    const api = createApiService(req);

    // Вызываем xsrf endpoint через старый API формат
    const userData = await api.get('xsrf', { JSON_KV: true });

    // Возвращаем в JSON:API формате
    const responseData = createResource('integram-user', userData.id || 'current', {
      userId: userData.id,
      username: userData.user,
      role: userData.role,
      xsrf: userData._xsrf,
      database: database
    });

    res.jsonApi.success(responseData, {
      meta: {
        database,
        source: 'integram-api',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.jsonApi.error({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      title: 'Failed to fetch current user',
      detail: error.message
    }, 500);
  }
});

module.exports = router;
