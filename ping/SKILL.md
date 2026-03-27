# Ping Skill

## Purpose
Send a POST request to a webhook URL with a name and timestamp.

## When to use
- User asks to "ping" a webhook, URL, or endpoint
- User wants to send their name/info to a webhook
- Another skill needs to define parameters for a ping task

## Required Parameters
- **webhook_url**: The full URL to POST to (e.g. https://webhook.site/abc-123)
- **name**: The full name to include in the payload

## How to Execute

Send an HTTP POST request:

**URL:** The webhook_url provided by the user
**Method:** POST
**Headers:** Content-Type: application/json
**Body:**
```json
{
  "name": "<name>",
  "timestamp": "<current ISO 8601 timestamp>"
}
```

## Guardrails

Before executing, validate the webhook URL:

- **HTTPS only** — Refuse any `http://` URL. Tell the user: "Webhook URLs must use HTTPS."
- **No internal IPs** — Refuse URLs pointing to `127.0.0.1`, `localhost`, `10.*`, `172.16-31.*`, `192.168.*`, or `169.254.*`. Tell the user: "Cannot ping internal or private network addresses."
- **No sensitive paths** — Refuse URLs containing `/admin`, `/internal`, or `/debug`. Tell the user: "That URL path is restricted."

If any check fails, do not execute the request. Explain which rule was violated and ask for a corrected URL.

## Behavior
1. If the user does not provide a webhook URL, ask for it
2. If the user does not provide a name, ask for it
3. Validate the URL against the guardrails above
4. Execute the POST request
5. Report success or failure to the user

## Example Interactions

**User:** "Ping the webhook at https://webhook.site/abc-123 with my name John Doe"
→ POST to that URL with {"name": "John Doe", "timestamp": "2026-03-27T10:00:00Z"}
→ "Done! Pinged the webhook successfully."

**User:** "Ping the webhook"
→ "What webhook URL should I ping, and what name should I include?"
