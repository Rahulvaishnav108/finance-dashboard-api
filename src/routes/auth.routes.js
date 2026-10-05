'use strict';

const express        = require('express');
const AuthController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const validate       = require('../middleware/validate');
const authV          = require('../validators/auth.validators');

const router = express.Router();

/**
 * @route POST /api/v1/auth/register
 * @desc  Register (admin-facing; initial bootstrap uses seed script)
 * @access Public (locked to admin in production via middleware on user routes)
 */
router.post('/register', authV.register, validate, AuthController.register);

/** @route POST /api/v1/auth/login */
router.post('/login', authV.login, validate, AuthController.login);

/** @route POST /api/v1/auth/refresh */
router.post('/refresh', authV.refreshToken, validate, AuthController.refresh);

/** @route POST /api/v1/auth/logout */
router.post('/logout', authenticate, AuthController.logout);

/** @route GET /api/v1/auth/me */
router.get('/me', authenticate, AuthController.me);

/** @route PUT /api/v1/auth/change-password */
router.put('/change-password', authenticate, authV.changePassword, validate, AuthController.changePassword);

module.exports = router;
