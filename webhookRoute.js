const { handleRcsWebhook } = require('./rcsWebhookHandler');

// Replace your existing route with:
app.post("/api/jio/rcs/webhook", handleRcsWebhook);