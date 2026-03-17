const jwt = require("jsonwebtoken");

function verifyJwtFromHeader(req, jwtSecret, issuer, audience) {
  const hdr = req.headers.authorization || "";
  const m = /^Bearer (.+)$/.exec(hdr);
  if (!m) return null;
  try {
    return jwt.verify(m[1], jwtSecret, { issuer, audience });
  } catch (_e) {
    return null;
  }
}

module.exports = { verifyJwtFromHeader };

