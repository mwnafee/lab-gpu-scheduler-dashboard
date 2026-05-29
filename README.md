# lab-gpu-scheduler-dashboard

WANG AXIS Lab server info with storage summaries, manual support requests, and GPU free-up request buttons.

The request buttons send notifications through EmailJS. Configure the public EmailJS browser settings and template IDs in `scheduler-config.js`.

`gpu_collector_for_scheduler.py` writes `gpu_status.json` with GPU and storage status for GitHub Pages.
