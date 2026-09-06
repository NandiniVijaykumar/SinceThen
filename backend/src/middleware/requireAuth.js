const googleClient = require("../auth/googleClient");

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ success: false, error: "Missing or malformed Authorization header" });
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        req.userId = payload.sub;
        req.user = {
            sub: payload.sub,
            email: payload.email,
            name: payload.name,
        };
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: "Invalid or expired token" });
    }
}

module.exports = requireAuth;
