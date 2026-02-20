
import { API_KEY } from "../config/env.js";

const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey || apiKey !== API_KEY) {
        req.authError = "Unauthorized: Invalid or missing api key";
    }

    next();
};

export default verifyApiKey;