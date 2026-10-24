# Dell Precision 7560 · Tùng Lâm Automation Remote Power

A static HTTPS dashboard for remotely waking and managing a Dell Precision 7560 using ESP32, EMQX Cloud and a Windows background agent.

## Capabilities (Control Deck v4.1)

- Wake Dell from S5 via ESP32 Wake-on-LAN; an ESP32 `wol_sent` acknowledgment confirms transmission **but does not prove the PC has powered on**.
- Windows Agent: confirmed safe Shutdown (45-second cancellation), scheduled Shutdown (2 minutes to 24 hours), cancellation and startup persistence.
- Windows Agent System Monitor (read-only): CPU usage, RAM consumption, battery percentage, AC/charging state, Ethernet link and uptime.
- Ping Windows Agent, device status, logs and mobile-first controls.
- Windows Agent emits `monitor_v1` telemetry as part of its retained MQTT presence payload every 20 seconds; a Windows power/Ethernet probe refreshes every 45 seconds. No extra MQTT subscription/topic or elevated browser permission is needed.
- Browser hides monitoring metrics if Agent is offline or the telemetry is stale (85-second timeout).

## Architecture

```
Browser (GitHub Pages, HTTPS)
  | WSS/TLS MQTT command + status
EMQX Cloud
  |-- ESP32 -> Magic Packet -> Dell Ethernet NIC
  `-- Windows Agent (SYSTEM / AtStartup)
         |-- Scheduler / Shutdown
         `-- Read-only local system telemetry
```

## Security

- The public site includes **no MQTT passwords, secrets, firmware or Windows credentials**. Broker hostname, MQTT username and topic prefix are editable in Settings.
- The dashboard never accepts arbitrary shell commands. Windows agent validates a small allowlist of action names and expiring request IDs.
- Live monitoring publishes only an allowlist of aggregate indicators (no usernames, IP/MAC addresses, hostnames, process lists or files).
- Device commands require explicit user confirmation. Do not save MQTT passwords on shared devices.
- Review broker ACLs: ideally use separate least-privilege MQTT identities for phone, ESP32 and Windows Agent.
- The Dell requires a working standby LAN power path and BIOS WOL configuration to wake from S5; on tested hardware AC power is required.

## Testing

Desktop/mobile layouts and UI command flows are tested with a mock MQTT client, without issuing real Shutdown/Restart commands. The Windows Agent's logic is separately unit-tested. **Live end-to-end telemetry and actual physical Wake/Shutdown require acceptance testing on the user's network and hardware.**

To use this deployment, connect on the published GitHub Pages URL and enter the MQTT password for the phone principal.

## Experimental Wi-Fi CSI room monitor (v4.2)

The existing ESP32 WROOM-32 can collect Wi-Fi Channel State Information (CSI) from the home router, which is physically ~4–5 m away in the same room.

- `Giám sát phòng` displays **CALIBRATING**, **MOVEMENT_CANDIDATE**, **QUIET_SIGNAL** or **UNKNOWN** with packet count, RSSI and a diagnostic variation score.
- ESP32 sends a short, non-retained JSON message every ~10 seconds over the existing `home/dell7560/ack` MQTT topic with `id=CCCCCCCCCCCCCCCC` and `result=csi_sample`.
- The dashboard rejects stale or malformed messages and expires measurements after 45 seconds.
- A local-only diagnostic endpoint `GET /api/csi` on the ESP32 provides aggregate CSI status; it does not expose raw CSI data, router identifiers or MAC addresses.
- The integrated firmware was deployed by supervised LAN OTA on 2026-10-24; Wi-Fi/MQTT resumed, local CSI metrics were observed, and the LAN Wake endpoint still acknowledged a request.
- **Important:** This is a movement *candidate* indicator. `QUIET_SIGNAL` does not prove an empty room. There are no validated occupancy accuracy claims. True sitting-still/breathing presence detection may require an mmWave sensor or more extensive CSI calibration.
