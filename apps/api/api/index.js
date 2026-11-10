// Vercel serverless entry (§12): bootstraps Nest once per warm instance and reuses it.
const { getHandler } = require('../dist/serverless');

module.exports = async function handler(req, res) {
  const app = await getHandler();
  return app(req, res);
};
