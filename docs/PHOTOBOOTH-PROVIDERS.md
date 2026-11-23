# Photo Booth images and delivery

The local runner deliberately selects `HOLODECK_IMAGE_PROVIDER=mock` and
`HOLODECK_EMAIL_PROVIDER=outbox`. The mock renderer paints scene frames and places
the captured photo inside them; it ignores generative prompts. It cannot produce
the cinematic images shown in the reference. Use a configured real provider to
review generated image quality; a successful mock strip does not validate it.

New strips randomly select four different adventures from eight prompts: starfighter chase,
alien canyon, asteroid mining, snow-dragon ride, jungle swing, desert hover-bike,
hover-racing, and spacewalk repair. Their order is randomized too (70 possible
four-scene combinations). Repeats across separate strips are possible; the picker
does not keep a global queue. The original catalog/picker remain behind a Workflow
patch for replay of existing sessions.

The scene catalog and default `inspired` style preserve facial likeness
while inventing a new pose, costume, camera angle, and a detailed landscape.
Prompts now emphasize foreground/midground/background scenery, dynamic adventure
key art, and a recognizable character within the world. The former podium scene
is now a hover-race. Scene IDs remain available, and older Workflow histories keep
their original scene choices. Policy-refusal handling remains in place.

## Hosted configuration

The single Fieldkit YAML already gives `photobooth-web` the shared `openai` secret
and the demo-owned `email` secret. It selects `openai` images and `sendgrid` email.
The worker runs in that same component. Nothing belongs in a browser configuration
or on each Mac Mini.

The requested sender is `hello@replayconf.com`; its SendGrid verification still needs to be confirmed.

The `email` secret needs these properties:

- `SENDGRID_API_KEY`: a SendGrid key restricted to **Mail Send**.
- `HOLODECK_EMAIL_FROM`: an already verified sender address.

Create the key in SendGrid Settings → API Keys. Store the key in 1Password. Verify
the sender/domain in SendGrid before configuring delivery. Do not paste the key
into chat, Git, YAML, shell arguments, or a station control panel.

From an interactive terminal with the correct AWS CLI profile:

```sh
python3 scripts/setup/configure-photobooth-email.py \
  --profile YOUR_BOOTH_PROFILE \
  --sender hello@replayconf.com \
  --region us-west-1 \
  --secret-id fieldkit/reinvent-2026/email
```

The script prompts for the key without echoing it, preserves any other secret
properties, and sends the update to AWS CLI over stdin. It updates the existing
secret without creating infrastructure or sending email. Check that the Photo
Booth worker has picked up the new secret version before testing delivery.

Missing/placeholder SendGrid credentials now fail the email Activity rather than
silently producing an outbox file. Temporal can retry delivery after configuration
is repaired. The outgoing email includes the static JPEG strip as an attachment,
with Replay’s charcoal, white, and lime email layout. The subject is
“Thanks for visiting Temporal's Photo Booth”. The Replay link uses
`utm_source=reinvent`, `utm_medium=email`, and `utm_campaign=photobooth_2026`.
Attendee images are attached rather than loaded remotely when the email opens.
SendGrid accepting a message
is not proof it reached the recipient; confirm receipt with a consenting test user
and inspect SendGrid delivery/bounce events if it does not arrive.

SendGrid `custom_args.idempotency_key` is a tracing value, not a server-side
deduplication guarantee. An ambiguous network failure after acceptance can lead
to a duplicate email when the Activity retries.

References: [API keys](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys),
[sender identity](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sender-identity),
[Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send).
