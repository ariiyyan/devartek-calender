# Devartek Calendar

A free, self-hosted scheduling app you can run without Calendly.

## Run locally

```bash
node server.js
```

Open:

```text
http://127.0.0.1:3000/
```

## What is included

- Calendar dashboard with monthly bookings
- Public booking page at `/?book=1#booking`
- User-chosen schedule title and duration
- Optional meeting templates for repeated booking types
- Single-day and multi-day bookings for trips or longer work
- Working days, working hours, and buffers
- Overlap protection with an optional warning-based override
- Single-day and multi-day blocked dates for time off
- Booking cancellation
- `.ics` export for calendar apps
- Per-booking reminder email and reminder timing in exported invites
- Local JSON storage in `data.json`

## Cost

The app has no paid dependency and no npm package requirement. It stores data in a local `data.json` file when run through `server.js`. To accept bookings from other people, run this server somewhere they can reach, such as your own computer with a tunnel, a small VPS, or a free hosting setup that supports Node.

For public hosting, set `HOST=0.0.0.0` so the server can receive outside traffic.

## Reminders

Reminder settings are saved with each booking and included in `.ics` exports. Calendar apps can use those reminders after the invite is imported. Sending automatic reminder emails directly from the app requires adding an SMTP email account or another mail server.
