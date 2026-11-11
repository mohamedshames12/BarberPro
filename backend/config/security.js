require('dotenv').config({
  path: require('path').join(__dirname, '../../.env')
});

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
  throw new Error('JWT_SECRET is missing or too short');
}

const security = {
  bcrypt,
  jwt,
  jwtSecret: process.env.JWT_SECRET,
  tokenExpiresIn: '1h'
};

module.exports = security;
