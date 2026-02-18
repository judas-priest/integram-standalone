/**
 * @integram/auth-service - Compatibility Index
 *
 * Exports all compatibility modules.
 */

export {
  LegacyFormatTransformer,
  createLegacyFormatTransformer,
} from './LegacyFormatTransformer.js';

export {
  createLegacyRequestTransformer,
  createLegacyResponseHandler,
  createPHPRouteMapper,
  createLegacyXsrfMiddleware,
  createLegacyCompatibilityMiddleware,
} from './legacyMiddleware.js';
