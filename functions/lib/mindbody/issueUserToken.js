"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueMindbodyUserToken = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
// Define the Mindbody API Key as a Google Cloud Secret Manager secret.
const mindbodyApiKey = (0, params_1.defineSecret)("MINDBODY_API_KEY");
/**
 * Callable Firebase Cloud Function to issue a Mindbody User Token.
 *
 * This requests a User Token from the POST /public/v6/usertoken/issue endpoint
 * using the Sandbox credentials provided.
 */
exports.issueMindbodyUserToken = (0, https_1.onCall)({ secrets: [mindbodyApiKey], region: "us-central1" }, async (request) => {
    // You can validate user authentication here if needed.
    // if (!request.auth) {
    //   throw new HttpsError("unauthenticated", "User must be logged in.");
    // }
    // Sandbox Credentials provided
    const siteId = -99;
    const username = "mindbodysandboxsite@gmail.com";
    const password = "Apitest1234";
    const requestBody = {
        Username: username,
        Password: password
    };
    try {
        const response = await fetch("https://api.mindbodyonline.com/public/v6/usertoken/issue", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Api-Key": mindbodyApiKey.value(),
                "SiteId": String(siteId)
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error("Mindbody API Error:", response.status, errorData);
            throw new https_1.HttpsError("internal", `Failed to issue user token. Status: ${response.status}. Details: ${errorData}`);
        }
        const data = await response.json();
        // Expected Response Format:
        // {
        //   "TokenType": "string",
        //   "AccessToken": "string",
        //   "User": { ... }
        // }
        return data;
    }
    catch (error) {
        console.error("Error connecting to Mindbody API:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "An unexpected error occurred while communicating with Mindbody API.");
    }
});
//# sourceMappingURL=issueUserToken.js.map