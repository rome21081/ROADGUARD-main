# Live Map road guidance

## Use the map

1. Select **A** and **B** using place search, coordinates, map selection, or the current-location option. Selecting both points automatically requests a recommended driving route and road instructions.
2. The floating card shows the current/preview instruction, road name where supplied, trip distance, and estimated time. Expand **Steps & voice commands** to review previous/next instructions.
3. Choose **Start guidance** to enable GPS progression and map following. Manual panning pauses map following. Reviewing steps pauses the displayed live step; **Resume guidance** returns to GPS instructions. Poor GPS pauses progression and keeps the last road route visible.
4. Choose **Safer route** to reassess the journey. During live guidance, routing starts from the current precise GPS location; a manual preview keeps its chosen A.

## Safer-route comparison

The initial route is the fastest returned road route. Safer-route selection is separate: it prioritizes fewer intersecting high/critical accident-prone areas, lower tagged-area burden, lower individual crash exposure, then travel time. Caution/moderate history still contributes to exposure but is not relabeled accident-prone.

If returned alternatives still cross tagged areas, the app requests up to two perpendicular waypoint detours around the first blocking area. These are road routes returned by OSRM, not straight lines drawn through arbitrary terrain. Complete returned geometries are rescored. An existing better route is retained as a candidate when endpoints have not changed.

Avoidance may be unavailable, especially if A or B is inside a tagged area. The floating card explicitly reports when no lower-exposure route or complete avoidance was found. It does not claim guaranteed safety. Route requests need the network and the existing OSRM service. Posted signs, closures, and actual conditions take precedence over this prototype's stored-data guidance.

Road steps use the maneuver types, modifiers, names, geometry, and legs returned by [OSRM's route service](https://project-osrm.org/docs/v5.24.0/api/). Intermediate waypoint arrivals are not announced as the final destination. No traffic feed, lane-level positioning, or background navigation is provided.

## Voice

- **Voice off/on** controls spoken directions. Spoken guidance defaults to on when the browser supports speech synthesis. Users can mute it at any time. Directions are spoken during live guidance, and confirmed accident-prone entry warnings are spoken automatically. Microphone commands still start only when the user taps Mic.
- **Mic** listens for one command after a user tap and browser permission. Supported commands include **safer route**, **reroute**, **repeat**, **next instruction**, **previous instruction**, **fit route**, **start guidance**, **resume guidance**, **stop guidance**, **mute**, and **unmute**.
- Speech recognition is feature-detected and has a text/button fallback. Browsers differ in support, and some send microphone audio to a remote recognition service; see [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). Spoken output uses [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak).
- Listening is not continuous. Page exit/route clear cancels listening and speech. Location tracking requires browser permission and runs while the page remains open.

## Inside-area warning

A red, screen-reader-announced popup card states **YOU ARE INSIDE AN ACCIDENT-PRONE AREA** when the GPS uncertainty circle is fully inside a high/critical tagged area. Entry checks examine all tagged areas, so an overlapping caution/moderate area cannot mask the warning.

Near an uncertain boundary, wording changes to a nearby-area warning rather than falsely confirming entry. Each popup automatically hides after three seconds. Entry state remains tracked until leaving the boundary plus GPS uncertainty and a 50 m exit buffer, so the card does not reappear on every GPS update. Location loss dismisses any visible card. The route can still be previewed if GPS fails.

When voice is enabled, a confirmed entry is spoken once per area visit. Navigation speech is held briefly so it cannot immediately interrupt that warning. Repeated GPS fixes do not repeatedly rewrite the same assertive message. The entry card offers **Safer route**, or **Plan a route** if no journey exists.

## Verification

Run `npm.cmd test --prefix testscraper`. Mocked tests cover automatic A/B routing, actual maneuver parsing, intermediate waypoint handling, safer-route priority, bounded detours, unavailable avoidance, live step updates, default-on speech, microphone commands, timed entry and distance cards, overlapping risk areas, inaccurate/denied GPS, stale responses, and small-map bounds padding.

Real browser rendering, driving/GPS accuracy, microphone permission, speech-provider availability, and live OSRM responses still need field verification. The bundled accident file includes five explicitly marked synthetic demo records at 16.71438, 121.68191, forming one high-risk test area. They are labeled as demonstration data, not real crashes.


Place names and place pins:
- A/B accept place names with explicit search and locally filtered recent suggestions. A defaults to My current location. Selecting a global search result immediately sets B and requests GPS for A; users can still enter a custom starting place.
- Map-picked locations keep their exact coordinates for routing while Nominatim reverse lookup supplies a nearby place name. A failed lookup leaves the human-readable Pinned location label; live GPS uses My current location. Stale responses cannot overwrite edited, swapped, or cleared endpoints.
- OpenStreetMap Nominatim forward and reverse requests share a sequential queue, at least 1.1 seconds between requests, bounded tab-local cache, cancellation, and request timeouts. No network autocomplete or continuous GPS reverse lookups. Public service policy: https://operations.osmfoundation.org/policies/nominatim/
- Name lookup returns the nearest mapped address, so reverse labels say Near. Name lookup never snaps the user's chosen point to the nearest feature.


The route preview uses a compact dark turn card over the map and a separate trip dock in the bottom sheet with estimated time and distance, Start guidance, Safer route, and voice controls. Minimize keeps trip controls visible while collapsing route editing. Directions and microphone commands expand on demand. Existing voice, GPS, route comparison, and accident-prone warnings remain in place.


When the recommended route intersects a tagged accident-prone area, road alternatives are checked automatically. If OSRM alternatives still cross tagged areas, up to two road-based waypoint detours are tried, stopping when a candidate avoids every tagged area. A genuinely lower-exposure alternative is shown as a green dashed line without switching the selected route or guide. Both routes are included in the overview. Route lines and comparison cards are read-only. The Safer route action activates the prepared option without another request when the start/end are still within 20 m; movement during live guidance triggers a fresh search. If every candidate has equal exposure, no green safer preview is advertised. Refreshing area data rechecks the preview while retaining the selected route.


The reference-inspired map layout opens on mobile with a compact search sheet and Directions / Road events shortcuts. The A/B editor expands on demand. Search results stay inside the sheet; selected routes replace the search field with the trip dock. Functional map controls are grouped on the right. The interface keeps the street map and routing integrations, without adding placeholder weather, satellite, 3D, or transport modes. Route fitting reserves space for the floating desktop sheet, and sheet sizing adapts to the visual viewport and safe areas.


Default A-to-B flow: A displays My current location without inventing coordinates or requesting GPS on page load. Choosing a destination from search or the Pin location control below Fit view sets B and requests a location fix for A. Selecting a pin uses the exact tapped point, while name lookup updates only its label. Routes start automatically after both points are available. Missing or denied GPS keeps B selected and offers manual A. Clearing a route restores the My current location default. A manually selected starting point remains a supported override. The planner Pick on map action can still edit whichever endpoint has focus; the dedicated Pin location control always targets B.


Approach warnings show a three-second card at 200 m, 150 m, 100 m, 50 m, and 20 m from the nearest high/critical area boundary, followed by the confirmed entry card. Distances are approximate straight-line boundary distances, not driving distances. Approach checks require GPS accuracy of 50 m or better and account for uncertainty before claiming a threshold. Only the most urgent crossed threshold is shown when a GPS update skips several. Each threshold is remembered per area; movement beyond 200 m plus uncertainty and the exit buffer resets the approach sequence. A new threshold replaces the current card and starts a fresh three-second timer. Entry warnings take precedence; caution/moderate areas do not trigger these cards. Voice warnings follow the existing mute setting. Warning timers are cancelled when tracking stops or the page is left. Proximity-based background route checks only refresh the dashed preview; the active guide still changes through the explicit Safer route action.
